<template>
  <!-- Correct a misread line, or type one the reader missed. The first
       correction keeps the original read beside the line. -->
  <BottomSheet
    :open="open"
    :title="
      line
        ? __('Correct the read', null, 'Lista')
        : __('Add a line', null, 'Lista')
    "
    :subtitle="line ? [line.brand, line.model].filter(Boolean).join(' ') : ''"
    :dismissible="!dirty"
    layer="lista-forma"
    @update:open="emit('update:open', $event)"
  >
    <form id="lista-forma" class="space-y-3 pb-2" @submit.prevent="save">
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span :class="LABEL">{{ __('Brand', null, 'Lista') }}</span>
          <input
            v-model="form.brand"
            :class="INPUT"
            list="lista-brands"
            autocomplete="off"
          />
        </label>
        <label class="block">
          <span :class="LABEL">{{ __('Model', null, 'Lista') }}</span>
          <input v-model="form.model" :class="INPUT" autocomplete="off" />
        </label>
        <label class="block">
          <span :class="LABEL">{{ __('Storage (GB)', null, 'Lista') }}</span>
          <input
            v-model="form.storage"
            :class="INPUT"
            inputmode="numeric"
            placeholder="128GB"
          />
        </label>
        <label class="block">
          <span :class="LABEL">{{ __('RAM', null, 'Lista') }}</span>
          <input
            v-model="form.ram"
            :class="INPUT"
            inputmode="numeric"
            placeholder="4GB"
          />
        </label>
        <label class="block">
          <span :class="LABEL">{{ __('Version', null, 'Lista') }}</span>
          <input
            v-model="form.version"
            :class="INPUT"
            list="lista-versions"
            placeholder="Nacional"
          />
        </label>
        <label class="block">
          <span :class="LABEL">{{ __('Section', null, 'Lista') }}</span>
          <input v-model="form.section" :class="INPUT" list="lista-sections" />
        </label>
      </div>
      <label class="flex min-h-11 items-center gap-2 text-sm">
        <input
          v-model="form.nom"
          type="checkbox"
          class="size-5 rounded border-outline-gray-3"
        />
        {{ __('Has the NOM mark', null, 'Lista') }}
      </label>
      <label class="block">
        <span :class="LABEL">{{
          __('Description (when it is not a phone)', null, 'Lista')
        }}</span>
        <input v-model="form.name1" :class="INPUT" />
      </label>
      <label class="block">
        <span :class="LABEL">{{ __('Supplier code', null, 'Lista') }}</span>
        <input v-model="form.code" :class="INPUT" autocomplete="off" />
      </label>

      <fieldset>
        <legend :class="LABEL">
          {{ __('Prices by quantity', null, 'Lista') }}
        </legend>
        <div
          class="grid grid-cols-[4.5rem_1fr_1fr] gap-x-2 gap-y-1 text-xs text-ink-gray-6"
        >
          <span>{{ __('From', null, 'Lista') }}</span>
          <span>{{ __('Price', null, 'Lista') }}</span>
          <span>{{ __('Printed as', null, 'Lista') }}</span>
        </div>
        <div
          v-for="(tier, index) in form.tiers"
          :key="index"
          class="mt-1 grid grid-cols-[4.5rem_1fr_1fr] gap-2"
        >
          <input
            v-model="tier.min_qty"
            :class="INPUT"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            :placeholder="index ? '' : '1'"
            :aria-label="__('From', null, 'Lista')"
          />
          <input
            v-model="tier.price"
            :class="INPUT"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            :aria-label="__('Price', null, 'Lista')"
          />
          <input
            v-model="tier.label"
            :class="INPUT"
            :placeholder="index ? __('Wholesale', null, 'Lista') : ''"
            :aria-label="__('Printed as', null, 'Lista')"
          />
        </div>
        <p class="mt-1 text-xs text-ink-gray-5">
          {{
            __(
              'The first row is the price of one piece; the others, the price from that many pieces.',
              null,
              'Lista',
            )
          }}
        </p>
      </fieldset>

      <label class="block">
        <span :class="LABEL">{{
          __('Marks (Pay Joy, single piece…)', null, 'Lista')
        }}</span>
        <input
          v-model="tagsText"
          :class="INPUT"
          :placeholder="__('Separate them with commas', null, 'Lista')"
        />
      </label>
      <label class="block">
        <span :class="LABEL">{{ __('Note', null, 'Lista') }}</span>
        <textarea v-model="form.note" :class="INPUT" rows="2" />
      </label>
      <p v-if="problem" class="text-sm text-ink-red-7" role="alert">
        {{ problem }}
      </p>
      <datalist id="lista-brands">
        <option v-for="b in brands" :key="b" :value="b" />
      </datalist>
      <datalist id="lista-versions">
        <option v-for="v in VERSIONS" :key="v" :value="v" />
      </datalist>
      <datalist id="lista-sections">
        <option v-for="s in sections" :key="s" :value="s" />
      </datalist>
    </form>

    <template #actions>
      <button
        type="submit"
        form="lista-forma"
        :class="['press', BTN.filled]"
        :disabled="busy || !canSave"
      >
        <span
          :class="[
            busy ? 'lucide-loader-circle animate-spin' : 'lucide-check',
            'size-5',
          ]"
          aria-hidden="true"
        />
        {{
          line
            ? __('Save the correction', null, 'Lista')
            : __('Add the line', null, 'Lista')
        }}
      </button>
      <p v-if="!canSave" class="text-center text-xs text-ink-gray-6">
        {{
          line
            ? __('Nothing changed yet.', null, 'Lista')
            : __(
                'Write at least the model or the description, and a price.',
                null,
                'Lista',
              )
        }}
      </p>
    </template>
  </BottomSheet>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { BottomSheet } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { changedFields, formOf, manualFields } from '@/utils/listaPrecios'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The line to correct; null adds one. */
  line: { type: Object, default: null },
  sections: { type: Array, default: () => [] },
  brands: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  problem: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'save'])

const LABEL = 'mb-1 block text-xs font-medium text-ink-gray-6'
const INPUT =
  'block w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm text-ink-gray-9 placeholder:text-ink-gray-4 focus:border-outline-gray-4 focus:ring-0'
const VERSIONS = [
  'Nacional',
  'Latin',
  'Telcel',
  'Libre',
  'Global',
  'Euro',
  'Internacional',
]

const form = reactive(formOf(null))
const tagsText = ref('')

function reset() {
  Object.assign(form, formOf(props.line))
  tagsText.value = (props.line?.tags || []).join(', ')
}
watch(
  () => [props.open, props.line?.name],
  ([open]) => {
    if (open) reset()
  },
  { immediate: true },
)

const payload = computed(() => {
  const draft = {
    ...form,
    tags: tagsText.value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  }
  return props.line ? changedFields(props.line, draft) : manualFields(draft)
})
const dirty = computed(() => Object.keys(payload.value).length > 0)
const canSave = computed(() => {
  const p = payload.value
  if (props.line) return dirty.value
  return (
    Boolean(p.model || p.name1 || p.code) &&
    (p.tiers?.length || p.price !== undefined)
  )
})

function save() {
  if (canSave.value) emit('save', payload.value)
}
</script>
