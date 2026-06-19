<!--
  Inbox / Deal workspace — FCRM redesign default workspace (handoff §5.1).
  3-pane: conversation queue | deal workspace (header + tabs + composer) | context panel.
  Data via doco_marketing.api.inbox.* (B1). Realtime refresh on thread_update + WA events.
-->
<template>
  <div class="flex min-h-0 w-full flex-1">
    <ConversationQueue />

    <!-- deal workspace -->
    <div class="flex min-w-0 flex-1 flex-col">
      <template v-if="activeDeal">
        <DealHeader />

        <!-- tab strip -->
        <div
          class="flex h-11 flex-none items-center gap-0.5 border-b border-outline-gray-1 px-3 text-[13px]"
        >
          <button
            v-for="t in tabs"
            :key="t.key"
            class="flex h-11 items-center gap-1.5 px-[11px]"
            :style="
              activeTab === t.key
                ? 'color:#16a34a;font-weight:600;border-bottom:2px solid #16a34a'
                : 'color:#5b6472;border-bottom:2px solid transparent'
            "
            @click="activeTab = t.key"
          >
            {{ t.label }}
          </button>
        </div>

        <!-- conversation -->
        <template v-if="activeTab === 'conversation'">
          <div
            class="flex flex-none flex-wrap items-center gap-1.5 border-b px-3.5 py-2"
            style="border-color: #f1f2f4"
          >
            <span class="text-[11px] font-semibold text-ink-gray-5">{{ __('Canal') }}</span>
            <button
              v-for="c in channelPills"
              :key="c.key"
              class="inline-flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1 text-[11.5px] font-semibold"
              :style="channelPillStyle(c)"
              :disabled="!c.live"
              @click="c.live && (activeChannel = c.key)"
            >
              <span class="h-[7px] w-[7px] rounded-full" :style="`background:${c.dot}`" />
              {{ c.label }}
              <span v-if="!c.live" class="text-[9px] text-ink-gray-4">{{ __('pronto') }}</span>
            </button>
          </div>
          <MessageThread />
          <Composer />
        </template>

        <ActivityTab v-else-if="activeTab === 'activity'" />
        <div v-else-if="activeTab === 'repair'" class="scb flex-1 overflow-y-auto p-5">
          <RepairOrdersSection :docname="activeDeal" />
        </div>
        <TasksTab v-else-if="activeTab === 'tasks'" />
      </template>

      <!-- no selection -->
      <div v-else class="flex flex-1 flex-col items-center justify-center gap-2 text-ink-gray-4">
        <LucideMessagesSquare class="h-9 w-9" />
        <div class="text-sm font-medium text-ink-gray-6">{{ __('Selecciona una conversación') }}</div>
        <div class="text-xs">{{ __('Elige un equipo de la bandeja para ver el hilo') }}</div>
      </div>
    </div>

    <DealContextPanel v-if="activeDeal" />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import LucideMessagesSquare from '~icons/lucide/messages-square'
import { globalStore } from '@/stores/global'
import ConversationQueue from '@/components/doco/inbox/ConversationQueue.vue'
import DealHeader from '@/components/doco/inbox/DealHeader.vue'
import MessageThread from '@/components/doco/inbox/MessageThread.vue'
import Composer from '@/components/doco/inbox/Composer.vue'
import ActivityTab from '@/components/doco/inbox/ActivityTab.vue'
import TasksTab from '@/components/doco/inbox/TasksTab.vue'
import DealContextPanel from '@/components/doco/inbox/DealContextPanel.vue'
import RepairOrdersSection from '@/components/doco/RepairOrdersSection.vue'
import {
  activeDeal,
  activeChannel,
  activeTab,
  channels,
  initInbox,
  loadThread,
  reloadQueue,
  onThreadUpdate,
  CHANNEL_META,
} from '@/composables/inbox'

const { $socket } = globalStore()

const tabs = [
  { key: 'conversation', label: '💬 ' + __('Conversación') },
  { key: 'activity', label: '⚡ ' + __('Actividad') },
  { key: 'repair', label: '🔧 ' + __('Reparación') },
  { key: 'tasks', label: '✓ ' + __('Tareas') },
]

// channel selector — live = configured provider; others greyed (B5 will un-grey)
const channelPills = computed(() => {
  const live = new Set(
    (channels.data || [])
      .filter((c) => c.configured || c.live || c.enabled)
      .map((c) => c.key),
  )
  return ['whatsapp', 'messenger', 'instagram', 'tiktok'].map((key) => ({
    key,
    label: CHANNEL_META[key]?.[0] || key,
    dot: CHANNEL_META[key]?.[1] || '#9aa2ae',
    live: live.has(key) || (key === 'whatsapp' && !channels.data), // optimistic WA before channels load
  }))
})
function channelPillStyle(c) {
  if (!c.live) return 'color:#9aa2ae;background:#f8f9fb;border-color:#edeef1;cursor:default;opacity:.7'
  const on = activeChannel.value === c.key
  return on
    ? 'color:#16a34a;background:#e9f7ef;border-color:#c7ecd5'
    : 'color:#5b6472;background:#fff;border-color:#e4e7ec'
}

function onWaEvent() {
  loadThread()
  reloadQueue()
}

onMounted(() => {
  initInbox()
  $socket?.on('doco_marketing:thread_update', onThreadUpdate)
  $socket?.on('whatsapp_message_in', onWaEvent)
  $socket?.on('whatsapp_message_out', onWaEvent)
})
onUnmounted(() => {
  $socket?.off('doco_marketing:thread_update', onThreadUpdate)
  $socket?.off('whatsapp_message_in', onWaEvent)
  $socket?.off('whatsapp_message_out', onWaEvent)
})
</script>
