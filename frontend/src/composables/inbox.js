// Inbox state + data layer for the FCRM redesign Phase 2 (handoff §5.1).
// Module-level reactive singletons (same pattern as composables/settings.js) so the
// 3-pane tree shares state without prop-drilling. Thin client over the B1 backend:
// doco_marketing.api.inbox.* — itself a read layer over crm WhatsApp + Communication.
import { ref } from 'vue'
import { createResource, call } from 'frappe-ui'

// ── shared UI state ──────────────────────────────────────────────────────────
export const activeDeal = ref(null) // CRM Deal name
export const activeChannel = ref('whatsapp') // send channel + bubble style
export const activeTab = ref('conversation') // conversation|activity|repair|tasks
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
  channels.fetch()
  reloadQueue()
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

// ── view helpers ─────────────────────────────────────────────────────────────
const AV_COLORS = [
  ['#e6d4f2', '#7b3fa0'],
  ['#cfe3ff', '#2f6fed'],
  ['#ffe0ec', '#c12f6c'],
  ['#d9f2e3', '#16a34a'],
  ['#fde8c8', '#d97706'],
  ['#dbeafe', '#1d4ed8'],
]
export function avatarColor(s) {
  let h = 0
  for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AV_COLORS[h % AV_COLORS.length]
}
export function initials(name) {
  const n = String(name || '').trim()
  if (!n) return '?'
  const p = n.split(/\s+/)
  return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '?'
}

// score band → [text, bg] (handoff §8)
export const GRADE_COLORS = {
  A: ['#16a34a', '#e9f7ef'],
  B: ['#2f6fed', '#eaf1fe'],
  C: ['#d9930b', '#fdf6e9'],
  D: ['#e5484d', '#fdecec'],
}

// channel key → [label, dot]
export const CHANNEL_META = {
  whatsapp: ['WhatsApp', '#25d366'],
  messenger: ['Messenger', '#0084ff'],
  instagram: ['Instagram', '#e1306c'],
  tiktok: ['TikTok', '#1c2230'],
  email: ['Email', '#5b6472'],
}

function _date(ts) {
  if (!ts) return null
  const d = new Date(String(ts).replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}
export function timeAgo(ts) {
  const d = _date(ts)
  if (!d) return ''
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
export function hhmm(ts) {
  const d = _date(ts)
  return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
}
