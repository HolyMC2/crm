import { call } from 'frappe-ui'

// «¿Ya llegó?» (crm docs/DINERO_EN_ORDEN.md §3e). Server: doco.workspaces.transferencias
// (doco/docoutils/spei: Banxico's CEP, the check's states, bank movements).
const SERVICE = 'doco.workspaces.transferencias'

export function transferenciasApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] = typeof value === 'object' ? JSON.stringify(value) : value
  }
  return call(`${SERVICE}.${method}`, params)
}

/** The server's states, in the worker's words and colours. */
export const ESTADOS = Object.freeze({
  Searching: { label: 'Buscando', tone: 'warning', icon: 'lucide-landmark' },
  Arrived: { label: 'Llegó', tone: 'success', icon: 'lucide-circle-check' },
  'Does not match': {
    label: 'No coincide',
    tone: 'danger',
    icon: 'lucide-circle-x',
  },
  'Not found': {
    label: 'No aparece',
    tone: 'danger',
    icon: 'lucide-circle-alert',
  },
  Discarded: {
    label: 'Descartada',
    tone: 'neutral',
    icon: 'lucide-circle-minus',
  },
})

export function estadoDe(value) {
  return ESTADOS[value] || ESTADOS.Searching
}

/** The list's views: «Todas» leads (FilterChips puts '' first). */
export function filtroChips(resumen = {}) {
  return [
    { value: '', label: 'Todas' },
    {
      value: 'Searching',
      label: 'Buscando',
      count: resumen.buscando || undefined,
    },
    {
      value: 'Arrived',
      label: 'Llegaron',
      count: resumen.llegaron || undefined,
    },
    {
      value: 'sin_venta',
      label: 'Sin venta',
      count: resumen.sin_venta || undefined,
    },
    {
      value: 'Not found',
      label: 'No aparecen',
      count: resumen.no_aparecen || undefined,
    },
    {
      value: 'Does not match',
      label: 'No coinciden',
      count: resumen.no_coinciden || undefined,
    },
  ]
}

export const PERIODOS = Object.freeze([
  { value: 'hoy', label: 'Hoy' },
  { value: 'ayer', label: 'Ayer' },
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
])

function iso(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Today on this device, «2026-11-17» (not UTC: after 5 p.m. in Mazatlán UTC is already tomorrow). */
export function hoyIso(now = new Date()) {
  return iso(now)
}

/** {desde, hasta} for a period, from the device's today (the site's day for the person there). */
export function rango(periodo, today = new Date()) {
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const back = (n) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate() - n)
  if (periodo === 'ayer') return { desde: iso(back(1)), hasta: iso(back(1)) }
  if (periodo === '7') return { desde: iso(back(6)), hasta: iso(day) }
  if (periodo === '30') return { desde: iso(back(29)), hasta: iso(day) }
  return { desde: iso(day), hasta: iso(day) }
}

const MESES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

/** «Hoy», «Ayer», «mar 11 nov». */
export function diaTexto(value, today = new Date()) {
  if (!value) return ''
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((base - date) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  const wd = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][date.getDay()]
  return `${wd} ${d} ${MESES[m - 1]}`
}

/** Rows grouped by their day, newest first, for the list's day headers. */
export function porDia(filas = []) {
  const groups = []
  for (const fila of filas) {
    const last = groups[groups.length - 1]
    if (last && last.fecha === fila.fecha) last.filas.push(fila)
    else groups.push({ fecha: fila.fecha, filas: [fila] })
  }
  return groups
}

const BANCOS_CORTOS = Object.freeze({
  'BBVA MEXICO': 'BBVA',
  'BBVA BANCOMER': 'BBVA',
  'Mercado Pago W': 'Mercado Pago',
  NUBANK: 'Nu',
  AZTECA: 'Azteca',
  BANCOPPEL: 'BanCoppel',
  'SPIN BY OXXO': 'Spin',
  'HEY BANCO': 'Hey Banco',
  HSBC: 'HSBC',
  STP: 'STP',
  KLAR: 'Klar',
  UALA: 'Ualá',
  BAJIO: 'BanBajío',
})

