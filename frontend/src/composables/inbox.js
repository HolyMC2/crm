// Inbox state + data layer for the FCRM redesign Phase 2 (handoff §5.1).
// Module-level reactive singletons (same pattern as composables/settings.js) so the
// 3-pane tree shares state without prop-drilling. Thin client over the B1 backend:
// doco_marketing.api.inbox.* — itself a read layer over crm WhatsApp + Communication.
import { ref, watch, computed } from 'vue'
import { createResource, call, toast } from 'frappe-ui'
import { guardStatusChange } from '@/utils/statusGuard'

// ── shared UI state ──────────────────────────────────────────────────────────
export const activeDeal = ref(null) // selected record name (CRM Deal OR CRM Lead)
export const activeDealDoctype = ref('CRM Deal') // 'CRM Deal' | 'CRM Lead' — leads now share the queue
export const activeUnassigned = ref(null) // phone (WhatsApp) or PSID (Messenger) of the open "Sin asignar" orphan
export const activeUnassignedChannel = ref('whatsapp') // 'whatsapp' | 'messenger' — which orphan kind is open
export const activeUnassignedArchived = ref(false) // open orphan came from Archivados → header shows "Desarchivar"
export const activeTab = ref('conversation') // conversation|activity|repair
export const convoTemplateOpen = ref(false) // macro -> open the WhatsApp template review modal in the convo
export const queueChannel = ref(null) // null = Todas
export const queueSearch = ref('')
export const lastSendAt = ref(0) // epoch ms of our last outgoing send (suppress self-ping)
export const queueCollapsed = ref(false) // hide the left queue pane for a wider workspace

// ── mobile single-pane stack (ignored on desktop, which shows all panes) ───────
// WhatsApp-style drill-down: list (queue) → thread (workspace) → context (deal/
// customer data). Desktop renders the 3 panes side-by-side and never reads this.
// Forward nav sets mobileView directly (here / selectDeal); Inbox.vue mirrors each
// drill-in as a history entry. Backward nav goes through mobileBack() → the browser
// back stack, so the in-app ← buttons and the hardware/gesture back behave identically.
export const mobileView = ref('list') // 'list' | 'thread' | 'context'
export function openContext() {
  mobileView.value = 'context'
}
// One-shot attention pulse for 💰 Documentos (intent chip «pago» on desktop, where
// the context panel is already visible and openContext alone changes nothing).
export const salesDocsPulse = ref(0)
export function pulseSalesDocs() {
  openContext()
  salesDocsPulse.value++
}
export function mobileBack() {
  window.history.back()
}

// ── resources ────────────────────────────────────────────────────────────────
export const queue = createResource({
  url: 'doco_marketing.api.inbox.get_conversation_queue',
  params: { limit: 50 },
})
// Per-tenant feature flags. has_taller gates the reparaciones surfaces so the inbox
// runs cleanly on a tenant without taller (e.g. mumu). Default false until loaded —
// safe: never request taller-only fields/endpoints before we know they exist.
export const features = createResource({
  url: 'doco_marketing.api.inbox.get_inbox_features',
  cache: 'inbox-features',
  auto: true,
})
export const hasTaller = computed(() => !!features.data?.has_taller)
export const messengerEnabled = computed(() => !!features.data?.enable_messenger)
export const forecastingEnabled = computed(() => !!features.data?.enable_forecasting)
// 💰 Documentos: neutral deal financial docs (doco crm_deal joins), flag-gated per tenant.
export const salesDocsEnabled = computed(() => !!features.data?.enable_sales_docs)
// ✨ suggested replies (spec 5.1)
export const aiEnabled = computed(() => !!features.data?.enable_ai)
export const thread = createResource({ url: 'doco_marketing.api.inbox.get_communications' })
// "Sin asignar": inbound WhatsApp from numbers with no Contact/Lead/Deal.
export const unassigned = createResource({
  url: 'doco_marketing.api.inbox.get_unassigned_conversations',
  params: { limit: 50 },
  auto: false,
})
export const unassignedThread = createResource({ url: 'doco_marketing.api.inbox.get_unassigned_thread' })
// "Archivados": orphans the operator closed-but-kept (no lead/deal worth opening). Out of
// "Sin asignar"/"Esperando respuesta" yet still reachable + replyable here; a newer inbound
// auto-resurfaces them server-side (no un-archive needed). Loaded on demand (toggle).
export const archived = createResource({
  url: 'doco_marketing.api.inbox.get_archived_orphans',
  params: { limit: 50 },
  auto: false,
})
export const showArchived = ref(false) // is the Archivados section expanded
export function reloadArchived() {
  archived.submit({ limit: 50 })
}
export function toggleArchived() {
  showArchived.value = !showArchived.value
  if (showArchived.value) reloadArchived()
}
// "Comentarios": comments on our Facebook Page posts — a warm-lead stream separate
// from PSID conversations. Reply public/private, convert to Lead, hide.
// The list is grouped by POST server-side (scales past hundreds of comments).
export const commentPosts = createResource({
  url: 'doco_marketing.api.comments.get_comment_post_groups',
  params: { status: 'New', limit: 60 },
  auto: false,
})
export const commentCounts = createResource({ url: 'doco_marketing.api.comments.get_comment_counts', auto: false })
// Real per-channel conversation totals for the tab badges (across ALL convos, not the
// loaded queue page). Refreshed on init + on every thread update (a new message can
// flip a conversation's last_channel); NOT on search (search doesn't change totals).
export const channelCounts = createResource({ url: 'doco_marketing.api.inbox.get_channel_counts', auto: false })
// Speed-to-lead "Vencidos": {count, conversations} for threads awaiting a reply past
// the SLA threshold (most-overdue first, all channels, Deals+Leads). Same refresh
// cadence as channelCounts — a reply/inbound changes who's overdue.
export const overdue = createResource({ url: 'doco_marketing.api.inbox.get_overdue_conversations', auto: false })
// Single "cosas sin atender" total across all four inbox surfaces: WhatsApp + Messenger
// orphans (Sin asignar) + overdue conversations (Vencidos) + new FB comments. The buckets
// are disjoint (orphans have no Lead/Deal so are never overdue; comments are a separate
// doctype), so they sum cleanly — derived from resources initInbox already fetches, no
// extra round-trip; it tracks them live as each refreshes.
export const unattendedTotal = computed(
  () => (unassigned.data?.length || 0) + (overdue.data?.count || 0) + (commentCounts.data?.new || 0),
)
// "Por aprobar": review-gated auto-acuses (#22). Drafts the sweep made for unanswered
// inbound; a human approves (sends) or discards. NOTHING here has been sent yet. The
// count drives the tab badge; the list feeds the review panel.
export const autoAcks = createResource({ url: 'doco_marketing.api.auto_reply.list_pending', params: { limit: 50 }, auto: false })
export const autoAckCount = createResource({ url: 'doco_marketing.api.auto_reply.pending_count', auto: false })
// 💤 active snoozes (Deals+Leads) — «Pospuestas» tab chip, hidden at 0
export const snoozedCount = createResource({ url: 'doco_marketing.api.inbox.get_snoozed_count', auto: false })
// 🏷 etiquetas in use (filter chips + tag-manager suggestions)
export const conversationTags = createResource({ url: 'doco_marketing.api.inbox.get_conversation_tags', auto: false })
export const queueTag = ref(null) // active etiqueta filter (null = all)

