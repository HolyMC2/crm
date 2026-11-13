// «Importar productos» and «Importar clientes»: the owner's own sheet into
// Muelle without the Desk. The server (crm.api.importar) runs doco's importer,
// the one the assistant uses: it reads the file, maps the columns, plans each
// row, writes them as the person and keeps the import so «Deshacer» takes it
// back. These are its endpoints and the pure helpers the page shows them with.
import { call } from 'frappe-ui'
import { formatMoney } from '@/utils/display'

// English source strings; the es-MX catalog (crm/locale/es.po) translates them.
const CTX = 'Importar'
const t = (text, replace) =>
  globalThis.window?.__
    ? globalThis.window.__(text, replace, CTX)
    : replace
      ? text.replace(/{(\d+)}/g, (match, index) => replace[index] ?? match)
      : text

export const KINDS = Object.freeze(['productos', 'clientes'])
export const ACCEPT = '.xlsx,.xlsm,.xls,.csv'
const SHEET = /\.(xlsx|xlsm|xls|csv)$/i
const MB = 1024 * 1024
/** The field that names each row, shown as the row's title. */
const NAME_FIELD = { productos: 'item_name', clientes: 'customer_name' }
const MONEY_FIELDS = new Set(['rate', 'cost'])

export function importarApi(method, args = {}) {
  return call(`crm.api.importar.${method}`, args)
}

/** The empty template, downloaded with the person's session. */
export function plantillaHref(que) {
  return `/api/method/crm.api.importar.plantilla?que=${encodeURIComponent(que)}`
}

/** The refused rows of a review, with why, as a sheet to fix and upload again. */
export function erroresHref(vista) {
  return `/api/method/crm.api.importar.filas_con_error?vista=${encodeURIComponent(vista)}`
}

/** Why this file cannot be sent, or '' (the server checks it again). */
export function fileProblem(file, opciones = {}) {
  if (!file) return t('Choose a file.')
  if (!SHEET.test(file.name || ''))
    return t(
      '«{0}» is not a spreadsheet. Choose an .xlsx, .xls or .csv file.',
      [file.name],
    )
  if (!file.size) return t('«{0}» is empty.', [file.name])
  const limit = Number(opciones?.limite_mb) || 10
  if (file.size > limit * MB)
    return t('«{0}» is bigger than {1} MB. Split it into smaller files.', [
      file.name,
      limit,
    ])
  return ''
}

/** The server's own sentence in a refused upload (the site's size or type rule), or ''. */
function serverSentence(data) {
  try {
    const first = JSON.parse(data?._server_messages || '[]')[0]
    const message = typeof first === 'string' ? JSON.parse(first).message : ''
    return String(message || '')
      .replace(/<[^>]+>/g, '')
      .trim()
  } catch {
    return ''
  }
}

/** Upload the sheet as a private file of the person → the File's id. */
export async function uploadSheet(file) {
  const body = new FormData()
  body.append('file', file, file.name)
  body.append('is_private', '1')
  const headers = { Accept: 'application/json' }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
    headers['X-Frappe-CSRF-Token'] = window.csrf_token
  const response = await fetch('/api/method/upload_file', {
    method: 'POST',
    headers,
    body,
  })
  const data = await response.json().catch(() => ({}))
  const id = data.message?.name || data.message?.file_url
  if (!response.ok || !id) {
    const error = new Error(
      response.status === 413
        ? t('The file is too big to upload. Split it into smaller files.')
        : serverSentence(data) || t('The file did not upload. Try again.'),
    )
    error.status = response.status
    throw error
  }
  return id
}

// ── the columns ─────────────────────────────────────────────────────────────

/** The column each field takes in a review, {field: column index}. */
export function choicesOf(review) {
  const out = {}
  for (const campo of review?.campos || [])
    if (Number.isInteger(campo.columna)) out[campo.campo] = campo.columna
  return out
}

const sameColumn = (choices) =>
  Number.isInteger(choices.item_code) && choices.item_code === choices.item_name

/** `campo` takes `columna`; whatever field had that column lets it go. A
 *  product's name used as its code moves with the name. */
export function chooseColumn(choices, campo, columna) {
  const next = { ...choices }
  const index = Number(columna)
  if (columna === '' || columna === null || !Number.isInteger(index))
    return next
  const linked = sameColumn(choices) && campo === 'item_name'
  for (const [other, at] of Object.entries(next))
    if (at === index && other !== campo) delete next[other]
  next[campo] = index
  if (linked) next.item_code = index
  return next
}

/** A sheet without codes: each product's name is its code. */
export function nameAsCode(choices) {
  if (!Number.isInteger(choices?.item_name)) return { ...choices }
  return { ...choices, item_code: choices.item_name }
}

/** Whether to offer the name as the code next to the rows with errors:
 *  products refused for want of a code (the template's «Código» left empty,
 *  as its note says) while a column has their name. A missing code column
 *  offers it in the column list instead. */
