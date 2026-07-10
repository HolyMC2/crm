<!--
  Inbox / Deal workspace — FCRM redesign default workspace (handoff §5.1).
  Desktop: 3-pane row (conversation queue | deal workspace | context panel).
  Mobile (<640px): WhatsApp-style single-pane stack — list → thread → context.
  Stack state in the inbox composable (mobileView); hardware-back pops a pane.
  Data via doco_marketing.api.inbox.* (B1). Realtime refresh on thread_update + WA events.
-->
<template>
  <!-- desktop: all three panes side-by-side (unchanged) -->
  <div v-if="!isMobile" class="flex min-h-0 w-full flex-1">
    <ConversationQueue v-if="!queueCollapsed" />
    <button
      v-else
      class="flex w-7 flex-none items-center justify-center border-r border-outline-gray-1 text-ink-gray-4 hover:bg-surface-gray-2"
      :aria-label="__('Mostrar bandeja')"
      :title="__('Mostrar bandeja')"
      @click="queueCollapsed = false"
    >
      ⟩
    </button>
    <UnassignedWorkspace v-if="activeUnassigned" />
    <CommentWorkspace v-else-if="activeCommentPost" />
    <DealWorkspace v-else />
    <DealContextPanel v-if="activeDeal" />
  </div>

  <!-- mobile: one pane at a time. v-show (not v-if) keeps panes mounted so the
       thread scroll + composer survive drilling in/out, like a native app. -->
  <div v-else class="flex min-h-0 w-full flex-1 flex-col">
    <ConversationQueue v-show="mobileView === 'list'" />
    <div v-show="mobileView === 'thread'" class="flex min-h-0 flex-1 flex-col">
      <UnassignedWorkspace v-if="activeUnassigned" />
      <CommentWorkspace v-else-if="activeCommentPost" />
      <DealWorkspace v-else />
    </div>
    <div v-show="mobileView === 'context'" class="flex min-h-0 flex-1 flex-col">
      <DealContextPanel v-if="activeDeal" />
    </div>
  </div>

  <!-- cross-channel ledger (Bitácora) — overlay, single instance -->
  <LedgerModal />
</template>

<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { globalStore } from '@/stores/global'
import { isMobile } from '@/composables/breakpoint'
import ConversationQueue from '@/components/doco/inbox/ConversationQueue.vue'
import DealWorkspace from '@/components/doco/inbox/DealWorkspace.vue'
import UnassignedWorkspace from '@/components/doco/inbox/UnassignedWorkspace.vue'
import CommentWorkspace from '@/components/doco/inbox/CommentWorkspace.vue'
import DealContextPanel from '@/components/doco/inbox/DealContextPanel.vue'
import LedgerModal from '@/components/doco/inbox/LedgerModal.vue'
import {
  activeDeal,
  activeDealDoctype,
  activeUnassigned,
  activeCommentPost,
  activeUnassignedChannel,
  queue,
  queueCollapsed,
  mobileView,
  lastSendAt,
  initInbox,
  reloadQueue,
  reloadUnassigned,
  reloadUnassignedThread,
  selectDeal,
  markRead,
  onThreadUpdate,
  onCommentUpdate,
  onMessengerInbound,
  catchUpInbox,
} from '@/composables/inbox'
import { playPing } from '@/composables/notificationSound'

const { $socket } = globalStore()
const route = useRoute()

// crm core (apps/crm/crm/api/whatsapp.py:on_update) emits a single
// `whatsapp_message` event for every WhatsApp Message insert/update, both
// directions, payload { reference_doctype, reference_name }. The old code
// listened for `whatsapp_message_in` / `whatsapp_message_out`, which nothing
// emits — so inbound messages never refreshed the LEFT QUEUE (had to F5). This
// owns the queue/preview only; the open thread's bubbles are refreshed by the
// upstream Activities component's own `whatsapp_message` handler.
// playPing self-gates on the sound toggle (composables/notificationSound). It
// only fires here on a genuinely new inbound — detected by the unread-dot count
// rising after a reload — so outbound status echoes and our own sends don't ping.
let prevUnread = 0
function onWaMessage(payload) {
  reloadUnassigned() // a new inbound from an unknown number adds a Sin-asignar row
  // Un-linked inbound (Sin asignar): if that orphan's thread is the one open,
  // refresh its bubbles too — same catch Messenger already had (onMessengerInbound).
  if (
    !payload?.reference_name &&
    payload?.phone &&
    activeUnassigned.value &&
    activeUnassignedChannel.value !== 'messenger' &&
    String(payload.phone).replace(/\D/g, '').endsWith(String(activeUnassigned.value).replace(/\D/g, '').slice(-10))
  ) {
    reloadUnassignedThread()
  }
  reloadQueue().then(() => {
    // the conversation you're actively viewing stays read
    if (activeDeal.value) {
      const r = (queue.data || []).find(
        (x) => x.name === activeDeal.value && (x.ref_doctype || 'CRM Deal') === activeDealDoctype.value,
      )
      if (r && r.unread_dot) {
        r.unread_dot = false
        markRead(activeDealDoctype.value, activeDeal.value)
      }
    }
    const now = (queue.data || []).filter((r) => r.unread_dot).length
    if (now > prevUnread && Date.now() - lastSendAt.value > 3000) playPing()
    prevUnread = now
  })
}

