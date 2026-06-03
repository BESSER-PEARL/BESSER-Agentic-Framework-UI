import { useEffect, useState } from 'react'
import {
  ReasoningStepKind,
  TaskStatus,
  type ReasoningStep,
  type ReasoningTraceMessage,
  type Task,
} from '../types/reasoningStep'

interface ReasoningTraceProps {
  trace: ReasoningTraceMessage
}

// Kinds of events emitted from inside the built-in task tools — already
// rendered in the task panel below.
const TASK_EVENT_KINDS = new Set<string>([
  ReasoningStepKind.TASK_ADDED,
  ReasoningStepKind.TASK_COMPLETED,
  ReasoningStepKind.TASK_SKIPPED,
])

// Tool names whose `llm_tool_calls` announcement is also redundant with the
// task panel. Mixed-tool announcements (e.g. lookup + complete_task in one
// step) are preserved — only "exclusively task tools" calls are hidden.
const TASK_TOOL_NAMES = new Set<string>(['add_tasks', 'complete_task', 'skip_task'])

function isTaskOnlyToolCall(s: ReasoningStep): boolean {
  if (s.kind !== ReasoningStepKind.LLM_TOOL_CALLS) return false
  const calls = (s.details as { tool_calls?: { name?: string }[] } | undefined)?.tool_calls ?? []
  if (calls.length === 0) return false
  return calls.every((c) => c.name !== undefined && TASK_TOOL_NAMES.has(c.name))
}

/**
 * Renders a streamed reasoning trace.
 *
 * - While `inProgress` is true, the trace is shown expanded so the user can
 *   watch the agent think. Steps are grouped by their `step` number so each
 *   loop iteration shows a single "STEP N" header followed by every event
 *   that happened during it.
 * - Once `inProgress` flips to false (the BAF emitted `reasoning_finished`),
 *   the trace collapses to a single header line; clicking re-expands it.
 * - The task list (sent on a parallel channel via `task_list_update`) is
 *   shown above the step trace as its own checklist panel with colored
 *   status boxes.
 */
export function ReasoningTrace({ trace }: ReasoningTraceProps) {
  // Default expanded while in progress; auto-collapse when reasoning finishes.
  // The user can still click the header to re-expand a finished trace.
  const [open, setOpen] = useState<boolean>(trace.inProgress)
  useEffect(() => {
    if (!trace.inProgress) setOpen(false)
  }, [trace.inProgress])
  const isOpen = trace.inProgress || open

  // Filter the events shown in the step list:
  //   * bracket markers (reasoning_started / reasoning_finished) are signal-only
  //   * task events (task_added / completed / skipped) are already shown in
  //     the task panel below
  //   * llm_tool_calls events that exclusively call task tools are dropped
  //     too (the announcement "calling 1 tool(s): complete_task" duplicates
  //     what the task panel already shows). Mixed batches with at least one
  //     non-task tool are kept.
  // The renumbering in StepTrace makes the resulting STEP headers contiguous
  // even when an entire iteration consisted only of task tool calls.
  const visibleSteps = trace.steps.filter((s) => {
    if (s.kind === ReasoningStepKind.REASONING_STARTED) return false
    if (s.kind === ReasoningStepKind.REASONING_FINISHED) return false
    if (TASK_EVENT_KINDS.has(s.kind)) return false
    if (isTaskOnlyToolCall(s)) return false
    return true
  })

  // Count distinct loop iterations, not individual events: a single step can
  // emit several events (llm_tool_calls + tool_result + complete_task all
  // share the same `step` number), and the summary should reflect "iterations
  // the reasoning loop ran" rather than "events streamed".
  const iterations = new Set(visibleSteps.map((s) => s.step)).size

  return (
    <div className={`reasoning-trace${trace.inProgress ? ' reasoning-trace--live' : ''}`}>
      <button
        type="button"
        className={`reasoning-trace__summary${isOpen ? ' reasoning-trace__summary--open' : ''}`}
        onClick={() => !trace.inProgress && setOpen((o) => !o)}
        disabled={trace.inProgress}
        aria-expanded={isOpen}
      >
        <span className="reasoning-trace__icon" aria-hidden>
          {trace.inProgress ? '🧠' : '✨'}
        </span>
        <span className="reasoning-trace__label">
          {trace.inProgress
            ? `Reasoning… (${iterations} step${iterations === 1 ? '' : 's'})`
            : `Reasoned across ${iterations} step${iterations === 1 ? '' : 's'}`}
        </span>
        {!trace.inProgress && (
          <span className="reasoning-trace__chevron" aria-hidden>▶</span>
        )}
      </button>

      <div
        className={`reasoning-trace__body-wrapper${isOpen ? ' reasoning-trace__body-wrapper--open' : ''}`}
      >
        <div className="reasoning-trace__body-inner">
          <StepTrace steps={visibleSteps} />
          {trace.tasks.length > 0 && <TaskListPanel tasks={trace.tasks} />}
        </div>
      </div>
    </div>
  )
}

// ─── Task list panel ───────────────────────────────────────────────────── //

const STATUS_LABEL: Record<string, string> = {
  [TaskStatus.PENDING]: 'pending',
  [TaskStatus.IN_PROGRESS]: 'in progress',
  [TaskStatus.COMPLETED]: 'completed',
  [TaskStatus.SKIPPED]: 'skipped',
}

