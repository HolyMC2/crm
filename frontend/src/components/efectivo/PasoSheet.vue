<template>
  <!-- One custody step without a count (Shell-S14): hand a bag to the bank
       run, record the deposit slip, bring a bag back, resolve a difference,
       decline a change request, authorize a posting; for one bag or several.
       It names who holds the cash before and after, asks only what the server
       requires, and keeps the server's sentence when it refuses. -->
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
      <!-- Where the cash came from (the turn, its closing, the counter's note) and the
           sentence about it come before what the step does to the cash. -->
      <div
        v-if="source"
        class="rounded-6 border border-outline-gray-1 px-3 py-2"
        data-efectivo-source
      >
        <p class="text-base font-medium text-ink-gray-9">{{ source.title }}</p>
        <p v-if="source.line" class="text-sm text-ink-gray-6">
          {{ source.line }}
        </p>
        <p v-if="source.note" class="mt-1 text-sm text-ink-gray-8">
          {{ source.note }}
        </p>
        <RouterLink
          v-if="source.to"
          :to="source.to"
          class="press -mx-1 mt-1 inline-flex min-h-10 items-center gap-1 rounded-full px-1 text-sm font-medium text-ink-gray-9 underline"
          data-efectivo-source-link
        >
          Ver el corte
          <span class="lucide-chevron-right size-4" aria-hidden="true" />
        </RouterLink>
      </div>
      <p v-if="message && source" class="text-sm text-ink-gray-7">
        {{ message }}
      </p>
      <p
        v-if="custody"
        class="rounded-6 bg-surface-gray-1 px-3 py-2 text-sm text-ink-gray-7"
        data-efectivo-custody
      >
        {{ custody }}
      </p>
      <BagItems v-if="items.length" :items="items" />
      <p v-if="message && !source" class="text-sm text-ink-gray-7">
        {{ message }}
      </p>
      <p
        v-if="guard"
        role="status"
        class="rounded-6 bg-surface-amber-1 px-3 py-2 text-sm text-ink-amber-8"
        data-efectivo-guard
      >
        {{ guard }}
      </p>
      <template v-for="field in fields" :key="field.key">
        <label
          v-if="field.kind === 'confirm'"
          class="flex items-start gap-3 rounded-6 bg-surface-gray-1 px-3 py-3"
        >
          <input
            v-model="values[field.key]"
            type="checkbox"
            class="mt-0.5 size-5 flex-none rounded"
            :disabled="busy || !!guard"
            :data-field="field.key"
          />
          <span class="text-base text-ink-gray-9">{{ labelOf(field) }}</span>
        </label>
        <label v-else class="block space-y-1">
          <span class="text-sm font-medium text-ink-gray-7">{{
            labelOf(field)
          }}</span>
          <select
            v-if="field.kind === 'choice'"
            v-model="values[field.key]"
            class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
            :disabled="busy"
            :data-field="field.key"
          >
            <option
              v-for="option in field.options"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <textarea
            v-else-if="field.kind === 'reason'"
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
            :autocomplete="
              field.kind === 'password' ? 'current-password' : 'off'
            "
            class="h-11 w-full rounded-6 border-0 bg-surface-gray-1 px-3 text-base"
            :placeholder="field.placeholder || ''"
            :disabled="busy"
            :data-field="field.key"
          />
          <span v-if="field.hint" class="block text-xs text-ink-gray-6">{{
            field.hint
          }}</span>
        </label>
      </template>
    </div>
    <template #actions>
      <p
        v-if="error"
        role="alert"
        class="mb-2 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-efectivo-error
      >
        {{ error }}
      </p>
      <Button
        :variant="danger ? 'subtle' : 'solid'"
        :theme="danger ? 'red' : 'gray'"
        size="lg"
        class="w-full"
        :label="busy ? 'Guardando…' : confirmLabel"
        :disabled="busy || !ready || !!guard"
        data-efectivo-confirm
        @click="confirm"
      />
      <p
        v-if="!guard && !ready && missing"
        class="mt-2 text-center text-sm text-ink-gray-6"
      >
        {{ missing }}
      </p>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import BagItems from './BagItems.vue'
import { errorText, money } from './efectivo'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  amount: { type: [Number, String], default: null },
  currency: { type: String, default: 'MXN' },
  custody: { type: String, default: '' },
  message: { type: String, default: '' },
  /** The turn the cash came from (`shiftSource`): { title, line, note?, to? }. */
  source: { type: Object, default: null },
  /** The bags a step on several acts on: [{ key, title, meta? }]. */
  items: { type: Array, default: () => [] },
  /**
   * [{ key, label, kind: 'reason'|'text'|'password'|'confirm'|'choice', min?,
   *    placeholder?, hint?, options? }]; `label` may be (values) => text,
   * `options` are a choice's [{ value, label }] (the first one starts chosen).
   */
  fields: { type: Array, default: () => [] },
  /** Why this step cannot be taken now: shown in place of the button's promise. */
  guard: { type: String, default: '' },
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
    for (const field of props.fields)
      values[field.key] =
        field.kind === 'confirm'
          ? false
          : field.kind === 'choice'
            ? field.options?.[0]?.value ?? ''
            : ''
    error.value = ''
  },
  { immediate: true },
)

const labelOf = (field) =>
  typeof field.label === 'function' ? field.label(values) : field.label

const short = computed(() =>
  props.fields.find((f) =>
    f.kind === 'confirm'
      ? values[f.key] !== true
      : String(values[f.key] || '').trim().length <
        (f.min ?? (f.kind === 'reason' ? 8 : 1)),
  ),
)
const ready = computed(() => !short.value)
const missing = computed(() => {
  const field = short.value
  if (!field) return ''
  if (field.kind === 'reason')
    return 'Escribe el motivo, con ocho letras o más.'
  if (field.kind === 'password') return 'Escribe tu contraseña para firmar.'
  if (field.kind === 'confirm') return 'Marca la casilla para confirmar.'
  return `Falta: ${labelOf(field).toLowerCase()}.`
})

async function confirm() {
  busy.value = true
  error.value = ''
  try {
    const out = {}
    for (const field of props.fields)
      out[field.key] =
        field.kind === 'confirm'
          ? values[field.key] === true
          : String(values[field.key] || '').trim()
    const result = await props.submit(out)
    emit('done', result)
    emit('update:open', false)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    busy.value = false
    for (const field of props.fields)
      if (field.kind === 'password') values[field.key] = ''
  }
}
</script>
