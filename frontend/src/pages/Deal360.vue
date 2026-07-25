<!--
  Deal / Contact 360° (handoff §5.4) — the full deal workspace as a standalone,
  queue-less, full-width view. Reuses DealWorkspace (header + Conversación/Actividad/
  Reparación) + DealContextPanel (full editable fields). Deal from the route param.
  Mobile (<640px): single pane — workspace, drill into context via the header tap
  (same mobileView stack the Inbox uses; hardware back pops the pane).
-->
<template>
  <!-- desktop: workspace + docked context panel -->
  <div v-if="!isMobile" class="flex min-h-0 w-full flex-1">
    <DealWorkspace />
    <DealContextPanel v-if="activeDeal" />
  </div>

  <!-- mobile: one pane at a time (v-show keeps the thread mounted, like Inbox) -->
  <div v-else class="flex min-h-0 w-full flex-1 flex-col">
    <div v-show="mobileView !== 'context'" class="flex min-h-0 flex-1 flex-col">
      <DealWorkspace />
    </div>
    <div v-show="mobileView === 'context'" class="flex min-h-0 flex-1 flex-col">
      <DealContextPanel v-if="activeDeal" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import DealWorkspace from '@/components/doco/inbox/DealWorkspace.vue'
import DealContextPanel from '@/components/doco/inbox/DealContextPanel.vue'
import { isMobile } from '@/composables/breakpoint'
import { activeDeal, selectDeal, mobileView } from '@/composables/inbox'

const props = defineProps({ dealId: { type: String, default: '' } })
const route = useRoute()

function focus() {
  const id = props.dealId || route.params.dealId
  if (id) selectDeal(String(id))
  // standalone page starts on the thread pane; DealHeader's ← (mobileBack →
  // history.back) then leaves the page, which is correct here (no queue pane).
  mobileView.value = 'thread'
}
onMounted(focus)
watch(() => route.params.dealId, focus)

// ── mobile back-stack (same contract as Inbox.vue, thread↔context only) ────
// Drilling into context pushes a history entry so hardware/gesture back (and the
// panel's ← via history.back()) returns to the thread instead of leaving the page.
let suppressPush = false
watch(
  mobileView,
  (nv, ov) => {
    if (!isMobile.value || nv === ov) return
    if (suppressPush) {
      suppressPush = false
      return
    }
    if (nv === 'context') history.pushState({ ...history.state, dealPane: 'context' }, '')
  },
  { flush: 'sync' },
)
function onPopState(e) {
  if (!isMobile.value) return
  const target = e.state?.dealPane === 'context' ? 'context' : 'thread'
  if (target !== mobileView.value) {
    suppressPush = true
    mobileView.value = target
  }
}
onMounted(() => window.addEventListener('popstate', onPopState))
onUnmounted(() => window.removeEventListener('popstate', onPopState))
</script>
