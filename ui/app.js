// VortexDQ AI Controller - Frontend
class VortexDQUI {
  constructor() {
    this.chatMessages = document.getElementById('chatMessages');
    this.userInput = document.getElementById('userInput');
    this.chatForm = document.getElementById('chatForm');
    this.sendBtn = document.getElementById('sendBtn');
    this.enhanceCheckbox = document.getElementById('enhanceCheckbox');
    this.modelBadge = document.getElementById('modelBadge');
    this.toastContainer = document.getElementById('toastContainer');
    this.loadingSpinner = document.getElementById('loadingSpinner');

    this.activeModel = 'claude';
    this.chatHistory = [];

    this.initEventListeners();
    this.loadModels();
    this.loadStats();
    this.loadErrors();
    this.loadConnections();
    this.checkApiKeys();

    // Refresh stats every 5 seconds
    setInterval(() => this.loadStats(), 5000);
    setInterval(() => this.loadConnections(), 3000);
    setInterval(() => this.loadErrors(), 5000);
  }

  initEventListeners() {
    // Chat
    this.chatForm.addEventListener('submit', (e) => this.handleSendMessage(e));
    this.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        this.chatForm.dispatchEvent(new Event('submit'));
      }
    });

    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.currentTarget));
    });

    // Models
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('model-card')) {
        this.switchModel(e.target.dataset.model);
      }
    });

    // Clear chat
    document.getElementById('clearChat').addEventListener('click', () => this.clearChat());

    // Export errors
    document.getElementById('exportErrors').addEventListener('click', () => this.exportErrors());

    // Settings
    document.getElementById('save-keys-btn').addEventListener('click', () => this.saveSettings());
  }

  async handleSendMessage(e) {
    e.preventDefault();

    const prompt = this.userInput.value.trim();
    if (!prompt) return;

    // Check for special commands
    if (prompt.toLowerCase().includes('/analyze')) {
      this.userInput.value = '';
      return this.analyzeGame(prompt.includes('deep'));
    }

    if (prompt.toLowerCase().includes('/scan')) {
      this.userInput.value = '';
      return this.scanGame();
    }

    // Regular execution
    this.addMessage('user', prompt);
    this.userInput.value = '';

    // Show loading
    this.setLoading(true);
    this.sendBtn.disabled = true;

    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: this.activeModel,
          enhance: this.enhanceCheckbox.checked
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        const analysis = data.analysis;
        const ok  = data.results.filter(r => r.success).length;
        const tot = data.results.length;
        const aiMsg  = data.message || `Applied ${analysis.commandCount} commands.`;
        const meta   = `✓ ${analysis.commandCount} cmd${analysis.commandCount !== 1 ? 's' : ''} · ${analysis.executionTime} · ${ok}/${tot} ok · ${analysis.complexity}`;

        this.addMessage('ai', aiMsg, 'success', meta);
        this.showToast(`Game updated with ${analysis.commandCount} commands`, 'success');
      } else {
        throw new Error(data.error || 'Execution failed');
      }

      this.chatHistory.push({ role: 'user', content: prompt });
      this.chatHistory.push({ role: 'assistant', content: data.analysis.types.join(', ') });
    } catch (error) {
      this.addMessage('ai', `Error: ${error.message}`, 'error');
      this.showToast(error.message, 'error');
    } finally {
      this.setLoading(false);
      this.sendBtn.disabled = false;
    }
  }

  async analyzeGame(deep = false) {
    this.setLoading(true);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deep })
      });

      const data = await response.json();

      if (data.success) {
        const analysis = data.analysis;
        const msg = `📊 Game Analysis:

Total Instances: ${analysis.stats.totalInstances}
Complexity: ${analysis.stats.complexity}
Depth: ${analysis.stats.depth} levels

Suggestions:
${analysis.suggestions.map(s => `• ${s.message}`).join('\n')}

Examples to try:
${analysis.examples.map(e => `• "${e}"`).join('\n')}`;

        this.addMessage('ai', msg);
        this.showToast('Game analyzed successfully', 'success');
      }
    } catch (error) {
      this.addMessage('ai', `Analysis error: ${error.message}`, 'error');
    } finally {
      this.setLoading(false);
    }
  }

  async scanGame() {
    this.setLoading(true);

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await response.json();

      if (data.success) {
        const report = data.report;
        let msg = `🔍 Security Scan Complete\n`;
        msg += `Status: ${report.status.toUpperCase()}\n\n`;
        msg += report.summary + '\n\n';

        if (report.details && report.details.length > 0) {
          report.details.forEach(detail => {
            msg += `\n${detail.category}\n`;
            detail.items.forEach(item => {
              msg += `  • ${item.location}: ${item.issue}\n`;
              msg += `    → ${item.suggestion}\n`;
            });
          });
        }

        this.addMessage('ai', msg);
        this.showToast('Game scanned', data.report.status === 'clean' ? 'success' : 'warning');
      }
    } catch (error) {
      this.addMessage('ai', `Scan error: ${error.message}`, 'error');
    } finally {
      this.setLoading(false);
    }
  }

  addMessage(role, content, type = 'normal', meta = null) {
    const message = document.createElement('div');
    message.className = `message message-${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const text = document.createElement('div');
    text.className = 'message-text';
    text.textContent = content;
    contentDiv.appendChild(text);

    if (role === 'ai' && type === 'success' && meta) {
      const analysis = document.createElement('div');
      analysis.className = 'message-analysis';
      analysis.textContent = meta;
      contentDiv.appendChild(analysis);
    }

    message.appendChild(avatar);
    message.appendChild(contentDiv);

    this.chatMessages.appendChild(message);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  async loadModels() {
    try {
      const response = await fetch('/api/models');
      const data = await response.json();

      // Update badge
      this.modelBadge.textContent = data.active;
      this.activeModel = data.active;

      // Update grid
      const grid = document.getElementById('modelsGrid');
      grid.innerHTML = '';

      data.available.forEach(model => {
        const card = document.createElement('div');
        card.className = `model-card ${model.active ? 'active' : ''}`;
        card.dataset.model = model.name;

        const speedBar = this.getSpeedBar(model.speed);
        const qualityBar = this.getQualityBar(model.quality);

        card.innerHTML = `
          <div class="model-name">${model.name}</div>
          <div class="model-stats">
            <div class="model-stat">
              <span>Speed</span>
              <span>${speedBar}</span>
            </div>
            <div class="model-stat">
              <span>Quality</span>
              <span>${qualityBar}</span>
            </div>
            <div class="model-stat">
              <span>Type</span>
              <span>${model.cost}</span>
            </div>
          </div>
        `;

        grid.appendChild(card);
      });

      // Update table
      const tbody = document.getElementById('modelTable');
      tbody.innerHTML = '';

      data.available.forEach(model => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><strong>${model.name}</strong></td>
          <td>${(model.speed * 100).toFixed(0)}%</td>
          <td>${(model.quality * 100).toFixed(0)}%</td>
          <td>${model.cost}</td>
        `;
        tbody.appendChild(row);
      });
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  }

  async switchModel(modelName) {
    try {
      const response = await fetch('/api/models/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      });

      const data = await response.json();
      if (data.success) {
        this.activeModel = modelName;
        this.modelBadge.textContent = modelName;
        this.loadModels();
        this.showToast(`Switched to ${modelName}`, 'success');
      }
    } catch (error) {
      this.showToast(`Error switching model: ${error.message}`, 'error');
    }
  }

  async loadStats() {
    try {
      const response = await fetch('/api/stats');
      const data = await response.json();

      document.getElementById('totalExecutions').textContent = data.smartExecutor.totalExecutions;
      document.getElementById('successRate').textContent = data.smartExecutor.successRate;
      document.getElementById('avgCommands').textContent = data.smartExecutor.avgDuration;
      document.getElementById('activeConnections').textContent = data.connections;

      const execList = document.getElementById('recentExecList');
      execList.innerHTML = '';

      (data.smartExecutor.recentExecutions || []).slice(-5).forEach(exec => {
        const item = document.createElement('div');
        item.className = 'execution-item';
        item.innerHTML = `
          <div>
            <div>${exec.commandCount} commands</div>
            <div class="execution-time">${new Date(exec.ts).toLocaleTimeString()}</div>
          </div>
          <div>${exec.succeeded}/${exec.commandCount} success</div>
        `;
        execList.appendChild(item);
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async loadErrors() {
    try {
      const response = await fetch('/api/errors');
      const data = await response.json();

      document.getElementById('totalErrors').textContent = data.totalErrors;
      document.getElementById('fixedErrors').textContent = data.fixedErrors;
      document.getElementById('unfixedErrors').textContent = data.unfixedErrors;

      document.getElementById('severityCritical').textContent = data.bySeverity.critical;
      document.getElementById('severityHigh').textContent = data.bySeverity.high;
      document.getElementById('severityMedium').textContent = data.bySeverity.medium;
      document.getElementById('severityLow').textContent = data.bySeverity.low;

      const errorsList = document.getElementById('commonErrors');
      errorsList.innerHTML = '';

      if (data.mostCommon.length === 0) {
        errorsList.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No errors recorded</p>';
      } else {
        data.mostCommon.forEach(err => {
          const item = document.createElement('div');
          item.className = 'error-item';
          item.innerHTML = `
            <div class="error-message">${err.message}</div>
            <div class="error-suggestion">Occurrences: ${err.count} ${err.suggestedFix ? '| Fix: ' + err.suggestedFix : ''}</div>
          `;
          errorsList.appendChild(item);
        });
      }
    } catch (error) {
      console.error('Failed to load errors:', error);
    }
  }

  async loadConnections() {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();

      const list = document.getElementById('connectionsList');

      if (data.connections.length === 0) {
        list.innerHTML = '<p class="no-connections">No connections yet</p>';
        document.querySelector('.status-dot').className = 'status-dot disconnected';
        document.querySelector('.status-text').textContent = 'Disconnected';
      } else {
        list.innerHTML = '';
        document.querySelector('.status-dot').className = 'status-dot connected';
        document.querySelector('.status-text').textContent = 'Connected';

        data.connections.forEach(conn => {
          const item = document.createElement('div');
          item.className = 'connection-item';
          const status = conn.connected ? '🟢' : '🔴';
          item.innerHTML = `
            <span>${status} ${conn.id}</span>
            <span style="color: var(--text-secondary); font-size: 12px;">${new Date(conn.lastUpdate).toLocaleTimeString()}</span>
          `;
          list.appendChild(item);
        });
      }
    } catch (error) {
      console.error('Failed to load connections:', error);
    }
  }

  switchTab(btn) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const tabName = btn.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');

    if (tabName === 'settings') this.loadSettings();
  }

  clearChat() {
    if (confirm('Clear all chat messages?')) {
      this.chatMessages.innerHTML = '';
      this.chatHistory = [];
      this.showToast('Chat cleared', 'info');
    }
  }

  async exportErrors() {
    try {
      const response = await fetch('/api/errors/export?format=csv');
      const csv = await response.text();

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `errors-${Date.now()}.csv`;
      a.click();

      this.showToast('Errors exported', 'success');
    } catch (error) {
      this.showToast(`Export failed: ${error.message}`, 'error');
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = `${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'} ${message}`;

    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  setLoading(active) {
    if (active) {
      this.loadingSpinner.classList.add('active');
    } else {
      this.loadingSpinner.classList.remove('active');
    }
  }

  getSpeedBar(speed) {
    const percentage = Math.round(speed * 100);
    return `${percentage}%`;
  }

  getQualityBar(quality) {
    const percentage = Math.round(quality * 100);
    return `${percentage}%`;
  }

  async checkApiKeys() {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      this.applyKeyStatus(cfg);
      if (!cfg.anthropic && !cfg.gemini && !cfg.deepseek) {
        this.showToast('No API keys set — open Settings to add one', 'error');
      }
    } catch (_) {}
  }

  async loadSettings() {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      this.applyKeyStatus(cfg);
    } catch (_) {}
  }

  applyKeyStatus(cfg) {
    const mark = (inputId, statusId, ok) => {
      const el  = document.getElementById(statusId);
      const inp = document.getElementById(inputId);
      if (!el) return;
      el.className   = 'key-status-inline ' + (ok ? 'set' : 'unset');
      el.textContent = ok ? '✓ configured' : '✕ not set';
      if (inp && ok && !inp.value) inp.placeholder = '••••••••••••••••••••';
    };
    mark('key-anthropic', 'ks-anthropic', cfg.anthropic);
    mark('key-gemini',    'ks-gemini',    cfg.gemini);
    mark('key-deepseek',  'ks-deepseek',  cfg.deepseek);

    const anyKey = cfg.anthropic || cfg.gemini || cfg.deepseek;
    const banner = document.getElementById('no-key-banner');
    if (banner) banner.classList.toggle('hidden', anyKey);
    const badge  = document.getElementById('key-badge');
    if (badge)  badge.classList.toggle('hidden', anyKey);
  }

  async saveSettings() {
    const btn = document.getElementById('save-keys-btn');
    const anthropicKey = document.getElementById('key-anthropic').value.trim();
    const geminiKey    = document.getElementById('key-gemini').value.trim();
    const deepseekKey  = document.getElementById('key-deepseek').value.trim();

    btn.disabled = true;
    btn.textContent = '💾 Saving…';
    try {
      const res  = await fetch('/api/config', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ anthropicKey, geminiKey, deepseekKey }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');

      document.getElementById('key-anthropic').value = '';
      document.getElementById('key-gemini').value    = '';
      document.getElementById('key-deepseek').value  = '';

      await this.loadSettings();
      this.showToast('API keys saved!', 'success');
    } catch (e) {
      this.showToast(`Save failed: ${e.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Save Keys';
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.vortexUI = new VortexDQUI();

  // Auto-connect health check
  setInterval(async () => {
    try {
      await fetch('/api/health');
    } catch (error) {
      console.warn('Server unreachable');
    }
  }, 10000);
});
