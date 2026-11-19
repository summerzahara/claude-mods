import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentList, Status, Step } from '../types'

const agents = atom({ plugin: 'task-progress', key: 'agents' } as const, {} as Record<string, AgentList>)

const expanded = atom({ plugin: 'task-progress', key: 'expanded' } as const, {} as Record<string, boolean>)

const MAIN = 'main'
const ORANGE = 'claude'

// The to-do tools whose own rows this mod's card stands in for.
const TODO_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'mcp__ccd_turn__update_plan'])

type PlanArgs = {
  items?: Array<{ content: string; status: Status }>
  advance?: boolean
  done?: number[]
  start?: number
}

// The desktop app's task list: whole list, or advance / done+start (1-based).
function applyPlan(list: Step[], a: PlanArgs): Step[] {
  if (a.items) {
    return a.items.map((it, i) => ({ id: String(i + 1), title: it.content, status: it.status }))
  }
  const next = list.map(s => ({ ...s }))
  if (a.advance) {
    const cur = next.find(s => s.status === 'in_progress')
    if (cur) cur.status = 'completed'
    const pending = next.find(s => s.status === 'pending')
    if (pending) pending.status = 'in_progress'
  }
  for (const n of a.done ?? []) {
    const step = next[n - 1]
    if (step) step.status = 'completed'
  }
  const started = a.start === undefined ? undefined : next[a.start - 1]
  if (started) {
    next.forEach(s => { if (s.status === 'in_progress') s.status = 'pending' })
    started.status = 'in_progress'
  }
  return next
}

const isOpen = (list: AgentList) =>
  list.steps.some(s => s.status !== 'completed') || (list.steps.length === 0 && list.activity?.running === true)

// The bar on graphical surfaces: a thin rounded SVG track, its fill easing from
// where it was last drawn to where it is now. Claude orange; a faint track that
// reads on dark and light backgrounds alike.
const FILL_HEX = '#D97757'
const TRACK_RGBA = 'rgba(128,128,128,0.22)'
const BAR_PX = 6
const VIEW_W = 1000

// The fraction each agent's bar was last drawn at, so the next draw eases from it.
const lastFraction = new Map<string, number>()

// The SVG states a width wider than any screen; the app draws an SVG at its own
// width but no wider than the slot, so the bar always spans the card. It is
// stretched sideways to fit (preserveAspectRatio none), so it is drawn as round-
// capped lines whose stroke does not stretch: the 6px height and round ends hold
// at any width.
const CLAIM_PX = 8000
const CAP = 4 // viewBox units the ends are inset by, so the round caps stay inside

function svgOpen(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CLAIM_PX}" height="${BAR_PX}" viewBox="0 0 ${VIEW_W} ${BAR_PX}" preserveAspectRatio="none">`
}

