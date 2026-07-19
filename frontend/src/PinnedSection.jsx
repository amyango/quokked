import { useEffect, useState } from 'react'
import TaskCard from './TaskCard'

// The Pinned section: a drop target for pinned tasks, with an optional
// fullscreen mode so a long pinned list can be worked with at a larger size.
// Drag-and-drop wiring (handlers passed in via props) comes straight from
// useTaskBoard and is unchanged between collapsed/expanded states.
export default function PinnedSection({
  pinnedTasks,
  collaborators,
  draggingTaskId,
  handleDragStart,
  handleDragEnd,
  handleDropOnPinned,
}) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded])

  return (
    <section
      className={`pinned-section${expanded ? ' pinned-section-expanded' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDropOnPinned}
    >
      <h2>
        Pinned <span className="count">{pinnedTasks.length}</span>
        <button
          type="button"
          className="pinned-expand-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-label={expanded ? 'Collapse pinned section' : 'Expand pinned section to fullscreen'}
          title={expanded ? 'Collapse (Esc)' : 'Expand to fullscreen'}
        >
          {expanded ? '⤡' : '⤢'}
        </button>
      </h2>
      {pinnedTasks.length === 0 ? (
        <p className="pinned-empty">Drag a task here to pin it</p>
      ) : (
        <ul className={expanded ? 'pinned-list pinned-list-expanded' : 'pinned-list'}>
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
  )
}
