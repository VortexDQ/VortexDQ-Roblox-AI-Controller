const { EventEmitter } = require('events');

// HTTP-polling based manager for the Roblox plugin.
// The plugin cannot use WebSockets (Roblox HttpService limitation),
// so it polls GET /plugin/poll to receive commands and posts results
// to POST /plugin.  The browser UI still connects via ws:// for live updates.

class WebSocketManager extends EventEmitter {
  constructor(httpServer) {
    super();
    this.httpServer     = httpServer;
    this.wss            = null;
    this.connections    = new Map();
    this.lastKnownState = {};

    this._pluginConnected  = false;
    this._pluginLastSeen   = 0;
    this._pluginId         = null;
    this._outboundQueue    = [];
    this._maxQueue         = 256;
    this._resultListeners  = new Map();

    // Track place/game identity so we can detect switches
    this._currentPlaceId   = null;
    this._currentGameName  = null;

    // Heartbeat: if plugin hasn't polled in 10s, mark disconnected
    setInterval(() => {
      if (this._pluginConnected && Date.now() - this._pluginLastSeen > 10000) {
        this._pluginConnected = false;
        this._pluginId        = null;
        this._currentPlaceId  = null;
        this._currentGameName = null;
        console.log('[WS] Plugin connection timed out');
        this.emit('disconnected', 'plugin');
        this.broadcastToBrowser({ type: 'pluginDisconnected' });
      }
    }, 3000);
  }

  initialize() {
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

        // Send current state immediately on connect
        ws.send(JSON.stringify({
          type:    'initialState',
          plugin:  this._pluginConnected,
          placeId: this._currentPlaceId,
          game:    this._currentGameName,
          state:   this.lastKnownState,
        }));

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

  pluginPoll(req, res) {
    this._pluginLastSeen  = Date.now();
    const wasConnected    = this._pluginConnected;
    this._pluginConnected = true;

    if (!this._pluginId) {
      this._pluginId = this.generateConnectionId();
      console.log(`[WS] Plugin connected via HTTP polling: ${this._pluginId}`);
      this.emit('connected', this._pluginId);
      this.broadcastToBrowser({ type: 'pluginConnected', id: this._pluginId });
    }

    const BATCH_MAX = 50;
    const items = [];
    while (items.length < BATCH_MAX && this._outboundQueue.length > 0) {
      items.push(this._outboundQueue.shift());
    }

    if (items.length === 0) {
      res.json({});
    } else if (items.length === 1) {
      res.json(items[0]);
    } else {
      res.json({ type: 'batch', commands: items });
    }
  }

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
        if (state) this._mergeState(state);

        const listener = this._resultListeners.get(id);
        if (listener) {
          clearTimeout(listener.timer);
          this._resultListeners.delete(id);
          if (success) listener.resolve(result);
          else         listener.reject(new Error(error || 'Command failed'));
        }

        this.emit('result', { commandId: id, success, result, error });
        break;
      }
      case 'state': {
        const { state } = message;
        if (state) this._mergeState(state);
        this.emit('stateUpdate', { state: this.lastKnownState });
        break;
      }
      default:
        console.log('[WS] Unknown plugin message type:', message.type);
    }
  }

  _mergeState(state) {
    this.lastKnownState = { ...this.lastKnownState, ...state };

    // Detect game / place switches
    const newPlaceId   = state.PlaceId   || state.placeId   || null;
    const newGameName  = state.GameName  || state.gameName  || state.Name || null;

    if (newPlaceId && newPlaceId !== this._currentPlaceId) {
      const oldPlaceId   = this._currentPlaceId;
      this._currentPlaceId  = newPlaceId;
      this._currentGameName = newGameName;
      console.log(`[WS] Game switched: ${oldPlaceId} → ${newPlaceId} (${newGameName || 'unknown'})`);
      this.emit('gameSwitched', { oldPlaceId, newPlaceId, gameName: newGameName });
      this.broadcastToBrowser({
        type:       'gameSwitched',
        oldPlaceId,
        newPlaceId,
        gameName:   newGameName,
        state:      this.lastKnownState,
      });
    } else if (newGameName && newGameName !== this._currentGameName) {
      this._currentGameName = newGameName;
      this.broadcastToBrowser({
        type:     'gameNameUpdated',
        gameName: newGameName,
        state:    this.lastKnownState,
      });
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
    return true;
  }

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

  getConnectionCount()    { return this._pluginConnected ? 1 : 0; }
  isPluginConnected()     { return this._pluginConnected; }
  getPluginConnectionId() { return this._pluginConnected ? this._pluginId : null; }
  getLastKnownState()     { return this.lastKnownState; }
  getCurrentGame()        { return { placeId: this._currentPlaceId, gameName: this._currentGameName }; }

  getAllConnections() {
    if (!this._pluginConnected) return [];
    return [{
      id:         this._pluginId,
      connected:  true,
      ready:      true,
      lastUpdate: new Date(this._pluginLastSeen),
      placeId:    this._currentPlaceId,
      gameName:   this._currentGameName,
    }];
  }

  generateConnectionId() { return `conn_${Date.now()}_${Math.random().toString(36).slice(2,9)}`; }
  generateCommandId()    { return `cmd_${Date.now()}_${Math.random().toString(36).slice(2,9)}`; }
}

module.exports = WebSocketManager;
