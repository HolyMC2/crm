<template>
  <!-- «Confirmar» several prepared purchases: the same review as one (who,
       how much, when, where), each confirmed with its own native submit and
       version check, one result each. -->
  <PowerSheet
    :model-value="modelValue"
    kind="bulk-confirm"
    :title="
      results.length ? __('Confirmed purchases') : __('Review and confirm')
    "
    @update:model-value="(value) => !value && $emit('update:modelValue', false)"
  >
    <PowerResults
      v-if="results.length"
      :results="resultRows"
      :done-label="__('Confirmed', null, 'Compras')"
      @open="(entry) => $emit('open', entry.row)"
      @retry="run"
    />
    <template v-else>
      <p v-if="plan.ready.length" class="text-base text-ink-gray-8">
        {{
          __(
            'Confirming commits these purchases with their suppliers. Stock moves only when goods are received.',
          )
        }}
      </p>
      <ul
        class="max-h-64 divide-y divide-outline-gray-1 overflow-y-auto text-sm"
      >
        <li
          v-for="row in plan.ready"
          :key="row.name"
          class="flex items-start justify-between gap-2 py-2"
        >
          <span class="min-w-0">
            <span class="block truncate font-medium text-ink-gray-9">{{
              row.party || __('Supplier not visible')
            }}</span>
            <span class="block truncate text-ink-gray-6">
              {{
                [row.name, row.due_date && __('Delivery {0}', [row.due_date])]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </span>
          </span>
          <span class="shrink-0 tabular-nums">{{
            money(row.grand_total, row.currency)
          }}</span>
        </li>
      </ul>
      <p
        v-if="plan.skipped.length"
        class="text-sm text-ink-gray-6"
        data-bulk-skipped
      >
        {{
          __('Left out: {0}', [
            plan.skipped.map((s) => `${s.row.name} (${s.reason})`).join('; '),
          ])
        }}
      </p>
    </template>
    <template #actions>
      <Button
        class="min-h-11 sm:min-h-8"
        :label="
          results.length
            ? __('Close', null, 'Compras')
            : __('Back', null, 'Compras')
        "
        @click="$emit('update:modelValue', false)"
      />
      <Button
        v-if="!results.length && plan.ready.length"
        variant="solid"
        class="min-h-11 sm:min-h-8"
        :loading="running"
        :label="
          plan.ready.length === 1
            ? __('Confirm 1 purchase')
            : __('Confirm {0} purchases', [plan.ready.length])
        "
        @click="run"
      />
    </template>
  </PowerSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import PowerResults from '@/components/power/PowerResults.vue'
import PowerSheet from '@/components/power/PowerSheet.vue'
import {
  bulkConfirmPlan,
  comprasApi,
  money,
  outcomeUnknown,
  problemOf,
  requestId,
} from '@/composables/useCompras'
import { runBulk } from '@/utils/powerList'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  rows: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'done', 'open'])
const running = ref(false)
const results = ref([])
// One request id per purchase until a definite answer: a retry replays.
const pending = {}

const plan = computed(() => bulkConfirmPlan(props.rows))
const resultRows = computed(() =>
  results.value.map((entry) => ({
    key: entry.item.name,
    row: entry.item,
    status: entry.status,
    label: `${entry.item.party || entry.item.name} · ${entry.item.name}`,
    detail: entry.detail,
    actionLabel: __('Open purchase'),
  })),
)

watch(
  () => props.modelValue,
  (open) => {
    if (open) results.value = []
  },
)

async function run() {
  running.value = true
  const settled = new Set(
    results.value
      .filter((entry) => entry.status === 'done' || entry.status === 'already')
      .map((entry) => entry.item.name),
  )
  const kept = results.value.filter((entry) => settled.has(entry.item.name))
  const fresh = await runBulk(
    plan.value.ready.filter((row) => !settled.has(row.name)),
    async (row) => {
      pending[row.name] ||= requestId()
      try {
        const result = await comprasApi('confirm_order', {
          request_id: pending[row.name],
          name: row.name,
          modified: row.modified,
        })
        delete pending[row.name]
        return result.already
          ? { status: 'already', detail: __('It was already confirmed') }
          : {
              status: 'done',
              detail: __('Confirmed; it now waits in To receive'),
            }
      } catch (error) {
        if (!outcomeUnknown(error)) delete pending[row.name]
        throw error
      }
    },
    {
      describe: (error) => problemOf(error).detail,
      unknown: outcomeUnknown,
      onProgress: (partial) => (results.value = [...kept, ...partial]),
    },
  )
  results.value = [...kept, ...fresh]
  running.value = false
  emit('done', fresh)
}
</script>
