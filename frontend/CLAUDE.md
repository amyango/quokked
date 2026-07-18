# Frontend

React + Vite, plain fetch (no data-fetching library). Cross-cutting repo notes (running the app, LAN access, git) are in the root [CLAUDE.md](../CLAUDE.md) — this file is frontend-specific.

## Layout

- `src/api.js` — calls the backend.
- `src/grouping.js` — group-by logic for the board.
- `src/useTaskBoard.js` — hook owning all data fetching, SSE-triggered background refetch, drag state, and pin/unpin mutations. This is where board *logic* changes go.
- `src/App.jsx` — renders the board from what `useTaskBoard` returns. This is where board *layout/markup* changes go. Keep it presentation-only — new data/mutation logic belongs in the hook, not here, or it regrows into a monolith.
- `src/TaskCard.jsx` — single task card component.

## Gotchas specific to this machine / project

- **Node wasn't preinstalled** on this machine; it was installed via `brew install node` during setup. If it's ever missing again, that's the fix.

## Default homepage project(s)

The frontend (`useTaskBoard.js`) fetches tasks for default projects (from `GET /api/settings`) on load; projects not in the default list appear in a bottom bar (rendered by `App.jsx`) and are only fetched when the user clicks to add them. Which non-default projects are added persists across reloads via `localStorage` (key `quokked.addedProjectIds`), not in the config file. See root CLAUDE.md for the config file format and backend/CLAUDE.md for how the backend serves it.
