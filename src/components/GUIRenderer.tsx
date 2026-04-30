import { useState, useId, useMemo, useEffect, useRef, useCallback } from 'react'

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

// ─── Style conversion ────────────────────────────────────────────────────────

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

const SIZE_SKIP = new Set(['unit_size', 'icon_size'])
const COLOR_SKIP = new Set(['color_palette', 'primary_color', 'line_color', 'grid_color', 'axis_color', 'bar_color', 'label_color', 'fill_color'])
const COLOR_REMAP: Record<string, string> = {
  background_color: 'background',
  text_color: 'color',
}
const LAYOUT_SKIP = new Set(['layout_type'])
const POS_SKIP = new Set(['p_type', 'alignment'])

function stylingToReact(styling?: StylingNode): React.CSSProperties {
  if (!styling) return {}
  const s: Record<string, string | number> = {}

  if (styling.size) {
    for (const [k, v] of Object.entries(styling.size)) {
      if (!v || SIZE_SKIP.has(k)) continue
      s[snakeToCamel(k)] = v
    }
  }

  if (styling.position) {
    for (const [k, v] of Object.entries(styling.position)) {
      if (!v || POS_SKIP.has(k)) continue
      if (k === 'display') {
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
          s['display'] = v
        }
      } else {
        s[snakeToCamel(k)] = v
      }
    }
  }

  if (styling.color) {
    for (const [k, v] of Object.entries(styling.color)) {
      if (!v || COLOR_SKIP.has(k)) continue
      s[COLOR_REMAP[k] ?? snakeToCamel(k)] = v
    }
  }

  // Layout always last so layout_type wins over position.display
  if (styling.layout) {
    const lt = styling.layout.layout_type
    if (lt === 'flex') s['display'] = 'flex'
    else if (lt === 'grid') s['display'] = 'grid'
    for (const [k, v] of Object.entries(styling.layout)) {
      if (!v || LAYOUT_SKIP.has(k)) continue
      s[snakeToCamel(k)] = v
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

function PlotlyGUIChart({ el }: { el: ViewElement }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    let active = true
    const { traces, layout } = buildPlotlyFigure(el)
    import('plotly.js-dist-min').then((Plotly) => {
      if (!active || !node) return
      Plotly.newPlot(node, traces, layout, { responsive: true, displayModeBar: false })
    })
    return () => {
      active = false
      import('plotly.js-dist-min').then((Plotly) => { if (node) Plotly.purge(node) })
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

// ─── Element renderer ────────────────────────────────────────────────────────

function renderElement(el: ViewElement, onInteract?: (json: string) => void, navigateTo?: (nameOrPath: string) => boolean): React.ReactNode {
  const style = stylingToReact(el.styling)
  const id = el.component_id ?? undefined
  const className = (el.css_classes ?? []).join(' ') || undefined

  switch (el.type) {
    case 'Text': {
      // Respect original tag_name for semantic headings/paragraphs
      const validTags = new Set(['h1','h2','h3','h4','h5','h6','p','span','div','label','li','td','th'])
      const tag = el.tag_name && validTags.has(el.tag_name) ? el.tag_name : 'p'
      const Tag = tag as keyof React.JSX.IntrinsicElements
      return <Tag key={el.name} id={id} className={className} style={style}>{el.content}</Tag>
    }

    case 'Link':
      return (
        <a
          key={el.name}
          id={id}
          className={className}
          style={style}
          href={el.url ?? '#'}
          target={el.target ?? '_self'}
          rel={el.rel ?? (el.target === '_blank' ? 'noopener noreferrer' : undefined)}
          onClick={(e) => {
            if (el.url && navigateTo?.(el.url)) {
              e.preventDefault()
            } else {
              onInteract?.(JSON.stringify({ elementId: id ?? el.name, action: 'onClick', value: el.url }))
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
          style={style}
          type="button"
          onClick={() => {
            if (el.actionType === 'navigate' && el.url && navigateTo?.(el.url)) return
            onInteract?.(JSON.stringify({ elementId: id ?? el.name, action: 'onClick' }))
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
      return (
        <input
          key={el.name}
          id={id}
          name={el.name}
          className={className}
          style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', ...style }}
          type={(el.field_type ?? 'text').toLowerCase()}
          placeholder={el.description || el.name}
          onBlur={(e) => onInteract?.(JSON.stringify({ elementId: id ?? el.name, action: 'onChange', value: e.target.value }))}
        />
      )

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
            onInteract?.(JSON.stringify({ elementId: id ?? el.name, action: 'onSubmit', value: data }))
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
                      onInteract?.(JSON.stringify({ elementId: el.component_id ?? el.name, action: 'onClick', value: item.url }))
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
          if (!v || k === 'layout_type') continue
          ;(containerStyle as Record<string, string>)[snakeToCamel(k)] = v
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
      return (
        <div
          key={el.name}
          id={id}
          className={['gui-agent-component', className].filter(Boolean).join(' ')}
          style={style}
        >
          <span>🤖</span>
          <span>{el.agent_title ?? el.agent_name ?? 'Agent'} Widget</span>
        </div>
      )

    default:
      return null
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

interface GUIRendererProps {
  content: unknown
  onInteract?: (eventJson: string) => void
}

export function GUIRenderer({ content, onInteract }: GUIRendererProps) {
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
  )
}
