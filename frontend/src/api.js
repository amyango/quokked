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

export function fetchSettings() {
  return getJSON('/api/settings')
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
