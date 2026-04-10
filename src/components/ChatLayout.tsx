import { useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { SessionSidebar } from './SessionSidebar'
import { ChatArea } from './ChatArea'
import { PayloadAction } from '../types/payload'
import type { Agent, ChatMessage } from '../types/agent'
import type { SessionRecord } from '../services/db'

interface ChatLayoutProps {
  agent: Agent
  username?: string
  onBack: () => void
}

const STATUS_COLOR: Record<string, string> = {
  connected: '#22c55e',
  connecting: '#f59e0b',
  error: '#ef4444',
  disconnected: '#94a3b8',
}

const STATUS_LABEL: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  error: 'Connection error',
  disconnected: 'Disconnected',
}

export function ChatLayout({ agent, username, onBack }: ChatLayoutProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(null)
  const [wsUrl, setWsUrl] = useState<string | null>(null)
  const [fetchOnOpen, setFetchOnOpen] = useState(false)
  const [sessionName, setSessionName] = useState('')
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0)
  const [knownSessions, setKnownSessions] = useState<SessionRecord[]>([])

  function buildUrl(extraParams: Record<string, string> = {}) {
    const params = new URLSearchParams()
    if (username) params.set('user_id', username)
    for (const [k, v] of Object.entries(extraParams)) params.set(k, v)
    const qs = params.toString()
    return qs ? `${agent.url}?${qs}` : agent.url
  }

  const { status, send } = useWebSocket(wsUrl, {
    onMessage: (payload) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          action: payload.action,
          message: payload.message,
          isUser: false,
          timestamp: payload.timestamp,
        },
      ])
    },
    onHistoryMessage: (payload) => {
      const isUser = payload.action === PayloadAction.USER_MESSAGE ||
        payload.action === PayloadAction.USER_VOICE ||
        payload.action === PayloadAction.USER_FILE
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          action: payload.action,
          message: payload.message,
          isUser,
          timestamp: payload.timestamp,
        },
      ])
    },
    onOpen: fetchOnOpen
      ? () => {
          send(PayloadAction.FETCH_USER_MESSAGES, null)
        }
      : undefined,
  })

  function handleStartSession() {
    const trimmed = sessionName.trim()
    if (trimmed) {
      const existing = knownSessions.find(
        (s) => s.session_name === trimmed || s.session_id === trimmed,
      )
      if (existing) {
        handleSelectSession(existing)
        return
      }
    }
    setMessages([])
    setSelectedSession(null)
    setFetchOnOpen(false)
    const extra: Record<string, string> = trimmed ? { session_name: trimmed } : {}
    setWsUrl(buildUrl(extra))
    setSidebarRefreshKey((k) => k + 1)
  }

  function handleSelectSession(session: SessionRecord) {
    const newUrl = buildUrl({ session_id: session.session_id })
    setSelectedSession(session)
    setMessages([])
    if (wsUrl === newUrl && status === 'connected') {
      // Same connection already open — just fetch messages directly
      send(PayloadAction.FETCH_USER_MESSAGES, null)
    } else {
      setFetchOnOpen(true)
      setWsUrl(newUrl)
    }
  }

  async function handleDeleteSession(session: SessionRecord) {
    await fetch(`/api/sessions?session_id=${encodeURIComponent(session.session_id)}`, {
      method: 'DELETE',
    })
    setWsUrl(null)
    setMessages([])
    setSelectedSession(null)
    setSidebarRefreshKey((k) => k + 1)
  }

  const dotColor = wsUrl === null ? '#94a3b8' : (STATUS_COLOR[status] ?? '#94a3b8')
  const statusLabel = wsUrl === null ? 'Not started' : (STATUS_LABEL[status] ?? status)

  return (
    <div className="chat-layout">
      <header className="chat-layout__header">
        <button className="btn btn--ghost" onClick={onBack}>
          ← Back
        </button>
        <div className="chat-layout__agent-info">
          <span className="chat-layout__agent-name">{agent.name}</span>
          <span className="chat-layout__agent-url">{agent.url}</span>
        </div>
        <div className="status-badge">
          <span className="status-badge__dot" style={{ background: dotColor }} />
          <span style={{ color: dotColor }}>{statusLabel}</span>
        </div>
      </header>

      <div className="chat-layout__body">
        <SessionSidebar
          agentName={agent.name}
          username={username}
          selectedSessionId={selectedSession?.session_id ?? null}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
          onSessionsLoaded={setKnownSessions}
          refreshKey={sidebarRefreshKey}
          sessionName={sessionName}
          onSessionNameChange={setSessionName}
          onStartSession={handleStartSession}
        />
        <ChatArea messages={messages} setMessages={setMessages} status={status} send={send} />
      </div>
    </div>
  )
}
