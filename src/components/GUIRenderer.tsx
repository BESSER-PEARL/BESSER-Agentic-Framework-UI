import { useState, useId, useMemo, useEffect, useRef, useCallback, createContext, useContext } from 'react'
import type { ChatMessage } from '../types/agent'
import { PayloadAction } from '../types/payload'
import type { ConnectionStatus } from '../hooks/useWebSocket'
import { ChatArea } from './ChatArea'

// ─── JSON model types ──────────────────────────────────────────────────────

type StylingSize = Record<string, string>
type StylingPosition = Record<string, string>
type StylingColor = Record<string, string>
type StylingLayout = Record<string, string>

interface StylingNode {
  size?: StylingSize
  position?: StylingPosition
  color?: StylingColor
  layout?: StylingLayout
}

interface StyleEntry {
  selectors: string[]
  style: Record<string, string>
  mediaText?: string
  atRuleType?: string
}

interface SeriesData {
  name: string
  label?: string
}

interface ColumnDef {
  type: string
  label: string
  field?: string
  expression?: string
}

interface MenuItem {
  label: string
  url?: string
  target?: string
  rel?: string
}

interface ViewElement {
  type: string
  name: string
  component_id?: string
  tag_name?: string
  css_classes?: string[]
  custom_attributes?: Record<string, unknown>
  display_order?: number
  styling?: StylingNode
  // Container
  view_elements?: ViewElement[]
  layout?: Record<string, string>
  // Text
  content?: string
  // Link
  label?: string
  url?: string
  target?: string
  rel?: string
  // Button
  buttonType?: string
  actionType?: string
  confirmation_required?: boolean
  confirmation_message?: string
  // Image
  source?: string
  // InputField
  field_type?: string
  placeholder?: string
  required?: boolean
  default_value?: unknown
  options?: Array<{ label: string; value: string }>
  min_value?: number
  max_value?: number
  step?: number
  help_text?: string
  disabled?: boolean
  readonly?: boolean
  multiple?: boolean
  validationRules?: string
  // Form
  inputFields?: ViewElement[]
  // Menu
  menuItems?: MenuItem[]
  // DataList
  list_sources?: unknown[]
  // EmbeddedContent
  content_type?: string
  extra_props?: Record<string, string>
  // Charts
  title?: string
  series?: SeriesData[]
  line_width?: number
  curve_type?: string
  dot_size?: number
  grid_color?: string
  show_grid?: boolean
  show_legend?: boolean
  legend_position?: string
  orientation?: string
  stacked?: boolean
  bar_width?: number
  bar_gap?: number
  show_tooltip?: boolean
  animate?: boolean
  show_radius_axis?: boolean
  grid_type?: string
  stroke_width?: number
  // Table
  show_header?: boolean
  columns?: ColumnDef[]
  rows_per_page?: number
  striped_rows?: boolean
  action_buttons?: boolean
  // MetricCard
  metric_title?: string
  format?: string
  value_color?: string
  // Alert
  severity?: 'info' | 'success' | 'warning' | 'error'
  dismissible?: boolean
  // AgentComponent
  agent_name?: string
  agent_title?: string
  // data binding (ignored in renderer)
  data_binding?: unknown
  // Screen
  description?: string
  is_main_page?: boolean
  route_path?: string
  screen_size?: string
}

interface GUIModule {
  name: string
  screens: ViewElement[]
}

interface GUIData {
  name: string
  description?: string
  modules: GUIModule[]
  style_entries?: StyleEntry[]
}

// ─── Embedded chat widget context ────────────────────────────────────────────

interface ChatWidgetProps {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  send: (action: string, message: unknown) => void
  status: ConnectionStatus | string
}

const ChatWidgetContext = createContext<ChatWidgetProps | null>(null)

// ─── Style conversion ────────────────────────────────────────────────────────

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

// Strip `!important` from values — inline styles don't support it.
function stripImportant(v: string): string {
  return v.replace(/\s*!important\s*$/, '')
}

const SIZE_SKIP = new Set(['unit_size', 'icon_size'])
const COLOR_SKIP = new Set(['color_palette', 'primary_color', 'line_color', 'grid_color', 'axis_color', 'bar_color', 'label_color', 'fill_color'])
const COLOR_REMAP: Record<string, string> = {
  background_color: 'background',
  text_color: 'color',
}
// 'alignment' removed from LAYOUT_SKIP: handled per-section below
const LAYOUT_SKIP = new Set(['layout_type', 'alignment'])
const POS_SKIP = new Set(['p_type'])  // 'alignment' removed — mapped to textAlign below

