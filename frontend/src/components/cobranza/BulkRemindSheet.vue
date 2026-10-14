<template>
  <CobranzaSheet
    :model-value="modelValue"
    kind="bulk"
    size="xl"
    :title="__('Send payment reminders')"
    :subtitle="subtitle"
    @update:model-value="close"
  >
    <template v-if="!result">
      <p class="text-sm text-ink-gray-7">
        {{
          __(
            'Each overdue invoice of these customers gets the reminder of the level it reached, by WhatsApp in your name. Those that cannot go out say why and how to resolve them.',
          )
        }}
      </p>
      <ul class="max-h-60 space-y-1 overflow-y-auto text-sm">
        <li v-for="row in chosen" :key="`${row.customer}:${row.company}`">
          {{ row.customer_name }}
          <span class="text-ink-gray-6"
            >·
            {{
              row.overdue_invoices === 1
                ? __('1 overdue invoice')
                : __('{0} overdue invoices', [row.overdue_invoices || 0])
            }}</span
          >
        </li>
      </ul>
      <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
      </p>
    </template>
    <template v-else>
      <p role="status" class="text-sm font-medium" data-bulk-summary>
        {{ bulkSummary(result.summary) || __('Nothing was overdue.') }}
      </p>
      <ul class="divide-y divide-outline-gray-1 text-sm">
        <li
          v-for="item in result.results"
          :key="item.invoice"
          class="space-y-1 py-2"
          :data-bulk-state="item.state"
        >
          <p class="flex flex-wrap items-baseline gap-x-2">
            <FeatherIcon
              :name="ICONS[item.state] || 'info'"
              class="h-4 w-4 shrink-0 self-center"
              :class="TONES[item.state]"
            />
            <span class="font-medium">{{ item.customer_name }}</span>
            <span class="text-ink-gray-6">
              · {{ item.invoice }}
              <template v-if="item.label"> · {{ item.label }}</template>
            </span>
          </p>
          <p v-if="item.state === 'sent'" class="text-ink-green-8">
            {{ __('Sent', null, CTX) }}
          </p>
          <p v-else-if="item.message" class="text-ink-gray-8">
            {{ item.message }}
          </p>
          <div
            v-if="item.state === 'blocked' || item.state === 'skipped'"
            class="flex flex-wrap gap-2"
          >
            <Button
              size="sm"
              class="min-h-11 sm:min-h-7"
              :label="__('Open customer')"
              @click="$emit('open', item)"
            />
            <a
              v-if="item.dunning && item.actions.includes('download')"
              class="inline-flex min-h-11 items-center text-ink-blue-link underline sm:min-h-0"
              :href="downloadUrl('Dunning', item.dunning)"
              >{{ __('Download PDF') }}</a
            >
          </div>
        </li>
      </ul>
    </template>
    <template #actions>
      <template v-if="!result">
        <Button
          class="min-h-11 sm:min-h-8"
          :label="__('Cancel')"
          @click="close(false)"
        />
        <Button
          class="min-h-11 sm:min-h-8"
          variant="solid"
          :label="__('Send to {0} customers', [chosen.length])"
          :loading="sending"
          @click="send"
        />
      </template>
      <Button
        v-else
        class="min-h-11 sm:min-h-8"
        variant="solid"
        :label="__('Done')"
        @click="close(false)"
      />
    </template>
  </CobranzaSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, FeatherIcon } from 'frappe-ui'
import CobranzaSheet from '@/components/cobranza/CobranzaSheet.vue'
import {
  ACTIONS,
  CTX,
  bulkSummary,
  downloadUrl,
  problemOf,
} from '@/composables/useCobranza'
import { createRequests } from '@/composables/useCobranzaActions'

// «Enviar recordatorio» to the selected customers: the same letter writer and
// send service as one at a time, a result per invoice, and a way to resolve
// each one that could not go out (open the customer's record, download the PDF).
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  rows: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'done', 'open'])
const call = createRequests()
const sending = ref(false)
const result = ref(null)
const problem = ref(null)
const ICONS = {
  sent: 'check-circle',
  already: 'check',
  blocked: 'alert-triangle',
  skipped: 'minus-circle',
}
const TONES = {
  sent: 'text-ink-green-8',
  already: 'text-ink-gray-6',
  blocked: 'text-ink-amber-9',
  skipped: 'text-ink-gray-6',
}
// The customers as they were when the sheet opened (the list may reload meanwhile).
const chosen = ref([])
const subtitle = computed(() =>
  chosen.value.length === 1
    ? chosen.value[0].customer_name
    : __('{0} customers', [chosen.value.length]),
)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      chosen.value = [...props.rows]
      result.value = null
      problem.value = null
    }
  },
  { immediate: true },
)

async function send() {
  sending.value = true
  problem.value = null
  try {
    result.value = await call('bulk', `${ACTIONS}.bulk_remind`, {
      rows: chosen.value.map((row) => ({
        customer: row.customer,
        company: row.company,
      })),
    })
    emit('done', result.value)
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    sending.value = false
  }
}

function close(value) {
  if (value) return
  emit('update:modelValue', false)
}
</script>
