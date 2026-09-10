import { dayjs, dayjsLocal, getConfig } from 'frappe-ui'

export const INQUIRY_API = 'crm.api.inquiries'
export const INQUIRY_STATUSES = ['New', 'In Progress', 'Closed']
export const INQUIRY_SOURCES = ['Manual', 'Facebook', 'Instagram', 'Other']
export const INQUIRY_ROLES = ['Requester', 'Referrer', 'Interested Person']
export const INQUIRY_LABELS = {
  New: 'Nueva',
  'In Progress': 'En seguimiento',
  Closed: 'Cerrada',
  Manual: 'Manual',
  Facebook: 'Facebook',
  Instagram: 'Instagram',
  Other: 'Otra',
  Requester: 'Solicitante',
  Referrer: 'Referente',
  'Interested Person': 'Persona interesada',
}

export function inquiryNotificationRoute(notification) {
  if (notification?.route_name !== 'Inquiries' || !notification.reference_name)
    return null
  return { name: 'Inquiries', query: { name: notification.reference_name } }
}

export function newPerson() {
  return { display_name: '', role: 'Requester', email: '', phone: '' }
}

export function newCaptureDraft() {
  return {
    title: '',
    source_type: 'Manual',
    source_url: '',
    source_text: '',
    people: [],
    client_request_id: globalThis.crypto.randomUUID(),
  }
}

export function safeSourceUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : ''
  } catch {
    return ''
  }
}

export function validatePerson(person) {
  if (!person.display_name?.trim())
    return 'Escribe el nombre o alias de la persona.'
  if (person.display_name.length > 140)
    return 'El nombre o alias admite hasta 140 caracteres.'
  if (!INQUIRY_ROLES.includes(person.role))
    return 'Selecciona el papel de la persona.'
  if (person.email?.length > 140)
    return 'El correo admite hasta 140 caracteres.'
  if (person.phone?.length > 40)
    return 'El teléfono admite hasta 40 caracteres.'
  if (person.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim()))
    return 'Revisa el correo de la persona.'
  return ''
}

export function validateCapture(draft) {
  if (!draft.title?.trim()) return 'Escribe un título para la consulta.'
  if (draft.title.length > 140) return 'El título admite hasta 140 caracteres.'
  if (!INQUIRY_SOURCES.includes(draft.source_type))
    return 'Selecciona el origen de la consulta.'
  if (draft.source_url?.length > 2048)
    return 'El enlace admite hasta 2048 caracteres.'
  if (draft.source_text?.length > 20000)
    return 'El texto admite hasta 20000 caracteres.'
  if (draft.people?.length > 50) return 'Una consulta admite hasta 50 personas.'
  if (draft.source_url && !safeSourceUrl(draft.source_url))
    return 'Usa un enlace http o https sin credenciales.'
  if (!draft.source_url?.trim() && !draft.source_text?.trim())
    return 'Agrega el enlace o el texto de la consulta.'
  for (const person of draft.people || []) {
    const error = validatePerson(person)
    if (error) return error
  }
  return ''
}

// Only documented input is sent: no source identifiers, child keys or lead links.
export function personPayload(person) {
  return {
    display_name: person.display_name.trim(),
    role: person.role,
    email: person.email?.trim() || '',
    phone: person.phone?.trim() || '',
  }
}

export function capturePayload(draft) {
  return {
    title: draft.title.trim(),
    source_type: draft.source_type,
    source_url: draft.source_url.trim(),
    source_text: draft.source_text.trim(),
    client_request_id: draft.client_request_id,
    people: draft.people.map(personPayload),
  }
}

export function canConvertPerson(person, status) {
  return (
    status !== 'Closed' &&
    !person.lead &&
    !person.converted_at &&
    ['Requester', 'Interested Person'].includes(person.role)
  )
}

// Frappe stores site-local datetimes. Both directions use frappe-ui's configured
// system/user timezones; never reinterpret a site timestamp as browser-local UTC.
export function toLocalDatetime(value) {
  return value ? dayjsLocal(value).format('YYYY-MM-DDTHH:mm:ss') : ''
}

export function toSystemDatetime(value) {
  if (!value) return null
  const systemTimezone = getConfig('systemTimezone')
  const localTimezone =
    getConfig('localTimezone') ||
    Intl.DateTimeFormat().resolvedOptions().timeZone
  const date = systemTimezone
    ? dayjs.tz(value, localTimezone).tz(systemTimezone)
    : dayjs(value)
  return date.format('YYYY-MM-DD HH:mm:ss')
}

export function inquiryError(error) {
  const type = String(error?.exc_type || error?.exception || error?.name || '')
  const message = String(error?.messages?.[0] || error?.message || '')
  const detail = `${type} ${message}`
  if (
    /PermissionError|AuthenticationError|not permitted|not allowed|permission denied/i.test(
      detail,
    )
  ) {
    return {
      kind: 'permission',
      message:
        'No tienes permiso para esta acción o tu sesión cambió. Actualiza la consulta o vuelve a iniciar sesión.',
    }
  }
  if (
    /TimestampMismatchError|modified after|modified since|conflict|recarga|actualizad[oa] por/i.test(
      detail,
    )
  ) {
    return {
      kind: 'conflict',
      message:
        'La consulta cambió. Recarga los datos actuales antes de guardar de nuevo; tu borrador se conserva.',
    }
  }
  if (
    /DoesNotExistError|ModuleNotFoundError|not installed|not ready|not found|schema|no está disponible|no está instalado/i.test(
      detail,
    )
  ) {
    return {
      kind: 'unavailable',
      message:
        'Las consultas no están disponibles en este sitio o el registro ya no está accesible. Pide revisar la instalación de CRM y vuelve a intentar.',
    }
  }
  if (/ValidationError|MandatoryError|DuplicateEntryError/i.test(detail)) {
    return {
      kind: 'validation',
      message:
        message.replace(/<[^>]*>/g, ' ').slice(0, 500) ||
        'Revisa los datos e intenta de nuevo.',
    }
  }
  return {
    kind: 'connection',
    message:
      'No se pudo completar la solicitud. Comprueba la conexión y reintenta. Conservamos tu borrador.',
  }
}

// Separate gates per request channel prevent a slow request (including an old
// actor's request) from replacing newer state, even after leaving and returning.
export function requestGate(context) {
  let revision = 0
  return {
    begin: () => ({ revision: ++revision, context: context() }),
    current: (token) =>
      token.revision === revision && token.context === context(),
    invalidate: () => {
      revision++
    },
  }
}