export function offersNameAsCode(review) {
  if (review?.que !== 'productos' || review.nombre_como_codigo) return false
  if (!(Number(review.sin_codigo) > 0)) return false
  return (review.campos || []).some(
    (campo) => campo.campo === 'item_name' && Number.isInteger(campo.columna),
  )
}

/** «Ver las 12» when every row with an error came, «Ver 100 de 412» when
 *  the server sent the first ones only (the download has them all). */
export function moreErrorsLabel(review) {
  const shown = review?.errores?.length || 0
  const total = Number(review?.cuentas?.errores) || shown
  return shown < total
    ? t('See {0} of {1}', [shown.toLocaleString(), total.toLocaleString()])
    : t('See all {0}', [total.toLocaleString()])
}

/** The name stops being the code: the code is looked for again. */
export function dropNameAsCode(choices) {
  const next = { ...choices }
  if (sameColumn(next)) delete next.item_code
  return next
}

export function columnLabel(columna) {
  if (!columna) return ''
  return columna.titulo
    ? t('«{0}» (column {1})', [columna.titulo, columna.letra])
    : t('Column {0}', [columna.letra])
}

/** A field's select: every column of the sheet, by its title and letter. */
export function columnOptions(review, campo) {
  const options = (review?.columnas || []).map((columna) => ({
    value: String(columna.indice),
    label: columnLabel(columna),
  }))
  return Number.isInteger(campo?.columna)
    ? options
    : [{ value: '', label: t('Choose a column') }, ...options]
}

/** The fields as the page lists them: the column each reads and an example. */
export function fieldRows(review) {
  const columnas = new Map(
    (review?.columnas || []).map((columna) => [columna.indice, columna]),
  )
  return (review?.campos || []).map((campo) => {
    const columna = columnas.get(campo.columna)
    return {
      ...campo,
      value: Number.isInteger(campo.columna) ? String(campo.columna) : '',
      falta: campo.obligatorio && !columna,
      ejemplo: columna?.muestra?.[0] || '',
    }
  })
}

const labelOf = (review, name) =>
  (review?.campos || []).find((campo) => campo.campo === name)?.etiqueta || name

/** The questions the mapper left open, each with its answers as choices. */
export function questions(review) {
  return (review?.dudas || []).map((duda, index) => {
    if (duda.tipo === 'ambigua')
      return {
        key: `ambigua-${duda.columna}`,
        text: t('Is «{0}» {1} or {2}?', [
          duda.titulo,
          labelOf(review, duda.campos[0]),
          labelOf(review, duda.campos[1]),
        ]),
        options: duda.campos.map((campo) => ({
          label: labelOf(review, campo),
          campo,
          columna: duda.columna,
        })),
      }
    return {
      key: `repetida-${duda.campo}-${index}`,
      text: t('Several columns could be {0}. Which one?', [
        labelOf(review, duda.campo),
      ]),
      options: duda.columnas.map((columna, at) => ({
        label: `«${duda.titulos[at]}»`,
        campo: duda.campo,
        columna,
      })),
    }
  })
}

// ── what the review says ────────────────────────────────────────────────────

/** The counts of a review, the rows that go in first. */
export function countsOf(review) {
  const cuentas = review?.cuentas || {}
  const productos = review?.que === 'productos'
  const lines = []
  if (cuentas.nuevas)
    lines.push({
      key: 'nuevas',
      value: cuentas.nuevas,
      text: productos ? t('new products') : t('new customers'),
    })
  if (cuentas.actualizar)
    lines.push({
      key: 'actualizar',
      value: cuentas.actualizar,
      text: t('already exist and are updated'),
    })
  if (cuentas.existentes)
    lines.push({
      key: 'existentes',
      value: cuentas.existentes,
      text: t('already exist and are left as they are'),
    })
  if (cuentas.repetidas)
    lines.push({
      key: 'repetidas',
      value: cuentas.repetidas,
      text: t('repeat an earlier row of the sheet'),
    })
  if (cuentas.errores)
    lines.push({
      key: 'errores',
      value: cuentas.errores,
      text: t('have an error and are not imported'),
      tone: 'warn',
    })
  return lines
}

/** «Importar 412 productos», the review's one primary action («Importar»
 *  while no row goes in: never «Importar 0»). */
export function importLabel(review) {
  const n = Number(review?.por_importar) || 0
  if (!n) return t('Import')
  if (review?.que === 'clientes')
    return n === 1 ? t('Import 1 customer') : t('Import {0} customers', [n])
  return n === 1 ? t('Import 1 product') : t('Import {0} products', [n])
}

