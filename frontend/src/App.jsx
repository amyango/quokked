import { useState } from 'react'
import { GROUP_OPTIONS, groupBySection } from './grouping'
import PinnedSection from './PinnedSection'
import SettingsPanel from './SettingsPanel'
import TaskCard from './TaskCard'
import { useTaskBoard } from './useTaskBoard'
import './App.css'

export default function App() {
  const {
    projects,
    settings,
    saveSettings,
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
    sectionsById,
    otherProjects,
    addedProjectIds,
    toggleProject,
    handleDragStart,
    handleDragEnd,
    handleDropOnPinned,
    handleDropOnBoard,
  } = useTaskBoard()

  const [showSettings, setShowSettings] = useState(false)

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
          <button onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      </header>

      {showSettings && (
        <SettingsPanel
          projects={projects}
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
        />
      )}

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
        <PinnedSection
          pinnedTasks={pinnedTasks}
          collaborators={collaborators}
          draggingTaskId={draggingTaskId}
          handleDragStart={handleDragStart}
          handleDragEnd={handleDragEnd}
          handleDropOnPinned={handleDropOnPinned}
        />
      )}

      {status === 'ready' && activeProjectIds.size === 0 && (
        <p className="status">
          No default project configured. Pick one from <strong>Settings</strong> above, or add a
          project below.
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
