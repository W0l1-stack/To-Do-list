/* ════════════════════════════════════════════════════════════
   Tasks — advanced todo app
   ════════════════════════════════════════════════════════════ */

const STORE_KEY = 'tasks.v2';
const UNDO_MS = 6000;

/* ───────────── State ───────────── */
const state = {
  lists: [],
  tasks: [],
  view: 'today',          // 'today' | 'upcoming' | 'all' | 'done' | 'list:ID' | 'tag:NAME'
  density: 'comfy',
  theme: 'auto',
  expandedTaskId: null,
  draftDate: null,        // date filter from calstrip
  pendingUndo: null,      // {label, restore}
};

/* ───────────── Persistence ───────────── */
function save() {
  const data = {
    lists: state.lists,
    tasks: state.tasks,
    view: state.view,
    density: state.density,
    theme: state.theme,
  };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch {}
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(state, data);
    return true;
  } catch { return false; }
}

function seed() {
  const inbox = { id: id(), name: 'Inbox', color: 'oklch(0.62 0.008 80)' };
  const work = { id: id(), name: 'Work', color: 'oklch(0.6 0.15 230)' };
  const personal = { id: id(), name: 'Personal', color: 'oklch(0.65 0.13 150)' };
  state.lists = [inbox, work, personal];

  const now = Date.now();
  const d = (h) => now + h * 3600 * 1000;
  state.tasks = [
    { id: id(), listId: work.id, text: 'Sketch homepage layout', done: false, t: d(-3), due: d(6), priority: 3, tags: ['design'], subtasks: [
      { id: id(), text: 'Hero section', done: true },
      { id: id(), text: 'Feature grid', done: false },
      { id: id(), text: 'Footer CTA', done: false },
    ], notes: 'Reference: linear.app, vercel.com', order: 0 },
    { id: id(), listId: work.id, text: 'Reply to design feedback', done: false, t: d(-1), due: d(2), priority: 2, tags: ['comms'], subtasks: [], notes: '', order: 1 },
    { id: id(), listId: personal.id, text: 'Buy groceries', done: false, t: d(-5), due: d(28), priority: 0, tags: ['errands'], subtasks: [
      { id: id(), text: 'Olive oil', done: false },
      { id: id(), text: 'Bread', done: false },
    ], notes: '', order: 2 },
    { id: id(), listId: personal.id, text: 'Call mom', done: false, t: d(-24), due: d(52), priority: 1, tags: [], subtasks: [], notes: '', order: 3 },
    { id: id(), listId: inbox.id, text: 'Set up project repo', done: true, t: d(-48), due: null, priority: 0, tags: [], subtasks: [], notes: '', order: 4 },
  ];
  state.view = 'today';
  save();
}

function id() { return Math.random().toString(36).slice(2, 10); }

/* ───────────── Input parser ───────────── */
const WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const WEEKDAYS_SHORT = ['sun','mon','tue','wed','thu','fri','sat'];

function parseInput(raw) {
  let text = ' ' + raw + ' ';
  let priority = 0;
  let dueAt = null;
  const tags = [];
  const parsedTokens = [];

  // Priority — trailing !, !!, !!! (or anywhere as standalone token)
  const prMatches = [...text.matchAll(/\s(!{1,3})(?=\s)/g)];
  if (prMatches.length) {
    const last = prMatches[prMatches.length - 1][1];
    priority = last.length;
    text = text.replace(/\s(!{1,3})(?=\s)/g, ' ');
    parsedTokens.push({ kind: `p${priority}`, label: 'P' + (4 - priority) });
  }

  // Tags — #word
  text = text.replace(/\s#([a-z0-9_-]+)/gi, (_, t) => {
    tags.push(t.toLowerCase());
    parsedTokens.push({ kind: 'tag', label: '#' + t.toLowerCase() });
    return ' ';
  });

  // Dates
  const dateResult = extractDue(text);
  if (dateResult) {
    text = dateResult.cleaned;
    dueAt = dateResult.timestamp;
    parsedTokens.push({ kind: 'due', label: formatDue(dueAt) });
  }

  return {
    text: text.replace(/\s+/g, ' ').trim(),
    priority, due: dueAt, tags,
    tokens: parsedTokens,
  };
}

