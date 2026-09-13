<!--
  Deal workspace center (header + tab strip + Conversación/Actividad/Reparación) —
  shared by the Inbox (§5.1) and the standalone Deal 360° page (§5.4). Reads the
  selected deal from the inbox composable (activeDeal/activeTab).
-->
<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <template v-if="activeDeal">
      <!-- header + tabs are flex-none atop a min-h-0 column, so they stay pinned
           while only the message area (FadedScrollableDiv) scrolls internally. -->
      <DealHeader />
      <!-- 👥 collision strip (spec 2.4): who else is in this conversation NOW -->
      <div
        v-if="activePresence.length"
        class="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 border-b border-outline-gray-1 bg-surface-blue-1 px-4 py-1.5 text-[11.5px] font-medium text-ink-blue-9"
        role="status"
      >
        <span v-for="p in activePresence" :key="p.user" class="inline-flex items-center gap-1">
          {{ p.state === 'typing' ? '✍️' : '👁' }}
          <b>{{ p.full_name || p.user }}</b>
          {{ p.state === 'typing' ? __('está escribiendo…') : __('está viendo esta conversación') }}
        </span>
      </div>
      <LostStagePrompt />

      <div role="tablist" class="flex h-11 flex-none items-center gap-0.5 overflow-x-auto border-b border-outline-gray-1 px-3 text-[13px]">
        <button
          v-for="t in visibleTabs"
          :key="t.key"
          role="tab"
          :aria-selected="activeTab === t.key"
          class="press flex h-11 flex-none items-center gap-1.5 whitespace-nowrap border-b-2 px-[11px] transition-colors duration-150"
          :class="
            activeTab === t.key
              ? 'border-outline-green-4 font-semibold text-ink-green-7'
              : 'border-transparent text-ink-gray-5'
          "
          @click="activeTab = t.key"
        >
          {{ t.label }}
        </button>
      </div>

      <DealConversations
        v-if="activeTab === 'conversation'"
        :key="activeDealDoctype + activeDeal"
        :doctype="activeDealDoctype"
        :name="activeDeal"
      />

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

      <!-- Persistent ERP item lines and chronological sales documents. -->
      <div v-else-if="activeTab === 'items'" class="flex min-h-0 flex-1 flex-col">
        <ItemWorkspace :key="activeDealDoctype + activeDeal" :deal="activeDeal" :doctype="activeDealDoctype" :enabled="salesDocsEnabled" :has-taller="hasTaller" @catalog="onIntentCatalogo" />
      </div>

      <div v-else-if="activeTab === 'repair' && hasTaller" class="scb flex-1 overflow-y-auto p-5">
        <RepairOrdersSection :docname="activeDeal" />
      </div>
    </template>

    <div v-else class="flex flex-1 flex-col items-center justify-center gap-2 text-ink-gray-4">
      <LucideMessagesSquare class="h-9 w-9" />
      <div class="text-sm-medium text-ink-gray-6">{{ __('Selecciona una conversación') }}</div>
      <div class="text-xs">{{ __('Elige un equipo de la bandeja para ver el hilo') }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Tabs } from 'frappe-ui'
import LucideMessagesSquare from '~icons/lucide/messages-square'
import Activities from '@/components/Activities/Activities.vue'
import ActivityIcon from '@/components/Icons/ActivityIcon.vue'
import EmailIcon from '@/components/Icons/EmailIcon.vue'
import CommentIcon from '@/components/Icons/CommentIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import ItemWorkspace from '@/components/doco/inbox/ItemWorkspace.vue'
import DealHeader from '@/components/doco/inbox/DealHeader.vue'
import LostStagePrompt from '@/components/doco/inbox/LostStagePrompt.vue'
import DealConversations from '@/components/doco/inbox/DealConversations.vue'
import RepairOrdersSection from '@/components/doco/RepairOrdersSection.vue'
import { activeDeal, activeDealDoctype, activeTab, hasTaller, activePresence, openCatalog, salesDocsEnabled } from '@/composables/inbox'

const activityTabIndex = ref(0)

// ── P2 S10: intent chip → existing surface (chips never send / never auto-charge) ──
function onIntentCatalogo() {
  // 🏷 precio → catálogo picker on this conversation; `to` omitted — send_items
  // resolves the recipient from the reference (verified path in the S10 report).
  openCatalog({
    reference_doctype: activeDealDoctype.value,
    reference_name: activeDeal.value,
    channel: 'whatsapp',
  })
}
const tabs = [
  { key: 'conversation', label: __('Conversación') },
  { key: 'activity', label: __('Actividad') },
  { key: 'items', label: __('Artículos') },
  { key: 'repair', label: __('Reparación') },
]
// Reparación is a deal-only concept (repair orders) AND requires taller — hidden
// for leads and on tenants without reparaciones (e.g. mumu).
const visibleTabs = computed(() => {
  let t = activeDealDoctype.value === 'CRM Deal' ? tabs : tabs.filter((x) => x.key !== 'repair')
  if (!hasTaller.value) t = t.filter((x) => x.key !== 'repair')
  return t
})
// If the persisted tab is repair but this tenant has no taller, fall back.
watch(
  [hasTaller, activeTab],
  () => {
    if (!hasTaller.value && activeTab.value === 'repair') activeTab.value = 'conversation'
  },
  { immediate: true },
)
const dealTabs = [
  { name: 'Activity', label: __('Activity'), icon: ActivityIcon },
  { name: 'Emails', label: __('Emails'), icon: EmailIcon },
  { name: 'Comments', label: __('Comments'), icon: CommentIcon },
  { name: 'Calls', label: __('Calls'), icon: PhoneIcon },
  { name: 'Tasks', label: __('Tasks'), icon: TaskIcon },
  { name: 'Notes', label: __('Notes'), icon: NoteIcon },
]
</script>
