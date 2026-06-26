const fs   = require('fs');
const path = require('path');

class ErrorTracker {
  constructor() {
    this.errors        = [];
    this.errorPatterns = {};
    this.logFile       = path.join(__dirname, '../logs/errors.json');
    this._diskOk       = true;   // flips false if writes start failing

    this._ensureLogDir();
    this._load();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  logError(error, context = {}) {
    const entry = {
      id:          this._id(),
      timestamp:   new Date().toISOString(),
      message:     error?.message || String(error),
      stack:       error?.stack   || null,
      severity:    this._severity(error),
      context,
      fixed:       false,
      fix:         null,
      frequency:   1,
    };

    const similar = this.errors.find(
      e => e.message === entry.message && e.context.action === context.action
    );

    if (similar) {
      similar.frequency   += 1;
      similar.lastOccurred = entry.timestamp;
    } else {
      this.errors.push(entry);
      if (this.errors.length > 2000) this.errors.shift();
    }

    this._trackPattern(entry);
    this._save();
    return entry.id;
  }

  recordFix(errorId, fix, success) {
    const err = this.errors.find(e => e.id === errorId);
    if (!err) return;

    err.fixed = success;
    err.fix   = { applied: new Date().toISOString(), description: fix, success };

    if (success && this.errorPatterns[err.message]) {
      this.errorPatterns[err.message].suggestedFix = fix;
    }

    this._save();
  }

  getErrorStats() {
    return {
      totalErrors:   this.errors.length,
      fixedErrors:   this.errors.filter(e => e.fixed).length,
      unfixedErrors: this.errors.filter(e => !e.fixed).length,
      bySeverity: {
        critical: this.errors.filter(e => e.severity === 'critical').length,
        high:     this.errors.filter(e => e.severity === 'high').length,
        medium:   this.errors.filter(e => e.severity === 'medium').length,
        low:      this.errors.filter(e => e.severity === 'low').length,
      },
      recentErrors: this.errors.slice(-10),
      mostCommon:   this._mostCommon(5),
      diskOk:       this._diskOk,
    };
  }

  clearOldErrors(daysOld = 7) {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const before = this.errors.length;
    this.errors  = this.errors.filter(e => new Date(e.timestamp) > cutoff);
    console.log(`[ErrorTracker] Cleared ${before - this.errors.length} old errors`);
    this._save();
  }

  exportErrors(format = 'json') {
    if (format === 'csv') {
      const headers = ['Timestamp','Severity','Message','Fixed','Context'];
      const rows    = this.errors.map(e => [
        e.timestamp, e.severity,
        `"${(e.message || '').replace(/"/g,'""')}"`,
        e.fixed ? 'Yes' : 'No',
        `"${JSON.stringify(e.context).replace(/"/g,'""')}"`,
      ]);
      return [headers, ...rows].map(r => r.join(',')).join('\n');
    }
    return JSON.stringify(this.getErrorStats(), null, 2);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  _severity(error) {
    const m = (error?.message || '').toLowerCase();
    if (m.includes('connection') || m.includes('timeout')) return 'critical';
    if (m.includes('not found')  || m.includes('undefined')) return 'high';
    if (m.includes('invalid')    || m.includes('malformed')) return 'medium';
    return 'low';
  }

  _trackPattern(entry) {
    const k = entry.message;
    if (!this.errorPatterns[k]) {
      this.errorPatterns[k] = { count: 0, firstSeen: entry.timestamp, suggestedFix: null };
    }
    this.errorPatterns[k].count += 1;
  }

  _mostCommon(limit) {
    return Object.entries(this.errorPatterns)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([message, data]) => ({ message, count: data.count, suggestedFix: data.suggestedFix }));
  }

  _ensureLogDir() {
    try {
      const dir = path.dirname(this.logFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.warn('[ErrorTracker] Cannot create log directory — running in-memory only:', e.message);
      this._diskOk = false;
    }
  }

  _save() {
    if (!this._diskOk) return;
    try {
      fs.writeFileSync(this.logFile, JSON.stringify({
        errors:      this.errors,
        patterns:    this.errorPatterns,
        lastUpdated: new Date().toISOString(),
      }, null, 2));
    } catch (e) {
      // Flip to in-memory mode so we stop spamming failed writes
      this._diskOk = false;
      console.warn('[ErrorTracker] Disk write failed — switching to in-memory mode:', e.message);
    }
  }

  _load() {
    if (!this._diskOk) return;
    try {
      if (fs.existsSync(this.logFile)) {
        const data         = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
        this.errors        = data.errors   || [];
        this.errorPatterns = data.patterns || {};
      }
    } catch (e) {
      console.warn('[ErrorTracker] Could not load existing log (starting fresh):', e.message);
      this.errors        = [];
      this.errorPatterns = {};
    }
  }

  _id() {
    return `err_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

module.exports = ErrorTracker;
