<!--
  Inbox / Deal workspace — FCRM redesign default workspace (handoff §5.1).
  3-pane: conversation queue | deal workspace (header + tabs + composer) | context panel.
  Data via doco_marketing.api.inbox.* (B1). Realtime refresh on thread_update + WA events.
-->
<template>
  <div class="flex min-h-0 w-full flex-1">
    <ConversationQueue />
    <DealWorkspace />
    <DealContextPanel v-if="activeDeal" />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'frappe-ui'
import { globalStore } from '@/stores/global'
import ConversationQueue from '@/components/doco/inbox/ConversationQueue.vue'
import DealWorkspace from '@/components/doco/inbox/DealWorkspace.vue'
import DealContextPanel from '@/components/doco/inbox/DealContextPanel.vue'
import {
  activeDeal,
  initInbox,
  loadThread,
  reloadQueue,
  selectDeal,
  onThreadUpdate,
} from '@/composables/inbox'

const { $socket } = globalStore()
const route = useRoute()

function onWaEvent() {
  loadThread()
  reloadQueue()
}
function onWaIn() {
  toast.success(__('Nuevo mensaje de WhatsApp'))
  onWaEvent()
}

onMounted(() => {
  initInbox() // clears any stale singleton state, then loads queue/channels
  if (route.query.deal) selectDeal(String(route.query.deal)) // deep link from Tasks "open conversation"
  $socket?.on('doco_marketing:thread_update', onThreadUpdate)
  $socket?.on('whatsapp_message_in', onWaIn)
  $socket?.on('whatsapp_message_out', onWaEvent)
})
onUnmounted(() => {
  $socket?.off('doco_marketing:thread_update', onThreadUpdate)
  $socket?.off('whatsapp_message_in', onWaIn)
  $socket?.off('whatsapp_message_out', onWaEvent)
})
</script>
