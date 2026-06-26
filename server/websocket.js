const WebSocket = require('ws');
const { EventEmitter } = require('events');
const Protocol = require('./protocol');

class WebSocketManager extends EventEmitter {
  constructor(httpServer) {
    super();
    this.httpServer = httpServer;
    this.wss = null;
    this.connections = new Map();
    this.lastKnownState = {};
    this.messageQueue = [];
    this.maxQueueSize = 1000;
  }

  initialize() {
    this.wss = new WebSocket.Server({
      server: this.httpServer,
      perMessageDeflate: false,
      clientTracking: true
    });

    this.wss.on('connection', (ws, req) => {
      const connId = this.generateConnectionId();
      ws.id = connId;
      ws.readyState = 1; // Open
      ws.lastUpdate = new Date();
      ws.isAlive = true;

      this.connections.set(connId, ws);
      console.log(`[WS] Plugin connected: ${connId}`);

      ws.on('message', (data) => {
        this.handleMessage(ws, data);
      });

      ws.on('close', () => {
        this.connections.delete(connId);
        console.log(`[WS] Plugin disconnected: ${connId}`);
        this.emit('disconnected', connId);
      });

      ws.on('error', (error) => {
        console.error(`[WS] Connection error [${connId}]:`, error.message);
      });

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      this.emit('connected', connId);

      // Send welcome message
      this.sendToConnection(connId, {
        type: 'system',
        action: 'connected',
        id: connId,
        timestamp: new Date().toISOString()
      });
    });

    // Heartbeat
    const heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      clearInterval(heartbeatInterval);
    });
  }

  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());
      ws.lastUpdate = new Date();

      if (!message.type) {
        this.sendError(ws, 'Missing message type');
        return;
      }

      switch (message.type) {
        case 'result':
          this.handleCommandResult(ws, message);
          break;
        case 'state':
          this.handleStateUpdate(ws, message);
          break;
        case 'error':
          console.error(`[WS] Plugin error [${ws.id}]:`, message);
          break;
        default:
          this.sendError(ws, `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[WS] Message parse error:', error.message);
      this.sendError(ws, 'Invalid JSON');
    }
  }

  handleCommandResult(ws, message) {
    const { id, success, result, error, state } = message;

    if (state) {
      this.lastKnownState = { ...this.lastKnownState, ...state };
    }

    this.emit('result', {
      connectionId: ws.id,
      commandId: id,
      success,
      result,
      error
    });

    this.queueMessage({
      type: 'result',
      connectionId: ws.id,
      commandId: id,
      success,
      result,
      error,
      timestamp: new Date().toISOString()
    });
  }

  handleStateUpdate(ws, message) {
    const { state, workspace, selected } = message;

    this.lastKnownState = {
      ...this.lastKnownState,
      ...state,
      workspace,
      selected,
      lastUpdate: new Date().toISOString()
    };

    this.emit('stateUpdate', {
      connectionId: ws.id,
      state: this.lastKnownState
    });
  }

  sendCommand(connectionId, command) {
    if (!Protocol.validateCommand(command)) {
      throw new Error('Invalid command format');
    }

    const message = {
      type: 'command',
      id: command.id || this.generateCommandId(),
      action: command.action,
      data: command.data,
      timestamp: new Date().toISOString()
    };

    return this.sendToConnection(connectionId, message);
  }

  broadcastCommand(command) {
    if (!Protocol.validateCommand(command)) {
      throw new Error('Invalid command format');
    }

    const message = {
      type: 'command',
      id: command.id || this.generateCommandId(),
      action: command.action,
      data: command.data,
      timestamp: new Date().toISOString()
    };

    let sent = 0;
    this.connections.forEach((ws, connId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(message));
          sent++;
        } catch (error) {
          console.error(`[WS] Failed to send to ${connId}:`, error.message);
        }
      }
    });

    return sent;
  }

  sendToConnection(connectionId, message) {
    const ws = this.connections.get(connectionId);
    if (!ws) {
      console.error(`[WS] Connection not found: ${connectionId}`);
      return false;
    }

    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`[WS] Connection not open: ${connectionId}`);
      return false;
    }

    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error(`[WS] Send error [${connectionId}]:`, error.message);
      return false;
    }
  }

  sendError(ws, message) {
    try {
      ws.send(JSON.stringify({
        type: 'error',
        message: message,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error('[WS] Error send failed:', error.message);
    }
  }

  getConnectionCount() {
    return this.connections.size;
  }

  getAllConnections() {
    return Array.from(this.connections.values()).map(ws => ({
      id: ws.id,
      ready: ws.readyState === WebSocket.OPEN,
      lastUpdate: ws.lastUpdate,
      isAlive: ws.isAlive
    }));
  }

  getLastKnownState() {
    return this.lastKnownState;
  }

  queueMessage(message) {
    this.messageQueue.push(message);
    if (this.messageQueue.length > this.maxQueueSize) {
      this.messageQueue.shift();
    }
  }

  getMessageQueue() {
    return [...this.messageQueue];
  }

  generateConnectionId() {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateCommandId() {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  closeConnection(connectionId) {
    const ws = this.connections.get(connectionId);
    if (ws) {
      ws.close();
      this.connections.delete(connectionId);
    }
  }

  closeAll() {
    this.connections.forEach(ws => ws.close());
    this.connections.clear();
  }
}

module.exports = WebSocketManager;
