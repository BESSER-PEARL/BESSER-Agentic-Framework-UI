declare module 'plotly.js-dist-min' {
  interface Config {
    responsive?: boolean
    displayModeBar?: boolean | 'hover'
    scrollZoom?: boolean
    [key: string]: unknown
  }

  export function newPlot(
    el: HTMLElement,
    data: unknown[],
    layout?: unknown,
    config?: Config,
  ): Promise<HTMLElement>

  export function purge(el: HTMLElement): void

  export function react(
    el: HTMLElement,
    data: unknown[],
    layout?: unknown,
    config?: Config,
  ): Promise<HTMLElement>
}
