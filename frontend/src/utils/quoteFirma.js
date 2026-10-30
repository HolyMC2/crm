// «Pedir firma» on a deal quote (doco.docoutils.quote_firma): the request and its
// pay step in the worker's words, one line each.
import { formatDateTime } from '@/utils/display'

/** «Enviada · abrió la cotización» / «Aceptó con firma · Ana López · hoy 12:11». */
export function firmaLine(request, { now } = {}) {
  if (!request?.state) return ''
  const at = (value) => formatDateTime(value, { now })
  switch (request.state) {
    case 'Firmada':
      return ['Aceptó con firma', request.signer_name, at(request.decided_at)]
        .filter(Boolean)
        .join(' · ')
    case 'No autorizada':
      return ['No aceptó', request.decline_reason, at(request.decided_at)]
        .filter(Boolean)
        .join(' · ')
    case 'Reemplazada':
      return 'La cotización cambió: hay que mandar el enlace de nuevo'
    case 'Vencida':
      return 'El enlace venció sin respuesta'
    case 'Cancelada':
      return 'Enlace cancelado'
    case 'Cerrada':
      return 'La cotización ya tiene su orden de venta'
  }
  const parts = [`Enlace creado ${at(request.created)}`]
  if (request.pdf_opened_at) parts.push('abrió el PDF')
  else if (request.opened_at) parts.push('abrió la cotización')
  else parts.push('sin abrir')
  return parts.join(' · ')
}

/** The pay step after the signature, or '' when there is none. */
export function paymentLine(payment, money = (n) => String(n)) {
  if (!payment?.state) return ''
  return (
    {
      ready: `Puede pagar ${money(payment.amount)} en línea`,
      preparing: 'Preparando su enlace de pago',
      open: `Enlace de pago listo por ${money(payment.amount)}`,
      paid: `Pagó ${money(payment.amount)}`,
      review: 'Pago en revisión',
      unavailable:
        'No se pudo preparar el pago: mándale el enlace desde el pedido',
    }[payment.state] || ''
  )
}
