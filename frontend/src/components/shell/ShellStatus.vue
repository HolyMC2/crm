<!-- The top bar's status items, the way a Mac's menu bar shows its icons only
     while they matter: each says one thing about this tab (the lists, the
     messages waiting for signal), this computer (its label printer) or the
     worker's own caja, only while it is off, and a tap does the one fix.
     Below 1024 px (the icon rail) they keep their icon and say the rest in the tip. -->
<template>
  <LiveSign bar />
  <button
    v-if="outbox.length"
    type="button"
    :class="ITEM"
    :aria-label="outboxTip"
    :title="outboxTip"
    :aria-busy="outboxFlushing ? 'true' : undefined"
    data-testid="status-outbox"
    @click="openQueue"
  >
    <span
      :class="[outboxFlushing ? SPIN : 'lucide-send', 'size-4 flex-none']"
      aria-hidden="true"
    />
    <span :class="WORDS" aria-hidden="true">{{
      outboxFlushing ? __('Sending…') : __('{0} to send', [outbox.length])
    }}</span>
  </button>
  <OutboxDialog v-if="queueWanted" v-model="queueOpen" />
  <button
    v-if="printerState !== 'ok'"
    type="button"
    :class="ITEM"
    :aria-label="printerTip"
    :title="printerTip"
    :aria-busy="printerChecking ? 'true' : undefined"
    data-testid="status-printer"
    @click="printer.check"
  >
    <span
      :class="[printerChecking ? SPIN : 'lucide-printer', 'size-4 flex-none']"
      aria-hidden="true"
    />
    <span :class="WORDS" aria-hidden="true">{{
      printerState === 'qz' ? __('Muelle QZ closed') : __('Printer missing')
    }}</span>
  </button>
  <a
    v-if="caja"
    :href="cajaHref"
    :class="ITEM"
    :aria-label="cajaTip"
    :title="cajaTip"
    data-testid="status-caja"
  >
    <span class="lucide-wallet size-4 flex-none" aria-hidden="true" />
    <span :class="WORDS" aria-hidden="true">{{ __('Caja not closed') }}</span>
  </a>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue'
import { useRoute } from 'vue-router'
import { barStatus, refreshBarStatus } from '@/composables/barStatus'
import { outbox, outboxFlushing } from '@/composables/outbox'
import { printerStatus } from '@/composables/printerStatus'
import { siblingHref } from '@/composables/shellRail'
import { formatDateTime } from '@/utils/display'
import LiveSign from './LiveSign.vue'

const OutboxDialog = defineAsyncComponent(() => import('./OutboxDialog.vue'))

// LiveSign's bar shape: grey words on the bar, a tone on hover.
const ITEM =
  'press flex h-7 flex-none items-center gap-1.5 rounded-full px-2.5 text-sm text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8'
const WORDS = 'hidden whitespace-nowrap lg:inline'
const SPIN = 'lucide-loader-circle animate-spin'

// Messages typed without signal (composables/outbox): the queue opens on a tap.
const queueWanted = ref(false)
const queueOpen = ref(false)
function openQueue() {
  queueWanted.value = true
  queueOpen.value = true
}
const outboxTip = computed(() =>
  outboxFlushing.value
    ? __('Sending…')
    : __(
        '{0} messages waiting to send: they go out when the connection returns. Open them to read, send or discard them.',
        [outbox.value.length],
      ),
)

// This computer's label printer (composables/printerStatus).
const printer = printerStatus()
const printerState = printer.state
const printerChecking = printer.checking
const printerTip = computed(() => {
  if (printerChecking.value) return __('Checking the printer…')
  if (printerState.value === 'qz')
    return __(
      'Muelle QZ is not open on this computer, so labels print with the dialog. Open it, then tap to check again.',
    )
  return __(
    'This computer no longer has the printer «{0}». Plug it in or choose another in Etiquetas, then tap to check again.',
    [printer.printer.value],
  )
})

// The worker's own caja left open from an earlier day: the POS closes it.
const route = useRoute()
const caja = computed(() => barStatus.value.caja)
const cajaHref = computed(() =>
  siblingHref({ path: '/posapp/' }, route?.fullPath),
)
const cajaTip = computed(() =>
  __('Your caja {0} is still open since {1}. Close it in the POS.', [
    caja.value?.pos_profile || '',
    formatDateTime(caja.value?.since),
  ]),
)

let firstRead = null
function onBack() {
  if (document.visibilityState === 'visible') refreshBarStatus()
}
onMounted(() => {
  printer.start()
  // After the shell's own reads.
  firstRead = setTimeout(() => refreshBarStatus({ force: true }), 2000)
  document.addEventListener('visibilitychange', onBack)
  window.addEventListener('focus', onBack)
})
onBeforeUnmount(() => {
  printer.stop()
  clearTimeout(firstRead)
  document.removeEventListener('visibilitychange', onBack)
  window.removeEventListener('focus', onBack)
})
</script>
