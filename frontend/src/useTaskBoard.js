import { useEffect, useMemo, useRef, useState } from 'react'
import {
  completeTask as completeTaskRequest,
  createEventsSource,
  fetchPinnedCompleted,
  fetchProjects,
  fetchSectionsForProject,
  fetchSettings,
  fetchTasksForProject,
  saveSettings as saveSettingsRequest,
  updateTaskLabels,
} from './api'
import { groupTasks } from './grouping'

const ADDED_PROJECTS_KEY = 'quokked.addedProjectIds'
const PIN_LABEL = 'pin'

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

function isPinned(task) {
  return task.labels?.includes(PIN_LABEL)
}

// Tasks in a disabled section are hidden from the board entirely (not just
// the grouped view), across every group-by mode.
function isSectionDisabled(task, disabledSections) {
  const disabled = disabledSections[task.project_id]
  return !!disabled && disabled.includes(task.section_id)
}

// useTaskBoard owns all data fetching, background refetch/SSE wiring, and
// pin/unpin mutations for the board. App.jsx is left to just render the
// state and derived values this returns.
export function useTaskBoard() {
  const [projects, setProjects] = useState([])
  const [settings, setSettings] = useState({
    defaultProjects: [],
    disabledSections: {},
    theme: '',
    colorScheme: '',
  })
  const [addedProjectIds, setAddedProjectIds] = useState(loadAddedProjectIds)
  const [tasksByProject, setTasksByProject] = useState({}) // projectId -> Task[]
  const [sectionsByProject, setSectionsByProject] = useState({}) // projectId -> Section[]
  const [pinnedCompleted, setPinnedCompleted] = useState([])
  const [collaborators, setCollaborators] = useState({}) // uid -> { id, name, email }
  const [draggingTaskId, setDraggingTaskId] = useState(null)
  const [groupBy, setGroupBy] = useState('project')
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    Promise.all([fetchProjects(), fetchSettings(), fetchPinnedCompleted()])
      .then(([projects, settings, pinned]) => {
        setProjects(projects)
        setSettings({
          defaultProjects: settings.defaultProjects || [],
          disabledSections: settings.disabledSections || {},
          theme: settings.theme || '',
          colorScheme: settings.colorScheme || '',
        })
        setPinnedCompleted(pinned.tasks || [])
        setCollaborators(pinned.collaborators || {})
        setStatus('ready')
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [])

  const defaultProjectIds = useMemo(() => {
    const names = new Set(settings.defaultProjects.map((name) => name.toLowerCase()))
    return new Set(
      projects.filter((p) => names.has(p.name.toLowerCase())).map((p) => p.id),
    )
  }, [projects, settings.defaultProjects])

  // Saves settings to the backend and, on success, updates local state so
  // the board (default projects, hidden sections) reflects the change
  // immediately without a full reload.
  async function saveSettings(newSettings) {
    const saved = await saveSettingsRequest(newSettings)
    setSettings({
      defaultProjects: saved.defaultProjects || [],
      disabledSections: saved.disabledSections || {},
      theme: saved.theme || '',
      colorScheme: saved.colorScheme || '',
    })
    return saved
  }

  // Applies the chosen theme immediately (on load and after every save),
  // rather than waiting for a reload: "" (system) clears the override so
  // the @media(prefers-color-scheme) rule in index.css takes back over.
  useEffect(() => {
    if (settings.theme === 'dark' || settings.theme === 'light') {
      document.documentElement.dataset.theme = settings.theme
    } else {
      delete document.documentElement.dataset.theme
    }
  }, [settings.theme])

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
    Promise.all(
      missing.map((id) =>
        Promise.all([fetchTasksForProject(id), fetchSectionsForProject(id)]).then(
          ([tasks, sections]) => [id, tasks, sections],
        ),
      ),
    )
      .then((entries) => {
        setTasksByProject((prev) => {
          const next = { ...prev }
          for (const [id, tasks] of entries) next[id] = tasks
          return next
        })
        setSectionsByProject((prev) => {
          const next = { ...prev }
          for (const [id, , sections] of entries) next[id] = sections
          return next
        })
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [activeProjectIds, tasksByProject])

  const sectionsById = useMemo(() => {
    const map = new Map()
    for (const sections of Object.values(sectionsByProject)) {
      for (const section of sections) {
        map.set(section.id, { name: section.name, order: section.section_order })
      }
    }
    return map
  }, [sectionsByProject])

  // Background refetch, triggered by SSE "changed" events (see the
  // EventSource effect below). Merges into tasksByProject rather than
  // replacing it, so the "missing ids" effect above stays untouched.
  async function refetchAll() {
    const ids = [...activeProjectIds]
    const [entries, pinned, projectList] = await Promise.all([
      Promise.all(
        ids.map((id) =>
          Promise.all([fetchTasksForProject(id), fetchSectionsForProject(id)]).then(
            ([tasks, sections]) => [id, tasks, sections],
          ),
        ),
      ),
      fetchPinnedCompleted(),
      fetchProjects(),
    ])
    setTasksByProject((prev) => {
      const next = { ...prev }
      for (const [id, tasks] of entries) next[id] = tasks
      return next
    })
    setSectionsByProject((prev) => {
      const next = { ...prev }
      for (const [id, , sections] of entries) next[id] = sections
      return next
    })
    setPinnedCompleted(pinned.tasks || [])
    setCollaborators(pinned.collaborators || {})
    setProjects(projectList)
  }

  // A background refetch must never disturb an in-progress drag or race an
  // optimistic pin/unpin update, so it's deferred while either is active
  // and flushed once they finish.
  const draggingRef = useRef(false)
  const mutationsInFlightRef = useRef(0)
  const pendingRefetchRef = useRef(false)
  const debounceRef = useRef(null)
  const refetchRef = useRef(() => {})
  refetchRef.current = refetchAll

  function runRefetchIfClear() {
    if (draggingRef.current || mutationsInFlightRef.current > 0) {
      pendingRefetchRef.current = true
      return
    }
    pendingRefetchRef.current = false
    refetchRef.current().catch((err) => console.warn('background refetch failed:', err))
  }

  function requestRefetch() {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(runRefetchIfClear, 300)
  }

  function flushPendingRefetch() {
    if (pendingRefetchRef.current && !draggingRef.current && mutationsInFlightRef.current === 0) {
      runRefetchIfClear()
    }
  }

  useEffect(() => {
    const es = createEventsSource()
    es.onmessage = requestRefetch
    return () => {
      es.close()
      clearTimeout(debounceRef.current)
    }
  }, [])

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
    () =>
      [...activeProjectIds]
        .flatMap((id) => tasksByProject[id] || [])
        .filter((task) => !isSectionDisabled(task, settings.disabledSections)),
    [activeProjectIds, tasksByProject, settings.disabledSections],
  )
  const tasksLoaded = [...activeProjectIds].every((id) => id in tasksByProject)

  const pinnedActiveTasks = useMemo(() => tasks.filter(isPinned), [tasks])
  const boardTasks = useMemo(() => tasks.filter((t) => !isPinned(t)), [tasks])
  const pinnedTasks = useMemo(() => {
    const completed = [...pinnedCompleted].sort((a, b) =>
      (b.completed_at || '').localeCompare(a.completed_at || ''),
    )
    return [...pinnedActiveTasks, ...completed]
  }, [pinnedActiveTasks, pinnedCompleted])

  const groups = useMemo(
    () => groupTasks(boardTasks, projects, groupBy),
    [boardTasks, projects, groupBy],
  )

  const otherProjects = projects.filter((p) => !defaultProjectIds.has(p.id))

  function findTaskById(id) {
    return tasks.find((t) => t.id === id) || pinnedCompleted.find((t) => t.id === id) || null
  }

  // Rewrites one task's cached labels in place, wherever it lives in
  // tasksByProject, so pin/unpin is reflected without a full refetch.
  function setActiveTaskLabels(taskId, labels) {
    setTasksByProject((prev) => {
      const next = { ...prev }
      for (const projectId of Object.keys(next)) {
        const idx = next[projectId].findIndex((t) => t.id === taskId)
        if (idx === -1) continue
        const list = [...next[projectId]]
        list[idx] = { ...list[idx], labels }
        next[projectId] = list
        break
      }
      return next
    })
  }

  // Removes one task from tasksByProject in place, wherever it lives —
  // the completeTask counterpart to setActiveTaskLabels above.
  function removeActiveTask(taskId) {
    setTasksByProject((prev) => {
      const next = { ...prev }
      for (const projectId of Object.keys(next)) {
        const idx = next[projectId].findIndex((t) => t.id === taskId)
        if (idx === -1) continue
        next[projectId] = next[projectId].filter((t) => t.id !== taskId)
        break
      }
      return next
    })
  }

  // Restores a previously-removed task to its project's list, used to roll
  // back an optimistic completeTask on failure.
  function insertActiveTask(task) {
    setTasksByProject((prev) => {
      const projectId = task.project_id
      if (!(projectId in prev)) return prev
      if (prev[projectId].some((t) => t.id === task.id)) return prev
      return { ...prev, [projectId]: [...prev[projectId], task] }
    })
  }

  async function pinTask(task) {
    setActionError(null)
    const previousLabels = task.labels || []
    const newLabels = [...previousLabels, PIN_LABEL]
    setActiveTaskLabels(task.id, newLabels)
    mutationsInFlightRef.current++
    try {
      await updateTaskLabels(task.id, newLabels)
    } catch (err) {
      setActiveTaskLabels(task.id, previousLabels)
      setActionError(err.message)
    } finally {
      mutationsInFlightRef.current--
      flushPendingRefetch()
    }
  }

  async function unpinTask(task) {
    setActionError(null)
    const previousLabels = task.labels || []
    const newLabels = previousLabels.filter((l) => l !== PIN_LABEL)
    if (task.checked) {
      setPinnedCompleted((prev) => prev.filter((t) => t.id !== task.id))
    } else {
      setActiveTaskLabels(task.id, newLabels)
    }
    mutationsInFlightRef.current++
    try {
      await updateTaskLabels(task.id, newLabels)
    } catch (err) {
      if (task.checked) {
        setPinnedCompleted((prev) => [...prev, task])
      } else {
        setActiveTaskLabels(task.id, previousLabels)
      }
      setActionError(err.message)
    } finally {
      mutationsInFlightRef.current--
      flushPendingRefetch()
    }
  }

  // Completes a task via the Todoist API, treating pinned and unpinned
  // tasks uniformly: optimistically remove it from view (mirroring how
  // unpinTask already treats a checked pinned task), then roll back on
  // failure by re-inserting the captured task.
  async function completeTask(task) {
    setActionError(null)
    if (task.checked) {
      setPinnedCompleted((prev) => prev.filter((t) => t.id !== task.id))
    } else {
      removeActiveTask(task.id)
    }
    mutationsInFlightRef.current++
    try {
      await completeTaskRequest(task.id)
    } catch (err) {
      if (task.checked) {
        setPinnedCompleted((prev) => [...prev, task])
      } else {
        insertActiveTask(task)
      }
      setActionError(err.message)
    } finally {
      mutationsInFlightRef.current--
      flushPendingRefetch()
    }
  }

  function handleDragStart(task) {
    draggingRef.current = true
    setDraggingTaskId(task.id)
  }

  function handleDragEnd() {
    draggingRef.current = false
    setDraggingTaskId(null)
    flushPendingRefetch()
  }

  function handleDropOnPinned(e) {
    e.preventDefault()
    const task = findTaskById(e.dataTransfer.getData('text/plain'))
    if (task && !isPinned(task)) pinTask(task)
    draggingRef.current = false
    setDraggingTaskId(null)
    flushPendingRefetch()
  }

  function handleDropOnBoard(e) {
    e.preventDefault()
    const task = findTaskById(e.dataTransfer.getData('text/plain'))
    if (task && isPinned(task)) unpinTask(task)
    draggingRef.current = false
    setDraggingTaskId(null)
    flushPendingRefetch()
  }

  return {
    projects,
    settings,
    saveSettings,
    addedProjectIds,
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
    toggleProject,
    pinTask,
    unpinTask,
    completeTask,
    handleDragStart,
    handleDragEnd,
    handleDropOnPinned,
    handleDropOnBoard,
  }
}
