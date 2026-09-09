<template>
  <div class="space-y-3">
    <p class="text-sm text-ink-gray-6">
      {{
        __(
          'Selecciona fotos para una publicación de catálogo. Las selecciones grandes se dividen en borradores de hasta 10 fotos, sin programar.',
        )
      }}
    </p>
    <label class="block text-sm text-ink-gray-8">
      {{ __('Producto o modelo') }}
      <input
        v-model="query"
        class="mt-1 w-full rounded-lg border border-outline-gray-2 px-3 py-2"
        :placeholder="__('Ej: fundas iPhone 14, batas, conjuntos')"
      />
    </label>
    <label class="flex items-center gap-2 text-sm"
      ><input v-model="exactModel" type="checkbox" />{{
        __('Solo el modelo exacto (separar Pro, Plus y Max)')
      }}</label
    >
    <select
      v-model="collection"
      class="w-full rounded-lg border border-outline-gray-2 px-3 py-2 text-sm"
    >
      <option value="">{{ __('Todas las colecciones') }}</option>
      <option
        v-for="c in options?.collections || []"
        :key="c.name"
        :value="c.name"
      >
        {{ c.title || c.name }}
      </option>
    </select>
    <div class="flex flex-wrap gap-4 text-sm">
      <label class="flex items-center gap-2"
        ><input v-model="showPrice" type="checkbox" />{{
          __('Mostrar precios')
        }}</label
      >
      <label class="flex items-center gap-2"
        ><input v-model="showDescription" type="checkbox" />{{
          __('Mostrar descripción por foto')
        }}</label
      >
    </div>
    <select
      v-if="showPrice"
      v-model="priceList"
      class="w-full rounded-lg border border-outline-gray-2 px-3 py-2 text-sm"
    >
      <option value="">{{ __('Selecciona una lista de venta') }}</option>
      <option
        v-for="p in options?.price_lists || []"
        :key="p.name"
        :value="p.name"
      >
        {{ p.name }} · {{ p.currency }}
      </option>
    </select>
    <p class="text-xs text-ink-gray-5">
      {{
        __(
          'La introducción será editorial. Los precios y las descripciones opcionales se añaden desde el catálogo, numerados según las fotos.',
        )
      }}
    </p>
    <button
      class="rounded-lg border border-outline-gray-3 px-3 py-2 text-sm disabled:opacity-50"
      :disabled="
        busy || (!query.trim() && !collection) || (showPrice && !priceList)
      "
      @click="loadProducts"
    >
      {{ busy ? __('Cargando…') : __('Buscar productos') }}
    </button>
    <p v-if="!showPrice" class="text-xs text-ink-gray-5">
      {{
        __(
          'Ocultar precios solo afecta al texto añadido; revisa si la foto ya tiene un precio impreso.',
        )
      }}
    </p>
    <template v-if="result">
      <div class="flex flex-wrap items-center gap-3 text-xs text-ink-gray-7">
        <span
          >{{ result.total }} {{ __('coincidencias') }} · {{ selected.length }}
          {{ __('seleccionados') }}</span
        >
        <button class="underline" @click="selectAll">
          {{ __('Seleccionar fotos distintas') }}
        </button>
        <button class="underline" @click="selected = []">
          {{ __('Quitar selección') }}
        </button>
      </div>
      <p v-if="result.total > result.limit" class="text-xs text-ink-orange-6">
        {{ __('Se muestran los primeros') }} {{ result.limit }}.
        {{ __('Precisa el modelo para ver el resto.') }}
      </p>
      <div
        class="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3"
      >
        <label
          v-for="item in result.items"
          :key="item.name"
          class="relative cursor-pointer rounded-lg border p-2"
          :class="
            selected.includes(item.name)
              ? 'border-blue-500'
              : 'border-outline-gray-2'
          "
        >
          <input
            v-model="selected"
            type="checkbox"
            :value="item.name"
            :disabled="!eligible(item) || creating"
            class="absolute left-3 top-3"
          />
          <img
            v-if="item.image"
            :src="item.image"
            :alt="item.item_name"
            loading="lazy"
            class="h-24 w-full object-contain"
          />
          <div
            v-else
            class="flex h-24 items-center justify-center text-xs text-ink-orange-6"
          >
            {{ __('Sin foto válida') }}
          </div>
          <div class="mt-1 text-xs text-ink-gray-8">{{ item.item_name }}</div>
          <div v-if="showPrice" class="mt-1 text-xs text-ink-gray-6">
            {{
              item.price ? formatPrice(item.price) : __('Sin precio vigente')
            }}
          </div>
        </label>
      </div>
      <p v-if="!result.items.length" class="text-sm text-ink-gray-6">
        {{
          __('No hay coincidencias con stock. Prueba otro modelo o colección.')
        }}
      </p>
      <button
        class="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        style="background: var(--brand)"
        :disabled="creating || !selected.length"
        @click="generate"
      >
        {{ creating ? __('Generando…') : __('Crear borradores para revisar')
        }}<span v-if="selected.length">
          · {{ Math.ceil(selected.length / 10) }}</span
        >
      </button>
    </template>
    <p v-if="error" role="alert" class="text-sm text-ink-red-6">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { call } from 'frappe-ui'

const props = defineProps({ shop: String, options: Object })
const emit = defineEmits(['created'])
const query = ref('')
const collection = ref('')
const exactModel = ref(true)
const showPrice = ref(false)
const showDescription = ref(false)
const priceList = ref('')
const result = ref(null)
const selected = ref([])
const busy = ref(false)
const creating = ref(false)
const error = ref('')
let request = 0
const scope = () => ({
  shop: props.shop || undefined,
  query: query.value.trim(),
  exact_model: exactModel.value,
  collection: collection.value || undefined,
  price_list: showPrice.value ? priceList.value : undefined,
})
watch(
  [query, collection, exactModel, showPrice, priceList, () => props.shop],
  () => {
    request++
    result.value = null
    selected.value = []
    error.value = ''
  },
)
const eligible = (item) => !!item.image && (!showPrice.value || !!item.price)
const formatPrice = (price) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: price.currency,
  }).format(price.amount)
function selectAll() {
  const images = new Set()
  selected.value = (result.value?.items || [])
    .filter((item) => {
      if (!eligible(item) || images.has(item.image)) return false
      images.add(item.image)
      return true
    })
    .map((item) => item.name)
}
async function loadProducts() {
  const token = ++request
  busy.value = true
  error.value = ''
  try {
    const data = await call('doco_marketing.api.social.preview_catalog', {
      payload: JSON.stringify(scope()),
    })
    if (token !== request) return
    result.value = data
    selectAll()
  } catch (e) {
    if (token === request) error.value = e?.messages?.[0] || e.message
  } finally {
    busy.value = false
  }
}
async function generate() {
  creating.value = true
  error.value = ''
  try {
    const data = await call('doco_marketing.api.social.compose_catalog', {
      payload: JSON.stringify({
        ...scope(),
        item_ids: selected.value,
        show_price: showPrice.value,
        show_description: showDescription.value,
      }),
    })
    emit('created', data)
  } catch (e) {
    error.value = e?.messages?.[0] || e.message
  } finally {
    creating.value = false
  }
}
</script>
