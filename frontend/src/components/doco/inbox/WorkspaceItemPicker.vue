<template>
  <!-- A bounded phone task (design/MOBILE_REFERENCES: BottomSheet, not a centred
       Dialog). The search stays under the title, the list scrolls, and the save
       bar sits at the bottom in thumb reach. With an unsaved pick the sheet
       closes only through «Cancelar», so a stray swipe cannot drop the picks. -->
  <BottomSheet
    v-model:open="open"
    :title="__('Agregar artículos a la cotización')"
    :dismissible="!selected.length"
  >
    <template #header>
      <form class="flex gap-2" @submit.prevent="search">
        <input
          v-model="query"
          type="search"
          enterkeyhint="search"
          class="min-h-11 min-w-0 flex-1 rounded-4 border border-outline-gray-2 bg-surface-base px-3 py-2 text-lg sm:min-h-0 sm:text-sm"
          :aria-label="__('Nombre o código del artículo')"
          :placeholder="__('Buscar por nombre o código…')"
        />
        <Button class="min-h-11 sm:min-h-0" type="submit" :loading="loading">{{
          __('Buscar')
        }}</Button>
      </form>
      <label
        class="mt-2 flex min-h-11 items-center gap-2 text-sm text-ink-gray-6 sm:min-h-0"
        ><input v-model="inStock" type="checkbox" @change="search" />{{
          __('Solo con existencias')
        }}</label
      >
    </template>
    <p v-if="error" role="alert" class="mb-3 text-sm text-ink-red-7">
      {{ error }}
    </p>
    <!-- Picks from earlier searches stay listed here. -->
    <section
      v-if="selected.length"
      class="mb-3 rounded-4 border border-outline-gray-2"
    >
      <h4 class="px-3 pt-2 text-xs font-medium text-ink-gray-6">
        {{ __('Seleccionados') }} ({{ selected.length }})
      </h4>
      <ul class="max-h-32 divide-y divide-outline-gray-1 overflow-y-auto">
        <li
          v-for="line in selected"
          :key="line.item_code"
          class="flex items-center gap-2 pl-3 pr-1"
        >
          <div class="min-w-0 flex-1 py-1">
            <p class="truncate text-sm text-ink-gray-8">
              {{ names[line.item_code] || line.item_code }}
            </p>
            <p class="truncate text-xs text-ink-gray-5">
              {{ line.item_code }}
            </p>
          </div>
          <span
            class="shrink-0 text-sm tabular-nums"
            :class="isValidQty(line.qty) ? 'text-ink-gray-7' : 'text-ink-red-7'"
            >× {{ line.qty }}</span
          >
          <button
            type="button"
            class="min-h-11 shrink-0 rounded-4 px-2 text-sm text-ink-gray-7 hover:bg-surface-gray-2"
            :aria-label="
              __('Quitar') + ' ' + (names[line.item_code] || line.item_code)
            "
            @click="quantities[line.item_code] = 0"
          >
            {{ __('Quitar') }}
          </button>
        </li>
      </ul>
    </section>
    <ul
      v-if="items.length"
      class="divide-y divide-outline-gray-1 rounded-4 border border-outline-gray-2"
    >
      <!-- Thumbnail and text never part; the stepper sits on their right
           when the row has room and wraps under it on a phone. -->
      <li
        v-for="item in items"
        :key="item.item_code"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 p-3"
      >
        <div class="flex min-w-0 flex-1 basis-64 items-center gap-3">
          <img
            v-if="item.image_url"
            :src="item.image_url"
            alt=""
            class="h-9 w-9 shrink-0 rounded-4 object-contain"
          />
          <div class="min-w-0 flex-1">
            <p
              class="line-clamp-2 break-words text-sm font-medium text-ink-gray-8"
              :title="item.item_name"
            >
              {{ item.item_name }}
            </p>
            <div class="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-gray-5">
              <span class="min-w-0 break-words">{{ item.item_code }}</span>
              <span
                v-if="isOutOfStock(item.stock)"
                class="font-medium text-ink-amber-9"
                >{{ __('Sin existencias') }} ({{ item.stock }})</span
              >
              <span v-else>{{ __('Existencias') }}: {{ item.stock }}</span>
              <span class="tabular-nums">{{
                item.price == null
                  ? __('Sin precio')
                  : formatMoney(item.price, item.currency)
              }}</span>
            </div>
          </div>
        </div>
        <div
          role="group"
          :aria-label="__('Cantidad') + ' ' + item.item_name"
          class="ml-auto flex shrink-0 items-center"
        >
          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-l-4 border border-outline-gray-2 text-lg text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-40"
            :aria-label="__('Disminuir cantidad')"
            :disabled="!isSelected(item.item_code)"
            @click="step(item.item_code, -1)"
          >
            −
          </button>
          <input
            v-model.number="quantities[item.item_code]"
            type="number"
            inputmode="decimal"
            min="0"
            :max="MAX_QTY"
            step="any"
            placeholder="0"
            :disabled="!canSelect(item.item_code)"
            :aria-invalid="!isValidQty(quantities[item.item_code])"
            :aria-label="__('Cantidad') + ' ' + item.item_name"
            class="quantity-input h-11 w-14 border-x-0 border-y bg-surface-base px-1 text-center text-lg tabular-nums disabled:opacity-40 sm:text-sm"
            :class="
              isValidQty(quantities[item.item_code])
                ? 'border-outline-gray-2'
                : 'border-outline-red-4'
            "
          />
          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-r-4 border border-outline-gray-2 text-lg text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-40"
            :aria-label="__('Aumentar cantidad')"
            :disabled="
              !canSelect(item.item_code) ||
              Number(quantities[item.item_code]) >= MAX_QTY
            "
            @click="step(item.item_code, 1)"
          >
            +
          </button>
        </div>
      </li>
    </ul>
    <!-- A failed search shows only its alert above. -->
    <p
      v-else-if="loading || !error"
      class="rounded-4 border border-outline-gray-2 p-6 text-center text-sm text-ink-gray-5"
    >
      {{
        loading
          ? __('Buscando…')
          : __('Sin coincidencias. Prueba otro nombre o código.')
      }}
    </p>
    <p class="mt-2 text-xs text-ink-gray-5">
      {{
        __(
          'La selección se conserva al buscar otros artículos. Se guardará en la cotización en borrador más reciente del trato.',
        )
      }}
    </p>
    <template #actions>
      <p v-if="saveError" role="alert" class="text-sm text-ink-red-7">
        {{ saveError }}
      </p>
      <p v-if="invalid" role="alert" class="text-sm text-ink-red-7">
        {{ invalidText }}
      </p>
      <p role="status" class="text-sm text-ink-gray-6">
        {{ selected.length }} {{ __('artículos seleccionados') }} ·
        {{ lineStatus }}
      </p>
      <Button class="min-h-11 sm:min-h-0" @click="open = false">{{
        __('Cancelar')
      }}</Button>
      <Button
        class="min-h-11 sm:min-h-0"
        variant="solid"
        :loading="busy"
        :disabled="!selected.length || invalid"
        @click="$emit('add', selected)"
        >{{ __('Guardar en cotización') }}</Button
      >
    </template>
  </BottomSheet>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Button, call } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { formatMoney } from '@/composables/crmFormat'
