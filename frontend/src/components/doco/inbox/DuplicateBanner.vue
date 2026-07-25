<!--
  Detección de duplicados (spec 4.3, detection-only). Amber strip shown at the top
  of the deal/lead context panel when OTHER open records share this record's phone.
  Detect + navigate only: "Ver" emits open(doctype, name) and the parent (lead-owned
  DealContextPanel) routes it to selectDeal. No merge/rename/delete here.

  Prop-driven, fetch-once-per-conversation-change, NO polling. Renders nothing when
  there are no duplicates (or on any fetch error → stays silent).
-->
<template>
  <div
    v-if="duplicates.length"
    class="flex-none border-b border-outline-amber-2 bg-surface-amber-1 px-3.5 py-2.5"
  >
    <div class="flex items-start gap-2">
      <span class="flex-none text-[13px] leading-5" aria-hidden="true">⚠</span>
      <div class="min-w-0 flex-1">
        <div class="text-[11px] font-bold uppercase tracking-[.06em] text-ink-amber-3">
          {{ __('Posible duplicado') }}
        </div>
        <ul class="mt-1 flex flex-col gap-1">
          <li
            v-for="d in duplicates"
            :key="d.doctype + ':' + d.name"
            class="flex items-center justify-between gap-2"
          >
            <span class="min-w-0 truncate text-[12px] text-ink-gray-8">
              {{ d.title }}<span v-if="d.status" class="text-ink-gray-5"> ({{ d.status }})</span>
            </span>
            <button
              class="press flex-none rounded-md border border-outline-amber-2 bg-surface-white px-2 py-0.5 text-[11.5px] font-semibold text-ink-amber-3 hover:bg-surface-amber-2"
              @click="$emit('open', d.doctype, d.name)"
            >
              {{ __('Ver') }}
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { createResource } from 'frappe-ui'

const props = defineProps({
  // 'CRM Deal' | 'CRM Lead' — the record whose phone we check for other opens
  doctype: { type: String, default: '' },
  name: { type: String, default: '' },
})
defineEmits(['open'])

// A 403 (record the user can't read) must not surface a toast — stay silent.
const res = createResource({ url: 'doco_marketing.api.dedupe.find_duplicates', onError: () => {} })

// Fetch once per conversation change. Only Deals/Leads carry a dedup-able phone.
watch(
  () => [props.doctype, props.name],
  ([doctype, name]) => {
    res.data = null
    if ((doctype === 'CRM Deal' || doctype === 'CRM Lead') && name) {
      res.submit({ doctype, name })
    }
  },
  { immediate: true },
)

const duplicates = computed(() => res.data?.duplicates || [])
</script>