// ── queue filters (Marco 2026-08-13) ──────────────────────────────────────────
// The tabs (Todos/WhatsApp/Vencidos/…) are channel+urgency views; these are the
// RECORD filters an operator asks for: estado del trato / del lead / de la
// reparación, plus a date range on the conversation's last activity. Naming a
// deal-side status also scopes the queue to deals (server-side rule) — filtering
// by "Completado" and still seeing every lead would be noise, not a filter.
export const queueFilterOptions = createResource({
  url: 'doco_marketing.api.inbox.get_queue_filter_options',
  cache: 'inbox-filter-options',
  auto: false,
})
export const queueDealStatus = ref([])
export const queueLeadStatus = ref([])
export const queueRepairStatus = ref([])
export const queueDateFrom = ref('')
export const queueDateTo = ref('')
export const queueFilterCount = computed(
  () =>
    queueDealStatus.value.length +
    queueLeadStatus.value.length +
    queueRepairStatus.value.length +
    (queueDateFrom.value ? 1 : 0) +
    (queueDateTo.value ? 1 : 0),
)
// The filter half of the queue params — one source of truth for both the first
// page and the keyset continuation (a mismatch silently paginates a DIFFERENT list).
function queueFilterParams() {
  return {
    deal_status: queueDealStatus.value.length ? JSON.stringify(queueDealStatus.value) : undefined,
    lead_status: queueLeadStatus.value.length ? JSON.stringify(queueLeadStatus.value) : undefined,
    repair_status: queueRepairStatus.value.length ? JSON.stringify(queueRepairStatus.value) : undefined,
    date_from: queueDateFrom.value || undefined,
    date_to: queueDateTo.value || undefined,
  }
}
export function setQueueFilters(patch = {}) {
  if ('deal_status' in patch) queueDealStatus.value = patch.deal_status || []
  if ('lead_status' in patch) queueLeadStatus.value = patch.lead_status || []
  if ('repair_status' in patch) queueRepairStatus.value = patch.repair_status || []
  if ('date_from' in patch) queueDateFrom.value = patch.date_from || ''
  if ('date_to' in patch) queueDateTo.value = patch.date_to || ''
  reloadQueue()
}
export function clearQueueFilters() {
  queueDealStatus.value = []
  queueLeadStatus.value = []
  queueRepairStatus.value = []
  queueDateFrom.value = ''
  queueDateTo.value = ''
  reloadQueue()
}

// ── composer draft handoff ─────────────────────────────────────────────────────
// Features (catálogo editable send, cobrar-en-el-chat, …) set a draft; WhatsAppBox
// applies it (text + optional pending attach) and clears it. The operator ALWAYS
// edits + sends manually — nothing auto-sends through this path.
export const composerDraft = ref(null) // {text, attach, content_type, canned}
export function setComposerDraft(d) {
  composerDraft.value = { ...d, _ts: Date.now() }
  mobileView.value = 'thread' // mobile: surface the composer (no-op on desktop)
}

// ── presence / collision detection (spec 2.4) ─────────────────────────────────
// Ephemeral map: deal → { user → {state, full_name, ts} }. Fed by the realtime
// 'doco_marketing:presence' event (Inbox.vue wires the socket); entries age out
// client-side. We heartbeat our own viewing while a thread is open + visible,
// and WhatsAppBox throttles typing pings through notifyTyping().
export const presenceMap = ref({})
// per-state TTL: viewing outlives its 20s heartbeat; typing fades fast
const PRESENCE_TTL = { viewing: 25000, typing: 6000 }
let _presencePrune = null
export function onPresenceEvent(payload) {
  if (!payload?.deal || !payload.user) return
  const me = document.cookie.match(/(?:^|;\s*)user_id=([^;]*)/)
  if (me && decodeURIComponent(me[1]) === payload.user) return // own echo
  const byDeal = { ...(presenceMap.value[payload.deal] || {}) }
  byDeal[payload.user] = { state: payload.state, full_name: payload.full_name, ts: Date.now() }
  presenceMap.value = { ...presenceMap.value, [payload.deal]: byDeal }
  if (!_presencePrune) {
    _presencePrune = setInterval(() => {
      const now = Date.now()
      const next = {}
      let any = false
      for (const [deal, users] of Object.entries(presenceMap.value)) {
        const alive = Object.fromEntries(
          Object.entries(users).filter(([, v]) => now - v.ts < (PRESENCE_TTL[v.state] || 8000)),
        )
        if (Object.keys(alive).length) {
          next[deal] = alive
          any = true
        }
      }
      presenceMap.value = next
      if (!any) {
        clearInterval(_presencePrune)
        _presencePrune = null
      }
    }, 3000)
  }
}
// others present in the ACTIVE conversation (the strip's data)
export const activePresence = computed(() => {
  const users = presenceMap.value[activeDeal.value] || {}
  return Object.entries(users).map(([user, v]) => ({ user, ...v }))
})

