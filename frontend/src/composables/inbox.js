// Inbox state + data layer for the FCRM redesign Phase 2 (handoff §5.1).
// Module-level reactive singletons (same pattern as composables/settings.js) so the
// 3-pane tree shares state without prop-drilling. Thin client over the B1 backend:
// doco_marketing.api.inbox.* — itself a read layer over crm WhatsApp + Communication.
import { ref, watch, computed } from 'vue'
import { createResource, call } from 'frappe-ui'

// ── shared UI state ──────────────────────────────────────────────────────────
export const activeDeal = ref(null) // selected record name (CRM Deal OR CRM Lead)
export const activeDealDoctype = ref('CRM Deal') // 'CRM Deal' | 'CRM Lead' — leads now share the queue
export const activeUnassigned = ref(null) // phone (WhatsApp) or PSID (Messenger) of the open "Sin asignar" orphan
export const activeUnassignedChannel = ref('whatsapp') // 'whatsapp' | 'messenger' — which orphan kind is open
export const activeChannel = ref('whatsapp') // send channel + bubble style
export const activeTab = ref('conversation') // conversation|activity|repair
export const convoTemplateOpen = ref(false) // macro -> open the WhatsApp template review modal in the convo
export const composeMode = ref('reply') // reply|note|comment
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
export function mobileBack() {
  window.history.back()
}

// ── resources ────────────────────────────────────────────────────────────────
export const queue = createResource({
  url: 'doco_marketing.api.inbox.get_conversation_queue',
  params: { limit: 50 },
})
export const channels = createResource({ url: 'doco_marketing.api.inbox.get_channels' })
// Per-tenant feature flags. has_taller gates the reparaciones surfaces so the inbox
// runs cleanly on a tenant without taller (e.g. mumu). Default false until loaded —
// safe: never request taller-only fields/endpoints before we know they exist.
export const features = createResource({
  url: 'doco_marketing.api.inbox.get_inbox_features',
  cache: 'inbox-features',
  auto: true,
})
export const hasTaller = computed(() => !!features.data?.has_taller)
export const thread = createResource({ url: 'doco_marketing.api.inbox.get_communications' })
// "Sin asignar": inbound WhatsApp from numbers with no Contact/Lead/Deal.
export const unassigned = createResource({
  url: 'doco_marketing.api.inbox.get_unassigned_conversations',
  params: { limit: 50 },
  auto: false,
})
export const unassignedThread = createResource({ url: 'doco_marketing.api.inbox.get_unassigned_thread' })
// Editable contact/customer card for the active deal/lead (resolver names the
// exact doc+field each value lives on; edits go via frappe.client.set_value).
export const contactCard = createResource({ url: 'doco_marketing.api.inbox.get_contact_card' })
export const sla = createResource({ url: 'doco_marketing.api.inbox.get_sla_status' })

export function initInbox() {
  channels.fetch()
  reloadQueue()
  reloadUnassigned()
  restoreInbox() // re-open the conversation/pane the user left (survives route round-trips + reloads)
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
    selectUnassigned(s.unassigned)
    if (s.view) mobileView.value = s.view
  } else if (s?.deal) {
    activeDeal.value = null // force selectDeal to re-load (it early-returns on same id)
    selectDeal(s.deal, s.doctype || 'CRM Deal')
    if (s.tab) activeTab.value = s.tab
    if (s.view) mobileView.value = s.view // restore the pane (e.g. context) they were on
  } else {
    resetInbox()
  }
}

export function resetInbox() {
  activeDeal.value = null
  activeDealDoctype.value = 'CRM Deal'
  activeUnassigned.value = null
  activeTab.value = 'conversation'
  activeChannel.value = 'whatsapp'
  mobileView.value = 'list' // back to the queue on (re)entry
  thread.data = null
  unassignedThread.data = null
  contactCard.data = null
  sla.data = null
}

export function reloadUnassigned() {
  unassigned.submit({ limit: 50 })
}

let _searchTimer = null
export function reloadQueue() {
  return queue.submit({
    channel: queueChannel.value || undefined,
    search: queueSearch.value || undefined,
    limit: 50,
  })
}
export function onSearchInput(v) {
  queueSearch.value = v
  clearTimeout(_searchTimer)
  _searchTimer = setTimeout(reloadQueue, 300)
}
export function setQueueChannel(ch) {
  queueChannel.value = ch
  reloadQueue()
}

