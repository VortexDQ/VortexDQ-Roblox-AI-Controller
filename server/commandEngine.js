const Protocol = require('./protocol');
const { EventEmitter } = require('events');

// Commands that can safely run in parallel (pure reads or independent creates)
const PARALLEL_SAFE = new Set([
  'GetExplorerTree','GetGameInfo','GetPlaceInfo','GetLighting',
  'GetWorkspaceSettings','GetServiceProperties','GetAllScripts',
  'GetScriptSource','GetAllProperties','GetChildren','GetDescendants',
  'SearchInstances','GetPlayers','GetTeams','GetTags','GetTagged',
  'GetAttribute','GetAttributes','GetSelection','GetStudioTheme',
  'GetHistory','GetStats','Ping','GetProperty',
]);

class CommandEngine extends EventEmitter {
  constructor(wsManager) {
    super();
    this.wsManager     = wsManager;
    this.executingCommands = new Map();
    this.commandTimeout    = 8000;   // 8s hard cap (was 30s)
    this.maxRetries        = 2;
    this.retryDelay        = 400;
  }

  // Execute a single command and wait for its result
  executeCommand(command, connectionId = null) {
    try { Protocol.validateCommand(command); }
    catch (e) { throw new Error(`Invalid command: ${e.message}`); }

    const id   = command.id || this.wsManager.generateCommandId();
    const conn = connectionId || this.getActiveConnection();
    if (!conn) throw new Error('No active plugin connection');

    return this._sendAndWait(conn, { ...command, id });
  }

  // Execute a batch — runs reads in parallel, writes sequentially
  async executeCommandBatch(commands, connectionId = null) {
    try { Protocol.validateCommandBatch(commands); }
    catch (e) { throw new Error(`Invalid batch: ${e.message}`); }

    const conn = connectionId || this.getActiveConnection();
    if (!conn) throw new Error('No active plugin connection');

    // Partition into parallel-safe reads and sequential writes
    const reads  = [];
    const writes = [];
    commands.forEach(cmd => {
      if (PARALLEL_SAFE.has(cmd.action)) reads.push(cmd);
      else writes.push(cmd);
    });

    const results = [];

    // Fire all reads simultaneously
    if (reads.length > 0) {
      const readResults = await Promise.allSettled(
        reads.map(cmd => this._sendAndWait(conn, {
          ...cmd,
          id: cmd.id || this.wsManager.generateCommandId()
        }))
      );
      readResults.forEach((r, i) => {
        results.push({
          action:  reads[i].action,
          success: r.status === 'fulfilled',
          result:  r.status === 'fulfilled' ? r.value : null,
          error:   r.status === 'rejected'  ? r.reason?.message : null,
        });
      });
    }

    // Queue all writes at once — plugin receives them in one poll batch
    if (writes.length > 0) {
      const writeResults = await Promise.allSettled(
        writes.map(cmd => this._sendAndWait(conn, {
          ...cmd,
          id: cmd.id || this.wsManager.generateCommandId(),
        }))
      );
      writeResults.forEach((r, i) => {
        results.push({
          action:  writes[i].action,
          success: r.status === 'fulfilled',
          result:  r.status === 'fulfilled' ? r.value : null,
          error:   r.status === 'rejected'  ? r.reason?.message : null,
        });
      });
    }

    return results;
  }

  _sendAndWait(connectionId, command, retries = 0) {
    return new Promise((resolve, reject) => {
      const id = command.id;

      const timer = setTimeout(() => {
        this.executingCommands.delete(id);
        this.wsManager.removeListener('result', handler);
        if (retries < this.maxRetries) {
          this._sendAndWait(connectionId, command, retries + 1).then(resolve).catch(reject);
        } else {
          reject(new Error(`Timeout: ${command.action} (${id})`));
        }
      }, this.commandTimeout);

      const handler = (r) => {
        if (r.commandId !== id) return;
        clearTimeout(timer);
        this.wsManager.removeListener('result', handler);
        this.executingCommands.delete(id);
        r.success ? resolve(r.result) : reject(new Error(r.error || 'Command failed'));
      };

      this.wsManager.on('result', handler);
      this.executingCommands.set(id, { command, connectionId, timer, handler });

      const sent = this.wsManager.sendCommand(connectionId, command);
      if (!sent) {
        clearTimeout(timer);
        this.wsManager.removeListener('result', handler);
        this.executingCommands.delete(id);
        reject(new Error('Failed to send command to plugin'));
      }
    });
  }

  getActiveConnection() {
    const active = this.wsManager.getAllConnections().find(
      c => c.connected || c.ready || c.readyState === 1
    );
    return active ? active.id : this.wsManager.getPluginConnectionId();
  }

  cancelCommand(id) {
    const e = this.executingCommands.get(id);
    if (!e) return false;
    clearTimeout(e.timer);
    this.wsManager.removeListener('result', e.handler);
    this.executingCommands.delete(id);
    return true;
  }

  getExecutingCommands() {
    return Array.from(this.executingCommands.entries()).map(([id, d]) => ({
      id, action: d.command.action, connectionId: d.connectionId,
    }));
  }

  async getExplorerTree() {
    const conn = this.getActiveConnection();
    if (!conn) throw new Error('No active plugin connection');
    return this._sendAndWait(conn, {
      id: this.wsManager.generateCommandId(),
      action: 'GetExplorerTree', data: {},
    });
  }

  getCurrentState() { return this.wsManager.getLastKnownState(); }
}

module.exports = CommandEngine;
