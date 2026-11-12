// Mi cuenta › «Contactos» (capability «contacts»): who else receives Muelle's
// emails about the account, by kind: billing, technical notices and the
// account itself. Boat (the contacts_* seams through miplan.call) keeps the
// owner's address on every email, mails a code to a new address before it
// receives anything, and answers the whole list after every change; this
// module shapes that list for the screen, keeps the forms from sending what
// Boat would refuse anyway, and says Boat's sentence when it refuses.
import { ref } from 'vue'
import { seam as defaultSeam } from './api'
import { failureText, refusalView } from './autoservicio'

const t = (text, replace) => __(text, replace, 'Cuenta')

export const CODE_DIGITS = 6

// What each kind carries, in the owner's words. Boat sends the keys in this order.
const KINDS = {
  billing: () => ({
    title: t('Billing'),
    what: t(
      'Invoices, payment receipts, CFDI, payment reminders and card notices.',
    ),
  }),
  technical: () => ({
    title: t('Technical notices'),
    what: t('Outages, backups and maintenance.'),
  }),
  account: () => ({
    title: t('Account'),
    what: t('Trial ending, cancellation and reactivation. Always sent.'),
  }),
}

const clean = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()

/**
 * One contact row as the owner reads it: the address and where it stands. A
 * verified address of a kind switched off reads as paused.
 */
export function contactRow(row, enabled = true) {
  const verified = row?.verified === true
  const waiting = !verified && row?.code_active === true
  return {
    email: clean(row?.email),
    verified,
    waiting,
    expired: !verified && !waiting,
    state: verified
      ? enabled
        ? t('Receives these notices')
        : t('Paused')
      : waiting
        ? t('Waiting for the code')
        : t('Its code no longer works'),
  }
}

/**
 * An address in pieces that end after «@» or «.», so a narrow line breaks it
 * there (with <wbr>) rather than in the middle of a name.
 */
export function emailBreaks(email) {
  return String(email || '')
    .split(/(?<=[@.])/)
    .filter(Boolean)
}

/**
 * Boat's contacts_get answer for the screen: the owner's address, and the
 * three kinds with their words, whether they are switched on, their rows and
 * whether there is room for one more. null for anything Boat did not mark ok.
 */
export function contactsView(answer) {
  if (answer?.ok !== true || !Array.isArray(answer.categories)) return null
  const max = Number(answer.max_per_category) || 3
  const categories = answer.categories
    .filter((kind) => kind && Object.hasOwn(KINDS, kind.key))
    .map((kind) => {
      const enabled = kind.enabled !== false
      const contacts = (Array.isArray(kind.contacts) ? kind.contacts : [])
        .map((row) => contactRow(row, enabled))
        .filter((row) => row.email)
      return {
        key: kind.key,
        ...KINDS[kind.key](),
        optional: kind.optional === true,
        enabled,
        contacts,
        full: contacts.length >= max,
      }
    })
  return {
    owner: clean(answer.owner_email),
    max,
    codeMinutes: Number(answer.code_minutes) || 15,
    categories,
  }
}

const EMAIL = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[^\s@,;<>"']+$/

/** What the address still lacks before Boat can check it; '' when it looks right. */
export function emailGap(email, owner = '') {
  const value = clean(email)
  if (!value) return t('Type the email.')
  if (!EMAIL.test(value)) return t('Check the email: it looks incomplete.')
  if (owner && value === clean(owner))
    return t('That is your email: it already receives everything.')
  return ''
}

/** The digits typed, at most six (spaces and dashes from a pasted code drop). */
export function codeDigits(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, CODE_DIGITS)
}

/** '' when the code has its six digits, else what to type. */
export function codeGap(code) {
  return codeDigits(code).length === CODE_DIGITS
    ? ''
    : t('Type the {0}-digit code.', [CODE_DIGITS])
}

/**
 * The tab's store: Boat's list (`answer`), loaded once the first read
 * answered, `busy` naming the change in flight ('load', 'add', 'verify',
 * 'remove:<kind>:<email>', 'toggle:<kind>') and a read's `error`. Every change
 * answers {ok, out, text}: ok replaces the list with Boat's, a refusal keeps
 * it and carries Boat's sentence. A read that answers after a change is dropped.
 */
export function createContacts({ seam = defaultSeam } = {}) {
  const answer = ref(null)
  const loaded = ref(false)
  const busy = ref('')
  const error = ref('')
  let seq = 0

  function keep(out) {
    if (out?.ok === true && Array.isArray(out.categories)) {
      answer.value = out
      loaded.value = true
    }
  }

  async function load() {
    const mine = ++seq
    busy.value = 'load'
    error.value = ''
    try {
      const out = await seam('contacts_get', {})
      if (mine !== seq) return
      if (out?.ok === true && Array.isArray(out.categories)) keep(out)
      else error.value = refusalView(out).text
    } catch (err) {
      if (mine === seq) error.value = failureText(err)
    } finally {
      if (mine === seq) busy.value = ''
    }
  }

  async function change(kind, send) {
    ++seq
    busy.value = kind
    try {
      const out = await send()
      if (out?.ok === true) {
        keep(out)
        return { ok: true, out, text: '' }
      }
      return { ok: false, out, text: refusalView(out).text }
    } catch (err) {
      return { ok: false, out: null, text: failureText(err) }
    } finally {
      busy.value = ''
    }
  }

  return {
    answer,
    loaded,
    busy,
    error,
    load,
    add: (category, email) =>
      change('add', () =>
        seam('contacts_add', { category, email: clean(email) }),
      ),
    verify: (category, email, code) =>
      change('verify', () =>
        seam('contacts_verify', {
          category,
          email: clean(email),
          code: codeDigits(code),
        }),
      ),
    remove: (category, email) =>
      change(`remove:${category}:${email}`, () =>
        seam('contacts_remove', { category, email }),
      ),
    toggle: (category, on) =>
      change(`toggle:${category}`, () =>
        seam('contacts_toggle', { category, enabled: on ? 1 : 0 }),
      ),
  }
}
