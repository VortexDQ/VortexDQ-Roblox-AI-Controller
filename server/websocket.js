const { EventEmitter } = require('events');

// HTTP-polling based manager for the Roblox plugin.
// The plugin cannot use WebSockets (Roblox HttpService limitation),
// so it polls GET /plugin/poll to receive commands and posts results
// to POST /plugin.  The browser UI still connects via ws:// for live updates.

class WebSocketManager extends EventEmitter {
  constructor(httpServer) {
    super();
    this.httpServer     = httpServer;
    this.wss            = null;          // browser WebSocket server (optional)
    this.connections    = new Map();     // browser ws connections
    this.lastKnownState = {};

    // HTTP-polling plugin state
    this._pluginConnected  = false;
    this._pluginLastSeen   = 0;
    this._pluginId         = null;
    this._outboundQueue    = [];         // commands waiting for the plugin to poll
    this._maxQueue         = 256;
    this._resultListeners  = new Map();  // commandId -> { resolve, reject, timer }

    // Heartbeat: if plugin hasn't polled in 10s, mark disconnected
    setInterval(() => {
      if (this._pluginConnected && Date.now() - this._pluginLastSeen > 10000) {
        this._pluginConnected = false;
        this._pluginId        = null;
        console.log('[WS] Plugin connection timed out');
        this.emit('disconnected', 'plugin');
      }
    }, 3000);
  }

  initialize() {
    // Optionally bring up a browser-facing WebSocket server
    try {
      const WebSocket = require('ws');
      this.wss = new WebSocket.Server({ server: this.httpServer, perMessageDeflate: false });

      this.wss.on('connection', (ws, req) => {
        const id = this.generateConnectionId();
        ws.id = id;
        ws.lastUpdate = new Date();
        ws.isAlive    = true;
        this.connections.set(id, ws);
        console.log(`[WS] Browser connected: ${id}`);

        ws.on('message', d => this._handleBrowserMessage(ws, d));
        ws.on('close',   () => { this.connections.delete(id); });
        ws.on('pong',    () => { ws.isAlive = true; });
      });

      const hb = setInterval(() => {
        this.wss.clients.forEach(ws => {
          if (!ws.isAlive) return ws.terminate();
          ws.isAlive = false;
          ws.ping();
        });
      }, 30000);
      this.wss.on('close', () => clearInterval(hb));
    } catch (_) {
      // ws package missing — browser UI won't work but plugin will
    }
  }

  // ── Plugin HTTP interface ──────────────────────────────────────────────

  // Called by Express route: GET /plugin/poll
  // Returns next queued command for the plugin, or empty object if nothing pending.
  pluginPoll(req, res) {
    this._pluginLastSeen  = Date.now();
    this._pluginConnected = true;

    // Assign a stable id on first poll
    if (!this._pluginId) {
      this._pluginId = this.generateConnectionId();
      console.log(`[WS] Plugin connected via HTTP polling: ${this._pluginId}`);
      this.emit('connected', this._pluginId);
    }

    const cmd = this._outboundQueue.shift();
    if (cmd) {
      res.json(cmd);
    } else {
      res.json({});   // nothing to do
    }
  }

  // Called by Express route: POST /plugin
  // Plugin posts results, state updates, etc. here.
  pluginReceive(req, res) {
    this._pluginLastSeen  = Date.now();
    this._pluginConnected = true;

    const message = req.body;
    if (!message || !message.type) {
      return res.json({ ok: false, error: 'missing type' });
    }

    try {
      this._handlePluginMessage(message);
    } catch (e) {
      console.error('[WS] pluginReceive error:', e.message);
    }

    res.json({ ok: true });
  }

  _handlePluginMessage(message) {
    switch (message.type) {
      case 'result': {
        const { id, success, result, error, state } = message;
        if (state) this.lastKnownState = { ...this.lastKnownState, ...state };

        // Resolve the pending promise for this command
        const listener = this._resultListeners.get(id);
        if (listener) {
          clearTimeout(listener.timer);
          this._resultListeners.delete(id);
          if (success) listener.resolve(result);
          else         listener.reject(new Error(error || 'Command failed'));
        }

        // Also emit for any legacy event listeners
        this.emit('result', { commandId: id, success, result, error });
        break;
      }
      case 'state': {
        const { state } = message;
        if (state) this.lastKnownState = { ...this.lastKnownState, ...state };
        this.emit('stateUpdate', { state: this.lastKnownState });
        break;
      }
      default:
        console.log('[WS] Unknown plugin message type:', message.type);
    }
  }

  // ── Command sending ────────────────────────────────────────────────────

  sendCommand(connectionId, command) {
    const msg = {
      type:      'command',
      id:        command.id || this.generateCommandId(),
      action:    command.action,
      data:      command.data || {},
      timestamp: Date.now(),
    };

    if (this._outboundQueue.length >= this._maxQueue) {
      console.warn('[WS] Outbound queue full — dropping oldest command');
      this._outboundQueue.shift();
    }

    this._outboundQueue.push(msg);
    return true;   // always succeeds (queued)
  }

  // Promise-based: resolves when the plugin returns a result for this command
  sendCommandAndWait(command, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const id  = command.id || this.generateCommandId();
      const msg = { ...command, id };

      const timer = setTimeout(() => {
        this._resultListeners.delete(id);
        this._outboundQueue  = this._outboundQueue.filter(c => c.id !== id);
        reject(new Error(`Timeout waiting for ${command.action} (${id})`));
      }, timeoutMs);

      this._resultListeners.set(id, { resolve, reject, timer });
      this.sendCommand(null, msg);
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  _handleBrowserMessage(ws, data) {
    try {
      const msg = JSON.parse(data.toString());
      ws.lastUpdate = new Date();
      // Forward browser requests to plugin if needed
      if (msg.type === 'command') {
        this.sendCommand(null, msg);
      }
    } catch (_) {}
  }

  broadcastToBrowser(message) {
    const json = JSON.stringify(message);
    this.connections.forEach(ws => {
      try { ws.send(json); } catch (_) {}
    });
  }

  getConnectionCount()  { return this._pluginConnected ? 1 : 0; }
  isPluginConnected()   { return this._pluginConnected; }
  getLastKnownState()   { return this.lastKnownState; }

  getAllConnections() {
    if (!this._pluginConnected) return [];
    return [{ id: this._pluginId, ready: true, lastUpdate: new Date(this._pluginLastSeen) }];
  }

  generateConnectionId() { return `conn_${Date.now()}_${Math.random().toString(36).slice(2,9)}`; }
  generateCommandId()    { return `cmd_${Date.now()}_${Math.random().toString(36).slice(2,9)}`; }
}

module.exports = WebSocketManager;
