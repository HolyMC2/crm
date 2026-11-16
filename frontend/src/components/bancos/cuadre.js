import { call } from 'frappe-ui'
import { LOCALE, formatDate } from '@/utils/display'
import { money, signedMoney } from './bancos'

// Cuadre (Shell DD19): does an account's books agree with its bank, and why
// not. Server: crm/api/bancos_cuadre.py (the arithmetic is crm/bancos_cuadre.py).
const SERVICE = 'crm.api.bancos_cuadre'

export function cuadreApi(method, args = {}) {
  const params = {}
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    params[key] = value
  }
  return call(`${SERVICE}.${method}`, params)
}

function plural(n, one, many) {
  return n === 1 ? `1 ${one}` : `${n} ${many}`
}

/** «mayo», «mayo, junio y julio 2026»: the months the bank has no movement in Muelle. */
export function monthsText(keys = [], now = new Date()) {
  if (!keys.length) return ''
  const names = keys.map((key) => {
    const [year, month] = key.split('-').map(Number)
    return {
      year,
      name: new Intl.DateTimeFormat(LOCALE, { month: 'long' }).format(
        new Date(year, month - 1, 15),
      ),
    }
  })
  const years = new Set(names.map((n) => n.year))
  const words =
    years.size === 1
      ? names.map((n) => n.name)
      : names.map((n) => `${n.name} ${n.year}`)
  const list =
    words.length === 1
      ? words[0]
      : `${words.slice(0, -1).join(', ')} y ${words[words.length - 1]}`
  const [only] = years
  return years.size === 1 && only !== now.getFullYear()
    ? `${list} ${only}`
    : list
}

/** The hero line under the balances: «Cuadra con el banco» or «No cuadra por $…». */
export function differenceText(diferencia, currency) {
  if (diferencia === null || diferencia === undefined) return ''
  if (Math.abs(Number(diferencia)) < 0.005) return 'Cuadra con el banco'
  return `No cuadra por ${money(Math.abs(Number(diferencia)), currency)}`
}

/**
 * The reasons as rows the sheet shows, in the order the worker fixes them:
 * what is already there twice, what the bank has, what the books have, then
 * the history. Each row: { key, icon, title, detail, amount, actions }.
 * `amount` is what the line adds to the difference (null: it adds nothing).
 */
export function cuadreRows(data, now = new Date()) {
  if (!data) return []
  const card = data.kind === 'tarjeta'
  const c = data.currency
  const rows = []
  for (const line of data.lines || []) {
    const n = line.count
    if (line.key === 'pares')
      rows.push({
        key: 'pares',
        icon: 'lucide-link',
        title:
          n === 1
            ? '1 movimiento ya está en tus libros'
            : `${n} movimientos ya están en tus libros`,
        detail:
          'Mismo importe y fecha cercana: solo falta ligarlos. No cambian la diferencia.',
        amount: null,
        actions: ['ligar'],
      })
    else if (line.key === 'solo_banco')
      rows.push({
        key: 'solo_banco',
        icon: 'lucide-landmark',
        title: card
          ? `${plural(n, 'cargo o pago', 'cargos y pagos')} de la tarjeta sin registrar`
          : `${plural(n, 'movimiento', 'movimientos')} del banco sin registrar`,
        detail: card
          ? 'La tarjeta los tiene y tus libros no: compras, pagos, intereses o comisiones.'
          : 'El banco los tiene y tus libros no: transferencias, depósitos o comisiones.',
        amount: line.effect,
        actions: ['ver_banco', 'explicar'],
      })
    else if (line.key === 'conexion')
      rows.push({
        key: 'conexion',
        icon: 'lucide-refresh-cw',
        title: `${plural(n, 'movimiento', 'movimientos')} de la conexión sin pasar a Bancos`,
        detail:
          'Detenidos para revisión, descartados, o el banco los quitó después.',
        amount: line.effect,
        actions: data.conexion ? ['ver_conexion'] : [],
      })
    else if (line.key === 'solo_libros')
      rows.push({
        key: 'solo_libros',
        icon: 'lucide-book-open',
        title: `${plural(n, 'registro', 'registros')} sin movimiento del banco`,
        detail:
          'Pagos y pólizas de esta cuenta que el banco no muestra: otra cuenta, otra fecha o uno de más.',
        amount: line.effect,
        actions: ['ver_libros'],
      })
    else if (line.key === 'antes') {
      const before = data.before
      const loose = before?.count
        ? ` Además hay ${plural(before.count, 'movimiento suelto', 'movimientos sueltos')} del ${formatDate(before.from, { now, relative: false })} al ${formatDate(before.to, { now, relative: false })}.`
        : ''
      rows.push({
        key: 'antes',
        icon: 'lucide-history',
        title: `Antes del ${formatDate(data.start, { now, relative: false })}`,
        detail: data.opening
          ? `Muelle no tiene movimientos del banco de antes. El banco ${card ? 'marcaba' : 'tenía'} ${money(data.opening.bank, c)} y tus libros ${money(data.opening.books, c)}: falta el saldo inicial o los estados de cuenta de antes.${loose}`
          : `Muelle no tiene movimientos del banco de antes.${loose}`,
        amount: line.effect,
        actions: [],
      })
    } else if (line.key === 'faltan')
      rows.push({
        key: 'faltan',
        icon: 'lucide-circle-help',
        title: 'Movimientos del banco que Muelle no tiene',
        detail: data.start
          ? 'El banco se movió después de su último movimiento en Muelle. Conecta el banco o sube los estados de cuenta que faltan.'
          : 'Muelle no tiene movimientos de esta cuenta. Conecta el banco o sube su estado de cuenta.',
        amount: line.effect,
        actions: [],
      })
    else if (line.key === 'otros')
      rows.push({
        key: 'otros',
        icon: 'lucide-triangle-alert',
        title: 'Sin explicar',
        detail:
          'Movimientos ligados cuyo importe no coincide con lo registrado en esta cuenta.',
        amount: line.effect,
        actions: [],
      })
  }
  return rows
}

/** «+$8,093.55» for what a line adds to the difference. */
export function effectText(amount, currency) {
  return amount === null || amount === undefined
    ? ''
    : signedMoney(amount, currency)
}

/** The pairs that can be linked from the shell, in the payload `ligar` takes. */
export function linkable(pairs = []) {
  return pairs
    .filter((pair) => pair.ligable)
    .map((pair) => ({
      movimiento: pair.movimiento.name,
      doctype: pair.registro.doctype,
      name: pair.registro.name,
    }))
}

/** The question the assistant gets for a line it can work on. */
export function askText(key, label) {
  if (key === 'solo_banco')
    return `Explícame los movimientos del banco sin registrar de ${label} y ayúdame a registrarlos.`
  return `¿Por qué no cuadra ${label} con el banco?`
}
