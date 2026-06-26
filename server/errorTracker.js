const fs = require('fs');
const path = require('path');

class ErrorTracker {
  constructor() {
    this.errors = [];
    this.logFile = path.join(__dirname, '../logs/errors.json');
    this.ensureLogDir();
    this.loadErrors();
    this.errorPatterns = {};
    this.fixes = {};
  }

  ensureLogDir() {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  logError(error, context = {}) {
    const errorEntry = {
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      message: error.message || String(error),
      stack: error.stack,
      severity: this._calculateSeverity(error),
      context: context,
      fixed: false,
      fix: null,
      frequency: 1
    };

    // Check for similar errors
    const similar = this.errors.find(e =>
      e.message === errorEntry.message &&
      e.context.action === context.action
    );

    if (similar) {
      similar.frequency += 1;
      similar.lastOccurred = new Date().toISOString();
    } else {
      this.errors.push(errorEntry);
    }

    this._save();
    this._analyzeError(errorEntry);

    return errorEntry.id;
  }

  _calculateSeverity(error) {
    const message = error.message?.toLowerCase() || '';

    if (message.includes('connection') || message.includes('timeout')) {
      return 'critical';
    }
    if (message.includes('not found') || message.includes('undefined')) {
      return 'high';
    }
    if (message.includes('invalid') || message.includes('malformed')) {
      return 'medium';
    }
    return 'low';
  }

  _analyzeError(errorEntry) {
    const key = errorEntry.message;

    if (!this.errorPatterns[key]) {
      this.errorPatterns[key] = {
        count: 0,
        firstSeen: errorEntry.timestamp,
        contexts: [],
        suggestedFix: null
      };
    }

    this.errorPatterns[key].count += 1;
    this.errorPatterns[key].contexts.push(errorEntry.context);
  }

  recordFix(errorId, fix, success) {
    const error = this.errors.find(e => e.id === errorId);

    if (error) {
      error.fixed = success;
      error.fix = {
        applied: new Date().toISOString(),
        description: fix,
        success: success
      };

      if (success) {
        const key = error.message;
        if (this.errorPatterns[key]) {
          this.errorPatterns[key].suggestedFix = fix;
        }

        this.fixes[key] = {
          fix: fix,
          successRate: 1.0
        };
      }

      this._save();
    }
  }

  getErrorStats() {
    const stats = {
      totalErrors: this.errors.length,
      fixedErrors: this.errors.filter(e => e.fixed).length,
      unfixedErrors: this.errors.filter(e => !e.fixed).length,
      bySeverity: {
        critical: this.errors.filter(e => e.severity === 'critical').length,
        high: this.errors.filter(e => e.severity === 'high').length,
        medium: this.errors.filter(e => e.severity === 'medium').length,
        low: this.errors.filter(e => e.severity === 'low').length
      },
      recentErrors: this.errors.slice(-10),
      mostCommon: this._getMostCommonErrors(5),
      patterns: this.errorPatterns
    };

    return stats;
  }

  _getMostCommonErrors(limit) {
    return Object.entries(this.errorPatterns)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([message, data]) => ({
        message,
        count: data.count,
        suggestedFix: data.suggestedFix
      }));
  }

  getSuggestedFix(errorMessage) {
    const pattern = this.errorPatterns[errorMessage];
    if (pattern && pattern.suggestedFix) {
      return pattern.suggestedFix;
    }

    // Suggest common fixes
    const message = errorMessage.toLowerCase();

    if (message.includes('not found')) {
      return 'Check that the instance path is correct. Use GetExplorerTree to verify structure.';
    }
    if (message.includes('connection')) {
      return 'Ensure server is running and plugin is connected. Restart server and plugin.';
    }
    if (message.includes('timeout')) {
      return 'Command took too long. Reduce batch size or simplify commands.';
    }
    if (message.includes('invalid')) {
      return 'Check JSON format and required fields. Review command schema.';
    }

    return 'Review error details and check logs.';
  }

  clearOldErrors(daysOld = 7) {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const before = this.errors.length;

    this.errors = this.errors.filter(e => new Date(e.timestamp) > cutoff);

    console.log(`[ErrorTracker] Cleared ${before - this.errors.length} old errors`);
    this._save();
  }

  exportErrors(format = 'json') {
    if (format === 'csv') {
      return this._toCsv();
    }

    return JSON.stringify(this.getErrorStats(), null, 2);
  }

  _toCsv() {
    const headers = ['Timestamp', 'Severity', 'Message', 'Fixed', 'Context'];
    const rows = this.errors.map(e => [
      e.timestamp,
      e.severity,
      e.message,
      e.fixed ? 'Yes' : 'No',
      JSON.stringify(e.context)
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  _generateId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  _save() {
    try {
      fs.writeFileSync(
        this.logFile,
        JSON.stringify({
          errors: this.errors,
          patterns: this.errorPatterns,
          lastUpdated: new Date().toISOString()
        }, null, 2)
      );
    } catch (error) {
      console.error('[ErrorTracker] Failed to save:', error.message);
    }
  }

  loadErrors() {
    try {
      if (fs.existsSync(this.logFile)) {
        const data = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
        this.errors = data.errors || [];
        this.errorPatterns = data.patterns || {};
      }
    } catch (error) {
      console.error('[ErrorTracker] Failed to load:', error.message);
      this.errors = [];
    }
  }
}

module.exports = ErrorTracker;