function extractDue(text) {
  const now = new Date();
  const t = text.toLowerCase();
  let date = null;
  let matchedSpan = null;

  // "in N day/week/hour"
  let m = t.match(/\sin\s+(\d+)\s+(hour|hr|day|week|wk)s?\b/);
  if (m) {
    const n = +m[1];
    const unit = m[2];
    const ms = unit.startsWith('h') ? n * 3600e3 : unit.startsWith('d') ? n * 86400e3 : n * 7 * 86400e3;
    date = new Date(now.getTime() + ms);
    matchedSpan = m[0];
  }

  // "next monday", "this friday"
  if (!date) {
    m = t.match(/\s(next|this)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/);
    if (m) {
      const day = m[2];
      const idx = WEEKDAYS.indexOf(day) >= 0 ? WEEKDAYS.indexOf(day) : WEEKDAYS_SHORT.indexOf(day);
      date = nextWeekday(idx, m[1] === 'next');
      matchedSpan = m[0];
    }
  }

  // "monday", "tue"
  if (!date) {
    m = t.match(/\s(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/);
    if (m) {
      const day = m[1];
      const idx = WEEKDAYS.indexOf(day) >= 0 ? WEEKDAYS.indexOf(day) : WEEKDAYS_SHORT.indexOf(day);
      date = nextWeekday(idx, false);
      matchedSpan = m[0];
    }
  }

  // "today" "tomorrow" "tonight"
  if (!date) {
    m = t.match(/\s(today|tomorrow|tonight|tmr|tom)\b/);
    if (m) {
      const w = m[1];
      date = new Date(now);
      date.setHours(18, 0, 0, 0);
      if (w === 'tomorrow' || w === 'tmr' || w === 'tom') date.setDate(date.getDate() + 1);
      if (w === 'tonight') date.setHours(20, 0, 0, 0);
      matchedSpan = m[0];
    }
  }

  // YYYY-MM-DD
  if (!date) {
    m = t.match(/\s(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (m) {
      date = new Date(+m[1], +m[2] - 1, +m[3], 18, 0, 0, 0);
      matchedSpan = m[0];
    }
  }

  // M/D or M/D/Y
  if (!date) {
    m = t.match(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (m) {
      const yr = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
      date = new Date(yr, +m[1] - 1, +m[2], 18, 0, 0, 0);
      if (date < now) date.setFullYear(date.getFullYear() + 1);
      matchedSpan = m[0];
    }
  }

  // Time clause: "5pm", "5:30pm", "17:00", "9am"
  let timeMatch = null;
  let timeSpan = null;
  let tm = t.match(/\s(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (tm) {
    let h = +tm[1] % 12;
    if (tm[3] === 'pm') h += 12;
    timeMatch = { h, m: tm[2] ? +tm[2] : 0 };
    timeSpan = tm[0];
  } else {
    tm = t.match(/\s(\d{1,2}):(\d{2})\b/);
    if (tm) {
      timeMatch = { h: +tm[1], m: +tm[2] };
      timeSpan = tm[0];
    }
  }

  if (timeMatch) {
    if (!date) date = new Date(now);
    date.setHours(timeMatch.h, timeMatch.m, 0, 0);
    if (date < now && !matchedSpan) date.setDate(date.getDate() + 1);
  }

  if (!date) return null;

  let cleaned = text;
  if (matchedSpan) cleaned = cleaned.replace(matchedSpan, ' ');
  if (timeSpan) cleaned = cleaned.replace(timeSpan, ' ');

  return { cleaned, timestamp: date.getTime() };
}

function nextWeekday(targetDow, forceNext) {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  const cur = d.getDay();
  let diff = (targetDow - cur + 7) % 7;
  if (diff === 0) diff = forceNext ? 7 : 7;
  else if (forceNext) diff += 0; // already future
  d.setDate(d.getDate() + diff);
  return d;
}

function formatDue(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const startToday = new Date(now); startToday.setHours(0,0,0,0);
  const startDate = new Date(d); startDate.setHours(0,0,0,0);
  const diffDays = Math.round((startDate - startToday) / 86400000);

  const time = d.getMinutes() === 0 && d.getHours() === 0
    ? ''
    : ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined });

  if (diffDays === 0) return 'today' + time;
  if (diffDays === 1) return 'tomorrow' + time;
  if (diffDays === -1) return 'yesterday' + time;
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'long' }).toLowerCase() + time;
  if (diffDays < 0 && diffDays > -7) return Math.abs(diffDays) + 'd ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + time;
}

function dueClass(ts) {
  if (!ts) return '';
  const now = Date.now();
  if (ts < now) return 'overdue';
  const d = new Date(ts), today = new Date();
  if (d.toDateString() === today.toDateString()) return 'today';
  return '';
}

/* ───────────── Filtering ───────────── */
function visibleTasks() {
  const v = state.view;
  const tasks = state.tasks;
  let out;
  if (v === 'today') {
    const end = endOfToday();
    out = tasks.filter(t => !t.done && (t.due == null ? false : t.due <= end));
  } else if (v === 'upcoming') {
    const end = endOfToday() + 7 * 86400e3;
    out = tasks.filter(t => !t.done && t.due != null && t.due <= end);
  } else if (v === 'all') {
    out = tasks.filter(t => !t.done);
  } else if (v === 'done') {
    out = tasks.filter(t => t.done);
  } else if (v.startsWith('list:')) {
    const lid = v.slice(5);
    out = tasks.filter(t => t.listId === lid && !t.done);
  } else if (v.startsWith('tag:')) {
    const tag = v.slice(4);
    out = tasks.filter(t => !t.done && t.tags.includes(tag));
  } else {
    out = tasks.filter(t => !t.done);
  }

  if (state.draftDate) {
    const d0 = new Date(state.draftDate); d0.setHours(0,0,0,0);
    const d1 = d0.getTime() + 86400e3;
    out = out.filter(t => t.due != null && t.due >= d0.getTime() && t.due < d1);
  }

  return out;
}

function endOfToday() {
  const d = new Date(); d.setHours(23,59,59,999); return d.getTime();
}

/* ───────────── Render ───────────── */
const dom = {};
function $(s, r = document) { return r.querySelector(s); }
function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v === false || v == null) continue;
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function renderSidebar() {
  // Views
  const views = [
    { id: 'today', label: 'Today', icon: iconCircle() },
    { id: 'upcoming', label: 'Upcoming', icon: iconCal() },
    { id: 'all', label: 'All', icon: iconStack() },
    { id: 'done', label: 'Completed', icon: iconCheck() },
    { id: 'stats', label: 'Stats', icon: iconChart() },
  ];
  const counts = {
    today: state.tasks.filter(t => !t.done && t.due != null && t.due <= endOfToday()).length,
    upcoming: state.tasks.filter(t => !t.done && t.due != null && t.due <= endOfToday() + 7*86400e3).length,
    all: state.tasks.filter(t => !t.done).length,
    done: state.tasks.filter(t => t.done).length,
  };

  dom.views.innerHTML = '';
  for (const v of views) {
    const btn = el('button', {
      class: 'nav-item' + (state.view === v.id ? ' active' : ''),
      onclick: () => { state.view = v.id; state.draftDate = null; save(); renderAll(); },
    }, [
      el('span', { class: 'icon', html: v.icon }),
      el('span', { class: 'label' }, v.label),
      el('span', { class: 'count' }, counts[v.id] != null ? String(counts[v.id]) : ''),
    ]);
    dom.views.appendChild(btn);
  }

  // Lists
  dom.lists.innerHTML = '';
  for (const l of state.lists) {
    const open = state.tasks.filter(t => t.listId === l.id && !t.done).length;
    const btn = el('button', {
      class: 'nav-item' + (state.view === 'list:' + l.id ? ' active' : ''),
      onclick: () => { state.view = 'list:' + l.id; state.draftDate = null; save(); renderAll(); },
      ondblclick: () => renameList(l.id),
    }, [
      el('span', { class: 'icon' }, [el('span', { class: 'list-dot', style: 'background:' + l.color })]),
      el('span', { class: 'label' }, l.name),
      el('span', { class: 'count' }, String(open)),
    ]);
    dom.lists.appendChild(btn);
  }

  // Tags
  const tagSet = new Set();
  state.tasks.forEach(t => { if (!t.done) t.tags.forEach(x => tagSet.add(x)); });
  dom.tagcloud.innerHTML = '';
  if (tagSet.size === 0) {
    dom.tagcloud.appendChild(el('span', { class: 'tag-chip', style: 'opacity:0.5' }, 'none yet'));
  } else {
    [...tagSet].sort().forEach(t => {
      const active = state.view === 'tag:' + t;
      dom.tagcloud.appendChild(el('button', {
        class: 'tag-chip' + (active ? ' active' : ''),
        onclick: () => { state.view = 'tag:' + t; state.draftDate = null; save(); renderAll(); },
      }, '#' + t));
    });
  }
}

function renderHeader() {
  const v = state.view;
  let title = 'Today', crumb = 'Smart view', subtitle = '';
  const total = state.tasks.filter(t => !t.done).length;
  const doneTotal = state.tasks.filter(t => t.done).length;

  if (v === 'today') { title = 'Today'; subtitle = `${todayLabel()} · ${visibleTasks().length} due`; }
  else if (v === 'upcoming') { title = 'Upcoming'; subtitle = 'Next 7 days'; }
  else if (v === 'all') { title = 'All tasks'; subtitle = `${total} open, ${doneTotal} done`; }
  else if (v === 'done') { title = 'Completed'; subtitle = `${doneTotal} done`; }
  else if (v === 'stats') { title = 'Stats'; crumb = 'Insights'; subtitle = `${doneTotal} completed all-time`; }
  else if (v.startsWith('list:')) {
    const l = state.lists.find(x => x.id === v.slice(5));
    title = l?.name || 'List';
    crumb = 'List';
    const open = state.tasks.filter(t => t.listId === l?.id && !t.done).length;
    const done = state.tasks.filter(t => t.listId === l?.id && t.done).length;
    subtitle = `${open} open · ${done} done`;
  } else if (v.startsWith('tag:')) {
    title = '#' + v.slice(4);
    crumb = 'Tag';
    subtitle = `${visibleTasks().length} tasks`;
  }

  dom.crumb.textContent = crumb;
  dom.title.innerHTML = '';
  const titleEl = el('span', { class: 'editable', spellcheck: 'false' }, title);
  if (v.startsWith('list:')) {
    titleEl.addEventListener('dblclick', () => {
      titleEl.contentEditable = 'true';
      titleEl.focus();
      document.execCommand('selectAll', false, null);
    });
    titleEl.addEventListener('blur', () => {
      titleEl.contentEditable = 'false';
      const newName = titleEl.textContent.trim();
      const l = state.lists.find(x => x.id === v.slice(5));
      if (l && newName) { l.name = newName; save(); renderSidebar(); }
    });
    titleEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
      if (e.key === 'Escape') { titleEl.textContent = title; titleEl.blur(); }
    });
  }
  dom.title.appendChild(titleEl);

  if (v.startsWith('list:')) {
    const delBtn = el('button', {
      class: 'icon-btn',
      title: 'Delete list',
      style: 'border:0;background:transparent;color:var(--ink-muted);font-size:14px;padding:4px 8px;border-radius:4px;',
      onclick: () => deleteList(v.slice(5)),
    }, '×');
    dom.title.appendChild(delBtn);
  }

  dom.subtitle.textContent = subtitle;

  // Progress ring
  const showProgress = v === 'today' || v === 'all' || v.startsWith('list:');
  const ring = $('.progress', dom.mainHead);
  if (ring) {
    let total2, done2;
    if (v.startsWith('list:')) {
      const lid = v.slice(5);
      total2 = state.tasks.filter(t => t.listId === lid).length;
      done2 = state.tasks.filter(t => t.listId === lid && t.done).length;
    } else if (v === 'today') {
      const todays = state.tasks.filter(t => t.due != null && t.due <= endOfToday() && (!t.done || sameDay(t.completedAt, Date.now())));
      total2 = todays.length;
      done2 = todays.filter(t => t.done).length;
    } else {
      total2 = state.tasks.length;
      done2 = state.tasks.filter(t => t.done).length;
    }
    const pct = total2 === 0 ? 0 : Math.round((done2 / total2) * 100);
    const R = 18, C = 2 * Math.PI * R;
    ring.style.display = showProgress && total2 > 0 ? 'flex' : 'none';
    $('.fill', ring).setAttribute('stroke-dasharray', C);
    $('.fill', ring).setAttribute('stroke-dashoffset', C - (pct/100) * C);
    $('.pct', ring).textContent = pct + '%';
    $('.ratio', ring).textContent = `${done2}/${total2}`;
  }
}

