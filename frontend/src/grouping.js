const PRIORITY_NAMES = { 4: 'P1 · Urgent', 3: 'P2 · High', 2: 'P3 · Medium', 1: 'P4 · Low' }
const PRIORITY_ORDER = [4, 3, 2, 1]

export const GROUP_OPTIONS = [
  { value: 'project', label: 'Project' },
  { value: 'priority', label: 'Priority' },
  { value: 'label', label: 'Label' },
]

// Returns an array of { key, tasks } groups, ordered sensibly for the
// chosen grouping strategy.
export function groupTasks(tasks, projects, groupBy) {
  if (groupBy === 'priority') {
    const byPriority = new Map()
    for (const task of tasks) {
      const key = PRIORITY_NAMES[task.priority] || PRIORITY_NAMES[1]
      if (!byPriority.has(key)) byPriority.set(key, [])
      byPriority.get(key).push(task)
    }
    return PRIORITY_ORDER.map((p) => PRIORITY_NAMES[p])
      .filter((key) => byPriority.has(key))
      .map((key) => ({ key, tasks: byPriority.get(key) }))
  }

  if (groupBy === 'label') {
    const byLabel = new Map()
    for (const task of tasks) {
      const labels = task.labels?.length ? task.labels : ['(no label)']
      for (const label of labels) {
        if (!byLabel.has(label)) byLabel.set(label, [])
        byLabel.get(label).push(task)
      }
    }
    return [...byLabel.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, groupTasks]) => ({ key, tasks: groupTasks }))
  }

  // default: project
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const byProject = new Map()
  for (const task of tasks) {
    const key = projectById.get(task.project_id)?.name || 'Unknown project'
    if (!byProject.has(key)) byProject.set(key, [])
    byProject.get(key).push(task)
  }
  return [...byProject.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupTasks]) => ({ key, tasks: groupTasks }))
}
