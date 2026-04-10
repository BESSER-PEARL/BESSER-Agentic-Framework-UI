import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionRecord } from '../services/db'

interface SessionSidebarProps {
  agentName: string
  username?: string
  selectedSessionId: string | null
  onSelectSession: (session: SessionRecord) => void
  onDeleteSession: (session: SessionRecord) => void
  onSessionsLoaded?: (sessions: SessionRecord[]) => void
  refreshKey?: number
  sessionName: string
  onSessionNameChange: (value: string) => void
  onStartSession: () => void
}

export function SessionSidebar({
  agentName,
  username,
  selectedSessionId,
  onSelectSession,
  onDeleteSession,
  onSessionsLoaded,
  refreshKey = 0,
  sessionName,
  onSessionNameChange,
  onStartSession,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onSessionsLoadedRef = useRef(onSessionsLoaded)
  onSessionsLoadedRef.current = onSessionsLoaded

  const fetchSessions = useCallback(() => {
    const params = new URLSearchParams({ agent_name: agentName })
    if (username) params.set('username', username)

    return fetch(`/api/sessions?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Server error ${r.status}`)
        return r.json() as Promise<SessionRecord[]>
      })
      .then((data) => {
        setSessions(data)
        onSessionsLoadedRef.current?.(data)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [agentName, username])

  useEffect(() => {
    setLoading(true)
    fetchSessions().finally(() => setLoading(false))

    const interval = setInterval(fetchSessions, 5000)
    return () => clearInterval(interval)
  }, [fetchSessions, refreshKey])

  function formatTimestamp(ts: string) {
    const d = new Date(ts)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <aside className="session-sidebar">
      <div className="session-sidebar__header">
        <span className="session-sidebar__title">Sessions</span>
        <div className="session-sidebar__new">
          <input
            className="session-sidebar__name-input"
            value={sessionName}
            onChange={(e) => onSessionNameChange(e.target.value)}
            placeholder="Session name (optional)"
            onKeyDown={(e) => e.key === 'Enter' && onStartSession()}
          />
          <button className="btn btn--primary session-sidebar__start-btn" onClick={onStartSession}>
            + New session
          </button>
        </div>
      </div>

      <div className="session-sidebar__body">
        {loading && <div className="session-sidebar__status">Loading…</div>}

        {!loading && error && (
          <div className="session-sidebar__status session-sidebar__status--error">{error}</div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="session-sidebar__status">No sessions found</div>
        )}

        {!loading && !error && sessions.map((session) => {
          const isActive = selectedSessionId === session.session_id
          return (
            <div
              key={session.id}
              className={`session-item${isActive ? ' session-item--active' : ''}`}
            >
              <button
                className="session-item__content"
                onClick={() => onSelectSession(session)}
              >
                <div className="session-item__id" title={session.session_id}>
                  {session.session_name ?? session.session_id}
                </div>
                {session.session_name && (
                  <div className="session-item__meta">{session.session_id}</div>
                )}
                <div className="session-item__meta">{formatTimestamp(session.timestamp)}</div>
              </button>
              {isActive && (
                <button
                  className="session-item__delete"
                  title="Delete session"
                  onClick={() => onDeleteSession(session)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