function sameDay(a, b) {
  if (!a || !b) return false;
  const x = new Date(a), y = new Date(b);
  return x.toDateString() === y.toDateString();
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function renderCalstrip() {
  dom.calstrip.innerHTML = '';
  const start = new Date(); start.setHours(0,0,0,0);
  for (let i = 0; i < 14; i++) {
    const d = new Date(start.getTime() + i * 86400e3);
    const dayStart = d.getTime();
    const dayEnd = dayStart + 86400e3;
    const dayTasks = state.tasks.filter(t => !t.done && t.due != null && t.due >= dayStart && t.due < dayEnd);
    const isToday = i === 0;
    const isActive = state.draftDate && new Date(state.draftDate).toDateString() === d.toDateString();
    const btn = el('button', {
      class: 'calstrip-day' + (isToday ? ' today' : '') + (isActive ? ' active' : '') + (i >= 7 ? ' extra-week' : ''),
      onclick: () => {
        state.draftDate = isActive ? null : d.toISOString();
        renderAll();
      },
    }, [
      el('span', { class: 'dow' }, d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0,3)),
      el('span', { class: 'num' }, String(d.getDate())),
      el('span', { class: 'dots' },
        Array.from({length: Math.min(dayTasks.length, 4)}).map(() => el('i'))
      ),
    ]);
    dom.calstrip.appendChild(btn);
  }
}

