<template>
  <section
    v-if="rows.length"
    class="mx-4 mb-3 rounded-6 border border-outline-gray-2 bg-surface-gray-1 p-3 sm:mx-6"
    data-capturas-pendientes
    :aria-label="__('Captures to finish')"
  >
    <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
      {{ __('Captures to finish ({0})', [rows.length]) }}
    </h2>
    <ul class="divide-y divide-outline-gray-1">
      <li v-for="row in rows" :key="row.name">
        <RouterLink
          :to="reviewRoute(row)"
          class="flex min-h-11 items-center gap-3 py-2 text-sm hover:bg-surface-gray-2"
          :data-captura="row.name"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium text-ink-gray-9">
              {{ row.supplier || row.file_name || row.name }}
            </span>
            <span class="block truncate text-ink-gray-6">
              {{
                [row.doc_label, row.invoice_no, relativeTime(row.received_at)]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </span>
          </span>
          <span
            v-if="row.total"
            class="shrink-0 tabular-nums text-ink-gray-8"
            >{{ money(row.total, row.currency) }}</span
          >
          <Badge
            class="shrink-0"
            :theme="pendingCaptureStatus(row).theme"
            :label="pendingCaptureStatus(row).label"
          />
          <span class="shrink-0 text-ink-blue-link">{{ __('Continue') }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Badge } from 'frappe-ui'
import {
  capturaRoute,
  loadPendingCaptures,
  pendingCaptureStatus,
} from '@/composables/useCaptura'
import { money } from '@/composables/useCompras'
import { relativeTime } from '@/utils/display'

// The captures this worker started and did not finish (no draft, not
// discarded): leaving a review must not strand its capture where only the chat
// can reach it. Each row reopens the review and comes back here. Hidden when
// there are none or the list cannot be read (the page keeps working).
const props = defineProps({
  /** Doctypes this page drafts; the server lists only those captures. */
  targets: { type: Array, required: true },
  returnLabel: { type: String, default: '' },
})
const route = useRoute()
const rows = ref([])

function reviewRoute(row) {
  return capturaRoute(row.name, {
    doctype: row.doctype,
    returnTo: '/crm' + route.fullPath,
    returnLabel: props.returnLabel,
  })
}

onMounted(async () => {
  try {
    rows.value = await loadPendingCaptures(props.targets)
  } catch {
    rows.value = []
  }
})
</script>
