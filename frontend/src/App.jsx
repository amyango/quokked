import { useMemo, useState } from 'react'
import { GROUP_OPTIONS, groupBySection, nestByParent } from './grouping'
import PinnedSection from './PinnedSection'
import SettingsPanel from './SettingsPanel'
import TaskCard from './TaskCard'
import TaskDetailModal from './TaskDetailModal'
import { colorsForScheme } from './theme'
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
    todayPinnedTasks,
    comingUpPinnedTasks,
    boardTasks,
    groups,
    sectionsById,
    otherProjects,
    addedProjectIds,
    toggleProject,
    completeTask,
    handleDragStart,
    handleDragEnd,
    handleDropOnPinned,
    handleDropOnPinnedToday,
    handleDropOnPinnedComingUp,
    handleDropOnBoard,
  } = useTaskBoard()

  const [showSettings, setShowSettings] = useState(false)
  const [openTaskId, setOpenTaskId] = useState(null)

  // Renders one nestByParent() node as a TaskCard, recursing into its
  // children (subtasks) so they render nested/attached under it rather than
  // as separate top-level cards in the same bucket.
  function renderTaskNode(node) {
    const { task, children } = node
    return (
      <TaskCard
        key={task.id}
        task={task}
        draggable
        dragging={draggingTaskId === task.id}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onComplete={completeTask}
        onOpenDetail={(task) => setOpenTaskId(task.id)}
      >
        {children.length > 0 ? children.map((child) => renderTaskNode(child)) : null}
      </TaskCard>
    )
  }

  // Exposes the active card accent color scheme as --accent-0..--accent-5
  // custom properties; TaskCard picks one per project via hashString.
  const accentStyle = useMemo(() => {
    const colors = colorsForScheme(settings.colorScheme)
    return Object.fromEntries(colors.map((color, i) => [`--accent-${i}`, color]))
  }, [settings.colorScheme])

  // Looked up by id (rather than storing the clicked task object directly)
  // so the modal always reflects the latest fetched data, and so it closes
  // itself gracefully if the task disappears from view (e.g. completed and
  // unpinned) between clicking it and a background refetch landing.
  const openTask = useMemo(() => {
    if (!openTaskId) return null
    return (
      tasks.find((t) => t.id === openTaskId) ||
      pinnedTasks.find((t) => t.id === openTaskId) ||
      null
    )
  }, [openTaskId, tasks, pinnedTasks])

  return (
    <div className="app" style={accentStyle}>
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

      {openTask && (
        <TaskDetailModal
          task={openTask}
          projectName={projects.find((p) => p.id === openTask.project_id)?.name}
          sectionName={sectionsById.get(openTask.section_id)?.name}
          completedByName={
            openTask.checked ? collaborators[openTask.completed_by_uid]?.name : null
          }
          onClose={() => setOpenTaskId(null)}
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
          todayTasks={todayPinnedTasks}
          comingUpTasks={comingUpPinnedTasks}
          collaborators={collaborators}
          draggingTaskId={draggingTaskId}
          handleDragStart={handleDragStart}
          handleDragEnd={handleDragEnd}
          handleDropOnPinned={handleDropOnPinned}
          handleDropOnPinnedToday={handleDropOnPinnedToday}
          handleDropOnPinnedComingUp={handleDropOnPinnedComingUp}
          onComplete={completeTask}
          onOpenDetail={(task) => setOpenTaskId(task.id)}
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
                      <ul>{nestByParent(bucket.tasks).map((node) => renderTaskNode(node))}</ul>
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
