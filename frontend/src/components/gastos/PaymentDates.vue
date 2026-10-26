<template>
  <!-- Two dates, never one «payment date»: the bank's (on the transfer or
       receipt) and the books' (the day the payment counts in balances). An old
       payment recorded late keeps both right. -->
  <FormControl
    v-model="referenceDate"
    type="date"
    :label="__('Date on the bank or receipt')"
  />
  <FormControl
    v-model="postingDate"
    type="date"
    :max="today"
    :label="__('Posting date (in the books)')"
  />
  <p class="text-xs text-ink-gray-6" data-posting-hint>
    {{
      postingDate && postingDate !== today
        ? __(
            'This payment counts in the books on {0}, not today. Use the day the money left the account.',
            [postingDate],
          )
        : __(
            'Counts in the books today. For an old payment recorded late, use the day the money left the account.',
          )
    }}
  </p>
  <FormControl
    v-model="mode"
    type="select"
    :disabled="Boolean(fixed)"
    :label="__('Mode of payment')"
    :options="modeOptions"
  />
</template>
<script setup>
import { computed, watch } from 'vue'
import { FormControl } from 'frappe-ui'
import { defaultMode } from '@/composables/useGastos'

const props = defineProps({
  // pay_options / reimburse_options: `modes` per account and `today`.
  options: { type: Object, default: null },
  account: { type: String, default: '' },
  // The bill's own mode of payment, when it fixes the account.
  fixed: { type: String, default: '' },
})
const referenceDate = defineModel('referenceDate', { type: String })
const postingDate = defineModel('postingDate', { type: String })
const mode = defineModel('mode', { type: String })

const today = computed(() => props.options?.today || '')
const modes = computed(() => props.options?.modes?.[props.account] || [])
const modeOptions = computed(() => {
  const names = props.fixed ? [props.fixed] : modes.value
  return [
    ...(props.fixed ? [] : [{ label: __('Not set'), value: '' }]),
    ...names.map((name) => ({ label: name, value: name })),
  ]
})

// The books date follows the bank's until it is set on its own.
watch(referenceDate, (now, before) => {
  if (now && postingDate.value === before && now <= today.value)
    postingDate.value = now
})
watch(
  () => [props.account, props.options],
  () => {
    if (props.fixed || !modes.value.includes(mode.value))
      mode.value = defaultMode(props.options, props.account, props.fixed)
  },
  { immediate: true },
)
</script>
