import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageBubble } from './MessageBubble'
import { PayloadAction } from '../types/payload'
import type { ChatMessage } from '../types/agent'
import type { ConnectionStatus } from '../hooks/useWebSocket'

interface AttachedFile {
  id: string
  name: string
  base64: string
  mimeType: string
}

interface ChatAreaProps {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  status: ConnectionStatus
  send: (action: string, message: unknown) => void
}

function nowTimestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function ChatArea({ messages, setMessages, status, send }: ChatAreaProps) {
  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Close attach menu when clicking outside
  useEffect(() => {
    if (!attachMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [attachMenuOpen])

  function autoResize() {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        stream.getTracks().forEach((t) => t.stop())

        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          const base64 = dataUrl.split(',')[1] ?? ''
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              action: PayloadAction.USER_VOICE,
              message: base64,
              isUser: true,
              timestamp: nowTimestamp(),
            },
          ])
          send(PayloadAction.USER_VOICE, base64)
        }
        reader.readAsDataURL(blob)
        setIsRecording(false)
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
    } catch {
      console.error('Microphone access denied or unavailable')
    }
  }

  function handleMicClick() {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      mediaRecorderRef.current = null
    } else {
      startRecording()
    }
  }

  const handleSend = useCallback(() => {
    const text = input.trim()
    const hasFiles = attachedFiles.length > 0
    if ((!text && !hasFiles) || status !== 'connected') return

    // Send each file as a separate user_file payload
    for (const file of attachedFiles) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          action: PayloadAction.USER_FILE,
          message: { name: file.name, type: file.mimeType, base64: file.base64 },
          isUser: true,
          timestamp: nowTimestamp(),
        },
      ])
      send(PayloadAction.USER_FILE, JSON.stringify({ name: file.name, type: file.mimeType, base64: file.base64 }))
    }
    setAttachedFiles([])

    if (text) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          action: PayloadAction.USER_MESSAGE,
          message: text,
          isUser: true,
          timestamp: nowTimestamp(),
        },
      ])
      send(PayloadAction.USER_MESSAGE, text)
      setInput('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    }
  }, [input, attachedFiles, status, send, setMessages])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleOptionSelect(option: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        action: PayloadAction.USER_MESSAGE,
        message: option,
        isUser: true,
        timestamp: nowTimestamp(),
      },
    ])
    send(PayloadAction.USER_MESSAGE, option)
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return

    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        // Strip the data:...;base64, prefix
        const base64 = dataUrl.split(',')[1] ?? ''
        setAttachedFiles((prev) => [
          ...prev,
          { id: crypto.randomUUID(), name: file.name, base64, mimeType: file.type },
        ])
      }
      reader.readAsDataURL(file)
    })
    // Reset so the same file can be re-added
    e.target.value = ''
    setAttachMenuOpen(false)
  }

  function removeFile(id: string) {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const placeholder =
    status === 'connected'
      ? 'Type a message… (Enter to send, Shift+Enter for new line)'
      : status === 'connecting'
        ? 'Connecting…'
        : 'Not connected'

  const canSend = status === 'connected' && (input.trim().length > 0 || attachedFiles.length > 0)

  return (
    <div className="chat-area">
      <div className="chat-area__messages">
        {messages.length === 0 && (
          <div className="chat-area__empty">
            {status === 'connecting'
              ? 'Connecting to agent…'
              : status === 'connected'
                ? 'Send a message to start the conversation'
                : status === 'error'
                  ? 'Connection error — check the agent URL'
                  : 'Disconnected'}
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onOptionSelect={handleOptionSelect} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="chat-area__input-row">
        {/* Hidden file picker */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />

        <div className="chat-area__composer">
          {/* Attached file chips */}
          {attachedFiles.length > 0 && (
            <div className="chat-area__attachments">
              {attachedFiles.map((f) => (
                <div key={f.id} className="attachment-chip">
                  <span className="attachment-chip__icon">📄</span>
                  <span className="attachment-chip__name">{f.name}</span>
                  <button
                    className="attachment-chip__remove"
                    onClick={() => removeFile(f.id)}
                    title="Remove file"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="chat-area__input-line">
            <textarea
              ref={textareaRef}
              className="chat-area__textarea"
              value={input}
              rows={1}
              placeholder={placeholder}
              disabled={status !== 'connected'}
              onChange={(e) => {
                setInput(e.target.value)
                autoResize()
              }}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        {/* Attach (+) button */}
        <div className="attach-menu-anchor" ref={attachMenuRef}>
          <button
            className="btn chat-area__icon-btn"
            title="Attach"
            disabled={status !== 'connected'}
            onClick={() => setAttachMenuOpen((o) => !o)}
          >
            +
          </button>
          {attachMenuOpen && (
            <div className="attach-menu">
              <button
                className="attach-menu__item"
                onClick={() => fileInputRef.current?.click()}
              >

                Add Files
              </button>
            </div>
          )}
        </div>

        {/* Microphone button */}
        <button
          type="button"
          className={`btn chat-area__icon-btn chat-area__mic-btn${isRecording ? ' chat-area__mic-btn--recording' : ''}`}
          title={isRecording ? 'Stop recording' : 'Record voice message'}
          disabled={status !== 'connected'}
          onClick={handleMicClick}
        >
          {isRecording ? (
            // Stop square icon
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="1" y="1" width="12" height="12" rx="2" />
            </svg>
          ) : (
            // Microphone icon
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="5" y="1" width="6" height="9" rx="3" />
              <path d="M3 7a5 5 0 0 0 10 0" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              <line x1="8" y1="12" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="5.5" y1="15" x2="10.5" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
        </button>

        {/* Send button */}
        <button
          className="btn btn--primary chat-area__send-btn"
          onClick={handleSend}
          disabled={!canSend}
          title="Send"
        >
          &#8594;
        </button>
      </div>
    </div>
  )
}