function _pingPresence(state) {
  if (!activeDeal.value) return
  call('doco_marketing.api.inbox.presence', {
    doctype: activeDealDoctype.value,
    name: activeDeal.value,
    state,
  }).catch(() => {})
}
let _typingLast = 0
export function notifyTyping() {
  const now = Date.now()
  if (now - _typingLast < 2500) return
  _typingLast = now
  _pingPresence('typing')
}
// viewing heartbeat: while a conversation is open and the tab is visible
let _viewTimer = null
watch(activeDeal, (d) => {
  clearInterval(_viewTimer)
  _viewTimer = null
  if (!d) return
  _pingPresence('viewing')
  _viewTimer = setInterval(() => {
    if (!document.hidden && activeDeal.value) _pingPresence('viewing')
  }, 20000)
})
export function setQueueTag(tag) {
  queueTag.value = queueTag.value === tag ? null : tag
  reloadQueue()
}
// Pending acuses for the OPEN conversation — drives the in-context review strip so a
// reviewer approves WITH the full thread/calls/items in view (not from the bare list).
export const autoAckForConvo = createResource({ url: 'doco_marketing.api.auto_reply.pending_for_ref', auto: false })
export function loadAutoAckForConvo(doctype, name) {
  if (!doctype || !name || !['CRM Deal', 'CRM Lead'].includes(doctype)) {
    autoAckForConvo.data = []
    return
  }
  autoAckForConvo.submit({ reference_doctype: doctype, reference_name: name })
}
export const activeCommentPost = ref(null) // post_id of the open comment group (3rd middle-pane mode)
// Omnichannel inbox tabs (Meta-style): which channel view the left pane shows.
export const inboxTab = ref('all') // 'all' | 'whatsapp' | 'messenger' | 'comments'
export const commentStatus = ref('New') // 'New' | 'answered' | 'all' (Comentarios sub-filter)
export const commentSearch = ref('') // Comentarios search (commenter name / text)
// Editable contact/customer card for the active deal/lead (resolver names the
// exact doc+field each value lives on; edits go via frappe.client.set_value).
export const contactCard = createResource({ url: 'doco_marketing.api.inbox.get_contact_card' })
export const sla = createResource({ url: 'doco_marketing.api.inbox.get_sla_status' })

// ── Catalog send (/cat picker) ─────────────────────────────────────────────────
// Search in-stock items from a conversation and send a selection as media messages.
// catalogCtx carries the conversation target; the picker reads catalogResults.
export const catalogOpen = ref(false)
export const catalogCtx = ref(null) // { reference_doctype, reference_name, channel, to } OR { comment_name } for a FB comment DM
export const catalogResults = createResource({ url: 'doco_marketing.api.catalog.search', auto: false })
export const catalogQuery = ref('')
export function openCatalog(ctx, initialQuery = '') {
  catalogCtx.value = ctx
  catalogQuery.value = initialQuery || ''
  catalogOpen.value = true
  runCatalogSearch()
}
export function closeCatalog() {
  catalogOpen.value = false
}
let _catTimer = null
export function onCatalogQuery(q) {
  catalogQuery.value = q
  clearTimeout(_catTimer)
  _catTimer = setTimeout(runCatalogSearch, 300)
}
export function runCatalogSearch() {
  catalogResults.submit({ query: catalogQuery.value || '', limit: 24 })
}
// Send the picked items into the active conversation (one media message per item).
export async function sendCatalogItems(itemCodes) {
  const c = catalogCtx.value
  if (!c || !itemCodes?.length) return { sent_count: 0 }
  // A FB comment target sends as a PRIVATE DM (opens it if needed); a conversation target
  // sends into the existing thread. Both reuse the same per-item card send server-side.
  const res = c.comment_name
    ? await call('doco_marketing.api.catalog.send_to_comment', {
        comment_name: c.comment_name,
        item_codes: JSON.stringify(itemCodes),
      })
    : await call('doco_marketing.api.catalog.send_items', {
        reference_doctype: c.reference_doctype,
        reference_name: c.reference_name,
        channel: c.channel,
        item_codes: JSON.stringify(itemCodes),
        to: c.to || undefined,
      })
  lastSendAt.value = Date.now()
  return res
}

export function initInbox(opts = {}) {
  reloadQueue()
  reloadUnassigned()
  reloadComments()
  commentCounts.fetch()
  channelCounts.fetch()
  overdue.fetch()
  autoAckCount.fetch() // "por aprobar" badge — count only on init; the list loads on tab open
  snoozedCount.fetch() // «Pospuestas» chip
  conversationTags.fetch() // 🏷 filter chips
  queueFilterOptions.fetch() // estado trato / lead / reparación (filter panel)
  // skipRestore: a ?deal= deep link owns the selection — restoreInbox() resolves
  // async and would clobber it with the previously-persisted conversation (audit H1).
  if (!opts.skipRestore) restoreInbox()
}