/** Banxico's participant name as people say it: «BBVA MEXICO» → «BBVA», «BANAMEX» → «Banamex». */
export function bancoCorto(nombre) {
  const text = String(nombre || '').trim()
  if (BANCOS_CORTOS[text]) return BANCOS_CORTOS[text]
  return text.length > 4 && text === text.toUpperCase() ? titleCase(text) : text
}

/** «Banamex», or «Banamex → BBVA •9775» when the shop receives in more than one account. */
export function rutaTexto(fila, { unaCuenta = false } = {}) {
  const from = bancoCorto(fila.banco_emisor)
  if (unaCuenta) return from
  const to = fila.cuenta?.ultimos
    ? `${bancoCorto(fila.cuenta.banco) || fila.cuenta.nombre} ${fila.cuenta.ultimos}`
    : fila.cuenta?.nombre || ''
  return [from, to].filter(Boolean).join(' → ')
}

/** Who sent it; a check still searching has no name yet. */
export function quienTexto(fila) {
  if (fila.ordenante) return titleCase(fila.ordenante)
  if (fila.estado === 'Searching') return 'Aún sin nombre'
  return 'Sin nombre'
}

export function titleCase(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/(^|[\s.'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y)\b/g, (w) => w.toLowerCase())
}

/** The line under the amount: the sale it paid, or what still needs someone. */
export function ventaTexto(fila) {
  if (fila.estado === 'Searching') return 'Buscando'
  if (fila.estado === 'Not found') return 'No aparece'
  if (fila.estado === 'Does not match') return 'No coincide'
  if (fila.venta) return fila.venta.name
  if (fila.propia) return 'Entre tus cuentas'
  if (fila.estado === 'Arrived') return 'Sin venta'
  return ''
}

/** Its colour: amber while it waits or lacks a sale, red when it did not arrive. */
export function ventaTono(fila) {
  if (fila.estado === 'Not found' || fila.estado === 'Does not match')
    return 'text-ink-red-7'
  if (fila.estado === 'Searching' || fila.sin_venta) return 'text-ink-amber-8'
  return 'text-ink-gray-6'
}

/** Seconds since a check started, as the counter reads it: «8 s», «1 min 20 s», «12 min». */
export function transcurrido(desde, ahora = Date.now()) {
  const start = new Date(String(desde || '').replace(' ', 'T')).getTime()
  if (!Number.isFinite(start)) return ''
  const s = Math.max(0, Math.round((ahora - start) / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 5) return `${m} min ${s % 60} s`
  return `${m} min`
}

/** A form ready for Banxico: amount, sending bank, and a tracking key or a reference. */
export function faltaParaRevisar(form, { mismoBanco = false } = {}) {
  if (!(Number(form.monto) > 0)) return 'Escribe el monto de la transferencia.'
  if (!form.banco_emisor) return '¿De qué banco o app la enviaron?'
  if (mismoBanco) return ''
  const clave = String(form.clave_rastreo || '').replace(/\s/g, '')
  const ref = String(form.referencia || '').replace(/\D/g, '')
  if (!clave && !ref)
    return 'Falta la clave de rastreo (o la referencia numérica) del comprobante.'
  if (clave && !/^[A-Za-z0-9]{1,30}$/.test(clave))
    return 'La clave de rastreo solo lleva letras y números.'
  if (!clave && ref.length > 7)
    return 'La referencia numérica tiene hasta 7 dígitos.'
  return ''
}

/** CLABE: 18 digits whose last one checks the rest (weights 3, 7, 1). */
export function clabeValida(value) {
  const digits = String(value || '').replace(/[\s-]/g, '')
  if (!/^\d{18}$/.test(digits)) return false
  const weights = [3, 7, 1]
  let sum = 0
  for (let i = 0; i < 17; i++) sum += (Number(digits[i]) * weights[i % 3]) % 10
  return (10 - (sum % 10)) % 10 === Number(digits[17])
}

/** «0127 4401 5234 3697 75» while typing a CLABE. */
export function clabeEnGrupos(value) {
  const digits = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 18)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}
