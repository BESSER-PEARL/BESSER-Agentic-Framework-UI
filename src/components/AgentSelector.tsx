import { useState } from 'react'
import type { Agent } from '../types/agent'

interface AgentSelectorProps {
  agents: Agent[]
  username: string
  onUsernameChange: (value: string) => void
  onSelectAgent: (agent: Agent) => void
  onAddAgent: (agent: Agent) => void
  onRemoveAgent: (id: string) => void
}

export function AgentSelector({
  agents,
  username,
  onUsernameChange,
  onSelectAgent,
  onAddAgent,
  onRemoveAgent,
}: AgentSelectorProps) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('ws://localhost:8765')
  const [mode, setMode] = useState<'chat' | 'gui'>('chat')
  const [urlError, setUrlError] = useState('')

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

  return (
    <div className="agent-selector">
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

      <div className="agent-selector__grid">
        {agents.map((agent) => (
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
        ))}

        <button className="agent-card agent-card--add" onClick={() => setShowForm(true)}>
          <span className="agent-card__plus">+</span>
          <span>Add Agent</span>
        </button>
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