// ── Por aprobar (auto-acuse review) ────────────────────────────────────────────
export function reloadAutoAcks() {
  autoAcks.fetch()
  autoAckCount.fetch()
}
// Approve (and send) a drafted acuse, optionally with an edited body. This is the ONLY
// path that messages the customer — it routes through the role-gated controller.
export async function approveAutoAck(name, body) {
  await call('doco_marketing.api.auto_reply.approve', { name, body: body || undefined })
  reloadAutoAcks()
  reloadQueue() // the sent reply clears the conversation's Responder chip
  if (activeDeal.value) loadAutoAckForConvo(activeDealDoctype.value, activeDeal.value)
  if (activeDeal.value) loadThread() // the approved acuse now shows in the thread
}
export async function discardAutoAck(name) {
  await call('doco_marketing.api.auto_reply.discard', { name })
  reloadAutoAcks()
  if (activeDeal.value) loadAutoAckForConvo(activeDealDoctype.value, activeDeal.value)
}

// ── persist the open selection + mobile pane ───────────────────────────────────
// Opening a Contact / Deal-360 page is a real route nav, so App.vue's
// <router-view :key="$route.fullPath"> unmounts Inbox.vue; on back it remounts and
// runs initInbox again. The module singletons would survive the remount, but a full
// reload would not — so we snapshot to sessionStorage and rehydrate on init. Either
// way the user lands back on the same conversation and pane, not an empty inbox.
const PERSIST_KEY = 'doco_inbox_state'
function persistInbox() {
  try {
    sessionStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        deal: activeDeal.value,
        doctype: activeDealDoctype.value,
        unassigned: activeUnassigned.value,
        unassignedChannel: activeUnassignedChannel.value,
        view: mobileView.value,
        tab: activeTab.value,
      }),
    )
  } catch (e) {
    /* private mode / quota — persistence is best-effort */
  }
}
// snapshot on every selection/pane/tab change
watch([activeDeal, activeDealDoctype, activeUnassigned, mobileView, activeTab], persistInbox)

function restoreInbox() {
  let s = null
  try {
    s = JSON.parse(sessionStorage.getItem(PERSIST_KEY) || 'null')
  } catch (e) {
    s = null
  }
  if (s?.unassigned) {
    activeUnassigned.value = null // force selectUnassigned to re-load the orphan thread
    selectUnassigned(s.unassigned, s.unassignedChannel || 'whatsapp')
    if (s.view) mobileView.value = s.view
  } else if (s?.deal) {
    // Guard: the saved record may have been deleted since (a 404 storm otherwise —
    // get_communications / get_contact_card / get all 404). Verify it exists first.
    const doctype = s.doctype || 'CRM Deal'
    call('frappe.client.get_value', { doctype, filters: { name: s.deal }, fieldname: 'name' })
      .then((r) => {
        if (!r?.name) {
          sessionStorage.removeItem(PERSIST_KEY)
          resetInbox()
          return
        }
        activeDeal.value = null // force selectDeal to re-load (it early-returns on same id)
        selectDeal(s.deal, doctype)
        if (s.tab) activeTab.value = s.tab
        if (s.view) mobileView.value = s.view // restore the pane (e.g. context) they were on
      })
      .catch(() => {
        sessionStorage.removeItem(PERSIST_KEY)
        resetInbox()
      })
  } else {
    resetInbox()
  }
}

export function resetInbox() {
  activeDeal.value = null
  activeDealDoctype.value = 'CRM Deal'
  activeUnassigned.value = null
  activeUnassignedArchived.value = false
  activeCommentPost.value = null
  activeTab.value = 'conversation'
  mobileView.value = 'list' // back to the queue on (re)entry
  thread.data = null
  unassignedThread.data = null
  contactCard.data = null
  sla.data = null
}

export function reloadUnassigned() {
  unassigned.submit({ limit: 50 })
}

// ── paged queue (infinite-scroll) ──────────────────────────────────────────────
// The backend pages via start/limit; the SPA never did, so the queue was capped at the
// 50 most-recent. Accumulate pages into queueRows and append on scroll. queueReqId
// guards against out-of-order responses when the filter (search/channel) changes mid-fetch.
export const QUEUE_PAGE = 50
export const queueRows = ref([])
export const queueHasMore = ref(false)
export const queueLoadingMore = ref(false)
let _queueStart = 0
let _queueReqId = 0

// ── cold-start cache: last known queue rows, so the inbox paints instantly on
// mobile/slow links and the fresh fetch swaps in when it lands. Stale rows are
// real deals — opening one just loads its live thread. Search/filter reloads
// overwrite; only the unfiltered first page is persisted.
// Hardening (audit M2): key is namespaced PER USER (cookie user_id) so a second
// operator on the same browser never paints the first one's customers; entries
// expire after 24h; logout purges every doco-inbox-queue-* key (session store).
function _cacheUser() {
  try {
    const m = document.cookie.match(/(?:^|;\s*)user_id=([^;]*)/)
    return m ? decodeURIComponent(m[1]) : ''
  } catch (e) {
    return ''
  }
}
const QUEUE_CACHE_KEY = `doco-inbox-queue-v2:${_cacheUser()}`
const QUEUE_CACHE_TTL_MS = 24 * 3600 * 1000
export const queueFromCache = ref(false)
try {
  localStorage.removeItem('doco-inbox-queue-v1') // pre-namespace format
  const cached = JSON.parse(localStorage.getItem(QUEUE_CACHE_KEY) || 'null')
  if (
    cached &&
    Array.isArray(cached.rows) &&
    cached.rows.length &&
    Date.now() - (cached.t || 0) < QUEUE_CACHE_TTL_MS
  ) {
    queueRows.value = cached.rows
    queueFromCache.value = true
  }
} catch (e) {
  /* corrupt cache — ignore, fetch will repopulate */
}

