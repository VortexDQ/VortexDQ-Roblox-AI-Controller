'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY   = 'vdq_sessions';
const MAX_SESSIONS  = 40;
const MAX_HIST_TURN = 8;  // last N conversation turns sent to AI for context

// ─── Utilities ─────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function timeStr(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function dateStr(date) {
  const d = new Date(date);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── SessionStore ──────────────────────────────────────────────────────────────
const SessionStore = {
  load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  },
  save(sessions) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS))); } catch {}
  },
  create(title) {
    const session = { id: uid(), title, messages: [], createdAt: Date.now(), model: null };
    const all = [session, ...this.load()];
    this.save(all);
    return session;
  },
  update(id, messages, model) {
    const all = this.load();
    const idx = all.findIndex(s => s.id === id);
    if (idx !== -1) {
      all[idx].messages = messages;
      if (model) all[idx].model = model;
    }
    this.save(all);
  },
  delete(id) {
    this.save(this.load().filter(s => s.id !== id));
  },
  clear() { localStorage.removeItem(STORAGE_KEY); },
};

// ─── Main App ──────────────────────────────────────────────────────────────────
class App {
  constructor() {
    this.$ = id => document.getElementById(id);

    // State
    this.session   = null;   // current session object
    this.messages  = [];     // [{role, content, ts, result?}]
    this.aiHistory = [];     // [{role, content}] for API context
    this.activeModel = null;
    this.enhanced  = true;
    this.loading   = false;

    this._init();
  }

