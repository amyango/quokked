import { useEffect } from 'react'

// Todoist priority is stored as 1-4 with 4 as highest ("P1" in the Todoist
// UI) and 1 as the default/no-priority value ("P4") — this maps the raw
// field to the label shown in Todoist itself.
const PRIORITY_LABELS = {
  4: 'Priority 1 (Urgent)',
  3: 'Priority 2 (High)',
  2: 'Priority 3 (Medium)',
}

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: value.includes('T') ? 'short' : undefined,
  })
}

// Read-only detail view for a single task, opened by clicking a TaskCard
// (see TaskCard.jsx's onClick/drag-guard wiring and App.jsx's openTaskId
// state). Mirrors SettingsPanel.jsx's overlay/panel/close pattern: click
// outside via the overlay's onClick, Escape via a local keydown listener
// (same shape as PinnedSection.jsx's expand/collapse listener), and an
// explicit × button. Task mutation from here is out of scope for stage 1
// (see README) — this only ever reads from the task object it's given.
export default function TaskDetailModal({ task, projectName, sectionName, completedByName, onClose }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const labels = task.labels?.filter((label) => label !== 'pin') || []
  const priorityLabel = PRIORITY_LABELS[task.priority]
  const location = [projectName, sectionName].filter(Boolean).join(' / ')

  return (
    <div className="task-detail-overlay" onClick={onClose}>
      <div className="task-detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header">
          <h2>{task.content}</h2>
          <button className="task-detail-close" onClick={onClose} aria-label="Close task details">
            ×
          </button>
        </div>

        {task.description && <p className="task-detail-description">{task.description}</p>}

        <dl className="task-detail-fields">
          {location && (
            <div className="task-detail-field">
              <dt>Project</dt>
              <dd>{location}</dd>
            </div>
          )}
          {task.due?.string && (
            <div className="task-detail-field">
              <dt>Due</dt>
              <dd>
                {task.due.string}
                {task.due.is_recurring && ' (recurring)'}
              </dd>
            </div>
          )}
          {priorityLabel && (
            <div className="task-detail-field">
              <dt>Priority</dt>
              <dd>{priorityLabel}</dd>
            </div>
          )}
          {labels.length > 0 && (
            <div className="task-detail-field">
              <dt>Labels</dt>
              <dd className="task-detail-labels">
                {labels.map((label) => (
                  <span className="label" key={label}>
                    {label}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {task.checked && (
            <div className="task-detail-field">
              <dt>Completed</dt>
              <dd>
                {formatDate(task.completed_at)}
                {completedByName && ` by ${completedByName}`}
              </dd>
            </div>
          )}
          {task.added_at && (
            <div className="task-detail-field">
              <dt>Created</dt>
              <dd>{formatDate(task.added_at)}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}
