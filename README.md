# Quokked

A visualization and organization layer for [Todoist](https://todoist.com) tasks. Todoist is great at capturing tasks but not at helping you *see* them — Quokked pulls your tasks out and lets you view, group, and explore them in ways the stock app doesn't support.

Longer term this is meant to be a web app and a mobile app sharing a common backend. Right now it's an experimental first stage.

## Stage 1 goals

- Backend that authenticates to the Todoist API and fetches tasks
- Simple web server / API layer to serve that data to a frontend
- Frontend focused on one thing: making it easier to see and group all your tasks at once (by project, label, priority, due date, etc.) — not on task editing or feature parity with Todoist
- Groundwork for Todoist webhooks so the visualization can update automatically instead of relying on manual refresh/polling

Out of scope for now: mobile app, task mutation beyond what's needed for viewing, auth for multiple users (this is single-user/personal for the moment).

## Stack

- `backend/` — Go, standard library `net/http`. Fetches tasks/projects from the Todoist API v1 and re-serves them as JSON.
- `frontend/` — React + Vite. Fetches from the backend and renders tasks grouped by project, priority, or label.

The two run as separate dev servers. Both bind to all network interfaces, and the frontend's API calls default to whatever host you loaded the page from — so if you run `make dev` on one machine, you can browse to it from another device on the same network at `http://<hostname-or-ip>:5173`, no config needed. There's no auth on the API, so anyone on the network can read your tasks this way; fine for a home network, not something to expose beyond that.

## Credentials

This project talks to the Todoist API using a personal API token. Credentials are **not** committed — see `.gitignore`.

```
cd backend
cp .env.example .env
# then edit .env and set TODOIST_API_TOKEN
```

Get a token from [Todoist's integrations settings](https://app.todoist.com/app/settings/integrations/developer).

## Running locally

```
make dev
```

Starts the backend on `localhost:8080` and the frontend on `localhost:5173` together, installing frontend dependencies on first run. Ctrl+C stops both.

## Status

Stage 1 scaffold in place: Go backend serving `/api/tasks` and `/api/projects`, React frontend rendering them grouped by project/priority/label. Not yet built: webhooks for auto-updating, mobile app.