function renderTasks() {
  if (state.view === 'stats') {
    dom.tasks.innerHTML = '';
    if (window.renderStatsInto) window.renderStatsInto(dom.tasks);
    return;
  }
  const list = visibleTasks();
  dom.tasks.innerHTML = '';

  if (list.length === 0) {
    const msgs = {
      today: ['All clear', 'Nothing due today. Add something or take a break.'],
      upcoming: ['Wide open', 'No tasks scheduled in the next week.'],
      all: ['Inbox zero', 'No open tasks. Click + to add one.'],
      done: ['Nothing done yet', 'Completed tasks will appear here.'],
    };
    const key = state.view.startsWith('list:') ? 'all' : state.view.startsWith('tag:') ? 'all' : state.view;
    const [glyph, msg] = msgs[key] || msgs.all;
    dom.tasks.appendChild(el('li', { class: 'empty' }, [
      el('div', { class: 'glyph' }, '— ' + glyph + ' —'),
      el('div', { class: 'msg' }, msg),
    ]));
    return;
  }

  // Sort: priority desc, due asc (nulls last), createdAt desc
  list.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.due == null && b.due != null) return 1;
    if (a.due != null && b.due == null) return -1;
    if (a.due !== b.due) return (a.due || 0) - (b.due || 0);
    return (b.t || 0) - (a.t || 0);
  });

  // Section grouping in some views
  if (state.view === 'upcoming' || state.view === 'today') {
    const groups = groupByDay(list);
    for (const [label, items] of groups) {
      dom.tasks.appendChild(el('li', { class: 'section-head' }, [
        el('span', {}, label),
        el('span', { class: 'rule' }),
      ]));
      items.forEach(t => dom.tasks.appendChild(renderTask(t)));
    }
  } else {
    list.forEach(t => dom.tasks.appendChild(renderTask(t)));
  }
}

