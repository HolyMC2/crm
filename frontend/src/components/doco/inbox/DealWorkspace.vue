<!--
  Deal workspace center (header + tab strip + Conversación/Actividad/Reparación) —
  shared by the Inbox (§5.1) and the standalone Deal 360° page (§5.4). Reads the
  selected deal from the inbox composable (activeDeal/activeTab).
-->
<template>
  <div class="flex min-w-0 flex-1 flex-col">
    <template v-if="activeDeal">
      <!-- mobile: the thread scrolls inside the outer layout scroller, so pin the
           header + tabs as one sticky block — back / open-context stay reachable
           without scrolling to the top. `contents` keeps desktop layout untouched. -->
      <div :class="isMobile ? 'sticky top-0 z-20 bg-surface-white' : 'contents'">
        <DealHeader />

        <div class="flex h-11 flex-none items-center gap-0.5 border-b border-outline-gray-1 px-3 text-[13px]">
        <button
          v-for="t in visibleTabs"
          :key="t.key"
          class="flex h-11 items-center gap-1.5 border-b-2 px-[11px]"
          :class="
            activeTab === t.key
              ? 'border-outline-green-2 font-semibold text-ink-green-3'
              : 'border-transparent text-ink-gray-5'
          "
          @click="activeTab = t.key"
        >
          {{ t.label }}
        </button>
        </div>
      </div>

      <!-- Conversación = the real WhatsApp (WhatsAppArea + WhatsAppBox). The doco
           WhatsAppArea adds a sticky contact header (avatar+name+phone); hide it here
           since DealHeader already identifies the contact (avoids the duplicate). -->
      <div v-if="activeTab === 'conversation'" class="doco-convo flex min-h-0 flex-1 flex-col">
        <Activities :key="'wa-' + activeDeal" v-model:showWhatsappTemplates="convoTemplateOpen" :doctype="activeDealDoctype" :docname="activeDeal" :tabs="convoTabs" />
      </div>

      <!-- Actividad = full upstream Activities (timeline/emails/comments/calls/tasks/notes) -->
      <div v-else-if="activeTab === 'activity'" class="flex min-h-0 flex-1 flex-col">
        <Tabs
          v-model="activityTabIndex"
          as="div"
          :tabs="dealTabs"
          class="flex flex-1 flex-col overflow-hidden [&_[role='tablist']]:min-h-[42px] [&_[role='tablist']]:gap-6 [&_[role='tablist']]:px-4 [&_[role='tabpanel']:not([hidden])]:flex [&_[role='tabpanel']:not([hidden])]:grow"
        >
          <template #tab-panel>
            <Activities :key="activeDeal" v-model:tabIndex="activityTabIndex" :doctype="activeDealDoctype" :docname="activeDeal" :tabs="dealTabs" />
          </template>
        </Tabs>
      </div>

      <div v-else-if="activeTab === 'repair'" class="scb flex-1 overflow-y-auto p-5">
        <RepairOrdersSection :docname="activeDeal" />
      </div>
    </template>

    <div v-else class="flex flex-1 flex-col items-center justify-center gap-2 text-ink-gray-4">
      <LucideMessagesSquare class="h-9 w-9" />
      <div class="text-sm font-medium text-ink-gray-6">{{ __('Selecciona una conversación') }}</div>
      <div class="text-xs">{{ __('Elige un equipo de la bandeja para ver el hilo') }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Tabs } from 'frappe-ui'
import LucideMessagesSquare from '~icons/lucide/messages-square'
import Activities from '@/components/Activities/Activities.vue'
import ActivityIcon from '@/components/Icons/ActivityIcon.vue'
import EmailIcon from '@/components/Icons/EmailIcon.vue'
import CommentIcon from '@/components/Icons/CommentIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import DealHeader from '@/components/doco/inbox/DealHeader.vue'
import RepairOrdersSection from '@/components/doco/RepairOrdersSection.vue'
import { isMobile } from '@/composables/breakpoint'
import { activeDeal, activeDealDoctype, activeTab, convoTemplateOpen } from '@/composables/inbox'

const activityTabIndex = ref(0)

const tabs = [
  { key: 'conversation', label: '💬 ' + __('Conversación') },
  { key: 'activity', label: '⚡ ' + __('Actividad') },
  { key: 'repair', label: '🔧 ' + __('Reparación') },
]
// Reparación is a deal-only concept (repair orders). Leads get conversation +
// activity only.
const visibleTabs = computed(() =>
  activeDealDoctype.value === 'CRM Deal' ? tabs : tabs.filter((t) => t.key !== 'repair'),
)
const dealTabs = [
  { name: 'Activity', label: __('Activity'), icon: ActivityIcon },
  { name: 'Emails', label: __('Emails'), icon: EmailIcon },
  { name: 'Comments', label: __('Comments'), icon: CommentIcon },
  { name: 'Calls', label: __('Calls'), icon: PhoneIcon },
  { name: 'Tasks', label: __('Tasks'), icon: TaskIcon },
  { name: 'Notes', label: __('Notes'), icon: NoteIcon },
]
const convoTabs = [{ name: 'WhatsApp', label: 'WhatsApp', icon: WhatsAppIcon }]
</script>

<style scoped>
/* Hide the WhatsAppArea single-contact header inside the inbox — DealHeader already
   identifies the deal, and the per-contact chat strip (shown when a deal has >1
   WhatsApp contact) is the switcher here. Pinned notes + the strip stay visible.
   Scoped to this embedding; the upstream Deal page keeps the header. */
.doco-convo :deep(.wa-contact-header) {
  display: none;
}
</style>
