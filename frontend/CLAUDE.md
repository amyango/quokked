# Frontend

React + Vite, plain fetch (no data-fetching library). Cross-cutting repo notes (running the app, LAN access, git) are in the root [CLAUDE.md](../CLAUDE.md) — this file is frontend-specific.

## Layout

- `src/api.js` — calls the backend.
- `src/grouping.js` — group-by logic for the board.
- `src/useTaskBoard.js` — hook owning all data fetching, SSE-triggered background refetch, drag state, and mutations (`pinTask`/`unpinTask`/`completeTask`, all exported). This is where board *logic* changes go — a new mutation follows the existing optimistic-update/rollback shape (mutate local state, increment `mutationsInFlightRef`, call the API, roll back + `setActionError` on failure, decrement + `flushPendingRefetch` in `finally`).
- `src/App.jsx` — renders the board from what `useTaskBoard` returns. This is where board *layout/markup* changes go. Keep it presentation-only — new data/mutation logic belongs in the hook, not here, or it regrows into a monolith. Note: nearly every new UI feature ends up adding a line here (a new component render, a new prop on `<TaskCard>`), which makes this the most common merge-conflict point when working on more than one issue at once — see root CLAUDE.md's "Conventions for concurrent work."
- `src/TaskCard.jsx` — single task card component.
- `src/PinnedSection.jsx` — the Pinned section: drop target, optional fullscreen expand/collapse (own local state + Escape-key listener), renders `TaskCard`s.
- `src/SettingsPanel.jsx` — modal for editing `defaultProjects`/`disabledSections`/`theme`/`colorScheme`. Owns its own draft state and per-project section fetches locally (self-contained form logic); only calls back into `useTaskBoard`'s `saveSettings` to persist.
- `src/theme.js` — named card-accent color presets (`COLOR_SCHEMES`) and the `colorsForScheme` lookup; `App.jsx` exposes the active one as `--accent-0`..`--accent-5` CSS custom properties, `TaskCard.jsx` picks one per card by hashing `project_id`.

## Gotchas specific to this machine / project

- **Node wasn't preinstalled** on this machine; it was installed via `brew install node` during setup. If it's ever missing again, that's the fix.

## Default homepage project(s) and section visibility

The frontend (`useTaskBoard.js`) fetches tasks for default projects (from `GET /api/settings`) on load; projects not in the default list appear in a bottom bar (rendered by `App.jsx`) and are only fetched when the user clicks to add them. Which non-default projects are added persists across reloads via `localStorage` (key `quokked.addedProjectIds`), not in the config file. `useTaskBoard` also filters out any task whose `section_id` is in `settings.disabledSections[project_id]` before it reaches grouping — hidden sections disappear from every group-by mode, not just the "Project" grouped view. The Settings button in `App.jsx` opens `SettingsPanel.jsx`, which edits both fields and saves via `useTaskBoard`'s `saveSettings` (`PUT /api/settings`); on success the hook updates local state directly rather than triggering a full reload. See root CLAUDE.md for the config file format and backend/CLAUDE.md for how the backend serves/persists it.
