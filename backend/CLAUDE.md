# Backend

Go, stdlib `net/http` only (no framework, no deps). Cross-cutting repo notes (running the app, credentials, git) are in the root [CLAUDE.md](../CLAUDE.md) — this file is backend-specific.

## Layout

- `main.go` — process bootstrap: loads config, constructs the Todoist client/event broker, wires routes, starts the sync poller goroutine, and the CORS middleware. Route handlers and the poller live in their own files (below) — don't grow this one back into a monolith.
- `handlers.go` — every `/api/*` HTTP handler.
- `poller.go` — `runSyncPoller`, which polls Todoist's incremental Sync API and publishes "changed" events via the broker.
- `internal/todoist` — Todoist API client (`client.go` for tasks/projects/collaborators, `sync.go` for the incremental Sync API).
- `internal/config` — loads `.env`.
- `internal/settings` — loads `config/settings.json`.
- `internal/events` — minimal in-process pub/sub broker used to push SSE "changed" notifications to connected browsers (`/api/events`).

## Gotchas specific to this machine / project

- **`go.work` conflict**: there's a Go workspace file elsewhere on this machine that lists other projects and does not include this repo, so plain `go build`/`go run`/`go mod`/`gofmt` in `backend/` fail with "directory prefix . does not contain modules listed in go.work". Always prefix Go commands with `GOWORK=off` (the Makefile already does this for `make dev`). Don't add this repo to that workspace file without asking — it's shared config for other unrelated projects.
- **Go is old (1.19)**: don't use stdlib features that need 1.22+ (e.g. method-pattern routing in `http.ServeMux`). Generics are fine (1.18+).
- **Todoist API version**: use `https://api.todoist.com/api/v1` — NOT `rest/v2`, which is dead and returns `410 Gone`. v1 list endpoints (`/tasks`, `/projects`) return `{"results": [...], "next_cursor": ...}` and are paginated (50/page); `internal/todoist/client.go`'s `fetchAllPages` loops on `cursor` until `next_cursor` is null. Field names differ from the old v2 docs you might find: `checked` (not `is_completed`), `note_count` (not `comment_count`), `added_at` (not `created_at`), `inbox_project` (not `is_inbox_project`); no per-task/project `url` field.
- **Some write endpoints return `204 No Content`, not `200` + JSON** — e.g. `POST /tasks/{id}/close` (used by `Client.CompleteTask`). `internal/todoist/client.go`'s `post()` helper accepts either status and skips the JSON decode when `out` is `nil`; if you add another write endpoint that behaves like this, pass `nil` for `out` rather than adding a parallel helper.

## Default homepage project(s) and settings writes

`internal/settings` reads/writes `config/settings.json` (path is `../config/settings.json`, relative to the `backend/` working directory). `GET /api/settings` serves the current settings; `PUT /api/settings` replaces them wholesale (decode into `settings.Settings`, then `settings.Save`) — used by the frontend's Settings pane. `GET /api/tasks` takes an optional `?project_id=` filter so the frontend only fetches tasks for active projects; `GET /api/sections?project_id=` (via `todoist.Client.FetchSections`) backs the per-project section list the Settings pane uses to toggle section visibility. See root CLAUDE.md for the config file format and frontend/CLAUDE.md for how the frontend uses this.
