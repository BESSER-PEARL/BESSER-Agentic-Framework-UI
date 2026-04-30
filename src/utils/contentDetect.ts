/**
 * Heuristics that decide how to render an `agent_reply_str` message.
 *
 * BAF's `session.reply(text)` always sends `AGENT_REPLY_STR`, but the LLM
 * inside the reasoning loop frequently produces Markdown — headings, lists,
 * fenced code blocks, links — which would look terrible rendered as plain
 * text. These helpers sniff the content and pick a renderer:
 *
 *   1. Markdown (`looksLikeMarkdown`) — for any text containing common
 *      Markdown signals (headings, lists, **bold**, `code`, fenced ``` blocks,
 *      links, blockquotes, tables, horizontal rules).
 *   2. Code (`looksLikeCode`) — for text that has no Markdown signals but is
 *      clearly source code: programming keywords at the start of a line, or
 *      very high density of `{};()=` characters across multiple lines.
 *   3. Plain text — fallback when neither matches.
 *
 * The functions are deliberately conservative: a false negative (rendering
 * Markdown as plain text) is uglier but harmless; a false positive (rendering
 * plain prose as Markdown) can mangle words like "5 * 3" or "use _foo_ to…".
 * Each pattern below requires a clear delimiter pair or a specific line shape
 * to keep noise low.
 */

const MARKDOWN_SIGNALS: RegExp[] = [
  /^#{1,6}\s+\S/m,                 // # heading
  /^\s*[-*+]\s+\S/m,               // - bullet list item
  /^\s*\d+\.\s+\S/m,               // 1. numbered list item
  /\*\*[^*\n]+\*\*/,               // **bold**
  /(^|[^_])__[^_\n]+__([^_]|$)/,   // __bold__ (avoid mid-word _foo_bar_)
  /```[\s\S]*?```/,                // ``` fenced code block ```
  /`[^`\n]+`/,                     // `inline code`
  /\[[^\]]+\]\([^)\s]+\)/,         // [link](url)
  /^>\s+\S/m,                      // > blockquote
  /^\|[^\n]+\|\s*$/m,              // | table | row |
  /^---+\s*$/m,                    // --- horizontal rule
]

/**
 * True if the text contains at least one Markdown signal (any of: heading,
 * list, bold, fenced/inline code, link, blockquote, table, hr).
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text || text.length < 2) return false
  return MARKDOWN_SIGNALS.some((re) => re.test(text))
}

const CODE_LEAD_KEYWORDS = new RegExp(
  '^\\s*(' +
    [
      'function\\s', 'def\\s', 'class\\s', 'interface\\s', 'enum\\s',
      'import\\s', 'from\\s+\\S+\\s+import\\s', 'package\\s',
      'const\\s', 'let\\s', 'var\\s',
      'public\\s', 'private\\s', 'protected\\s', 'static\\s',
      'async\\s+function\\s', 'async\\s+def\\s',
      '#include\\b', '<\\?php\\b', '<!DOCTYPE\\s',
    ].join('|') +
    ')',
  'm',
)

/**
 * True if the text has no Markdown signals but looks like source code:
 * either a programming keyword on its own line, or a high density of
 * code-shaped punctuation across multiple lines.
 */
export function looksLikeCode(text: string): boolean {
  if (!text || text.length < 8) return false
  const lines = text.split('\n')
  if (lines.length < 2) return false

  if (CODE_LEAD_KEYWORDS.test(text)) return true

  // Density of code-shaped punctuation across the whole text. Tuned so plain
  // English (a few parens / equals signs) stays under 5%, while typical code
  // sits comfortably above it.
  const codeChars = (text.match(/[{}();=]/g) ?? []).length
  if (codeChars / text.length > 0.05 && lines.length >= 3) return true

  return false
}

export type RenderHint = 'markdown' | 'code' | 'plain'

/** Pick the best renderer for an unknown-format text reply. */
export function detectContentKind(text: string): RenderHint {
  if (looksLikeMarkdown(text)) return 'markdown'
  if (looksLikeCode(text)) return 'code'
  return 'plain'
}
