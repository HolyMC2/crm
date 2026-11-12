// Tienda › Aplicaciones in the owner's words, from Boat's my_apps (capability
// «apps»): each free app with its state (activa, instalando with its progress,
// disponible, no disponible with Boat's reason), what «Activar» offers (empty or
// with sample data, when the app ships them) and whether «Desactivar» applies,
// with Boat's note about what it hides. The apps are free: no price line. Pure.
const t = (text, replace) => __(text, replace, 'Cuenta')

export const POLL_MS = 5000
const STATUSES = ['active', 'installing', 'available', 'unavailable']

/** A link Boat gave (the app's manual), only when it is plain https. */
function httpsUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : ''
  } catch {
    return ''
  }
}

/** «Paso 2 de 4»: Boat's label and how far the install went, or null. */
export function appProgress(progress) {
  if (!progress || typeof progress !== 'object') return null
  const steps = Number(progress.steps) || 0
  const step = Math.min(Number(progress.step) || 0, steps)
  return {
    label:
      (typeof progress.label_es === 'string' && progress.label_es.trim()) ||
      t('Installing'),
    pct: steps && step ? Math.round((step / steps) * 100) : null,
    step: steps && step ? t('Step {0} of {1}', [step, steps]) : '',
  }
}

/** The ways «Activar» can start an app: empty always, sample data when it ships it. */
export function seedChoices(app) {
  const choices = [
    {
      value: 'clean',
      label: t('Empty'),
      detail: t('You start with your own data.'),
    },
  ]
  if (Array.isArray(app?.seed_options) && app.seed_options.includes('sample'))
    choices.push({
      value: 'sample',
      label: t('With sample data'),
      detail: t('To try it before you use it with your own data.'),
    })
  return choices
}

function appRow(app, siteReason) {
  const status = STATUSES.includes(app.status) ? app.status : 'unavailable'
  const own = (typeof app.reason_es === 'string' && app.reason_es.trim()) || ''
  // Why the whole site cannot turn apps on is said once, above the list.
  const reason =
    own && own === siteReason
      ? ''
      : own ||
        (status === 'unavailable' && !siteReason
          ? t('It is not available for your system yet.')
          : '')
  return {
    app: app.app,
    title: app.title_es || app.app,
    blurb: app.blurb_es || '',
    description: app.description_es || app.blurb_es || '',
    features: Array.isArray(app.features_es) ? app.features_es : [],
    dependencyNote: app.dependency_note || '',
    status,
    chip:
      status === 'active'
        ? t('Active app')
        : status === 'installing'
          ? t('Installing')
          : status === 'unavailable'
            ? t('Not available')
            : '',
    reason,
    progress: status === 'installing' ? appProgress(app.progress) : null,
    canActivate: status === 'available',
    canDeactivate: status === 'active' && app.can_deactivate === true,
    deactivateNote: app.deactivate_note || '',
    seeds: seedChoices(app),
    manualUrl: httpsUrl(app.manual_url),
  }
}

/**
 * The apps as rows: those the owner can act on first (active, installing,
 * available), the unavailable ones last, each group in Boat's order.
 */
export function appRows(answer) {
  const apps = Array.isArray(answer?.apps) ? answer.apps : []
  const rows = apps
    .filter((app) => app && typeof app.app === 'string')
    .map((app) => appRow(app, siteNotice(answer)))
  return [
    ...rows.filter((row) => row.status !== 'unavailable'),
    ...rows.filter((row) => row.status === 'unavailable'),
  ]
}

/** Why this site cannot turn apps on (an own shop, a suspended system), or ''. */
export function siteNotice(answer) {
  const said = answer?.unavailable_reason
  return typeof said === 'string' ? said.trim() : ''
}

/** Whether a row is still installing, so the list keeps asking Boat. */
export function installing(rows) {
  return rows.some((row) => row.status === 'installing')
}

/** Boat's answer to activate/deactivate, merged into the list it came from. */
export function mergeApp(answer, app) {
  if (!app || typeof app.app !== 'string' || !Array.isArray(answer?.apps))
    return answer
  return {
    ...answer,
    apps: answer.apps.map((row) =>
      row?.app === app.app ? { ...row, ...app } : row,
    ),
  }
}
