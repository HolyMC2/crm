// Presupuesto: the month's plan per concept (product types bought, expense
// accounts, the sales goal) against what the month has really used, as
// doco.workspaces.presupuesto serves it. This file keeps the URL state, the
// wording and the edit payload pure so the page and its tests share them.
import { money } from '@/composables/useCompras'

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

export const API = 'doco.workspaces.presupuesto.'
export const CTX = 'Presupuesto'
export const HOME = '/gastos/presupuesto'
export const KINDS = Object.freeze(['Compras', 'Gastos', 'Ventas'])

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

/** `?mes=AAAA-MM` as the server takes it; anything else means this month. */
export function queryMonth(value) {
  return MONTH.test(String(value || '')) ? String(value) : ''
}

/** The month `delta` months away from `key` («2026-11», -1 → «2026-10»). */
export function shiftMonth(key, delta) {
  const match = MONTH.exec(key || '')
  if (!match) return ''
  const total = Number(match[1]) * 12 + Number(match[2]) - 1 + delta
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

/** «noviembre de 2026» for a month key or a date, in the page's language. */
export function monthLabel(value) {
  const match = /^(\d{4})-(\d{2})/.exec(String(value || ''))
  if (!match) return String(value || '')
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1)
  const lang =
    typeof document !== 'undefined' && document.documentElement?.lang
      ? document.documentElement.lang
      : undefined
  return date.toLocaleDateString(lang, { month: 'long', year: 'numeric' })
}

/** 0–100 for a bar: a line over its budget fills the bar, never overflows it. */
export function barPct(line) {
  const pct = Number(line?.pct)
  if (!Number.isFinite(pct) || pct < 0) return 0
  return Math.min(pct, 100)
}

/** The KpiTile / StatusChip tone of a line's state: colour only for action. */
export function stateTone(state) {
  if (state === 'over') return 'danger'
  if (state === 'warn' || state === 'behind') return 'warning'
  if (state === 'met') return 'success'
  return 'neutral'
}

/** A line's chip word: «Excedido», «Cerca del tope», «Meta cumplida», «Atrasada». */
export function stateLabel(state) {
  if (state === 'over') return tr('Over budget', null, CTX)
  if (state === 'warn') return tr('Near the limit', null, CTX)
  if (state === 'met') return tr('Goal met', null, CTX)
  if (state === 'behind') return tr('Behind pace', null, CTX)
  return ''
}

/** One sentence under a line: what is left, or by how much it went over. */
export function remainingText(line, currency) {
  const remaining = Number(line?.remaining) || 0
  if (line?.kind === 'Ventas') {
    if (line.state === 'met')
      return tr('Goal met: {0} over it', [money(-remaining, currency)], CTX)
    return tr('{0} to the goal', [money(remaining, currency)], CTX)
  }
  if (line?.state === 'over')
    return tr('{0} over', [money(-remaining, currency)], CTX)
  if (!Number(line?.amount)) return tr('No amount set', null, CTX)
  return tr('{0} left', [money(remaining, currency)], CTX)
}

/** «$450 of $500» for a line or a total. */
export function usedOfText(row, currency) {
  return tr(
    '{0} of {1}',
    [money(row?.used || 0, currency), money(row?.amount || 0, currency)],
    CTX,
  )
}

const KIND_TITLES = {
  Compras: 'Purchases by product type',
  Gastos: 'Expenses by account',
  Ventas: 'Sales',
}
export function kindTitle(kind) {
  return tr(KIND_TITLES[kind] || kind, null, CTX)
}

/** The lines grouped in the order the page shows them; empty kinds drop out. */
export function groupLines(lines = []) {
  return KINDS.map((kind) => ({
    kind,
    title: kindTitle(kind),
    lines: lines.filter((line) => line.kind === kind),
  })).filter((group) => group.lines.length)
}

