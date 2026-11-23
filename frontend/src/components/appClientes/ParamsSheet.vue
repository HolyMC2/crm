<template>
  <!-- One section's rules (the cell's params for it): a switch, a number, an
       amount in the shop's currency, one choice or several as chips.
       «Cancelar» and the one filled «Guardar cambios»; a backdrop tap does not
       close it while something changed. Whoever cannot change them reads
       them. The server's answer replaces the page's state. -->
  <BottomSheet
    :open="open"
    :title="row?.label || ''"
    :subtitle="row?.help || ''"
    :dismissible="!dirty && !saving"
    @update:open="(value) => emit('update:open', value)"
  >
    <!-- What the shop decides above these rules (Cupones: whether its online
         store takes coupons at all), with the way to change it. -->
    <div
      v-if="row && note"
      role="note"
      class="mb-3 space-y-2 rounded-6 bg-surface-gray-2 p-3"
      :data-app-clientes-nota="note.on ? 'si' : 'no'"
    >
      <p class="text-sm text-ink-gray-8">{{ note.text }}</p>
      <RouterLink
        v-if="note.link"
        :to="note.link.to"
        class="press inline-flex min-h-11 items-center rounded-6 bg-surface-base px-3 text-sm font-medium text-ink-gray-8"
        data-app-clientes-nota-cambiar
        >{{ note.link.label }}</RouterLink
      >
    </div>
    <div v-if="row && !canChange" class="pb-2" data-app-clientes-reglas>
      <p role="note" class="pb-1 text-sm text-ink-gray-6">
        {{ __('Whoever runs the system can change these rules.', null, CTX) }}
      </p>
      <dl class="divide-y divide-outline-gray-1">
        <div
          v-for="param in params"
          :key="param.key"
          class="flex items-baseline justify-between gap-3 py-3"
          :data-param="param.key"
        >
          <dt class="min-w-0 text-base text-ink-gray-8">{{ param.label }}</dt>
          <dd class="num text-right text-base text-ink-gray-9">
            {{ paramValueText(param, param.value, currency) }}
          </dd>
        </div>
      </dl>
    </div>
    <form
      v-else-if="row"
      id="app-clientes-reglas"
      class="space-y-5 pb-2"
      novalidate
      data-app-clientes-reglas
      @submit.prevent="save"
    >
      <div v-for="param in params" :key="param.key" :data-param="param.key">
        <div
          v-if="param.type === 'bool'"
          class="flex min-h-14 items-center gap-3"
        >
          <label :for="fieldId(param)" class="min-w-0 flex-1">
            <span class="block text-base text-ink-gray-9">{{
              param.label
            }}</span>
            <span
              v-if="locked(param)"
              class="block text-sm text-ink-gray-6"
              data-app-clientes-reglas-bloqueada
              >{{ note.lockedHelp }}</span
            >
            <span
              v-else-if="param.help"
              class="block text-sm text-ink-gray-6"
              >{{ param.help }}</span
            >
          </label>
          <AjustesSwitch
            :id="fieldId(param)"
            :model-value="Boolean(draft[param.key])"
            :label="param.label"
            :disabled="saving || locked(param)"
            @update:model-value="(value) => (draft[param.key] = value)"
          />
        </div>
        <template v-else-if="param.type === 'int' || param.type === 'money'">
          <label
            :for="fieldId(param)"
            class="mb-1 block text-sm text-ink-gray-7"
            >{{ param.label }}</label
          >
          <div class="relative">
            <span
              v-if="param.type === 'money' && sign"
              class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-ink-gray-6"
              aria-hidden="true"
              >{{ sign }}</span
            >
            <input
              :id="fieldId(param)"
              v-model="draft[param.key]"
              type="text"
              :inputmode="param.type === 'money' ? 'decimal' : 'numeric'"
              autocomplete="off"
              class="num h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-4"
              :class="param.type === 'money' && sign ? 'pl-9' : ''"
              :disabled="saving"
              :aria-invalid="shownProblem(param) ? 'true' : undefined"
              :aria-describedby="describedBy(param)"
            />
          </div>
          <p
            v-if="param.help"
            :id="`${fieldId(param)}-ayuda`"
            class="mt-1 text-sm text-ink-gray-6"
          >
            {{ param.help }}
          </p>
          <p
            v-if="shownProblem(param)"
            :id="`${fieldId(param)}-problema`"
            role="alert"
            class="mt-1 text-sm text-ink-red-7"
          >
            {{ shownProblem(param) }}
          </p>
        </template>
        <template
          v-else-if="param.type === 'select' || param.type === 'multiselect'"
        >
          <ChipGroup
            :label="param.label"
            :options="param.options || []"
            :multiple="param.type === 'multiselect'"
            :clear-value="null"
            :model-value="draft[param.key]"
            :testid="`param-${param.key}`"
            @update:model-value="(value) => pick(param, value)"
          />
          <p v-if="param.help" class="mt-1 text-sm text-ink-gray-6">
            {{ param.help }}
          </p>
        </template>
      </div>
      <p
        v-if="failure"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-app-clientes-reglas-problema
      >
        {{ failure }}
      </p>
    </form>
    <template v-if="row && canChange" #actions>
      <div class="flex gap-2">
        <button
          type="button"
          :class="['press flex-none', BTN.tonal]"
          :disabled="saving"
          data-app-clientes-reglas-cancelar
          @click="emit('update:open', false)"
        >
          {{ __('Cancel', null, CTX) }}
        </button>
        <button
          type="submit"
          form="app-clientes-reglas"
          :class="['press flex-1', BTN.filled]"
          :disabled="saving || !dirty || hasProblem"
          data-app-clientes-reglas-guardar
        >
          <span
            v-if="saving"
            class="lucide-loader-circle size-5 animate-spin"
            aria-hidden="true"
          />
          {{ __('Save changes', null, CTX) }}
        </button>
      </div>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { BottomSheet, ChipGroup } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/utils/errorText'
