<template>
  <!-- «Asignar» several cases: the same native assignment as one case, each
       re-checked by the server (who cannot work a case is refused for that
       case, with the reason), one result each. -->
  <PowerSheet
    :model-value="modelValue"
    kind="bulk-assign"
    :title="results.length ? __('Assigned cases') : __('Assign cases')"
    @update:model-value="(value) => !value && $emit('update:modelValue', false)"
  >
    <PowerResults
      v-if="results.length"
      :results="resultRows"
      :done-label="__('Assigned', null, 'Garantías')"
      @open="(entry) => $emit('open', entry.row)"
      @retry="run"
    />
    <template v-else>
      <p class="text-base text-ink-gray-8">
        {{
          plan.ready.length === 1
            ? __('1 case')
            : __('{0} cases', [plan.ready.length])
        }}
      </p>
      <Button
        v-if="me && !user"
        class="min-h-11 w-full sm:min-h-8 sm:w-auto"
        :label="__('Assign them to me')"
        @click="pick({ value: me, label: __('you', null, 'Garantías') })"
      />
      <ComprasPicker
        v-if="plan.ready.length"
        v-model="user"
        :display="userLabel"
        :label="__('Assign to', null, 'Garantías')"
        :placeholder="__('Search a person')"
        :empty-text="
          __('Nobody else can work this case. Ask your manager for access.')
        "
        :hint="
          __('Only people with access to Garantías in this company appear.')
        "
        :load="search"
        @pick="pick"
      />
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
            ? __('Close', null, 'Garantías')
            : __('Back', null, 'Garantías')
        "
        @click="$emit('update:modelValue', false)"
      />
      <Button
        v-if="!results.length && plan.ready.length"
        variant="solid"
        class="min-h-11 sm:min-h-8"
        :disabled="!user"
        :loading="running"
        :label="
          plan.ready.length === 1
            ? __('Assign 1 case')
            : __('Assign {0} cases', [plan.ready.length])
        "
        @click="run"
      />
    </template>
  </PowerSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import PowerResults from '@/components/power/PowerResults.vue'
import PowerSheet from '@/components/power/PowerSheet.vue'
import {
  bulkAssignPlan,
  garantiasApi,
  outcomeUnknown,
  problemOf,
} from '@/composables/useGarantias'
import { runBulk } from '@/utils/powerList'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  rows: { type: Array, default: () => [] },
  me: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'done', 'open'])
const user = ref('')
const userLabel = ref('')
const running = ref(false)
const results = ref([])

const plan = computed(() => bulkAssignPlan(props.rows))
const resultRows = computed(() =>
  results.value.map((entry) => ({
    key: entry.item.name,
    row: entry.item,
    status: entry.status,
    label: `${entry.item.customer_name || entry.item.name} · ${entry.item.name}`,
    detail: entry.detail,
    actionLabel: __('Open case'),
  })),
)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    results.value = []
    user.value = ''
    userLabel.value = ''
  },
)

/** People who can work the first case; the server re-checks each one. */
async function search(text) {
  const first = plan.value.ready[0]
  if (!first) return []
  const rows = await garantiasApi('assignable_users', {
    name: first.name,
    q: text || '',
  })
  return rows.map((row) => ({ value: row.user, label: row.full_name }))
}
function pick(option) {
  user.value = option.value
  userLabel.value = option.label
}

async function run() {
  if (!user.value) return
  running.value = true
  const target = user.value
  const settled = new Set(
    results.value
      .filter((entry) => entry.status === 'done' || entry.status === 'already')
      .map((entry) => entry.item.name),
  )
  const kept = results.value.filter((entry) => settled.has(entry.item.name))
  const fresh = await runBulk(
    plan.value.ready.filter((row) => !settled.has(row.name)),
    async (row) => {
      if ((row.assignees || []).some((a) => a.user === target))
        return { status: 'already', detail: __('Already assigned') }
      // Native assign_to: adding the same person twice is a no-op, so a retry is safe.
      await garantiasApi('assign', { name: row.name, user: target })
      return {
        status: 'done',
        user: target,
        detail: __('Assigned to {0}', [userLabel.value]),
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
