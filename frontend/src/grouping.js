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

// Splits a project column's tasks into section buckets, ordered by each
// section's position in Todoist with unsectioned tasks first. sectionsById
// maps section id -> { name, order }. A bucket's `name` is null for the
// unsectioned lead-in, which callers render without a separator.
export function groupBySection(tasks, sectionsById) {
  const sectioned = new Map()
  const unsectioned = []
  for (const task of tasks) {
    const section = task.section_id && sectionsById.get(task.section_id)
    if (section) {
      if (!sectioned.has(task.section_id)) sectioned.set(task.section_id, [])
      sectioned.get(task.section_id).push(task)
    } else {
      unsectioned.push(task)
    }
  }
  const sectionBuckets = [...sectioned.entries()]
    .map(([id, sectionTasks]) => ({
      key: id,
      name: sectionsById.get(id).name,
      order: sectionsById.get(id).order,
      tasks: sectionTasks,
    }))
    .sort((a, b) => a.order - b.order)

  return unsectioned.length > 0
    ? [{ key: 'none', name: null, tasks: unsectioned }, ...sectionBuckets]
    : sectionBuckets
}

// Nests subtasks under their parent within a single bucket of tasks (a
// group, or a section bucket within a group), so a card's subtasks render
// attached under it instead of as separate top-level cards in that same
// bucket. Returns an array of { task, children } nodes, `children` being
// the same shape (so a subtask that itself has subtasks nests correctly
// too), in the original task order.
//
// A subtask whose parent didn't land in this same bucket (e.g. it's in a
// different priority/label group, a different section, or is otherwise not
// present in `tasks`) has nothing to attach to, so it's kept as a top-level
// node here — the point is to group hierarchy visible *within* a bucket,
// not to reshuffle tasks across buckets.
export function nestByParent(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const childrenByParentId = new Map()
  const topLevel = []
  for (const task of tasks) {
    if (task.parent_id && byId.has(task.parent_id)) {
      if (!childrenByParentId.has(task.parent_id)) childrenByParentId.set(task.parent_id, [])
      childrenByParentId.get(task.parent_id).push(task)
    } else {
      topLevel.push(task)
    }
  }
  const buildNode = (task) => ({
    task,
    children: (childrenByParentId.get(task.id) || []).map(buildNode),
  })
  return topLevel.map(buildNode)
}
