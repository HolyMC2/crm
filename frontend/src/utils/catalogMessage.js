// What a catalog send says, rendered in the browser so the operator sees and edits exactly
// what goes out. Mirrors doco_marketing services/catalog_message.py (item_values, render,
// for_channel): the server renders the same way when a caller sends without captions.

export const DEFAULT_CAPTION = '*{{articulo}}*\n{{precio}}\n{{oferta}}'
export const STORE_LINE = 'Ve más en la tienda: {{tienda}}'
const PLACEHOLDER = /\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}/g
// *bold* ~strike~ _italic_: WhatsApp markup, literal asterisks anywhere else.
const MARKUP = /(?<![\w*~_])([*~_])(?=\S)(.+?)(?<=\S)\1(?![\w*~_])/g

function tr(message, replace) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

/** The chips that insert a {{variable}} into an item's text. */
export function itemVariables() {
  return [
    { key: 'articulo', label: tr('Artículo') },
    { key: 'precio', label: tr('Precio') },
    { key: 'oferta', label: tr('Oferta') },
    { key: 'precio_antes', label: tr('Precio antes') },
    { key: 'descuento', label: tr('Descuento') },
    { key: 'quedan', label: tr('Quedan') },
    { key: 'enlace', label: tr('Enlace') },
    { key: 'codigo', label: tr('Código') },
    { key: 'marca', label: tr('Marca') },
    { key: 'grupo', label: tr('Grupo') },
  ]
}

/** The chips for the messages before and after the items. */
export function messageVariables() {
  return [
    { key: 'nombre', label: tr('Nombre') },
    { key: 'busqueda', label: tr('Búsqueda') },
    { key: 'cantidad', label: tr('Cantidad') },
    { key: 'tienda', label: tr('Enlace a la tienda') },
  ]
}

/** $1,234 · $1,234.50 — how the chat writes a price. */
export function money(value) {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  const whole = Number.isInteger(n)
  return (
    '$' +
    n.toLocaleString('en-US', {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    })
  )
}

/** A price the operator typed («$1,200», «1200.5»), or null for blank / not a number. */
export function parsePrice(text) {
  const clean = String(text ?? '').replace(/[$,\s]/g, '')
  if (!clean) return null
  const n = Number(clean)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * The {{variables}} of one item. `price` is the operator's price for this message: it
 * replaces the shown price and drops the sale line.
 */
export function itemValues(item, price = null) {
  const listed = item?.price ?? null
  const sale = price === null ? item?.sale_price ?? null : null
  const shown = price !== null ? price : sale !== null ? sale : listed
  const pct = sale !== null ? item?.discount_pct : null
  const low = item?.low_stock
  return {
    articulo: item?.item_name || item?.item_code || '',
    precio: money(shown) || tr('Precio a consultar'),
    precio_antes: sale !== null ? money(listed) : '',
    descuento: pct ? `-${pct}%` : '',
    oferta:
      sale !== null
        ? `Antes ~${money(listed)}~` + (pct ? ` · -${pct}%` : '')
        : '',
    codigo: item?.item_code || '',
    grupo: item?.item_group || '',
    marca: item?.brand || '',
    quedan: low ? tr('Quedan {0}', [low]) : '',
    enlace: item?.link || '',
  }
}

/**
 * An item's text. A line whose known placeholders all came out empty is dropped (an
 * item not on sale loses its «Antes …» line); unknown keys stay as written.
 */
export function renderCaption(pattern, values) {
  const lines = []
  for (const line of String(pattern || '').split('\n')) {
    const known = [...line.matchAll(PLACEHOLDER)]
      .map((m) => m[1])
      .filter((k) => k in values)
    if (known.length && known.every((k) => !values[k])) continue
    lines.push(
      line
        .replace(PLACEHOLDER, (m, k) => (k in values ? values[k] || '' : m))
        .trimEnd(),
    )
  }
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * The message before or after the items. An empty value just disappears («Hola
 * {{nombre}}, …» without a name reads «Hola, …»); a line left empty is dropped.
 */
export function renderMessage(text, values) {
  return String(text || '')
    .split('\n')
    .map((line) =>
      line
        .replace(PLACEHOLDER, (m, k) => (k in values ? values[k] || '' : m))
        .replace(/[ \t]+([,.;:!?])/g, '$1')
        .replace(/[ \t]{2,}/g, ' ')
        .trim(),
    )
    .filter((line, i, all) => line || (i > 0 && all[i - 1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** The closing text with the store line added when a store link goes out without {{tienda}}. */
export function closingWithStore(closing, withStore) {
  const text = String(closing || '')
  if (!withStore || /\{\{\s*tienda\s*\}\}/.test(text)) return text
  return text.trim() ? `${text.trim()}\n${STORE_LINE}` : STORE_LINE
}

/** WhatsApp draws *bold* and ~strike~; other channels get the plain words (preview only). */
export function forChannel(text, channel) {
  let out = String(text || '').trim()
  if (String(channel || '').toLowerCase() === 'whatsapp') return out
  let previous = null
  while (previous !== out) {
    previous = out
    out = out.replace(MARKUP, '$2')
  }
  return out
}

/** First name for {{nombre}}. */
export function firstName(full) {
  return (
    String(full || '')
      .trim()
      .split(/\s+/)[0] || ''
  )
}
