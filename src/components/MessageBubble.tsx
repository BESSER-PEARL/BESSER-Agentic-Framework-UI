import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import DOMPurify from 'dompurify'
import { PayloadAction } from '../types/payload'
import type { ChatMessage } from '../types/agent'

interface MessageBubbleProps {
  message: ChatMessage
  onOptionSelect?: (option: string) => void
}

export function MessageBubble({ message, onOptionSelect }: MessageBubbleProps) {
  const { action, message: content, isUser, timestamp } = message
  const timeLabel = timestamp ?? null

  if (isUser) {
    if (action === PayloadAction.USER_VOICE) {
      const raw = typeof content === 'string' ? content : (content as { data: string }).data
      return (
        <div className="message message--user">
          {timeLabel && <span className="message__timestamp message__timestamp--user">{timeLabel}</span>}
          <div className="message__body">
            <div className="message__bubble message__bubble--user message__bubble--media">
              <AudioPlayer data={raw} />
            </div>
          </div>
        </div>
      )
    }
    if (action === PayloadAction.USER_FILE) {
      return (
        <div className="message message--user">
          {timeLabel && <span className="message__timestamp message__timestamp--user">{timeLabel}</span>}
          <div className="message__body">
            <div className="message__bubble message__bubble--user message__bubble--media">
              <FileMessage content={content} />
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="message message--user">
        {timeLabel && <span className="message__timestamp message__timestamp--user">{timeLabel}</span>}
        <div className="message__body">
          <div className="message__bubble message__bubble--user">
            {typeof content === 'string' ? content : JSON.stringify(content)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="message message--agent">
      {timeLabel && <span className="message__timestamp">{timeLabel}</span>}
      <div className="message__body">
        <div className="message__bubble message__bubble--agent">
          {renderContent(action, content, onOptionSelect)}
        </div>
      </div>
    </div>
  )
}

function renderContent(
  action: string,
  content: unknown,
  onOptionSelect?: (option: string) => void,
) {
  switch (action) {
    case PayloadAction.AGENT_REPLY_STR:
      return <p className="msg-text">{String(content)}</p>

    case PayloadAction.AGENT_REPLY_MARKDOWN:
      return (
        <div className="msg-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{String(content)}</ReactMarkdown>
        </div>
      )

    case PayloadAction.AGENT_REPLY_HTML: {
      const clean = DOMPurify.sanitize(String(content), {
        ALLOWED_TAGS: [
          'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
          'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'div', 'span', 'hr',
        ],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
        FORBID_TAGS: ['head', 'style', 'script', 'title', 'meta', 'link', 'noscript'],
        FORCE_BODY: true,
      })
      return <div className="msg-html" dangerouslySetInnerHTML={{ __html: clean }} />
    }

    case PayloadAction.AGENT_REPLY_FILE:
      return <FileMessage content={content} />

    case PayloadAction.AGENT_REPLY_IMAGE:
      return <ImageMessage content={content} />

    case PayloadAction.AGENT_REPLY_DF:
      return <DataFrameMessage content={content} />

    case PayloadAction.AGENT_REPLY_PLOTLY:
      return <PlotlyMessage content={content} />

    case PayloadAction.AGENT_REPLY_OPTIONS:
      return <OptionsMessage content={content} onSelect={onOptionSelect} />

    case PayloadAction.AGENT_REPLY_LOCATION:
      return <LocationMessage content={content} />

    case PayloadAction.AGENT_REPLY_RAG:
      return <RagMessage content={content} />

    case PayloadAction.AGENT_REPLY_AUDIO:
      return <AudioMessage content={content} />

    default:
      return <p className="msg-text msg-text--muted">[Unsupported message type: {action}]</p>
  }
}

// ─── File ──────────────────────────────────────────────────────────────────

interface FileContent {
  name: string
  data?: string
  base64?: string
  type?: string
}

function FileMessage({ content }: { content: unknown }) {
  const file = content as FileContent
  const fileData = file.data ?? file.base64 ?? ''

  function handleDownload() {
    try {
      const bytes = atob(fileData)
      const arr = new Uint8Array(bytes.length)
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
      const blob = new Blob([arr], { type: file.type ?? 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name ?? 'download'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      console.error('Failed to decode file data')
    }
  }

  return (
    <button className="msg-file-btn" onClick={handleDownload}>
      📄 {file.name ?? 'Download file'}
    </button>
  )
}

// ─── Image ─────────────────────────────────────────────────────────────────

interface ImageContent {
  name?: string
  data?: string
  base64?: string
  type?: string
  format?: string
}

function ImageMessage({ content }: { content: unknown }) {
  // BAF may send a plain base64 string, or an object with data/base64 key
  let b64: string
  let mimeType: string

  if (typeof content === 'string') {
    b64 = content
    mimeType = 'image/png'
  } else {
    const img = content as ImageContent
    b64 = img.data ?? img.base64 ?? ''
    mimeType = img.type ?? (img.format ? `image/${img.format.toLowerCase()}` : 'image/png')
  }

  if (!b64) {
    return <span className="msg-text--muted">Image unavailable</span>
  }

  const src = `data:${mimeType};base64,${b64}`
  const alt = typeof content === 'object' && content !== null
    ? ((content as ImageContent).name ?? 'Image')
    : 'Image'

  return (
    <div className="msg-image">
      <img src={src} alt={alt} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
    </div>
  )
}

// ─── DataFrame ─────────────────────────────────────────────────────────────

function DataFrameMessage({ content }: { content: unknown }) {
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  // Normalise to { columns, rows } regardless of records vs split vs column-oriented format
  let columns: string[] = []
  let rows: unknown[][] = []

  if (Array.isArray(content) && content.length > 0) {
    // Records format: [{col: val, ...}, ...]
    columns = Object.keys(content[0] as object)
    rows = (content as Record<string, unknown>[]).map((r) => columns.map((c) => r[c]))
  } else if (content !== null && typeof content === 'object') {
    const df = content as Record<string, unknown>
    if (Array.isArray(df.data) && Array.isArray(df.columns)) {
      // Split format: { columns: [...], data: [[...], ...] }
      columns = df.columns as string[]
      rows = df.data as unknown[][]
    } else {
      // Column-oriented format: { col: { "0": val, "1": val }, ... }
      // Detect by checking if every value is a plain object (not array)
      const topKeys = Object.keys(df)
      const firstVal = df[topKeys[0]]
      if (
        topKeys.length > 0 &&
        firstVal !== null &&
        typeof firstVal === 'object' &&
        !Array.isArray(firstVal)
      ) {
        columns = topKeys
        const colObj = df as Record<string, Record<string, unknown>>
        const indices = Object.keys(colObj[columns[0]])
        rows = indices.map((idx) => columns.map((col) => colObj[col][idx]))
      }
    }
  }

  if (columns.length === 0) {
    return <pre className="msg-code">{JSON.stringify(content, null, 2)}</pre>
  }

  function handleHeaderClick(i: number) {
    if (sortCol === i) {
      setSortAsc((asc) => !asc)
    } else {
      setSortCol(i)
      setSortAsc(true)
    }
  }

  const sortedRows =
    sortCol === null
      ? rows
      : [...rows].sort((a, b) => {
          const av = (a as unknown[])[sortCol]
          const bv = (b as unknown[])[sortCol]
          if (av == null && bv == null) return 0
          if (av == null) return sortAsc ? 1 : -1
          if (bv == null) return sortAsc ? -1 : 1
          if (typeof av === 'number' && typeof bv === 'number')
            return sortAsc ? av - bv : bv - av
          return sortAsc
            ? String(av).localeCompare(String(bv))
            : String(bv).localeCompare(String(av))
        })

  return (
    <div className="msg-table-wrapper">
      <table className="msg-table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={col}
                className={`msg-table__th${sortCol === i ? ' msg-table__th--sorted' : ''}`}
                onClick={() => handleHeaderClick(i)}
              >
                {col}
                <span className="msg-table__sort-icon">
                  {sortCol === i ? (sortAsc ? '↑' : '↓') : '↕'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr key={i}>
              {(row as unknown[]).map((cell, j) => (
                <td key={j}>{String(cell ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Plotly ────────────────────────────────────────────────────────────────

function PlotlyMessage({ content }: { content: unknown }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let active = true
    const fig = content as { data?: unknown[]; layout?: unknown; config?: unknown }

    import('plotly.js-dist-min').then((Plotly) => {
      if (!active || !el) return
      Plotly.newPlot(
        el,
        fig.data ?? [],
        { margin: { t: 24, r: 10, b: 40, l: 50 }, ...((fig.layout as object) ?? {}) },
        { responsive: true, displayModeBar: true, scrollZoom: true },
      )
    })

    return () => {
      active = false
      import('plotly.js-dist-min').then((Plotly) => {
        if (el) Plotly.purge(el)
      })
    }
  }, [content])

  return <div ref={containerRef} className="msg-plotly" />
}

// ─── Options ───────────────────────────────────────────────────────────────

function OptionsMessage({
  content,
  onSelect,
}: {
  content: unknown
  onSelect?: (option: string) => void
}) {
  // BAF may send options as string[], or as a dict {"0": "A", "1": "B"}
  let options: string[]
  if (Array.isArray(content)) {
    options = content.map(String)
  } else if (content !== null && typeof content === 'object') {
    options = Object.values(content as Record<string, unknown>).map(String)
  } else {
    options = []
  }
  return (
    <div className="msg-options">
      {options.map((opt, i) => (
        <button key={i} className="msg-option-btn" onClick={() => onSelect?.(opt)}>
          {opt}
        </button>
      ))}
    </div>
  )
}

// ─── Location ──────────────────────────────────────────────────────────────

interface LocationContent {
  latitude: number
  longitude: number
  zoom?: number
}

function LocationMessage({ content }: { content: unknown }) {
  const loc = content as LocationContent
  const { latitude: lat, longitude: lon, zoom = 15 } = loc

  // bbox around the point sized to roughly match the zoom level
  const delta = 360 / Math.pow(2, zoom + 1)
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`
  const embedSrc =
    `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`
  const osmUrl =
    `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`

  return (
    <div className="msg-location">
      <iframe
        src={embedSrc}
        className="msg-location__map"
        title="Location map"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <a className="msg-location__link" href={osmUrl} target="_blank" rel="noopener noreferrer">
        📍 {lat.toFixed(5)}, {lon.toFixed(5)} — Open in OpenStreetMap
      </a>
    </div>
  )
}

// ─── RAG ───────────────────────────────────────────────────────────────────

interface RagDocument {
  content: string
  metadata?: { page?: unknown; source?: string; [key: string]: unknown }
}

interface RagContent {
  answer: string
  llm_name?: string
  question?: string
  docs?: RagDocument[]
  documents?: RagDocument[]
}

function RagMessage({ content }: { content: unknown }) {
  const [open, setOpen] = useState(false)
  const rag = content as RagContent
  const docs = rag.docs ?? rag.documents ?? []

  return (
    <div className="msg-rag">
      <p className="msg-rag__answer">{rag.answer}</p>
      {docs.length > 0 && (
        <div className="msg-rag__details">
          <button
            type="button"
            className={`msg-rag__summary${open ? ' msg-rag__summary--open' : ''}`}
            onClick={() => setOpen((o) => !o)}
          >
            <span className="msg-rag__summary-arrow">▶</span>
            Details
          </button>
          <div className={`msg-rag__body-wrapper${open ? ' msg-rag__body-wrapper--open' : ''}`}>
            <div className="msg-rag__body-inner">
              <div className="msg-rag__details-body">
                <div className="msg-rag__rag-answer-label">RAG Answer</div>
                {rag.llm_name && (
                  <div className="msg-rag__llm-row">
                    <span className="msg-rag__llm-label">Model</span>
                    <code className="msg-rag__llm-badge">{rag.llm_name}</code>
                  </div>
                )}
                <div className="msg-rag__context-label">Context ({docs.length} Documents)</div>
                <div className="msg-rag__docs">
                  {docs.map((doc, i) => {
                    const source = doc.metadata?.source
                    const page = doc.metadata?.page
                    return (
                      <div key={i} className="msg-rag__doc-card">
                        <div className="msg-rag__doc-header">
                          Document {i + 1}/{docs.length}
                        </div>
                        {source && (
                          <div className="msg-rag__doc-row">
                            <span className="msg-rag__doc-key">Source</span>
                            <span className="msg-rag__doc-value">{source}</span>
                          </div>
                        )}
                        {page != null && (
                          <div className="msg-rag__doc-row">
                            <span className="msg-rag__doc-key">Page</span>
                            <span className="msg-rag__doc-value">{String(page)}</span>
                          </div>
                        )}
                        <div className="msg-rag__doc-row msg-rag__doc-row--content">
                          <span className="msg-rag__doc-key">Content</span>
                          <span className="msg-rag__doc-value msg-rag__doc-content">{doc.content}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Audio Player ──────────────────────────────────────────────────────────

function AudioPlayer({ data, mimeType = 'audio/wav' }: { data: string; mimeType?: string }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    try {
      const bytes = atob(data)
      const arr = new Uint8Array(bytes.length)
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
      const blob = new Blob([arr], { type: mimeType })
      url = URL.createObjectURL(blob)
      setSrc(url)
    } catch {
      setSrc(null)
    }
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [data, mimeType])

  if (!src) return <span className="msg-text--muted">Audio unavailable</span>
  // The native <audio> element provides timeline scrubbing, play/pause and volume natively
  return <audio controls src={src} className="msg-audio__player" />
}

// ─── Audio Message (agent_reply_audio) ─────────────────────────────────────

interface AudioContent {
  data: string
  type?: string
  sample_rate?: number
  dtype?: string
  shape?: number[]
}

function AudioMessage({ content }: { content: unknown }) {
  const audio = typeof content === 'string'
    ? { data: content }
    : content as AudioContent
  return (
    <div className="msg-audio">
      <AudioPlayer data={audio.data} mimeType={audio.type ?? 'audio/wav'} />
      {audio.sample_rate != null && (
        <span className="msg-audio__meta">
          {audio.sample_rate} Hz{audio.dtype ? ` · ${audio.dtype}` : ''}
        </span>
      )}
    </div>
  )
}
