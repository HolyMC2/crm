// Tableros (doco docs/TABLEROS.md): saved boards the person and Muelle edit
// together. doco owns the board (doco.tableros.api) and resolves every
// widget's data for the viewer; this file keeps what the page decides pure so
// tests share it: the grid, the colours, the operations a gesture becomes and
// the locked box a custom widget runs in.
import { comprasApi } from '@/composables/useCompras'

const SERVICE = 'doco.tableros.api'
export const HOME = '/tableros'
/** The board's grid (schema.COLS) and one row's height in px. */
export const COLS = 20
export const ROW_PX = 30

/** POST to the Tableros API; a refusal keeps the server's message and type. */
export function tablerosApi(method, args = {}) {
  return comprasApi(`${SERVICE}.${method}`, args)
}

export const PERIODOS = Object.freeze([
  { value: 'hoy', label: 'Hoy' },
  { value: 'ayer', label: 'Ayer' },
  { value: 'esta_semana', label: 'Esta semana' },
  { value: 'semana_pasada', label: 'Semana pasada' },
  { value: 'ultimos_7_dias', label: 'Últimos 7 días' },
  { value: 'ultimos_30_dias', label: 'Últimos 30 días' },
  { value: 'ultimos_90_dias', label: 'Últimos 90 días' },
  { value: 'este_mes', label: 'Este mes' },
  { value: 'mes_pasado', label: 'Mes pasado' },
  { value: 'este_trimestre', label: 'Este trimestre' },
  { value: 'este_año', label: 'Este año' },
  { value: 'año_pasado', label: 'Año pasado' },
])
/** The four a phone shows as chips; the rest live in the period sheet. */
export const PERIODOS_CORTOS = ['hoy', 'esta_semana', 'este_mes', 'mes_pasado']

export function periodoLabel(value) {
  return PERIODOS.find((p) => p.value === value)?.label || 'Este mes'
}

/** schema.COLORES: the named colours, as the swatches show them. */
export const COLORES = Object.freeze([
  { name: 'azul', hex: '#2a78d6', label: 'Azul' },
  { name: 'naranja', hex: '#eb6834', label: 'Naranja' },
  { name: 'verde', hex: '#1baf7a', label: 'Verde' },
  { name: 'ambar', hex: '#eda100', label: 'Ámbar' },
  { name: 'rosa', hex: '#e87ba4', label: 'Rosa' },
  { name: 'bosque', hex: '#008300', label: 'Bosque' },
  { name: 'morado', hex: '#6250d6', label: 'Morado' },
  { name: 'rojo', hex: '#e34948', label: 'Rojo' },
  { name: 'gris', hex: '#898781', label: 'Gris' },
])
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** A colour the shell may paint (a named one or a hex), else ''. */
export function safeColor(value) {
  const text = String(value || '')
    .trim()
    .toLowerCase()
  const named = COLORES.find((c) => c.name === text)
  if (named) return named.hex
  return HEX.test(text) ? text : ''
}

export const TIPOS = Object.freeze([
  { value: 'grafica', label: 'Gráfica', icon: 'lucide-chart-column' },
  { value: 'numero', label: 'Número', icon: 'lucide-hash' },
  { value: 'tabla', label: 'Tabla', icon: 'lucide-table' },
  { value: 'lista', label: 'Lista', icon: 'lucide-list' },
  { value: 'nota', label: 'Nota', icon: 'lucide-sticky-note' },
  { value: 'custom', label: 'A la medida', icon: 'lucide-code' },
])
export const KINDS = Object.freeze([
  { value: 'bar', label: 'Barras' },
  { value: 'line', label: 'Líneas' },
  { value: 'stacked', label: 'Apiladas' },
  { value: 'donut', label: 'Dona' },
])
export const SIZES = Object.freeze([
  { value: 's', label: 'Chico', w: 5, h: 4 },
  { value: 'm', label: 'Mediano', w: 10, h: 8 },
  { value: 'l', label: 'Ancho', w: 20, h: 9 },
])

export function tipoOf(widget) {
  return TIPOS.find((t) => t.value === widget?.tipo) || TIPOS[0]
}

/** The size chip a widget's layout reads as, or '' when it was resized by hand. */
export function sizeOf(layout) {
  return SIZES.find((s) => s.w === layout?.w && s.h === layout?.h)?.value || ''
}

// --- the grid ------------------------------------------------------------------

/** grid-layout-plus items for the widgets: { i, x, y, w, h, minW, minH }. */
export function gridOf(widgets) {
  return (widgets || []).map((w) => ({
    i: w.id,
    x: w.layout?.x ?? 0,
    y: w.layout?.y ?? 0,
    w: w.layout?.w ?? 10,
    h: w.layout?.h ?? 8,
    minW: 2,
    minH: 2,
  }))
}

/** The `mover` operations a drag or a resize became (only what moved). */
export function moveOps(widgets, grid) {
  const at = new Map((grid || []).map((g) => [g.i, g]))
  const ops = []
  for (const w of widgets || []) {
    const g = at.get(w.id)
    if (!g) continue
    const layout = { x: g.x, y: g.y, w: g.w, h: g.h }
    const was = w.layout || {}
    if (['x', 'y', 'w', 'h'].some((k) => layout[k] !== was[k]))
      ops.push({ op: 'mover', id: w.id, layout })
  }
  return ops
}

/** A phone reads the board in one column: top to bottom, then left to right. */
export function readingOrder(widgets) {
  return [...(widgets || [])].sort(
    (a, b) =>
      (a.layout?.y ?? 0) - (b.layout?.y ?? 0) ||
      (a.layout?.x ?? 0) - (b.layout?.x ?? 0),
  )
}