function stylingToReact(styling?: StylingNode): React.CSSProperties {
  if (!styling) return {}
  const s: Record<string, string | number> = {}

  if (styling.size) {
    for (const [k, v] of Object.entries(styling.size)) {
      if (!v || SIZE_SKIP.has(k)) continue
      s[snakeToCamel(k)] = typeof v === 'string' ? stripImportant(v) : v
    }
  }

  if (styling.position) {
    for (const [k, v] of Object.entries(styling.position)) {
      if (!v || POS_SKIP.has(k)) continue
      if (k === 'alignment') {
        // GrapesJS alignment → CSS text-align
        s['textAlign'] = typeof v === 'string' ? stripImportant(v) : v
      } else if (k === 'display') {
        // GrapesJS uses display:table / table-cell for column layouts.
        // Remap to flexbox so they render correctly inside a chat bubble.
        if (v === 'table' || v === 'table-row') {
          s['display'] = 'flex'
          s['flexWrap'] = 'wrap'
          s['alignItems'] = 'stretch'
        } else if (v === 'table-cell') {
          s['display'] = 'flex'
          s['flex'] = '1'
          s['flexDirection'] = 'column'
          s['height'] = 'auto'
        } else {
          s['display'] = typeof v === 'string' ? stripImportant(v) : v
        }
      } else {
        s[snakeToCamel(k)] = typeof v === 'string' ? stripImportant(v) : v
      }
    }
  }

  if (styling.color) {
    for (const [k, v] of Object.entries(styling.color)) {
      if (!v || COLOR_SKIP.has(k)) continue
      s[COLOR_REMAP[k] ?? snakeToCamel(k)] = typeof v === 'string' ? stripImportant(v) : v
    }
  }

  // Layout always last so layout_type wins over position.display
  if (styling.layout) {
    const lt = styling.layout.layout_type
    if (lt === 'flex') s['display'] = 'flex'
    else if (lt === 'grid') s['display'] = 'grid'
    for (const [k, v] of Object.entries(styling.layout)) {
      if (!v || LAYOUT_SKIP.has(k)) continue
      s[snakeToCamel(k)] = typeof v === 'string' ? stripImportant(v) : v
    }
  }

  return s as React.CSSProperties
}

// ─── Scoped CSS from style_entries ──────────────────────────────────────────

function buildScopedCSS(entries: StyleEntry[], scopeClass: string): string {
  if (!Array.isArray(entries)) return ''
  let css = ''
  for (const entry of entries) {
    if (!entry.selectors?.length || !entry.style) continue

    // Convert GrapesJS table-layout to flex so scoped CSS agrees with inline styles
    // and remove fixed heights that would clip chart content.
    const style = { ...entry.style }
    const d = style['display']
    if (d === 'table' || d === 'table-row') {
      style['display'] = 'flex'
      style['flex-wrap'] = 'wrap'
    } else if (d === 'table-cell') {
      style['display'] = 'flex'
      style['flex-direction'] = 'column'
      style['flex'] = '1'
      delete style['height']   // small fixed heights cause chart overflow
      delete style['width']    // flex: 1 distributes width evenly
    }

    const props = Object.entries(style)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n')
    const rule = (sel: string) => `${sel} {\n${props}\n}`
    const scoped = entry.selectors.map((s) => `.${scopeClass} ${s}`).join(', ')
    if (entry.atRuleType === 'media' && entry.mediaText) {
      css += `@media ${entry.mediaText} {\n${rule(scoped)}\n}\n`
    } else {
      css += rule(scoped) + '\n'
    }
  }
  return css
}

// ─── Plotly chart renderer ──────────────────────────────────────────────────

interface RawDataPoint {
  name?: string
  subject?: string
  value?: number
  fullMark?: number
}

interface RawSeries {
  name: string
  color?: string
  data?: RawDataPoint[]
}

function buildPlotlyFigure(el: ViewElement): { traces: object[]; layout: object } {
  let seriesList: RawSeries[] = []
  const rawAttr = el.custom_attributes?.series
  if (typeof rawAttr === 'string') {
    try { seriesList = JSON.parse(rawAttr) } catch { /* ignore */ }
  }

  const showLegend = el.show_legend !== false
  const baseLayout: Record<string, unknown> = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: '#f8f9fa',
    font: { family: 'inherit', size: 12 },
    margin: { t: el.title ? 40 : 20, r: 10, b: 40, l: 50 },
    showlegend: showLegend,
    legend: { orientation: 'h', y: -0.25, font: { size: 11 } },
  }
  if (el.title) baseLayout.title = { text: el.title, font: { size: 14 }, x: 0.5 }

  switch (el.type) {
    case 'LineChart': {
      const traces = seriesList.map((s) => ({
        type: 'scatter',
        mode: 'lines+markers',
        name: s.name,
        x: (s.data ?? []).map((d) => d.name ?? d.subject),
        y: (s.data ?? []).map((d) => d.value),
        line: { color: s.color, width: el.line_width ?? 2, shape: el.curve_type === 'monotone' ? 'spline' : 'linear' },
        marker: { color: s.color, size: el.dot_size ?? 5 },
      }))
      return { traces, layout: baseLayout }
    }

    case 'BarChart': {
      const horizontal = el.orientation === 'horizontal'
      const traces = seriesList.map((s) => ({
        type: 'bar',
        name: s.name,
        ...(horizontal
          ? { x: (s.data ?? []).map((d) => d.value), y: (s.data ?? []).map((d) => d.name ?? d.subject), orientation: 'h' }
          : { x: (s.data ?? []).map((d) => d.name ?? d.subject), y: (s.data ?? []).map((d) => d.value) }),
        marker: { color: s.color },
      }))
      return { traces, layout: { ...baseLayout, barmode: el.stacked ? 'stack' : 'group' } }
    }

    case 'PieChart': {
      const s = seriesList[0]
      const traces = s
        ? [{ type: 'pie', name: s.name, labels: (s.data ?? []).map((d) => d.name ?? d.subject), values: (s.data ?? []).map((d) => d.value), marker: { colors: seriesList.map((ss) => ss.color).filter(Boolean) } }]
        : []
      return { traces, layout: { ...baseLayout, margin: { t: el.title ? 40 : 20, r: 0, b: 0, l: 0 } } }
    }

    case 'RadarChart': {
      const traces = seriesList.map((s) => ({
        type: 'scatterpolar',
        fill: 'toself',
        name: s.name,
        r: (s.data ?? []).map((d) => d.value),
        theta: (s.data ?? []).map((d) => d.subject ?? d.name),
        line: { color: s.color },
        fillcolor: s.color ? s.color + '33' : undefined,
      }))
      return {
        traces,
        layout: {
          ...baseLayout,
          polar: { radialaxis: { visible: el.show_radius_axis !== false }, gridshape: el.grid_type === 'polygon' ? 'linear' : 'circular' },
          margin: { t: el.title ? 40 : 20, r: 30, b: 30, l: 30 },
        },
      }
    }

    case 'RadialBarChart': {
      const traces = seriesList.map((s) => ({
        type: 'barpolar',
        name: s.name,
        r: (s.data ?? []).map((d) => d.value),
        theta: (s.data ?? []).map((d) => d.name ?? d.subject),
        marker: { color: s.color },
      }))
      return { traces, layout: { ...baseLayout, margin: { t: el.title ? 40 : 20, r: 30, b: 30, l: 30 } } }
    }

    default:
      return { traces: [], layout: baseLayout }
  }
}

