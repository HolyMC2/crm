// Resultados as a workspace of views (doco docs/TABLEROS.md §7). Muelle ships
// three views laid out from the Resultados cards; every other view is one of
// the person's Tableros (their own or shared with them), which they and Muelle
// edit together. This file keeps what the page decides pure so tests share it:
// the built-in layouts, the period bar as a board's period, which view opens.
import { COLS } from '@/tableros/board'

const row = (...cards) => cards
const card = (key, w, h) => ({ key, w, h })

/**
 * Muelle's own views. Each row is cards side by side on the 20-column grid,
 * `h` in grid rows (30 px). A card the site or the person does not have
 * leaves its row to the others (`vistaWidgets`).
 */
export const VISTAS = Object.freeze([
  {
    id: 'resumen',
    titulo: 'Resumen',
    icon: 'lucide-layout-dashboard',
    descripcion:
      'Lo que importa de un vistazo: ventas, margen, lo que te deben, la meta y lo que más se vendió.',
    filas: [
      row(
        card('ventas', 5, 10),
        card('margen', 5, 10),
        card('ticket_promedio', 5, 10),
        card('por_cobrar', 5, 10),
      ),
      row(card('tendencia', 20, 11)),
      row(card('meta', 10, 10), card('efectivo', 10, 10)),
      row(card('top_articulos', 10, 13), card('vendedores', 10, 13)),
      row(
        card('reparaciones', 5, 10),
        card('tratos', 5, 10),
        card('encuestas', 5, 10),
        card('devoluciones', 5, 10),
      ),
    ],
  },
  {
    id: 'ventas',
    titulo: 'Ventas',
    icon: 'lucide-shopping-bag',
    descripcion:
      'Qué se vendió, cuándo, en qué tienda, quién lo vendió y cómo se pagó.',
    filas: [
      row(
        card('ventas', 5, 10),
        card('tickets', 5, 10),
        card('ticket_promedio', 5, 10),
        card('promedio_diario', 5, 10),
      ),
      row(card('tendencia', 20, 11)),
      row(card('top_articulos', 10, 13), card('mix_grupos', 10, 13)),
      row(card('vendedores', 10, 13), card('tiendas', 10, 13)),
      row(card('por_hora', 10, 12), card('dia_semana', 10, 12)),
      row(card('hora_dia', 20, 12)),
      row(
        card('clientes', 5, 10),
        card('descuentos', 5, 10),
        card('devoluciones', 5, 10),
        card('cancelaciones', 5, 10),
      ),
    ],
  },
  {
    id: 'dinero',
    titulo: 'Dinero',
    icon: 'lucide-wallet',
    descripcion:
      'Margen, efectivo, lo que te deben, la meta y lo que se fue en descuentos, devoluciones y cancelaciones.',
    filas: [
      row(
        card('margen', 5, 11),
        card('efectivo', 5, 11),
        card('por_cobrar', 5, 11),
        card('meta', 5, 11),
      ),
      row(
        card('formas_pago', 10, 10),
        card('descuentos', 5, 10),
        card('devoluciones', 5, 10),
      ),
      row(card('tendencia', 20, 11)),
      row(
        card('ventas', 5, 10),
        card('cancelaciones', 5, 10),
        card('tiendas', 10, 10),
      ),
    ],
  },
])
export const DEFAULT_VISTA = 'resumen'

export function builtinVista(id) {
  return VISTAS.find((v) => v.id === id) || null
}

// The widget type a card is filed under when it becomes the person's own.
const CHARTS = new Set(['tendencia', 'por_hora', 'dia_semana', 'hora_dia'])
const LISTS = new Set([
  'tiendas',
  'mix_grupos',
  'top_articulos',
  'vendedores',
  'formas_pago',
])
export function cardTipo(key) {
  return CHARTS.has(key) ? 'grafica' : LISTS.has(key) ? 'lista' : 'numero'
}

/** Widths that keep their proportions and fill the row exactly. */
function fill(widths, columns = COLS) {
  const total = widths.reduce((sum, w) => sum + w, 0)
  let left = columns
  return widths.map((w, i) => {
    if (i === widths.length - 1) return left
    const share = Math.max(2, Math.round((w * columns) / total))
    left -= share
    return share
  })
}

/**
 * A built-in view as Tablero widgets for the cards in `present` (a Set of
 * card keys, or null while the board has not answered: every card). The id is
 * the card key; a fork drops it.
 */