/** A widget's height on a phone, from its rows (a number stays short). */
export function phoneHeight(widget) {
  if (widget.tipo === 'numero') return null
  const rows = Math.max(4, Math.min(widget.layout?.h ?? 8, 14))
  return rows * ROW_PX
}

// --- data ------------------------------------------------------------------------

/** The chart a payload draws, with the widget's own kind and title. */
export function chartFor(widget, payload) {
  const chart = payload?.kind === 'chart' ? payload.chart : null
  if (!chart) return null
  const kind = widget?.vista?.kind
  return {
    ...chart,
    kind: kind || chart.kind,
    title: '',
    subtitle: '',
    table: chart.table || payload.table || null,
  }
}

/** A payload as rows: a table, a chart's table twin, a card's items. */
export function rowsFor(payload) {
  if (!payload) return null
  if (payload.kind === 'table')
    return { columns: payload.columns || [], rows: payload.rows || [] }
  if (payload.kind === 'chart') {
    const table = payload.chart?.table || payload.table
    if (table?.columns)
      return { columns: table.columns, rows: table.rows || [] }
    const chart = payload.chart || {}
    return {
      columns: ['', ...(chart.series || []).map((s) => s.name || '')],
      rows: (chart.labels || []).map((label, row) => [
        label,
        ...(chart.series || []).map((s) => s.values?.[row]),
      ]),
    }
  }
  if (payload.kind === 'card') {
    const items = payload.card?.items || []
    return {
      columns: ['', ''],
      rows: items.map((item) => [item.label, item.value_text ?? item.value]),
    }
  }
  return null
}

// --- operations --------------------------------------------------------------------

/** A widget the page adds from a source: its size by kind; with no x and y
 * the board puts it under everything else. */
export function newWidget(tipo, fuente, titulo = '') {
  const size = tipo === 'numero' || tipo === 'nota' ? SIZES[0] : SIZES[1]
  const out = { tipo, titulo, layout: { w: size.w, h: size.h } }
  if (tipo === 'nota') out.texto = ''
  else if (tipo === 'custom')
    Object.assign(out, {
      codigo: { html: '', css: '', js: '' },
      fuentes: fuente ? [{ alias: 'datos', ...fuente }] : [],
    })
  else out.fuente = fuente
  return out
}

/** What changed between the widget on the board and the editor's draft. */
export function editOps(before, draft) {
  const campos = {}
  for (const key of [
    'titulo',
    'tipo',
    'vista',
    'fuente',
    'texto',
    'codigo',
    'fuentes',
    'layout',
  ]) {
    if (draft[key] === undefined) continue
    if (JSON.stringify(draft[key]) !== JSON.stringify(before[key]))
      campos[key] = draft[key]
  }
  // vista is merged on the server: a cleared field must be sent as empty.
  if (campos.vista)
    for (const key of Object.keys(before.vista || {}))
      if (!(key in campos.vista)) campos.vista[key] = ''
  return Object.keys(campos).length
    ? [{ op: 'editar', id: before.id, campos }]
    : []
}

// --- the locked box ----------------------------------------------------------------

/** A path a custom widget may ask the page to open: inside Muelle or the Desk. */
export function safeOpenPath(value) {
  const path = String(value || '').trim()
  if (!/^\/(crm|app)\//.test(path)) return ''
  if (/[\s\\]|\/\/|^\/[^/]*:/.test(path)) return ''
  return path
}

/** The CSP the box's document carries: inline only, no network, no forms. */
export const BOX_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'"

// The bridge the widget's own script talks to. Its only way out is
// postMessage to the page, which reads `muelle:height` and `muelle:open`.
const BRIDGE = `
(function () {
  var handlers = [], last = null;
  function post(type, value) { parent.postMessage({ type: type, value: value }, '*'); }
  window.muelle = {
    onData: function (fn) { handlers.push(fn); if (last) fn(last.data, last.theme); },
    open: function (path) { post('muelle:open', String(path || '')); },
    resize: function () { post('muelle:height', document.documentElement.scrollHeight); }
  };
  window.addEventListener('message', function (event) {
    if (event.source !== parent || !event.data || event.data.type !== 'muelle:data') return;
    last = event.data;
    document.documentElement.dataset.theme = last.theme || 'light';
    for (var i = 0; i < handlers.length; i++) {
      try { handlers[i](last.data, last.theme); } catch (error) { console.error(error); }
    }
    window.muelle.resize();
  });
  window.addEventListener('error', function (event) { post('muelle:error', String(event.message || '')); });
})();
`

const BASE_CSS = `
:root { color-scheme: light dark; font-family: system-ui, sans-serif; font-size: 14px; }
html, body { margin: 0; padding: 0; background: transparent; color: var(--ink, #171717); }
[data-theme="dark"] { --ink: #f5f5f5; }
`

/** `</script>` inside the widget's code would close the tag early. */
function inert(text) {
  return String(text || '').replace(/<\/(script|style)/gi, '<\\/$1')
}

/** The whole document a custom widget runs in (iframe srcdoc). */
export function boxDocument(codigo) {
  const c = codigo || {}
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${BOX_CSP}">`,
    `<style>${BASE_CSS}</style>`,
    `<style>${inert(c.css)}</style>`,
    `<script>${BRIDGE}</script>`,
    '</head><body>',
    String(c.html || ''),
    `<script>${inert(c.js)}</script>`,
    '</body></html>',
  ].join('')
}

// --- the assistant ------------------------------------------------------------------

/** The prompt «Pídeselo a Muelle» starts with, about this board. */
export function askPrompt(board, widget = null) {
  if (widget)
    return `En el tablero «${board.title}», el widget «${widget.titulo || tipoOf(widget).label}» (${widget.id}): `
  return `En este tablero («${board.title}»): `
}
