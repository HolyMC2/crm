// «Tu tienda en línea» in Mi cuenta › Tienda (Boat capability «storefront_address»):
// the shop's address and its state, the sheet that chooses it, and «Enciende tu
// tienda», the checklist doco verifies on this site. Boat routes the address and
// says when it answers (storefront_address_state | _check | _connect through
// miplan.call); doco answers the checklist and turns the shop on
// (storefront_readiness). Pure: no Vue, no calls.

const t = (text, replace) => __(text, replace, 'Cuenta')

// How often a connecting address is read again; Boat probes it at most every 10 s.
export const POLL_MS = 5000
// How long the name field waits after the last key before asking Boat.
export const CHECK_DEBOUNCE_MS = 350

/** {label, tone} of the address state chip. */
export function stateChip(state) {
  if (state === 'live') return { label: t('Working'), tone: 'success' }
  if (state === 'connecting')
    return { label: t('Connecting…'), tone: 'warning' }
  if (state === 'stalled') return { label: t('Not opening'), tone: 'danger' }
  return { label: t('No address'), tone: 'neutral' }
}

/** Boat's refusals that mean the address picker is off for this site. */
export function addressOff(answer) {
  return (
    answer?.ok === false &&
    (answer.reason === 'disabled' || answer.reason === 'not_available')
  )
}

/**
 * What the address part shows from Boat's state answer (doco passes it on in
 * its readiness): the address and its chip, the sentence under it, and whether
 * the owner can choose one now. A refusal (Boat's flag off, a site that does
 * not use it) hides the block.
 */
export function addressView(answer) {
  if (!answer || answer.ok !== true)
    return addressOff(answer) ? { hidden: true } : null
  const state = ['live', 'connecting', 'stalled'].includes(answer.state)
    ? answer.state
    : 'none'
  const address = typeof answer.address === 'string' ? answer.address : ''
  const said = typeof answer.message === 'string' ? answer.message : ''
  let line = ''
  if (state === 'live') line = t('Buyers open your store at this address.')
  else if (state === 'stalled')
    line =
      said ||
      t('Your store’s address does not open now. Muelle is checking it.')
  else if (state === 'connecting')
    line =
      said ||
      t(
        'Muelle is connecting it. It takes a few minutes; you do not have to stay here.',
      )
  else if (answer.can_choose)
    line = t('Choose the name buyers type to reach your store.')
  const blocked =
    !address && answer.blocked?.message
      ? {
          text: String(answer.blocked.message),
          next: answer.blocked.next || '',
        }
      : null
  return {
    hidden: false,
    state,
    address: address || null,
    url: state === 'live' && address ? `https://${address}` : null,
    chip: stateChip(state),
    line,
    slow: Boolean(answer.slow),
    canChoose: Boolean(answer.can_choose) && !address,
    zone: typeof answer.zone === 'string' ? answer.zone : '',
    suggested: typeof answer.suggested === 'string' ? answer.suggested : '',
    blocked,
    published: answer.published === true,
  }
}

/**
 * The name as the owner types it, close to what Boat takes: lower case,
 * without accents, a space or an underscore as a hyphen. Anything else stays
 * for Boat to judge, so its sentence explains it.
 */
export function typedName(value, zone = '') {
  let name = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
  if (zone && name.endsWith(`.${zone}`))
    name = name.slice(0, -(zone.length + 1))
  return name.slice(0, 63)
}

/** {label, tone, text, available} of Boat's verdict on one name. */
export function verdictView(answer) {
  if (!answer) return null
  // A refusal, or a name Boat could not check (its zone did not answer): Boat's
  // sentence alone, never «No válida».
  if (answer.ok !== true || answer.verdict === 'unverified')
    return {
      label: '',
      tone: 'neutral',
      text:
        (typeof answer.message === 'string' && answer.message) ||
        t('We could not check that name. Try again in a moment.'),
      available: false,
    }
  const verdict = answer.verdict
  const available = answer.available === true
  const label = available
    ? t('Available')
    : verdict === 'taken'
      ? t('Taken')
      : t('Not valid')
  const text =
    available && answer.address
      ? t('Buyers will open your store at {0}.', [answer.address])
      : typeof answer.message === 'string'
        ? answer.message
        : ''
  return {
    label,
    tone: available ? 'success' : verdict === 'taken' ? 'warning' : 'danger',
    text,
    available,
  }
}

// The fix of a checklist item: the address block, a page of the shell, or a
// Desk page (still where payments and delivery are set).
function fixOf(item) {
  const fix = item?.fix
  if (!fix || typeof fix !== 'object') return null
  const label = typeof fix.label === 'string' ? fix.label : ''
  if (fix.kind === 'address') return { kind: 'address', label }
  // The name buyers see: saved right in the step (Boat's storefront_shop_name).
  if (fix.kind === 'name') return { kind: 'name', label }
  const route = typeof fix.route === 'string' ? fix.route : ''
  if (!label || !route.startsWith('/')) return null
  if (route.startsWith('/crm/'))
    return { kind: 'shell', label, to: route.slice('/crm'.length) }
  return { kind: 'href', label, href: route }
}

/** The rows of «Enciende tu tienda» from doco's readiness answer. */
export function checklistRows(answer) {
  const items = Array.isArray(answer?.items) ? answer.items : []
  return items
    .filter((item) => item && typeof item.label === 'string')
    .map((item) => ({
      key: String(item.key || item.label),
      label: item.label,
      hint: typeof item.hint === 'string' ? item.hint : '',
      state:
        item.ok === true ? 'ok' : item.ok === false ? 'missing' : 'unknown',
      fix: item.ok === true ? null : fixOf(item),
    }))
}

/**
 * What «Enciende tu tienda» says instead of its steps: nothing when the online
 * store is not on in Muelle (the address part says it once, with «Ver
 * complementos»); else doco's sentence and its way there.
 */
export function checklistBlock(answer) {
  const blocked = answer?.blocked
  if (!blocked || typeof blocked.message !== 'string' || !blocked.message)
    return null
  if (blocked.reason === 'no_shop') return { hidden: true }
  return { hidden: false, text: blocked.message, next: blocked.next || '' }
}

/**
 * Whether «Encender tienda» can be tapped, and the sentence beside it when it
 * cannot (a disabled control always says why).
 */
export function turnOnView(answer) {
  if (!answer || answer.ok === undefined) return null
  if (answer.on) return { on: true, can: false, reason: '' }
  if (answer.blocked?.message)
    return { on: false, can: false, reason: String(answer.blocked.message) }
  if (!answer.owner)
    return {
      on: false,
      can: false,
      reason: t('Only whoever runs the system can turn the store on.'),
    }
  if (!answer.can_turn_on)
    return {
      on: false,
      can: false,
      reason: t('Complete the steps above to turn it on.'),
    }
  return { on: false, can: true, reason: '' }
}

/** What a refused «Encender tienda» says: doco's or Boat's sentence and Boat's list. */
export function turnOnRefusal(answer) {
  if (answer?.ok === true) return null
  return {
    text:
      (typeof answer?.message === 'string' && answer.message) ||
      t('The store did not turn on. Try again in a moment.'),
    missing: (Array.isArray(answer?.missing) ? answer.missing : [])
      .filter((row) => row && typeof row.label === 'string' && row.label)
      .map((row) => ({
        label: row.label,
        hint: typeof row.hint === 'string' ? row.hint : '',
      })),
  }
}