function groupByDay(list) {
  const now = new Date(); now.setHours(0,0,0,0);
  const groups = new Map();
  for (const t of list) {
    if (t.due == null) {
      if (!groups.has('No date')) groups.set('No date', []);
      groups.get('No date').push(t);
      continue;
    }
    const d = new Date(t.due); d.setHours(0,0,0,0);
    const diff = Math.round((d - now) / 86400e3);
    let key;
    if (diff < 0) key = 'Overdue';
    else if (diff === 0) key = 'Today';
    else if (diff === 1) key = 'Tomorrow';
    else if (diff < 7) key = d.toLocaleDateString(undefined, { weekday: 'long' });
    else key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return groups;
}

function renderTask(t) {
  const li = el('li', {
    class: 'task' + (t.done ? ' done' : '') + (state.expandedTaskId === t.id ? ' expanded' : ''),
    'data-id': t.id,
    'data-priority': String(t.priority || 0),
    tabindex: '0',
    draggable: 'true',
  });

  const cb = el('input', { type: 'checkbox', class: 'check' });
  cb.checked = t.done;
  cb.addEventListener('change', () => {
    t.done = cb.checked;
    t.completedAt = cb.checked ? Date.now() : null;
    if (cb.checked && window.handleRecurring) window.handleRecurring(t);
    save();
    renderAll();
    if (cb.checked && window.maybeConfetti) window.maybeConfetti(t);
  });

  const pri = el('div', { class: 'priority' });

  // Body
  const textEl = el('div', { class: 'text', spellcheck: 'false' }, t.text);
  textEl.addEventListener('click', e => { if (!t.done) editText(textEl, t); });

  const list = state.lists.find(l => l.id === t.listId);
  const metaParts = [];
  if (t.due != null) {
    metaParts.push(el('span', { class: 'due-chip ' + dueClass(t.due) }, formatDue(t.due)));
  }
  if (t.tags && t.tags.length) {
    t.tags.forEach(tag => metaParts.push(el('span', { class: 'tag' }, '#' + tag)));
  }
  if (t.subtasks && t.subtasks.length) {
    const done = t.subtasks.filter(s => s.done).length;
    metaParts.push(el('span', { class: 'subcount' }, [
      el('span', { html: iconList() }),
      el('span', {}, `${done}/${t.subtasks.length}`),
    ]));
  }
  if (list && !state.view.startsWith('list:')) {
    metaParts.push(el('span', { class: 'list-pill' }, [
      el('span', { class: 'list-dot', style: 'background:' + list.color }),
      el('span', {}, list.name),
    ]));
  }
  const meta = el('div', { class: 'meta-row' }, metaParts);
  const body = el('div', { class: 'body' }, [textEl, metaParts.length ? meta : null]);

  // Actions
  const actions = el('div', { class: 'actions' }, [
    el('button', { title: 'Focus (F)', html: iconTimer(), onclick: () => window.startFocus && window.startFocus(t.id) }),
    el('button', { title: 'Expand (E)', html: iconExpand(), onclick: () => toggleExpand(t.id) }),
    el('button', { title: 'AI options', html: iconSparkle(), onclick: e => openAiMenu(e.currentTarget, t) }),
    el('button', { class: 'danger', title: 'Delete (⌫)', html: iconTrash(), onclick: () => deleteTask(t.id) }),
  ]);

  if (window.bulkState && window.bulkState.selected.has(t.id)) li.classList.add('bulk-selected');

  // Shift-click for bulk select
  li.addEventListener('click', e => {
    if (e.shiftKey && window.toggleBulk) {
      e.preventDefault();
      window.toggleBulk(t.id);
    }
  });

  li.append(cb, pri, body, el('span'), actions);

  // Expand section
  if (state.expandedTaskId === t.id) {
    li.appendChild(renderExpand(t));
  }

  // Keyboard
  li.addEventListener('keydown', e => taskKeydown(e, t, li));

  // Drag
  attachDrag(li, t);

  return li;
}

function renderExpand(t) {
  const wrap = el('div', { class: 'task-expand' });

  // Subtasks
  const subList = el('ul', { class: 'subs' });
  t.subtasks ||= [];
  t.subtasks.forEach((s, i) => {
    const sub = el('li', { class: 'sub' + (s.done ? ' sdone' : '') });
    const scb = el('input', { type: 'checkbox' });
    scb.checked = s.done;
    scb.addEventListener('change', () => { s.done = scb.checked; save(); renderTasks(); });
    const stx = el('div', { class: 'stext', contenteditable: 'true', spellcheck: 'false' }, s.text);
    stx.addEventListener('blur', () => { s.text = stx.textContent.trim(); save(); });
    stx.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); stx.blur(); }
    });
    const del = el('button', { title: 'Remove', onclick: () => {
      t.subtasks.splice(i, 1); save(); renderTasks();
    } }, '×');
    sub.append(scb, stx, del);
    subList.appendChild(sub);
  });

  const addSubBtn = el('button', { class: 'add-sub', onclick: e => {
    const input = el('input', {
      class: 'add-sub-input',
      placeholder: 'Add subtask…',
      onkeydown: ev => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          const v = input.value.trim();
          if (v) {
            t.subtasks.push({ id: id(), text: v, done: false });
            save();
            renderTasks();
          }
        } else if (ev.key === 'Escape') {
          renderTasks();
        }
      },
      onblur: () => {
        const v = input.value.trim();
        if (v) {
          t.subtasks.push({ id: id(), text: v, done: false });
          save();
        }
        renderTasks();
      },
    });
    e.currentTarget.replaceWith(input);
    input.focus();
  } }, '+ Add subtask');

  // Row: due + priority + list
  const dueInput = el('input', { type: 'datetime-local' });
  if (t.due) dueInput.value = toLocalDatetime(t.due);
  dueInput.addEventListener('change', () => {
    t.due = dueInput.value ? new Date(dueInput.value).getTime() : null;
    save();
    renderAll();
  });

  const listSelect = el('select');
  state.lists.forEach(l => {
    const opt = el('option', { value: l.id }, l.name);
    if (l.id === t.listId) opt.selected = true;
    listSelect.appendChild(opt);
  });
  listSelect.addEventListener('change', () => {
    t.listId = listSelect.value;
    save();
    renderAll();
  });

  const priPick = el('div', { class: 'pri-pick' });
  [0, 1, 2, 3].forEach(p => {
    const lbl = p === 0 ? '—' : 'P' + (4 - p);
    const btn = el('button', {
      class: t.priority === p ? 'active' : '',
      onclick: () => { t.priority = p; save(); renderAll(); },
    }, lbl);
    priPick.appendChild(btn);
  });

  // Recurrence picker
  const recurSelect = el('select');
  const recurOptions = [
    ['', 'Never'],
    ['daily', 'Daily'],
    ['weekdays', 'Weekdays'],
    ['weekly', 'Weekly'],
    ['monthly', 'Monthly'],
  ];
  recurOptions.forEach(([v, lbl]) => {
    const opt = el('option', { value: v }, lbl);
    if ((t.recur || '') === v) opt.selected = true;
    recurSelect.appendChild(opt);
  });
  recurSelect.addEventListener('change', () => {
    t.recur = recurSelect.value || null;
    save();
    renderTasks();
  });

  const row = el('div', { class: 'row' }, [
    el('label', {}, 'DUE'), dueInput,
    el('label', {}, 'PRIORITY'), priPick,
    el('label', {}, 'LIST'), listSelect,
    el('label', {}, 'REPEAT'), recurSelect,
  ]);

  // Notes
  const notes = el('textarea', { class: 'notes', placeholder: 'Notes…' }, t.notes || '');
  notes.addEventListener('input', () => { t.notes = notes.value; save(); });

  // AI row
  const aiRow = el('div', { class: 'ai-row' }, [
    el('button', { onclick: e => aiBreakdown(t, e.currentTarget) }, [el('span', { html: iconSparkle() }), el('span', {}, 'Break into subtasks')]),
    el('button', { onclick: e => aiRewrite(t, e.currentTarget) }, [el('span', { html: iconSparkle() }), el('span', {}, 'Rewrite clearer')]),
    el('button', { onclick: e => aiSuggestDate(t, e.currentTarget) }, [el('span', { html: iconSparkle() }), el('span', {}, 'Suggest due date')]),
    el('button', { onclick: e => aiTag(t, e.currentTarget) }, [el('span', { html: iconSparkle() }), el('span', {}, 'Auto-tag')]),
  ]);

  wrap.append(subList, addSubBtn, row, notes, aiRow);
  return wrap;
}

function toLocalDatetime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toggleExpand(taskId) {
  state.expandedTaskId = state.expandedTaskId === taskId ? null : taskId;
  renderTasks();
}

/* ───────────── Editing ───────────── */
function editText(textEl, t) {
  if (t.done) return;
  textEl.contentEditable = 'true';
  textEl.focus();
  const r = document.createRange(); r.selectNodeContents(textEl);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  const original = t.text;
  const finish = (commit) => {
    textEl.contentEditable = 'false';
    const v = textEl.textContent.trim();
    if (commit && v) { t.text = v; save(); } else { textEl.textContent = original; }
    textEl.removeEventListener('blur', onBlur);
    textEl.removeEventListener('keydown', onKey);
  };
  const onBlur = () => finish(true);
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); textEl.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); textEl.blur(); }
  };
  textEl.addEventListener('blur', onBlur);
  textEl.addEventListener('keydown', onKey);
}

/* ───────────── Adding / Deleting ───────────── */
function addFromInput() {
  const raw = dom.qadd.value.trim();
  if (!raw) return;
  const parsed = parseInput(raw);
  if (!parsed.text) return;
  const listId = state.view.startsWith('list:') ? state.view.slice(5) : state.lists[0].id;
  const task = {
    id: id(),
    listId,
    text: parsed.text,
    done: false,
    t: Date.now(),
    due: parsed.due || null,
    priority: parsed.priority || 0,
    tags: parsed.tags,
    subtasks: [],
    notes: '',
    order: state.tasks.length,
  };
  state.tasks.unshift(task);
  dom.qadd.value = '';
  renderPreview();
  save();
  renderAll();
}

