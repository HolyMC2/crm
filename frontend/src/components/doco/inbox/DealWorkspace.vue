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

      <!-- 🧠 resumen AI del hilo (P2 S3 / spec 5.2) — hides itself when AI is off -->
      <ThreadSummary />

      <!-- 💡 intent → action chips (P2 S10 / spec 5.3) — ≤1 one-tap chip; hides itself
           when AI is off / confidence < 0.6. Chips NEVER send / NEVER auto-charge. -->
      <IntentChips
        v-if="activeTab === 'conversation'"
        :doctype="activeDealDoctype"
        :name="activeDeal"
        @catalogo="onIntentCatalogo"
        @cobrar="onIntentCobrar"
        @factura="onIntentFactura"
        @taller="onIntentTaller"
      />

      <!-- Conversación = the real WhatsApp (WhatsAppArea + WhatsAppBox). The doco
           WhatsAppArea adds a sticky contact header (avatar+name+phone); hide it here
           since DealHeader already identifies the contact (avoids the duplicate). -->
      <div v-if="activeTab === 'conversation'" ref="convoRef" class="doco-convo relative flex min-h-0 flex-1 flex-col">
        <!-- 🔎 búsqueda en el hilo (spec 2.7) — over the LOADED messages -->
        <ThreadSearch ref="threadSearch" :container="convoRef" />
        <button
          class="press absolute right-3 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-outline-gray-2 bg-surface-base text-[13px] text-ink-gray-6 shadow-sm hover:bg-surface-gray-2"
          :title="__('Buscar en la conversación')"
          :aria-label="__('Buscar en la conversación')"
          @click="threadSearch?.toggle()"
        >
          🔎
        </button>
        <Activities :key="'wa-' + activeDeal" v-model:showWhatsappTemplates="convoTemplateOpen" :doctype="activeDealDoctype" :docname="activeDeal" :tabs="convoTabs" />
        <!-- jump-to-latest: shows when scrolled up from the tail; floats just above
             the composer (bottom offset = live composer height) -->
        <button
          v-show="showJump"
          :style="{ bottom: jumpBottom + 'px' }"
          class="absolute right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-outline-gray-2 bg-surface-base text-ink-gray-7 shadow-md transition hover:bg-surface-gray-2"
          :aria-label="__('Ir al último mensaje')"
          :title="__('Ir al último mensaje')"
          @click="jumpToBottom"
        >
          <LucideChevronDown class="h-5 w-5" />
        </button>
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
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { Tabs } from 'frappe-ui'
import LucideMessagesSquare from '~icons/lucide/messages-square'
import LucideChevronDown from '~icons/lucide/chevron-down'
import Activities from '@/components/Activities/Activities.vue'
import ActivityIcon from '@/components/Icons/ActivityIcon.vue'
import EmailIcon from '@/components/Icons/EmailIcon.vue'
import CommentIcon from '@/components/Icons/CommentIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import DealHeader from '@/components/doco/inbox/DealHeader.vue'
import LostStagePrompt from '@/components/doco/inbox/LostStagePrompt.vue'
import ThreadSummary from '@/components/doco/inbox/ThreadSummary.vue'
import IntentChips from '@/components/doco/inbox/IntentChips.vue'
import ThreadSearch from '@/components/doco/inbox/ThreadSearch.vue'
import RepairOrdersSection from '@/components/doco/RepairOrdersSection.vue'
import { activeDeal, activeDealDoctype, activeTab, convoTemplateOpen, hasTaller, activePresence, openCatalog, setComposerDraft, pulseSalesDocs } from '@/composables/inbox'

const activityTabIndex = ref(0)
const threadSearch = ref(null)

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
function onIntentCobrar() {
  // 💳 pago → reveal + pulse 💰 Documentos (on desktop the panel is already visible,
  // so the pulse/scroll is the visible response) — the charge stays a human tap.
  pulseSalesDocs()
}
function onIntentFactura() {
  // 🧾 factura → prefill the composer asking for fiscal data; operator edits + sends.
  setComposerDraft({
    text: 'Con gusto le facturamos 🧾. ¿Me comparte sus datos fiscales? RFC, razón social, uso de CFDI y el correo para enviarle la factura.',
    canned: 'factura',
  })
}
function onIntentTaller() {
  // 🔧 cotizar_reparacion → jump to Reparación (taller tenants only).
  if (hasTaller.value) activeTab.value = 'repair'
}

// ── jump-to-latest FAB ─────────────────────────────────────────────────────────
// The conversation's message list (Activities' FadedScrollableDiv, the only
// .overflow-y-auto inside .doco-convo) scrolls internally. Watch its scroll
// position; show a button when the user has scrolled up from the tail, and offset
// it above the composer (its height is dynamic — quick-replies wrap, input grows).
const convoRef = ref(null)
const showJump = ref(false)
const jumpBottom = ref(88)
let scrollEl = null

function onScroll() {
  if (!scrollEl) return
  const composer = scrollEl.nextElementSibling // Activities' composer wrapper <div>
  jumpBottom.value = (composer?.offsetHeight || 76) + 12
  const distFromBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight
  showJump.value = distFromBottom > 240
}
function jumpToBottom() {
  scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' })
}
function detachScroll() {
  if (scrollEl) scrollEl.removeEventListener('scroll', onScroll)
  scrollEl = null
  showJump.value = false
}
function bindScroll() {
  detachScroll()
  if (activeTab.value !== 'conversation' || !activeDeal.value) return
  nextTick(() => {
    scrollEl = convoRef.value?.querySelector('.overflow-y-auto') || null
    if (!scrollEl) return
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    setTimeout(onScroll, 400) // after the thread renders + auto-scrolls to bottom
  })
}
watch([activeDeal, activeTab], bindScroll)
onMounted(bindScroll)
onBeforeUnmount(detachScroll)

// ── keyboard-aware thread ─────────────────────────────────────────────────────
// When the on-screen keyboard opens (visualViewport shrinks) the thread viewport
// loses ~40% height; if the user was reading the tail, keep it pinned to the
// newest messages so the composer never covers what they were answering.
let _vvH = window.visualViewport?.height || 0
function onVvResize() {
  const vv = window.visualViewport
  if (!vv) return
  const shrunk = vv.height < _vvH - 80
  _vvH = vv.height
  if (!shrunk || !scrollEl) return
  const dist = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight
  if (dist < 300)
    setTimeout(() => scrollEl?.scrollTo({ top: scrollEl.scrollHeight }), 60)
}
onMounted(() => window.visualViewport?.addEventListener('resize', onVvResize))
onBeforeUnmount(() =>
  window.visualViewport?.removeEventListener('resize', onVvResize),
)

const tabs = [
  { key: 'conversation', label: '💬 ' + __('Conversación') },
  { key: 'activity', label: '⚡ ' + __('Actividad') },
  { key: 'repair', label: '🔧 ' + __('Reparación') },
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

/* Mobile: the "WhatsApp" title + Send Template row eats ~48px of a small screen
   and duplicates what DealHeader/tab already say. Templates stay reachable via
   the 📋 chip in the composer quick bar (WhatsAppBox → open-templates). */
@media (max-width: 639px) {
  .doco-convo :deep(.activity-header) {
    display: none;
  }
}
</style>
