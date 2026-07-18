import { useEffect, useMemo, useState } from 'react'
import { fetchProjects, fetchTasks } from './api'
import { GROUP_OPTIONS, groupTasks } from './grouping'
import './App.css'

export default function App() {
  const [tasks, setTasks] = useState([])
  const [projects, setProjects] = useState([])
  const [groupBy, setGroupBy] = useState('project')
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([fetchTasks(), fetchProjects()])
      .then(([tasks, projects]) => {
        setTasks(tasks)
        setProjects(projects)
        setStatus('ready')
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [])

  const groups = useMemo(
    () => groupTasks(tasks, projects, groupBy),
    [tasks, projects, groupBy],
  )

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
      {status === 'ready' && tasks.length === 0 && (
        <p className="status">No open tasks 🎉</p>
      )}

      {status === 'ready' && tasks.length > 0 && (
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
    </div>
  )
}