import {
  MAX_ITEMS,
  MAX_QTY,
  canAddMore,
  isOutOfStock,
  isSelectionInvalid,
  isValidQty,
  keepSelected,
  quoteLineCount,
  selectedLines,
  stepQty,
} from '@/utils/itemPicker'

const open = defineModel({ type: Boolean })
// quoteCodes: the item codes of the draft quotation's lines. They count
// against MAX_ITEMS, and a pick of one of them only raises that line's qty.
const props = defineProps({
  busy: Boolean,
  saveError: { type: String, default: '' },
  quoteCodes: { type: Array, default: () => [] },
})
defineEmits(['add'])
const query = ref('')
const inStock = ref(true)
const items = ref([])
const quantities = ref({})
// item_code -> item_name from every search, for the selected strip.
const names = ref({})
const loading = ref(false)
const error = ref('')
let request = 0
const selected = computed(() => selectedLines(quantities.value))
const invalid = computed(() =>
  isSelectionInvalid(quantities.value, props.quoteCodes),
)
const atCap = computed(() => !canAddMore(quantities.value, props.quoteCodes))
const lineStatus = computed(() =>
  __('{0} de {1} líneas en la cotización', [
    quoteLineCount(quantities.value, props.quoteCodes),
    MAX_ITEMS,
  ]),
)
const invalidText = computed(() =>
  Object.values(quantities.value).some((qty) => !isValidQty(qty))
    ? __('Revisa las cantidades: entre 0 y 999.')
    : __('La cotización admite hasta {0} líneas.', [MAX_ITEMS]),
)
const isSelected = (code) => Number(quantities.value[code]) > 0
// At the cap only rows already selected, or already on the draft, can change.
const canSelect = (code) =>
  isSelected(code) || props.quoteCodes.includes(code) || !atCap.value
function step(code, delta) {
  quantities.value[code] = stepQty(quantities.value[code], delta)
}
async function search() {
  const id = ++request
  loading.value = true
  error.value = ''
  quantities.value = keepSelected(quantities.value)
  try {
    const result = await call('doco_marketing.api.catalog.search', {
      query: query.value,
      in_stock_only: Number(inStock.value),
      limit: 30,
    })
    if (id === request) {
      items.value = result || []
      for (const item of items.value)
        names.value[item.item_code] = item.item_name
    }
  } catch (e) {
    if (id === request) {
      items.value = []
      error.value =
        e.messages?.join('\n') || e.message || __('No se pudo buscar.')
    }
  } finally {
    if (id === request) loading.value = false
  }
}
watch(open, (value) => {
  if (value) {
    quantities.value = {}
    names.value = {}
    search()
  } else request++
})
onBeforeUnmount(() => request++)
</script>

<style scoped>
/* Native spinners would repeat the stepper buttons. Scoped, not utilities: this
   picker loads lazily, so its CSS stays out of the entry stylesheet that the
   bundle budget measures (scripts/verify-bundle-budget.mjs). */
.quantity-input {
  appearance: textfield;
}
.quantity-input::-webkit-inner-spin-button,
.quantity-input::-webkit-outer-spin-button {
  appearance: none;
}
</style>