/** Why «Importar» waits, or '' when it can go. */
export function importBlocker(review) {
  if (!review) return ''
  if (review.bloqueos?.length) return review.bloqueos[0]
  if (review.faltan?.length)
    return t('Choose the column of {0}.', [
      review.faltan.map((name) => labelOf(review, name)).join(', '),
    ])
  if (!review.por_importar)
    return offersNameAsCode(review)
      ? t(
          'Tap «My products have no code: use the name», or fill in the codes in your sheet.',
        )
      : t('No row is new or to update, so there is nothing to import.')
  return ''
}

function shown(campo, valor, moneda) {
  if (valor === null || valor === undefined || valor === '') return ''
  if (MONEY_FIELDS.has(campo) && typeof valor === 'number')
    return formatMoney(valor, moneda || undefined)
  if (typeof valor === 'number')
    return valor.toLocaleString(undefined, { maximumFractionDigits: 3 })
  return String(valor)
}

/** The first rows as they will be imported: the name, then the rest in words. */
export function sampleRows(review) {
  const nameField = NAME_FIELD[review?.que] || ''
  return (review?.muestra || []).map((row) => {
    const parts = []
    let titulo = ''
    for (const { campo, valor } of row.valores || []) {
      const text = shown(campo, valor, review.moneda)
      if (!text) continue
      if (campo === nameField) titulo = text
      else if (!(campo === 'item_code' && review.nombre_como_codigo))
        parts.push(`${labelOf(review, campo)}: ${text}`)
    }
    return {
      fila: row.fila,
      titulo: titulo || t('Row {0}', [row.fila]),
      detalle: parts.join(', '),
      actualiza: row.accion === 'actualizar',
    }
  })
}

// ── the import ──────────────────────────────────────────────────────────────

/** How far a background import went. */
export function progressOf(estado) {
  const total = Number(estado?.total) || 0
  const done = Math.min(Number(estado?.hechas) || 0, total || Infinity)
  return {
    pct: total ? Math.round((done / total) * 100) : 0,
    text: total
      ? t('{0} of {1} rows', [done.toLocaleString(), total.toLocaleString()])
      : t('Starting…'),
  }
}

const STATUS = {
  'En curso': 'Importing',
  Importado: 'Imported',
  Parcial: 'Imported in part',
  Fallido: 'Not imported',
  Deshecho: 'Undone',
}

export function statusLabel(estado) {
  return STATUS[estado] ? t(STATUS[estado]) : ''
}

/** What an import did once it ended: a heading and its lines. */
export function summaryOf(estado) {
  if (!estado) return { titulo: '', lineas: [] }
  const productos = estado.que === 'productos'
  if (estado.estado === 'Deshecho')
    return {
      titulo: t('Import undone'),
      lineas: estado.deshecha ? [estado.deshecha] : [],
    }
  const lineas = []
  if (estado.creadas)
    lineas.push(
      productos
        ? t('{0} new products', [estado.creadas])
        : t('{0} new customers', [estado.creadas]),
    )
  if (estado.actualizadas) lineas.push(t('{0} updated', [estado.actualizadas]))
  if (estado.omitidas)
    lineas.push(t('{0} left as they were', [estado.omitidas]))
  if (estado.fallidas) lineas.push(t('{0} rows failed', [estado.fallidas]))
  const titulo = estado.detenida
    ? t('The import stopped')
    : estado.estado === 'Fallido'
      ? t('Nothing was imported')
      : estado.estado === 'Parcial'
        ? t('Imported in part')
        : t('Imported')
  return { titulo, lineas }
}

// ── A SICAR products export (crm.api.importar `sicar`) ─────────────────────

/** What the products that carry no IVA in SICAR may take; '' keeps the company's. */
export function noIvaChoices() {
  return [
    { value: '', label: t("Your company's IVA, as today") },
    { value: '0', label: t('IVA 0%') },
    { value: 'exento', label: t('Exempt') },
  ]
}

/** Where the tax rates come from, in one sentence. */
export function taxLine(review) {
  const file = review?.sicar?.impuestos?.archivo
  return file
    ? t('The tax rates come from «{0}».', [file])
    : t(
        'SICAR keeps its prices without tax. Add ImpuestosExportados.xls to take its exact rates; without it they are read from the prices.',
      )
}

/** The question about the products that carry no IVA in SICAR, or '' when there are none. */
export function noIvaQuestion(review) {
  const n = Number(review?.sicar?.sin_iva?.productos) || 0
  if (!n) return ''
  return n === 1
    ? t('1 product carries no IVA in SICAR. How does it go in?')
    : t('{0} products carry no IVA in SICAR. How do they go in?', [n])
}

/** The keys checkbox's label, or '' when the shop's registers cannot take them. */
export function keysLabel(review) {
  const n = Number(review?.sicar?.teclas?.cajas) || 0
  if (!n) return ''
  return n === 1
    ? t(
        'My cashiers used SICAR: give my register its keys (F2 search, F5 quantity, Esc charge)',
      )
    : t(
        'My cashiers used SICAR: give my {0} registers its keys (F2 search, F5 quantity, Esc charge)',
        [n],
      )
}