function _rowKey(r) {
  return (r.ref_doctype || 'CRM Deal') + ':' + r.name
}

let _searchTimer = null
let _lastQueueFetch = 0
// merge=false (filter/search/user actions): REPLACE the list with the fresh first
// page — deliberate context switch, truncating deep scroll is correct.
// merge=true (realtime/catch-up): fresh first page moves to the top, previously
// loaded rows not in it are KEPT below — an inbound message must not throw away
// the operator's scrolled-in tail (the queue is offset-paged over a live-reordering
// list; see loadMoreQueue for the companion dedupe).
export function reloadQueue(opts = {}) {
  const merge = !!opts.merge
  if (!merge) _queueStart = 0
  const myId = ++_queueReqId
  _lastQueueFetch = Date.now()
  return queue
    .submit({
      channel: queueChannel.value || undefined,
      search: queueSearch.value || undefined,
      snoozed: inboxTab.value === 'snoozed' ? 1 : undefined,
      tag: queueTag.value || undefined,
      ...queueFilterParams(),
      limit: QUEUE_PAGE,
      start: 0,
    })
    .then(() => {
      if (myId !== _queueReqId) return // a newer reload superseded this page
      const fresh = queue.data || []
      if (merge) {
        const freshKeys = new Set(fresh.map(_rowKey))
        queueRows.value = fresh.concat(queueRows.value.filter((r) => !freshKeys.has(_rowKey(r))))
      } else {
        queueRows.value = fresh
      }
      queueHasMore.value = fresh.length === QUEUE_PAGE
      queueFromCache.value = false
      // Only the UNFILTERED list may seed the offline preview cache — caching a
      // filtered page would repaint it as "the inbox" on the next cold start.
      if (!queueChannel.value && !queueSearch.value && !queueFilterCount.value) {
        try {
          // trim the persisted preview — the cache must paint the list, not
          // archive conversations (audit M2)
          const rows = fresh.slice(0, 30).map((r) => ({
            ...r,
            last_message: (r.last_message || '').slice(0, 60),
          }))
          localStorage.setItem(QUEUE_CACHE_KEY, JSON.stringify({ t: Date.now(), rows }))
        } catch (e) {
          /* quota — skip */
        }
      }
    })
}

// Debounced realtime refresh: message bursts (send+ack, multi-webhook) collapse
// into ONE merge-reload, and a direct reload that just ran suppresses it — fixes
// the ≥2 queue fetches per inbound the audit flagged (L2).
let _qrTimer = null
export function scheduleQueueReload() {
  clearTimeout(_qrTimer)
  _qrTimer = setTimeout(() => {
    if (Date.now() - _lastQueueFetch < 500) return // a reload just covered this burst
    reloadQueue({ merge: true })
  }, 400)
}

// Fetch + append the next page. No-op while one is in flight or when the list is
// exhausted; a filter change (reloadQueue) bumps _queueReqId and drops a stale page.
export function loadMoreQueue() {
  if (!queueHasMore.value || queueLoadingMore.value) return
  queueLoadingMore.value = true
  _queueStart += QUEUE_PAGE
  const myId = _queueReqId
  // Keyset continuation (2026-07-26): echo the last row's sort key so the next
  // page resumes AFTER it in sort order — offset pages over the live-reordering
  // queue could MISS rows that moved across the boundary (dedupe only fixed the
  // duplicate half of that bug). Falls back to offset when the tail lacks keys.
  const tail = queueRows.value[queueRows.value.length - 1]
  return queue
    .submit({
      channel: queueChannel.value || undefined,
      search: queueSearch.value || undefined,
      snoozed: inboxTab.value === 'snoozed' ? 1 : undefined,
      tag: queueTag.value || undefined,
      ...queueFilterParams(),
      limit: QUEUE_PAGE,
      start: _queueStart,
      cursor_ts: tail?.sort_ts || undefined,
      cursor_name: tail?.sort_ts ? tail.name : undefined,
      cursor_rank: tail?.sort_ts ? tail.sort_rank || 1 : undefined,
    })
    .then(() => {
      queueLoadingMore.value = false
      if (myId !== _queueReqId) return // filter changed mid-flight — discard this page
      // DEDUPE on append: pages are offset slices of a list that reorders live
      // (an inbound message moves its row up), so a row crossing the page
      // boundary between fetches arrives twice — showed as duplicated
      // conversations in prod (2026-07-25).
      const seen = new Set(queueRows.value.map(_rowKey))
      queueRows.value = queueRows.value.concat((queue.data || []).filter((r) => !seen.has(_rowKey(r))))
      queueHasMore.value = (queue.data || []).length === QUEUE_PAGE
    })
    .catch(() => {
      queueLoadingMore.value = false
    })
}
export function onSearchInput(v) {
  queueSearch.value = v
  clearTimeout(_searchTimer)
  _searchTimer = setTimeout(reloadQueue, 300)
}
// (x) on the searchbox: empty + reload NOW — skipping the 300ms debounce so the
// full queue is back before the user's eye returns to the list.
export function clearQueueSearch() {
  clearTimeout(_searchTimer)
  if (!queueSearch.value) return
  queueSearch.value = ''
  reloadQueue()
}
export function setQueueChannel(ch) {
  queueChannel.value = ch
  reloadQueue()
}

