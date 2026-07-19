# Quokked

Visualizes and groups the user's Todoist tasks. See [README.md](README.md) for project vision/scope. This file is operational notes for working in this repo. Directory-specific notes live in `backend/CLAUDE.md` and `frontend/CLAUDE.md` — check those when working in those trees.

## Stack

- `backend/` — Go, stdlib `net/http` only (no framework, no deps). See `backend/CLAUDE.md`.
- `frontend/` — React + Vite, plain fetch (no data-fetching library). See `frontend/CLAUDE.md`.

## Run it

```
make restart
```

Starts backend (`:8080`) and frontend (`:5173`) together in the background, logging to `.logs/`, killing whatever's already on those ports first — safe to run again after every change. `make stop` stops both, `make logs` tails both log files. Requires `backend/.env` to already exist (see Credentials below) or it exits with a message.

**Default to `make restart`** when you (Claude) need the servers running — e.g. to hit the API or check the UI after a change. It's non-blocking, so you keep control of the shell rather than needing a foreground process you'd have to background yourself. Only run backend or frontend manually (`cd backend && GOWORK=off go run .` / `cd frontend && npm run dev`) when isolating a problem to one side — e.g. checking backend-only output without frontend noise, or vice versa.

`make dev` runs both in the foreground instead (Ctrl+C stops both) — that's for the user's interactive terminal use, not for Claude to invoke.

## LAN access is intentional

Vite has `host: true` and `allowedHosts: true`, the backend CORS middleware reflects whatever `Origin` header it receives, and the frontend's API base defaults to `http://${window.location.hostname}:8080` rather than a hardcoded `localhost`. This lets the user run `make dev` on one machine and browse from another device on the LAN by hostname or IP. There's no auth on the API — anyone on the network can read the tasks. Don't tighten this without checking with the user, and don't expose it beyond a trusted LAN.

## Credentials

`backend/.env` (gitignored) needs `TODOIST_API_TOKEN`. Copy from `backend/.env.example`. Token comes from the user's Todoist integrations settings page. Never print the token value in output.

## Default homepage project(s), section visibility, and theme

`config/settings.json` (gitignored, like `backend/.env`) holds `{"defaultProjects": ["Name"], "disabledSections": {"<project_id>": ["<section_id>"]}, "theme": "system", "colorScheme": "default"}` — project name(s) (matched case-insensitively against `/api/projects`) to show on the homepage by default, per-project section ids whose tasks are hidden from the board, the light/dark/system theme choice, and the selected card-accent color preset (see `frontend/src/theme.js` for the preset list). Editable by hand, or via the Settings pane in the UI. Copy from `config/settings.example.json` to set up a fresh checkout. This spans both sides: backend loading/serving/persisting is in `backend/CLAUDE.md`, frontend fetch/edit/persistence behavior is in `frontend/CLAUDE.md`. Since `PUT /api/settings` does a wholesale decode into `settings.Settings` and save, adding a new settings field is usually just: add the struct field (backend), add it to the two `useTaskBoard.js` spots that shape the settings object (initial load and post-save), and add a control for it in `SettingsPanel.jsx` — no route or handler changes needed.

## Git

`origin` remote is set to `https://github.com/amyango/quokked` and `main` tracks `origin/main` and has been pushed. Still, don't assume it's safe to push without checking with the user first — treat each push as needing fresh confirmation, not a standing permission.

## Conventions for concurrent work

This repo is organized so multiple agents/sessions can work in parallel:

- Keep this file lean and cross-cutting. Directory-specific guidance lives in
  that directory's CLAUDE.md (`backend/CLAUDE.md`, `frontend/CLAUDE.md`) —
  add new notes there, not here, unless they affect everyone.
- When adding functionality, put it in a new focused file/module rather than
  growing an existing large one (e.g. `backend/main.go` only wires routes;
  handlers live in `backend/handlers.go`, the background poller in
  `backend/poller.go`; frontend data/mutation logic lives in
  `frontend/src/useTaskBoard.js`, not `App.jsx`). A change's diff should stay
  within files related to that change.
- If a file or CLAUDE.md section keeps being edited by unrelated tasks,
  that's the signal to split it further.

When actually running multiple issues in parallel (e.g. via isolated git
worktrees, one per issue), a few things save round-trips:

- `backend/.env` and `config/settings.json` are gitignored, so they don't
  exist in a fresh worktree. Don't have parallel agents run `make dev` /
  `make restart` / `go run` — besides missing the token, every worktree
  shares the same machine, so they'd fight over `:8080`/`:5173`. Validate
  each agent's work with build/lint only (`GOWORK=off go build ./...` +
  `GOWORK=off gofmt -l .` for backend, `npm run build` + `npm run lint` for
  frontend); do the one live `make restart` smoke test yourself, after
  merging everything into the integrating worktree where `.env` exists.
- `frontend/src/App.jsx` is the one file almost every UI-facing issue
  touches (it's where new components get rendered and new props get wired
  from `useTaskBoard()`), so it's the most likely merge-conflict point
  between two otherwise-independent frontend issues even when their actual
  feature code doesn't overlap. Expect it, and resolve by keeping both
  sides' additions (e.g. both a new prop being added to a `<TaskCard>` call
  *and* a new component replacing that same block) rather than picking one
  side.
- Pick issues for a parallel batch by skimming which files/areas each one's
  scope section says it touches, not just their titles — two issues that
  sound unrelated (e.g. "pinned section" vs. "settings panel") can still
  both need to touch `App.jsx` or `useTaskBoard.js`.