  async _init() {
    this._renderEmpty();
    this._bindNav();
    this._bindChat();
    this._bindMisc();
    await this._refresh();
    this._pollPlugin();
    setInterval(() => this._pollPlugin(), 3000);
    setInterval(() => this._refresh(), 8000);
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  _bindNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this._goTab(btn.dataset.tab));
    });
  }

  _goTab(tab) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.pane').forEach(p => {
      const match = p.id === 'pane-' + tab;
      p.classList.toggle('active', match);
    });
    if (tab === 'history') this._renderHistory();
    if (tab === 'models')  this._loadModels();
    if (tab === 'stats')   this._loadStats();
    if (tab === 'errors')  this._loadErrors();
  }

  // ─── Chat ───────────────────────────────────────────────────────────────────

  _bindChat() {
    const form  = this.$('chatForm') || { addEventListener: () => {} };
    const input = this.$('user-input');

    this.$('send-btn').addEventListener('click', () => this._send());
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); this._send(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    });

    this.$('enhanceToggle').addEventListener('change', e => { this.enhanced = e.target.checked; });

    document.querySelectorAll('.chip').forEach(c => {
      c.addEventListener('click', () => {
        input.value = c.dataset.p;
        input.dispatchEvent(new Event('input'));
        input.focus();
        // Scroll chips out of view smoothly
        const chips = this.$('chips');
        if (chips) { chips.style.opacity = '0.4'; }
      });
    });

    this.$('new-chat-btn').addEventListener('click', () => this._newChat());
    this.$('clear-btn').addEventListener('click', () => {
      if (this.messages.length === 0) return;
      if (!confirm('Clear this chat?')) return;
      this.messages  = [];
      this.aiHistory = [];
      this._renderMessages();
      if (this.session) SessionStore.update(this.session.id, []);
    });
  }

  _bindMisc() {
    this.$('clear-history-btn').addEventListener('click', () => {
      if (!confirm('Delete all history?')) return;
      SessionStore.clear();
      this._renderHistory();
    });
    this.$('export-btn').addEventListener('click',       () => this._exportErrors());
    this.$('refresh-stats-btn').addEventListener('click',() => this._loadStats());
  }

  _newChat() {
    this.session   = null;
    this.messages  = [];
    this.aiHistory = [];
    this._renderMessages();
    this._renderEmpty();
    this.$('session-label').textContent = 'New session';
    const chips = this.$('chips');
    if (chips) chips.style.opacity = '1';
    this._goTab('chat');
    this.$('user-input').focus();
  }

  // ─── Send & receive ─────────────────────────────────────────────────────────

  async _send() {
    const input = this.$('user-input');
    const text  = input.value.trim();
    if (!text || this.loading) return;

    // Create session on first message
    if (!this.session) {
      const title = text.length > 50 ? text.slice(0, 50) + '…' : text;
      this.session = SessionStore.create(title);
      this.$('session-label').textContent = title;
    }

    input.value = '';
    input.style.height = 'auto';

    // Remove chips after first real send
    const chips = this.$('chips');
    if (chips) { chips.style.display = 'none'; }

    this._pushMsg('user', text);
    const typingEl = this._addTyping();
    this._setLoading(true, 'Generating…');

    try {
      const res  = await fetch('/api/execute', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:  text,
          model:   this.activeModel,
          enhance: this.enhanced,
          history: this.aiHistory.slice(-MAX_HIST_TURN),
        }),
      });
      const data = await res.json();
      typingEl.remove();

      if (!res.ok || !data.success) throw new Error(data.error || 'HTTP ' + res.status);

      const a   = data.analysis || {};
      const ok  = (data.results || []).filter(r => r.success).length;
      const tot = (data.results || []).length;
      const ct  = a.commandCount || tot;

      // Summary text
      const summary =
        `Applied ${ct} command${ct !== 1 ? 's' : ''} · ${a.executionTime || '?'}\n` +
        `${(a.types || []).join(', ')}`;

      const msgObj = this._pushMsg('ai', summary, 'success', {
        ok, tot, ct,
        complexity: a.complexity,
        hasScripts: a.hasScripts,
        model: data.model || this.activeModel,
      });

      // Update AI context history
      this.aiHistory.push({ role: 'user', content: text });
      this.aiHistory.push({ role: 'assistant', content: '[' + (a.types || []).join(',') + ']' });
      if (this.aiHistory.length > MAX_HIST_TURN * 2) this.aiHistory = this.aiHistory.slice(-MAX_HIST_TURN * 2);

      SessionStore.update(this.session.id, this.messages, data.model);
      this._toast('✓ ' + ct + ' command' + (ct !== 1 ? 's' : '') + ' applied', 'success');

    } catch (err) {
      typingEl.remove();
      this._pushMsg('ai', err.message, 'error');
      this._toast(err.message, 'error');
    } finally {
      this._setLoading(false);
    }
  }

  // ─── Message management ──────────────────────────────────────────────────────

  _pushMsg(role, content, type, result) {
    const msg = { role, content, type: type || '', result, ts: Date.now() };
    this.messages.push(msg);
    this._renderMsg(msg);
    const box = this.$('messages');
    box.scrollTop = box.scrollHeight;

    // Update chat badge (count)
    const badge = this.$('msg-badge');
    if (badge && role === 'ai') {
      const count = this.messages.filter(m => m.role === 'ai').length;
      badge.textContent = count;
      badge.classList.remove('hidden');
    }

    return msg;
  }

  _renderMsg(msg) {
    const box = this.$('messages');

    // Remove empty state
    const empty = box.querySelector('#empty-state');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.className = 'msg ' + msg.role;

    // Avatar
    const av = document.createElement('div');
    av.className = 'msg-av';
    av.textContent = msg.role === 'user' ? '👤' : '🤖';

    // Body
    const body = document.createElement('div');
    body.className = 'msg-body';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble' + (msg.type ? ' ' + msg.type : '');
    bubble.textContent = msg.content;

    body.appendChild(bubble);

    // Result pills for success messages
    if (msg.result) {
      const pills = document.createElement('div');
      pills.className = 'result-stats';
      const { ok, tot, ct, complexity, hasScripts } = msg.result;
      pills.innerHTML =
        `<span class="rs-pill green">✓ ${ok}/${tot} ok</span>` +
        `<span class="rs-pill blue">${ct} cmd${ct !== 1 ? 's' : ''}</span>` +
        (complexity ? `<span class="rs-pill">${complexity}</span>` : '') +
        (hasScripts ? `<span class="rs-pill blue">scripts</span>` : '');
      body.appendChild(pills);
    }

    // Timestamp
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const ts = document.createElement('div');
    ts.className = 'msg-time';
    ts.textContent = timeStr(msg.ts);
    meta.appendChild(ts);
    body.appendChild(meta);

    div.appendChild(av);
    div.appendChild(body);
    box.appendChild(div);
  }

  _renderMessages() {
    const box = this.$('messages');
    box.innerHTML = '';
    if (this.messages.length === 0) {
      this._renderEmpty();
    } else {
      this.messages.forEach(m => this._renderMsg(m));
      box.scrollTop = box.scrollHeight;
    }
  }

  _renderEmpty() {
    const box = this.$('messages');
    if (box.querySelector('#empty-state')) return;
    if (this.messages.length > 0) return;
    box.innerHTML = `
      <div id="empty-state">
        <div id="empty-icon">✦</div>
        <div id="empty-title">VortexDQ AI</div>
        <div id="empty-sub">Describe what you want to build — cuffs, guns, maps, full games — the AI will create it directly in Roblox Studio.</div>
      </div>`;
  }

  _addTyping() {
    const box = this.$('messages');
    const div = document.createElement('div');
    div.className = 'msg ai typing-msg';
    div.innerHTML =
      '<div class="msg-av">🤖</div>' +
      '<div class="msg-body"><div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div></div>';
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div;
  }

  // ─── History ────────────────────────────────────────────────────────────────

  _renderHistory() {
    const list = this.$('history-list');
    const all  = SessionStore.load();

    if (all.length === 0) {
      list.innerHTML = '<div class="hist-empty">No past conversations yet.<br>Start chatting to save history.</div>';
      return;
    }

    list.innerHTML = '';
    all.forEach(s => {
      const item = document.createElement('div');
      item.className = 'hist-item' + (this.session && this.session.id === s.id ? ' active' : '');
      item.innerHTML =
        '<div class="hist-icon">💬</div>' +
        '<div class="hist-info">' +
          '<div class="hist-title">' + esc(s.title) + '</div>' +
          '<div class="hist-meta">' + dateStr(s.createdAt) + ' · ' + s.messages.length + ' msg' + (s.messages.length !== 1 ? 's' : '') + (s.model ? ' · ' + esc(s.model) : '') + '</div>' +
        '</div>' +
        '<button class="hist-delete" data-id="' + s.id + '" title="Delete">' +
          '<svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>' +
        '</button>';

      // Load session
      item.addEventListener('click', e => {
        if (e.target.closest('.hist-delete')) return;
        this._loadSession(s);
        this._goTab('chat');
      });

      // Delete
      item.querySelector('.hist-delete').addEventListener('click', e => {
        e.stopPropagation();
        SessionStore.delete(s.id);
        if (this.session && this.session.id === s.id) this._newChat();
        this._renderHistory();
      });

      list.appendChild(item);
    });
  }

  _loadSession(s) {
    this.session   = s;
    this.messages  = s.messages || [];
    this.aiHistory = this.messages
      .slice(-MAX_HIST_TURN * 2)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
    this.$('session-label').textContent = s.title;
    this._renderMessages();
    const chips = this.$('chips');
    if (chips) chips.style.display = 'none';
  }

  // ─── Models ─────────────────────────────────────────────────────────────────

  async _loadModels() {
    const grid = this.$('models-grid');
    grid.innerHTML = Array(4).fill(
      '<div class="model-card">' +
      '<div class="skeleton" style="height:16px;width:80px;margin-bottom:14px"></div>' +
      '<div class="skeleton" style="height:4px;margin-bottom:10px"></div>' +
      '<div class="skeleton" style="height:4px;width:70%"></div>' +
      '</div>'
    ).join('');

    try {
      const res  = await fetch('/api/models');
      const data = await res.json();
      this.activeModel = data.active;
      this._setModelBadge(data.active);

      grid.innerHTML = '';
      (data.available || []).forEach(m => {
        const card = document.createElement('div');
        card.className = 'model-card' + (m.active ? ' active' : '');
        card.dataset.model = m.name;
        card.innerHTML =
          '<div class="mc-name">' + esc(m.name) + (m.active ? '<span class="mc-active-badge">Active</span>' : '') + '</div>' +
          '<div class="mc-stat"><span>Speed</span><div class="mc-bar"><div class="mc-fill" style="width:' + Math.round(m.speed * 100) + '%"></div></div><span class="mc-pct">' + Math.round(m.speed * 100) + '%</span></div>' +
          '<div class="mc-stat"><span>Quality</span><div class="mc-bar"><div class="mc-fill" style="width:' + Math.round(m.quality * 100) + '%"></div></div><span class="mc-pct">' + Math.round(m.quality * 100) + '%</span></div>' +
          '<div class="mc-cost">' + esc(m.cost) + '</div>';
        card.addEventListener('click', () => this._setModel(m.name));
        grid.appendChild(card);
      });
    } catch (e) {
      grid.innerHTML = '<p style="color:var(--t3);padding:20px">Failed to load models</p>';
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
        this._setModelBadge(name);
        this._loadModels();
        this._toast('Switched to ' + name, 'success');
      }
    } catch { this._toast('Switch failed', 'error'); }
  }

  _setModelBadge(name) {
    this.$('active-model-name').textContent = name || '—';
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  async _loadStats() {
    try {
      const res  = await fetch('/api/stats');
      const data = await res.json();
      const se   = data.smartExecutor || {};

      this._countUp('s-exec', parseInt(se.totalExecutions) || 0);
      this.$('s-rate').textContent = se.successRate  || '—';
      this.$('s-time').textContent = se.avgDuration  || '—';
      const sp = this.$('s-plug');
      sp.textContent   = data.connections > 0 ? 'Online' : 'Offline';
      sp.style.color   = data.connections > 0 ? 'var(--ok)' : 'var(--err)';

      const list = this.$('exec-list');
      list.innerHTML = '';
      const rows = (se.recentExecutions || []).slice(-8).reverse();
      if (!rows.length) {
        list.innerHTML = '<p style="color:var(--t3);font-size:13px;text-align:center;padding:30px">No executions yet</p>';
        return;
      }
      rows.forEach(e => {
        const ok   = e.succeeded   ?? e.successCount ?? 0;
        const tot  = e.commandCount ?? 0;
        const fail = tot - ok;
        const row  = document.createElement('div');
        row.className = 'exec-row';
        row.innerHTML =
          '<span>' + tot + ' cmd' + (tot !== 1 ? 's' : '') + '</span>' +
          '<span class="ok-txt">' + ok + ' ok</span>' +
          (fail ? '<span class="err-txt">' + fail + ' fail</span>' : '') +
          '<span class="ts">' + new Date(e.ts || e.timestamp).toLocaleTimeString() + '</span>';
        list.appendChild(row);
      });
    } catch (e) { console.error(e); }
  }

  _countUp(id, target) {
    const el = this.$(id);
    let cur = parseInt(el.textContent) || 0;
    if (cur === target) return;
    const step = Math.max(1, Math.ceil(Math.abs(target - cur) / 18));
    const t = setInterval(() => {
      cur = cur < target ? Math.min(cur + step, target) : Math.max(cur - step, target);
      el.textContent = cur;
      if (cur === target) clearInterval(t);
    }, 28);
  }

  // ─── Errors ──────────────────────────────────────────────────────────────────

  async _loadErrors() {
    try {
      const res  = await fetch('/api/errors');
      const data = await res.json();

      this.$('e-total').textContent   = data.totalErrors          ?? 0;
      this.$('e-fixed').textContent   = data.fixedErrors          ?? 0;
      this.$('e-unfixed').textContent = data.unfixedErrors        ?? 0;
      this.$('e-crit').textContent    = data.bySeverity?.critical ?? 0;

      const errBadge = this.$('err-badge');
      const crit = data.bySeverity?.critical ?? 0;
      errBadge.textContent = crit;
      errBadge.classList.toggle('hidden', crit === 0);

      const list  = this.$('err-list');
      list.innerHTML = '';
      const items = data.mostCommon || [];
      if (!items.length) {
        list.innerHTML = '<div class="err-empty">No errors recorded — all clear ✓</div>';
        return;
      }
      const sevMap = {};
      (data.recentErrors || []).forEach(e => { sevMap[e.message] = e.severity; });

      items.forEach(err => {
        const sev = sevMap[err.message] || '';
        const cls = { critical: 'c', high: 'h', medium: 'm' }[sev] || '';
        const div = document.createElement('div');
        div.className = 'err-item ' + cls;
        div.innerHTML =
          '<div class="ei-msg">' + esc(err.message) + '</div>' +
          '<div class="ei-meta">× ' + err.count + ' occurrence' + (err.count !== 1 ? 's' : '') + '</div>' +
          (err.suggestedFix ? '<div class="ei-fix">→ ' + esc(err.suggestedFix) + '</div>' : '');
        list.appendChild(div);
      });
    } catch (e) { console.error(e); }
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
    } catch { this._toast('Export failed', 'error'); }
  }

  // ─── Plugin status ────────────────────────────────────────────────────────────

  async _pollPlugin() {
    try {
      const res  = await fetch('/api/status');
      const data = await res.json();
      const conn = (data.connections || []).find(c => c.connected);
      const chip = this.$('status-chip');
      const dot  = this.$('status-dot');
      const lbl  = this.$('status-text');
      const ping = this.$('status-ping');

      if (conn) {
        chip.className = 'online';
        // chip doesn't have id=status-chip in new markup — apply to parent
        chip.id = 'status-chip';
        this.$('status-chip').classList.add('online');
        dot.style.background = '';
        lbl.textContent = 'Plugin Online';
        if (conn.lastUpdate) {
          const ms = Date.now() - new Date(conn.lastUpdate).getTime();
          ping.textContent = ms < 5000 ? ms + 'ms' : '';
        }
      } else {
        this.$('status-chip').classList.remove('online');
        lbl.textContent = 'Plugin Offline';
        ping.textContent = '';
      }
    } catch (_) {
      this.$('status-chip').classList.remove('online');
      this.$('status-text').textContent = 'Server Offline';
    }
  }

  // ─── Initial refresh ──────────────────────────────────────────────────────────

  async _refresh() {
    try {
      const res  = await fetch('/api/models');
      if (!res.ok) return;
      const data = await res.json();
      this.activeModel = data.active;
      this._setModelBadge(data.active);
    } catch (_) {}
  }

  // ─── Loading overlay ──────────────────────────────────────────────────────────

  _setLoading(active, msg) {
    this.loading = active;
    this.$('overlay').classList.toggle('hidden', !active);
    this.$('send-btn').disabled = active;
    if (active && msg) this.$('overlay-msg').textContent = msg;
  }

  // ─── Toast ────────────────────────────────────────────────────────────────────

  _toast(msg, type) {
    type = type || 'info';
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML =
      '<span class="t-icon" style="color:' + (type === 'success' ? 'var(--ok)' : type === 'error' ? 'var(--err)' : 'var(--acc-l)') + '">' +
      (icons[type] || 'ℹ') + '</span>' +
      '<span class="t-msg">' + esc(msg) + '</span>';
    this.$('toasts').appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      setTimeout(() => t.remove(), 280);
    }, 3200);
  }
}

document.addEventListener('DOMContentLoaded', () => { window._app = new App(); });
