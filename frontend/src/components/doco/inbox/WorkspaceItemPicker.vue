<template>
  <Dialog
    v-model="open"
    :options="{ title: __('Agregar artículos a la cotización'), size: '3xl' }"
  >
    <template #body-content>
      <form class="mb-3 flex gap-2" @submit.prevent="search">
        <input
          v-model="query"
          class="min-w-0 flex-1 rounded border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm"
          :aria-label="__('Nombre o código del artículo')"
          :placeholder="__('Buscar por nombre o código…')"
        />
        <Button type="submit" :loading="loading">{{ __('Buscar') }}</Button>
      </form>
      <label class="mb-3 flex items-center gap-2 text-sm text-ink-gray-6"
        ><input v-model="inStock" type="checkbox" @change="search" />{{
          __('Solo con existencias')
        }}</label
      >
      <p
        v-if="error || saveError"
        role="alert"
        class="mb-3 text-sm text-ink-red-6"
      >
        {{ error || saveError }}
      </p>
      <div
        class="max-h-[45vh] overflow-auto rounded border border-outline-gray-2"
      >
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 bg-surface-gray-1 text-ink-gray-6">
            <tr>
              <th class="p-2">{{ __('Artículo') }}</th>
              <th class="p-2 text-right">{{ __('Existencias') }}</th>
              <th class="p-2 text-right">{{ __('Precio') }}</th>
              <th class="p-2 text-right">{{ __('Cantidad') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-gray-1">
            <tr v-for="item in items" :key="item.item_code">
              <td class="p-2">
                <div class="flex items-center gap-2">
                  <img
                    v-if="item.image_url"
                    :src="item.image_url"
                    alt=""
                    class="h-9 w-9 rounded object-contain"
                  />
                  <div>
                    <div class="font-medium">{{ item.item_name }}</div>
                    <div class="text-xs text-ink-gray-5">
                      {{ item.item_code }}
                    </div>
                  </div>
                </div>
              </td>
              <td class="p-2 text-right tabular-nums">{{ item.stock }}</td>
              <td class="whitespace-nowrap p-2 text-right tabular-nums">
                {{
                  item.price == null
                    ? __('Sin precio')
                    : formatMoney(item.price, item.currency)
                }}
              </td>
              <td class="p-2 text-right">
                <input
                  v-model.number="quantities[item.item_code]"
                  type="number"
                  min="0"
                  max="999"
                  step="any"
                  :aria-label="__('Cantidad') + ' ' + item.item_name"
                  class="w-20 rounded border border-outline-gray-2 bg-surface-base p-1 text-right"
                />
              </td>
            </tr>
            <tr v-if="!items.length">
              <td colspan="4" class="p-6 text-center text-ink-gray-5">
                {{
                  loading
                    ? __('Buscando…')
                    : __('Sin coincidencias. Prueba otro nombre o código.')
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-xs text-ink-gray-5">
        {{
          __(
            'Hasta 30 artículos. La selección se conserva al buscar otros artículos. Se guardarán en la cotización en borrador más reciente del trato.',
          )
        }}
      </p>
      <p v-if="invalid" role="alert" class="mt-2 text-sm text-ink-red-6">
        {{ __('Selecciona hasta 30 artículos, con cantidades entre 0 y 999.') }}
      </p>
      <div class="mt-4 flex items-center justify-between gap-3">
        <span class="text-sm text-ink-gray-6"
          >{{ selected.length }} {{ __('artículos seleccionados') }}</span
        ><Button
          variant="solid"
          :loading="busy"
          :disabled="!selected.length || invalid"
          @click="$emit('add', selected)"
          >{{ __('Guardar en cotización') }}</Button
        >
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Button, Dialog, call } from 'frappe-ui'
import { formatMoney } from '@/composables/crmFormat'

const open = defineModel({ type: Boolean })
defineProps({ busy: Boolean, saveError: String })
defineEmits(['add'])
const query = ref('')
const inStock = ref(true)
const items = ref([])
const quantities = ref({})
const loading = ref(false)
const error = ref('')
let request = 0
const selected = computed(() =>
  Object.entries(quantities.value)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([item_code, qty]) => ({ item_code, qty: Number(qty) })),
)
const invalid = computed(
  () =>
    Object.values(quantities.value).some(
      (q) =>
        q !== '' &&
        q != null &&
        (!Number.isFinite(Number(q)) || q < 0 || q > 999),
    ) || selected.value.length > 30,
)
async function search() {
  const id = ++request
  loading.value = true
  error.value = ''
  try {
    const result = await call('doco_marketing.api.catalog.search', {
      query: query.value,
      in_stock_only: Number(inStock.value),
      limit: 30,
    })
    if (id === request) items.value = result || []
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
    search()
  } else request++
})
onBeforeUnmount(() => request++)
</script>
