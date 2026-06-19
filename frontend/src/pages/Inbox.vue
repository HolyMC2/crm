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

        <!-- conversation = the REAL WhatsApp (upstream WhatsAppArea + WhatsAppBox:
             templates, media, reactions, replies, read receipts) via Activities
             scoped to the WhatsApp tab. No sub-tab strip rendered (single tab). -->
        <div v-if="activeTab === 'conversation'" class="flex min-h-0 flex-1 flex-col">
          <Activities :key="'wa-' + activeDeal" doctype="CRM Deal" :docname="activeDeal" :tabs="convoTabs" />
        </div>

        <!-- full upstream activity/email/comment/call/task/note system (real task
             modal w/ date/assignee/priority/reminder/notifications) — superset.
             Tabs wrapper drives the sub-tab strip (same pattern as Deal.vue). -->
        <div v-else-if="activeTab === 'activity'" class="flex min-h-0 flex-1 flex-col">
          <Tabs
            v-model="activityTabIndex"
            as="div"
            :tabs="dealTabs"
            class="flex flex-1 flex-col overflow-hidden [&_[role='tablist']]:min-h-[42px] [&_[role='tablist']]:gap-6 [&_[role='tablist']]:px-4 [&_[role='tabpanel']:not([hidden])]:flex [&_[role='tabpanel']:not([hidden])]:grow"
          >
            <template #tab-panel>
              <Activities :key="activeDeal" v-model:tabIndex="activityTabIndex" doctype="CRM Deal" :docname="activeDeal" :tabs="dealTabs" />
            </template>
          </Tabs>
        </div>
        <div v-else-if="activeTab === 'repair'" class="scb flex-1 overflow-y-auto p-5">
          <RepairOrdersSection :docname="activeDeal" />
        </div>
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
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Tabs, toast } from 'frappe-ui'
import LucideMessagesSquare from '~icons/lucide/messages-square'
import { globalStore } from '@/stores/global'
import Activities from '@/components/Activities/Activities.vue'
import ActivityIcon from '@/components/Icons/ActivityIcon.vue'
import EmailIcon from '@/components/Icons/EmailIcon.vue'
import CommentIcon from '@/components/Icons/CommentIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import ConversationQueue from '@/components/doco/inbox/ConversationQueue.vue'
import DealHeader from '@/components/doco/inbox/DealHeader.vue'
import DealContextPanel from '@/components/doco/inbox/DealContextPanel.vue'
import RepairOrdersSection from '@/components/doco/RepairOrdersSection.vue'
import {
  activeDeal,
  activeTab,
  initInbox,
  loadThread,
  reloadQueue,
  selectDeal,
  onThreadUpdate,
} from '@/composables/inbox'

const { $socket } = globalStore()
const route = useRoute()
const activityTabIndex = ref(0)

const tabs = [
  { key: 'conversation', label: '💬 ' + __('Conversación') },
  { key: 'activity', label: '⚡ ' + __('Actividad') },
  { key: 'repair', label: '🔧 ' + __('Reparación') },
]

// sub-tabs for the embedded upstream Activities component (the full wired system:
// timeline + emails + comments + calls + real Task modal + notes)
const dealTabs = [
  { name: 'Activity', label: __('Activity'), icon: ActivityIcon },
  { name: 'Emails', label: __('Emails'), icon: EmailIcon },
  { name: 'Comments', label: __('Comments'), icon: CommentIcon },
  { name: 'Calls', label: __('Calls'), icon: PhoneIcon },
  { name: 'Tasks', label: __('Tasks'), icon: TaskIcon },
  { name: 'Notes', label: __('Notes'), icon: NoteIcon },
]
// Conversación = WhatsApp only (the real WhatsAppArea + WhatsAppBox)
const convoTabs = [{ name: 'WhatsApp', label: 'WhatsApp', icon: WhatsAppIcon }]

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
