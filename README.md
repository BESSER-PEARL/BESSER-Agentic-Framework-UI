# BESSER Agentic Framework UI

A ChatGPT-like web frontend for interacting with agents built on the [BESSER Agentic Framework (BAF)](https://github.com/BESSER-PEARL/BESSER-Agentic-Framework). It supports all BAF payload types, session persistence via PostgreSQL, and real-time communication over WebSockets.

---

## Tech stack

| Layer | Technology |
|---|---|
| UI framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| Styling | Pure CSS (custom properties, light/dark via `prefers-color-scheme`) |
| WebSocket | Native browser `WebSocket` API |
| DB access | `pg` (node-postgres), run server-side inside a Vite plugin |
| Markdown rendering | `react-markdown` + `remark-gfm` |
| HTML sanitisation | `DOMPurify` |

---

## Repository structure

```
src/
├── App.tsx                     # Root component — routing between AgentSelector and ChatLayout
├── App.css                     # All component styles (no CSS framework)
├── index.css                   # CSS variables + global reset
├── main.tsx                    # React entry point
├── config.ts                   # (reserved for future config)
│
├── types/
│   ├── payload.ts              # PayloadAction constants + Payload interface
│   └── agent.ts                # Agent and ChatMessage interfaces
│
├── hooks/
│   └── useWebSocket.ts         # WebSocket lifecycle hook
│
├── services/
│   └── db.ts                   # PostgreSQL query service (server-side only)
│
└── components/
    ├── AgentSelector.tsx        # Landing page: agent list + add/remove agents + username input
    ├── ChatLayout.tsx           # Main chat shell: header, sidebar, chat area
    ├── SessionSidebar.tsx       # Left sidebar: session list, new session controls
    ├── ChatArea.tsx             # Message list + text input
    └── MessageBubble.tsx        # Renders a single message for every payload type

vite-plugin-baf.ts               # Vite dev-server plugin: exposes /api/sessions REST endpoint
vite.config.ts                   # Vite config — registers bafPlugin()
.env.example                     # Template for DB credentials
```

---

## Module descriptions

### `App.tsx` — Root router

Holds two pieces of global state persisted in `localStorage`:

- `baf_agents` — the list of configured agents (name, WebSocket URL)
- `baf_username` — the currently entered username

Renders either `<AgentSelector>` (no agent selected) or `<ChatLayout>` (agent selected). The `username` flows down as a prop to both.

---

### `types/payload.ts` — Payload contract

Defines the shared message format used by BAF's WebSocket protocol:

```ts
interface Payload {
  action: string    // one of PayloadAction values
  message: unknown  // content varies by action
  history?: boolean // true when the message is fetched from history, not a live event
}
```

`PayloadAction` is a `const` object (not an enum, due to `erasableSyntaxOnly: true` in tsconfig) with all supported action strings. User-originated actions start with `user_`; agent replies start with `agent_reply_`.

---

### `hooks/useWebSocket.ts` — WebSocket lifecycle

Manages a single WebSocket connection. Accepts a URL (`null` = disconnected) and an options object:

```ts
{
  onMessage(payload)        // called for all live messages (history === false)
  onHistoryMessage(payload) // called for fetched history messages (history === true)
  onOpen()                  // called when the connection is established
}
```

Key design decisions:
- The URL is the only dependency of the effect — changing it closes the old connection and opens a new one.
- Callbacks are stored in a `ref` so they never cause the effect to re-run, yet always execute the latest closure.
- `send()` and `disconnect()` are stable `useCallback` references.

---

### `services/db.ts` — PostgreSQL access

**This module is Node.js-only and cannot run in the browser.** It is imported exclusively by `vite-plugin-baf.ts`, which runs on the Vite server process.

`createDb(credentials)` returns a query object with `getSessions(agentName, username?)`, which queries the BAF monitoring database:

```sql
SELECT id, session_id, session_name, platform_name, timestamp
FROM session
WHERE agent_name = $1 [AND username = $2]
ORDER BY timestamp DESC
```

The `session` table is created by BAF and contains one row per agent session.

---

### `vite-plugin-baf.ts` — Dev-server API

A Vite plugin that registers a middleware on the same port as the dev server. This avoids CORS issues and the need for a separate backend process.

Exposes one endpoint:

```
GET /api/sessions?agent_name=<name>&username=<user>
→ SessionRecord[]
```

On startup it reads `.env` for DB credentials, creates a `pg` connection pool, and keeps it alive for the duration of the dev session.

> In production builds, a real backend server must serve this endpoint.

---

### `components/AgentSelector.tsx` — Landing page

Shows a card grid of configured agents. Each card displays the agent name and WebSocket URL. Agents are added via a modal (name + WebSocket URL, e.g. `ws://localhost:8765`) and are persisted to `localStorage`.

A **Username** input at the top of the page sets the global username used for session filtering. It is also persisted to `localStorage`.

---

### `components/ChatLayout.tsx` — Chat shell

The central orchestrator once an agent is selected. Responsibilities:

- Builds the WebSocket URL with query parameters (`user_id`, and optionally `session_id` or `session_name`)
- Owns the `messages` array and the `selectedSession` state
- Drives `useWebSocket` — passing `fetchOnOpen: true` when connecting to an existing session causes `FETCH_USER_MESSAGES` to be sent immediately on connection open
- Routes history payloads (arriving right after `FETCH_USER_MESSAGES`) to prepend existing messages, distinguishing user vs agent by checking the action type
- Delegates to `SessionSidebar` (left) and `ChatArea` (right)

**WebSocket URL construction:**

| Scenario | URL parameters sent |
|---|---|
| New session, no name | `user_id` only |
| New session, with name | `user_id` + `session_name` |
| Existing session selected | `user_id` + `session_id` |

> The browser `WebSocket` API cannot send HTTP headers. `user_id` is passed as a query parameter instead of a header.

---

### `components/SessionSidebar.tsx` — Session list

Polls `/api/sessions` every **5 seconds** to keep the session list up to date. At the top of the sidebar, a text input and "+ New session" button allow creating or resuming sessions without leaving the chat view.

Each session item shows:
- Session name (if set) or session ID
- Raw session ID (shown below the name when a name exists)
- Formatted timestamp

Clicking a session item calls `onSelectSession`, which in `ChatLayout` either sends `FETCH_USER_MESSAGES` directly (if already connected to that session) or opens a new WebSocket connection that fetches history on open.

---

### `components/ChatArea.tsx` — Message list + input

Renders the scrollable message list and the text input bar. The textarea auto-resizes, supports Enter-to-send (Shift+Enter for newline), and is disabled when the WebSocket is not connected.

---

### `components/MessageBubble.tsx` — Message renderer

Renders a single `ChatMessage`. User messages appear as plain-text right-aligned bubbles. Agent messages are routed by `action` to a specific renderer:

| Action | Renderer |
|---|---|
| `agent_reply_str` | Plain text |
| `agent_reply_markdown` | `react-markdown` with GFM |
| `agent_reply_html` | `DOMPurify`-sanitised `dangerouslySetInnerHTML` |
| `agent_reply_file` | Download link |
| `agent_reply_image` | `<img>` from base64 |
| `agent_reply_dataframe` | HTML table |
| `agent_reply_plotly` | Plotly chart (via `dangerouslySetInnerHTML`) |
| `agent_reply_options` | Clickable option buttons |
| `agent_reply_location` | Google Maps link |
| `agent_reply_rag` | Answer + collapsible source documents |
| `agent_reply_audio` | `<audio>` player from base64 |

---

## Setup

1. Copy `.env.example` to `.env` and fill in your PostgreSQL credentials:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=your_db
   DB_USER=your_user
   DB_PASSWORD=your_password
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

The app and the `/api/sessions` endpoint both run on the same Vite port (default `5173`).


```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
