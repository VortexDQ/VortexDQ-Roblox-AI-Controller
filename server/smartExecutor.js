const Protocol = require('./protocol');

class SmartExecutor {
  constructor(commandEngine, errorTracker) {
    this.commandEngine = commandEngine;
    this.errorTracker = errorTracker;
    this.executionHistory = [];
    this.maxHistory = 1000;
  }

  async executeWithAnalysis(commands, context = {}) {
    // Analyze commands before execution
    const analysis = this._analyzeCommands(commands);

    // Optimize commands
    const optimized = this._optimizeCommands(commands);

    // Add extra touches/improvements
    const enhanced = this._enhanceCommands(optimized, context);

    // Execute
    const results = await this._executeSmartly(enhanced, context);

    // Learn from results
    this._recordExecution(enhanced, results, analysis);

    return {
      success: results.every(r => r.success),
      results,
      analysis,
      improvements: enhanced.length > commands.length
    };
  }

  _analyzeCommands(commands) {
    return {
      count: commands.length,
      types: [...new Set(commands.map(c => c.action))],
      complexity: this._calculateComplexity(commands),
      hasUI: commands.some(c => c.action === 'CreateUI'),
      hasScripts: commands.some(c => c.action === 'CreateScript'),
      estimatedTime: Math.ceil(commands.length * 50) + 'ms'
    };
  }

  _calculateComplexity(commands) {
    if (commands.length > 20) return 'very-high';
    if (commands.length > 10) return 'high';
    if (commands.length > 5) return 'medium';
    return 'low';
  }

  _optimizeCommands(commands) {
    // Remove duplicates
    const seen = new Set();
    const unique = commands.filter(cmd => {
      const key = JSON.stringify(cmd);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Reorder: Create before SetProperty
    return unique.sort((a, b) => {
      const createActions = ['CreateInstance', 'CreatePart', 'CreateFolder', 'CreateScript', 'CreateUI'];
      const aIsCreate = createActions.includes(a.action);
      const bIsCreate = createActions.includes(b.action);

      if (aIsCreate && !bIsCreate) return -1;
      if (!aIsCreate && bIsCreate) return 1;
      return 0;
    });
  }

  _enhanceCommands(commands, context) {
    const enhanced = [...commands];

    // If creating parts, add visual improvements
    const hasParts = commands.some(c => c.action === 'CreatePart');
    if (hasParts && !context.skipEnhancements) {
      // Auto-anchor parts for stability
      commands.forEach(cmd => {
        if (cmd.action === 'CreatePart') {
          if (!cmd.data.properties) {
            cmd.data.properties = {};
          }
          if (cmd.data.properties.Anchored === undefined) {
            cmd.data.properties.Anchored = true;
          }
        }
      });
    }

    // If creating UI, add default properties
    const hasUI = commands.some(c => c.action === 'CreateUI');
    if (hasUI) {
      commands.forEach(cmd => {
        if (cmd.action === 'CreateUI') {
          if (!cmd.data.properties) {
            cmd.data.properties = {};
          }
          // Add default UI properties
          if (!cmd.data.properties.Size && cmd.data.type === 'ScreenGui') {
            cmd.data.properties.Size = { X: 300, Y: 400 };
          }
          if (!cmd.data.properties.BackgroundColor3) {
            cmd.data.properties.BackgroundColor3 = [240, 240, 240];
          }
        }
      });
    }

    // Add exploration command if none exist
    if (commands.length === 0 || !commands.some(c => c.action === 'GetExplorerTree')) {
      if (context.includeExplorer) {
        enhanced.push({
          action: 'GetExplorerTree',
          data: {}
        });
      }
    }

    return enhanced;
  }

  async _executeSmartly(commands, context = {}) {
    const results = [];
    const batchSize = 10;

    // Execute in batches for stability
    for (let i = 0; i < commands.length; i += batchSize) {
      const batch = commands.slice(i, i + batchSize);

      try {
        const batchResults = await this.commandEngine.executeCommandBatch(batch);

        results.push(...batchResults);

        // Check for errors and attempt fixes
        for (let j = 0; j < batchResults.length; j++) {
          if (!batchResults[j].success) {
            const error = batchResults[j].error;
            const errorId = this.errorTracker.logError(
              new Error(error),
              {
                action: batch[j].action,
                command: batch[j]
              }
            );

            // Suggest fix
            const suggestedFix = this.errorTracker.getSuggestedFix(error);
            console.log(`[SmartExecutor] Error in ${batch[j].action}: ${suggestedFix}`);
          }
        }

        // Small delay between batches
        if (i + batchSize < commands.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (error) {
        this.errorTracker.logError(error, {
          batch: i / batchSize,
          batchSize
        });

        results.push({
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  _recordExecution(commands, results, analysis) {
    const execution = {
      timestamp: new Date().toISOString(),
      commandCount: commands.length,
      successCount: results.filter(r => r.success).length,
      failureCount: results.filter(r => !r.success).length,
      analysis,
      duration: 0
    };

    this.executionHistory.push(execution);

    if (this.executionHistory.length > this.maxHistory) {
      this.executionHistory.shift();
    }
  }

  getStats() {
    const total = this.executionHistory.length;
    const successful = this.executionHistory.filter(e => e.failureCount === 0).length;

    return {
      totalExecutions: total,
      successfulExecutions: successful,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(2) + '%' : '0%',
      averageCommandsPerExecution: total > 0
        ? Math.round(this.executionHistory.reduce((sum, e) => sum + e.commandCount, 0) / total)
        : 0,
      recentExecutions: this.executionHistory.slice(-20)
    };
  }
}

module.exports = SmartExecutor;
