import { ref } from 'vue'
import { comprasApi } from '@/composables/useCompras'
import { shellBoot } from '@/composables/muelleShell'
import {
  SHELL_MODULES,
  can,
  moduleEnabled,
  readReturn,
  safeReturn,
  withReturn,
} from '@/vendor/muelle-shell/contracts'

// Manual de la tienda: the shop's own procedures, read on the phone or at the
// counter, with the button to do the step right there. «Shop Manual Article»
// is the record; doco.manual owns every read and write (and re-checks the
// person each time). Pure helpers live here so pages and tests share them.

export { outcomeUnknown, problemOf, requestId } from '@/composables/useCompras'

function tr(message, replace, context = null) {
  if (typeof window !== 'undefined' && typeof window.__ === 'function')
    return window.__(message, replace, context)
  return message.replace(/{(\d+)}/g, (match, n) =>
    replace?.[n] !== undefined ? replace[n] : match,
  )
}

export const SERVICE = 'doco.manual.api'
export const DOCTYPE = 'Shop Manual Article'
// Translation context: short generic words stay Manual-only in the catalog.
export const CTX = 'Manual'
export const TITLE = 'Manual de la tienda'

/** POST to the manual service; a refusal keeps the server's message and type. */
export function manualApi(method, args = {}) {
  return comprasApi(
    method.includes('.') ? method : `${SERVICE}.${method}`,
    args,
  )
}

export const manualBoot = ref(null)
let bootPending
/** The manual's capability and setup data, cached per page load. */
export function loadManualBoot({ refresh = false } = {}) {
  if (manualBoot.value && !refresh) return Promise.resolve(manualBoot.value)
  if (bootPending) return bootPending
  bootPending = manualApi('crm.api.manual.get_capabilities')
    .then((data) => (manualBoot.value = data || { enabled: false }))
    .catch(() => (manualBoot.value = { enabled: false, failed: true }))
    .finally(() => (bootPending = null))
  return bootPending
}

// ── list state ──────────────────────────────────────────────────────────────

export const VISTAS = Object.freeze([
  { value: 'publicados', label: 'Published', icon: 'book-open', editor: false },
  { value: 'borradores', label: 'Drafts', icon: 'edit-3', editor: true },
  { value: 'retirados', label: 'Retired', icon: 'archive', editor: true },
])
export function vistasFor(canWrite) {
  return VISTAS.filter((vista) => canWrite || !vista.editor)
}
export function vistaLabel(value) {
  return tr(
    VISTAS.find((vista) => vista.value === value)?.label || 'Published',
    null,
    CTX,
  )
}
const text = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

/** The list's state from the URL: what a reload or «Volver» restores. */
export function listState(query = {}, canWrite = false) {
  const vista = vistasFor(canWrite).some((v) => v.value === query.vista)
    ? query.vista
    : 'publicados'
  return {
    q: text(query.q, 100),
    categoria: text(query.categoria, 60),
    vista,
  }
}
/** The URL query for a state, without its defaults. */
export function listQuery(state = {}) {
  const query = {}
  if (state.q) query.q = state.q
  if (state.categoria) query.categoria = state.categoria
  if (state.vista && state.vista !== 'publicados') query.vista = state.vista
  return query
}

const DAY = 24 * 60 * 60 * 1000
export const parse = (value) =>
  value ? Date.parse(String(value).replace(' ', 'T').slice(0, 19)) : NaN

export function locale() {
  const boot = shellBoot.value?.locale
  if (boot) return String(boot).replace('_', '-')
  if (typeof document !== 'undefined' && document.documentElement?.lang)
    return document.documentElement.lang
  return 'es-MX'
}