export function vistaWidgets(vista, present = null) {
  const out = []
  let y = 0
  for (const cards of vista?.filas || []) {
    const shown = cards.filter((c) => !present || present.has(c.key))
    if (!shown.length) continue
    const widths = fill(shown.map((c) => c.w))
    const h = Math.max(...shown.map((c) => c.h))
    let x = 0
    shown.forEach((c, i) => {
      out.push({
        id: c.key,
        tipo: cardTipo(c.key),
        titulo: '',
        fuente: { id: `resultados.${c.key}`, params: {} },
        vista: {},
        layout: { x, y, w: widths[i], h },
      })
      x += widths[i]
    })
    y += h
  }
  return out
}

/** The widgets a person's copy of a built-in view starts with. */
export function forkWidgets(vista, present = null) {
  return vistaWidgets(vista, present).map((widget) => {
    const copy = { ...widget }
    delete copy.id
    return copy
  })
}

/** The title of a person's copy of a built-in view. */
export function copyTitle(vista) {
  return `Mi ${vista.titulo.toLowerCase()}`
}

/** The person's own copy of a built-in view, if they already made one. */
export function ownCopy(vista, boards) {
  const title = copyTitle(vista)
  return (boards || []).find((b) => b.mine && b.title === title) || null
}

/** What a built-in view's widget draws: the card as the board answered it. */
export function cardPayload(key, cards, out) {
  return {
    kind: 'card',
    key,
    card: cards[key] || null,
    currency: out?.currency || '',
    query: out?.query || null,
  }
}

/**
 * The card a widget draws when the page can draw it from its own board: a
 * Resultados card with no params of its own (it follows the page's period and
 * filters, so the page's one board call already holds it). '' otherwise.
 */
export function cardKeyOf(widget) {
  const id = widget?.tipo === 'custom' ? '' : widget?.fuente?.id || ''
  if (!id.startsWith('resultados.')) return ''
  const own = Object.values(widget.fuente.params || {}).some(
    (value) => value !== '' && value !== null && value !== undefined,
  )
  return own ? '' : id.slice('resultados.'.length)
}

// --- the period bar as a board's period ------------------------------------------
const PERIODO = {
  hoy: 'hoy',
  ayer: 'ayer',
  semana: 'esta_semana',
  mes: 'este_mes',
  mes_anterior: 'mes_pasado',
}

/**
 * The Resultados query (readQuery) as the arguments a Tablero's data reads
 * with: its period (a «rango» with its dates) and the page's filters, so a
 * person's view follows the same bar as Muelle's.
 */
export function boardDataArgs(state) {
  const args =
    state.periodo === 'rango'
      ? { periodo: 'rango', desde: state.desde, hasta: state.hasta }
      : { periodo: PERIODO[state.periodo] || 'este_mes' }
  const filtros = {}
  if (state.compara && state.compara !== 'anterior')
    filtros.compara = state.compara
  if (state.empresa) filtros.empresa = state.empresa
  if (state.tienda) filtros.tienda = state.tienda
  if (Object.keys(filtros).length) args.filtros = filtros
  return args
}

// --- which view opens -----------------------------------------------------------------
export const VISTA_KEY = 'muelle:resultados:vista'
const NAME = /^[A-Za-z0-9_-]{1,140}$/

export function cleanVista(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return NAME.test(text) ? text : ''
}

/**
 * The view to show: the link's, else the account's choice, else this
 * device's last one, else Muelle's default. A view that is gone (a deleted or
 * unshared board) is skipped. `boards` is null while the list is on its way:
 * a board name is then trusted.
 */
export function pickVista({ query, saved, local, boards }) {
  for (const value of [query, saved, local].map(cleanVista)) {
    if (!value) continue
    if (builtinVista(value)) return value
    if (!boards || boards.some((b) => b.name === value)) return value
  }
  return DEFAULT_VISTA
}

export function readVistaCopy(storage = globalThis.localStorage) {
  try {
    return cleanVista(storage?.getItem(VISTA_KEY) || '')
  } catch {
    return ''
  }
}

export function writeVistaCopy(value, storage = globalThis.localStorage) {
  try {
    if (value) storage?.setItem(VISTA_KEY, value)
    else storage?.removeItem(VISTA_KEY)
  } catch {
    // Private mode: the account still keeps the choice.
  }
}

/** The view tabs: Muelle's first, then the person's own, then the shared ones. */
export function vistaTabs(boards) {
  const own = (boards || []).filter((b) => b.mine)
  const shared = (boards || []).filter((b) => !b.mine)
  return [
    ...VISTAS.map((v) => ({
      value: v.id,
      label: v.titulo,
      icon: v.icon,
      builtin: true,
    })),
    ...own.map((b) => ({
      value: b.name,
      label: b.title,
      icon: 'lucide-layout-grid',
    })),
    ...shared.map((b) => ({
      value: b.name,
      label: b.title,
      icon: 'lucide-users',
      shared: true,
      owner: b.owner_name,
    })),
  ]
}
