import { useEffect, useRef, useState, useCallback } from 'react'
import type { Payload } from '../types/payload'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface UseWebSocketOptions {
  onMessage: (payload: Payload) => void
  onHistoryMessage?: (payload: Payload) => void
  onOpen?: () => void
}

interface UseWebSocketReturn {
  status: ConnectionStatus
  send: (action: string, message: unknown) => void
  disconnect: () => void
}

export function useWebSocket(
  url: string | null,
  options: UseWebSocketOptions,
): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (!url) {
      setStatus('disconnected')
      return
    }

    setStatus('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      optionsRef.current.onOpen?.()
    }
    ws.onclose = () => setStatus('disconnected')
    ws.onerror = () => setStatus('error')
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as Payload
        // BAF sends the message field as a JSON-encoded string.
        // Try to decode it; also handle Python repr (single-quoted dicts).
        if (typeof payload.message === 'string') {
          try {
            payload.message = JSON.parse(payload.message)
          } catch {
            try {
              payload.message = JSON.parse((payload.message as string).replace(/'/g, '"'))
            } catch {
              // Keep as plain string (agent_reply_str, agent_reply_markdown, etc.)
            }
          }
        }
        if (payload.history) {
          optionsRef.current.onHistoryMessage?.(payload)
        } else {
          optionsRef.current.onMessage(payload)
        }
      } catch {
        console.error('Failed to parse WS message:', event.data)
      }
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [url])

  const send = useCallback((action: string, message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, message }))
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  return { status, send, disconnect }
}
