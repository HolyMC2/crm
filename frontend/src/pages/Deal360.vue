<!--
  Deal / Contact 360° (handoff §5.4) — the full deal workspace as a standalone,
  queue-less, full-width view. Reuses DealWorkspace (header + Conversación/Actividad/
  Reparación) + DealContextPanel (full editable fields). Deal from the route param.
  Mobile (<640px): single pane — workspace, drill into context via the header tap
  (same mobileView stack the Inbox uses; hardware back pops the pane).
-->
<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <!-- Phone: DealHeader's ‹ is the one back (it follows return_to too) and
         «Datos y contacto» lives in its ⋯ menu and on the identity tap. -->
    <nav
      v-if="!isMobile"
      class="flex flex-none items-center justify-between gap-3 border-b border-outline-gray-1 px-4 py-2 text-sm"
      :aria-label="__('Navegación del trato')"
    >
      <RouterLink
        :to="back.to"
        class="rounded px-1 py-1 font-medium text-ink-gray-6 hover:text-ink-gray-9"
        >← {{ back.label }}</RouterLink
      >
      <button
        class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-ink-gray-7 hover:bg-surface-gray-2"
        :aria-expanded="isMobile ? mobileView === 'context' : showContext"
        @click="isMobile ? openContext() : (showContext = !showContext)"
      >
        {{ __('Datos y contacto') }}
      </button>
    </nav>
    <!-- A deal that does not exist, is not this worker's, or could not be
         checked: say so and offer the way back, never an empty record. -->
    <PaneState
      v-if="dealState !== 'ok'"
      :state="dealState === 'missing' ? 'empty' : dealState"
      :title="dealStateTitle"
      :message="dealStateMessage"
      :action="dealState === 'error' ? __('Retry') : back.label"
      @retry="dealState === 'error' ? checkDeal() : router.push(back.to)"
    />
    <!-- desktop: workspace + docked context panel -->
    <div v-else-if="!isMobile" class="flex min-h-0 w-full flex-1">
      <DealWorkspace />
      <DealContextPanel v-if="activeDeal && showContext" data-deal-context />
    </div>

    <!-- mobile: one pane at a time (v-show keeps the thread mounted, like Inbox) -->
    <div v-else class="flex min-h-0 w-full flex-1 flex-col">
      <!-- edge swipe-back mirrors the ← buttons (context → thread → previous page) -->
      <div
        v-show="mobileView !== 'context'"
        class="flex min-h-0 flex-1 flex-col"
        v-on="swipeBackHandlers"
      >
        <DealWorkspace />
      </div>
      <div
        v-show="mobileView === 'context'"
        class="flex min-h-0 flex-1 flex-col"
        v-on="swipeBackHandlers"
      >
        <DealContextPanel v-if="activeDeal" data-deal-context />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, provide, watch, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { dealReturnLink, dealTab } from '@/utils/ventasRoutes'
import DealWorkspace from '@/components/doco/inbox/DealWorkspace.vue'
import DealContextPanel from '@/components/doco/inbox/DealContextPanel.vue'
import { isMobile } from '@/composables/breakpoint'
import { nextTick } from 'vue'
import { useFormKeys } from '@/composables/pageKeys'
import { isTypingTarget } from '@/vendor/muelle-shell/contracts'
import { swipeBackHandlers } from '@/composables/swipeBack'
import { call } from 'frappe-ui'
import PaneState from '@/components/shell/PaneState.vue'
import {
  activeDeal,
  selectDeal,
  mobileView,
  openContext,
  activeTab,
  onPresenceEvent,
} from '@/composables/inbox'
import { globalStore } from '@/stores/global'
import { requestNextStep, useNextStepKeys } from '@/composables/useNextStep'
import { useRecordPower } from '@/composables/useRecordPower'

const props = defineProps({ dealId: { type: String, default: '' } })
const route = useRoute()
const router = useRouter()
const showContext = ref(false)

// Is the deal there and readable? One small check beside the workspace's own
// loads (they render meanwhile); only a definite answer replaces the page.
const dealState = ref('ok') // ok | missing | denied | error
async function checkDeal() {
  const id = String(props.dealId || route.params.dealId || '')
  if (!id) return
  dealState.value = 'ok'
  try {
    const row = await call('frappe.client.get_value', {
      doctype: 'CRM Deal',
      filters: { name: id },
      fieldname: 'name',
    })
    dealState.value = row?.name ? 'ok' : 'missing'
  } catch (error) {
    dealState.value =
      error?.exc_type === 'PermissionError' || error?.status === 403
        ? 'denied'
        : error?.exc_type === 'DoesNotExistError' || error?.status === 404
          ? 'missing'
          : 'error'
  }
}
onMounted(checkDeal)
const dealStateTitle = computed(
  () =>
    ({
      missing: __('We could not find this deal'),
      denied: __('You cannot open this deal'),
      error: __('The deal could not be loaded'),
    })[dealState.value] || '',
)
const dealStateMessage = computed(
  () =>
    ({
      missing: __(
        'It may have been deleted, or it is not shared with you. Look for it in the list.',
      ),
      denied: __(
        'It belongs to another team or seller. Ask your manager for access.',
      ),
    })[dealState.value] || '',
)

