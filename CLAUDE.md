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

## Default homepage project(s) and section visibility

`config/settings.json` (gitignored, like `backend/.env`) holds `{"defaultProjects": ["Name"], "disabledSections": {"<project_id>": ["<section_id>"]}}` — project name(s) (matched case-insensitively against `/api/projects`) to show on the homepage by default, and per-project section ids whose tasks are hidden from the board. Editable by hand, or via the Settings pane in the UI. Copy from `config/settings.example.json` to set up a fresh checkout. This spans both sides: backend loading/serving/persisting is in `backend/CLAUDE.md`, frontend fetch/edit/persistence behavior is in `frontend/CLAUDE.md`.

## Git

`origin` remote is already set to `https://github.com/amyango/quokked` and `main` is configured to track `origin/main`, but nothing has been pushed yet (as of the commits made in this repo's initial setup session). Don't assume it's safe to push without checking with the user first.

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