function deleteTask(taskId) {
  const idx = state.tasks.findIndex(t => t.id === taskId);
  if (idx < 0) return;
  const t = state.tasks[idx];
  const li = $(`.task[data-id="${taskId}"]`, dom.tasks);
  if (li) li.classList.add('exit');
  setTimeout(() => {
    state.tasks.splice(idx, 1);
    save();
    renderAll();
    showUndo(`Deleted "${ellipsis(t.text)}"`, () => {
      state.tasks.splice(idx, 0, t);
      save();
      renderAll();
    });
  }, 200);
}

function deleteList(listId) {
  const list = state.lists.find(l => l.id === listId);
  if (!list) return;
  if (!confirm(`Delete list "${list.name}" and all its tasks?`)) return;
  const removed = state.tasks.filter(t => t.listId === listId);
  state.tasks = state.tasks.filter(t => t.listId !== listId);
  const idx = state.lists.findIndex(l => l.id === listId);
  state.lists.splice(idx, 1);
  state.view = 'all';
  save();
  renderAll();
  showUndo(`Deleted list "${list.name}"`, () => {
    state.lists.splice(idx, 0, list);
    state.tasks.push(...removed);
    state.view = 'list:' + listId;
    save();
    renderAll();
  });
}

function newList() {
  const colors = ['oklch(0.6 0.15 230)', 'oklch(0.65 0.13 150)', 'oklch(0.65 0.16 30)', 'oklch(0.7 0.14 320)', 'oklch(0.7 0.12 60)'];
  const name = prompt('Name your new list:');
  if (!name) return;
  const l = { id: id(), name: name.trim(), color: colors[state.lists.length % colors.length] };
  state.lists.push(l);
  state.view = 'list:' + l.id;
  save();
  renderAll();
}

function renameList(listId) {
  const l = state.lists.find(x => x.id === listId);
  if (!l) return;
  const v = prompt('Rename list:', l.name);
  if (v && v.trim()) { l.name = v.trim(); save(); renderAll(); }
}

function ellipsis(s, n = 36) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/* ───────────── Undo toast ───────────── */
let toastTimer;
function showUndo(label, restore) {
  clearTimeout(toastTimer);
  dom.toast.innerHTML = '';
  dom.toast.append(
    el('span', {}, label),
    el('button', { onclick: () => { restore(); hideToast(); } }, 'Undo')
  );
  dom.toast.classList.add('show');
  toastTimer = setTimeout(hideToast, UNDO_MS);
}
function hideToast() {
  dom.toast.classList.remove('show');
}

/* ───────────── Drag & drop reorder ───────────── */
let dragTask = null;
function attachDrag(li, t) {
  li.addEventListener('dragstart', e => {
    dragTask = t;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.id);
  });
  li.addEventListener('dragend', () => {
    li.classList.remove('dragging');
    $$('.task.drop-before, .task.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    dragTask = null;
  });
  li.addEventListener('dragover', e => {
    if (!dragTask || dragTask.id === t.id) return;
    e.preventDefault();
    const rect = li.getBoundingClientRect();
    const above = (e.clientY - rect.top) < rect.height / 2;
    $$('.task.drop-before, .task.drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    li.classList.add(above ? 'drop-before' : 'drop-after');
  });
  li.addEventListener('drop', e => {
    if (!dragTask || dragTask.id === t.id) return;
    e.preventDefault();
    const rect = li.getBoundingClientRect();
    const above = (e.clientY - rect.top) < rect.height / 2;
    const targetIdx = state.tasks.findIndex(x => x.id === t.id);
    const fromIdx = state.tasks.findIndex(x => x.id === dragTask.id);
    if (fromIdx < 0 || targetIdx < 0) return;
    const moved = state.tasks.splice(fromIdx, 1)[0];
    const newIdx = state.tasks.findIndex(x => x.id === t.id) + (above ? 0 : 1);
    state.tasks.splice(newIdx, 0, moved);
    save();
    renderAll();
  });
}
function $$(s, r = document) { return [...r.querySelectorAll(s)]; }

/* ───────────── Keyboard ───────────── */
function taskKeydown(e, t, li) {
  if (e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'x' || e.key === ' ') {
    e.preventDefault();
    t.done = !t.done;
    t.completedAt = t.done ? Date.now() : null;
    save();
    renderAll();
  } else if (e.key === 'e' || e.key === 'Enter') {
    e.preventDefault();
    toggleExpand(t.id);
  } else if (e.key === 'Backspace' || e.key === 'd') {
    e.preventDefault();
    deleteTask(t.id);
  } else if (e.key === 'j' || e.key === 'ArrowDown') {
    e.preventDefault();
    const next = li.nextElementSibling;
    if (next && next.classList.contains('task')) next.focus();
  } else if (e.key === 'k' || e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = li.previousElementSibling;
    if (prev && prev.classList.contains('task')) prev.focus();
  } else if (['0','1','2','3'].includes(e.key)) {
    e.preventDefault();
    t.priority = e.key === '0' ? 0 : 4 - +e.key;
    save();
    renderTasks();
  }
}

function globalKeydown(e) {
  const inField = e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
  if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    if (window.openCmdK) window.openCmdK();
  } else if (e.key === '/' && !inField) {
    e.preventDefault();
    dom.qadd.focus();
  } else if (e.key === '?' && !inField) {
    e.preventDefault();
    dom.help.hidden = false;
  } else if (e.key === 'Escape') {
    dom.help.hidden = true;
    document.querySelectorAll('.ai-menu').forEach(m => m.remove());
    if (window.closeCmdK) window.closeCmdK();
    if (window.clearBulk) window.clearBulk();
    if (state.expandedTaskId) { state.expandedTaskId = null; renderTasks(); }
  } else if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    newList();
  } else if (e.key === 'f' && !inField) {
    const focused = document.activeElement;
    if (focused && focused.classList.contains('task')) {
      e.preventDefault();
      const tid = focused.dataset.id;
      if (window.startFocus) window.startFocus(tid);
    }
  }
}