/** The board's three tiles: spent, left and the sales goal (when planned). */
export function boardTiles(board, currency) {
  if (!board) return []
  const tiles = []
  const expense = board.totals?.expense
  if (expense) {
    tiles.push({
      key: 'spent',
      label: tr('Spent', null, CTX),
      value: money(expense.used || 0, currency),
      hint:
        expense.pct === null || expense.pct === undefined
          ? tr('of {0}', [money(expense.amount || 0, currency)], CTX)
          : tr(
              '{0} % of {1}',
              [expense.pct, money(expense.amount || 0, currency)],
              CTX,
            ),
      tone: stateTone(expense.state),
    })
    const remaining = Number(expense.remaining) || 0
    tiles.push({
      key: 'left',
      label:
        expense.state === 'over'
          ? tr('Over budget by', null, CTX)
          : tr('Left this month', null, CTX),
      value: money(Math.abs(remaining), currency),
      hint:
        expense.state === 'over' || !currentMonth(board)
          ? ''
          : tr(
              '{0} projected by month end',
              [money(expense.projected || 0, currency)],
              CTX,
            ),
      tone: expense.state === 'over' ? 'danger' : 'neutral',
    })
  }
  const ventas = board.totals?.ventas
  if (ventas) {
    tiles.push({
      key: 'sales',
      label: tr('Sales this month', null, CTX),
      value: money(ventas.used || 0, currency),
      hint:
        ventas.pct === null || ventas.pct === undefined
          ? ''
          : tr(
              '{0} % of the {1} goal',
              [ventas.pct, money(ventas.amount || 0, currency)],
              CTX,
            ),
      tone: stateTone(ventas.state),
    })
  }
  return tiles
}

/** Whether the board's month is the one running (a past month has no projection). */
export function currentMonth(board) {
  return (
    !board?.today || String(board.today).startsWith(String(board.month || ''))
  )
}

/** The Gastos door: what the row says about the month's budget. */
export function gastosDoor(board) {
  if (!board)
    return { title: tr('Budget', null, CTX), meta: '', tone: 'neutral' }
  if (!board.lines?.length)
    return {
      title: tr('No budget for {0}', [board.label], CTX),
      meta: board.can_edit ? tr('Set the budget', null, CTX) : '',
      tone: 'neutral',
    }
  const expense = board.totals?.expense || {}
  return {
    title: tr('Budget for {0}', [board.label], CTX),
    meta:
      expense.pct === null || expense.pct === undefined
        ? ''
        : tr('{0} % used', [expense.pct], CTX),
    tone: stateTone(expense.state),
  }
}

/** The last months as columns: heights against the tallest budget or spend. */
export function historyColumns(history = []) {
  const peak = Math.max(
    1,
    ...history.map((h) =>
      Math.max(Number(h.expense?.amount) || 0, Number(h.expense?.used) || 0),
    ),
  )
  return history.map((h) => {
    const amount = Number(h.expense?.amount) || 0
    const used = Number(h.expense?.used) || 0
    return {
      month: h.month,
      label: h.label,
      amount,
      used,
      amountPct: Math.round((amount / peak) * 100),
      usedPct: Math.round((used / peak) * 100),
      over: amount > 0 && used > amount,
    }
  })
}

/** Rows the edit sheet works with, one per line, with a stable key. */
export function editRows(lines = []) {
  return lines.map((line, index) => ({
    key: `${line.kind}:${line.item_group || line.account || ''}:${index}`,
    kind: line.kind,
    item_group: line.item_group || '',
    account: line.account || '',
    label: line.label || '',
    amount: line.amount ?? '',
    note: line.note || '',
  }))
}

/** What `save` takes: every row with a scope and an amount, no blanks. */
export function linesPayload(rows = []) {
  const out = []
  for (const row of rows) {
    if (!KINDS.includes(row.kind)) continue
    if (row.amount === '' || row.amount === null || row.amount === undefined)
      continue
    const amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount < 0) continue
    if (row.kind === 'Compras' && !row.item_group) continue
    out.push({
      kind: row.kind,
      item_group: row.kind === 'Compras' ? row.item_group : '',
      account: row.kind === 'Gastos' ? row.account || '' : '',
      amount,
      note: String(row.note || '').trim(),
    })
  }
  return out
}

/** The chip a record shows: the line it draws from and where it stands. */
export function chipParts(line, currency) {
  const parts = []
  if (line.pct !== null && line.pct !== undefined)
    parts.push(tr('{0} % used', [line.pct], CTX))
  parts.push(remainingText(line, currency))
  return parts
}

/** The page with one line in sight, for a record's chip and Hoy's rows. */
export function lineHref(line) {
  const query = new URLSearchParams()
  if (line?.month) query.set('mes', line.month)
  if (line?.key) query.set('linea', line.key)
  const text = query.toString()
  return text ? `${HOME}?${text}` : HOME
}
