<template>
  <!-- One custody step without a count (Shell-S14): hand a bag to the bank
       run, record the deposit slip, bring a bag back, resolve a difference,
       decline a change request, authorize a posting. It names who holds the
       cash before and after, asks only what the server requires, and keeps
       the server's sentence when it refuses. -->
  <BottomSheet
    :open="open"
    :title="title"
    :subtitle="subtitle"
    :dismissible="!busy"
    data-efectivo-paso
    @update:open="(v) => !busy && $emit('update:open', v)"
  >
    <div class="space-y-4 pb-2">
      <p
        v-if="amount !== null && amount !== undefined"
        class="num text-3xl font-semibold text-ink-gray-9"
      >
        {{ money(amount, currency) }}
      </p>
      <p
        v-if="custody"
        class="rounded-6 bg-surface-gray-1 px-3 py-2 text-sm text-ink-gray-7"
        data-efectivo-custody
      >
        {{ custody }}
      </p>
      <p v-if="message" class="text-sm text-ink-gray-7">{{ message }}</p>
      <label v-for="field in fields" :key="field.key" class="block space-y-1">
        <span class="text-sm font-medium text-ink-gray-7">{{ field.label }}</span>
        <textarea
          v-if="field.kind === 'reason'"
          v-model="values[field.key]"
          rows="2"
          class="w-full rounded-6 border-0 bg-surface-gray-1 px-3 py-2 text-base"
          :placeholder="field.placeholder || 'Ocho letras o más'"
          :disabled="busy"
          :data-field="field.key"
        />
        <input
          v-else
          v-model="values[field.key]"
          :type="field.kind === 'password' ? 'password' : 'text'"
          :autocomplete="field.kind === 'password' ? 'current-password' : 'off'"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
          :placeholder="field.placeholder || ''"
          :disabled="busy"
          :data-field="field.key"
        />
        <span v-if="field.hint" class="block text-xs text-ink-gray-6">{{ field.hint }}</span>
      </label>
      <p v-if="error" role="alert" class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7">
        {{ error }}
      </p>
    </div>
    <template #actions>
      <Button
        :variant="danger ? 'subtle' : 'solid'"
        :theme="danger ? 'red' : 'gray'"
        size="lg"
        class="w-full"
        :label="busy ? 'Guardando…' : confirmLabel"
        :disabled="busy || !ready"
        data-efectivo-confirm
        @click="confirm"
      />
      <p v-if="!ready && missing" class="mt-2 text-center text-sm text-ink-gray-6">
        {{ missing }}
      </p>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { money } from './efectivo'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  amount: { type: [Number, String], default: null },
  currency: { type: String, default: 'MXN' },
  custody: { type: String, default: '' },
  message: { type: String, default: '' },
  /** [{ key, label, kind: 'reason'|'text'|'password', min?, placeholder?, hint? }] */
  fields: { type: Array, default: () => [] },
  confirmLabel: { type: String, default: 'Confirmar' },
  danger: { type: Boolean, default: false },
  submit: { type: Function, required: true },
})
const emit = defineEmits(['update:open', 'done'])
const values = reactive({})
const busy = ref(false)
const error = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    for (const key of Object.keys(values)) delete values[key]
    for (const field of props.fields) values[field.key] = ''
    error.value = ''
  },
  { immediate: true },
)

const short = computed(() =>
  props.fields.find(
    (f) => String(values[f.key] || '').trim().length < (f.min ?? (f.kind === 'reason' ? 8 : 1)),
  ),
)
const ready = computed(() => !short.value)
const missing = computed(() => {
  const field = short.value
  if (!field) return ''
  if (field.kind === 'reason') return 'Escribe el motivo, con ocho letras o más.'
  if (field.kind === 'password') return 'Escribe tu contraseña para firmar.'
  return `Falta: ${field.label.toLowerCase()}.`
})

async function confirm() {
  busy.value = true
  error.value = ''
  try {
    const out = {}
    for (const field of props.fields) out[field.key] = String(values[field.key] || '').trim()
    const result = await props.submit(out)
    emit('done', result)
    emit('update:open', false)
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    busy.value = false
    for (const field of props.fields) if (field.kind === 'password') values[field.key] = ''
  }
}
</script>
