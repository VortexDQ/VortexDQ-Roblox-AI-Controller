'use strict';

class VortexDQ {
  constructor() {
    this.$ = id => document.getElementById(id);
    this.activeModel = null;
    this.isLoading   = false;
    this.enhanced    = true;

    this._bind();
    this._refresh();
    setInterval(() => this._refresh(), 4000);
    setInterval(() => this._pollPlugin(), 3000);
  }

  // ── DOM wiring ────────────────────────────────────────────────

  _bind() {
    document.querySelectorAll('.nav-btn').forEach(btn =>
      btn.addEventListener('click', () => this._switchTab(btn))
    );

    this.$('chatForm').addEventListener('submit', e => { e.preventDefault(); this._send(); });

    this.$('userInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); this._send(); }
      setTimeout(() => {
        const el = this.$('userInput');
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 160) + 'px';
      });
    });

    this.$('enhanceToggle').addEventListener('change', e => { this.enhanced = e.target.checked; });
    this.$('clearChatBtn').addEventListener('click', () => {
      if (confirm('Clear all messages?')) this.$('messages').innerHTML = '';
    });
    this.$('exportBtn').addEventListener('click', () => this._exportErrors());

    this.$('models-grid').addEventListener('click', e => {
      const card = e.target.closest('.model-card');
      if (card) this._setModel(card.dataset.model);
    });
  }

  // ── Tab switching ─────────────────────────────────────────────

  _switchTab(btn) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const id = btn.dataset.tab;
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + id).classList.add('active');
    if (id === 'models') this._loadModels();
    if (id === 'stats')  this._loadStats();
    if (id === 'errors') this._loadErrors();
  }

  // ── Send message ──────────────────────────────────────────────

  async _send() {
    const input = this.$('userInput');
    const text  = input.value.trim();
    if (!text || this.isLoading) return;

    input.value = '';
    input.style.height = 'auto';
    this._addMsg('user', text);
    const typing = this._addTyping();
    this._setLoading(true);

    try {
      const res  = await fetch('/api/execute', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt: text, model: this.activeModel, enhance: this.enhanced }),
      });
      const data = await res.json();
      typing.remove();

      if (!res.ok || !data.success) throw new Error(data.error || 'HTTP ' + res.status);

      const a     = data.analysis || {};
      const ok    = (data.results || []).filter(r => r.success).length;
      const total = (data.results || []).length;
      const reply =
        'Executed ' + (a.commandCount || total) + ' command' + ((a.commandCount || total) !== 1 ? 's' : '') +
        ' in ' + (a.executionTime || '?') + '\n' +
        'Types: ' + (a.types || []).join(', ') + '\n' +
        'Complexity: ' + (a.complexity || '?') + '  |  ' +
        'Success: ' + ok + '/' + total;

      this._addMsg('ai', reply, 'success');
      this._toast((a.commandCount || total) + ' commands applied', 'success');
    } catch (err) {
      typing.remove();
      this._addMsg('ai', 'Error: ' + err.message, 'error');
      this._toast(err.message, 'error');
    } finally {
      this._setLoading(false);
    }
  }

  // ── Messages ──────────────────────────────────────────────────

  _addMsg(role, text, type) {
    const box    = this.$('messages');
    const div    = document.createElement('div');
    div.className = 'msg ' + role;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = role === 'user' ? '\u{1F464}' : '\u{1F916}';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble' + (type ? ' ' + type : '');
    bubble.textContent = text;

    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const inner = document.createElement('div');
    inner.appendChild(bubble);
    inner.appendChild(time);
    div.appendChild(avatar);
    div.appendChild(inner);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  _addTyping() {
    const box = this.$('messages');
    const div = document.createElement('div');
    div.className = 'msg ai';
    div.innerHTML =
      '<div class="msg-avatar">\u{1F916}</div>' +
      '<div class="msg-bubble" style="padding:14px 16px;">' +
      '<span class="typing-dot"></span>' +
      '<span class="typing-dot"></span>' +
      '<span class="typing-dot"></span>' +
      '</div>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  // ── Models ────────────────────────────────────────────────────

  async _loadModels() {
    try {
      const res  = await fetch('/api/models');
      const data = await res.json();
      this.activeModel = data.active;
      this.$('activeBadge').textContent = data.active || '—';

      const grid = this.$('models-grid');
      grid.innerHTML = '';

      (data.available || []).forEach(m => {
        const card = document.createElement('div');
        card.className   = 'model-card' + (m.active ? ' active' : '');
        card.dataset.model = m.name;
        card.innerHTML =
          '<div class="model-name">' + m.name +
          (m.active ? '<span class="model-badge-active">Active</span>' : '') +
          '</div>' +
          '<div class="model-row"><span>Speed</span>' +
          '<div class="model-bar-bg"><div class="model-bar-fill" style="width:' + Math.round(m.speed * 100) + '%"></div></div>' +
          '<span>' + Math.round(m.speed * 100) + '%</span></div>' +
          '<div class="model-row"><span>Quality</span>' +
          '<div class="model-bar-bg"><div class="model-bar-fill" style="width:' + Math.round(m.quality * 100) + '%"></div></div>' +
          '<span>' + Math.round(m.quality * 100) + '%</span></div>' +
          '<div class="model-cost">' + m.cost + '</div>';
        grid.appendChild(card);
      });
    } catch (e) {
      console.error('[UI] loadModels:', e);
    }
  }

  async _setModel(name) {
    try {
      const res  = await fetch('/api/models/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name }),
      });
      const data = await res.json();
      if (data.success) {
        this.activeModel = name;
        this.$('activeBadge').textContent = name;
        this._loadModels();
        this._toast('Switched to ' + name, 'success');
      }
    } catch (e) {
      this._toast('Switch failed: ' + e.message, 'error');
    }
  }

  // ── Stats ─────────────────────────────────────────────────────

  async _loadStats() {
    try {
      const res  = await fetch('/api/stats');
      const data = await res.json();
      const se   = data.smartExecutor || {};

      this.$('s-executions').textContent = se.totalExecutions ?? 0;
      this.$('s-success').textContent    = se.successRate     ?? '—';
      this.$('s-duration').textContent   = se.avgDuration     ?? '—';
      this.$('s-plugin').textContent     = data.connections > 0 ? 'Online' : 'Offline';

      const list = this.$('recent-exec');
      list.innerHTML = '';
      (se.recentExecutions || []).slice(-8).reverse().forEach(e => {
        const row  = document.createElement('div');
        row.className = 'exec-row';
        const ok   = e.succeeded   ?? e.successCount ?? 0;
        const tot  = e.commandCount ?? 0;
        const fail = tot - ok;
        row.innerHTML =
          '<span>' + tot + ' cmd' + (tot !== 1 ? 's' : '') + '</span>' +
          '<span class="exec-ok">' + ok + ' ok</span>' +
          (fail ? '<span class="exec-fail">' + fail + ' fail</span>' : '') +
          '<span class="exec-time">' + new Date(e.ts || e.timestamp).toLocaleTimeString() + '</span>';
        list.appendChild(row);
      });
    } catch (e) {
      console.error('[UI] loadStats:', e);
    }
  }

  // ── Errors ────────────────────────────────────────────────────

  async _loadErrors() {
    try {
      const res  = await fetch('/api/errors');
      const data = await res.json();

      this.$('e-total').textContent    = data.totalErrors        ?? 0;
      this.$('e-fixed').textContent    = data.fixedErrors        ?? 0;
      this.$('e-unfixed').textContent  = data.unfixedErrors      ?? 0;
      this.$('e-critical').textContent = data.bySeverity?.critical ?? 0;

      const list  = this.$('error-list');
      list.innerHTML = '';
      const items = data.mostCommon || [];

      if (!items.length) {
        list.innerHTML = '<div style="color:var(--text3);text-align:center;padding:32px;">No errors recorded</div>';
        return;
      }

      items.forEach(err => {
        const sev = (data.recentErrors || []).find(e => e.message === err.message)?.severity || '';
        const div = document.createElement('div');
        div.className = 'err-item sev-' + sev;
        div.innerHTML =
          '<div class="err-msg">'  + this._esc(err.message) + '</div>' +
          '<div class="err-meta">Occurrences: ' + err.count + '</div>' +
          (err.suggestedFix ? '<div class="err-fix">Fix: ' + this._esc(err.suggestedFix) + '</div>' : '');
        list.appendChild(div);
      });
    } catch (e) {
      console.error('[UI] loadErrors:', e);
    }
  }

  async _exportErrors() {
    try {
      const res = await fetch('/api/errors/export?format=csv');
      const csv = await res.text();
      const a   = document.createElement('a');
      a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'vortexdq-errors-' + Date.now() + '.csv';
      a.click();
      this._toast('Errors exported', 'success');
    } catch (e) {
      this._toast('Export failed: ' + e.message, 'error');
    }
  }

  // ── Plugin status ─────────────────────────────────────────────

  async _pollPlugin() {
    try {
      const res  = await fetch('/api/status');
      const data = await res.json();
      const ok   = (data.connections || []).some(c => c.connected);
      document.querySelector('.pill-dot').className = 'pill-dot ' + (ok ? 'online' : 'offline');
      this.$('pluginStatus').textContent = ok ? 'Plugin Online' : 'Plugin Offline';
    } catch (_) {
      document.querySelector('.pill-dot').className = 'pill-dot offline';
      this.$('pluginStatus').textContent = 'Server Offline';
    }
  }

  // ── Initial refresh ───────────────────────────────────────────

  async _refresh() {
    try {
      const res  = await fetch('/api/models');
      if (!res.ok) return;
      const data = await res.json();
      this.activeModel = data.active;
      this.$('activeBadge').textContent = data.active || '—';
    } catch (_) {}
  }

  // ── Utilities ─────────────────────────────────────────────────

  _setLoading(active) {
    this.isLoading = active;
    this.$('spinner').hidden   = !active;
    this.$('sendBtn').disabled = active;
  }

  _toast(msg, type) {
    type = type || 'info';
    const t    = document.createElement('div');
    t.className = 'toast ' + type;
    const icon  = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
    t.textContent = icon + '  ' + msg;
    this.$('toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 280); }, 3000);
  }

  _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

document.addEventListener('DOMContentLoaded', () => { window._vdq = new VortexDQ(); });
