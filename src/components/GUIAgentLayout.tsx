import { useState, useCallback } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { PayloadAction } from '../types/payload'
import type { Payload } from '../types/payload'
import type { Agent, ChatMessage } from '../types/agent'
import type { Theme } from '../hooks/useTheme'
import { GUIRenderer } from './GUIRenderer'
import { ThemeToggle } from './ThemeToggle'

interface GUIAgentLayoutProps {
  agent: Agent
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

// Actions that update the GUI model rather than producing chat messages.
const GUI_ACTIONS = new Set([PayloadAction.AGENT_REPLY_GUI, PayloadAction.AGENT_REPLY_GUI_UPDATE])

export function GUIAgentLayout({ agent, onBack, theme, onToggleTheme }: GUIAgentLayoutProps) {
  const [guiModel, setGuiModel] = useState<unknown>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

  const handleMessage = useCallback((payload: Payload) => {
    if (GUI_ACTIONS.has(payload.action as typeof PayloadAction.AGENT_REPLY_GUI)) {
      setGuiModel(payload.message)
    } else {
      // Route all other replies to the embedded AgentComponent chat widget.
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          action: payload.action,
          message: payload.message,
          isUser: false,
          timestamp: payload.timestamp,
        },
      ])
    }
  }, [])

  const { status, send } = useWebSocket(agent.url, { onMessage: handleMessage })

  const handleInteract = useCallback(
    (eventJson: string) => {
      try {
        send(PayloadAction.USER_GUI_EVENT, JSON.parse(eventJson))
      } catch {
        send(PayloadAction.USER_GUI_EVENT, { raw: eventJson })
      }
    },
    [send],
  )

  const dotColor = STATUS_COLOR[status] ?? '#94a3b8'
  const statusLabel = STATUS_LABEL[status] ?? status

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

      <div className="gui-agent-layout__content">
        {guiModel ? (
          <GUIRenderer
            content={guiModel}
            onInteract={handleInteract}
            chatProps={{ messages: chatMessages, setMessages: setChatMessages, send, status }}
          />
        ) : (
          <div className="gui-agent-layout__placeholder">
            {status === 'connected'
              ? 'Waiting for GUI from agent…'
              : STATUS_LABEL[status] ?? status}
          </div>
        )}
      </div>
    </div>
  )
}
