// Network side of the composer `/` palette: command catalog, previews,
// template rendering, document sends and template saves
// (doco_marketing.api.composer.*, see docs/COMPOSER_COMMANDS.md).
//
// Reads are cached and fail soft: the palette keeps working with local quick
// replies and `/cat` while the backend is missing or unreachable. Writes
// (send_document, save_template) reject so the dialog can show the error.
import { call } from 'frappe-ui'
import { ref, computed } from 'vue'
import { addonAvailable } from '@/utils/crmCapabilities'
import { buildItems, findHoles } from '@/composables/slashCommands'

const API = 'doco_marketing.api.composer'
export const COMPOSER_API = Object.freeze({
  catalog: `${API}.get_command_catalog`,
  preview: `${API}.preview_document_message`,
  render: `${API}.render_template`,
  send: `${API}.send_document`,
  save: `${API}.save_template`,
})

const CATALOG_TTL_MS = 60000
const PREVIEW_TTL_MS = 60000
const _catalogCache = new Map()
const _previewCache = new Map()
const _renderCache = new Map()

function cached(map, key, ttl) {
  const hit = map.get(key)
  return hit && Date.now() - hit.at < ttl ? hit : null
}

export async function fetchCatalog(referenceDoctype, referenceName, channel) {
  if (!referenceDoctype || !referenceName) return null
  const key = `${referenceDoctype}|${referenceName}|${channel}`
  const hit = cached(_catalogCache, key, CATALOG_TTL_MS)
  if (hit) return hit.promise
  const promise = call(COMPOSER_API.catalog, {
    reference_doctype: referenceDoctype,
    reference_name: referenceName,
    channel,
  }).catch(() => {
    _catalogCache.delete(key)
    return null
  })
  _catalogCache.set(key, { at: Date.now(), promise })
  return promise
}

export function invalidateCatalog() {
  _catalogCache.clear()
}

// {caption, subject, attachment, link_url, recipients, window_open, warnings} | null
export async function previewDocument(
  { referenceDoctype, referenceName, doctype, docname, channel },
  { fresh = false } = {},
) {
  const key = [referenceDoctype, referenceName, doctype, docname, channel].join(
    '|',
  )
  const hit = !fresh && cached(_previewCache, key, PREVIEW_TTL_MS)
  if (hit) return hit.promise
  const promise = call(COMPOSER_API.preview, {
    reference_doctype: referenceDoctype,
    reference_name: referenceName,
    doctype,
    docname,
    channel,
  }).catch(() => {
    _previewCache.delete(key)
    return null
  })
  _previewCache.set(key, { at: Date.now(), promise })
  return promise
}

// {text, holes:[{key,label,value}]}. Falls back to the raw body (holes parsed
// locally) when the endpoint is unavailable, so a template is never lost.
export async function renderTemplate(
  { id, kind = 'reply', body = '' },
  referenceDoctype,
  referenceName,
) {
  const key = `${id}|${kind}|${referenceDoctype}|${referenceName}`
  const hit = cached(_renderCache, key, PREVIEW_TTL_MS)
  if (hit) return hit.promise
  const promise = call(COMPOSER_API.render, {
    template: id,
    reference_doctype: referenceDoctype,
    reference_name: referenceName,
    kind,
  })
    .then((r) => {
      if (!r || typeof r.text !== 'string') throw new Error('bad shape')
      const holes = Array.isArray(r.holes)
        ? r.holes.filter((h) => h && h.key && h.value == null)
        : findHoles(r.text)
      return { text: r.text, holes, rendered: true }
    })
    .catch(() => {
      _renderCache.delete(key)
      return { text: body, holes: findHoles(body), rendered: false }
    })
  _renderCache.set(key, { at: Date.now(), promise })
  return promise
}

export function sendDocument(args) {
  return call(COMPOSER_API.send, {
    reference_doctype: args.referenceDoctype,
    reference_name: args.referenceName,
    doctype: args.doctype,
    docname: args.docname,
    channel: args.channel,
    to: args.to || undefined,
    caption: args.caption ?? undefined,
    subject: args.subject || undefined,
  })
}

export function saveTemplate(row) {
  return call(COMPOSER_API.save, row).then((r) => {
    invalidateCatalog()
    _renderCache.clear()
    return r
  })
}

// Newest first: by date when the backend sends one, else as delivered.
export function sortDocuments(docs) {
  return [...(docs || [])].sort((a, b) =>
    String(b?.date || '').localeCompare(String(a?.date || '')),
  )
}

// Per-composer controller: catalog (lazy), palette items and dialog state.
//   channel         — 'whatsapp' | 'messenger' | 'email'
//   reference()     — {doctype, name} of the conversation record
//   quickReplies()  — local [{label, text}] shown even when the catalog fails
export function useComposerCommands({
  channel,
  reference,
  quickReplies = () => [],
}) {
  const catalog = ref(null)
  const catalogLoading = ref(false)
  const docDialog = ref({ open: false, doctype: '' })
  const saveDialog = ref({ open: false, body: '' })

  const enabled = computed(() => {
    const r = reference()
    return !!(addonAvailable.value && r?.doctype && r?.name)
  })

  // A failed load is not retried on every keystroke: wait a minute (or `fresh`).
  let failedAt = 0
  async function loadCatalog({ fresh = false } = {}) {
    if (!enabled.value) return null
    if (!fresh && failedAt && Date.now() - failedAt < CATALOG_TTL_MS)
      return catalog.value
    const r = reference()
    if (fresh) invalidateCatalog()
    catalogLoading.value = true
    try {
      catalog.value = await fetchCatalog(r.doctype, r.name, channel)
      failedAt = catalog.value ? 0 : Date.now()
    } finally {
      catalogLoading.value = false
    }
    return catalog.value
  }

  const items = computed(() =>
    enabled.value
      ? buildItems(catalog.value, quickReplies() || [], channel, {
          // `/cat` opens the chat catalog picker; email has no such picker.
          catalogCommand: channel !== 'email',
        })
      : [],
  )

  function openDocument(doctype = '') {
    docDialog.value = { open: true, doctype }
  }
  function openSaveTemplate(body = '') {
    saveDialog.value = { open: true, body }
  }

  return {
    channel,
    catalog,
    catalogLoading,
    enabled,
    items,
    loadCatalog,
    docDialog,
    saveDialog,
    openDocument,
    openSaveTemplate,
  }
}
