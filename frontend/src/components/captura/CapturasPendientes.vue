<template>
  <section
    v-if="rows.length"
    class="mx-4 mb-2 border-b border-outline-gray-2 pb-2 sm:mx-6"
    data-capturas-pendientes
    :aria-label="__('Captures to finish')"
  >
    <h2
      class="flex items-center gap-2 pb-1 text-sm font-medium text-ink-gray-8"
    >
      <span
        class="lucide-file-plus size-4 text-ink-gray-5"
        aria-hidden="true"
      />
      {{ __('Captures to finish ({0})', [rows.length]) }}
    </h2>
    <ul class="divide-y divide-outline-gray-1">
      <li v-for="row in rows" :key="row.name" class="flex items-center gap-1">
        <RouterLink
          :to="reviewRoute(row)"
          class="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-6 py-1.5 text-sm [@media(hover:hover)]:hover:bg-surface-gray-1"
          :data-captura="row.name"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-base text-ink-gray-9">
              {{ rowTitle(row) }}
            </span>
            <span class="block truncate text-ink-gray-6">
              {{
                [row.doc_label, row.invoice_no, relativeTime(row.received_at)]
                  .filter(Boolean)
                  .join(', ')
              }}
            </span>
          </span>
          <!-- phone: the amount over its state, so the name keeps the width -->
          <span
            class="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-3"
          >
            <span v-if="row.total" class="num text-ink-gray-8">{{
              money(row.total, row.currency)
            }}</span>
            <StatusChip
              :label="pendingCaptureStatus(row).label"
              :tone="CHIP_TONE[pendingCaptureStatus(row).theme] || 'neutral'"
            />
          </span>
          <span
            class="hidden shrink-0 items-center gap-1 font-medium text-ink-gray-8 sm:inline-flex"
            >{{ __('Continue') }}
            <span class="lucide-chevron-right size-4" aria-hidden="true"
          /></span>
        </RouterLink>
        <!-- Closing one is two taps in place: the ✕, then «Descartar» where it was. -->
        <button
          v-if="armed === row.name"
          ref="confirmButton"
          type="button"
          class="press inline-flex min-h-11 shrink-0 items-center rounded-6 bg-surface-red-2 px-3 text-sm font-medium text-ink-red-7 sm:min-h-8"
          :data-descartar-confirmar="row.name"
          @click="discard(row)"
          @blur="disarm(row)"
          @keydown.esc="disarm(row)"
        >
          {{ __('Discard') }}
        </button>
        <button
          v-else-if="row.can_discard"
          type="button"
          class="press inline-flex size-11 shrink-0 items-center justify-center rounded-6 text-ink-gray-5 hover:bg-surface-gray-2 hover:text-ink-gray-8 sm:size-8"
          :aria-label="__('Discard capture from {0}', [rowTitle(row)])"
          :title="__('Discard')"
          :data-descartar="row.name"
          @click="arm(row)"
        >
          <span class="lucide-x size-4" aria-hidden="true" />
        </button>
        <!-- still being read: no ✕ yet, the column stays in line -->
        <span v-else class="size-11 shrink-0 sm:size-8" aria-hidden="true" />
      </li>
    </ul>
  </section>
</template>
<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'frappe-ui'
import { StatusChip } from '@/components/ui'
import {
  capturaMessage,
  capturaRoute,
  discardCapture,
  loadPendingCaptures,
  pendingCaptureStatus,
} from '@/composables/useCaptura'
import { money } from '@/composables/useCompras'
import { relativeTime } from '@/utils/display'

// The captures this worker started and did not finish (no draft, not
// discarded, from the last few weeks): leaving a review must not strand its
// capture where only the chat can reach it. Each row reopens the review and
// comes back here, or closes from the list with ✕ then «Descartar». Hidden
// when there are none or the list cannot be read (the page keeps working).
// pendingCaptureStatus speaks frappe-ui themes; the kit chip speaks tones
const CHIP_TONE = { blue: 'info', red: 'danger', amber: 'warning' }
const props = defineProps({
  /** Doctypes this page drafts; the server lists only those captures. */
  targets: { type: Array, required: true },
  returnLabel: { type: String, default: '' },
})
const route = useRoute()
const rows = ref([])
const armed = ref('')
const confirmButton = ref(null)

function rowTitle(row) {
  return row.supplier || row.file_name || row.name
}

function reviewRoute(row) {
  return capturaRoute(row.name, {
    doctype: row.doctype,
    returnTo: '/crm' + route.fullPath,
    returnLabel: props.returnLabel,
  })
}

async function arm(row) {
  armed.value = row.name
  await nextTick()
  // The confirm takes the focus so a tap elsewhere (blur) or Esc puts the ✕ back.
  const el = Array.isArray(confirmButton.value)
    ? confirmButton.value[0]
    : confirmButton.value
  el?.focus()
}

function disarm(row) {
  if (armed.value === row.name) armed.value = ''
}

// The row leaves on the tap; a refusal puts it back where it was and says why.
async function discard(row) {
  armed.value = ''
  const at = rows.value.findIndex((r) => r.name === row.name)
  if (at < 0) return
  rows.value = rows.value.filter((r) => r.name !== row.name)
  try {
    await discardCapture(row.name)
    toast.success(__('Capture discarded'))
  } catch (error) {
    const next = rows.value.slice()
    next.splice(Math.min(at, next.length), 0, row)
    rows.value = next
    toast.error(capturaMessage(error))
  }
}

onMounted(async () => {
  try {
    rows.value = await loadPendingCaptures(props.targets)
  } catch {
    rows.value = []
  }
})
</script>
