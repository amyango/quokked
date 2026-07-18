import { GROUP_OPTIONS } from './grouping'
import TaskCard from './TaskCard'
import { useTaskBoard } from './useTaskBoard'
import './App.css'

export default function App() {
  const {
    collaborators,
    draggingTaskId,
    groupBy,
    setGroupBy,
    status,
    error,
    actionError,
    activeProjectIds,
    tasks,
    tasksLoaded,
    pinnedTasks,
    boardTasks,
    groups,
    otherProjects,
    addedProjectIds,
    toggleProject,
    handleDragStart,
    handleDragEnd,
    handleDropOnPinned,
    handleDropOnBoard,
  } = useTaskBoard()

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
          {groups.map((group) => (
            <section className="column" key={group.key}>
              <h2>
                {group.key} <span className="count">{group.tasks.length}</span>
              </h2>
              <ul>
                {group.tasks.map((task) => (
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
