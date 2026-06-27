// VortexDQ AI Controller - Frontend
class VortexDQUI {
  constructor() {
    this.chatMessages    = document.getElementById('chatMessages');
    this.userInput       = document.getElementById('userInput');
    this.chatForm        = document.getElementById('chatForm');
    this.sendBtn         = document.getElementById('sendBtn');
    this.enhanceCheckbox = document.getElementById('enhanceCheckbox');
    this.modelBadge      = document.getElementById('modelBadge');
    this.toastContainer  = document.getElementById('toastContainer');
    this.loadingSpinner  = document.getElementById('loadingSpinner');

    this.activeModel   = 'claude';
    this.chatHistory   = [];
    this.pluginOnline  = false;
    this.currentGame   = null;
    this._ws           = null;

    this.initEventListeners();
    this.loadModels();
    this.loadStats();
    this.loadErrors();
    this.loadConnections();
    this.checkApiKeys();
    this._connectWebSocket();

    setInterval(() => this.loadStats(),       5000);
    setInterval(() => this.loadConnections(), 3000);
    setInterval(() => this.loadErrors(),      8000);
    setInterval(() => this._pollHealth(),     4000);
  }

  // ── WebSocket for real-time plugin events ──────────────────────────────────
  _connectWebSocket() {
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${location.port || 7777}`);
      this._ws = ws;

      ws.onopen = () => console.log('[WS] Connected to server');

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          this._handleServerMessage(msg);
        } catch (_) {}
      };

      ws.onclose = () => {
        this._ws = null;
        // Reconnect after 5s
        setTimeout(() => this._connectWebSocket(), 5000);
      };
    } catch (_) {}
  }

  _handleServerMessage(msg) {
    switch (msg.type) {
      case 'initialState':
        this._setPluginStatus(msg.plugin);
        if (msg.game) this._updateGameInfo({ placeId: msg.placeId, gameName: msg.game });
        break;

      case 'pluginConnected':
        this._setPluginStatus(true);
        this.showToast('Roblox Studio plugin connected!', 'success');
        break;

      case 'pluginDisconnected':
        this._setPluginStatus(false);
        this._updateGameInfo(null);
        this.showToast('Plugin disconnected from Studio', 'error');
        break;

      case 'gameSwitched':
        this._updateGameInfo({ placeId: msg.newPlaceId, gameName: msg.gameName });
        this.addMessage('ai',
          `🔄 Switched game detected! Now editing: ${msg.gameName || 'Place ' + msg.newPlaceId}`,
          'info'
        );
        this.showToast(`Game switched → ${msg.gameName || msg.newPlaceId}`, 'info');
        break;

      case 'gameNameUpdated':
        this._updateGameInfo({ gameName: msg.gameName });
        break;
    }
  }

  // ── Plugin / game status helpers ───────────────────────────────────────────
  _setPluginStatus(online) {
    this.pluginOnline = online;

    // Sidebar dot on Plugin nav item
    const dot  = document.querySelector('.nav-item[data-tab="plugins"] .icon');
    // Input area dot
    const pdot = document.getElementById('pluginDot');

    const statusDot  = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const desc       = document.getElementById('statusDescription');

    if (online) {
      if (pdot)       { pdot.className = 'plugin-dot connected'; pdot.title = 'Plugin connected'; }
      if (statusDot)  statusDot.className  = 'status-dot connected';
      if (statusText) statusText.textContent = 'Connected';
      if (desc)       desc.textContent = 'Plugin is active. Commands will execute in Roblox Studio.';
    } else {
      if (pdot)       { pdot.className = 'plugin-dot disconnected'; pdot.title = 'Plugin disconnected'; }
      if (statusDot)  statusDot.className  = 'status-dot disconnected';
      if (statusText) statusText.textContent = 'Disconnected';
      if (desc)       desc.textContent = 'Plugin not detected. Make sure Roblox Studio is running and the plugin is installed.';
      document.getElementById('currentGameInfo')?.classList.add('hidden');
    }
  }

  _updateGameInfo(game) {
    this.currentGame = game;
    const banner     = document.getElementById('gameInfoBanner');
    const bannerText = document.getElementById('gameInfoText');
    const gameInfo   = document.getElementById('currentGameInfo');
    const gameDetail = document.getElementById('gameDetails');

    if (game && (game.gameName || game.placeId)) {
      const label = game.gameName || `Place ${game.placeId}`;
      if (banner)     { banner.classList.remove('hidden'); }
      if (bannerText) bannerText.textContent = label;
      if (gameInfo)   gameInfo.classList.remove('hidden');
      if (gameDetail) gameDetail.innerHTML = `
        <div class="game-detail-row"><span>Name</span><span>${game.gameName || '—'}</span></div>
        <div class="game-detail-row"><span>Place ID</span><span>${game.placeId || '—'}</span></div>
      `;
    } else {
      if (banner)   banner.classList.add('hidden');
      if (gameInfo) gameInfo.classList.add('hidden');
    }
  }

  async _pollHealth() {
    try {
      const res  = await fetch('/api/health');
      const data = await res.json();
      this._setPluginStatus(data.pluginOnline);
      if (data.currentGame) this._updateGameInfo(data.currentGame);
    } catch (_) {}
  }

  // ── Event listeners ────────────────────────────────────────────────────────
  initEventListeners() {
    this.chatForm.addEventListener('submit', (e) => this.handleSendMessage(e));
    this.userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) this.chatForm.dispatchEvent(new Event('submit'));
    });

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.currentTarget));
    });

    document.addEventListener('click', (e) => {
      const card = e.target.closest('.model-card');
      if (card && card.dataset.model) this.switchModel(card.dataset.model);
    });

    document.getElementById('clearChat').addEventListener('click', () => this.clearChat());
    document.getElementById('exportErrors').addEventListener('click', () => this.exportErrors());
    document.getElementById('clearErrors').addEventListener('click', () => this.clearErrors());
    document.getElementById('save-keys-btn').addEventListener('click', () => this.saveSettings());
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  async handleSendMessage(e) {
    e.preventDefault();
    const prompt = this.userInput.value.trim();
    if (!prompt) return;

    if (prompt.toLowerCase().startsWith('/analyze')) {
      this.userInput.value = '';
      return this.analyzeGame(prompt.toLowerCase().includes('deep'));
    }
    if (prompt.toLowerCase().startsWith('/scan')) {
      this.userInput.value = '';
      return this.scanGame();
    }

    this.addMessage('user', prompt);
    this.userInput.value = '';
    this.setLoading(true);
    this.sendBtn.disabled = true;

    try {
      const response = await fetch('/api/execute', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          prompt,
          model:   this.activeModel,
          enhance: this.enhanceCheckbox.checked,
          history: this.chatHistory.slice(-6),
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      // Plugin was offline — commands generated but not sent
      if (data.pluginOffline) {
        const aiMsg = data.message || 'I generated the commands but Roblox Studio isn\'t connected. Open Studio with the VortexDQ plugin active, then try again.';
        this.addMessage('ai', aiMsg, 'warning',
          `⚠️ ${data.analysis?.commandCount ?? data.commands?.length ?? 0} commands ready — plugin offline`
        );
        this.showToast('Plugin offline — commands not sent to Studio', 'error');
      } else if (data.success) {
        const analysis = data.analysis || {};
        const cmdCount = analysis.commandCount ?? data.commands?.length ?? 0;
        const ok       = (data.results || []).filter(r => r.success).length;
        const tot      = (data.results || []).length;
        const aiMsg    = data.message || `Applied ${cmdCount} command${cmdCount !== 1 ? 's' : ''}.`;
        const meta     = cmdCount > 0
          ? `✓ ${cmdCount} cmd${cmdCount !== 1 ? 's' : ''} · ${analysis.executionTime || ''} · ${ok}/${tot} ok · ${analysis.complexity || ''}`
          : null;

        this.addMessage('ai', aiMsg, 'success', meta);
        if (cmdCount > 0) this.showToast(`${cmdCount} command${cmdCount !== 1 ? 's' : ''} applied to Studio`, 'success');
      } else {
        throw new Error(data.error || 'Execution failed');
      }

      // Push to chat history for context
      this.chatHistory.push({ role: 'user',      content: prompt });
      this.chatHistory.push({ role: 'assistant', content: data.message || '' });
      if (this.chatHistory.length > 20) this.chatHistory = this.chatHistory.slice(-20);

    } catch (error) {
      this.addMessage('ai', `Error: ${error.message}`, 'error');
      this.showToast(error.message, 'error');
    } finally {
      this.setLoading(false);
      this.sendBtn.disabled = false;
    }
  }

  async analyzeGame(deep = false) {
    this.addMessage('user', deep ? '/analyze deep' : '/analyze');
    this.setLoading(true);
    try {
      const response = await fetch('/api/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ deep }),
      });
      const data = await response.json();

      if (!data.success) {
        this.addMessage('ai', `Analysis failed: ${data.error}`, 'error');
        return;
      }

      const a   = data.analysis;
      const msg = `📊 Game Analysis\n\nInstances: ${a.stats?.totalInstances ?? '?'}\nComplexity: ${a.stats?.complexity ?? '?'}\nDepth: ${a.stats?.depth ?? '?'} levels\n\nSuggestions:\n${(a.suggestions || []).map(s => `• ${s.message || s}`).join('\n')}\n\nTry:\n${(a.examples || []).map(ex => `• "${ex}"`).join('\n')}`;
      this.addMessage('ai', msg, 'success');
      this.showToast('Game analyzed', 'success');
    } catch (error) {
      this.addMessage('ai', `Analysis error: ${error.message}`, 'error');
    } finally {
      this.setLoading(false);
    }
  }

  async scanGame() {
    this.addMessage('user', '/scan');
    this.setLoading(true);
    try {
      const response = await fetch('/api/scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      });
      const data = await response.json();

      if (!data.success) {
        this.addMessage('ai', `Scan failed: ${data.error}`, 'error');
        return;
      }

      const report = data.report;
      let msg = `🔍 Security Scan — ${(report.status || 'unknown').toUpperCase()}\n\n${report.summary || ''}\n`;

      if (report.details && report.details.length > 0) {
        report.details.forEach(detail => {
          msg += `\n${detail.category}\n`;
          (detail.items || []).forEach(item => {
            msg += `  • ${item.location}: ${item.issue}\n    → ${item.suggestion}\n`;
          });
        });
      }

      this.addMessage('ai', msg, report.status === 'clean' ? 'success' : 'warning');
      this.showToast('Scan complete', report.status === 'clean' ? 'success' : 'warning');
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
    // Preserve newlines
    text.style.whiteSpace = 'pre-wrap';
    text.textContent = content;
    contentDiv.appendChild(text);

    if (meta) {
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

  // ── Models ─────────────────────────────────────────────────────────────────
  async loadModels() {
    try {
      const response = await fetch('/api/models');
      const data     = await response.json();

      this.modelBadge.textContent = data.active;
      this.activeModel = data.active;

      const grid = document.getElementById('modelsGrid');
      grid.innerHTML = '';

      data.available.forEach(model => {
        const card = document.createElement('div');
        card.className = `model-card ${model.active ? 'active' : ''} ${model.enabled ? '' : 'disabled'}`;
        card.dataset.model = model.name;

        card.innerHTML = `
          <div class="model-name">${model.label || model.name}</div>
          <div class="model-tag">${model.cost}</div>
          <div class="model-stats">
            <div class="model-stat"><span>Speed</span><span>${Math.round(model.speed * 100)}%</span></div>
            <div class="model-stat"><span>Quality</span><span>${Math.round(model.quality * 100)}%</span></div>
          </div>
          ${!model.enabled ? '<div class="model-locked">🔒 Set API key in Settings</div>' : ''}
        `;

        grid.appendChild(card);
      });

      const tbody = document.getElementById('modelTable');
      tbody.innerHTML = '';
      data.available.forEach(model => {
        const row = document.createElement('tr');
        row.style.opacity = model.enabled ? '1' : '0.45';
        row.innerHTML = `
          <td><strong>${model.label || model.name}</strong>${model.active ? ' ✓' : ''}</td>
          <td>${Math.round(model.speed * 100)}%</td>
          <td>${Math.round(model.quality * 100)}%</td>
          <td>${model.cost}</td>
          <td>${model.enabled ? '✅ Ready' : '🔒 No key'}</td>
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
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model: modelName }),
      });
      const data = await response.json();
      if (data.success) {
        this.activeModel = modelName;
        this.modelBadge.textContent = modelName;
        this.loadModels();
        this.showToast(`Switched to ${modelName}`, 'success');
      } else {
        this.showToast(data.error || 'Cannot switch model', 'error');
      }
    } catch (error) {
      this.showToast(`Error: ${error.message}`, 'error');
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  async loadStats() {
    try {
      const response = await fetch('/api/stats');
      const data     = await response.json();
      const se       = data.smartExecutor;

      document.getElementById('totalExecutions').textContent = se.totalExecutions;
      document.getElementById('successRate').textContent     = se.successRate;
      document.getElementById('avgCommands').textContent     = se.avgCommandsPerExecution ?? 0;
      const avgDurEl = document.getElementById('avgDuration');
      if (avgDurEl) avgDurEl.textContent = se.avgDuration;
      document.getElementById('activeConnections').textContent = data.connections;

      const execList = document.getElementById('recentExecList');
      execList.innerHTML = '';
      (se.recentExecutions || []).slice(-5).reverse().forEach(exec => {
        const item = document.createElement('div');
        item.className = 'execution-item';
        item.innerHTML = `
          <div>
            <div>${exec.commandCount} command${exec.commandCount !== 1 ? 's' : ''}</div>
            <div class="execution-time">${new Date(exec.ts).toLocaleTimeString()}</div>
          </div>
          <div class="${exec.failed === 0 ? 'exec-ok' : 'exec-fail'}">${exec.succeeded}/${exec.commandCount} ok · ${exec.duration}ms</div>
        `;
        execList.appendChild(item);
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  // ── Errors ─────────────────────────────────────────────────────────────────
  async loadErrors() {
    try {
      const response = await fetch('/api/errors');
      const data     = await response.json();

      document.getElementById('totalErrors').textContent   = data.totalErrors;
      document.getElementById('fixedErrors').textContent   = data.fixedErrors;
      document.getElementById('unfixedErrors').textContent = data.unfixedErrors;

      document.getElementById('severityCritical').textContent = data.bySeverity.critical;
      document.getElementById('severityHigh').textContent     = data.bySeverity.high;
      document.getElementById('severityMedium').textContent   = data.bySeverity.medium;
      document.getElementById('severityLow').textContent      = data.bySeverity.low;

      // Error badge on nav
      const badge = document.getElementById('errorBadge');
      if (badge) {
        if (data.totalErrors > 0) {
          badge.textContent = data.totalErrors > 99 ? '99+' : data.totalErrors;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }

      const errorsList = document.getElementById('commonErrors');
      errorsList.innerHTML = '';
      if (!data.mostCommon || data.mostCommon.length === 0) {
        errorsList.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:16px">No errors recorded</p>';
      } else {
        data.mostCommon.forEach(err => {
          const item = document.createElement('div');
          item.className = 'error-item';
          item.innerHTML = `
            <div class="error-message">${err.message}</div>
            <div class="error-suggestion">×${err.count}${err.suggestedFix ? ' · Fix: ' + err.suggestedFix : ''}</div>
          `;
          errorsList.appendChild(item);
        });
      }
    } catch (error) {
      console.error('Failed to load errors:', error);
    }
  }

  async clearErrors() {
    if (!confirm('Clear all recorded errors?')) return;
    try {
      await fetch('/api/errors', { method: 'DELETE' });
      await this.loadErrors();
      this.showToast('Errors cleared', 'success');
    } catch (e) {
      this.showToast('Failed to clear errors', 'error');
    }
  }

  // ── Plugin connections ─────────────────────────────────────────────────────
  async loadConnections() {
    try {
      const response = await fetch('/api/status');
      const data     = await response.json();

      const list = document.getElementById('connectionsList');
      this._setPluginStatus(data.pluginOnline);

      if (!data.connections || data.connections.length === 0) {
        list.innerHTML = '<p class="no-connections">No connections yet</p>';
      } else {
        list.innerHTML = '';
        data.connections.forEach(conn => {
          const item     = document.createElement('div');
          item.className = 'connection-item';
          const status   = conn.connected ? '🟢' : '🔴';
          item.innerHTML = `
            <span>${status} ${conn.id}${conn.gameName ? ' — ' + conn.gameName : ''}</span>
            <span style="color:var(--text-secondary);font-size:12px">${new Date(conn.lastUpdate).toLocaleTimeString()}</span>
          `;
          list.appendChild(item);
        });

        if (data.currentGame) this._updateGameInfo(data.currentGame);
      }
    } catch (error) {
      console.error('Failed to load connections:', error);
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  switchTab(btn) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tabName = btn.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');

    if (tabName === 'settings') this.loadSettings();
    if (tabName === 'errors')   this.loadErrors();
    if (tabName === 'stats')    this.loadStats();
    if (tabName === 'models')   this.loadModels();
    if (tabName === 'plugins')  this.loadConnections();
  }

  clearChat() {
    if (confirm('Clear all chat messages?')) {
      this.chatMessages.innerHTML = '';
      this.chatHistory = [];
      this.showToast('Chat cleared', 'info');
    }
  }

  // ── Export errors ──────────────────────────────────────────────────────────
  async exportErrors() {
    try {
      const response = await fetch('/api/errors/export?format=csv');
      const csv      = await response.text();
      const blob     = new Blob([csv], { type: 'text/csv' });
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href = url; a.download = `errors-${Date.now()}.csv`; a.click();
      this.showToast('Errors exported', 'success');
    } catch (error) {
      this.showToast(`Export failed: ${error.message}`, 'error');
    }
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = `${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ'} ${message}`;
    this.toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
  }

  setLoading(active) {
    this.loadingSpinner.classList.toggle('active', active);
  }

  // ── Settings / API keys ────────────────────────────────────────────────────
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
    document.getElementById('no-key-banner')?.classList.toggle('hidden', anyKey);
    document.getElementById('key-badge')?.classList.toggle('hidden', anyKey);
  }

  async saveSettings() {
    const btn          = document.getElementById('save-keys-btn');
    const anthropicKey = document.getElementById('key-anthropic').value.trim();
    const geminiKey    = document.getElementById('key-gemini').value.trim();
    const deepseekKey  = document.getElementById('key-deepseek').value.trim();

    btn.disabled    = true;
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
      await this.loadModels();
      this.showToast('API keys saved!', 'success');
    } catch (e) {
      this.showToast(`Save failed: ${e.message}`, 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = '💾 Save Keys';
    }
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  window.vortexUI = new VortexDQUI();
});
