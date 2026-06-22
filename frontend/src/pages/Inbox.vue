<!--
  Inbox / Deal workspace — FCRM redesign default workspace (handoff §5.1).
  3-pane: conversation queue | deal workspace (header + tabs + composer) | context panel.
  Data via doco_marketing.api.inbox.* (B1). Realtime refresh on thread_update + WA events.
-->
<template>
  <div class="flex min-h-0 w-full flex-1">
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
    <DealWorkspace v-else />
    <DealContextPanel v-if="activeDeal" />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { globalStore } from '@/stores/global'
import ConversationQueue from '@/components/doco/inbox/ConversationQueue.vue'
import DealWorkspace from '@/components/doco/inbox/DealWorkspace.vue'
import UnassignedWorkspace from '@/components/doco/inbox/UnassignedWorkspace.vue'
import DealContextPanel from '@/components/doco/inbox/DealContextPanel.vue'
import {
  activeDeal,
  activeDealDoctype,
  activeUnassigned,
  queue,
  queueCollapsed,
  lastSendAt,
  initInbox,
  reloadQueue,
  reloadUnassigned,
  selectDeal,
  markRead,
  onThreadUpdate,
} from '@/composables/inbox'

const { $socket } = globalStore()
const route = useRoute()

// crm core (apps/crm/crm/api/whatsapp.py:on_update) emits a single
// `whatsapp_message` event for every WhatsApp Message insert/update, both
// directions, payload { reference_doctype, reference_name }. The old code
// listened for `whatsapp_message_in` / `whatsapp_message_out`, which nothing
// emits — so inbound messages never refreshed the LEFT QUEUE (had to F5). This
// owns the queue/preview only; the open thread's bubbles are refreshed by the
// upstream Activities component's own `whatsapp_message` handler.
// Notification ping (Web Audio, no asset). Can't ship the actual WhatsApp sound
// (copyrighted); this is a close two-tone "pop". Only fires on a genuinely new
// inbound — detected by the unread-dot count rising after a reload — so outbound
// status echoes (sent→delivered→read) and our own sends don't ping.
let audioCtx = null
function playPing() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const t = audioCtx.currentTime
    for (const [freq, start, dur] of [[880, t, 0.09], [1175, t + 0.07, 0.13]]) {
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(gain).connect(audioCtx.destination)
      osc.start(start)
      osc.stop(start + dur + 0.03)
    }
  } catch (e) {
    /* autoplay policy / no audio — ignore */
  }
}

let prevUnread = 0
function onWaMessage() {
  reloadUnassigned() // a new inbound from an unknown number adds a Sin-asignar row
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

onMounted(() => {
  initInbox() // clears any stale singleton state, then loads queue/channels
  if (route.query.deal) selectDeal(String(route.query.deal)) // deep link from Tasks "open conversation"
  $socket?.on('doco_marketing:thread_update', onThreadUpdate)
  $socket?.on('whatsapp_message', onWaMessage)
})
onUnmounted(() => {
  $socket?.off('doco_marketing:thread_update', onThreadUpdate)
  $socket?.off('whatsapp_message', onWaMessage)
})
</script>
