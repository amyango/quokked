// Defaults to the backend on the same host the page was loaded from, so
// this works whether you're browsing via localhost, a LAN hostname, or an
// IP — as long as the backend is running on port 8080 there too. Override
// with VITE_API_BASE_URL if the backend lives somewhere else.
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8080`

async function getJSON(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`)
  }
  return res.json()
}

export function fetchTasksForProject(projectId) {
  return getJSON(`/api/tasks?project_id=${encodeURIComponent(projectId)}`)
}

export function fetchProjects() {
  return getJSON('/api/projects')
}

export function fetchSectionsForProject(projectId) {
  return getJSON(`/api/sections?project_id=${encodeURIComponent(projectId)}`)
}

export function fetchSettings() {
  return getJSON('/api/settings')
}

export async function saveSettings(settings) {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) {
    throw new Error(`save settings failed: ${res.status}`)
  }
  return res.json()
}

export function fetchPinnedCompleted() {
  return getJSON('/api/pinned/completed')
}

export function createEventsSource() {
  return new EventSource(`${API_BASE}/api/events`)
}

export async function updateTaskLabels(taskId, labels) {
  const res = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labels }),
  })
  if (!res.ok) {
    throw new Error(`update task ${taskId} failed: ${res.status}`)
  }
  return res.json()
}

// updateTaskDue moves a pinned task's due date between the Today and
// Coming up subsections. `due` is the task's due state *before* this
// mutation, so the backend can tell whether it's recurring (see
// backend/handlers.go's applyDueAction).
export async function updateTaskDue(taskId, dueAction, due) {
  const res = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dueAction, due: due || null }),
  })
  if (!res.ok) {
    throw new Error(`update task ${taskId} due date failed: ${res.status}`)
  }
  return res.json()
}

export async function completeTask(taskId) {
  const res = await fetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ complete: true }),
  })
  if (!res.ok) {
    throw new Error(`complete task ${taskId} failed: ${res.status}`)
  }
  return res.json()
}