// Messenger realtime (webhook → publish_thread_update, now fires for orphans too).
// Refresh queue + Sin-asignar + the open orphan thread; ping on a genuine inbound.
function onMessenger(payload) {
  onMessengerInbound(payload)
  if (payload?.direction === 'Incoming' && Date.now() - lastSendAt.value > 3000) playPing()
}

// ── mobile back-stack ──────────────────────────────────────────────────────
// Treat each drill-in (list→thread→context) as a pushed history entry so the
// Android/gesture back button pops one pane instead of leaving the inbox.
// Forward transitions push; popstate is the SINGLE place that walks back, so
// the in-app back buttons (DealHeader / DealContextPanel) just call history.back().
const DEPTH = { list: 0, thread: 1, context: 2 }
const FROM_DEPTH = ['list', 'thread', 'context']
let suppressPush = false
let mounting = false // restoring state on mount drives mobileView itself; don't push then
// flush:'sync' so the guard is reliable — restore changes mobileView synchronously
// inside onMounted, and we rebuild the history stack explicitly afterwards.
watch(
  mobileView,
  (nv, ov) => {
    if (mounting || !isMobile.value || nv === ov) return
    if (suppressPush) {
      suppressPush = false
      return
    }
    // merge into the existing state so vue-router's own bookkeeping survives; URL
    // stays /inbox (empty url arg), so the router sees no route change on back.
    if (DEPTH[nv] > DEPTH[ov]) history.pushState({ ...history.state, inboxDepth: DEPTH[nv] }, '')
  },
  { flush: 'sync' },
)
function onPopState(e) {
  if (!isMobile.value) return
  const depth = e.state?.inboxDepth ?? 0
  const target = FROM_DEPTH[Math.min(2, Math.max(0, depth))]
  if (target !== mobileView.value) {
    suppressPush = true // this is a back-walk, don't re-push
    mobileView.value = target
  }
}

// ── realtime catch-up ──────────────────────────────────────────────────────
// Events fired while the socket was down or the tab slept are lost forever —
// the reason "some messages only show after F5". Two recovery signals:
// socket.js announces a reconnect after a real gap; and a tab returning to the
// foreground after ≥60s hidden (sleep/phone-lock throttling can starve the
// socket without a clean disconnect). Both trigger one full inbox refetch.
function onSocketReconnected() {
  catchUpInbox()
}
let hiddenAt = 0
function onVisibility() {
  if (document.hidden) {
    hiddenAt = Date.now()
  } else if (hiddenAt && Date.now() - hiddenAt > 60_000) {
    hiddenAt = 0
    catchUpInbox()
  }
}

onMounted(() => {
  mounting = true
  initInbox() // restores the last conversation/pane, then loads queue + counts
  if (route.query.deal) selectDeal(String(route.query.deal)) // deep link from Tasks "open conversation"
  // Rebuild the mobile back-stack to match the restored pane so hardware-back
  // walks list ← thread ← context instead of jumping straight out of the inbox.
  if (isMobile.value) {
    const depth = DEPTH[mobileView.value] || 0
    history.replaceState({ ...history.state, inboxDepth: 0 }, '')
    for (let i = 1; i <= depth; i++) history.pushState({ ...history.state, inboxDepth: i }, '')
  }
  mounting = false
  $socket?.on('doco_marketing:thread_update', onThreadUpdate)
  $socket?.on('doco_marketing:comment_update', onCommentUpdate)
  $socket?.on('messenger_message', onMessenger)
  $socket?.on('whatsapp_message', onWaMessage)
  window.addEventListener('popstate', onPopState)
  window.addEventListener('socket:reconnected', onSocketReconnected)
  document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => {
  $socket?.off('doco_marketing:thread_update', onThreadUpdate)
  $socket?.off('doco_marketing:comment_update', onCommentUpdate)
  $socket?.off('messenger_message', onMessenger)
  $socket?.off('whatsapp_message', onWaMessage)
  window.removeEventListener('popstate', onPopState)
  window.removeEventListener('socket:reconnected', onSocketReconnected)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>
