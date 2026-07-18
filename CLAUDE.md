# Quokked

Visualizes and groups the user's Todoist tasks. See [README.md](README.md) for project vision/scope. This file is operational notes for working in this repo.

## Stack

- `backend/` — Go, stdlib `net/http` only (no framework, no deps). `main.go` wires routes; `internal/todoist` is the Todoist API client; `internal/config` loads `.env`; `internal/settings` loads `config/settings.json`.
- `frontend/` — React + Vite, plain fetch (no data-fetching library). `src/api.js` calls the backend; `src/grouping.js` has the group-by logic; `src/App.jsx` is the only component so far.

## Run it

```
make dev
```

Starts backend (`:8080`) and frontend (`:5173`) together, installs frontend deps on first run, stops both on Ctrl+C. Requires `backend/.env` to already exist (see Credentials below) or it exits with a message.

## Gotchas specific to this machine / project

- **`go.work` conflict**: there's a Go workspace file elsewhere on this machine that lists other projects and does not include this repo, so plain `go build`/`go run`/`go mod`/`gofmt` in `backend/` fail with "directory prefix . does not contain modules listed in go.work". Always prefix Go commands with `GOWORK=off` (the Makefile already does this for `make dev`). Don't add this repo to that workspace file without asking — it's shared config for other unrelated projects.
- **Go is old (1.19)**: don't use stdlib features that need 1.22+ (e.g. method-pattern routing in `http.ServeMux`). Generics are fine (1.18+).
- **Todoist API version**: use `https://api.todoist.com/api/v1` — NOT `rest/v2`, which is dead and returns `410 Gone`. v1 list endpoints (`/tasks`, `/projects`) return `{"results": [...], "next_cursor": ...}` and are paginated (50/page); `internal/todoist/client.go`'s `fetchAllPages` loops on `cursor` until `next_cursor` is null. Field names differ from the old v2 docs you might find: `checked` (not `is_completed`), `note_count` (not `comment_count`), `added_at` (not `created_at`), `inbox_project` (not `is_inbox_project`); no per-task/project `url` field.
- **Node wasn't preinstalled** on this machine; it was installed via `brew install node` during setup. If it's ever missing again, that's the fix.
- **LAN access is intentional**: Vite has `host: true` and `allowedHosts: true`, the backend CORS middleware reflects whatever `Origin` header it receives, and the frontend's API base defaults to `http://${window.location.hostname}:8080` rather than a hardcoded `localhost`. This lets the user run `make dev` on one machine and browse from another device on the LAN by hostname or IP. There's no auth on the API — anyone on the network can read the tasks. Don't tighten this without checking with the user, and don't expose it beyond a trusted LAN.

## Credentials

`backend/.env` (gitignored) needs `TODOIST_API_TOKEN`. Copy from `backend/.env.example`. Token comes from the user's Todoist integrations settings page. Never print the token value in output.

## Default homepage project(s)

`config/settings.json` (gitignored, like `backend/.env`) holds `{"defaultProjects": ["Name"]}` — project name(s), matched case-insensitively against `/api/projects`, to show on the homepage by default. Copy from `config/settings.example.json` to set up a fresh checkout. Backend reads it via `internal/settings` (path is `../config/settings.json`, relative to the `backend/` working directory) and serves it at `GET /api/settings`. `GET /api/tasks` now takes an optional `?project_id=` filter so the frontend only fetches tasks for active projects. The frontend (`App.jsx`) fetches tasks for default projects on load; projects not in the default list appear in a bottom bar and are only fetched when the user clicks to add them. Which non-default projects are added persists across reloads via `localStorage` (key `quokked.addedProjectIds`), not in the config file.

## Git

`origin` remote is already set to `https://github.com/amyango/quokked` and `main` is configured to track `origin/main`, but nothing has been pushed yet (as of the commits made in this repo's initial setup session). Don't assume it's safe to push without checking with the user first.
