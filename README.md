# Tasks

A keyboard-friendly, local-first to-do app in a single HTML file + supporting CSS/JS. No build step, no dependencies — open `Todo List v2.html` in a browser.

## Features

**Organization**
- Multiple **lists** (Inbox / Work / Personal by default — rename via double-click, delete, add your own)
- **Tags** parsed from `#tag` in any task; tag chips in sidebar filter the view
- **Smart views**: Today, Upcoming (next 7 days), All, Completed, **Stats**
- **Subtasks** with progress count on the parent task
- **Notes** field per task
- **Recurring tasks** — daily, weekdays, weekly, monthly. Next instance auto-spawns on completion.

**Time**
- **Due dates** parsed from natural language: `tomorrow`, `tonight`, `fri`, `next mon`, `in 3 days`, `5pm`, `14:30`, `12/5`, `2025-12-05`
- **Calendar strip** showing the next 14 days with task density dots — click a day to filter
- **Overdue / today** styling on date chips
- **Progress ring** in the header tracking completion
- **Focus / Pomodoro timer** — pin a task, 25/5 cycles, auto-switch mode, soft beep + notification

**Interaction**
- **Quick-add** with live parse preview chips below the input
- **Priority** P1/P2/P3 via `!`, `!!`, `!!!` (or `1`/`2`/`3` keys on a focused task)
- **Drag-to-reorder** tasks
- **Bulk select** — Shift+click any task; batch complete, move, tag, prioritize, or delete
- **Command palette** — Cmd/Ctrl+K to fuzzy-search tasks, jump to lists/tags/views, run actions
- **Keyboard-first**: `/` focus add, `j`/`k` navigate, `x`/`space` complete, `e` expand, `f` focus mode, `d` delete, `1`–`3`/`0` priority, `?` help
- **Undo toast** after every destructive action
- **Inline editing** — click any task text to rewrite

**Visual**
- **Light / dark / auto** theme (respects system preference)
- **Comfy / compact** density toggle
- **Confetti** when you clear today's list
- Subtle animations on add and delete

**AI** (via `window.claude` when available)
- **Break into subtasks** — turns a vague task into 3–6 concrete steps
- **Rewrite clearer** — sharpens vague wording
- **Suggest due date** — picks a realistic deadline given the task
- **Auto-tag** — adds 1–3 tags, reusing existing ones when relevant
- **Plan my day** — reorders your open tasks for today, with a rationale

**Stats**
- KPIs: done all-time, open, overdue, day streak, avg per day
- 12-week **completion heatmap** (GitHub-style)
- Top tags bar chart
- Total focus time logged

**Data**
- Everything lives in `localStorage` under `tasks.v2` (focus state under `focus.v1`)
- **Export / Import** JSON from the sidebar footer (↑ / ↓)

## File layout

```
.
├── Todo List v2.html   ← entry point
├── styles.css
├── app.js
├── extras.js           ← recurring, cmdk, focus, bulk, stats, confetti
└── Todo List.html      ← v1 (simpler, kept for reference)
```

## Run it

Just open `Todo List v2.html` in any modern browser. No server required.

For local dev with a server (optional):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000/Todo List v2.html
```

## Push to GitHub

Run these commands in the folder containing the files:

```bash
git init
git add .
git commit -m "Initial commit: Tasks app"
git branch -M main
git remote add origin git@github.com:W0l1-stack/To-Do-list.git
git push -u origin main
```

If the repo already has commits and you want to overwrite, append `--force` to the last line. If you prefer HTTPS over SSH, use `https://github.com/W0l1-stack/To-Do-list.git` instead.

## Keyboard reference

| Key | Action |
|---|---|
| `/` | Focus quick-add |
| `?` | Toggle help overlay |
| `⌘N` / `Ctrl+N` | New list |
| `Esc` | Close overlays, collapse expanded task |
| `j` / `↓` | Next task |
| `k` / `↑` | Previous task |
| `x` / `space` | Toggle complete |
| `e` / `↵` | Expand / collapse |
| `d` / `⌫` | Delete (with undo) |
| `0` `1` `2` `3` | Priority — none / P3 / P2 / P1 |

## Quick-add syntax

```
Buy milk tomorrow 5pm #shopping !!
└─ task text ──┘ └─ date ─┘└─tag─┘ └ P2 priority
```

Supported date phrases:
- `today`, `tonight`, `tomorrow`, `tmr`
- weekday names: `mon`, `tuesday`, `fri`…
- `next mon`, `this fri`
- `in 3 days`, `in 2 weeks`, `in 4 hours`
- times: `5pm`, `9:30am`, `14:00`
- exact: `12/5`, `12/5/2026`, `2026-12-05`

## License

MIT
