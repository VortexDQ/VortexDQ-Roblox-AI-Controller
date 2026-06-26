'use strict';

class VortexDQ {
  constructor() {
    this.$ = id => document.getElementById(id);
    this.activeModel = null;
    this.isLoading   = false;
    this.enhanced    = true;
    this.msgCount    = 0;

    this._bindNav();
    this._bindChat();
    this._bindMisc();
    this._pollPlugin();
    this._refresh();
    setInterval(() => this._pollPlugin(), 3000);
    setInterval(() => this._refresh(), 6000);
  }

  /* ─── Navigation ─────────────────────────────────────────── */

  _bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const id = btn.dataset.tab;
        document.querySelectorAll('.tab-pane').forEach(p => {
          p.classList.remove('active');
          p.classList.add('hidden');
        });
        const pane = document.getElementById('tab-' + id);
        pane.classList.remove('hidden');
        pane.classList.add('active');
        if (id === 'models') this._loadModels();
        if (id === 'stats')  this._loadStats();
        if (id === 'errors') this._loadErrors();
      });
    });
  }

  /* ─── Chat ───────────────────────────────────────────────── */

  _bindChat() {
    const form  = this.$('chatForm');
    const input = this.$('userInput');

    form.addEventListener('submit', e => { e.preventDefault(); this._send(); });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); this._send(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 144) + 'px';
    });

    this.$('enhanceToggle').addEventListener('change', e => {
      this.enhanced = e.target.checked;
    });

    // Quick-prompt chips
    document.querySelectorAll('.quick-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.dataset.p;
        input.dispatchEvent(new Event('input'));
        input.focus();
      });
    });
  }

  _bindMisc() {
    this.$('clearChatBtn').addEventListener('click', () => {
      if (confirm('Clear all messages?')) {
        this.$('messages').innerHTML = '';
        this.msgCount = 0;
        this._updateChatBadge();
      }
    });
    this.$('exportBtn').addEventListener('click', () => this._exportErrors());
  }

  async _send() {
    const input = this.$('userInput');
    const text  = input.value.trim();
    if (!text || this.isLoading) return;

    input.value = '';
    input.style.height = 'auto';

    // Hide quick chips after first message
    const chips = this.$('quick-prompts');
    if (chips) { chips.style.opacity = '0'; setTimeout(() => chips.remove(), 300); }

    this._addMsg('user', text);
    const typing = this._addTyping();
    this._setLoading(true, 'Generating commands…');

    try {
      const res  = await fetch('/api/execute', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt: text, model: this.activeModel, enhance: this.enhanced }),
      });
      const data = await res.json();
      typing.remove();

      if (!res.ok || !data.success) throw new Error(data.error || 'HTTP ' + res.status);

      const a   = data.analysis || {};
      const ok  = (data.results || []).filter(r => r.success).length;
      const tot = (data.results || []).length;

      const reply =
        '✦ Applied ' + (a.commandCount || tot) + ' command' + ((a.commandCount || tot) !== 1 ? 's' : '') +
        ' in ' + (a.executionTime || '?') + '\n' +
        '  Types: ' + (a.types || []).join(', ') + '\n' +
        '  Complexity: ' + (a.complexity || '?') + '  ·  Success: ' + ok + '/' + tot;

      this._addMsg('ai', reply, 'success');
      this._toast('✓  ' + (a.commandCount || tot) + ' commands applied', 'success');
      this.$('lastExecInfo').textContent = (a.executionTime || '?') + ' · ' + ok + '/' + tot + ' ok';
      this.$('lastExecInfo').classList.remove('hidden');
    } catch (err) {
      typing.remove();
      this._addMsg('ai', '✕ ' + err.message, 'error');
      this._toast(err.message, 'error');
    } finally {
      this._setLoading(false);
    }
  }

  /* ─── Message rendering ───────────────────────────────────── */

  _addMsg(role, text, type) {
    const box = this.$('messages');
    const div = document.createElement('div');
    div.className = 'msg ' + role;

    const av = document.createElement('div');
    av.className = 'msg-avatar';
    av.textContent = role === 'user' ? '👤' : '🤖';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble' + (type ? ' ' + type : '');
    bubble.textContent = text;

    const ts = document.createElement('div');
    ts.className = 'msg-time';
    ts.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const inner = document.createElement('div');
    inner.className = 'msg-inner';
    inner.appendChild(bubble);
    inner.appendChild(ts);

    div.appendChild(av);
    div.appendChild(inner);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;

    this.msgCount++;
    this._updateChatBadge();
    return div;
  }

  _addTyping() {
    const box = this.$('messages');
    const div = document.createElement('div');
    div.className = 'msg ai';
    div.innerHTML =
      '<div class="msg-avatar">🤖</div>' +
      '<div class="msg-inner"><div class="msg-bubble"><div class="typing-dots">' +
      '<span></span><span></span><span></span></div></div></div>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  _updateChatBadge() {
    const b = this.$('chat-badge');
    if (!b) return;
    if (this.msgCount > 0) {
      b.textContent = this.msgCount;
      b.className = 'text-[10px] bg-accent/20 text-accent-light border border-accent/30 rounded-full px-1.5 py-0.5';
    } else {
      b.textContent = '';
    }
  }

  /* ─── Models ──────────────────────────────────────────────── */

  async _loadModels() {
    const grid = this.$('models-grid');
    // Skeleton
    grid.innerHTML = Array(4).fill(
      '<div class="model-card"><div class="shimmer h-4 w-24 mb-4"></div>' +
      '<div class="shimmer h-2 w-full mb-2"></div><div class="shimmer h-2 w-3/4"></div></div>'
    ).join('');

    try {
      const res  = await fetch('/api/models');
      const data = await res.json();
      this.activeModel = data.active;
      this.$('activeBadge').textContent = data.active || '—';

      grid.innerHTML = '';
      (data.available || []).forEach((m, i) => {
        const card = document.createElement('div');
        card.className = 'model-card' + (m.active ? ' active' : '');
        card.dataset.model = m.name;
        card.style.animationDelay = (i * 60) + 'ms';
        card.style.animation = 'slideUp .4s cubic-bezier(.16,1,.3,1) forwards';
        card.style.opacity = '0';
        card.innerHTML =
          '<div class="model-name">' + m.name +
          (m.active ? '<span class="active-badge">● Active</span>' : '') +
          '</div>' +
          '<div class="model-stat"><span style="min-width:42px">Speed</span>' +
          '<div class="model-bar-bg"><div class="model-bar-fill" style="width:' + Math.round(m.speed * 100) + '%"></div></div>' +
          '<span>' + Math.round(m.speed * 100) + '%</span></div>' +
          '<div class="model-stat"><span style="min-width:42px">Quality</span>' +
          '<div class="model-bar-bg"><div class="model-bar-fill" style="width:' + Math.round(m.quality * 100) + '%"></div></div>' +
          '<span>' + Math.round(m.quality * 100) + '%</span></div>' +
          '<div class="model-cost">' + m.cost + '</div>';
        setTimeout(() => { card.style.opacity = '1'; }, i * 60);
        grid.appendChild(card);
      });

      grid.addEventListener('click', e => {
        const card = e.target.closest('.model-card');
        if (card) this._setModel(card.dataset.model);
      }, { once: true });
      // Re-bind after reload
      grid.onclick = e => {
        const card = e.target.closest('.model-card');
        if (card) this._setModel(card.dataset.model);
      };
    } catch (e) {
      grid.innerHTML = '<div class="text-sm text-white/30 p-4">Failed to load models</div>';
    }
  }

  async _setModel(name) {
    try {
      const res  = await fetch('/api/models/set', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ model: name }),
      });
      const data = await res.json();
      if (data.success) {
        this.activeModel = name;
        this.$('activeBadge').textContent = name;
        this._loadModels();
        this._toast('⬡  Switched to ' + name, 'success');
      }
    } catch (e) {
      this._toast('Switch failed', 'error');
    }
  }

  /* ─── Stats ───────────────────────────────────────────────── */

  async _loadStats() {
    try {
      const res  = await fetch('/api/stats');
      const data = await res.json();
      const se   = data.smartExecutor || {};

      this._animNum('s-executions', parseInt(se.totalExecutions) || 0);
      this.$('s-success').textContent  = se.successRate  || '—';
      this.$('s-duration').textContent = se.avgDuration  || '—';
      this.$('s-plugin').textContent   = data.connections > 0 ? 'Online' : 'Offline';
      if (data.connections > 0) {
        this.$('s-plugin').style.color = '#22c55e';
      }

      const list = this.$('recent-exec');
      list.innerHTML = '';
      (se.recentExecutions || []).slice(-8).reverse().forEach((e, i) => {
        const row  = document.createElement('div');
        row.className = 'exec-row';
        row.style.animationDelay = (i * 40) + 'ms';
        const ok   = e.succeeded   ?? e.successCount ?? 0;
        const tot  = e.commandCount ?? 0;
        const fail = tot - ok;
        row.innerHTML =
          '<span class="text-white/50">' + new Date(e.ts || e.timestamp).toLocaleTimeString() + '</span>' +
          '<span class="flex-1 text-white/80">' + tot + ' cmd' + (tot !== 1 ? 's' : '') + '</span>' +
          '<span class="text-ok font-semibold">' + ok + ' ok</span>' +
          (fail ? '<span class="text-bad font-semibold">' + fail + ' fail</span>' : '');
        list.appendChild(row);
      });
      if (!se.recentExecutions || !se.recentExecutions.length) {
        list.innerHTML = '<div class="text-sm text-white/20 text-center py-8">No executions yet</div>';
      }
    } catch (e) {
      console.error('[UI] loadStats:', e);
    }
  }

  _animNum(id, target) {
    const el  = this.$(id);
    const cur = parseInt(el.textContent) || 0;
    if (cur === target) return;
    const step = Math.ceil(Math.abs(target - cur) / 20);
    let   val  = cur;
    const tick = setInterval(() => {
      val = val < target ? Math.min(val + step, target) : Math.max(val - step, target);
      el.textContent = val;
      if (val === target) clearInterval(tick);
    }, 30);
  }

  /* ─── Errors ──────────────────────────────────────────────── */

  async _loadErrors() {
    try {
      const res  = await fetch('/api/errors');
      const data = await res.json();

      this.$('e-total').textContent    = data.totalErrors          ?? 0;
      this.$('e-fixed').textContent    = data.fixedErrors          ?? 0;
      this.$('e-unfixed').textContent  = data.unfixedErrors        ?? 0;
      this.$('e-critical').textContent = data.bySeverity?.critical ?? 0;

      const badge = this.$('err-count-badge');
      const crit  = data.bySeverity?.critical ?? 0;
      if (crit > 0) {
        badge.textContent = crit;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }

      const list  = this.$('error-list');
      list.innerHTML = '';
      const items = data.mostCommon || [];
      if (!items.length) {
        list.innerHTML = '<div class="text-sm text-white/20 text-center py-12">No errors recorded — all clear ✓</div>';
        return;
      }
      items.forEach((err, i) => {
        const sev = (data.recentErrors || []).find(e => e.message === err.message)?.severity || '';
        const div = document.createElement('div');
        div.className = 'err-item sev-' + sev;
        div.style.animationDelay = (i * 50) + 'ms';
        div.innerHTML =
          '<div class="err-msg">' + this._esc(err.message) + '</div>' +
          '<div class="err-meta">× ' + err.count + ' occurrence' + (err.count !== 1 ? 's' : '') + '</div>' +
          (err.suggestedFix ? '<div class="err-fix">→ ' + this._esc(err.suggestedFix) + '</div>' : '');
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
      this._toast('↓  Errors exported', 'success');
    } catch (e) {
      this._toast('Export failed', 'error');
    }
  }

  /* ─── Plugin status ───────────────────────────────────────── */

  async _pollPlugin() {
    try {
      const res  = await fetch('/api/status');
      const data = await res.json();
      const conn = (data.connections || []).find(c => c.connected);
      const dot  = this.$('pluginDot');
      const lbl  = this.$('pluginLabel');
      const ping = this.$('pingBadge');

      if (conn) {
        dot.className = 'w-2 h-2 rounded-full bg-ok online transition-all duration-500';
        lbl.textContent = 'Plugin Online';
        lbl.style.color = 'rgba(255,255,255,.7)';
        if (conn.lastUpdate) {
          const ms = Date.now() - new Date(conn.lastUpdate).getTime();
          ping.textContent = ms < 2000 ? ms + 'ms' : '';
          ping.classList.toggle('hidden', ms >= 2000);
        }
      } else {
        dot.className = 'w-2 h-2 rounded-full bg-bad transition-all duration-500';
        lbl.textContent = 'Plugin Offline';
        lbl.style.color = '';
        ping.classList.add('hidden');
      }
    } catch (_) {
      this.$('pluginDot').className = 'w-2 h-2 rounded-full bg-bad/60 transition-all duration-500';
      this.$('pluginLabel').textContent = 'Server Offline';
    }
  }

  /* ─── Initial refresh ─────────────────────────────────────── */

  async _refresh() {
    try {
      const res  = await fetch('/api/models');
      if (!res.ok) return;
      const data = await res.json();
      this.activeModel = data.active;
      this.$('activeBadge').textContent = data.active || '—';
    } catch (_) {}
  }

  /* ─── Utilities ───────────────────────────────────────────── */

  _setLoading(active, msg) {
    this.isLoading = active;
    const spinner = this.$('spinner');
    const btn     = this.$('sendBtn');
    spinner.classList.toggle('hidden', !active);
    btn.disabled = active;
    if (active && msg) {
      const m = this.$('spinnerMsg');
      if (m) m.textContent = msg;
    }
  }

  _toast(msg, type) {
    type = type || 'info';
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const colors = {
      success: 'rgba(34,197,94,.9)',
      error:   'rgba(239,68,68,.9)',
      info:    'rgba(165,180,252,.9)',
    };
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML =
      '<span class="toast-icon" style="color:' + colors[type] + '">' + (icons[type] || 'ℹ') + '</span>' +
      '<span>' + msg + '</span>';
    this.$('toasts').appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      setTimeout(() => t.remove(), 280);
    }, 3200);
  }

  _esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

document.addEventListener('DOMContentLoaded', () => { window._vdq = new VortexDQ(); });
