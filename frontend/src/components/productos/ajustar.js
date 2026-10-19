// «Ajustar existencia» (Shell D4): the Motivo choices and the quantity the
// worker typed. A Stock Reconciliation has no reason field, so the Motivo
// goes to the draft's Actividad as a comment.

export const AJUSTE_REASONS = [
  {
    key: 'correccion',
    label: 'Corrección',
    hint: 'El sistema tenía otra cantidad',
  },
  { key: 'conteo', label: 'Conteo físico', hint: 'Lo contaste en la tienda' },
  { key: 'danado', label: 'Dañado', hint: 'Ya no se puede vender' },
  { key: 'perdida', label: 'Robo o pérdida', hint: 'No aparece' },
  {
    key: 'devolucion',
    label: 'Devolución a inventario',
    hint: 'Regresó y se puede vender',
  },
  {
    key: 'recibido',
    label: 'Mercancía recibida',
    hint: 'Llegó sin su recepción',
  },
  { key: 'otro', label: 'Otro', hint: 'Escribe cuál' },
]

/** The typed quantity as a number of 0 or more; null when it does not read as one.
 * es-MX writes «1,250.5»: commas are thousands, the point is the decimal. */
export function parseQty(text) {
  const clean = String(text ?? '')
    .replace(/[\s,]/g, '')
    .replace(/^\+/, '')
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(clean)) return null
  const n = Number(clean)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** The Actividad line: «Motivo: Dañado · se cayó del anaquel». */
export function ajusteComment(reason, note) {
  const option = AJUSTE_REASONS.find((r) => r.key === reason)
  const extra = String(note || '').trim()
  if (reason === 'otro') return extra ? `Motivo: ${extra}` : ''
  return [option ? `Motivo: ${option.label}` : '', extra]
    .filter(Boolean)
    .join(' · ')
}
