// «Registrar algo nuevo» and «Altas por revisar» (doco.workspaces.altas): a worker who
// may not create products registers one with photos, count and place; whoever creates
// products decides it after the assistant proposes the name, the group and the same
// product it may already be.
import { comprasApi, problemOf, requestId } from '@/composables/useCompras'
import { prepareImage } from '@/components/ui/imageFiles'
import { postPicture } from '@/utils/catalogUpload'

const SERVICE = 'doco.workspaces.altas'
export const CTX = 'Altas'

export { problemOf, requestId }

/** Without the shell's translator (tests, a bare import): the words with their {0} filled. */
const plain = (text, replace) =>
  replace
    ? text.replace(/{(\d+)}/g, (match, index) => replace[index] ?? match)
    : text

export function altasApi(method, args = {}) {
  return comprasApi(`${SERVICE}.${method}`, args)
}

/** One photo (the piece or its label), cut to size on the device, joins the alta. */
export async function sendAltaPhoto(
  alta,
  file,
  { request = requestId(), post = postPicture, prepare = prepareImage } = {},
) {
  const ready = await prepare(file)
  return post(`${SERVICE}.agregar_foto`, { request_id: request, alta }, ready)
}

/** The kinds a piece can be; the value is the server's, the words are the worker's. */
export function tipos(t = plain) {
  return [
    {
      value: 'Para vender',
      label: t('To sell', null, CTX),
      hint: t('It goes on the counter or online', null, CTX),
    },
    {
      value: 'Se usa en el taller',
      label: t('Used in the workshop', null, CTX),
      hint: t('It is spent on repairs', null, CTX),
    },
    {
      value: 'Herramienta o equipo',
      label: t('Tool or equipment', null, CTX),
      hint: t('It stays in the shop', null, CTX),
    },
  ]
}

export function tipoLabel(value, t = plain) {
  return tipos(t).find((tipo) => tipo.value === value)?.label || value || ''
}

export function piezas(qty, t = plain) {
  const n = Number(qty) || 0
  const shown = Number.isInteger(n) ? n : n.toFixed(2)
  return n === 1 ? t('{0} piece', [shown], CTX) : t('{0} pieces', [shown], CTX)
}

/** The tone of an alta's state chip. */
export function estadoTone(estado) {
  return (
    {
      'Por revisar': 'warning',
      'Dada de alta': 'success',
      Sumada: 'success',
      Rechazada: 'neutral',
    }[estado] || 'neutral'
  )
}

export function estadoLabel(estado, t = plain) {
  return (
    {
      'Por revisar': t('To review', null, CTX),
      'Dada de alta': t('Created', null, CTX),
      Sumada: t('Added to a product', null, CTX),
      Rechazada: t('Not created', null, CTX),
    }[estado] ||
    estado ||
    ''
  )
}

/** What a row says under its name: who, how many, where. */
export function altaLine(row, t = plain) {
  return [row.quien, piezas(row.cantidad, t), row.lugar]
    .filter(Boolean)
    .join(', ')
}

/** The best name to show for an alta: the assistant's, else what the worker wrote. */
export function altaTitle(row, t = plain) {
  return row?.propuesta?.nombre || row?.nombre || t('Something new', null, CTX)
}
