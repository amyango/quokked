import { useState } from 'react'
import { fetchSectionsForProject } from './api'

// Settings pane for editing config/settings.json from the UI: which
// projects show on the homepage by default, and which sections within a
// project are hidden from the board. Owns its own draft state and only
// calls back to the parent (via onSave) once the user confirms.
export default function SettingsPanel({ projects, settings, onClose, onSave }) {
  const [draftDefaults, setDraftDefaults] = useState(
    () => new Set(settings.defaultProjects.map((name) => name.toLowerCase())),
  )
  const [draftDisabled, setDraftDisabled] = useState(() => {
    const map = new Map()
    for (const [projectId, sectionIds] of Object.entries(settings.disabledSections)) {
      map.set(projectId, new Set(sectionIds))
    }
    return map
  })
  const [expandedProjectId, setExpandedProjectId] = useState(null)
  const [sectionsByProject, setSectionsByProject] = useState({})
  const [sectionsLoading, setSectionsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  function toggleDefault(project) {
    setDraftDefaults((prev) => {
      const next = new Set(prev)
      const key = project.name.toLowerCase()
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSection(projectId, sectionId) {
    setDraftDisabled((prev) => {
      const next = new Map(prev)
      const current = new Set(next.get(projectId) || [])
      if (current.has(sectionId)) current.delete(sectionId)
      else current.add(sectionId)
      next.set(projectId, current)
      return next
    })
  }

  function toggleExpanded(project) {
    if (expandedProjectId === project.id) {
      setExpandedProjectId(null)
      return
    }
    setExpandedProjectId(project.id)
    if (!(project.id in sectionsByProject)) {
      setSectionsLoading(true)
      fetchSectionsForProject(project.id)
        .then((sections) => {
          setSectionsByProject((prev) => ({ ...prev, [project.id]: sections }))
        })
        .catch((err) => setSaveError(err.message))
        .finally(() => setSectionsLoading(false))
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    const defaultProjects = projects
      .filter((p) => draftDefaults.has(p.name.toLowerCase()))
      .map((p) => p.name)
    const disabledSections = {}
    for (const [projectId, sectionIds] of draftDisabled.entries()) {
      if (sectionIds.size > 0) disabledSections[projectId] = [...sectionIds]
    }
    try {
      await onSave({ defaultProjects, disabledSections })
      onClose()
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <p className="settings-hint">
          Pick which projects show on the homepage by default, and hide individual sections
          from the board.
        </p>

        {saveError && <p className="status status-error">{saveError}</p>}

        <ul className="settings-project-list">
          {projects.map((project) => {
            const isDefault = draftDefaults.has(project.name.toLowerCase())
            const expanded = expandedProjectId === project.id
            const sections = sectionsByProject[project.id]
            const disabledForProject = draftDisabled.get(project.id) || new Set()
            return (
              <li key={project.id} className="settings-project">
                <div className="settings-project-row">
                  <label className="settings-checkbox">
                    <input
                      type="checkbox"
                      checked={isDefault}
                      onChange={() => toggleDefault(project)}
                    />
                    {project.name}
                  </label>
                  <button
                    type="button"
                    className="settings-expand"
                    onClick={() => toggleExpanded(project)}
                  >
                    {expanded ? 'Hide sections' : 'Sections'}
                  </button>
                </div>

                {expanded && (
                  <div className="settings-sections">
                    {sectionsLoading && !sections && <p className="status">Loading sections…</p>}
                    {sections && sections.length === 0 && (
                      <p className="status">No sections in this project.</p>
                    )}
                    {sections?.map((section) => (
                      <label key={section.id} className="settings-checkbox settings-section-row">
                        <input
                          type="checkbox"
                          checked={!disabledForProject.has(section.id)}
                          onChange={() => toggleSection(project.id, section.id)}
                        />
                        {section.name}
                      </label>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <div className="settings-footer">
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="settings-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
