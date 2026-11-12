<template>
  <!-- One product with its price, for a shop whose prices are not kept by
       Mercado (Productos' own «Nuevo producto» needs it to set a price). The
       wizard's quick product writes the item and its first price. Before the
       first one, Abordo's catalog questions that cannot change once there are
       sales: each starts on the answer recommended for the business. -->
  <BottomSheet
    :open="open"
    :title="__('Add a product', null, 'Primeros pasos')"
    :subtitle="
      asking
        ? __(
            'First, how you keep your products. Once you sell, it does not change.',
            null,
            'Primeros pasos',
          )
        : __(
            'Its name and price are enough to sell it. Photos and stock come later.',
            null,
            'Primeros pasos',
          )
    "
    :dismissible="!dirty && !saving"
    @update:open="(value) => !value && cancel()"
  >
    <p
      v-if="checking"
      role="status"
      class="flex items-center gap-2 py-6 text-sm text-ink-gray-6"
    >
      <span
        class="lucide-loader-circle size-4 animate-spin"
        aria-hidden="true"
      />
      {{ __('Loading…', null, 'Primeros pasos') }}
    </p>
    <form
      v-else-if="asking"
      id="primeros-decisiones"
      class="space-y-5 pb-2"
      novalidate
      data-testid="primeros-decisiones"
      @submit.prevent="saveDecisions"
    >
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'The answer recommended for your business is already chosen.',
            null,
            'Primeros pasos',
          )
        }}
      </p>
      <div
        v-for="(decision, index) in decisions"
        :key="decision.decision_key"
        role="group"
        :aria-labelledby="`primeros-decision-${index}`"
        class="space-y-2"
        data-decision
      >
        <p
          :id="`primeros-decision-${index}`"
          class="text-base font-medium text-ink-gray-9"
        >
          {{ decision.question }}
        </p>
        <!-- A second tap on the chosen answer keeps it: each question has one. -->
        <ChipGroup
          v-model="picked[decision.decision_key]"
          :options="choices(decision)"
          :clear-value="picked[decision.decision_key]"
        />
        <p class="text-sm text-ink-gray-6">{{ decision.why }}</p>
      </div>
      <p
        v-if="problem"
        role="alert"
        class="text-sm text-ink-red-7"
        data-testid="producto-problema"
      >
        {{ problem }}
      </p>
    </form>
    <form
      v-else
      id="primeros-producto"
      class="space-y-4 pb-2"
      novalidate
      data-testid="primeros-producto"
      @submit.prevent="save"
    >
      <label class="block" data-field="nombre">
        <span class="text-sm text-ink-gray-7">{{
          __('Name', null, 'Primeros pasos')
        }}</span>
        <input
          v-model="form.nombre"
          type="text"
          maxlength="140"
          autocomplete="off"
          class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
        />
        <span
          v-if="problems.nombre"
          class="mt-1 block text-sm text-ink-red-7"
          >{{ problems.nombre }}</span
        >
      </label>
      <label class="block" data-field="precio">
        <span class="text-sm text-ink-gray-7">{{
          __('Selling price', null, 'Primeros pasos')
        }}</span>
        <input
          v-model="form.precio"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          class="num mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
        />
        <span
          v-if="problems.precio"
          class="mt-1 block text-sm text-ink-red-7"
          >{{ problems.precio }}</span
        >
      </label>
      <label class="block" data-field="codigo">
        <span class="text-sm text-ink-gray-7">{{
          __('Barcode (optional)', null, 'Primeros pasos')
        }}</span>
        <input
          v-model="form.codigo"
          type="text"
          inputmode="numeric"
          maxlength="40"
          autocomplete="off"
          class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
        />
        <span class="mt-1 block text-sm text-ink-gray-6">{{
          __('If it is printed on the package.', null, 'Primeros pasos')
        }}</span>
      </label>
      <p
        v-if="problem"
        role="alert"
        class="text-sm text-ink-red-7"
        data-testid="producto-problema"
      >
        {{ problem }}
      </p>
    </form>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Cancel', null, 'Primeros pasos')"
        @click="cancel"
      />
      <Button
        v-if="asking"
        variant="solid"
        type="submit"
        form="primeros-decisiones"
        class="min-h-11 w-full"
        :label="__('Save answers', null, 'Primeros pasos')"
        :loading="saving"
        data-testid="decisiones-guardar"
      />
      <Button
        v-else
        variant="solid"
        type="submit"
        form="primeros-producto"
        class="min-h-11 w-full"
        :label="__('Save product', null, 'Primeros pasos')"
        :loading="saving"
        :disabled="checking"
        data-testid="producto-guardar"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet, ChipGroup } from '@/components/ui'
import { parseRate } from '@/composables/useProductos'
import { errorText } from '@/utils/errorText'
import {
  answerDecisions,
  crearProducto,
  decisionAnswers,
  decisionDraft,
  loadCatalogPending,
} from './primerosPasos'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'saved'])

const CTX = 'Primeros pasos'
const form = reactive({ nombre: '', precio: '', codigo: '' })
const problems = ref({})
const problem = ref('')
const saving = ref(false)
// The catalog questions still open ([] when none), and the option picked for each.
const decisions = ref([])
const picked = ref({})
const checking = ref(false)
let ticket = 0

const asking = computed(() => !checking.value && decisions.value.length > 0)
const dirty = computed(() =>
  Boolean(form.nombre.trim() || form.precio.trim() || form.codigo.trim()),
)

// Options by position: an answer can be true, false or a word.
function choices(decision) {
  return (decision.options || []).map((option, index) => ({
    value: String(index),
    label: option.label,
  }))
}

async function checkDecisions() {
  const mine = ++ticket
  checking.value = true
  try {
    const pending = await loadCatalogPending()
    if (mine !== ticket) return
    decisions.value = Array.isArray(pending) ? pending : []
    picked.value = decisionDraft(decisions.value)
  } catch {
    // No answer: the product form, where Abordo's own refusal names what is missing.
    if (mine === ticket) decisions.value = []
  } finally {
    if (mine === ticket) checking.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, { nombre: '', precio: '', codigo: '' })
    problems.value = {}
    problem.value = ''
    decisions.value = []
    checkDecisions()
  },
  { immediate: true },
)

function check() {
  const found = {}
  if (!form.nombre.trim())
    found.nombre = __('Write the product name.', null, CTX)
  const rate = parseRate(form.precio)
  if (rate === null || rate <= 0)
    found.precio = __('Write its selling price.', null, CTX)
  return found
}

function cancel() {
  if (saving.value) return
  emit('close')
}

async function saveDecisions() {
  if (saving.value) return
  const answers = decisionAnswers(decisions.value, picked.value)
  if (!answers) {
    problem.value = __('Choose an answer for each question.', null, CTX)
    return
  }
  saving.value = true
  problem.value = ''
  try {
    await answerDecisions(answers)
    decisions.value = [] // on to the product
  } catch (error) {
    problem.value = errorText(
      error,
      __('Your answers were not saved. Try again.', null, CTX),
    )
  } finally {
    saving.value = false
  }
}

async function save() {
  if (saving.value || checking.value) return
  problems.value = check()
  if (Object.keys(problems.value).length) return
  saving.value = true
  problem.value = ''
  try {
    const created = await crearProducto({
      nombre: form.nombre,
      precio: parseRate(form.precio),
      codigoBarras: form.codigo,
    })
    emit('saved', created)
  } catch (error) {
    problem.value = errorText(
      error,
      __('The product was not saved. Try again.', null, CTX),
    )
  } finally {
    saving.value = false
  }
}
</script>
