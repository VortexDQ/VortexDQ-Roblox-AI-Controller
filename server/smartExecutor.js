const Protocol = require('./protocol');

const CREATE_ACTIONS = new Set([
  'CreateInstance','CreatePart','CreateFolder','CreateScript','CreateUI',
]);

class SmartExecutor {
  constructor(commandEngine, errorTracker) {
    this.commandEngine    = commandEngine;
    this.errorTracker     = errorTracker;
    this.executionHistory = [];
    this.maxHistory       = 500;
  }

  async executeWithAnalysis(commands, context = {}) {
    const start    = Date.now();
    const prepared = this._prepare(commands, context);
    const results  = await this._execute(prepared);
    const duration = Date.now() - start;
    this._record(prepared, results, duration);

    return {
      success:      results.every(r => r.success),
      results,
      duration:     `${duration}ms`,
      commandCount: prepared.length,
    };
  }

  _prepare(commands, context) {
    const indexed = commands.map((cmd, i) => ({ cmd, i }));

    const seen   = new Set();
    const unique = indexed.filter(({ cmd }) => {
      const key = `${cmd.action}:${JSON.stringify(cmd.data)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => {
      const ac = CREATE_ACTIONS.has(a.cmd.action) ? 0 : 1;
      const bc = CREATE_ACTIONS.has(b.cmd.action) ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return a.i - b.i;
    });

    const sorted = unique.map(({ cmd }) => cmd);

    if (!context.skipEnhancements) {
      sorted.forEach(cmd => {
        if (cmd.action === 'CreatePart') {
          cmd.data.properties = cmd.data.properties || {};
          if (cmd.data.properties.Anchored  === undefined) cmd.data.properties.Anchored  = true;
          if (cmd.data.properties.CastShadow=== undefined) cmd.data.properties.CastShadow = true;
        }
        if (cmd.action === 'CreateScript' && !cmd.data.name) cmd.data.name = 'Script';
      });
    }

    return sorted;
  }

  async _execute(commands) {
    return this.commandEngine.executeCommandBatch(commands);
  }

  _record(commands, results, duration) {
    this.executionHistory.push({
      ts:           new Date().toISOString(),
      commandCount: commands.length,
      succeeded:    results.filter(r => r.success).length,
      failed:       results.filter(r => !r.success).length,
      duration,
    });
    if (this.executionHistory.length > this.maxHistory) this.executionHistory.shift();
  }

  getStats() {
    const t = this.executionHistory.length;
    if (t === 0) {
      return { totalExecutions: 0, successRate: '0%', avgDuration: '0ms', avgCommandsPerExecution: 0 };
    }
    const ok      = this.executionHistory.filter(e => e.failed === 0).length;
    const avg     = Math.round(this.executionHistory.reduce((s, e) => s + e.duration, 0) / t);
    const avgCmds = Math.round(this.executionHistory.reduce((s, e) => s + e.commandCount, 0) / t);
    return {
      totalExecutions:         t,
      successRate:             `${((ok / t) * 100).toFixed(1)}%`,
      avgDuration:             `${avg}ms`,
      avgCommandsPerExecution: avgCmds,
      recentExecutions:        this.executionHistory.slice(-10),
    };
  }
}

module.exports = SmartExecutor;