function TaskListPanel({ tasks }: { tasks: Task[] }) {
  const counts = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1
    return acc
  }, {})
  const completed = counts[TaskStatus.COMPLETED] ?? 0
  const skipped = counts[TaskStatus.SKIPPED] ?? 0
  const pending = (counts[TaskStatus.PENDING] ?? 0) + (counts[TaskStatus.IN_PROGRESS] ?? 0)

  return (
    <div className="task-panel">
      <div className="task-panel__header">
        <span className="task-panel__title">Tasks</span>
        <span className="task-panel__counts">
          {completed > 0 && <span className="task-panel__count task-panel__count--completed">{completed} ✓</span>}
          {skipped > 0 && <span className="task-panel__count task-panel__count--skipped">{skipped} ⊘</span>}
          {pending > 0 && <span className="task-panel__count task-panel__count--pending">{pending} pending</span>}
        </span>
      </div>
      <ul className="task-panel__list">
        {tasks.map((t) => (
          <li key={t.id} className={`task-panel__item task-panel__item--${t.status}`}>
            <span
              className={`task-panel__box task-panel__box--${t.status}`}
              title={STATUS_LABEL[t.status] ?? t.status}
              aria-label={STATUS_LABEL[t.status] ?? t.status}
            />
            <span className="task-panel__text">
              <span className="task-panel__id">#{t.id}</span>
              <span className="task-panel__description">{t.description}</span>
              {t.result && (
                <span className="task-panel__result" title={t.result}>
                  → {t.result}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Step trace (grouped by step number) ─────────────────────────────── //

type EventItem =
  | { type: 'single'; step: ReasoningStep }
  | { type: 'tool_result_group'; steps: ReasoningStep[] }

function groupConsecutiveToolResults(events: ReasoningStep[]): EventItem[] {
  const result: EventItem[] = []
  let i = 0
  while (i < events.length) {
    if (events[i].kind === ReasoningStepKind.TOOL_RESULT) {
      let j = i
      while (j < events.length && events[j].kind === ReasoningStepKind.TOOL_RESULT) j++
      const run = events.slice(i, j)
      if (run.length > 2) {
        result.push({ type: 'tool_result_group', steps: run })
      } else {
        for (const s of run) result.push({ type: 'single', step: s })
      }
      i = j
    } else {
      result.push({ type: 'single', step: events[i] })
      i++
    }
  }
  return result
}

function StepTrace({ steps }: { steps: ReasoningStep[] }) {
  // Group by step number, preserving order. Two consecutive steps with the
  // same number land in the same group; a different number opens a new group.
  const groups: { step: number; events: ReasoningStep[] }[] = []
  for (const s of steps) {
    const last = groups[groups.length - 1]
    if (last && last.step === s.step) {
      last.events.push(s)
    } else {
      groups.push({ step: s.step, events: [s] })
    }
  }

  if (groups.length === 0) return null

  return (
    <div className="reasoning-trace__steps">
      {groups.map((g, i) => (
        <div key={i} className="reasoning-trace__step-group">
          <div
            className="reasoning-trace__step-header"
            title={`actual reasoning iteration #${g.step}`}
          >
            STEP {i}
          </div>
          <ol className="reasoning-trace__step-list">
            {groupConsecutiveToolResults(g.events).map((item, j) =>
              item.type === 'tool_result_group'
                ? <ToolResultGroup key={j} steps={item.steps} />
                : <ReasoningStepLine key={j} step={item.step} />
            )}
          </ol>
        </div>
      ))}
    </div>
  )
}

const KIND_ICON: Record<string, string> = {
  [ReasoningStepKind.LLM_TEXT]: '💬',
  [ReasoningStepKind.LLM_TOOL_CALLS]: '🛠️',
  [ReasoningStepKind.TOOL_RESULT]: '📥',
  [ReasoningStepKind.TASK_ADDED]: '📝',
  [ReasoningStepKind.TASK_COMPLETED]: '✅',
  [ReasoningStepKind.TASK_SKIPPED]: '⏭️',
  [ReasoningStepKind.PUSHBACK]: '↩️',
  [ReasoningStepKind.MAX_STEPS]: '⏱️',
}

function ToolResultGroup({ steps }: { steps: ReasoningStep[] }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="reasoning-trace__step">
      <button
        type="button"
        className="reasoning-trace__step-line"
        onClick={() => setOpen((o) => !o)}
        title="Click to expand tool results"
      >
        <span className="reasoning-trace__step-icon" aria-hidden>📥</span>
        <span className="reasoning-trace__step-summary">
          Completed {steps.length} tool calls
        </span>
        <span
          className="reasoning-trace__step-chevron"
          aria-hidden
          style={{ fontSize: '0.65rem', transition: 'transform 0.2s ease', transform: open ? 'rotate(90deg)' : 'none' }}
        >
          ▶
        </span>
      </button>
      {open && (
        <ol className="reasoning-trace__step-list reasoning-trace__step-list--nested">
          {steps.map((s, i) => (
            <ReasoningStepLine key={i} step={s} />
          ))}
        </ol>
      )}
    </li>
  )
}

function ReasoningStepLine({ step }: { step: ReasoningStep }) {
  const [showDetails, setShowDetails] = useState(false)
  const icon = KIND_ICON[step.kind] ?? '🔹'
  const hasDetails = step.details && Object.keys(step.details).length > 0

  return (
    <li className="reasoning-trace__step">
      <button
        type="button"
        className="reasoning-trace__step-line"
        onClick={() => hasDetails && setShowDetails((s) => !s)}
        disabled={!hasDetails}
        title={hasDetails ? 'Click to toggle details' : undefined}
      >
        <span className="reasoning-trace__step-icon" aria-hidden>{icon}</span>
        <span className="reasoning-trace__step-summary">{step.summary}</span>
      </button>
      {hasDetails && showDetails && (
        <pre className="reasoning-trace__step-details">
          {JSON.stringify(step.details, null, 2)}
        </pre>
      )}
    </li>
  )
}