export function selectDeal(name, doctype = 'CRM Deal') {
  activeUnassigned.value = null // leaving the triage view
  activeCommentPost.value = null
  mobileView.value = 'thread' // mobile: advance the stack to the conversation
  if (activeDeal.value === name && activeDealDoctype.value === doctype) return
  activeDeal.value = name
  activeDealDoctype.value = doctype
  activeTab.value = 'conversation'
  loadThread()
  loadContactCard()
  loadAutoAckForConvo(doctype, name) // surface any pending auto-ack to approve in context
  // mark read: clear the red unread dot optimistically, persist in background.
  const r = queueRows.value.find((x) => x.name === name && (x.ref_doctype || 'CRM Deal') === doctype)
  if (r) r.unread_dot = false
  markRead(doctype, name)
  // SLA is a CRM Deal concept; leads have none.
  if (doctype === 'CRM Deal') sla.submit({ reference_name: name })
  else sla.data = null
}

export async function markRead(doctype, name) {
  if (!doctype || !name) return
  try {
    await call('doco_marketing.api.inbox.mark_read', { reference_doctype: doctype, reference_name: name })
  } catch (e) {
    /* read-state is best-effort; never block the UI on it */
  }
}

// Manually close the amber "Responder" (needs-reply) chip without replying. The
// backend also auto-closes it when the deal reaches a terminal status (Won/Lost).
// A later inbound message re-raises it. Optimistic: drop the chip now, persist async.
export async function clearResponder(doctype, name) {
  if (!doctype || !name) return
  const r = queueRows.value.find((x) => x.name === name && (x.ref_doctype || 'CRM Deal') === doctype)
  if (r) r.unread = false
  try {
    await call('doco_marketing.api.inbox.clear_responder', { reference_doctype: doctype, reference_name: name })
  } catch (e) {
    reloadQueue() // revert the optimistic clear if the server rejected it
  }
}

export function loadContactCard() {
  if (!activeDeal.value) {
    contactCard.data = null
    return
  }
  contactCard.submit({ reference_doctype: activeDealDoctype.value, reference_name: activeDeal.value })
}

// Inline-save one field to the exact doc the resolver named (the deal/lead, the
// linked Customer, or its Address). Real wiring via the permission-checked
// frappe.client.set_value; then refresh the card + queue so the change shows.
export async function saveContactField(doctype, name, fieldname, value) {
  if (!doctype || !name || !fieldname) return
  await call('frappe.client.set_value', { doctype, name, fieldname, value })
  loadContactCard()
  reloadQueue()
}

export function selectUnassigned(id, channel = 'whatsapp', isArchived = false) {
  activeDeal.value = null // orphan threads have no deal/context panel
  activeCommentPost.value = null
  activeUnassigned.value = id
  activeUnassignedChannel.value = channel
  activeUnassignedArchived.value = isArchived // archived orphan → header offers Desarchivar
  mobileView.value = 'thread' // mobile: advance the stack to the orphan thread
  unassignedThread.submit(channel === 'messenger' ? { psid: id } : { phone: id })
  loadSuggestions()
}

// Auto-suggested existing Contact/Lead/Deal matches for the open orphan (by name +
// number). Surfaced as one-tap link chips — NEVER auto-linked.
export const suggestions = createResource({ url: 'doco_marketing.api.inbox.suggest_link_targets' })
export function loadSuggestions() {
  if (!activeUnassigned.value) {
    suggestions.data = []
    return
  }
  suggestions.submit({ channel: activeUnassignedChannel.value, identifier: activeUnassigned.value })
}

// Convert an orphan number to a Lead, Deal, or Customer; the backend re-points
// its messages. A Deal/Lead then enters the normal queue and we open it; a
// Customer files under its Contact (out of the deal/lead queue).
export async function assignUnassigned(id, targetDoctype, fields = {}, channel = 'whatsapp') {
  const params = { target_doctype: targetDoctype, ...fields }
  if (channel === 'messenger') params.psid = id
  else params.phone = id
  const res = await call('doco_marketing.api.inbox.assign_unassigned', params)
  activeUnassigned.value = null
  activeUnassignedArchived.value = false
  reloadUnassigned()
  reloadQueue()
  if (showArchived.value) reloadArchived() // converting an archived orphan drops it from Archivados
  if (res?.doctype === 'CRM Deal' || res?.doctype === 'CRM Lead') selectDeal(res.name, res.doctype)
  return res
}

// Archive an orphan (no lead/deal worth opening): it leaves "Sin asignar" but the thread
// stays reachable in Archivados + replyable, and a newer inbound auto-resurfaces it. Closes
// the open orphan workspace (it's no longer in the live list).
export async function archiveOrphan(channel, identifier) {
  const res = await call('doco_marketing.api.inbox.archive_orphan', { channel, identifier })
  activeUnassigned.value = null
  activeUnassignedArchived.value = false
  unassignedThread.data = null
  mobileView.value = 'list'
  reloadUnassigned()
  if (showArchived.value) reloadArchived()
  return res
}

// Bring an archived orphan back into "Sin asignar" now. Keeps the thread open (the operator
// may want to keep replying) and flips the header back to "Archivar".
export async function unarchiveOrphan(channel, identifier) {
  const res = await call('doco_marketing.api.inbox.unarchive_orphan', { channel, identifier })
  activeUnassignedArchived.value = false
  reloadUnassigned()
  reloadArchived()
  return res
}

// Universal LINK-TO-EXISTING: re-point an orphan (any channel) onto an existing
// Lead/Deal + bind its durable identity (PSID/phone) so future inbound auto-links.
export async function linkUnassignedToExisting(id, refDoctype, refName, channel = 'whatsapp') {
  const params = { reference_doctype: refDoctype, reference_name: refName }
  if (channel === 'messenger') params.psid = id
  else params.phone = id
  const res = await call('doco_marketing.api.inbox.assign_unassigned', params)
  reloadUnassigned()
  reloadQueue()
  // Linked to a Contact with no OPEN deal: the identity was bound (ledger) but the
  // conversation stays unassigned — don't navigate into a closed deal.
  if (res?.kept_unassigned) {
    reloadUnassignedThread()
    return res
  }
  activeUnassigned.value = null
  selectDeal(res.name, res.doctype)
  return res
}

