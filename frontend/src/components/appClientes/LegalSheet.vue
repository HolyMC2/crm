<template>
  <!-- «Textos legales»: the terms, returns, warranty and privacy notice the
       shop's customers read in their app, the days to return a purchase and
       the business days to answer a privacy request (the law of the shop's
       country by default, never more than it allows).
       The cell's suggested text shows in grey in an empty field and «Usar
       texto sugerido» writes it in. Read again on every open; «Cancelar» and
       the one filled «Guardar textos»; whoever cannot change them reads them. -->
  <BottomSheet
    :open="open"
    :title="__('Legal texts', null, CTX)"
    :subtitle="
      __('What your customers read in the app before they buy.', null, CTX)
    "
    :dismissible="!dirty && !saving"
    @update:open="(value) => emit('update:open', value)"
  >
    <div
      v-if="!texts && !failure"
      role="status"
      :aria-label="__('Loading…', null, CTX)"
      class="space-y-3 pb-2"
    >
      <div class="h-32 animate-pulse rounded-6 bg-surface-gray-2" />
      <div class="h-32 animate-pulse rounded-6 bg-surface-gray-2" />
    </div>
    <div v-else-if="!texts" role="alert" class="space-y-3 pb-2">
      <p class="text-base text-ink-gray-8">{{ failure }}</p>
      <button
        type="button"
        :class="['press', BTN.tonal]"
        data-app-clientes-legales-reintentar
        @click="load"
      >
        {{ __('Try again', null, CTX) }}
      </button>
    </div>
    <form
      v-else
      id="app-clientes-legales"
      class="space-y-6 pb-2"
      novalidate
      data-app-clientes-legales
      @submit.prevent="save"
    >
      <p v-if="!canChange" role="note" class="text-sm text-ink-gray-6">
        {{ __('Whoever runs the system can change these texts.', null, CTX) }}
      </p>
      <div v-for="field in fields" :key="field.key" :data-legal="field.key">
        <label
          :for="`app-clientes-${field.key}`"
          class="mb-1 block text-sm text-ink-gray-7"
          >{{ field.label }}</label
        >
        <textarea
          :id="`app-clientes-${field.key}`"
          v-model="draft[field.key]"
          rows="6"
          class="w-full rounded-6 border-0 bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-4"
          :placeholder="field.suggested || undefined"
          :readonly="!canChange || saving"
          :aria-describedby="
            field.suggested && !draft[field.key].trim()
              ? `app-clientes-${field.key}-nota`
              : undefined
          "
        />
        <div
          v-if="field.suggested"
          class="mt-1 flex flex-wrap items-center justify-between gap-x-3"
        >
          <p
            v-if="!draft[field.key].trim()"
            :id="`app-clientes-${field.key}-nota`"
            class="min-w-0 flex-1 text-sm text-ink-gray-6"
          >
            {{
              __(
                'The suggested text shows in grey. Write your own or use it.',
                null,
                CTX,
              )
            }}
          </p>
          <button
            v-if="canChange && draft[field.key] !== field.suggested"
            type="button"
            :class="['press', BTN.text]"
            :disabled="saving"
            :data-legal-sugerido="field.key"
            @click="draft[field.key] = field.suggested"
          >
            {{ __('Use suggested text', null, CTX) }}
          </button>
        </div>
      </div>
      <div>
        <label
          for="app-clientes-dias"
          class="mb-1 block text-sm text-ink-gray-7"
          >{{ __('Days to return a purchase', null, CTX) }}</label
        >
        <input
          id="app-clientes-dias"
          v-model="draft.return_window_days"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          class="num h-11 w-32 rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-4"
          :readonly="!canChange || saving"
          :aria-invalid="problem ? 'true' : undefined"
          :aria-describedby="problem ? 'app-clientes-dias-problema' : undefined"
          data-legal="return_window_days"
        />
        <p
          v-if="problem"
          id="app-clientes-dias-problema"
          role="alert"
          class="mt-1 text-sm text-ink-red-7"
        >
          {{ problem }}
        </p>
      </div>
      <div v-if="arco" data-legal="arco_response_days">
        <label
          for="app-clientes-arco"
          class="mb-1 block text-sm text-ink-gray-7"
          >{{
            __('Business days to answer a privacy request', null, CTX)
          }}</label
        >
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <input
            id="app-clientes-arco"
            v-model="draft.arco_response_days"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            class="num h-11 w-32 rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-4"
            :readonly="!canChange || saving"
            :aria-invalid="arcoIssue ? 'true' : undefined"
            :aria-describedby="
              arcoIssue ? 'app-clientes-arco-problema' : undefined
            "
          />
          <button
            v-if="
              canChange &&
              String(draft.arco_response_days).trim() !== String(arco.default)
            "
            type="button"
            :class="['press', BTN.text]"
            :disabled="saving"
            data-legal-arco-ley
            @click="draft.arco_response_days = String(arco.default)"
          >
            {{ __('Use the legal days ({0})', [arco.default], CTX) }}
          </button>
        </div>
        <p
          v-if="arcoIssue"
          id="app-clientes-arco-problema"
          role="alert"
          class="mt-1 text-sm text-ink-red-7"
        >
          {{ arcoIssue }}
        </p>
      </div>
      <p
        v-if="failure"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-app-clientes-legales-problema
      >
        {{ failure }}
      </p>
    </form>
    <template v-if="texts && canChange" #actions>
      <div class="flex gap-2">
        <button
          type="button"
          :class="['press flex-none', BTN.tonal]"
          :disabled="saving"
          data-app-clientes-legales-cancelar
          @click="emit('update:open', false)"
        >
          {{ __('Cancel', null, CTX) }}
        </button>
        <button
          type="submit"
          form="app-clientes-legales"
          :class="['press flex-1', BTN.filled]"
          :disabled="saving || !dirty || !!problem || !!arcoIssue"
          data-app-clientes-legales-guardar
        >
          <span
            v-if="saving"
            class="lucide-loader-circle size-5 animate-spin"
            aria-hidden="true"
          />
          {{ __('Save texts', null, CTX) }}
        </button>
      </div>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/utils/errorText'
