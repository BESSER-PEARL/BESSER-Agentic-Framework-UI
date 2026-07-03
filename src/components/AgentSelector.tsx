import { useState } from 'react'
import type { Agent } from '../types/agent'
import type { Theme } from '../hooks/useTheme'
import { ThemeToggle } from './ThemeToggle'

type ViewMode = 'grid' | 'list'

const VIEW_MODE_STORAGE_KEY = 'baf_agent_view_mode'

function loadViewMode(): ViewMode {
  return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === 'list' ? 'list' : 'grid'
}

interface AgentSelectorProps {
  agents: Agent[]
  username: string
  onUsernameChange: (value: string) => void
  onSelectAgent: (agent: Agent) => void
  onAddAgent: (agent: Agent) => void
  onRemoveAgent: (id: string) => void
  onUpdateAgents: (agents: Agent[]) => void
  theme: Theme
  onToggleTheme: () => void
}

interface FieldErrors {
  name?: string
  url?: string
}

export function AgentSelector({
  agents,
  username,
  onUsernameChange,
  onSelectAgent,
  onAddAgent,
  onRemoveAgent,
  onUpdateAgents,
  theme,
  onToggleTheme,
}: AgentSelectorProps) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('ws://localhost:8765')
  const [mode, setMode] = useState<'chat' | 'gui'>('chat')
  const [urlError, setUrlError] = useState('')

  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  const [isEditMode, setIsEditMode] = useState(false)
  const [draftAgents, setDraftAgents] = useState<Agent[]>([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, FieldErrors>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return

    const trimmedUrl = url.trim()
    if (!trimmedUrl.startsWith('ws://') && !trimmedUrl.startsWith('wss://')) {
      setUrlError('URL must start with ws:// or wss://')
      return
    }

    onAddAgent({
      id: crypto.randomUUID(),
      name: name.trim(),
      url: trimmedUrl,
      mode,
    })
    setName('')
    setUrl('ws://localhost:8765')
    setMode('chat')
    setUrlError('')
    setShowForm(false)
  }

  function handleClose() {
    setShowForm(false)
    setName('')
    setUrl('ws://localhost:8765')
    setMode('chat')
    setUrlError('')
  }

  function handleViewModeChange(next: ViewMode) {
    setViewMode(next)
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, next)
  }

  function handleEnterEditMode() {
    setDraftAgents(agents.map((a) => ({ ...a })))
    setFieldErrors({})
    setIsEditMode(true)
  }

  function handleCancelEdit() {
    setIsEditMode(false)
    setDraftAgents([])
    setFieldErrors({})
    setDragId(null)
    setOverId(null)
  }

  function handleSaveEdit() {
    const nextErrors: Record<string, FieldErrors> = {}
    for (const agent of draftAgents) {
      const errors: FieldErrors = {}
      if (!agent.name.trim()) errors.name = 'Name is required'
      const trimmedUrl = agent.url.trim()
      if (!trimmedUrl) {
        errors.url = 'URL is required'
      } else if (!trimmedUrl.startsWith('ws://') && !trimmedUrl.startsWith('wss://')) {
        errors.url = 'Must start with ws:// or wss://'
      }
      if (Object.keys(errors).length > 0) nextErrors[agent.id] = errors
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors)
      return
    }
    onUpdateAgents(draftAgents.map((a) => ({ ...a, name: a.name.trim(), url: a.url.trim() })))
    setIsEditMode(false)
    setDraftAgents([])
    setFieldErrors({})
  }

  function updateDraftAgent(id: string, patch: Partial<Agent>) {
    setDraftAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
    setFieldErrors((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function removeDraftAgent(id: string) {
    setDraftAgents((prev) => prev.filter((a) => a.id !== id))
    setFieldErrors((prev) => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  // Native HTML5 drag & drop for reordering agents while in edit mode.
  // The drag handle is the only element with `draggable`, but we use the
  // card element (found via closest()) as the custom drag image so the
  // whole row/tile appears to move, not just the small handle icon.
  function handleDragStart(e: React.DragEvent<HTMLSpanElement>, id: string) {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
    const card = e.currentTarget.closest('.agent-card')
    if (card) {
      const rect = card.getBoundingClientRect()
      e.dataTransfer.setDragImage(card, e.clientX - rect.left, e.clientY - rect.top)
    }
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>, id: string) {
    e.preventDefault()
    if (dragId && dragId !== id) setOverId(id)
  }

  function handleDragOverCard(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, targetId: string) {
    e.preventDefault()
    setOverId(null)
    const sourceId = dragId
    setDragId(null)
    if (!sourceId || sourceId === targetId) return
    setDraftAgents((prev) => {
      const fromIndex = prev.findIndex((a) => a.id === sourceId)
      const toIndex = prev.findIndex((a) => a.id === targetId)
      if (fromIndex === -1 || toIndex === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  function handleDragEnd() {
    setDragId(null)
    setOverId(null)
  }

  const displayAgents = isEditMode ? draftAgents : agents

  return (
    <div className="agent-selector">
      <div className="agent-selector__topbar">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
      <div className="agent-selector__header">
        <h1 className="agent-selector__title">BESSER Agentic Framework</h1>
        <p className="agent-selector__subtitle">Select an agent to start a conversation</p>
        <div className="agent-selector__username-bar">
          <label className="agent-selector__username-label" htmlFor="global-username">
            Username
          </label>
          <input
            id="global-username"
            className="agent-selector__username-input"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder="Enter username to filter sessions"
            autoComplete="username"
          />
        </div>
      </div>

      <div className="agent-selector__toolbar">
        <div className="view-toggle" role="group" aria-label="Change agent list layout">
          <button
            type="button"
            className={`view-toggle__btn${viewMode === 'grid' ? ' view-toggle__btn--active' : ''}`}
            onClick={() => handleViewModeChange('grid')}
            title="Grid view"
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
          >
            <GridIcon />
          </button>
          <button
            type="button"
            className={`view-toggle__btn${viewMode === 'list' ? ' view-toggle__btn--active' : ''}`}
            onClick={() => handleViewModeChange('list')}
            title="List view"
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
          >
            <ListIcon />
          </button>
        </div>

        <div className="agent-selector__toolbar-actions">
          {isEditMode ? (
            <>
              <button type="button" className="btn btn--secondary" onClick={handleCancelEdit}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" onClick={handleSaveEdit}>
                💾 Save
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleEnterEditMode}
              disabled={agents.length === 0}
            >
              ✎ Edit
            </button>
          )}
        </div>
      </div>

      <div className={viewMode === 'grid' ? 'agent-selector__grid' : 'agent-selector__list'}>
        {displayAgents.map((agent) =>
          isEditMode ? (
            <div
              key={agent.id}
              className={
                'agent-card agent-card--edit' +
                (dragId === agent.id ? ' agent-card--dragging' : '') +
                (overId === agent.id && dragId !== agent.id ? ' agent-card--drag-over' : '')
              }
              onDragEnter={(e) => handleDragEnter(e, agent.id)}
              onDragOver={handleDragOverCard}
              onDrop={(e) => handleDrop(e, agent.id)}
            >
              <span
                className="agent-card__drag-handle"
                draggable
                onDragStart={(e) => handleDragStart(e, agent.id)}
                onDragEnd={handleDragEnd}
                title="Drag to reorder"
                aria-label="Drag to reorder"
              >
                <DragHandleIcon />
              </span>

              <div className="agent-card__edit-fields">
                <label className="agent-card__edit-label">
                  Name
                  <input
                    className={`agent-card__edit-input${fieldErrors[agent.id]?.name ? ' modal__input--error' : ''}`}
                    value={agent.name}
                    onChange={(e) => updateDraftAgent(agent.id, { name: e.target.value })}
                  />
                  {fieldErrors[agent.id]?.name && (
                    <span className="modal__error">{fieldErrors[agent.id].name}</span>
                  )}
                </label>
                <label className="agent-card__edit-label">
                  WebSocket URL
                  <input
                    className={`agent-card__edit-input${fieldErrors[agent.id]?.url ? ' modal__input--error' : ''}`}
                    value={agent.url}
                    onChange={(e) => updateDraftAgent(agent.id, { url: e.target.value })}
                  />
                  {fieldErrors[agent.id]?.url && (
                    <span className="modal__error">{fieldErrors[agent.id].url}</span>
                  )}
                </label>
                <div className="mode-toggle mode-toggle--sm">
                  <button
                    type="button"
                    className={`mode-toggle__btn${agent.mode === 'chat' ? ' mode-toggle__btn--active' : ''}`}
                    onClick={() => updateDraftAgent(agent.id, { mode: 'chat' })}
                  >
                    🤖 Chat
                  </button>
                  <button
                    type="button"
                    className={`mode-toggle__btn${agent.mode === 'gui' ? ' mode-toggle__btn--active' : ''}`}
                    onClick={() => updateDraftAgent(agent.id, { mode: 'gui' })}
                  >
                    💻 GUI
                  </button>
                </div>
              </div>

              <button
                className="agent-card__remove"
                onClick={() => removeDraftAgent(agent.id)}
                title="Remove agent"
              >
                ×
              </button>
            </div>
          ) : (
            <div key={agent.id} className="agent-card" onClick={() => onSelectAgent(agent)}>
              <div className="agent-card__icon">{agent.mode === 'gui' ? '💻' : '🤖'}</div>
              <div className="agent-card__info">
                <div className="agent-card__name">{agent.name}</div>
                <div className="agent-card__url">{agent.url}</div>
              </div>
              <span className={`agent-card__mode-badge agent-card__mode-badge--${agent.mode ?? 'chat'}`}>
                {agent.mode === 'gui' ? 'GUI' : 'Chat'}
              </span>
              <button
                className="agent-card__remove"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveAgent(agent.id)
                }}
                title="Remove agent"
              >
                ×
              </button>
            </div>
          ),
        )}

        {!isEditMode && (
          <button className="agent-card agent-card--add" onClick={() => setShowForm(true)}>
            <span className="agent-card__plus">+</span>
            <span>Add Agent</span>
          </button>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={handleClose}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">Add Agent</h2>
            <form onSubmit={handleAdd} className="modal__form">
              <label className="modal__label">
                Name
                <input
                  className="modal__input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Agent"
                  required
                  autoFocus
                />
              </label>
              <label className="modal__label">
                WebSocket URL
                <input
                  className={`modal__input${urlError ? ' modal__input--error' : ''}`}
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value)
                    setUrlError('')
                  }}
                  required
                />
                {urlError && <span className="modal__error">{urlError}</span>}
              </label>
              <div className="modal__label">
                Mode
                <div className="mode-toggle">
                  <button
                    type="button"
                    className={`mode-toggle__btn${mode === 'chat' ? ' mode-toggle__btn--active' : ''}`}
                    onClick={() => setMode('chat')}
                  >
                    🤖 Chat
                  </button>
                  <button
                    type="button"
                    className={`mode-toggle__btn${mode === 'gui' ? ' mode-toggle__btn--active' : ''}`}
                    onClick={() => setMode('gui')}
                  >
                    💻 Full GUI
                  </button>
                </div>
                <p className="modal__hint">
                  {mode === 'chat'
                    ? 'Standard chat interface — send messages and receive text, images, and inline UI replies.'
                    : 'Full GUI mode — the agent controls the entire UI; interactions are sent back as events.'}
                </p>
              </div>
              <div className="modal__actions">
                <button type="button" className="btn btn--secondary" onClick={handleClose}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary">
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="3" r="1.4" />
      <circle cx="11" cy="3" r="1.4" />
      <circle cx="5" cy="8" r="1.4" />
      <circle cx="11" cy="8" r="1.4" />
      <circle cx="5" cy="13" r="1.4" />
      <circle cx="11" cy="13" r="1.4" />
    </svg>
  )
}