export function loadThread() {
  if (!activeDeal.value) return
  // no channel filter — backend merges WhatsApp + Email; selector drives send only
  thread.submit({ reference_doctype: activeDealDoctype.value, reference_name: activeDeal.value })
}

// Optimistic queue-row patch (spec 3.7): apply locally, return an undo closure.
// Rows are keyed like _rowKey — a row that scrolled out of the loaded pages just
// returns null (nothing to patch; the reload covers it).
function _patchQueueRow(doctype, name, patch) {
  const key = doctype + ':' + name
  const idx = queueRows.value.findIndex((r) => _rowKey(r) === key)
  if (idx === -1) return null
  const prev = queueRows.value[idx]
  queueRows.value.splice(idx, 1, { ...prev, ...patch })
  return () => {
    const i = queueRows.value.findIndex((r) => _rowKey(r) === key)
    if (i !== -1) queueRows.value.splice(i, 1, prev)
  }
}

export async function setStage(status) {
  if (!activeDeal.value) return
  // optimistic (spec 3.7): the chip moves NOW; revert + toast if the server says no
  const undo = _patchQueueRow(activeDealDoctype.value, activeDeal.value, { status })
  try {
    await call('frappe.client.set_value', {
      doctype: activeDealDoctype.value,
      name: activeDeal.value,
      fieldname: 'status',
      value: status,
    })
  } catch (e) {
    undo?.()
    toast.error(e?.messages?.[0] || e?.message || __('No se pudo cambiar el estado'))
    return
  }
  scheduleQueueReload()
}

// Silent stage change ("Cambiar SIN avisar"): the server suppresses campaign
// auto-sends for this save — for stale orders closed late, so the customer
// doesn't get a confusing months-later WhatsApp.
export async function setStageSilent(status) {
  if (!activeDeal.value) return
  const undo = _patchQueueRow(activeDealDoctype.value, activeDeal.value, { status })
  try {
    await call('doco_marketing.api.inbox.set_status', {
      reference_doctype: activeDealDoctype.value,
      reference_name: activeDeal.value,
      status,
      silent: 1,
    })
  } catch (e) {
    undo?.()
    toast.error(e?.messages?.[0] || e?.message || __('No se pudo cambiar el estado'))
    return
  }
  scheduleQueueReload()
}

// Lost-stage capture. A status whose type is 'Lost' (Deal: Cancelado/Abandonado;
// Lead: Junk/Unqualified) can't be saved without a lost_reason — validate_lost_reason
// throws on BOTH CRM Deal and CRM Lead — so a bare setStage(status) is rejected and the
// inbox change silently no-ops. requestStage gates a Lost status behind a reason prompt;
// commitLostStage writes status + reason + notes together so validation passes.
export const lostStagePrompt = ref(null) // { status } while awaiting a reason, else null

export async function requestStage(status, type) {
  if (!activeDeal.value || status == null) return
  if (type === 'Lost') {
    lostStagePrompt.value = { status }
    return
  }
  // Completado/Entregado can auto-send WhatsApp to the customer — explicit
  // confirm before committing (wrong-WABA misclick guard, utils/statusGuard),
  // with the silent escape for stale orders.
  guardStatusChange(status, () => setStage(status), { onSilent: () => setStageSilent(status) })
}

export async function commitLostStage(reason, notes = '') {
  const p = lostStagePrompt.value
  if (!p || !activeDeal.value) return
  const undo = _patchQueueRow(activeDealDoctype.value, activeDeal.value, { status: p.status })
  try {
    await call('frappe.client.set_value', {
      doctype: activeDealDoctype.value,
      name: activeDeal.value,
      fieldname: { status: p.status, lost_reason: reason, lost_notes: notes || '' },
    })
  } catch (e) {
    undo?.()
    toast.error(e?.messages?.[0] || e?.message || __('No se pudo cambiar el estado'))
    return
  }
  lostStagePrompt.value = null
  scheduleQueueReload()
  loadThread()
}

export function cancelLostStage() {
  lostStagePrompt.value = null
}

// Catch-up after a realtime gap (socket reconnect, tab back from a long hidden
// stretch): any event emitted meanwhile is gone forever, so refetch every inbox
// surface + the open thread. This is the F5 the operator used to do by hand.
export function catchUpInbox() {
  reloadQueue({ merge: true }) // gap recovery must not truncate the scrolled tail
  reloadUnassigned()
  if (activeDeal.value) loadThread()
  else if (activeUnassigned.value) reloadUnassignedThread()
  channelCounts.reload()
  overdue.reload()
  autoAckCount.reload()
  commentCounts.reload()
}

// onThreadUpdate: wired to realtime in the page; reload if it's for the open deal.
export function onThreadUpdate(payload) {
  if (payload?.deal && payload.deal === activeDeal.value) loadThread()
  scheduleQueueReload() // debounced merge — bursts + the whatsapp_message reload coalesce
  channelCounts.reload() // a new message may flip a conversation's last_channel
  overdue.reload() // ...and a reply/inbound changes who's overdue
  autoAckCount.reload() // a reply may resolve a pending draft; an inbound may add one
  // ...and while the review list is on screen it must drop rows the server just
  // auto-discarded (deal Completado / repair Entregado close-out), not only the badge.
  if (inboxTab.value === 'aprobar') autoAcks.reload()
  snoozedCount.fetch() // snooze set/cleared elsewhere (or a cron wake) moves the chip
}

