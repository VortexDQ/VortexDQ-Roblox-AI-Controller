const Protocol = require('./protocol');

// Actions that create something — must run before SetProperty on their output
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

    // Execute — no artificial delays between batches
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

  // Deduplicate, sort creates-first, apply quality defaults
  _prepare(commands, context) {
    // Deduplicate by JSON fingerprint
    const seen = new Set();
    const unique = commands.filter(cmd => {
      const key = `${cmd.action}:${JSON.stringify(cmd.data)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Ensure creates come before mutations
    unique.sort((a, b) => {
      const ac = CREATE_ACTIONS.has(a.action) ? 0 : 1;
      const bc = CREATE_ACTIONS.has(b.action) ? 0 : 1;
      return ac - bc;
    });

    // Quality defaults — anchor parts, give scripts names
    if (!context.skipEnhancements) {
      unique.forEach(cmd => {
        if (cmd.action === 'CreatePart') {
          cmd.data.properties = cmd.data.properties || {};
          if (cmd.data.properties.Anchored === undefined) cmd.data.properties.Anchored = true;
          if (cmd.data.properties.CastShadow === undefined) cmd.data.properties.CastShadow = true;
        }
        if (cmd.action === 'CreateScript' && !cmd.data.name) {
          cmd.data.name = 'Script';
        }
      });
    }

    return unique;
  }

  async _execute(commands) {
    // Split into chunks of 50 and fire each chunk's parallel-safe commands concurrently
    const CHUNK = 50;
    const all   = [];

    for (let i = 0; i < commands.length; i += CHUNK) {
      const chunk   = commands.slice(i, i + CHUNK);
      const results = await this.commandEngine.executeCommandBatch(chunk);
      all.push(...results);
      // No sleep between chunks — the engine handles ordering
    }

    return all;
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
    if (t === 0) return { totalExecutions: 0, successRate: '0%', avgDuration: '0ms' };
    const ok  = this.executionHistory.filter(e => e.failed === 0).length;
    const avg = Math.round(this.executionHistory.reduce((s, e) => s + e.duration, 0) / t);
    return {
      totalExecutions:  t,
      successRate:      `${((ok / t) * 100).toFixed(1)}%`,
      avgDuration:      `${avg}ms`,
      recentExecutions: this.executionHistory.slice(-10),
    };
  }
}

module.exports = SmartExecutor;