/** The page's way back; without a caller label, the shell module's own name (Garantías). */
export function backTarget(query = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query))
    if (typeof value === 'string') params.append(key, value)
  const back = readReturn(params)
  if (!back || params.get('return_label')) return back
  const path = back.to.split(/[?#]/)[0]
  const module = SHELL_MODULES.find(
    (m) =>
      path === `/crm${m.basePath}` || path.startsWith(`/crm${m.basePath}/`),
  )
  return module ? { ...back, label: module.label } : back
}

/** «hace 3 días», in the person's language. */
export function ago(value, now = Date.now(), lang = locale()) {
  const at = parse(value)
  if (Number.isNaN(at)) return ''
  // Never «dentro de…»: a clock a little ahead still reads as just now.
  const minutes = Math.max(0, Math.round((now - at) / 60000))
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return format.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return format.format(-hours, 'hour')
  return format.format(-Math.round(hours / 24), 'day')
}

/** «Caja · actualizado hace 3 días». */
export function metaLine(row, now = Date.now(), lang = 'es-MX') {
  return [row.category, tr('updated {0}', [ago(row.modified, now, lang)], CTX)]
    .filter(Boolean)
    .join(' · ')
}

/** Borrador / Retirado for the people who write; «Nuevo» for a week after publishing. */
export function statusBadge(row, canWrite, now = Date.now()) {
  if (row.status === 'Borrador' || row.status === 'Retirado')
    return canWrite
      ? {
          label: tr(row.status, null, CTX),
          theme: row.status === 'Borrador' ? 'orange' : 'gray',
        }
      : null
  const at = parse(row.published_on)
  if (row.status === 'Publicado' && !Number.isNaN(at) && now - at <= 7 * DAY)
    return { label: tr('New', null, CTX), theme: 'green' }
  return null
}

export function updatedLine(article, lang = locale()) {
  const at = parse(article?.modified)
  if (Number.isNaN(at)) return ''
  const day = new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'short',
  }).format(at)
  return article.modified_by
    ? tr('Updated {0} by {1}', [day, article.modified_by], CTX)
    : tr('Updated {0}', [day], CTX)
}

// ── places: where the step is done ──────────────────────────────────────────

function placeLabel(place) {
  return (
    place?.label ||
    SHELL_MODULES.find((m) => m.key === place?.module)?.label ||
    place?.key ||
    ''
  )
}

/** Can this person open the article's place? Never a dead button: a reason and a request. */
export function placeAvailability(place, boot, title = '') {
  if (!place) return { available: false, reason: '', request: '' }
  const label = placeLabel(place)
  let reason = ''
  if (place.module) {
    if (
      !moduleEnabled(boot, place.module) ||
      (place.capability && !can(boot, place.module, place.capability))
    )
      reason = tr('{0} is not available for your puesto.', [label])
  } else if (place.installed === false) {
    reason = place.reason || tr('{0} is not installed in this system.', [label])
  } else if (place.allowed === false) {
    reason =
      place.reason || tr('{0} is not available for your puesto.', [label])
  }
  return {
    available: !reason,
    reason,
    request: reason
      ? tr(
          'I need access to {0} in Muelle to do what the shop manual says ({1}).',
          [label, title || label],
        )
      : '',
  }
}

/** The place opened with «← Volver a <article>»; null for a path outside Muelle. */
export function placeActionUrl(place, article) {
  const path = place?.path
  if (!path || !safeReturn(path)) return null
  try {
    return withReturn(path, {
      to: `/crm/manual/${encodeURIComponent(article.name)}`,
      label: article.title,
    })
  } catch {
    return null
  }
}

/** `/manual?lugar=…`: no article, exactly one (open it) or several (filtered list). */
export function resolveLugar(rows = []) {
  if (!rows.length) return { kind: 'none' }
  if (rows.length === 1) return { kind: 'one', name: rows[0].name }
  return { kind: 'many' }
}

/** Where a Muelle path opens: in this app (router) or another Muelle app (page load). */
export function openTarget(url, router) {
  if (url.startsWith('/crm/')) return router.push(url.slice(4))
  window.location.assign(url)
}

// ── editor ──────────────────────────────────────────────────────────────────

