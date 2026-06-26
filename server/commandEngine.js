const Protocol = require('./protocol');
const { EventEmitter } = require('events');

class CommandEngine extends EventEmitter {
  constructor(wsManager) {
    super();
    this.wsManager = wsManager;
    this.commandQueue = [];
    this.executingCommands = new Map();
    this.commandTimeout = 30000;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  async executeCommand(command, connectionId = null) {
    try {
      Protocol.validateCommand(command);
    } catch (error) {
      throw new Error(`Invalid command: ${error.message}`);
    }

    const commandId = command.id || this.wsManager.generateCommandId();
    const targetConnection = connectionId || this.getActiveConnection();

    if (!targetConnection) {
      throw new Error('No active plugin connection');
    }

    return this.sendAndWait(targetConnection, {
      ...command,
      id: commandId
    });
  }

  async executeCommandBatch(commands, connectionId = null) {
    try {
      Protocol.validateCommandBatch(commands);
    } catch (error) {
      throw new Error(`Invalid command batch: ${error.message}`);
    }

    const targetConnection = connectionId || this.getActiveConnection();

    if (!targetConnection) {
      throw new Error('No active plugin connection');
    }

    const results = [];
    for (const command of commands) {
      try {
        const result = await this.executeCommand(command, targetConnection);
        results.push({
          action: command.action,
          success: true,
          result: result
        });
      } catch (error) {
        results.push({
          action: command.action,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  sendAndWait(connectionId, command, retries = 0) {
    return new Promise((resolve, reject) => {
      const commandId = command.id || this.wsManager.generateCommandId();
      const timeout = setTimeout(() => {
        this.executingCommands.delete(commandId);
        if (retries < this.maxRetries) {
          console.log(`[ENGINE] Retrying command ${commandId} (attempt ${retries + 1}/${this.maxRetries})`);
          setTimeout(() => {
            this.sendAndWait(connectionId, { ...command, id: commandId }, retries + 1)
              .then(resolve)
              .catch(reject);
          }, this.retryDelay);
        } else {
          reject(new Error(`Command timeout after ${this.maxRetries} retries: ${command.action}`));
        }
      }, this.commandTimeout);

      const handler = (result) => {
        if (result.commandId === commandId) {
          clearTimeout(timeout);
          this.wsManager.removeListener('result', handler);
          this.executingCommands.delete(commandId);

          if (result.success) {
            resolve(result.result);
          } else {
            reject(new Error(result.error || 'Command execution failed'));
          }
        }
      };

      this.wsManager.on('result', handler);
      this.executingCommands.set(commandId, {
        command,
        connectionId,
        timeout,
        handler
      });

      try {
        const sent = this.wsManager.sendCommand(connectionId, {
          ...command,
          id: commandId
        });

        if (!sent) {
          clearTimeout(timeout);
          this.wsManager.removeListener('result', handler);
          this.executingCommands.delete(commandId);
          reject(new Error('Failed to send command to plugin'));
        }
      } catch (error) {
        clearTimeout(timeout);
        this.wsManager.removeListener('result', handler);
        this.executingCommands.delete(commandId);
        reject(error);
      }
    });
  }

  getActiveConnection() {
    const connections = this.wsManager.getAllConnections();
    const active = connections.find(c => c.ready);
    return active ? active.id : null;
  }

  cancelCommand(commandId) {
    const executing = this.executingCommands.get(commandId);
    if (executing) {
      clearTimeout(executing.timeout);
      this.wsManager.removeListener('result', executing.handler);
      this.executingCommands.delete(commandId);
      return true;
    }
    return false;
  }

  getExecutingCommands() {
    return Array.from(this.executingCommands.entries()).map(([id, data]) => ({
      id,
      action: data.command.action,
      connectionId: data.connectionId
    }));
  }

  async getExplorerTree() {
    const connectionId = this.getActiveConnection();
    if (!connectionId) {
      throw new Error('No active plugin connection');
    }

    return this.sendAndWait(connectionId, {
      id: this.wsManager.generateCommandId(),
      action: 'GetExplorerTree',
      data: {}
    });
  }

  async getCurrentState() {
    return this.wsManager.getLastKnownState();
  }
}

module.exports = CommandEngine;
