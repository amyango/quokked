import { useRef } from 'react'

const AVATAR_COLORS = ['#e07a5f', '#3d5a80', '#81b29a', '#f2cc8f', '#9d8dc9', '#588157']

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function initials(name) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function Avatar({ name }) {
  const color = AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length]
  return (
    <span className="avatar" style={{ background: color }} title={`Completed by ${name}`}>
      {initials(name)}
    </span>
  )
}

// A single task card, shared by the pinned section and the grouped board
// below it. Drag-and-drop between the two sections adds/removes the "pin"
// label; see App.jsx for the drop handlers.
//
// `children`, when passed, is rendered as a nested list of subtask cards
// attached under this one (see grouping.js's nestByParent and App.jsx's
// group rendering) — omitted entirely for cards with no subtasks in the
// same bucket, or when a caller (e.g. PinnedSection) doesn't nest at all.
export default function TaskCard({
  task,
  completedByName,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
  onComplete,
  onOpenDetail,
  children,
}) {
  const completed = task.checked
  // Card accent: deterministic pick from the active color scheme's 6 colors
  // (exposed as --accent-0..--accent-5 on .app in App.jsx), keyed by project
  // so every card in a project gets the same accent — same hashing approach
  // as Avatar above, just keyed differently.
  const accentIndex = hashString(task.project_id || '') % 6
  // Clicking a card opens the detail modal, but a drag-and-drop interaction
  // (pin/unpin) shouldn't also trigger it. Native HTML5 drag already
  // suppresses the click event that would otherwise fire on the same
  // mouseup, but this ref is a belt-and-suspenders guard against browser
  // quirks: set on dragstart, cleared shortly after dragend so it only
  // swallows a click that's part of the same drag gesture.
  const draggedRef = useRef(false)
  return (
    <li
      className={`task${completed ? ' completed' : ''}${dragging ? ' dragging' : ''}`}
      style={{ '--task-accent': `var(--accent-${accentIndex})` }}
      draggable={draggable}
      onDragStart={(e) => {
        draggedRef.current = true
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart?.(task)
      }}
      onDragEnd={(e) => {
        onDragEnd?.(e)
        setTimeout(() => {
          draggedRef.current = false
        }, 0)
      }}
      onClick={() => {
        if (draggedRef.current) return
        onOpenDetail?.(task)
      }}
    >
      {!completed && onComplete && (
        <button
          type="button"
          className="task-complete"
          aria-label="Complete task"
          draggable={false}
          onClick={(e) => {
            e.stopPropagation()
            onComplete(task)
          }}
          onDragStart={(e) => e.stopPropagation()}
        />
      )}
      <p className="task-content">{task.content}</p>
      <div className="task-meta">
        {completed && <span className="checkmark">✓</span>}
        {task.due?.string && <span className="due">{task.due.string}</span>}
        {task.labels
          ?.filter((label) => label !== 'pin')
          .map((label) => (
            <span className="label" key={label}>
              {label}
            </span>
          ))}
        {completed && completedByName && <Avatar name={completedByName} />}
      </div>
      {children && <ul className="subtasks">{children}</ul>}
    </li>
  )
}