// Shell return protocol (§8.3) and the CRM queue/report/form returnTo: a
// caller that sent either gets its own back.
const back = computed(() => dealReturnLink(route.query))
// The phone header's ‹ leaves the record the same way: to the caller's
// return_to/returnTo when present, otherwise back to the deals list.
provide('dealBack', back)

// The seller's loop by keyboard: n · p · r · h act on this deal's next step,
// Esc goes back where the deal was opened from (Hoy, the list's queue).
useNextStepKeys(() => String(props.dealId || route.params.dealId || ''))
useRecordPower({ back: () => router.push(back.value.to), reload: () => {} })

// (No route.params watch: App.vue keys the router-view on fullPath, so /deal/A →
// /deal/B remounts this component — onMounted covers every entry.)
function focus() {
  const id = props.dealId || route.params.dealId
  if (id) selectDeal(String(id))
  activeTab.value = dealTab(route.query.tab) || 'overview'
  // standalone page starts on the thread pane; DealHeader's ← (mobileBack →
  // history.back) then leaves the page, which is correct here (no queue pane).
  mobileView.value = 'thread'
}

// Keyboard standard on the record: «e» opens «Datos y contacto» (the editable
// fields; each saves on change, so there is no separate Ctrl+Enter save) with
// the focus on its first field, Esc closes the panel again.
async function editDeal() {
  if (isMobile.value) openContext()
  else showContext.value = true
  await nextTick()
  document
    .querySelector(
      '[data-deal-context] input:not([type="hidden"]):not([disabled]), [data-deal-context] textarea, [data-deal-context] select',
    )
    ?.focus()
}
useFormKeys({
  page: 'deal',
  edit: editDeal,
  close: () => {
    if (isMobile.value ? mobileView.value !== 'context' : !showContext.value)
      return false
    // Esc in a field first leaves the field (its change saves); the next Esc
    // closes the panel.
    const field = document.activeElement
    if (field?.closest?.('[data-deal-context]') && isTypingTarget(field)) {
      field.blur()
      return
    }
    if (isMobile.value) history.back()
    else showContext.value = false
  },
  when: { edit: () => Boolean(activeDeal.value) },
})

// ── mobile back-stack (same contract as Inbox.vue, thread↔context only) ────
// Drilling into context pushes a history entry so hardware/gesture back (and the
// panel's ← via history.back()) returns to the thread instead of leaving the page.
// Per-mount epoch invalidates stale dealPane tags from earlier visits (audit M1).
let suppressPush = false
let paneEpoch = 0
watch(
  mobileView,
  (nv, ov) => {
    if (!isMobile.value || nv === ov) return
    if (suppressPush) {
      suppressPush = false
      return
    }
    if (nv === 'context')
      history.pushState(
        { ...history.state, dealPane: 'context', dealEpoch: paneEpoch },
        '',
      )
  },
  { flush: 'sync' },
)
function onPopState(e) {
  if (!isMobile.value) return
  const target =
    e.state?.dealPane === 'context' && e.state?.dealEpoch === paneEpoch
      ? 'context'
      : 'thread'
  if (target !== mobileView.value) {
    suppressPush = true
    mobileView.value = target
  }
}
// URL is state: the section survives reloads, shares and POS round trips.
watch(activeTab, (tab) => {
  if (dealTab(tab) && route.query.tab !== tab)
    router.replace({ query: { ...route.query, tab } })
})
const { $socket } = globalStore()
onMounted(() => {
  paneEpoch = Date.now()
  focus()
  // collision strip works on the standalone deal page too (spec 2.4)
  $socket?.on('doco_marketing:presence', onPresenceEvent)
  $socket?.on('doco_marketing:call_ended', onCallEnded)
})
// A call on this deal just ended: ask for the next dated step.
function onCallEnded(ended) {
  const deal = String(props.dealId || route.params.dealId || '')
  if (ended?.reference_doctype === 'CRM Deal' && ended.reference_name === deal)
    requestNextStep({ deal, reason: 'call' })
}
onMounted(() => window.addEventListener('popstate', onPopState))
onUnmounted(() => {
  window.removeEventListener('popstate', onPopState)
  $socket?.off('doco_marketing:presence', onPresenceEvent)
  $socket?.off('doco_marketing:call_ended', onCallEnded)
})
</script>