import { saveState } from './api'
import {
  CTX,
  currencySign,
  paramChanges,
  paramDraft,
  paramProblem,
  paramValueText,
  paramsChange,
} from './view'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** sectionRow(): {key, label, help, params} */
  row: { type: Object, default: null },
  storefront: { type: String, default: '' },
  currency: { type: String, default: '' },
  canChange: { type: Boolean, default: false },
  /** view.js onlineCouponsNote(): {on, text, link:{label, to}, locks,
   * lockedHelp} or null; a param in `locks` cannot change here */
  note: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'saved'])

const params = computed(() => props.row?.params || [])
const sign = computed(() => currencySign(props.currency))
const draft = ref({})
const start = ref({})
const saving = ref(false)
const failure = ref('')

watch(
  () => [props.open, props.row],
  ([open]) => {
    if (!open) return
    start.value = paramDraft(params.value)
    draft.value = paramDraft(params.value)
    failure.value = ''
  },
  { immediate: true },
)

const changes = computed(() => paramChanges(params.value, draft.value))
const dirty = computed(() => Object.keys(changes.value).length > 0)
// Only a field the owner typed in is judged: an untouched one is not sent.
const problems = computed(() => {
  const found = {}
  for (const param of params.value) {
    const typed = String(draft.value[param.key] ?? '')
    if (typed === String(start.value[param.key] ?? '')) continue
    const problem = paramProblem(param, typed, props.currency)
    if (problem) found[param.key] = problem
  }
  return found
})

const hasProblem = computed(() => Object.keys(problems.value).length > 0)

const fieldId = (param) => `app-clientes-${props.row?.key}-${param.key}`
// a rule the shop's own setting overrides (Cupones «online» while the online
// store takes no coupons): shown, not changeable here
const locked = (param) =>
  Array.isArray(props.note?.locks) && props.note.locks.includes(param.key)
const shownProblem = (param) => problems.value[param.key] || ''
function describedBy(param) {
  const ids = []
  if (param.help) ids.push(`${fieldId(param)}-ayuda`)
  if (shownProblem(param)) ids.push(`${fieldId(param)}-problema`)
  return ids.join(' ') || undefined
}
// One choice stays chosen: a second tap on it keeps it.
function pick(param, value) {
  if (param.type === 'select' && value === null) return
  draft.value = { ...draft.value, [param.key]: value }
}

async function save() {
  if (saving.value || !dirty.value || Object.keys(problems.value).length) return
  saving.value = true
  failure.value = ''
  try {
    const answer = await saveState(
      props.storefront,
      paramsChange(props.row.key, changes.value),
    )
    emit('saved', answer)
  } catch (error) {
    failure.value = errorText(
      error,
      __('The changes were not saved. Try again.', null, CTX),
    )
  } finally {
    saving.value = false
  }
}
</script>