/* ───────────── AI features ───────────── */
async function callClaude(prompt) {
  if (!window.claude || !window.claude.complete) {
    throw new Error('Claude is not available in this environment.');
  }
  return await window.claude.complete(prompt);
}

async function aiBreakdown(t, btn) {
  btn.classList.add('busy');
  try {
    const out = await callClaude(`Break this task into 3-6 specific, concrete subtasks. Return JSON only, no commentary: {"subtasks": ["...", "..."]}\n\nTask: ${t.text}${t.notes ? '\nNotes: ' + t.notes : ''}`);
    const json = extractJson(out);
    if (json && Array.isArray(json.subtasks)) {
      t.subtasks ||= [];
      json.subtasks.forEach(s => t.subtasks.push({ id: id(), text: s, done: false }));
      save();
      renderAll();
      showUndo(`Added ${json.subtasks.length} subtasks`, () => {
        t.subtasks.splice(t.subtasks.length - json.subtasks.length, json.subtasks.length);
        save(); renderAll();
      });
    } else {
      showUndo('AI returned no subtasks', () => {});
    }
  } catch (err) {
    showUndo('AI error: ' + err.message, () => {});
  } finally {
    btn.classList.remove('busy');
  }
}

async function aiRewrite(t, btn) {
  btn.classList.add('busy');
  try {
    const out = await callClaude(`Rewrite this task to be clearer and more actionable. Keep it under 12 words. Return JSON only: {"text": "..."}\n\nTask: ${t.text}`);
    const json = extractJson(out);
    if (json && json.text) {
      const old = t.text;
      t.text = json.text;
      save();
      renderAll();
      showUndo(`Rewrote task`, () => { t.text = old; save(); renderAll(); });
    }
  } catch (err) {
    showUndo('AI error: ' + err.message, () => {});
  } finally {
    btn.classList.remove('busy');
  }
}

async function aiSuggestDate(t, btn) {
  btn.classList.add('busy');
  try {
    const today = new Date().toISOString().slice(0, 10);
    const out = await callClaude(`Today is ${today}. Suggest a realistic due date for this task. Return JSON only with ISO datetime: {"due": "2025-12-05T17:00", "reason": "short reason"}\n\nTask: ${t.text}`);
    const json = extractJson(out);
    if (json && json.due) {
      const old = t.due;
      t.due = new Date(json.due).getTime();
      save();
      renderAll();
      showUndo(`Due set: ${formatDue(t.due)}`, () => { t.due = old; save(); renderAll(); });
    }
  } catch (err) {
    showUndo('AI error: ' + err.message, () => {});
  } finally {
    btn.classList.remove('busy');
  }
}

async function aiTag(t, btn) {
  btn.classList.add('busy');
  try {
    const existingTags = [...new Set(state.tasks.flatMap(x => x.tags))];
    const out = await callClaude(`Suggest 1-3 short single-word tags for this task. Prefer existing tags if relevant: ${existingTags.join(', ') || '(none yet)'}. Return JSON only: {"tags": ["tag1", "tag2"]}\n\nTask: ${t.text}`);
    const json = extractJson(out);
    if (json && Array.isArray(json.tags)) {
      const old = [...t.tags];
      const newOnes = json.tags.map(x => x.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
      t.tags = [...new Set([...t.tags, ...newOnes])];
      save();
      renderAll();
      showUndo(`Tagged: ${newOnes.map(x => '#' + x).join(' ')}`, () => { t.tags = old; save(); renderAll(); });
    }
  } catch (err) {
    showUndo('AI error: ' + err.message, () => {});
  } finally {
    btn.classList.remove('busy');
  }
}

async function aiPlanDay(btn) {
  btn.classList.add('busy');
  try {
    const tasks = state.tasks.filter(t => !t.done && (t.due == null || t.due <= endOfToday() + 86400e3));
    const list = tasks.map((t, i) => `${i+1}. [${t.priority ? 'P' + (4-t.priority) : '—'}] ${t.text}${t.due ? ' (due ' + formatDue(t.due) + ')' : ''}`).join('\n');
    const out = await callClaude(`I have these open tasks. Suggest an ordering for today, considering priorities and dependencies. Return JSON only: {"order": [task numbers in order], "note": "1-2 sentences of reasoning"}\n\nTasks:\n${list}`);
    const json = extractJson(out);
    if (json && Array.isArray(json.order)) {
      const oldOrder = [...state.tasks];
      const reordered = json.order.map(n => tasks[n - 1]).filter(Boolean);
      const rest = state.tasks.filter(t => !reordered.includes(t));
      state.tasks = [...reordered, ...rest];
      save();
      renderAll();
      showUndo(`Day planned. ${json.note || ''}`, () => { state.tasks = oldOrder; save(); renderAll(); });
    }
  } catch (err) {
    showUndo('AI error: ' + err.message, () => {});
  } finally {
    btn.classList.remove('busy');
  }
}

function extractJson(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function openAiMenu(anchor, t) {
  document.querySelectorAll('.ai-menu').forEach(m => m.remove());
  const menu = el('div', { class: 'ai-menu' }, [
    el('div', { class: 'label' }, 'AI actions'),
    el('button', { onclick: () => { menu.remove(); aiBreakdown(t, anchor); } }, [
      el('span', { html: iconSparkle() }), el('span', {}, 'Break into subtasks'),
    ]),
    el('button', { onclick: () => { menu.remove(); aiRewrite(t, anchor); } }, [
      el('span', { html: iconSparkle() }), el('span', {}, 'Rewrite clearer'),
    ]),
    el('button', { onclick: () => { menu.remove(); aiSuggestDate(t, anchor); } }, [
      el('span', { html: iconSparkle() }), el('span', {}, 'Suggest due date'),
    ]),
    el('button', { onclick: () => { menu.remove(); aiTag(t, anchor); } }, [
      el('span', { html: iconSparkle() }), el('span', {}, 'Auto-tag'),
    ]),
  ]);
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = (r.bottom + 4) + 'px';
  menu.style.left = Math.min(r.left, window.innerWidth - 220) + 'px';
  setTimeout(() => {
    const close = (e) => {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    };
    document.addEventListener('click', close);
  }, 0);
}

/* ───────────── Live parse preview ───────────── */
function renderPreview() {
  const raw = dom.qadd.value;
  if (!raw.trim()) { dom.preview.innerHTML = ''; return; }
  const parsed = parseInput(raw);
  dom.preview.innerHTML = '';
  parsed.tokens.forEach(tok => {
    dom.preview.appendChild(el('span', { class: 'pchip ' + tok.kind }, tok.label));
  });
}

/* ───────────── Theme / density ───────────── */
function applyTheme() {
  const t = state.theme;
  if (t === 'auto') {
    document.documentElement.setAttribute('data-theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', t);
  }
}
function applyDensity() {
  document.documentElement.setAttribute('data-density', state.density);
}
function cycleTheme() {
  state.theme = state.theme === 'auto' ? 'light' : state.theme === 'light' ? 'dark' : 'auto';
  save();
  applyTheme();
  showUndo('Theme: ' + state.theme, () => {});
}
function cycleDensity() {
  state.density = state.density === 'comfy' ? 'compact' : 'comfy';
  save();
  applyDensity();
}

/* ───────────── Export / Import ───────────── */
function exportData() {
  const data = { lists: state.lists, tasks: state.tasks, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tasks-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!Array.isArray(d.tasks) || !Array.isArray(d.lists)) throw 0;
        if (confirm(`Import ${d.tasks.length} tasks across ${d.lists.length} lists? This replaces current data.`)) {
          state.lists = d.lists;
          state.tasks = d.tasks;
          state.view = 'all';
          save();
          renderAll();
        }
      } catch { alert('Invalid file.'); }
    };
    r.readAsText(f);
  };
  input.click();
}

