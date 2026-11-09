<template>
  <!-- A code nobody has yet, inside the scan sheet. Who keeps the catalog
       gives it a name (pre-filled from the shop's code list or the shared
       catalog), a group, a unit and its prices; everyone else asks for it to
       be added. The sheet's foot holds the buttons (`form` = formId). -->
  <div class="flex flex-col gap-3" data-scan-alta>
    <div>
      <p class="font-mono text-base text-ink-gray-9" data-scan-alta-code>
        {{ prefill.barcode }}
      </p>
      <p class="text-sm text-ink-gray-6" data-scan-alta-source>
        {{ sourceLine }}
      </p>
    </div>

    <form
      v-if="prefill.can_create"
      :id="formId"
      class="flex flex-col gap-3"
      @submit.prevent="create"
    >
      <FormControl
        v-model="name"
        type="text"
        autocomplete="off"
        class="[&_input]:min-h-11 sm:[&_input]:min-h-8"
        :label="__('Name', null, CTX)"
        :placeholder="__('What it is called on the shelf', null, CTX)"
        :disabled="busy"
        data-scan-alta-name
      />
      <div class="grid grid-cols-2 gap-3">
        <FormControl
          v-model="group"
          type="select"
          class="min-w-0 [&_select]:min-h-11 sm:[&_select]:min-h-8"
          :label="__('Group', null, CTX)"
          :options="groupOptions"
          :disabled="busy"
          data-scan-alta-group
        />
        <FormControl
          v-model="uom"
          type="select"
          class="min-w-0 [&_select]:min-h-11 sm:[&_select]:min-h-8"
          :label="__('Unit', null, CTX)"
          :options="uomOptions"
          :disabled="busy"
          data-scan-alta-uom
        />
        <FormControl
          v-model="selling"
          type="text"
          inputmode="decimal"
          class="min-w-0 [&_input]:min-h-11 sm:[&_input]:min-h-8"
          :label="__('Sale price', null, CTX)"
          :disabled="busy"
          data-scan-alta-selling
        />
        <FormControl
          v-model="buying"
          type="text"
          inputmode="decimal"
          class="min-w-0 [&_input]:min-h-11 sm:[&_input]:min-h-8"
          :label="__('Cost', null, CTX)"
          :disabled="busy"
          data-scan-alta-buying
        />
      </div>
      <p v-if="hint" class="text-sm text-ink-gray-6">{{ hint }}</p>
    </form>

    <form
      v-else
      :id="formId"
      class="flex flex-col gap-3"
      @submit.prevent="request"
    >
      <p class="text-base text-ink-gray-8" data-scan-alta-request>
        {{
          known
            ? __(
                '{0} is not in your catalog yet. Whoever keeps the catalog will see your request.',
                [known],
                CTX,
              )
            : __(
                'This product is not in your catalog yet. Whoever keeps the catalog will see your request.',
                null,
                CTX,
              )
        }}
      </p>
      <FormControl
        v-model="note"
        type="text"
        autocomplete="off"
        class="[&_input]:min-h-11 sm:[&_input]:min-h-8"
        :label="__('Note (optional)', null, CTX)"
        :disabled="busy"
      />
    </form>

    <p
      v-if="problem"
      role="alert"
      class="text-sm text-ink-red-4"
      data-scan-alta-problem
    >
      {{ problem }}
    </p>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { FormControl } from 'frappe-ui'
import { errorText } from '@/documentos/api'
import {
  createFromScan,
  masterNames,
  priceValue,
  requestAlta,
  suggestedName,
} from './escaneo'

const CTX = 'Escaneo'
const props = defineProps({
  // resolve_scan's (or prefill_for_barcode's) prefill
  prefill: { type: Object, required: true },
  // The document the code is for (purchasing staff create on a purchase).
  doctype: { type: String, default: '' },
  formId: { type: String, default: 'scan-alta' },
  hint: { type: String, default: '' },
})
const emit = defineEmits(['created', 'requested'])

const SOURCES = {
  item: () => __('Already in your catalog', null, CTX),
  reference: () => __("From your shop's code list", null, CTX),
  central: () => __('From the shared product catalog', null, CTX),
  none: () => __('No data for this code: type the name', null, CTX),
}
const sourceLine = computed(() => {
  const line = (SOURCES[props.prefill.found_in] || SOURCES.none)()
  return props.prefill.brand ? `${line}, ${props.prefill.brand}` : line
})
const known = computed(() => suggestedName(props.prefill))

const name = ref(known.value)
const group = ref(props.prefill.item_group || '')
const uom = ref(props.prefill.stock_uom || '')
const selling = ref('')
const buying = ref('')
const note = ref('')
const busy = ref(false)
const problem = ref('')
const groups = ref([])
const uoms = ref([])

const withCurrent = (names, current) =>
  [...new Set([current, ...names].filter(Boolean))].map((value) => ({
    label: value,
    value,
  }))
const groupOptions = computed(() => withCurrent(groups.value, group.value))
const uomOptions = computed(() => withCurrent(uoms.value, uom.value))
const ready = computed(() =>
  props.prefill.can_create ? Boolean(name.value.trim()) : true,
)

onMounted(async () => {
  if (!props.prefill.can_create) return
  try {
    const [g, u] = await Promise.all([
      masterNames('Item Group', { is_group: 0 }),
      masterNames('UOM', { enabled: 1 }),
    ])
    groups.value = g
    uoms.value = u
  } catch {
    // The defaults doco proposed stay the only choice.
  }
})

async function create() {
  if (busy.value || !ready.value) return
  busy.value = true
  problem.value = ''
  try {
    const result = await createFromScan({
      barcode: props.prefill.barcode,
      item_name: name.value.trim(),
      item_group: group.value || null,
      stock_uom: uom.value || null,
      brand: props.prefill.brand || null,
      selling_price: priceValue(selling.value),
      buying_price: priceValue(buying.value),
      ...(props.doctype ? { ctx: { doctype: props.doctype } } : {}),
    })
    emit('created', result)
  } catch (error) {
    problem.value = errorText(error)
  } finally {
    busy.value = false
  }
}

async function request() {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try {
    await requestAlta(props.prefill.barcode, note.value.trim())
    emit('requested')
  } catch (error) {
    problem.value = errorText(error)
  } finally {
    busy.value = false
  }
}

defineExpose({ busy, ready, create, request })
</script>
