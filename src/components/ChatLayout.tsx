import { useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { SessionSidebar } from './SessionSidebar'
import { ChatArea } from './ChatArea'
import { ThemeToggle } from './ThemeToggle'
import { PayloadAction } from '../types/payload'
import type { Theme } from '../hooks/useTheme'
import {
  REASONING_TRACE_ACTION,
  isReasoningEnd,
  isReasoningStart,
  type ReasoningStep,
  type ReasoningTraceMessage,
  type Task,
} from '../types/reasoningStep'
import type { Agent, ChatMessage } from '../types/agent'
import type { SessionRecord } from '../services/db'

interface ChatLayoutProps {
  agent: Agent
  username?: string
  onBack: () => void
  theme: Theme
  onToggleTheme: () => void
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

/**
 * Fold an incoming reasoning step into the message list.
 *
 * - `reasoning_started` opens a new synthetic `reasoning_trace` ChatMessage
 *   with `inProgress: true` and the bracket step as its first entry.
 * - Subsequent steps append to the most recent in-progress trace.
 * - `reasoning_finished` appends and flips `inProgress` to false so the UI
 *   can collapse it.
 *
 * Defensive fallback: if a non-start step arrives without an open trace
 * (history replay, reconnect, etc.) we open a new trace anyway so the step
 * is never silently dropped.
 */
function appendReasoningStep(
  prev: ChatMessage[],
  step: ReasoningStep,
  timestamp?: string,
): ChatMessage[] {
  if (isReasoningStart(step)) {
    return [
      ...prev,
      {
        id: crypto.randomUUID(),
        action: REASONING_TRACE_ACTION,
        message: {
          steps: [step],
          tasks: [],
          inProgress: true,
        } satisfies ReasoningTraceMessage,
        isUser: false,
        timestamp,
      },
    ]
  }

  // Find the last in-progress trace and append to it.
  for (let i = prev.length - 1; i >= 0; i--) {
    const m = prev[i]
    if (m.action !== REASONING_TRACE_ACTION) continue
    const trace = m.message as ReasoningTraceMessage
    if (!trace.inProgress) break  // last trace already closed; fall through to defensive new-trace branch
    const next = [...prev]
    next[i] = {
      ...m,
      message: {
        steps: [...trace.steps, step],
        tasks: trace.tasks,
        inProgress: !isReasoningEnd(step),
      } satisfies ReasoningTraceMessage,
    }
    return next
  }

  // No open trace — open one defensively (handles history replays / reconnects).
  return [
    ...prev,
    {
      id: crypto.randomUUID(),
      action: REASONING_TRACE_ACTION,
      message: {
        steps: [step],
        tasks: [],
        inProgress: !isReasoningEnd(step),
      } satisfies ReasoningTraceMessage,
      isUser: false,
      timestamp,
    },
  ]
}

/**
 * Replace the task list of the most recent in-progress reasoning trace.
 *
 * Each task_list_update payload carries the *full* current snapshot, so the
 * UI just swaps the trace's `tasks` array. If no in-progress trace exists
 * (history replay, late reconnect), open one defensively so the snapshot is
 * still visible to the user.
 */
function applyTaskListUpdate(
  prev: ChatMessage[],
  tasks: Task[],
  timestamp?: string,
): ChatMessage[] {
  for (let i = prev.length - 1; i >= 0; i--) {
    const m = prev[i]
    if (m.action !== REASONING_TRACE_ACTION) continue
    const trace = m.message as ReasoningTraceMessage
    if (!trace.inProgress) break
    const next = [...prev]
    next[i] = {
      ...m,
      message: { ...trace, tasks } satisfies ReasoningTraceMessage,
    }
    return next
  }
  return [
    ...prev,
    {
      id: crypto.randomUUID(),
      action: REASONING_TRACE_ACTION,
      message: { steps: [], tasks, inProgress: true } satisfies ReasoningTraceMessage,
      isUser: false,
      timestamp,
    },
  ]
}

export function ChatLayout({ agent, username, onBack, theme, onToggleTheme }: ChatLayoutProps) {
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
      if (payload.action === PayloadAction.AGENT_REPLY_REASONING_STEP) {
        setMessages((prev) => appendReasoningStep(prev, payload.message as ReasoningStep, payload.timestamp))
        return
      }
      if (payload.action === PayloadAction.AGENT_REPLY_TASK_LIST_UPDATE) {
        setMessages((prev) => applyTaskListUpdate(prev, payload.message as Task[], payload.timestamp))
        return
      }
      setMessages((prev) => [
        ...prev,
        {
          id: payload.message_id ?? crypto.randomUUID(),
          action: payload.action,
          message: payload.message,
          isUser: false,
          timestamp: payload.timestamp,
        },
      ])
    },
    onHistoryMessage: (payload) => {
      if (payload.action === PayloadAction.AGENT_REPLY_REASONING_STEP) {
        setMessages((prev) => appendReasoningStep(prev, payload.message as ReasoningStep, payload.timestamp))
        return
      }
      if (payload.action === PayloadAction.AGENT_REPLY_TASK_LIST_UPDATE) {
        setMessages((prev) => applyTaskListUpdate(prev, payload.message as Task[], payload.timestamp))
        return
      }
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
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
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
