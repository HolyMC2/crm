// Inbox state + data layer for the FCRM redesign Phase 2 (handoff §5.1).
// Module-level reactive singletons (same pattern as composables/settings.js) so the
// 3-pane tree shares state without prop-drilling. Thin client over the B1 backend:
// doco_marketing.api.inbox.* — itself a read layer over crm WhatsApp + Communication.
import { ref } from 'vue'
import { createResource, call } from 'frappe-ui'

// ── shared UI state ──────────────────────────────────────────────────────────
export const activeDeal = ref(null) // selected record name (CRM Deal OR CRM Lead)
export const activeDealDoctype = ref('CRM Deal') // 'CRM Deal' | 'CRM Lead' — leads now share the queue
export const activeUnassigned = ref(null) // phone string when viewing a "Sin asignar" orphan thread
export const activeChannel = ref('whatsapp') // send channel + bubble style
export const activeTab = ref('conversation') // conversation|activity|repair
export const composeMode = ref('reply') // reply|note|comment
export const queueChannel = ref(null) // null = Todas
export const queueSearch = ref('')
export const lastSendAt = ref(0) // epoch ms of our last outgoing send (suppress self-ping)
export const queueCollapsed = ref(false) // hide the left queue pane for a wider workspace

// ── resources ────────────────────────────────────────────────────────────────
export const queue = createResource({
  url: 'doco_marketing.api.inbox.get_conversation_queue',
  params: { limit: 50 },
})
export const channels = createResource({ url: 'doco_marketing.api.inbox.get_channels' })
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
  resetInbox() // module singletons persist across navigations — clear stale deal/thread
  channels.fetch()
  reloadQueue()
  reloadUnassigned()
}

export function resetInbox() {
  activeDeal.value = null
  activeDealDoctype.value = 'CRM Deal'
  activeUnassigned.value = null
  activeTab.value = 'conversation'
  activeChannel.value = 'whatsapp'
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

export function selectUnassigned(phone) {
  activeDeal.value = null // orphan threads have no deal/context panel
  activeUnassigned.value = phone
  unassignedThread.submit({ phone })
}

// Convert an orphan number to a Lead, Deal, or Customer; the backend re-points
// its messages. A Deal/Lead then enters the normal queue and we open it; a
// Customer files under its Contact (out of the deal/lead queue).
export async function assignUnassigned(phone, targetDoctype, fields = {}) {
  const res = await call('doco_marketing.api.inbox.assign_unassigned', {
    phone,
    target_doctype: targetDoctype,
    ...fields,
  })
  activeUnassigned.value = null
  reloadUnassigned()
  reloadQueue()
  if (res?.doctype === 'CRM Deal' || res?.doctype === 'CRM Lead') selectDeal(res.name, res.doctype)
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
