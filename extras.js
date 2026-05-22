/* ════════════════════════════════════════════════════════════
   extras.js — recurring, command palette, focus timer,
   bulk select, stats heatmap, confetti
   Hooks into app.js via window.* exports.
   ════════════════════════════════════════════════════════════ */

(function () {
  // ───────────── Initialization ─────────────
  window.initExtras = function () {
    // Ensure focus state is loaded
    loadFocus();
    // Hook focus tick
    setInterval(tickFocus, 1000);
    // Wire command palette buttons in DOM if present
    wireDOM();
  };

  function wireDOM() {
    const cmdkBtn = document.getElementById('cmdk-btn');
    if (cmdkBtn) cmdkBtn.addEventListener('click', openCmdK);
  }

  /* ───────────── Recurring tasks ───────────── */
  // When a recurring task is checked off, spawn the next instance
  // with the due date advanced according to recur rule.
  window.handleRecurring = function (t) {
    if (!t.recur) return;
    const nextDue = nextRecurDate(t.due || Date.now(), t.recur);
    if (!nextDue) return;
    const next = {
      ...JSON.parse(JSON.stringify(t)),
      id: window.id(),
      done: false,
      completedAt: null,
      due: nextDue,
      t: Date.now(),
      subtasks: (t.subtasks || []).map(s => ({ id: window.id(), text: s.text, done: false })),
    };
    window.state.tasks.unshift(next);
    window.save();
  };

  function nextRecurDate(from, rule) {
    const d = new Date(from);
    if (rule === 'daily') d.setDate(d.getDate() + 1);
    else if (rule === 'weekly') d.setDate(d.getDate() + 7);
    else if (rule === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (rule === 'weekdays') {
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    } else return null;
    // If the next date is in the past (e.g. user marked an old one), advance to future
    while (d.getTime() < Date.now()) {
      if (rule === 'daily') d.setDate(d.getDate() + 1);
      else if (rule === 'weekly') d.setDate(d.getDate() + 7);
      else if (rule === 'monthly') d.setMonth(d.getMonth() + 1);
      else if (rule === 'weekdays') {
        do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
      }
    }
    return d.getTime();
  }

  /* ───────────── Confetti ───────────── */
  let confettiPieces = [];
  let confettiRaf = null;
  let confettiCanvas;

  window.maybeConfetti = function (t) {
    // Fire confetti when all tasks for today are now complete
    const end = window.endOfToday();
    const todays = window.state.tasks.filter(x => x.due != null && x.due <= end);
    if (todays.length === 0) return;
    const allDone = todays.every(x => x.done);
    if (allDone) fireConfetti();
  };

  function fireConfetti() {
    if (!confettiCanvas) {
      confettiCanvas = document.createElement('canvas');
      confettiCanvas.className = 'confetti-canvas';
      document.body.appendChild(confettiCanvas);
    }
    sizeConfetti();
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;
    const colors = ['#D97757', '#5AB36B', '#5485D0', '#E0BB5A', '#A05CC6', '#E76B6B'];
    for (let i = 0; i < 120; i++) {
      confettiPieces.push({
        x: cx, y: cy,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 1.2) * 14,
        g: 0.4 + Math.random() * 0.2,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.4,
        w: 6 + Math.random() * 6,
        h: 3 + Math.random() * 4,
        c: colors[Math.floor(Math.random() * colors.length)],
        life: 0,
      });
    }
    if (!confettiRaf) loopConfetti();
  }

  function sizeConfetti() {
    confettiCanvas.width = innerWidth;
    confettiCanvas.height = innerHeight;
  }

  function loopConfetti() {
    const ctx = confettiCanvas.getContext('2d');
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiPieces = confettiPieces.filter(p => p.life < 180 && p.y < innerHeight + 50);
    for (const p of confettiPieces) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.globalAlpha = Math.max(0, 1 - p.life / 180);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (confettiPieces.length > 0) {
      confettiRaf = requestAnimationFrame(loopConfetti);
    } else {
      confettiRaf = null;
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }
  addEventListener('resize', () => { if (confettiCanvas) sizeConfetti(); });

  /* ───────────── Command palette (Cmd+K) ───────────── */
  let cmdkModal = null;
  let cmdkInput = null;
  let cmdkResults = null;
  let cmdkActive = 0;
  let cmdkItems = [];

  window.openCmdK = function () {
    if (cmdkModal) { cmdkInput.focus(); cmdkInput.select(); return; }
    cmdkModal = document.createElement('div');
    cmdkModal.className = 'cmdk-backdrop';
    cmdkModal.innerHTML = `
      <div class="cmdk" role="dialog" aria-label="Command palette">
        <div class="cmdk-input-wrap">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="6" cy="6" r="3.5"/><path d="M8.5 8.5L12 12"/></svg>
          <input class="cmdk-input" placeholder="Search tasks, lists, tags · or type a command…" autofocus />
          <kbd class="cmdk-esc">esc</kbd>
        </div>
        <div class="cmdk-results"></div>
        <div class="cmdk-foot">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    `;
    document.body.appendChild(cmdkModal);
    cmdkInput = cmdkModal.querySelector('.cmdk-input');
    cmdkResults = cmdkModal.querySelector('.cmdk-results');
    cmdkInput.addEventListener('input', refreshCmdK);
    cmdkInput.addEventListener('keydown', cmdkKey);
    cmdkModal.addEventListener('click', e => { if (e.target === cmdkModal) closeCmdK(); });
    refreshCmdK();
    cmdkInput.focus();
  };

  window.closeCmdK = function () {
    if (!cmdkModal) return;
    cmdkModal.remove();
    cmdkModal = null;
  };

  function refreshCmdK() {
    const q = (cmdkInput.value || '').toLowerCase().trim();
    const items = [];

    // Actions
    const actions = [
      { icon: '＋', label: 'New task', sub: 'Focus the quick-add input', run: () => { closeCmdK(); document.getElementById('qadd').focus(); } },
      { icon: '＋', label: 'New list', sub: 'Cmd+N', run: () => { closeCmdK(); document.getElementById('add-list-btn').click(); } },
      { icon: '✦', label: 'Plan my day', sub: 'AI reorders today\'s tasks', run: () => { closeCmdK(); document.getElementById('ai-btn').click(); } },
      { icon: '⌖', label: 'Focus mode', sub: 'Pick a task to focus on', run: () => { closeCmdK(); pickFocusTask(); } },
      { icon: '↓', label: 'Import JSON', sub: 'Restore from backup', run: () => { closeCmdK(); document.getElementById('import-btn').click(); } },
      { icon: '↑', label: 'Export JSON', sub: 'Download all tasks', run: () => { closeCmdK(); document.getElementById('export-btn').click(); } },
      { icon: '◐', label: 'Toggle theme', sub: 'Light · Dark · Auto', run: () => { closeCmdK(); document.getElementById('theme-btn').click(); } },
      { icon: '≡', label: 'Toggle density', sub: 'Comfy · Compact', run: () => { closeCmdK(); document.getElementById('density-btn').click(); } },
    ];
    actions.filter(a => !q || a.label.toLowerCase().includes(q)).forEach(a => items.push({ ...a, kind: 'action' }));

    // Smart views
    const views = [
      ['today', 'Today'], ['upcoming', 'Upcoming'], ['all', 'All tasks'], ['done', 'Completed'], ['stats', 'Stats'],
    ];
    views.filter(([id, label]) => !q || label.toLowerCase().includes(q) || 'view'.includes(q)).forEach(([id, label]) => {
      items.push({
        kind: 'view', icon: '◧', label: 'Go to: ' + label, sub: 'Smart view',
        run: () => { window.state.view = id; window.state.draftDate = null; window.save(); window.renderAll(); closeCmdK(); },
      });
    });

    // Lists
    window.state.lists.forEach(l => {
      if (!q || l.name.toLowerCase().includes(q)) {
        items.push({
          kind: 'list', icon: '●', iconColor: l.color, label: 'List: ' + l.name,
          sub: window.state.tasks.filter(t => t.listId === l.id && !t.done).length + ' open',
          run: () => { window.state.view = 'list:' + l.id; window.save(); window.renderAll(); closeCmdK(); },
        });
      }
    });

    // Tags
    const tags = [...new Set(window.state.tasks.flatMap(t => t.tags || []))];
    tags.forEach(tag => {
      if (!q || tag.includes(q)) {
        items.push({
          kind: 'tag', icon: '#', label: 'Tag: #' + tag, sub: window.state.tasks.filter(t => (t.tags || []).includes(tag) && !t.done).length + ' open',
          run: () => { window.state.view = 'tag:' + tag; window.save(); window.renderAll(); closeCmdK(); },
        });
      }
    });

    // Tasks — fuzzy contains
    if (q.length > 0) {
      const matched = window.state.tasks.filter(t => t.text.toLowerCase().includes(q)).slice(0, 12);
      matched.forEach(t => {
        const list = window.state.lists.find(l => l.id === t.listId);
        items.push({
          kind: 'task', icon: t.done ? '✓' : '○',
          label: t.text, sub: [list && list.name, t.due && window.formatDue(t.due)].filter(Boolean).join(' · ') || 'No date',
          run: () => {
            // Switch to list and expand task
            window.state.view = 'list:' + t.listId;
            window.state.expandedTaskId = t.id;
            window.save();
            window.renderAll();
            closeCmdK();
            // Scroll to it
            setTimeout(() => {
              const li = document.querySelector(`.task[data-id="${t.id}"]`);
              if (li) li.focus();
            }, 50);
          },
        });
      });
    }

    cmdkItems = items;
    cmdkActive = 0;
    renderCmdKResults();
  }

  function renderCmdKResults() {
    if (cmdkItems.length === 0) {
      cmdkResults.innerHTML = '<div class="cmdk-empty">No results.</div>';
      return;
    }
    cmdkResults.innerHTML = '';
    let lastKind = '';
    cmdkItems.forEach((it, idx) => {
      if (it.kind !== lastKind) {
        const head = document.createElement('div');
        head.className = 'cmdk-head';
        head.textContent = ({ action: 'Actions', view: 'Views', list: 'Lists', tag: 'Tags', task: 'Tasks' })[it.kind] || it.kind;
        cmdkResults.appendChild(head);
        lastKind = it.kind;
      }
      const row = document.createElement('button');
      row.className = 'cmdk-row' + (idx === cmdkActive ? ' active' : '');
      const ic = document.createElement('span');
      ic.className = 'cmdk-icon';
      ic.textContent = it.icon;
      if (it.iconColor) ic.style.color = it.iconColor;
      const lbl = document.createElement('span');
      lbl.className = 'cmdk-label';
      lbl.textContent = it.label;
      const sub = document.createElement('span');
      sub.className = 'cmdk-sub';
      sub.textContent = it.sub || '';
      row.append(ic, lbl, sub);
      row.addEventListener('click', () => it.run());
      row.addEventListener('mouseenter', () => { cmdkActive = idx; updateCmdKActive(); });
      cmdkResults.appendChild(row);
    });
  }

  function updateCmdKActive() {
    [...cmdkResults.querySelectorAll('.cmdk-row')].forEach((r, i) => r.classList.toggle('active', i === cmdkActive));
    const active = cmdkResults.querySelector('.cmdk-row.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function cmdkKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdkActive = (cmdkActive + 1) % Math.max(cmdkItems.length, 1); updateCmdKActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkActive = (cmdkActive - 1 + cmdkItems.length) % Math.max(cmdkItems.length, 1); updateCmdKActive(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = cmdkItems[cmdkActive]; if (it) it.run(); }
  }

  /* ───────────── Focus / Pomodoro timer ───────────── */
  const FOCUS_KEY = 'focus.v1';
  let focus = { taskId: null, mode: 'work', startedAt: null, workMin: 25, breakMin: 5, history: [] };
  let lastNotifiedSec = -1;

  function loadFocus() {
    try {
      const raw = localStorage.getItem(FOCUS_KEY);
      if (raw) focus = { ...focus, ...JSON.parse(raw) };
    } catch {}
  }
  function saveFocus() {
    localStorage.setItem(FOCUS_KEY, JSON.stringify(focus));
  }

  window.startFocus = function (taskId, mode = 'work') {
    focus.taskId = taskId;
    focus.mode = mode;
    focus.startedAt = Date.now();
    saveFocus();
    window.renderAll();
  };

  window.stopFocus = function () {
    if (focus.startedAt && focus.taskId) {
      const elapsed = Date.now() - focus.startedAt;
      focus.history.push({ taskId: focus.taskId, ms: elapsed, mode: focus.mode, at: Date.now() });
    }
    focus.taskId = null;
    focus.startedAt = null;
    saveFocus();
    window.renderAll();
  };

  function pickFocusTask() {
    const opens = window.state.tasks.filter(t => !t.done);
    if (opens.length === 0) return alert('No open tasks to focus on.');
    // Just pick highest priority then earliest due
    opens.sort((a, b) => (b.priority || 0) - (a.priority || 0) || (a.due || Infinity) - (b.due || Infinity));
    window.startFocus(opens[0].id);
  }

  window.renderFocusBar = function () {
    let bar = document.getElementById('focus-bar');
    if (!focus.taskId || !focus.startedAt) {
      if (bar) bar.remove();
      return;
    }
    const t = window.state.tasks.find(x => x.id === focus.taskId);
    if (!t) { window.stopFocus(); return; }

    const total = (focus.mode === 'work' ? focus.workMin : focus.breakMin) * 60 * 1000;
    const elapsed = Date.now() - focus.startedAt;
    const remaining = Math.max(0, total - elapsed);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'focus-bar';
      bar.className = 'focus-bar';
      document.body.appendChild(bar);
    }

    const pct = (1 - remaining / total) * 100;
    bar.innerHTML = `
      <div class="focus-progress" style="width:${pct}%"></div>
      <div class="focus-mode ${focus.mode}">${focus.mode === 'work' ? 'FOCUS' : 'BREAK'}</div>
      <div class="focus-task">${escapeHtml(t.text)}</div>
      <div class="focus-time">${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}</div>
      <button class="focus-action" id="focus-toggle-mode">${focus.mode === 'work' ? 'Take break' : 'Back to work'}</button>
      <button class="focus-action focus-done" id="focus-complete">Mark done</button>
      <button class="focus-action focus-stop" id="focus-stop">✕</button>
    `;
    bar.querySelector('#focus-toggle-mode').addEventListener('click', () => {
      focus.mode = focus.mode === 'work' ? 'break' : 'work';
      focus.startedAt = Date.now();
      saveFocus();
      window.renderAll();
    });
    bar.querySelector('#focus-complete').addEventListener('click', () => {
      const task = window.state.tasks.find(x => x.id === focus.taskId);
      if (task) {
        task.done = true;
        task.completedAt = Date.now();
        if (window.handleRecurring) window.handleRecurring(task);
        window.save();
      }
      window.stopFocus();
      if (window.maybeConfetti) window.maybeConfetti(task);
    });
    bar.querySelector('#focus-stop').addEventListener('click', window.stopFocus);
  };

  function tickFocus() {
    if (!focus.taskId || !focus.startedAt) return;
    const bar = document.getElementById('focus-bar');
    if (!bar) return;
    const total = (focus.mode === 'work' ? focus.workMin : focus.breakMin) * 60 * 1000;
    const elapsed = Date.now() - focus.startedAt;
    const remaining = Math.max(0, total - elapsed);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const pct = (1 - remaining / total) * 100;
    const timeEl = bar.querySelector('.focus-time');
    const progEl = bar.querySelector('.focus-progress');
    if (timeEl) timeEl.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    if (progEl) progEl.style.width = pct + '%';

    if (remaining === 0 && lastNotifiedSec !== focus.startedAt) {
      lastNotifiedSec = focus.startedAt;
      // Auto switch mode
      const oldMode = focus.mode;
      focus.history.push({ taskId: focus.taskId, ms: total, mode: oldMode, at: Date.now() });
      focus.mode = oldMode === 'work' ? 'break' : 'work';
      focus.startedAt = Date.now();
      saveFocus();
      window.renderAll();
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(oldMode === 'work' ? 'Time for a break' : 'Back to focus', { body: 'Tasks' });
        }
      } catch {}
      // Soft beep
      try { beep(); } catch {}
    }
  }

  function beep() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 660;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start();
    o.stop(ctx.currentTime + 0.45);
  }

  /* ───────────── Bulk select ───────────── */
  window.bulkState = { selected: new Set() };

  window.toggleBulk = function (taskId) {
    if (window.bulkState.selected.has(taskId)) window.bulkState.selected.delete(taskId);
    else window.bulkState.selected.add(taskId);
    window.renderAll();
  };

  window.clearBulk = function () {
    if (window.bulkState.selected.size === 0) return;
    window.bulkState.selected.clear();
    window.renderAll();
  };

  window.renderBulkBar = function () {
    let bar = document.getElementById('bulk-bar');
    const n = window.bulkState.selected.size;
    if (n === 0) {
      if (bar) bar.remove();
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bulk-bar';
      bar.className = 'bulk-bar';
      document.body.appendChild(bar);
    }
    bar.innerHTML = `
      <span class="bulk-count">${n} selected</span>
      <button data-act="complete">Complete</button>
      <button data-act="uncomplete">Mark open</button>
      <button data-act="move">Move…</button>
      <button data-act="tag">Tag…</button>
      <button data-act="priority">Priority…</button>
      <button data-act="delete" class="danger">Delete</button>
      <button data-act="cancel" class="ghost">Cancel</button>
    `;
    bar.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => bulkAction(b.dataset.act));
    });
  };

  function bulkSelected() {
    return window.state.tasks.filter(t => window.bulkState.selected.has(t.id));
  }

  function bulkAction(act) {
    const tasks = bulkSelected();
    if (act === 'cancel') return window.clearBulk();
    if (act === 'complete') {
      tasks.forEach(t => { t.done = true; t.completedAt = Date.now(); if (window.handleRecurring) window.handleRecurring(t); });
    } else if (act === 'uncomplete') {
      tasks.forEach(t => { t.done = false; t.completedAt = null; });
    } else if (act === 'delete') {
      if (!confirm(`Delete ${tasks.length} tasks?`)) return;
      const ids = new Set(tasks.map(t => t.id));
      const removed = window.state.tasks.filter(t => ids.has(t.id));
      window.state.tasks = window.state.tasks.filter(t => !ids.has(t.id));
      window.bulkState.selected.clear();
      window.save();
      window.renderAll();
      window.showUndo(`Deleted ${removed.length} tasks`, () => {
        window.state.tasks.push(...removed);
        window.save();
        window.renderAll();
      });
      return;
    } else if (act === 'move') {
      const names = window.state.lists.map((l, i) => `${i + 1}. ${l.name}`).join('\n');
      const choice = prompt(`Move ${tasks.length} tasks to which list?\n${names}\n\nEnter number:`);
      const idx = +choice - 1;
      if (idx >= 0 && idx < window.state.lists.length) {
        const lid = window.state.lists[idx].id;
        tasks.forEach(t => t.listId = lid);
      } else return;
    } else if (act === 'tag') {
      const tag = prompt('Tag to add (no #):');
      if (!tag) return;
      const clean = tag.toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!clean) return;
      tasks.forEach(t => {
        t.tags ||= [];
        if (!t.tags.includes(clean)) t.tags.push(clean);
      });
    } else if (act === 'priority') {
      const p = prompt('Priority? 0 = none, 1 = P3, 2 = P2, 3 = P1');
      const v = +p;
      if (!(v >= 0 && v <= 3)) return;
      tasks.forEach(t => t.priority = v);
    }
    window.bulkState.selected.clear();
    window.save();
    window.renderAll();
  }

  /* ───────────── Stats view (heatmap + numbers) ───────────── */
  window.renderStatsInto = function (root) {
    const tasks = window.state.tasks;
    const done = tasks.filter(t => t.done && t.completedAt);
    const totalDone = done.length;
    const totalOpen = tasks.filter(t => !t.done).length;
    const totalOverdue = tasks.filter(t => !t.done && t.due && t.due < Date.now()).length;
    const streak = computeStreak(done);
    const avgPerDay = avgCompletionsPerDay(done);

    const wrap = document.createElement('div');
    wrap.className = 'stats-wrap';

    // KPIs
    const kpis = document.createElement('div');
    kpis.className = 'kpi-grid';
    const kpiData = [
      { num: totalDone, label: 'Done all-time', accent: true },
      { num: totalOpen, label: 'Open' },
      { num: totalOverdue, label: 'Overdue', danger: totalOverdue > 0 },
      { num: streak, label: 'Day streak' },
      { num: avgPerDay.toFixed(1), label: 'Avg / day (14d)' },
    ];
    kpiData.forEach(k => {
      const el = document.createElement('div');
      el.className = 'kpi' + (k.accent ? ' accent' : '') + (k.danger ? ' danger' : '');
      el.innerHTML = `<div class="kpi-num">${k.num}</div><div class="kpi-lbl">${k.label}</div>`;
      kpis.appendChild(el);
    });
    wrap.appendChild(kpis);

    // Heatmap — last 12 weeks
    const heat = document.createElement('div');
    heat.className = 'heat-section';
    heat.innerHTML = '<h3>Completion heatmap · last 12 weeks</h3>';
    const grid = document.createElement('div');
    grid.className = 'heat-grid';
    const weeks = 12;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (weeks * 7) + 1);
    // align to Sunday
    while (start.getDay() !== 0) start.setDate(start.getDate() - 1);

    const byDay = new Map();
    done.forEach(t => {
      const d = new Date(t.completedAt);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + 1);
    });

    let max = 0;
    byDay.forEach(v => { if (v > max) max = v; });

    for (let w = 0; w < weeks + 1; w++) {
      const col = document.createElement('div');
      col.className = 'heat-col';
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        const key = day.toISOString().slice(0, 10);
        const n = byDay.get(key) || 0;
        const isFuture = day.getTime() > Date.now();
        const cell = document.createElement('div');
        cell.className = 'heat-cell';
        if (isFuture) cell.classList.add('future');
        else {
          const lvl = n === 0 ? 0 : Math.min(4, Math.ceil((n / Math.max(max, 1)) * 4));
          cell.dataset.lvl = String(lvl);
        }
        cell.title = `${day.toDateString()} · ${n} done`;
        col.appendChild(cell);
      }
      grid.appendChild(col);
    }
    heat.appendChild(grid);

    const legend = document.createElement('div');
    legend.className = 'heat-legend';
    legend.innerHTML = '<span>Less</span>' +
      [0, 1, 2, 3, 4].map(l => `<div class="heat-cell" data-lvl="${l}"></div>`).join('') +
      '<span>More</span>';
    heat.appendChild(legend);
    wrap.appendChild(heat);

    // Top tags
    const tagCounts = new Map();
    tasks.forEach(t => (t.tags || []).forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)));
    if (tagCounts.size > 0) {
      const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      const tagSec = document.createElement('div');
      tagSec.className = 'stats-section';
      tagSec.innerHTML = '<h3>Top tags</h3>';
      const barwrap = document.createElement('div');
      barwrap.className = 'tag-bars';
      const maxN = topTags[0][1];
      topTags.forEach(([tag, n]) => {
        const row = document.createElement('div');
        row.className = 'tag-bar';
        row.innerHTML = `<span class="tb-label">#${tag}</span><div class="tb-track"><div class="tb-fill" style="width:${(n/maxN)*100}%"></div></div><span class="tb-n">${n}</span>`;
        barwrap.appendChild(row);
      });
      tagSec.appendChild(barwrap);
      wrap.appendChild(tagSec);
    }

    // Focus time
    if (focus.history && focus.history.length > 0) {
      const totalMs = focus.history.filter(h => h.mode === 'work').reduce((s, h) => s + h.ms, 0);
      const hours = (totalMs / 3600000).toFixed(1);
      const focusSec = document.createElement('div');
      focusSec.className = 'stats-section';
      focusSec.innerHTML = `<h3>Focus time</h3><p class="big-num">${hours}h</p><p class="muted">across ${focus.history.filter(h => h.mode === 'work').length} sessions</p>`;
      wrap.appendChild(focusSec);
    }

    root.appendChild(wrap);
  };

  function computeStreak(done) {
    if (done.length === 0) return 0;
    const days = new Set(done.map(t => {
      const d = new Date(t.completedAt); d.setHours(0,0,0,0);
      return d.toISOString().slice(0, 10);
    }));
    let streak = 0;
    const cur = new Date(); cur.setHours(0,0,0,0);
    // If nothing today, start from yesterday
    if (!days.has(cur.toISOString().slice(0, 10))) {
      cur.setDate(cur.getDate() - 1);
    }
    while (days.has(cur.toISOString().slice(0, 10))) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }
    return streak;
  }

  function avgCompletionsPerDay(done) {
    const cutoff = Date.now() - 14 * 86400e3;
    const recent = done.filter(t => t.completedAt >= cutoff);
    return recent.length / 14;
  }

  /* ───────────── utils ───────────── */
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
})();