function line(x1: number, x2: number, color: string, inner = ''): string {
  const y = BAR_PX / 2
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="${BAR_PX}" stroke-linecap="round" vector-effect="non-scaling-stroke">${inner}</line>`
}

function barSvg(id: string, fraction: number): string {
  const from = lastFraction.get(id) ?? fraction
  lastFraction.set(id, fraction)
  const span = VIEW_W - CAP * 2
  const end = (f: number) => CAP + Math.max(0, Math.min(1, f)) * span
  const ease = from === fraction
    ? ''
    : `<animate attributeName="x2" from="${end(from)}" to="${end(fraction)}" dur="0.5s" calcMode="spline" keyTimes="0;1" keySplines="0.25 0.1 0.25 1" fill="freeze"/>`
  const fill = fraction > 0 || from > 0 ? line(CAP, end(fraction), FILL_HEX, ease) : ''
  return svgOpen() + line(CAP, VIEW_W - CAP, TRACK_RGBA) + fill + '</svg>'
}

// A subagent with no task list: a short segment gliding back and forth.
function sweepSvg(): string {
  const seg = VIEW_W * 0.22
  const far = VIEW_W - CAP - seg
  const glide = (attr: string, a: number, b: number) =>
    `<animate attributeName="${attr}" values="${a};${b};${a}" dur="1.8s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"/>`
  return svgOpen()
    + line(CAP, VIEW_W - CAP, TRACK_RGBA)
    + line(CAP, CAP + seg, FILL_HEX, glide('x1', CAP, far) + glide('x2', CAP + seg, far + seg))
    + '</svg>'
}

// The bar on the terminal: a thin line, half-cell steps (╸) for an even fill.
const LINE = '━'
const HALF = '╸'
function lineBar(fraction: number, width: number): { filled: string; empty: string } {
  const halves = Math.round(Math.max(0, Math.min(1, fraction)) * width * 2)
  const full = Math.floor(halves / 2)
  const half = halves % 2 === 1 ? HALF : ''
  return { filled: LINE.repeat(full) + half, empty: LINE.repeat(width - full - half.length) }
}
function lineSweep(tools: number, width: number): { before: string; seg: string; after: string } {
  const len = Math.max(3, Math.round(width / 5))
  const span = width - len
  const cycle = span * 2
  const at = cycle > 0 ? tools % cycle : 0
  const pos = at <= span ? at : cycle - at
  return { before: LINE.repeat(pos), seg: LINE.repeat(len), after: LINE.repeat(span - pos) }
}

async function touch(
  $: EngineInterface,
  agentId: string,
  change: (list: AgentList | undefined, count: number) => AgentList | undefined,
): Promise<void> {
  await update($, agents, all => {
    const nextList = change(all[agentId], Object.keys(all).length)
    return nextList ? { ...all, [agentId]: nextList } : all
  })
}

// Agent names, looked up once per agent id.
const labels = new Map<string, string>()

async function labelFor($: EngineInterface, agentId: string | undefined): Promise<string> {
  if (!agentId) return 'Claude'
  const known = labels.get(agentId)
  if (known) return known
  const info = (await $.agent.list()).find(a => a.id === agentId)
  const label = info ? info.description || info.type : 'Subagent'
  labels.set(agentId, label)
  return label
}

async function edit(
  $: EngineInterface,
  agentId: string | undefined,
  change: (steps: Step[]) => Step[],
): Promise<void> {
  const key = agentId ?? MAIN
  const label = await labelFor($, agentId)
  await update($, agents, all => {
    const prev = all[key]
    const order = prev?.order ?? (key === MAIN ? 0 : Object.keys(all).length + 1)
    return { ...all, [key]: { ...prev, label: prev?.label ?? label, order, steps: change(prev?.steps ?? []) } }
  })
}

export const register: Register = on => {
  // Claude Code: TodoWrite replaces the whole list.
  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) {
      const steps: Step[] = e.todos.map((t, i) => ({ id: String(i + 1), title: t.content, status: t.status }))
      await edit($, e.agentId, () => steps)
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Claude Code: TaskCreate / TaskUpdate edit one task at a time.
  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError && ran.result) {
      const task = ran.result.task
      const step: Step = { id: task.id, title: task.subject, status: 'pending' }
      await edit($, e.agentId, steps => [...steps, step])
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError && e.status) {
      const status = e.status
      await edit($, e.agentId, steps =>
        status === 'deleted'
          ? steps.filter(s => s.id !== e.taskId)
          : steps.map(s => (s.id === e.taskId ? { ...s, status } : s)),
      )
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Claude desktop app: the pinned task list under each message.
  // Also counts each subagent tool call, which moves its activity bar.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const isOk = ran.deny === undefined && !ran.isError
    if (e.tool === 'mcp__ccd_turn__update_plan' && isOk) {
      const args = e as unknown as PlanArgs
      await edit($, e.agentId, steps => applyPlan(steps, args))
    } else if (e.tool === 'mcp__ccd_turn__wrap_up') {
      await edit($, e.agentId, steps => steps.map(s => ({ ...s, status: 'completed' as const })))
    }
    const id = e.agentId
    if (id) {
      await touch($, id, prev =>
        prev?.activity ? { ...prev, activity: { ...prev.activity, tools: prev.activity.tools + 1 } } : prev,
      )
    }
    return ran
  }).catch(($, e, next) => next(e))

  // A subagent starts: give it a row right away, named by its task.
  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)
    const id = ran.deny === undefined ? ran.agentId : undefined
    if (id) {
      const label = e.description || e.subagentType
      labels.set(id, label)
      await touch($, id, (prev, count) => ({
        label,
        order: prev?.order ?? count + 1,
        steps: prev?.steps ?? [],
        activity: { tools: 0, running: true },
      }))
    }
    return ran
  })

  // A subagent's turn ends: its row goes.
  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id) {
      await touch($, id, prev =>
        prev?.activity ? { ...prev, activity: { ...prev.activity, running: false } } : prev,
      )
    }
    return next(e)
  })

  // Drop finished lists when a new prompt starts, so old agents don't pile up.
  on('prompt.submit', async ($, e, next) => {
    await update($, agents, all =>
      Object.fromEntries(Object.entries(all).filter(([, list]) => isOpen(list))),
    )
    return next(e)
  })

  // The to-do tools' own rows in the conversation: the card shows them now.
  // ctrl+o (the full transcript) still shows them.
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (!TODO_TOOLS.has(e.props.tool) || e.props.isExpanded || e.props.isErrored) {
      return next(e)
    }
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const all = await read($, agents)
    const open = Object.entries(all)
      .filter(([, list]) => isOpen(list))
      .sort(([, a], [, b]) => a.order - b.order)

    if (e.props.hasSurvey || open.length === 0) {
      return next(e)
    }

    const shown = await read($, expanded)
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    // The terminal draws no SVG: it gets the text line instead.
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? table.Svg : undefined
    // Inside the card: its border (2) and side padding (2 x 2).
    const columns = Math.max(10, e.props.bodyColumns - 6)

    const bar = (id: string, fraction: number) =>
      Svg ? (
        <Box width="100%" marginY="xs">
          <Svg source={barSvg(id, fraction)} alt={`${Math.round(fraction * 100)}% done`} height={BAR_PX} />
        </Box>
      ) : (
        <Box flexDirection="row">
          <Text color={ORANGE}>{lineBar(fraction, columns).filled}</Text>
          <Text dimColor>{lineBar(fraction, columns).empty}</Text>
        </Box>
      )

    const sweep = (tools: number) => {
      if (Svg) {
        return (
          <Box width="100%" marginY="xs">
            <Svg source={sweepSvg()} alt="Working" height={BAR_PX} />
          </Box>
        )
      }
      const at = lineSweep(tools, columns)
      return (
        <Box flexDirection="row">
          <Text dimColor>{at.before}</Text>
          <Text color={ORANGE}>{at.seg}</Text>
          <Text dimColor>{at.after}</Text>
        </Box>
      )
    }

    const mark = (status: Status) => (status === 'completed' ? '✓' : status === 'in_progress' ? '●' : '○')

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={ORANGE}
        paddingX={2}
        paddingY={1}
        rowGap="md"
      >
        {open.map(([id, list]) => {
          const total = list.steps.length

          if (total === 0 && list.activity) {
            const tools = list.activity.tools
            return (
              <Box key={id} flexDirection="column" rowGap="xs">
                <Box flexDirection="row" justifyContent="space-between" alignItems="center">
                  <Text bold color={ORANGE}>{list.label}</Text>
                  <Text dimColor>{tools === 1 ? '1 tool call' : `${tools} tool calls`}</Text>
                </Box>
                {sweep(tools)}
                <Text dimColor>Working, no task list</Text>
              </Box>
            )
          }

          const done = list.steps.filter(s => s.status === 'completed').length
          const current = list.steps.find(s => s.status === 'in_progress')
          const isShown = shown[id] === true
          return (
            <Box key={id} flexDirection="column" rowGap="xs">
              <Box flexDirection="row" justifyContent="space-between" alignItems="center" columnGap="sm">
                <Text bold color={ORANGE}>{list.label}</Text>
                <Box flexDirection="row" alignItems="center" columnGap="sm">
                  <Text dimColor>{done} of {total}</Text>
                  <Button
                    key={`toggle-${id}`}
                    label={isShown ? 'Hide steps' : 'All steps'}
                    variant="secondary"
                    dimColor
                    onPress={() => update($, expanded, all => ({ ...all, [id]: !isShown }))}
                  />
                </Box>
              </Box>
              {bar(id, total > 0 ? done / total : 0)}
              {current && !isShown ? <Text dimColor wrap="truncate-end">Now: {current.title}</Text> : null}
              {isShown ? (
                <Box flexDirection="column" rowGap={0}>
                  {list.steps.map(step => (
                    <Box key={`s-${step.id}`}>
                      <Text
                        color={step.status === 'in_progress' ? ORANGE : undefined}
                        dimColor={step.status === 'completed'}
                      >
                        {mark(step.status)} {step.title}
                      </Text>
                    </Box>
                  ))}
                </Box>
              ) : null}
            </Box>
          )
        })}
      </Box>
    )
  })
}
