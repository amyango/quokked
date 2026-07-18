import { useEffect, useMemo, useState } from 'react'
import {
  fetchPinnedCompleted,
  fetchProjects,
  fetchSectionsForProject,
  fetchSettings,
  fetchTasksForProject,
  updateTaskLabels,
} from './api'
import { GROUP_OPTIONS, groupBySection, groupTasks } from './grouping'
import TaskCard from './TaskCard'
import './App.css'

const ADDED_PROJECTS_KEY = 'quokked.addedProjectIds'
const PIN_LABEL = 'pin'

// Non-default projects a user adds from the bottom bar persist across
// reloads, so they don't have to re-add them every time they open the app.
function loadAddedProjectIds() {
  try {
    const raw = localStorage.getItem(ADDED_PROJECTS_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveAddedProjectIds(ids) {
  localStorage.setItem(ADDED_PROJECTS_KEY, JSON.stringify([...ids]))
}

function isPinned(task) {
  return task.labels?.includes(PIN_LABEL)
}

export default function App() {
  const [projects, setProjects] = useState([])
  const [defaultProjectNames, setDefaultProjectNames] = useState([])
  const [addedProjectIds, setAddedProjectIds] = useState(loadAddedProjectIds)
  const [tasksByProject, setTasksByProject] = useState({}) // projectId -> Task[]
  const [sectionsByProject, setSectionsByProject] = useState({}) // projectId -> Section[]
  const [pinnedCompleted, setPinnedCompleted] = useState([])
  const [collaborators, setCollaborators] = useState({}) // uid -> { id, name, email }
  const [draggingTaskId, setDraggingTaskId] = useState(null)
  const [groupBy, setGroupBy] = useState('project')
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    Promise.all([fetchProjects(), fetchSettings(), fetchPinnedCompleted()])
      .then(([projects, settings, pinned]) => {
        setProjects(projects)
        setDefaultProjectNames(settings.defaultProjects || [])
        setPinnedCompleted(pinned.tasks || [])
        setCollaborators(pinned.collaborators || {})
        setStatus('ready')
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [])

  const defaultProjectIds = useMemo(() => {
    const names = new Set(defaultProjectNames.map((name) => name.toLowerCase()))
    return new Set(
      projects.filter((p) => names.has(p.name.toLowerCase())).map((p) => p.id),
    )
  }, [projects, defaultProjectNames])

  const activeProjectIds = useMemo(
    () => new Set([...defaultProjectIds, ...addedProjectIds]),
    [defaultProjectIds, addedProjectIds],
  )

  // Projects not listed as default are never fetched until the user adds
  // them from the bottom bar; this effect fetches tasks only for whichever
  // project ids just became active and aren't cached yet.
  useEffect(() => {
    const missing = [...activeProjectIds].filter((id) => !(id in tasksByProject))
    if (missing.length === 0) return
    Promise.all(
      missing.map((id) =>
        Promise.all([fetchTasksForProject(id), fetchSectionsForProject(id)]).then(
          ([tasks, sections]) => [id, tasks, sections],
        ),
      ),
    )
      .then((entries) => {
        setTasksByProject((prev) => {
          const next = { ...prev }
          for (const [id, tasks] of entries) next[id] = tasks
          return next
        })
        setSectionsByProject((prev) => {
          const next = { ...prev }
          for (const [id, , sections] of entries) next[id] = sections
          return next
        })
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [activeProjectIds, tasksByProject])

  const sectionsById = useMemo(() => {
    const map = new Map()
    for (const sections of Object.values(sectionsByProject)) {
      for (const section of sections) {
        map.set(section.id, { name: section.name, order: section.section_order })
      }
    }
    return map
  }, [sectionsByProject])

  function toggleProject(id) {
    setAddedProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveAddedProjectIds(next)
      return next
    })
  }

  const tasks = useMemo(
    () => [...activeProjectIds].flatMap((id) => tasksByProject[id] || []),
    [activeProjectIds, tasksByProject],
  )
  const tasksLoaded = [...activeProjectIds].every((id) => id in tasksByProject)

  const pinnedActiveTasks = useMemo(() => tasks.filter(isPinned), [tasks])
  const boardTasks = useMemo(() => tasks.filter((t) => !isPinned(t)), [tasks])
  const pinnedTasks = useMemo(() => {
    const completed = [...pinnedCompleted].sort((a, b) =>
      (b.completed_at || '').localeCompare(a.completed_at || ''),
    )
    return [...pinnedActiveTasks, ...completed]
  }, [pinnedActiveTasks, pinnedCompleted])

  const groups = useMemo(
    () => groupTasks(boardTasks, projects, groupBy),
    [boardTasks, projects, groupBy],
  )

  const otherProjects = projects.filter((p) => !defaultProjectIds.has(p.id))

  function findTaskById(id) {
    return tasks.find((t) => t.id === id) || pinnedCompleted.find((t) => t.id === id) || null
  }

  // Rewrites one task's cached labels in place, wherever it lives in
  // tasksByProject, so pin/unpin is reflected without a full refetch.
  function setActiveTaskLabels(taskId, labels) {
    setTasksByProject((prev) => {
      const next = { ...prev }
      for (const projectId of Object.keys(next)) {
        const idx = next[projectId].findIndex((t) => t.id === taskId)
        if (idx === -1) continue
        const list = [...next[projectId]]
        list[idx] = { ...list[idx], labels }
        next[projectId] = list
        break
      }
      return next
    })
  }

  async function pinTask(task) {
    setActionError(null)
    const previousLabels = task.labels || []
    const newLabels = [...previousLabels, PIN_LABEL]
    setActiveTaskLabels(task.id, newLabels)
    try {
      await updateTaskLabels(task.id, newLabels)
    } catch (err) {
      setActiveTaskLabels(task.id, previousLabels)
      setActionError(err.message)
    }
  }

  async function unpinTask(task) {
    setActionError(null)
    const previousLabels = task.labels || []
    const newLabels = previousLabels.filter((l) => l !== PIN_LABEL)
    if (task.checked) {
      setPinnedCompleted((prev) => prev.filter((t) => t.id !== task.id))
    } else {
      setActiveTaskLabels(task.id, newLabels)
    }
    try {
      await updateTaskLabels(task.id, newLabels)
    } catch (err) {
      if (task.checked) {
        setPinnedCompleted((prev) => [...prev, task])
      } else {
        setActiveTaskLabels(task.id, previousLabels)
      }
      setActionError(err.message)
    }
  }

  function handleDragStart(task) {
    setDraggingTaskId(task.id)
  }

  function handleDragEnd() {
    setDraggingTaskId(null)
  }

  function handleDropOnPinned(e) {
    e.preventDefault()
    const task = findTaskById(e.dataTransfer.getData('text/plain'))
    if (task && !isPinned(task)) pinTask(task)
    setDraggingTaskId(null)
  }

  function handleDropOnBoard(e) {
    e.preventDefault()
    const task = findTaskById(e.dataTransfer.getData('text/plain'))
    if (task && isPinned(task)) unpinTask(task)
    setDraggingTaskId(null)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Quokked</h1>
        <div className="group-controls">
          <span>Group by</span>
          {GROUP_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={option.value === groupBy ? 'active' : ''}
              onClick={() => setGroupBy(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {status === 'loading' && <p className="status">Loading tasks…</p>}
      {status === 'error' && (
        <p className="status status-error">
          Couldn't load tasks: {error}. Is the backend running on port 8080?
        </p>
      )}

      {status === 'ready' && actionError && (
        <p className="status status-error">
          Couldn't save that change: {actionError}
        </p>
      )}

      {status === 'ready' && (
        <section
          className="pinned-section"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropOnPinned}
        >
          <h2>
            Pinned <span className="count">{pinnedTasks.length}</span>
          </h2>
          {pinnedTasks.length === 0 ? (
            <p className="pinned-empty">Drag a task here to pin it</p>
          ) : (
            <ul className="pinned-list">
              {pinnedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  completedByName={task.checked ? collaborators[task.completed_by_uid]?.name : null}
                  draggable
                  dragging={draggingTaskId === task.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {status === 'ready' && activeProjectIds.size === 0 && (
        <p className="status">
          No default project configured. Set <code>defaultProjects</code> in{' '}
          <code>config/settings.json</code>, or add a project below.
        </p>
      )}
      {status === 'ready' && activeProjectIds.size > 0 && !tasksLoaded && (
        <p className="status">Loading tasks…</p>
      )}
      {status === 'ready' && tasksLoaded && tasks.length === 0 && (
        <p className="status">No open tasks 🎉</p>
      )}

      {status === 'ready' && tasksLoaded && activeProjectIds.size > 0 && (
        <div className="board" onDragOver={(e) => e.preventDefault()} onDrop={handleDropOnBoard}>
          {boardTasks.length === 0 && tasks.length > 0 && (
            <p className="status board-empty">Everything's pinned 📌</p>
          )}
          {groups.map((group) => {
            const sectionBuckets =
              groupBy === 'project'
                ? groupBySection(group.tasks, sectionsById)
                : [{ key: 'none', name: null, tasks: group.tasks }]
            return (
              <section className="column" key={group.key}>
                <h2>
                  {group.key} <span className="count">{group.tasks.length}</span>
                </h2>
                <div className="column-body">
                  {sectionBuckets.map((bucket) => (
                    <div className="section-bucket" key={bucket.key}>
                      {bucket.name && <div className="section-separator">{bucket.name}</div>}
                      <ul>
                        {bucket.tasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            draggable
                            dragging={draggingTaskId === task.id}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {status === 'ready' && otherProjects.length > 0 && (
        <footer className="project-bar">
          <span className="project-bar-label">Other projects</span>
          <div className="project-bar-scroll">
            {otherProjects.map((project) => {
              const added = addedProjectIds.has(project.id)
              return (
                <button
                  key={project.id}
                  className={added ? 'active' : ''}
                  onClick={() => toggleProject(project.id)}
                >
                  {added ? '−' : '+'} {project.name}
                </button>
              )
            })}
          </div>
        </footer>
      )}
    </div>
  )
}
