import { useEffect, useState } from 'react'
import TaskCard from './TaskCard'

// The Pinned section: a drop target for pinned tasks, with an optional
// fullscreen mode so a long pinned list can be worked with at a larger size.
// Drag-and-drop wiring (handlers passed in via props) comes straight from
// useTaskBoard and is unchanged between collapsed/expanded states.
//
// Pinned tasks are split into two subsections — Today and Coming up — each
// its own drop target so dragging a card between them moves its due date
// (see useTaskBoard's pullTaskToToday/releaseTaskFromToday). The outer
// section's onDrop is a fallback for drops that land outside either
// subsection (e.g. a fresh pin dropped on the header/padding); subsection
// drops stop propagation so they aren't also handled there.
export default function PinnedSection({
  todayTasks,
  comingUpTasks,
  collaborators,
  draggingTaskId,
  handleDragStart,
  handleDragEnd,
  handleDropOnPinned,
  handleDropOnPinnedToday,
  handleDropOnPinnedComingUp,
  onComplete,
  onOpenDetail,
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

  const pinnedCount = todayTasks.length + comingUpTasks.length

  function renderTaskCard(task) {
    return (
      <TaskCard
        key={task.id}
        task={task}
        completedByName={task.checked ? collaborators[task.completed_by_uid]?.name : null}
        draggable
        dragging={draggingTaskId === task.id}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onComplete={onComplete}
        onOpenDetail={onOpenDetail}
      />
    )
  }

  function renderSubsection(title, tasks, onDrop) {
    return (
      <div className="pinned-subsection" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <h3 className="pinned-subsection-heading">
          {title} <span className="count">{tasks.length}</span>
        </h3>
        {tasks.length === 0 ? (
          <p className="pinned-subsection-empty">Drop a task here</p>
        ) : (
          <ul className={expanded ? 'pinned-list pinned-list-expanded' : 'pinned-list'}>
            {tasks.map((task) => renderTaskCard(task))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <section
      className={`pinned-section${expanded ? ' pinned-section-expanded' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDropOnPinned}
    >
      <h2>
        Pinned <span className="count">{pinnedCount}</span>
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
      {pinnedCount === 0 && <p className="pinned-empty">Drag a task here to pin it</p>}
      {renderSubsection('Today', todayTasks, handleDropOnPinnedToday)}
      {renderSubsection('Coming up', comingUpTasks, handleDropOnPinnedComingUp)}
    </section>
  )
}
