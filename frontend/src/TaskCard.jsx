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
export default function TaskCard({
  task,
  completedByName,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
  onComplete,
}) {
  const completed = task.checked
  return (
    <li
      className={`task${completed ? ' completed' : ''}${dragging ? ' dragging' : ''}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart?.(task)
      }}
      onDragEnd={onDragEnd}
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
    </li>
  )
}