import { readLegal, saveLegal } from './api'
import {
  CTX,
  arcoProblem,
  arcoRule,
  legalDirty,
  legalDraft,
  legalFields,
  legalPayload,
  legalProblem,
} from './view'

const props = defineProps({
  open: { type: Boolean, default: false },
  storefront: { type: String, default: '' },
  canChange: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open'])

const texts = ref(null)
const draft = ref(legalDraft(null))
const failure = ref('')
const saving = ref(false)
const fields = computed(() => legalFields(texts.value))
const dirty = computed(
  () => !!texts.value && legalDirty(texts.value, draft.value),
)
const problem = computed(() =>
  texts.value && dirty.value ? legalProblem(draft.value) : '',
)
// The days to answer a privacy request: only where the cell offers the field.
const arco = computed(() => arcoRule(texts.value))
const arcoIssue = computed(() =>
  texts.value && dirty.value ? arcoProblem(draft.value, texts.value) : '',
)

let sequence = 0
async function load() {
  const mine = ++sequence
  texts.value = null
  failure.value = ''
  try {
    const answer = await readLegal(props.storefront)
    if (mine !== sequence) return
    take(answer)
  } catch (error) {
    if (mine === sequence)
      failure.value = errorText(
        error,
        __('The texts could not open. Try again.', null, CTX),
      )
  }
}
function take(answer) {
  texts.value = answer || {}
  draft.value = legalDraft(texts.value)
}
watch(
  () => props.open,
  (open) => open && load(),
  { immediate: true },
)

async function save() {
  if (saving.value || !dirty.value || problem.value || arcoIssue.value) return
  saving.value = true
  failure.value = ''
  try {
    const answer = await saveLegal(props.storefront, legalPayload(draft.value))
    take(answer)
    toast.success(__('Texts saved', null, CTX))
    emit('update:open', false)
  } catch (error) {
    failure.value = errorText(
      error,
      __('The texts were not saved. Try again.', null, CTX),
    )
  } finally {
    saving.value = false
  }
}
</script>
