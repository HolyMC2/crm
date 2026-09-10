// Status describes the observed checkpoint, never an inferred delivery guarantee.
export const captureHealthLabels = {
  not_verified: 'Conexión sin verificar',
  disabled: 'Conexión desactivada',
  unconfigured: 'Página sin configurar',
  missing_credentials: 'Falta una credencial válida',
  invalid_page: 'Identificador de página inválido',
  invalid_api_version: 'Versión de API inválida',
  ambiguous_page: 'La página tiene configuraciones duplicadas',
  ambiguous_app: 'Hay que identificar la aplicación conectada',
  invalid_response: 'Meta devolvió una respuesta no reconocida',
  not_subscribed: 'No se encontró una suscripción',
  missing_mention_subscription: 'Falta la suscripción a menciones',
  subscription_present_delivery_unverified: 'Suscripción presente; recepción sin comprobar',
  credential_or_permission_error: 'Revisa la credencial y los permisos en Meta',
  rate_limited: 'Meta limitó las consultas; intenta más tarde',
  provider_unavailable: 'No se pudo consultar Meta',
}

export function captureHealthLabel(state) {
  return captureHealthLabels[state] || captureHealthLabels.not_verified
}

export function newCaptureHealthRequests() {
  let generation = 0
  return {
    invalidate: () => ++generation,
    current: (request) => request === generation,
  }
}
