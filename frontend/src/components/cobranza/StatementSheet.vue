<template>
  <CobranzaSheet
    :model-value="modelValue"
    kind="statement"
    :title="__('Statement of account')"
    :subtitle="customerName"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <p class="text-sm text-ink-gray-7">
      {{
        __(
          'Every invoice and payment of the period with the balance, and what is still owed by age (ERPNext’s statement of accounts).',
        )
      }}
    </p>
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="preset in presets"
        :key="preset.label"
        size="sm"
        class="min-h-11 sm:min-h-7"
        :variant="
          form.from === preset.from && form.to === preset.to
            ? 'solid'
            : 'subtle'
        "
        :label="preset.label"
        @click="Object.assign(form, { from: preset.from, to: preset.to })"
      />
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <FormControl
        v-model="form.from"
        type="date"
        :label="__('From')"
        :max="form.to || today"
      />
      <FormControl
        v-model="form.to"
        type="date"
        :label="__('To')"
        :max="today"
      />
    </div>
    <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
      <strong>{{ problem.title }}.</strong> {{ problem.detail }}
    </p>
    <p v-if="ready" role="status" class="text-sm text-ink-green-8">
      {{ __('Ready: {0}', [ready.name]) }}
    </p>
    <template #actions>
      <Button :label="__('Close')" @click="$emit('update:modelValue', false)" />
      <Button
        v-if="canShare"
        :label="__('Share from my phone')"
        :loading="busy === 'share'"
        :disabled="!valid"
        @click="get('share')"
      />
      <Button
        variant="solid"
        :label="__('Download PDF')"
        :loading="busy === 'download'"
        :disabled="!valid"
        @click="get('download')"
      />
    </template>
  </CobranzaSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import CobranzaSheet from '@/components/cobranza/CobranzaSheet.vue'
import { ACTIONS, addDays, problemOf } from '@/composables/useCobranza'
import { callError } from '@/utils/contactos'

// «Estado de cuenta»: ERPNext's own statement (General Ledger with ageing) for
// this customer and period, as a PDF to download or share from the phone.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  customer: { type: String, default: '' },
  company: { type: String, default: '' },
  customerName: { type: String, default: '' },
  today: { type: String, default: '' },
})
defineEmits(['update:modelValue'])
const form = reactive({ from: '', to: '' })
const busy = ref('')
const problem = ref(null)
const ready = ref(null)
const canShare =
  typeof navigator !== 'undefined' &&
  typeof navigator.canShare === 'function' &&
  typeof File !== 'undefined' &&
  navigator.canShare({
    files: [new File([''], 'x.pdf', { type: 'application/pdf' })],
  })
const presets = computed(() => {
  if (!props.today) return []
  const year = props.today.slice(0, 4)
  return [
    {
      label: __('This month'),
      from: `${props.today.slice(0, 7)}-01`,
      to: props.today,
    },
    {
      label: __('Last 3 months'),
      from: addDays(props.today, -90),
      to: props.today,
    },
    { label: __('This year'), from: `${year}-01-01`, to: props.today },
  ]
})
const valid = computed(() =>
  Boolean(form.from && form.to && form.from <= form.to),
)

watch(
  () => [props.modelValue, props.customer],
  ([open]) => {
    if (!open) return
    problem.value = null
    ready.value = null
    if (!form.to && props.today)
      Object.assign(form, { from: addDays(props.today, -90), to: props.today })
  },
  { immediate: true },
)

async function get(mode) {
  busy.value = mode
  problem.value = null
  ready.value = null
  const params = new URLSearchParams({
    customer: props.customer,
    company: props.company,
    from_date: form.from,
    to_date: form.to,
  })
  try {
    let response
    try {
      response = await fetch(
        `/api/method/${ACTIONS}.statement_pdf?${params.toString()}`,
        { headers: { Accept: 'application/pdf, application/json' } },
      )
    } catch {
      const error = new Error('statement_pdf')
      error.offline = true
      error.messages = [__('No connection. Reconnect and check again.')]
      throw error
    }
    const type = response.headers.get('content-type') || ''
    if (!response.ok || !type.includes('pdf')) {
      const data = await response.json().catch(() => ({}))
      throw callError('statement_pdf', response.status, data)
    }
    const blob = await response.blob()
    const name =
      /filename="?([^";]+)"?/.exec(
        response.headers.get('content-disposition') || '',
      )?.[1] || `${__('Statement of account')}.pdf`
    const file = new File([blob], decodeURIComponent(name), {
      type: 'application/pdf',
    })
    if (mode === 'share' && canShare) {
      await navigator.share({ files: [file], title: file.name }).catch(() => {})
    } else {
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    }
    ready.value = { name: file.name }
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    busy.value = ''
  }
}
</script>