// Module-level Plotly cache — eliminates the async race between newPlot and purge.
// After first load the module is synchronously available for cleanup.
type PlotlyModule = typeof import('plotly.js-dist-min')
let _plotlyModule: PlotlyModule | null = null
let _plotlyPromise: Promise<PlotlyModule> | null = null

function loadPlotly(): Promise<PlotlyModule> {
  if (_plotlyModule) return Promise.resolve(_plotlyModule)
  if (!_plotlyPromise) {
    _plotlyPromise = import('plotly.js-dist-min').then((m) => {
      _plotlyModule = m
      return m
    })
  }
  return _plotlyPromise
}

function PlotlyGUIChart({ el }: { el: ViewElement }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    let active = true
    const { traces, layout } = buildPlotlyFigure(el)
    loadPlotly().then((Plotly) => {
      if (!active || !node) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Plotly.newPlot(node, traces as any, layout as any, { responsive: true, displayModeBar: false })
    })
    return () => {
      active = false
      // Synchronous purge when Plotly is already loaded; async fallback otherwise.
      if (_plotlyModule && node) {
        _plotlyModule.purge(node)
      } else if (_plotlyPromise) {
        _plotlyPromise.then((P) => { if (node) P.purge(node) })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.name, el.type])

  const style = stylingToReact(el.styling)
  return (
    <div
      id={el.component_id ?? undefined}
      className={(el.css_classes ?? []).join(' ') || undefined}
      style={{ minHeight: '300px', ...style }}
      ref={containerRef}
    />
  )
}

// ─── Alert element (needs own component for dismissible state) ────────────────

const _ALERT_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', icon: 'ℹ' },
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', icon: '✓' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', icon: '⚠' },
  error:   { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', icon: '✕' },
}

function AlertElement({ el, id, className, style }: { el: ViewElement; id?: string; className?: string; style?: React.CSSProperties }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  const colors = _ALERT_COLORS[el.severity ?? 'info'] ?? _ALERT_COLORS.info
  return (
    <div
      id={id}
      className={className}
      role="alert"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px',
        padding: '10px 14px', borderRadius: '6px', border: `1px solid ${colors.border}`,
        background: colors.bg, color: colors.text, fontSize: '0.88em',
        ...style,
      }}
    >
      <span style={{ fontWeight: 700, flexShrink: 0 }}>{colors.icon}</span>
      <div style={{ flex: 1 }}>
        {el.title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{el.title}</div>}
        <div>{el.content}</div>
      </div>
      {el.dismissible && (
        <button
          onClick={() => setDismissed(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text, padding: 0, lineHeight: 1 }}
          aria-label="Dismiss"
        >×</button>
      )}
    </div>
  )
}

// ─── InputField specialized sub-renderers ────────────────────────────────────

function ToggleInput({ el, id, onInteract }: { el: ViewElement; id?: string; onInteract?: (json: string) => void }) {
  const [checked, setChecked] = useState<boolean>(Boolean(el.default_value))
  return (
    <div style={{ marginBottom: '4px' }}>
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: el.disabled ? 'default' : 'pointer', userSelect: 'none' }}>
      {el.label && <span style={{ fontSize: '0.875em', fontWeight: 500, color: '#374151' }}>{el.label}</span>}
      <span style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', flexShrink: 0 }}>
        <input
          type="checkbox"
          id={id}
          name={el.name}
          checked={checked}
          disabled={el.disabled}
          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
          onChange={(e) => {
            setChecked(e.target.checked)
            onInteract?.(JSON.stringify({ elementId: id ?? el.name, name: el.name, fieldType: el.field_type, label: el.label || undefined, action: 'onChange', value: e.target.checked }))
          }}
        />
        <span style={{ position: 'absolute', inset: 0, background: checked ? '#2563eb' : '#cbd5e1', borderRadius: '24px', transition: 'background 0.2s', pointerEvents: 'none' }} />
        <span style={{ position: 'absolute', top: '3px', left: checked ? '23px' : '3px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', pointerEvents: 'none' }} />
      </span>
    </label>
    </div>
  )
}

function SliderInput({ el, id, onInteract }: { el: ViewElement; id?: string; onInteract?: (json: string) => void }) {
  const init = typeof el.default_value === 'number' ? el.default_value : (el.min_value ?? 0)
  const [value, setValue] = useState<number>(init)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <input
        type="range"
        id={id}
        name={el.name}
        min={el.min_value ?? 0}
        max={el.max_value ?? 100}
        step={el.step ?? 1}
        value={value}
        disabled={el.disabled}
        style={{ flex: 1 }}
        onChange={(e) => {
          const v = Number(e.target.value)
          setValue(v)
          onInteract?.(JSON.stringify({ elementId: id ?? el.name, name: el.name, fieldType: el.field_type, label: el.label || undefined, action: 'onChange', value: v }))
        }}
      />
      <span style={{ minWidth: '2.5em', textAlign: 'right', fontSize: '0.875em', color: '#374151' }}>{value}</span>
    </div>
  )
}

