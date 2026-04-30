/**
 * Mirrors the BAF `ReasoningStep` dataclass
 * (baf/library/state/reasoning_state_library.py).
 *
 * Every reasoning event the BAF reasoning state emits is shipped over the
 * websocket as `AGENT_REPLY_REASONING_STEP` with this shape as the message.
 * `REASONING_STARTED` and `REASONING_FINISHED` bracket every reasoning loop —
 * the UI uses them to know when to open and close a "live trace" group around
 * the steps in between.
 */

export const ReasoningStepKind = {
  REASONING_STARTED: 'reasoning_started',
  REASONING_FINISHED: 'reasoning_finished',
  LLM_TEXT: 'llm_text',
  LLM_TOOL_CALLS: 'llm_tool_calls',
  TOOL_RESULT: 'tool_result',
  TASK_ADDED: 'task_added',
  TASK_COMPLETED: 'task_completed',
  TASK_SKIPPED: 'task_skipped',
  PUSHBACK: 'pushback',
  MAX_STEPS: 'max_steps',
} as const

export type ReasoningStepKind =
  (typeof ReasoningStepKind)[keyof typeof ReasoningStepKind]

export interface ReasoningStep {
  kind: ReasoningStepKind | string
  step: number
  summary: string
  details: Record<string, unknown>
}

/**
 * Mirrors the BAF `Task` dataclass.
 *
 * Carried inside the `agent_reply_task_list_update` payload as a list of
 * snapshots — every task list mutation re-sends the full list, so the UI
 * just replaces its state on each update.
 */
export const TaskStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
} as const

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]

export interface Task {
  id: number
  description: string
  status: TaskStatus | string
  result: string
}

/**
 * A reasoning trace as displayed in the chat: a single bracketed group of
 * steps from `reasoning_started` to `reasoning_finished`, plus the live task
 * list maintained alongside the step stream.
 *
 * The synthetic action `'reasoning_trace'` is internal to the UI — it never
 * appears on the wire. It is the action used on the ChatMessage that
 * aggregates the streamed steps and task-list snapshots.
 */
export interface ReasoningTraceMessage {
  steps: ReasoningStep[]
  tasks: Task[]
  inProgress: boolean
}

export const REASONING_TRACE_ACTION = 'reasoning_trace'

/** Returns true when the kind marks the start of a new reasoning trace. */
export function isReasoningStart(step: ReasoningStep): boolean {
  return step.kind === ReasoningStepKind.REASONING_STARTED
}

/** Returns true when the kind marks the end of a reasoning trace. */
export function isReasoningEnd(step: ReasoningStep): boolean {
  return step.kind === ReasoningStepKind.REASONING_FINISHED
}

/**
 * Steps that the user actually sees (everything except the
 * `reasoning_started` / `reasoning_finished` bracket markers).
 */
export function visibleSteps(trace: ReasoningTraceMessage): ReasoningStep[] {
  return trace.steps.filter(
    (s) => !isReasoningStart(s) && !isReasoningEnd(s),
  )
}

/**
 * True when the trace produced no observable reasoning at all — i.e., the
 * LLM answered directly without calling any tools or planning any tasks.
 * Empty traces should not be rendered: the user only sees the final reply.
 */
export function isEmptyTrace(trace: ReasoningTraceMessage): boolean {
  return visibleSteps(trace).length === 0
}
