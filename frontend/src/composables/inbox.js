// Inbox state + data layer for the FCRM redesign Phase 2 (handoff §5.1).
// Module-level reactive singletons (same pattern as composables/settings.js) so the
// 3-pane tree shares state without prop-drilling. Thin client over the B1 backend:
// doco_marketing.api.inbox.* — itself a read layer over crm WhatsApp + Communication.
import { ref } from 'vue'
import { createResource, call } from 'frappe-ui'

// ── shared UI state ──────────────────────────────────────────────────────────
export const activeDeal = ref(null) // CRM Deal name
export const activeChannel = ref('whatsapp') // send channel + bubble style
export const activeTab = ref('conversation') // conversation|activity|repair
export const composeMode = ref('reply') // reply|note|comment
export const queueChannel = ref(null) // null = Todas
export const queueSearch = ref('')

// ── resources ────────────────────────────────────────────────────────────────
export const queue = createResource({
  url: 'doco_marketing.api.inbox.get_conversation_queue',
  params: { limit: 50 },
})
export const channels = createResource({ url: 'doco_marketing.api.inbox.get_channels' })
export const thread = createResource({ url: 'doco_marketing.api.inbox.get_communications' })
export const sla = createResource({ url: 'doco_marketing.api.inbox.get_sla_status' })

export function initInbox() {
  resetInbox() // module singletons persist across navigations — clear stale deal/thread
  channels.fetch()
  reloadQueue()
}

export function resetInbox() {
  activeDeal.value = null
  activeTab.value = 'conversation'
  activeChannel.value = 'whatsapp'
  thread.data = null
  sla.data = null
}

let _searchTimer = null
export function reloadQueue() {
  queue.submit({
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

export function selectDeal(name) {
  if (activeDeal.value === name) return
  activeDeal.value = name
  activeTab.value = 'conversation'
  loadThread()
  sla.submit({ reference_name: name })
}

export function loadThread() {
  if (!activeDeal.value) return
  // no channel filter — backend merges WhatsApp + Email; selector drives send only
  thread.submit({ reference_doctype: 'CRM Deal', reference_name: activeDeal.value })
}

export async function sendMessage(content, { to, template } = {}) {
  if (!activeDeal.value) return
  const res = await call('doco_marketing.api.inbox.send_message', {
    reference_doctype: 'CRM Deal',
    reference_name: activeDeal.value,
    channel: activeChannel.value,
    content: content || undefined,
    to: to || undefined,
    template: template || undefined,
    marketing: 0,
  })
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
    doctype: 'CRM Deal',
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