/* ───────────── Icons ───────────── */
function iconCircle() { return '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="7" cy="7" r="5.5"/></svg>'; }
function iconCal() { return '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="11" height="10" rx="1.5"/><path d="M1.5 5.5h11M4.5 1v3M9.5 1v3"/></svg>'; }
function iconStack() { return '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 4h10M2 7h10M2 10h10"/></svg>'; }
function iconCheck() { return '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l3 3 5-6"/></svg>'; }
function iconList() { return '<svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 4l1.5 1.5L7 3M3 9l1.5 1.5L7 8M9 4h3M9 9h3"/></svg>'; }
function iconExpand() { return '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 6l3 3 3-3"/></svg>'; }
function iconSparkle() { return '<svg viewBox="0 0 14 14" width="13" height="13" fill="currentColor"><path d="M7 1l1 4 4 1-4 1-1 4-1-4-4-1 4-1z"/></svg>'; }
function iconTrash() { return '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 4h8M5.5 4V2.5h3V4M4 4l.5 8h5L10 4"/></svg>'; }
function iconSun() { return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.5 3.5l1 1M11.5 11.5l1 1M3.5 12.5l1-1M11.5 4.5l1-1"/></svg>'; }
function iconDensity() { return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 5h10M3 8h10M3 11h10"/></svg>'; }
function iconUp() { return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8 13V4M4 7l4-3 4 3"/></svg>'; }
function iconDown() { return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8 3v9M4 9l4 3 4-3"/></svg>'; }
function iconTimer() { return '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="7" cy="8" r="4.5"/><path d="M7 5.5V8l1.5 1M5.5 1.5h3"/></svg>'; }
function iconChart() { return '<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2 12h10M3.5 12V8M6.5 12V5M9.5 12V9"/></svg>'; }

/* ───────────── Init ───────────── */
function renderAll() {
  const isStats = state.view === 'stats';
  document.body.classList.toggle('stats-mode', isStats);
  renderSidebar();
  renderHeader();
  renderCalstrip();
  renderTasks();
  if (window.renderFocusBar) window.renderFocusBar();
  if (window.renderBulkBar) window.renderBulkBar();
}

function init() {
  // Cache dom
  dom.views = $('#views');
  dom.lists = $('#lists');
  dom.tagcloud = $('#tagcloud');
  dom.crumb = $('#crumb');
  dom.title = $('#title');
  dom.subtitle = $('#subtitle');
  dom.mainHead = $('.main-head');
  dom.calstrip = $('#calstrip');
  dom.qadd = $('#qadd');
  dom.preview = $('#preview');
  dom.tasks = $('#tasks');
  dom.toast = $('#toast');
  dom.help = $('#help');

  // Fill in icons in sidebar footer
  $('#theme-btn').innerHTML = iconSun();
  $('#density-btn').innerHTML = iconDensity();
  $('#export-btn').innerHTML = iconUp();
  $('#import-btn').innerHTML = iconDown();
  $('#help-btn').textContent = '?';

  // Events
  $('#composer').addEventListener('submit', e => { e.preventDefault(); addFromInput(); });
  dom.qadd.addEventListener('input', renderPreview);
  $('#ai-btn').addEventListener('click', e => {
    const text = dom.qadd.value.trim();
    if (text) {
      // Treat as immediate breakdown into a new task with subtasks
      addFromInput();
      const t = state.tasks[0];
      if (t) aiBreakdown(t, e.currentTarget);
    } else {
      aiPlanDay(e.currentTarget);
    }
  });
  $('#add-list-btn').addEventListener('click', newList);
  $('#theme-btn').addEventListener('click', cycleTheme);
  $('#density-btn').addEventListener('click', cycleDensity);
  $('#export-btn').addEventListener('click', exportData);
  $('#import-btn').addEventListener('click', importData);
  $('#help-btn').addEventListener('click', () => dom.help.hidden = false);
  dom.help.addEventListener('click', e => { if (e.target === dom.help) dom.help.hidden = true; });

  document.addEventListener('keydown', globalKeydown);

  if (!load()) seed();
  applyTheme();
  applyDensity();

  // Expose hooks for extras.js
  Object.assign(window, { state, save, renderAll, renderTasks, renderSidebar, id, el, $, $$, formatDue, endOfToday, showUndo, deleteTask });

  if (window.initExtras) window.initExtras();
  renderAll();

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'auto') applyTheme();
  });
}

document.addEventListener('DOMContentLoaded', init);
