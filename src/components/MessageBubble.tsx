import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import DOMPurify from 'dompurify'
import { PayloadAction } from '../types/payload'
import {
  REASONING_TRACE_ACTION,
  isEmptyTrace,
  type ReasoningTraceMessage,
} from '../types/reasoningStep'
import type { ChatMessage } from '../types/agent'
import { detectContentKind } from '../utils/contentDetect'
import { GUIRenderer } from './GUIRenderer'
import { ReasoningTrace } from './ReasoningTrace'

interface MessageBubbleProps {
  message: ChatMessage
  onOptionSelect?: (option: string) => void
  onUIInteract?: (eventJson: string) => void
}

export function MessageBubble({ message, onOptionSelect, onUIInteract }: MessageBubbleProps) {
  const { action, message: content, isUser, timestamp } = message
  const timeLabel = timestamp ?? null

  // Reasoning traces use the standard agent message layout (so the width
  // matches a regular agent bubble — timestamp slot + body), but the trace
  // brings its own visual frame instead of going inside a chat bubble.
  // Skip empty traces entirely — when the LLM answered directly without
  // tools or tasks, the trace has zero observable steps and would render
  // as a useless empty container.
  if (!isUser && action === REASONING_TRACE_ACTION) {
    const trace = content as ReasoningTraceMessage
    if (isEmptyTrace(trace)) return null
    return (
      <div className="message message--agent message--reasoning">
        {timeLabel && <span className="message__timestamp">{timeLabel}</span>}
        <div className="message__body">
          <ReasoningTrace trace={trace} />
        </div>
      </div>
    )
  }

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
          {renderContent(action, content, onOptionSelect, onUIInteract)}
        </div>
      </div>
    </div>
  )
}

function renderContent(
  action: string,
  content: unknown,
  onOptionSelect?: (option: string) => void,
  onUIInteract?: (eventJson: string) => void,
) {
  switch (action) {
    case PayloadAction.AGENT_REPLY_STR: {
      const text = String(content)
      // BAF's reply() always sends agent_reply_str, but the LLM frequently
      // produces Markdown or code. Sniff the content and pick a renderer.
      const kind = detectContentKind(text)
      if (kind === 'markdown') {
        return (
          <div className="msg-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )
      }
      if (kind === 'code') {
        return (
          <pre className="msg-code"><code>{text}</code></pre>
        )
      }
      return <p className="msg-text">{text}</p>
    }

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

    case PayloadAction.AGENT_REPLY_GUI:
      return <GUIRenderer content={content} onInteract={onUIInteract} chatMode />

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

function writeWavString(view: DataView, offset: number, str: string): number {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  return offset + str.length
}

function pcmBytesToWavBlob(
  rawBytes: ArrayBuffer,
  sampleRate: number,
  dtype: string,
  shape: number[],
): Blob {
  // shape is channel-first: [n_samples] for mono, [n_channels, n_samples] for multi-channel
  const numChannels = shape.length > 1 ? shape[0] : 1
  const numSamples = shape.length > 1 ? shape[shape.length - 1] : shape[0]

  let pcmBuffer: ArrayBuffer
  let bitsPerSample: number
  let audioFormat: number // 1 = PCM integer, 3 = IEEE float

  if (dtype === 'int16') {
    pcmBuffer = rawBytes
    bitsPerSample = 16
    audioFormat = 1
  } else {
    // Normalise everything else to float32
    let floats: Float32Array
    if (dtype === 'float32') {
      floats = new Float32Array(rawBytes)
    } else if (dtype === 'float64') {
      const f64 = new Float64Array(rawBytes)
      floats = new Float32Array(f64.length)
      for (let i = 0; i < f64.length; i++) floats[i] = f64[i]
    } else if (dtype === 'int32') {
      const i32 = new Int32Array(rawBytes)
      floats = new Float32Array(i32.length)
      for (let i = 0; i < i32.length; i++) floats[i] = i32[i] / 2147483648
    } else {
      floats = new Float32Array(rawBytes)
    }
    // numpy stores multi-channel as [channels, samples]; WAV expects interleaved
    if (numChannels > 1) {
      const interleaved = new Float32Array(numChannels * numSamples)
      for (let s = 0; s < numSamples; s++)
        for (let c = 0; c < numChannels; c++)
          interleaved[s * numChannels + c] = floats[c * numSamples + s]
      pcmBuffer = interleaved.buffer
    } else {
      pcmBuffer = floats.buffer
    }
    bitsPerSample = 32
    audioFormat = 3
  }

  const dataSize = pcmBuffer.byteLength
  const wavBuffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(wavBuffer)
  let off = 0
  off = writeWavString(view, off, 'RIFF')
  view.setUint32(off, 36 + dataSize, true); off += 4
  off = writeWavString(view, off, 'WAVE')
  off = writeWavString(view, off, 'fmt ')
  view.setUint32(off, 16, true); off += 4
  view.setUint16(off, audioFormat, true); off += 2
  view.setUint16(off, numChannels, true); off += 2
  view.setUint32(off, sampleRate, true); off += 4
  view.setUint32(off, sampleRate * numChannels * bitsPerSample / 8, true); off += 4
  view.setUint16(off, numChannels * bitsPerSample / 8, true); off += 2
  view.setUint16(off, bitsPerSample, true); off += 2
  off = writeWavString(view, off, 'data')
  view.setUint32(off, dataSize, true); off += 4
  new Uint8Array(wavBuffer, off).set(new Uint8Array(pcmBuffer))

  return new Blob([wavBuffer], { type: 'audio/wav' })
}

function AudioPlayer({
  data,
  sampleRate,
  dtype,
  shape,
}: {
  data: string
  sampleRate?: number
  dtype?: string
  shape?: number[]
}) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    try {
      const binaryStr = atob(data)
      const arr = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) arr[i] = binaryStr.charCodeAt(i)

      let blob: Blob
      if (sampleRate && dtype && shape) {
        blob = pcmBytesToWavBlob(arr.buffer, sampleRate, dtype, shape)
      } else {
        blob = new Blob([arr], { type: 'audio/wav' })
      }
      url = URL.createObjectURL(blob)
      setSrc(url)
    } catch {
      setSrc(null)
    }
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [data, sampleRate, dtype, JSON.stringify(shape)])

  if (!src) return <span className="msg-text--muted">Audio unavailable</span>
  // The native <audio> element provides timeline scrubbing, play/pause and volume natively
  return <audio controls src={src} className="msg-audio__player" />
}

// ─── Audio Message (agent_reply_audio) ─────────────────────────────────────

interface AudioContent {
  audio_data_base64: string
  metadata?: {
    sample_rate?: number
    dtype?: string
    shape?: number[]
  }
}

function AudioMessage({ content }: { content: unknown }) {
  if (typeof content !== 'object' || content === null) {
    return <span className="msg-text--muted">Audio unavailable</span>
  }
  const audio = content as AudioContent
  const meta = audio.metadata ?? {}
  return (
    <div className="msg-audio">
      <AudioPlayer
        data={audio.audio_data_base64}
        sampleRate={meta.sample_rate}
        dtype={meta.dtype}
        shape={meta.shape}
      />
    </div>
  )
}