// ── Comentarios (Page-feed comments) ───────────────────────────────────────────
export function reloadComments() {
  return commentPosts.submit({
    status: commentStatus.value,
    search: commentSearch.value || undefined,
    limit: 60,
  })
}
let _cSearchTimer = null
export function setCommentSearch(q) {
  commentSearch.value = q
  clearTimeout(_cSearchTimer)
  _cSearchTimer = setTimeout(reloadComments, 300)
}
export function clearCommentSearch() {
  clearTimeout(_cSearchTimer)
  if (!commentSearch.value) return
  commentSearch.value = ''
  reloadComments()
}
// Omnichannel tab switch: scope the deal queue by channel, surface the right sections.
export function setInboxTab(tab) {
  inboxTab.value = tab
  setQueueChannel(tab === 'whatsapp' || tab === 'messenger' ? tab : null)
  if (tab === 'vencidos') overdue.fetch() // refresh the Vencidos list on open
  if (tab === 'aprobar') reloadAutoAcks() // refresh the drafts list on open
  if (tab === 'snoozed') snoozedCount.fetch() // refresh the chip on open
  // (setQueueChannel below always reloadQueue()s — the snoozed param reads inboxTab)
  if (tab === 'comments') {
    reloadComments()
    commentCounts.fetch()
  } else if (commentStatus.value !== 'New') {
    // leaving Comentarios — the blended 'Todos' compact section shows New again
    commentStatus.value = 'New'
    reloadComments()
  }
}
export function setCommentStatus(s) {
  commentStatus.value = s
  reloadComments()
}
// Open a POST group — the workspace shows the post + all its comments (FB-style).
export function selectCommentGroup(postId) {
  activeDeal.value = null
  activeUnassigned.value = null
  activeCommentPost.value = postId
  mobileView.value = 'thread'
}
// Reply under the comment publicly, or DM the commenter (private_replies → mints a
// Messenger thread that later surfaces in the inbox). Optimistic reload after.
export async function replyComment(name, message, mode = 'public') {
  const url =
    mode === 'private'
      ? 'doco_marketing.api.comments.reply_private'
      : 'doco_marketing.api.comments.reply_public'
  const res = await call(url, { comment_name: name, message })
  reloadComments()
  return res
}
export async function convertCommentToLead(name) {
  const lead = await call('doco_marketing.api.comments.create_lead', { comment_name: name })
  reloadComments()
  reloadQueue() // the new lead joins the conversation queue
  return lead
}
export async function hideComment(name, hidden = true) {
  await call('doco_marketing.api.comments.hide_comment', { comment_name: name, hidden: hidden ? 1 : 0 })
  reloadComments()
}
// realtime: a new/changed comment arrived (Social Comment after_insert).
export function onCommentUpdate() {
  reloadComments()
  commentCounts.reload()
}
// Jump to the Messenger DM thread a private reply created (its Lead/Deal, or orphan).
export async function openMessengerForPsid(psid) {
  if (!psid) return
  try {
    const t = await call('doco_marketing.api.comments.dm_target', { psid })
    if (t?.doctype && t?.name) selectDeal(t.name, t.doctype)
    else selectUnassigned(psid, 'messenger')
  } catch (e) {
    selectUnassigned(psid, 'messenger')
  }
}

// ── Messenger realtime + free orphan reply ─────────────────────────────────────
export function reloadUnassignedThread() {
  if (!activeUnassigned.value) return
  unassignedThread.submit(
    activeUnassignedChannel.value === 'messenger'
      ? { psid: activeUnassigned.value }
      : { phone: activeUnassigned.value },
  )
}

// Reply to an orphan Messenger thread WITHOUT assigning it — the PSID is the
// recipient, no CRM record needed. Stores a reference-less Outgoing row that stays
// in this thread; converting/linking later re-points every row onto the record.
export async function sendUnassignedMessenger(content, attach) {
  if (!activeUnassigned.value || (!content?.trim() && !attach)) return
  const res = await call('doco_marketing.api.inbox.send_unassigned_messenger', {
    psid: activeUnassigned.value,
    content: content || undefined,
    attach: attach || undefined,
  })
  lastSendAt.value = Date.now() // suppress the echo self-ping
  reloadUnassignedThread()
  reloadUnassigned()
  return res
}

// Messenger inbound/echo realtime (webhook → publish_thread_update — now fires for
// orphans too, the missing piece that made Messenger surface only after a WABA msg).
// Refresh the queue + Sin-asignar, and the open orphan thread if its PSID matches.
// The OPEN ASSIGNED thread is refreshed by Activities.vue's own messenger listener.
export function onMessengerInbound(payload) {
  reloadQueue()
  reloadUnassigned()
  if (
    activeUnassigned.value &&
    activeUnassignedChannel.value === 'messenger' &&
    payload?.psid &&
    String(payload.psid) === String(activeUnassigned.value)
  ) {
    reloadUnassignedThread()
  }
}

// ── Bitácora: unified cross-channel ledger (WhatsApp + Messenger + FB comments) ──
export const ledger = createResource({ url: 'doco_marketing.api.inbox.get_contact_ledger' })
// consent timeline (manager-gated server-side; 403 for reps → section self-hides)
export const consentHistory = createResource({ url: 'doco_marketing.api.consent.get_consent_history' })
export const ledgerOpen = ref(false)
export function openLedger() {
  if (!activeDeal.value) return
  ledgerOpen.value = true
  const args = { reference_doctype: activeDealDoctype.value, reference_name: activeDeal.value }
  ledger.submit(args)
  consentHistory.data = null
  consentHistory.submit(args)
}

// presentational helpers now live in crmFormat.js (shared with non-inbox surfaces)
export {
  avatarColor,
  initials,
  GRADE_COLORS,
  CHANNEL_META,
  timeAgo,
  hhmm,
} from '@/composables/crmFormat'