function RatingInput({ el, id, className, onInteract }: { el: ViewElement; id?: string; className?: string; onInteract?: (json: string) => void }) {
  const [rating, setRating] = useState<number>(typeof el.default_value === 'number' ? el.default_value : 0)
  const [hover, setHover] = useState<number>(0)
  const maxStars = el.max_value ?? 5
  return (
    <div id={id} className={className} style={{ display: 'flex', gap: '2px' }}>
      {Array.from({ length: maxStars }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} star${star !== 1 ? 's' : ''}`}
          style={{ background: 'none', border: 'none', padding: '0 2px', cursor: el.disabled ? 'default' : 'pointer', fontSize: '1.5em', color: star <= (hover || rating) ? '#f59e0b' : '#d1d5db', transition: 'color 0.1s' }}
          disabled={el.disabled}
          onClick={() => {
            const v = star === rating ? 0 : star
            setRating(v)
            onInteract?.(JSON.stringify({ elementId: id ?? el.name, name: el.name, fieldType: el.field_type, label: el.label || undefined, action: 'onChange', value: v }))
          }}
          onMouseEnter={() => !el.disabled && setHover(star)}
          onMouseLeave={() => setHover(0)}
        >★</button>
      ))}
    </div>
  )
}

function TagsInput({ el, id, className, onInteract }: { el: ViewElement; id?: string; className?: string; onInteract?: (json: string) => void }) {
  const [tags, setTags] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')

  const addTag = (raw: string) => {
    const tag = raw.trim()
    if (tag && !tags.includes(tag)) {
      const next = [...tags, tag]
      setTags(next)
      onInteract?.(JSON.stringify({ elementId: id ?? el.name, name: el.name, fieldType: el.field_type, label: el.label || undefined, action: 'onChange', value: next }))
    }
    setInputValue('')
  }

  const removeTag = (tag: string) => {
    const next = tags.filter((t) => t !== tag)
    setTags(next)
    onInteract?.(JSON.stringify({ elementId: id ?? el.name, name: el.name, fieldType: el.field_type, label: el.label || undefined, action: 'onChange', value: next }))
  }

  return (
    <div id={id} className={className} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', minHeight: '38px' }}>
      {tags.map((tag) => (
        <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '12px', fontSize: '0.82em' }}>
          {tag}
          <button type="button" onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}>×</button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        placeholder={tags.length === 0 ? (el.placeholder ?? el.description ?? 'Add tags…') : undefined}
        disabled={el.disabled}
        style={{ border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 'inherit', flex: '1 1 80px', minWidth: '80px', padding: '2px 0' }}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(inputValue) }
          if (e.key === 'Backspace' && !inputValue && tags.length) removeTag(tags[tags.length - 1])
        }}
        onBlur={() => { if (inputValue) addTag(inputValue) }}
      />
    </div>
  )
}

function OTPInput({ el, id, className, onInteract }: { el: ViewElement; id?: string; className?: string; onInteract?: (json: string) => void }) {
  const length = Math.max(2, Math.min(8, el.max_value ?? 6))
  const [values, setValues] = useState<string[]>(() => Array(length).fill(''))
  const refs = useRef<Array<HTMLInputElement | null>>(Array(length).fill(null))

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const next = [...values]
    next[index] = digit
    setValues(next)
    onInteract?.(JSON.stringify({ elementId: id ?? el.name, name: el.name, fieldType: el.field_type, label: el.label || undefined, action: 'onChange', value: next.join('') }))
    if (digit && index < length - 1) refs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !values[index] && index > 0) refs.current[index - 1]?.focus()
  }

  return (
    <div id={id} className={className} style={{ display: 'flex', gap: '8px' }}>
      {values.map((v, i) => (
        <input
          key={i}
          ref={(r) => { refs.current[i] = r }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={v}
          disabled={el.disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          style={{ width: '40px', height: '44px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '1.25em', fontFamily: 'inherit' }}
        />
      ))}
    </div>
  )
}

function DateRangeInput({ el, id, className, onInteract }: { el: ViewElement; id?: string; className?: string; onInteract?: (json: string) => void }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const dateStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontFamily: 'inherit' }
  const emit = (f: string, t: string) =>
    onInteract?.(JSON.stringify({ elementId: id ?? el.name, name: el.name, fieldType: el.field_type, label: el.label || undefined, action: 'onChange', value: { from: f, to: t } }))
  return (
    <div id={id} className={className} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <input type="date" value={from} max={to || undefined} disabled={el.disabled} style={dateStyle}
        onChange={(e) => { setFrom(e.target.value); emit(e.target.value, to) }} />
      <span style={{ color: '#94a3b8', fontSize: '0.9em' }}>to</span>
      <input type="date" value={to} min={from || undefined} disabled={el.disabled} style={dateStyle}
        onChange={(e) => { setTo(e.target.value); emit(from, e.target.value) }} />
    </div>
  )
}

function MultiSelectInput({ el, id, className, onInteract }: { el: ViewElement; id?: string; className?: string; onInteract?: (json: string) => void }) {
  const options = (el.options ?? []) as Array<{ label: string; value: string }>
  const [selected, setSelected] = useState<string[]>(() => {
    if (typeof el.default_value === 'string' && el.default_value) {
      return el.default_value.split(',').map((s) => s.trim()).filter(Boolean)
    }
    return []
  })

  const toggle = (value: string) => {
    const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]
    setSelected(next)
    onInteract?.(JSON.stringify({ elementId: id ?? el.name, name: el.name, fieldType: el.field_type, label: el.label || undefined, action: 'onChange', value: next }))
  }

  return (
    <div id={id} className={className} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {selected.map((val) => {
            const opt = options.find((o) => o.value === val)
            return (
              <span key={val} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '12px', fontSize: '0.82em' }}>
                {opt?.label ?? val}
                <button type="button" onClick={() => toggle(val)} disabled={el.disabled}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1 }}>×</button>
              </span>
            )
          })}
        </div>
      )}
      <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
        {options.map((o, i) => {
          const isSelected = selected.includes(o.value)
          return (
            <div key={i} onClick={() => !el.disabled && toggle(o.value)}
              style={{
                padding: '6px 10px', cursor: el.disabled ? 'default' : 'pointer',
                background: isSelected ? '#dbeafe' : (i % 2 === 0 ? '#fff' : '#f8fafc'),
                color: isSelected ? '#1d4ed8' : '#374151', fontWeight: isSelected ? 500 : 400,
                borderBottom: i < options.length - 1 ? '1px solid #e2e8f0' : 'none',
                userSelect: 'none' as const,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <span>{o.label}</span>
              {isSelected && <span style={{ color: '#2563eb', fontWeight: 700 }}>✓</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── InputField element (dispatches per field_type) ──────────────────────────

const _FT_TO_HTML: Record<string, string> = {
  Text: 'text', Password: 'password', Email: 'email', Number: 'number',
  Date: 'date', Time: 'time', Color: 'color', File: 'file',
  Search: 'search', URL: 'url', Tel: 'tel', Hidden: 'hidden',
  Range: 'range', Checkbox: 'checkbox',
}

function InputFieldElement({ el, onInteract }: { el: ViewElement; onInteract?: (json: string) => void }) {
  // Resolve fields from el directly, falling back to custom_attributes for
  // backward-compatibility with models exported before the pipeline fix.
  const ca = el.custom_attributes ?? {}
  const label = el.label ?? (ca['data-label'] as string | undefined) ?? undefined
  const resolvedPlaceholder = el.placeholder ?? (ca['data-placeholder'] as string | undefined) ?? el.description ?? el.name
  const required = el.required ?? (ca['data-required'] === 'true') ?? false
  const minValue = el.min_value ?? (ca['data-min'] != null ? Number(ca['data-min']) : undefined)
  const maxValue = el.max_value ?? (ca['data-max'] != null ? Number(ca['data-max']) : undefined)
  const stepValue = el.step ?? (ca['data-step'] != null ? Number(ca['data-step']) : undefined)

  // default_value fallback: for Toggle, 'data-default-checked' holds a boolean string
  let defaultValue: unknown = el.default_value
  if (defaultValue == null && ca['data-default-checked'] != null) {
    defaultValue = String(ca['data-default-checked']).toLowerCase() === 'true'
  }

  // options fallback: parse comma-separated 'data-options' string
  let options = (el.options ?? []) as Array<{ label: string; value: string }>
  if (options.length === 0 && ca['data-options']) {
    const raw = String(ca['data-options'])
    options = raw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => ({ label: s, value: s }))
  }

  // Build a resolved element for sub-components that need the enriched fields
  const resolved: ViewElement = {
    ...el,
    label,
    placeholder: resolvedPlaceholder,
    required,
    min_value: minValue,
    max_value: maxValue,
    step: stepValue,
    default_value: defaultValue,
    options,
  }

  const style = stylingToReact(el.styling)
  const id = el.component_id ?? undefined
  const className = (el.css_classes ?? []).join(' ') || undefined
  const ft = el.field_type ?? 'Text'
  const placeholder = resolvedPlaceholder
  const disabled = el.disabled ?? false
  const readonly = el.readonly ?? false

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px',
    fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const,
    ...style,
  }

  const emit = (value: unknown) =>
    onInteract?.(JSON.stringify({ elementId: id ?? el.name, name: el.name, fieldType: ft, label: label || undefined, action: 'onChange', value }))

  const wrap = (input: React.ReactNode): React.ReactElement => {
    if (!label) return <>{input}</>
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label htmlFor={id} style={{ fontSize: '0.875em', fontWeight: 500, color: '#374151' }}>
          {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
        </label>
        {input}
      </div>
    )
  }

  switch (ft) {
    case 'TextArea':
    case 'RichText':
      return wrap(
        <textarea id={id} name={el.name} className={className}
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
          placeholder={placeholder} required={required} disabled={disabled} readOnly={readonly}
          defaultValue={defaultValue as string | undefined}
          onBlur={(e) => emit(e.target.value)} />
      )

    case 'Dropdown':
      return wrap(
        <select id={id} name={el.name} className={className} style={inputStyle}
          required={required} disabled={disabled}
          defaultValue={defaultValue as string | undefined}
          onChange={(e) => emit(e.target.value)}
        >
          <option value="">— Select —</option>
          {options.map((o, i) => <option key={i} value={o.value}>{o.label}</option>)}
        </select>
      )

    case 'MultiSelect':
      return wrap(<MultiSelectInput el={resolved} id={id} className={className} onInteract={onInteract} />)

    case 'RadioGroup':
      return wrap(
        <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {options.map((o, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: disabled ? 'default' : 'pointer' }}>
              <input type="radio" name={el.name} value={o.value} required={required} disabled={disabled}
                onChange={() => emit(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )

    case 'CheckboxGroup':
      return wrap(
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {options.map((o, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: disabled ? 'default' : 'pointer' }}>
              <input type="checkbox" name={`${el.name}[]`} value={o.value} disabled={disabled}
                onChange={(e) => emit({ option: o.value, checked: e.target.checked })} />
              {o.label}
            </label>
          ))}
        </div>
      )

    case 'Toggle':
      // ToggleInput already renders the label inline beside the switch;
      // wrapping would produce a second label above it.
      return <ToggleInput el={resolved} id={id} onInteract={onInteract} />

    case 'Slider':
      return wrap(<SliderInput el={resolved} id={id} onInteract={onInteract} />)

    case 'Spinner':
      return wrap(
        <input type="number" id={id} name={el.name} className={className} style={inputStyle}
          placeholder={placeholder} required={required} disabled={disabled} readOnly={readonly}
          min={minValue} max={maxValue} step={stepValue ?? 1}
          defaultValue={defaultValue as number | undefined}
          onBlur={(e) => emit(Number(e.target.value))} />
      )

    case 'Rating':
      return wrap(<RatingInput el={resolved} id={id} className={className} onInteract={onInteract} />)

    case 'Tags':
      return wrap(<TagsInput el={resolved} id={id} className={className} onInteract={onInteract} />)

    case 'OTP':
      return wrap(<OTPInput el={resolved} id={id} className={className} onInteract={onInteract} />)

    case 'DateRange':
      return wrap(<DateRangeInput el={resolved} id={id} className={className} onInteract={onInteract} />)

    case 'DateTime':
      return wrap(
        <input type="datetime-local" id={id} name={el.name} className={className} style={inputStyle}
          required={required} disabled={disabled} readOnly={readonly}
          defaultValue={defaultValue as string | undefined}
          onBlur={(e) => emit(e.target.value)} />
      )

    case 'Color':
      return wrap(
        <input type="color" id={id} name={el.name} className={className}
          style={{ width: '48px', height: '36px', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: disabled ? 'default' : 'pointer' }}
          disabled={disabled}
          defaultValue={(defaultValue as string | undefined) || '#000000'}
          onChange={(e) => emit(e.target.value)} />
      )

    case 'Checkbox':
      return (
        <div style={style}>
          <label htmlFor={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: disabled ? 'default' : 'pointer', userSelect: 'none' as const, fontSize: '0.875em', fontWeight: 500, color: '#374151' }}>
            <input type="checkbox" id={id} name={el.name} className={className}
              required={required} disabled={disabled}
              defaultChecked={Boolean(defaultValue)}
              onChange={(e) => emit(e.target.checked)} />
            {label && <span>{label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}</span>}
          </label>
        </div>
      )

    case 'File': {
      const accept = (ca['data-accept'] as string | undefined) || undefined
      const isMultiple = el.multiple === true || ca['data-multiple'] === 'true'
      return wrap(
        <input type="file" id={id} name={el.name} className={className} style={inputStyle}
          required={required} disabled={disabled}
          accept={accept}
          multiple={isMultiple}
          onChange={(e) => {
            const files = e.target.files
            if (!files || files.length === 0) { emit(null); return }
            const names = Array.from(files).map((f) => f.name)
            emit(isMultiple ? names : names[0])
          }} />
      )
    }

    case 'ImageUpload':
      return wrap(
        <input type="file" id={id} name={el.name} className={className} style={inputStyle}
          required={required} disabled={disabled} accept="image/*"
          onChange={(e) => emit(e.target.files?.[0]?.name)} />
      )

    default: {
      const htmlType = _FT_TO_HTML[ft] ?? ft.toLowerCase()
      return wrap(
        <input type={htmlType} id={id} name={el.name} className={className} style={inputStyle}
          placeholder={placeholder} required={required} disabled={disabled} readOnly={readonly}
          min={minValue} max={maxValue} step={stepValue}
          defaultValue={defaultValue as string | undefined}
          onBlur={(e) => emit(e.target.value)} />
      )
    }
  }
}

// ─── Embedded chat widget ─────────────────────────────────────────────────────

function EmbeddedChatWidget({ el, id, className, style }: { el: ViewElement; id?: string; className?: string; style?: React.CSSProperties }) {
  const chat = useContext(ChatWidgetContext)

  if (!chat) {
    return (
      <div id={id} className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: 8, ...style }}>
        Chat widget not connected
      </div>
    )
  }

  return (
    <div
      id={id}
      className={['gui-agent-widget', className].filter(Boolean).join(' ')}
      style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#fff', ...style }}
    >
      {/* Title bar */}
      <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: '1.1em' }}>🤖</span>
        {el.agent_title ?? el.agent_name ?? 'Agent'}
        <span style={{
          marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%',
          background: chat.status === 'connected' ? '#22c55e' : '#f59e0b',
          flexShrink: 0,
        }} />
      </div>

      <ChatArea
        messages={chat.messages}
        setMessages={chat.setMessages}
        status={chat.status}
        send={chat.send}
      />
    </div>
  )
}

// ─── Element renderer ────────────────────────────────────────────────────────

function renderElement(el: ViewElement, onInteract?: (json: string) => void, navigateTo?: (nameOrPath: string) => boolean): React.ReactNode {
  const style = stylingToReact(el.styling)
  const id = el.component_id ?? undefined
  const className = (el.css_classes ?? []).join(' ') || undefined

  switch (el.type) {
    case 'Text': {
      // Respect original tag_name for semantic headings/paragraphs
      const validTags = new Set(['h1','h2','h3','h4','h5','h6','p','span','div','label','li','td','th'])
      let tag = el.tag_name && validTags.has(el.tag_name) ? el.tag_name : 'p'
      // When element uses flex/grid layout (e.g. emoji circles), use div to avoid
      // block-level <p> quirks and ensure the element respects its own height/width.
      if (tag === 'p' && (style.display === 'flex' || style.display === 'grid')) tag = 'div'
      const Tag = tag as keyof React.JSX.IntrinsicElements
      return <Tag key={el.name} id={id} className={className} style={style}>{el.content}</Tag>
    }

    case 'Link':
      return (
        <a
          key={el.name}
          id={id}
          className={className}
          style={{ fontFamily: 'inherit', ...style }}
          href={el.url ?? '#'}
          target={el.target ?? '_self'}
          rel={el.rel ?? (el.target === '_blank' ? 'noopener noreferrer' : undefined)}
          onClick={(e) => {
            if (el.url && navigateTo?.(el.url)) {
              e.preventDefault()
            } else {
              onInteract?.(JSON.stringify({ elementId: id ?? el.name, name: el.name, label: el.label || undefined, action: 'onClick', value: el.url }))
            }
          }}
        >
          {el.label}
        </a>
      )

    case 'Button':
      return (
        <button
          key={el.name}
          id={id}
          className={className}
          // appearance:none + font/line-height inherit reset UA button styles so our
          // custom styling (background, border-radius, etc.) applies cleanly.
          style={{ appearance: 'none', fontFamily: 'inherit', lineHeight: 'inherit', ...style }}
          type="button"
          onClick={() => {
            // actionType comes serialized as "Navigate" (capital N)
            if (el.actionType?.toLowerCase() === 'navigate' && el.url && navigateTo?.(el.url)) return
            onInteract?.(JSON.stringify({ elementId: id ?? el.name, name: el.name, label: el.label || undefined, actionType: el.actionType || undefined, action: 'onClick' }))
          }}
        >
          {el.label}
        </button>
      )

    case 'Image':
      return (
        <img
          key={el.name}
          id={id}
          className={className}
          style={style}
          src={el.source ?? ''}
          alt={el.name}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )

    case 'InputField':
      return <InputFieldElement key={el.name} el={el} onInteract={onInteract} />

    case 'Form':
      return (
        <form
          key={el.name}
          id={id}
          className={className}
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', ...style }}
          onSubmit={(e) => {
            e.preventDefault()
            const data = Object.fromEntries(new FormData(e.currentTarget))
            onInteract?.(JSON.stringify({ elementId: id ?? el.name, name: el.name, action: 'onSubmit', value: data }))
          }}
        >
          {(el.inputFields ?? []).map((f) => renderElement(f, onInteract, navigateTo))}
        </form>
      )

    case 'Menu': {
      const navTag = el.tag_name && el.tag_name === 'nav' ? 'nav' : 'div'
      const NavTag = navTag as keyof React.JSX.IntrinsicElements
      return (
        <NavTag key={el.name} id={id} className={className} style={style}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(el.menuItems ?? []).map((item, i) => (
              <li key={i}>
                <a
                  href={item.url ?? '#'}
                  target={item.target}
                  rel={item.target === '_blank' ? 'noopener noreferrer' : undefined}
                  style={{ textDecoration: 'none' }}
                  onClick={(e) => {
                    if (item.url && navigateTo?.(item.url)) {
                      e.preventDefault()
                    } else {
                      onInteract?.(JSON.stringify({ elementId: el.component_id ?? el.name, name: el.name, label: item.label, action: 'onClick', value: item.url }))
                    }
                  }}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </NavTag>
      )
    }

    case 'DataList':
      return (
        <ul key={el.name} id={id} className={className} style={{ padding: 0, ...style }}>
          {(el.list_sources ?? []).map((_, i) => (
            <li key={i} style={{ padding: '4px 0', color: '#94a3b8', fontStyle: 'italic' }}>
              (data item {i + 1})
            </li>
          ))}
        </ul>
      )

    case 'Alert':
      return <AlertElement key={el.name} el={el} id={id} className={className} style={style} />

    case 'EmbeddedContent': {
      const src = el.source ?? el.extra_props?.src ?? ''
      if (src) {
        return (
          <iframe
            key={el.name}
            id={id}
            className={className}
            style={{ width: '100%', height: '300px', border: 'none', ...style }}
            src={src}
            title={el.name}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin"
          />
        )
      }
      return (
        <div key={el.name} id={id} className={className} style={style}>
          [Embedded Content]
        </div>
      )
    }

    case 'ViewContainer': {
      // Merge layout defined at the top level (separate from styling.layout)
      const containerStyle = { ...style }
      if (el.layout) {
        const lt = el.layout.layout_type
        if (lt === 'flex') containerStyle.display = 'flex'
        else if (lt === 'grid') containerStyle.display = 'grid'
        for (const [k, v] of Object.entries(el.layout)) {
          if (!v || k === 'layout_type' || k === 'alignment') continue
          ;(containerStyle as Record<string, string>)[snakeToCamel(k)] = typeof v === 'string' ? stripImportant(v) : v
        }
      }
      const validContainerTags = new Set(['div','section','article','header','footer','main','nav','aside','ul','ol'])
      const tag = el.tag_name && validContainerTags.has(el.tag_name) ? el.tag_name : 'div'
      const ContainerTag = tag as keyof React.JSX.IntrinsicElements
      return (
        <ContainerTag key={el.name} id={id} className={className} style={containerStyle}>
          {(el.view_elements ?? []).map((child) => renderElement(child, onInteract, navigateTo))}
        </ContainerTag>
      )
    }

    case 'LineChart':
    case 'BarChart':
    case 'PieChart':
    case 'RadarChart':
    case 'RadialBarChart':
      return <PlotlyGUIChart key={el.name} el={el} />

    case 'Table':
      return (
        <div key={el.name} id={id} className={className} style={{ overflowX: 'auto', ...style }}>
          {el.title && (
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '0.95em' }}>{el.title}</div>
          )}
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.88em' }}>
            {el.show_header !== false && (el.columns ?? []).length > 0 && (
              <thead>
                <tr>
                  {(el.columns ?? []).map((col, i) => (
                    <th
                      key={i}
                      style={{ padding: '6px 10px', borderBottom: '2px solid #e2e8f0', textAlign: 'left', fontWeight: 600 }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              <tr>
                <td
                  colSpan={(el.columns ?? []).length || 1}
                  style={{ padding: '8px 10px', color: '#94a3b8', fontStyle: 'italic' }}
                >
                  (data rows)
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )

    case 'MetricCard':
      return (
        <div
          key={el.name}
          id={id}
          className={['gui-metric-card', className].filter(Boolean).join(' ')}
          style={style}
        >
          <div className="gui-metric-card__title">{el.metric_title ?? el.name}</div>
          <div className="gui-metric-card__value" style={{ color: el.value_color ?? '#2c3e50' }}>
            —
          </div>
          <div className="gui-metric-card__format">{el.format}</div>
        </div>
      )

    case 'AgentComponent':
      return <EmbeddedChatWidget key={el.name} el={el} id={id} className={className} style={style} />

    default:
      return null
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

interface GUIRendererProps {
  content: unknown
  onInteract?: (eventJson: string) => void
  chatProps?: ChatWidgetProps
}

export function GUIRenderer({ content, onInteract, chatProps }: GUIRendererProps) {
  const rawId = useId()
  const scopeClass = 'gui-s' + rawId.replace(/[^a-zA-Z0-9]/g, '')

  const data = useMemo<GUIData | null>(() => {
    try {
      const str = typeof content === 'string' ? content : JSON.stringify(content)
      return JSON.parse(str) as GUIData
    } catch {
      return null
    }
  }, [content])

  const allScreens = useMemo(
    () => (data?.modules ?? []).flatMap((m) => m.screens),
    [data],
  )

  const [activeIdx, setActiveIdx] = useState(0)

  const navigateTo = useCallback((nameOrPath: string): boolean => {
    const byNameIdx = allScreens.findIndex((s) => s.name === nameOrPath)
    if (byNameIdx >= 0) { setActiveIdx(byNameIdx); return true }
    const byPathIdx = allScreens.findIndex((s) => s.route_path === nameOrPath)
    if (byPathIdx >= 0) { setActiveIdx(byPathIdx); return true }
    // '/' with no explicit route_path match → go to the main/first screen
    if (nameOrPath === '/' || nameOrPath === '') {
      const mainIdx = allScreens.findIndex((s) => s.is_main_page)
      setActiveIdx(mainIdx >= 0 ? mainIdx : 0)
      return true
    }
    return false
  }, [allScreens])

  // Reset tab when content changes
  useEffect(() => {
    const mainIdx = allScreens.findIndex((s) => s.is_main_page)
    setActiveIdx(mainIdx >= 0 ? mainIdx : 0)
  }, [allScreens])

  const scopedCSS = useMemo(
    () => (data?.style_entries ? buildScopedCSS(data.style_entries, scopeClass) : ''),
    [data, scopeClass],
  )

  // Inject scoped CSS into <head>
  useEffect(() => {
    if (!scopedCSS) return
    const el = document.createElement('style')
    el.setAttribute('data-gui-scope', scopeClass)
    el.textContent = scopedCSS
    document.head.appendChild(el)
    return () => {
      document.head.removeChild(el)
    }
  }, [scopedCSS, scopeClass])

  if (!data) {
    return <p className="msg-text--muted">[Invalid UI definition]</p>
  }

  const screen = allScreens[activeIdx]
  if (!screen) {
    return <p className="msg-text--muted">[No screens defined]</p>
  }

  const multiModule = data.modules.length > 1
  const multiScreen = allScreens.length > 1

  return (
    <ChatWidgetContext.Provider value={chatProps ?? null}>
      <div className="gui-renderer">
        <div className="gui-renderer__header">
          <span className="gui-renderer__title">{data.name}</span>
          {data.description && (
            <span className="gui-renderer__description">{data.description}</span>
          )}
        </div>

        {(multiModule || multiScreen) && (
          <div className="gui-renderer__tabs" role="tablist">
            {allScreens.map((s, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={i === activeIdx}
                className={`gui-renderer__tab${i === activeIdx ? ' gui-renderer__tab--active' : ''}`}
                onClick={() => setActiveIdx(i)}
              >
                {s.name}
                {s.is_main_page && <span className="gui-renderer__tab-badge">home</span>}
              </button>
            ))}
          </div>
        )}

        <div className={`gui-renderer__screen ${scopeClass}`}>
          {(screen.view_elements ?? []).map((el) => renderElement(el, onInteract, navigateTo))}
        </div>
      </div>
    </ChatWidgetContext.Provider>
  )
}
