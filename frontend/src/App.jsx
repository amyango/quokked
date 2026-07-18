import { useEffect, useMemo, useState } from 'react'
import { fetchProjects, fetchSettings, fetchTasksForProject } from './api'
import { GROUP_OPTIONS, groupTasks } from './grouping'
import './App.css'

const ADDED_PROJECTS_KEY = 'quokked.addedProjectIds'

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

export default function App() {
  const [projects, setProjects] = useState([])
  const [defaultProjectNames, setDefaultProjectNames] = useState([])
  const [addedProjectIds, setAddedProjectIds] = useState(loadAddedProjectIds)
  const [tasksByProject, setTasksByProject] = useState({}) // projectId -> Task[]
  const [groupBy, setGroupBy] = useState('project')
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([fetchProjects(), fetchSettings()])
      .then(([projects, settings]) => {
        setProjects(projects)
        setDefaultProjectNames(settings.defaultProjects || [])
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
    Promise.all(missing.map((id) => fetchTasksForProject(id).then((tasks) => [id, tasks])))
      .then((entries) => {
        setTasksByProject((prev) => {
          const next = { ...prev }
          for (const [id, tasks] of entries) next[id] = tasks
          return next
        })
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [activeProjectIds, tasksByProject])

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

  const groups = useMemo(
    () => groupTasks(tasks, projects, groupBy),
    [tasks, projects, groupBy],
  )

  const otherProjects = projects.filter((p) => !defaultProjectIds.has(p.id))

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

      {status === 'ready' && tasksLoaded && tasks.length > 0 && (
        <div className="board">
          {groups.map((group) => (
            <section className="column" key={group.key}>
              <h2>
                {group.key} <span className="count">{group.tasks.length}</span>
              </h2>
              <ul>
                {group.tasks.map((task) => (
                  <li key={task.id} className="task">
                    <p className="task-content">{task.content}</p>
                    <div className="task-meta">
                      {task.due?.string && <span className="due">{task.due.string}</span>}
                      {task.labels?.map((label) => (
                        <span className="label" key={label}>
                          {label}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
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