export const FIELDS = Object.freeze([
  'title',
  'category',
  'summary',
  'body',
  'company',
  'place',
  'audience',
])
export function emptyForm(prefill = {}) {
  return {
    title: '',
    category: '',
    summary: '',
    body: '',
    company: '',
    place: '',
    audience: [],
    ...prefill,
  }
}
export function formFrom(article) {
  return emptyForm({
    title: article.title || '',
    category: article.category || '',
    summary: article.summary || '',
    body: article.body || '',
    company: article.company || '',
    place: article.place?.key || '',
    audience: [...(article.audience || [])],
  })
}
const comparable = (form) =>
  JSON.stringify(
    FIELDS.map((field) =>
      field === 'audience'
        ? [...(form?.[field] || [])].sort()
        : (form?.[field] ?? ''),
    ),
  )
export function isDirty(form, base) {
  return comparable(form) !== comparable(base)
}
/** What «Publicar» still needs, as a sentence (empty when nothing). */
export function publishBlocker(form) {
  const body = String(form.body || '')
    .replace(/<[^>]*>/g, ' ')
    .trim()
  if (!form.title?.trim() && !body)
    return tr('Write a title and the article before publishing it.')
  if (!form.title?.trim()) return tr('Write a title to publish it.')
  if (!body) return tr('Write the article to publish it.')
  return ''
}

export const AUDIENCE = Object.freeze([
  { value: 'Cajero', label: 'Cashiers' },
  { value: 'Técnico', label: 'Technicians' },
  { value: 'Encargado', label: 'Managers' },
  { value: 'Dueño', label: 'Owners' },
])

// Drafts (shell spec: IndexedDB `muelle-drafts`, field values only, never auto-sent).
export function draftKey({ site, user, name }) {
  return `${site}:${user}:manual:${DOCTYPE}:${name || 'new'}`
}
export function memoryBackend() {
  const map = new Map()
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    delete: async (key) => void map.delete(key),
  }
}
function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
export function idbBackend() {
  if (typeof indexedDB === 'undefined') return memoryBackend()
  let opened
  const db = () => {
    if (!opened) {
      const open = indexedDB.open('muelle-drafts', 1)
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('drafts'))
          open.result.createObjectStore('drafts')
      }
      opened = request(open)
    }
    return opened
  }
  const store = async (mode) =>
    (await db()).transaction('drafts', mode).objectStore('drafts')
  return {
    get: async (key) =>
      (await request((await store('readonly')).get(key))) ?? null,
    set: async (key, value) =>
      void (await request((await store('readwrite')).put(value, key))),
    delete: async (key) =>
      void (await request((await store('readwrite')).delete(key))),
  }
}
export function createDraftStore(backend = idbBackend()) {
  return {
    async load(key) {
      try {
        const value = await backend.get(key)
        return value && value.form ? value : null
      } catch {
        return null
      }
    },
    async save(key, form, modified) {
      try {
        await backend.set(key, {
          at: Date.now(),
          modified: modified || null,
          form: JSON.parse(JSON.stringify(form)),
        })
      } catch {
        /* a draft is a convenience */
      }
    },
    async clear(key) {
      try {
        await backend.delete(key)
      } catch {
        /* ignore */
      }
    },
  }
}
export function draftNotice(stored, current = {}, now = Date.now()) {
  if (!stored) return ''
  const minutes = Math.max(1, Math.round((now - stored.at) / 60000))
  if (
    stored.modified &&
    current.modified &&
    stored.modified !== current.modified
  )
    return tr(
      'You have an unsaved draft from {0} min ago, made on an older version of the article.',
      [minutes],
    )
  return tr('You have an unsaved draft from {0} min ago.', [minutes])
}

// ── copy for the person who can fix it ──────────────────────────────────────

export function requestText(kind, detail = '') {
  if (kind === 'publish')
    return tr(
      'Please publish our shop manual in Muelle (Manual de la tienda) so the team can read how things are done here.',
    )
  if (kind === 'place')
    return tr(
      'Please write the shop manual article for «{0}» in Muelle (Manual de la tienda).',
      [detail],
    )
  if (kind === 'article')
    return tr(
      'I cannot open an article of the shop manual in Muelle. Can you check whether it is for my puesto?',
    )
  return tr(
    'I would like to add or change an article of the shop manual in Muelle (Manual de la tienda). Can you write it or give me access?',
  )
}

export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value)
    return tr('Request copied. Share it with your manager.')
  } catch {
    return value
  }
}
