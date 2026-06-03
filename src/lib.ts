// CSS — Vite bundles both into dist/style.css
import './lib.css'
import './App.css'

// Components
export { ChatArea } from './components/ChatArea'
export { MessageBubble } from './components/MessageBubble'
export { ReasoningTrace } from './components/ReasoningTrace'
export { GUIRenderer } from './components/GUIRenderer'

// WebSocket hook + types
export { useWebSocket } from './hooks/useWebSocket'
export type { ConnectionStatus } from './hooks/useWebSocket'

// Agent types
export type { ChatMessage, Agent } from './types/agent'

// Payload
export { PayloadAction } from './types/payload'
export type { Payload } from './types/payload'

// Reasoning steps
export {
  ReasoningStepKind,
  TaskStatus,
  REASONING_TRACE_ACTION,
  isReasoningStart,
  isReasoningEnd,
  visibleSteps,
  isEmptyTrace,
} from './types/reasoningStep'
export type { ReasoningStep, Task, ReasoningTraceMessage } from './types/reasoningStep'

// Content detection utilities
export { looksLikeMarkdown, looksLikeCode, detectContentKind } from './utils/contentDetect'
export type { RenderHint } from './utils/contentDetect'