export function selectDeal(name, doctype = 'CRM Deal') {
  activeUnassigned.value = null // leaving the triage view
  mobileView.value = 'thread' // mobile: advance the stack to the conversation
  if (activeDeal.value === name && activeDealDoctype.value === doctype) return
  activeDeal.value = name
  activeDealDoctype.value = doctype
  activeTab.value = 'conversation'
  loadThread()
  loadContactCard()
  // mark read: clear the red unread dot optimistically, persist in background.
  const r = (queue.data || []).find((x) => x.name === name && (x.ref_doctype || 'CRM Deal') === doctype)
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
  const r = (queue.data || []).find((x) => x.name === name && (x.ref_doctype || 'CRM Deal') === doctype)
  if (r) r.unread = false
  try {
    await call('doco_marketing.api.inbox.clear_responder', { reference_doctype: doctype, reference_name: name })
  } catch (e) {
    reloadQueue() // revert the optimistic clear if the server rejected it
  }
}

// Send a one-off message on an EXPLICIT channel (whatsapp/email), bypassing the
// composer's activeChannel — used by the Reparación tab "send summary" + "send photo"
// actions. Email needs an explicit recipient (no auto-resolve); whatsapp auto-resolves
// `to`. `attach` is a publicly-fetchable URL (signed S3 / public file) — WhatsApp sends
// it as a media link (Meta fetches it); email downloads the bytes and attaches them.
export async function sendOnChannel(channel, content, { to, attach } = {}) {
  if (!activeDeal.value || (!content && !attach)) return
  const res = await call('doco_marketing.api.inbox.send_message', {
    reference_doctype: activeDealDoctype.value,
    reference_name: activeDeal.value,
    channel,
    content: content || undefined,
    to: to || undefined,
    attach: attach || undefined,
    marketing: 0,
  })
  lastSendAt.value = Date.now() // suppress the echo self-ping
  loadThread()
  reloadQueue()
  return res
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

export function selectUnassigned(id, channel = 'whatsapp') {
  activeDeal.value = null // orphan threads have no deal/context panel
  activeUnassigned.value = id
  activeUnassignedChannel.value = channel
  mobileView.value = 'thread' // mobile: advance the stack to the orphan thread
  unassignedThread.submit(channel === 'messenger' ? { psid: id } : { phone: id })
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
  reloadUnassigned()
  reloadQueue()
  if (res?.doctype === 'CRM Deal' || res?.doctype === 'CRM Lead') selectDeal(res.name, res.doctype)
  return res
}

// Universal LINK-TO-EXISTING: re-point an orphan (any channel) onto an existing
// Lead/Deal + bind its durable identity (PSID/phone) so future inbound auto-links.
export async function linkUnassignedToExisting(id, refDoctype, refName, channel = 'whatsapp') {
  const params = { reference_doctype: refDoctype, reference_name: refName }
  if (channel === 'messenger') params.psid = id
  else params.phone = id
  const res = await call('doco_marketing.api.inbox.assign_unassigned', params)
  activeUnassigned.value = null
  reloadUnassigned()
  reloadQueue()
  selectDeal(res.name, res.doctype)
  return res
}

export function loadThread() {
  if (!activeDeal.value) return
  // no channel filter — backend merges WhatsApp + Email; selector drives send only
  thread.submit({ reference_doctype: activeDealDoctype.value, reference_name: activeDeal.value })
}

export async function sendMessage(content, { to, template } = {}) {
  if (!activeDeal.value) return
  const res = await call('doco_marketing.api.inbox.send_message', {
    reference_doctype: activeDealDoctype.value,
    reference_name: activeDeal.value,
    channel: activeChannel.value,
    content: content || undefined,
    to: to || undefined,
    template: template || undefined,
    marketing: 0,
  })
  lastSendAt.value = Date.now() // the echo realtime event shouldn't ping
  loadThread()
  reloadQueue()
  return res
}

export async function savePrivateNote(content, mentions = []) {
  if (!activeDeal.value) return
  const res = await call('doco_marketing.api.inbox.save_private_note', {
    reference_doctype: 'CRM Deal',
    reference_name: activeDeal.value,
    content,
    mentions,
  })
  return res
}

export async function setStage(status) {
  if (!activeDeal.value) return
  await call('frappe.client.set_value', {
    doctype: activeDealDoctype.value,
    name: activeDeal.value,
    fieldname: 'status',
    value: status,
  })
  reloadQueue()
}

// onThreadUpdate: wired to realtime in the page; reload if it's for the open deal.
export function onThreadUpdate(payload) {
  if (payload?.deal && payload.deal === activeDeal.value) loadThread()
  reloadQueue()
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
