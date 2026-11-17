// Post diario del taller (Redes): what the composer says a post needs next, who has it,
// and the photo pick. Pure: the composer and its panels read these, the tests pin them.
// Server side: doco_marketing services/social/taller_daily.py.

export const MANUAL = 'A mano'
export const MODES = ['Programada', MANUAL]
const DONE = ['Published', 'Partially Published']

function hasImage(media) {
  return (media || []).some((m) => (m.media_type || 'Image') === 'Image')
}

export function hasReel(media) {
  return (media || []).some((m) => m.media_type === 'Video')
}

function timeOf(value) {
  const text = String(value || '')
  return text.length >= 16 ? text.slice(11, 16) : ''
}

/**
 * The one next step of a saved post, in the worker's words:
 * { key, text } with key fotos | texto | mano | aprobar | gestor | enviar | programada | hecho.
 */
export function nextStep(post, { canApprove = false, issues = [] } = {}) {
  if (!post?.name) return null
  if (DONE.includes(post.status))
    return { key: 'hecho', text: __('Publicada. Ya no hay nada pendiente.') }
  if (post.status === 'Cancelado')
    return { key: 'hecho', text: __('Cancelada. No se publica.') }
  if (!hasImage(post.media))
    return { key: 'fotos', text: __('Elige la foto de después del taller.') }
  if (issues.length)
    return {
      key: 'texto',
      text: __('Corrige el texto: {0}.', [issues.join('; ')]),
    }
  if (post.manual_publish)
    return {
      key: 'mano',
      text: __('Publícala en la app y pega aquí el enlace.'),
    }
  if (post.status === 'Pending Approval')
    return canApprove
      ? { key: 'aprobar', text: __('Apruébala para que salga a su hora.') }
      : { key: 'gestor', text: __('Espera la aprobación de un gestor.') }
  if (post.status === 'Draft')
    return { key: 'enviar', text: __('Envíala a aprobar.') }
  if (post.status === 'Scheduled') {
    const at = timeOf(post.scheduled_time)
    return {
      key: 'programada',
      text: at ? __('Sale sola a las {0}.', [at]) : __('Sale sola a su hora.'),
    }
  }
  return null
}

function joinNames(names) {
  if (names.length < 2) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} ${__('y')} ${names[names.length - 1]}`
}

/** «Lo revisan Jenni y Tere» · «Lo revisó Jenni» from the post's Pendientes. */
export function reviewLine(review) {
  const rows = review || []
  const open = rows.filter((r) => r.status === 'Open')
  const done = rows.filter((r) => r.status === 'Closed')
  const name = (r) => r.full_name || r.user
  if (open.length)
    return open.length === 1
      ? __('Lo revisa {0}', [name(open[0])])
      : __('Lo revisan {0}', [joinNames(open.map(name))])
  if (done.length) return __('Lo revisó {0}', [joinNames(done.map(name))])
  return ''
}

export function initials(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return (
    words
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  )
}

/**
 * The card shows one photo, the one after the repair (Marco 2026-11-16: «just the after
 * repair with the repair types»): a tap picks it, a second tap on it takes it out.
 */
export function pickPhoto(selected, photo) {
  return selected?.name === photo?.name ? null : photo
}

/** «Facebook» / «Instagram» for a pasted link, else ''. */
export function linkPlatform(url) {
  let host
  try {
    host = new URL(String(url || '').trim()).hostname.toLowerCase()
  } catch {
    return ''
  }
  if (/(^|\.)(facebook\.com|fb\.com|fb\.watch)$/.test(host)) return 'Facebook'
  if (/(^|\.)instagram\.com$/.test(host)) return 'Instagram'
  return ''
}

/** Minutes and seconds of a song («1:05»). */
export function songLength(seconds) {
  const total = Math.round(Number(seconds) || 0)
  if (!total) return ''
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
