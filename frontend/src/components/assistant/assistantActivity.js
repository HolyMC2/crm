// How Muelle works on a turn: the thinking line and the «Trabajó …» line over
// an answer (AssistantWork.vue). The steps are doco's safe activity events
// (doco assistant/activity.py: a phase, its status, the tool's name and its
// fixed description, times); the totals are the turn's usage receipt
// (doco_assistant_usage live, a history row's `usage` after a reload). doco
// never sends the model's reasoning, a tool's arguments or its result, so
// nothing here can show them.
import { reactive } from 'vue'
import { call } from 'frappe-ui'
import { ASSISTANT_API } from './assistantDoor'

const PHASES = new Set(['preparing', 'model', 'tool', 'completed', 'failed'])
const STATUSES = new Set(['running', 'completed', 'failed'])
const MAX_TURNS = 30
const MAX_EVENTS = 80
// Time between two steps with no model step in it is the model thinking: the
// harness engine reports only its tool calls.
export const GAP_MS = 400

export const work = reactive({
  /** turn id → { id, clientId, order, events } */
  turns: {},
  /** turn id → doco's usage summary (chat_usage.summary) */
  usage: {},
  /** turn id → true while its steps are unfolded */
  open: {},
})
let arrival = 0

function clip(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function ms(value) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

const TOOL = /^[A-Za-z0-9_]{1,100}$/

/**
 * One live or backfilled activity event; a repeat of a known step is ignored.
 * Returns the turn it belongs to ('' when it is not a step).
 */
export function onActivity(payload) {
  const id = clip(payload?.turn_id || payload?.run_id, 140)
  const seq = Number(payload?.seq)
  if (
    !id ||
    !Number.isInteger(seq) ||
    seq < 1 ||
    !PHASES.has(payload.phase) ||
    !STATUSES.has(payload.status)
  )
    return ''
  const turn = work.turns[id] || {
    id,
    clientId: '',
    order: ++arrival,
    events: [],
  }
  if (turn.events.some((event) => event.seq === seq)) return id
  const tool = TOOL.test(payload.tool || '') ? payload.tool : ''
  const event = {
    seq,
    phase: payload.phase,
    status: payload.status,
    tool,
    detail: clip(payload.detail, 120),
    elapsed: ms(payload.elapsed_ms) ?? 0,
    stage: ms(payload.stage_elapsed_ms),
    received: Date.now(),
  }
  const events = [...turn.events, event]
    .sort((a, b) => a.seq - b.seq)
    .slice(-MAX_EVENTS)
  const turns = {
    ...work.turns,
    [id]: {
      ...turn,
      clientId: turn.clientId || clip(payload.client_id, 140),
      events,
    },
  }
  const kept = Object.values(turns)
    .sort((a, b) => a.order - b.order)
    .slice(-MAX_TURNS)
  work.turns = Object.fromEntries(kept.map((t) => [t.id, t]))
  return id
}

/**
 * A turn whose numbering has a hole: a step the socket never delivered (a
 * reconnect as the question went out lost the first one on the lab walk).
 * A turn longer than the kept events starts past 1 on purpose.
 */
export function missingSteps(id) {
  const events = work.turns[id]?.events || []
  if (!events.length || events.length >= MAX_EVENTS) return false
  let expected = 1
  for (const event of events) {
    if (event.seq !== expected) return true
    expected += 1
  }
  return false
}

/** A turn's usage receipt (doco_assistant_usage): its model calls and tokens. */
export function onUsage(payload) {
  const id = clip(payload?.usage?.turn_id || payload?.turn_id, 140)
  if (!id || !payload.usage || typeof payload.usage !== 'object') return
  work.usage = { ...work.usage, [id]: payload.usage }
}

/**
 * The latest turns' steps, for an answer read after a reload and for a turn
 * still running when the sheet opens. `current()` says the read still
 * belongs to the conversation on screen. An older server has no such door:
 * the answers then simply come without their steps.
 */
export async function loadActivity(current = () => true) {
  try {
    const out = await call(`${ASSISTANT_API}.activity`)
    if (!current()) return
    for (const event of out?.events || []) onActivity(event)
  } catch {
    // nothing to show is the same as no steps
  }
}

export function snapshotActivity() {
  return { turns: work.turns, usage: work.usage, open: work.open }
}

export function restoreActivity(before) {
  Object.assign(work, before)
}

export function resetActivity() {
  Object.assign(work, { turns: {}, usage: {}, open: {} })
}

/** The newest turn, while it has not ended: the one the thinking line follows. */
export function liveTurn() {
  let newest = null
  for (const turn of Object.values(work.turns))
    if (!newest || turn.order > newest.order) newest = turn
  return newest && !stepsOf(newest).ended ? newest : null
}

const KIND = { preparing: 'prepare', model: 'model', tool: 'tool' }

/**
 * A turn's events as the steps the person reads, in order: `kind` prepare,
 * model or tool, `answer` on the model step that wrote the reply, `start`
 * and `end` in ms from the turn's start (`end` null while it runs).
 * `ended` and `failed` say how the turn closed, `total` when.
 */
export function stepsOf(turn) {
  const steps = []
  let closedAt = null
  let failed = false
  const close = (step, at, bad = false) => {
    step.end = Math.max(step.start, at)
    if (bad) step.failed = true
  }
  for (const event of turn?.events || []) {
    if (event.phase === 'completed' || event.phase === 'failed') {
      for (const step of steps) if (step.end == null) close(step, event.elapsed)
      closedAt = event.elapsed
      failed = event.phase === 'failed'
      continue
    }
    if (event.status === 'running') {
      // preparing has no end of its own: the next step ends whatever is open
      for (const step of steps) if (step.end == null) close(step, event.elapsed)
      steps.push({
        kind: KIND[event.phase],
        tool: event.tool,
        detail: event.detail,
        start: event.elapsed,
        end: null,
        failed: false,
        answer: false,
      })
      continue
    }
    let step = null
    for (const candidate of steps)
      if (candidate.end == null && candidate.kind === KIND[event.phase])
        step = candidate
    if (step)
      close(
        step,
        event.stage != null ? step.start + event.stage : event.elapsed,
        event.status === 'failed',
      )
  }
  const out = []
  const think = (start, end) => ({
    kind: 'model',
    tool: '',
    detail: '',
    start,
    end,
    failed: false,
    answer: false,
  })
  for (const step of steps) {
    const before = out[out.length - 1]
    if (
      before?.end != null &&
      before.kind !== 'model' &&
      step.kind !== 'model' &&
      step.start - before.end > GAP_MS
    )
      out.push(think(before.end, step.start))
    out.push(step)
  }
  const last = out[out.length - 1]
  if (last?.end != null && last.kind !== 'model') {
    // the model's round after the last tool: still running, or the reply
    if (closedAt == null) out.push(think(last.end, null))
    else if (closedAt - last.end > GAP_MS) out.push(think(last.end, closedAt))
  }
  const tail = out[out.length - 1]
  if (closedAt != null && !failed && tail?.kind === 'model') tail.answer = true
  return {
    steps: out,
    ended: closedAt != null,
    failed,
    total: closedAt,
  }
}

/** How long a step took (or has taken, while it runs), as «0.8 s», «12 s», «1 min 5 s». */
export function durationText(milliseconds, lang = currentLang()) {
  const value = Math.max(0, Number(milliseconds) || 0)
  if (value < 10000) {
    const seconds = new Intl.NumberFormat(locale(lang), {
      maximumFractionDigits: 1,
      minimumFractionDigits: value < 1000 ? 1 : 0,
    }).format(Math.round(value / 100) / 10)
    return `${seconds} s`
  }
  const whole = Math.round(value / 1000)
  if (whole < 60) return `${whole} s`
  const rest = whole % 60
  return rest
    ? `${Math.floor(whole / 60)} min ${rest} s`
    : `${Math.floor(whole / 60)} min`
}

export function currentLang() {
  return (
    globalThis.window?.lang ||
    globalThis.document?.documentElement?.lang ||
    globalThis.navigator?.language ||
    ''
  )
}

function locale(lang) {
  try {
    return Intl.getCanonicalLocales(String(lang).replace('_', '-'))[0]
  } catch {
    return undefined
  }
}

export function numberText(value, lang = currentLang()) {
  return new Intl.NumberFormat(locale(lang)).format(Number(value) || 0)
}

// --- the made-up words of the thinking line ----------------------------------
// The line says Muelle is at work in its own words, a new one every few
// seconds; what it is actually doing is one tap away (the steps). A dock's
// trade and a shop's day, half of them invented. Spanish follows es-MX copy.
const PHRASES_ES = [
  'Muelleando',
  'Zarpando',
  'Atando cabos',
  'Echando redes',
  'Izando velas',
  'Soltando amarras',
  'Oteando el horizonte',
  'Calafateando',
  'Amarrando ideas',
  'Remando',
  'Cuadrando cuentas',
  'Echándole coco',
  'Chambeando',
  'Hilvanando',
  'Desenredando',
  'Rebuscando',
  'Barajando',
  'Engranando',
  'Malabareando',
  'Cachivacheando',
  'Alquimiando',
  'Ajolotando',
  'Garabateando',
  'Destilando',
  'Muellificando',
  'Anclando datos',
  'Navegando el inventario',
]
const PHRASES_EN = [
  'Muelling',
  'Docking',
  'Mooring',
  'Unmooring',
  'Charting',
  'Splicing',
  'Knot-tying',
  'Tide-reading',
  'Net-casting',
  'Sail-hoisting',
  'Lighthousing',
  'Beachcombing',
  'Barnacling',
  'Shipshaping',
  'Ledgerdemaining',
  'Tallying',
  'Reckoning',
  'Rummaging',
  'Untangling',
  'Juggling',
  'Distilling',
  'Bookkeeping',
  'Quayside-pondering',
]

/** The made-up words for the person's language (their Frappe language). */
export function thinkingPhrases(lang = currentLang()) {
  return String(lang).toLowerCase().startsWith('es') ? PHRASES_ES : PHRASES_EN
}

/** The phrases in a fresh order, so no two turns read alike. */
export function shuffledPhrases(lang = currentLang(), random = Math.random) {
  const out = [...thinkingPhrases(lang)]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Testing only. */
export function _resetActivity() {
  resetActivity()
  arrival = 0
}
