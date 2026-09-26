<template>
  <form
    class="space-y-3 rounded border border-outline-gray-2 p-3"
    aria-label="Compartir catálogo de WhatsApp"
    @submit.prevent="send"
  >
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <label class="block text-xs font-medium">
      {{ __('Formato del mensaje') }}
      <select
        v-model="kind"
        class="mt-1 min-h-11 w-full rounded border border-outline-gray-2 bg-surface-base px-2"
        :disabled="locked"
      >
        <option
          v-for="option in kinds"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
    </label>
    <template v-if="kind !== 'catalog_message'">
      <label class="block text-xs font-medium">
        {{ __('Buscar productos') }}
        <input
          v-model="query"
          type="search"
          class="mt-1 min-h-11 w-full rounded border border-outline-gray-2 bg-surface-base px-2"
          :disabled="locked"
          @input="scheduleSearch"
        />
      </label>
      <p v-if="searchError" role="alert" class="text-xs">
        {{ searchError }}
        <button
          type="button"
          class="min-h-11 px-2 underline"
          :disabled="loading || locked"
          @click="search()"
        >
          {{ __('Reintentar búsqueda') }}
        </button>
      </p>
      <p v-if="loading" role="status" class="text-xs">
        {{ __('Cargando productos…') }}
      </p>
      <p
        v-else-if="!items.length && !searchError"
        class="text-xs text-ink-gray-5"
      >
        {{ __('No hay productos publicados que coincidan con la búsqueda.') }}
      </p>
      <ul class="max-h-64 space-y-1 overflow-y-auto">
        <li v-for="item in items" :key="item.item_code">
          <label
            class="flex min-h-11 cursor-pointer items-start gap-2 rounded border border-outline-gray-2 p-2"
          >
            <input
              type="checkbox"
              class="mt-2"
              :checked="selected.has(item.item_code)"
              :disabled="
                locked ||
                (kind === 'product_list' &&
                  selected.size >= 30 &&
                  !selected.has(item.item_code))
              "
              @change="toggle(item)"
            />
            <img
              v-if="item.image_url && !failedImages.has(item.item_code)"
              :src="item.image_url"
              alt=""
              class="h-11 w-11 shrink-0 rounded object-contain"
              @error="failedImages.add(item.item_code)"
            />
            <span class="min-w-0 flex-1">
              <span class="block font-medium">{{
                item.item_name || item.item_code
              }}</span>
              <span class="block text-xs text-ink-gray-5"
                >{{ item.item_code }} ·
                {{ price(item.rate, item.currency) }}</span
              >
              <span class="block text-xs text-ink-gray-5">{{
                __('Existencia: {0}', [item.stock ?? __('Por verificar')])
              }}</span>
            </span>
          </label>
        </li>
      </ul>
      <button
        v-if="hasMore"
        type="button"
        class="min-h-11 px-3 underline"
        :disabled="loading || locked"
        @click="search(true)"
      >
        {{ __('Cargar más productos') }}
      </button>
      <div v-if="selected.size" class="text-xs">
        <p>{{ __('{0} productos seleccionados', [selected.size]) }}</p>
        <ul class="mt-1 flex flex-wrap gap-1">
          <li v-for="item in [...selected.values()]" :key="item.item_code">
            <button
              type="button"
              class="min-h-11 rounded border border-outline-gray-2 px-2"
              :disabled="locked"
              :aria-label="__('Quitar {0}', [item.item_name || item.item_code])"
              @click="selected.delete(item.item_code)"
            >
              {{ item.item_name || item.item_code }} ×
            </button>
          </li>
        </ul>
      </div>
    </template>
    <label v-if="kind === 'product_list'" class="block text-xs font-medium">
      {{ __('Título de la lista') }}
      <input
        v-model="header"
        class="mt-1 min-h-11 w-full rounded border border-outline-gray-2 bg-surface-base px-2"
        :disabled="locked"
      />
    </label>
    <label class="block text-xs font-medium">
      {{ __('Mensaje al cliente') }}
      <textarea
        v-model="body"
        rows="2"
        class="mt-1 w-full rounded border border-outline-gray-2 bg-surface-base p-2"
        :disabled="locked"
      />
    </label>
    <label class="block text-xs font-medium">
      {{ __('Pie de mensaje (opcional)') }}
      <input
        v-model="footer"
        class="mt-1 min-h-11 w-full rounded border border-outline-gray-2 bg-surface-base px-2"
        :disabled="locked"
      />
    </label>
    <p
      v-if="validation && !pending"
      class="text-xs text-ink-gray-5"
      role="status"
    >
      {{ validation }}
    </p>
    <p v-if="pending" class="text-xs">
      {{
        __(
          'El envío no está confirmado. Conservamos los productos y la misma solicitud; comprueba su resultado antes de continuar.',
        )
      }}
    </p>
    <button
      type="submit"
      class="min-h-11 rounded bg-surface-gray-7 px-4 py-2 text-ink-white focus-visible:ring-2 disabled:opacity-50"
      :disabled="busy || blocked || (!pending && !canSend)"
    >
      {{
        busy
          ? __('Comprobando…')
          : pending
            ? __('Comprobar solicitud')
            : __('Enviar al cliente')
      }}
    </button>
  </form>
</template>
<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { call } from 'frappe-ui'
const props = defineProps({
  conversation: { type: Object, required: true },
  context: { type: Object, required: true },
  eligible: Boolean,
  blocked: Boolean,
})
const emit = defineEmits(['pending', 'queued', 'refresh'])
const kinds = computed(() =>
  [
    { value: 'catalog_message', label: __('Catálogo completo') },
    { value: 'product', label: __('Un producto') },
    { value: 'product_list', label: __('Lista de productos') },
  ].filter((option) => props.context.capabilities?.[option.value] === true),
)
const kind = ref(kinds.value[0]?.value || '')
const query = ref(''),
  items = ref([]),
  hasMore = ref(false),
  loading = ref(false),
  searchError = ref('')
const selected = reactive(new Map()),
  failedImages = reactive(new Set())
const body = ref(''),
  header = ref(''),
  footer = ref(''),
  pending = ref(null),
  busy = ref(false),
  error = ref(''),
  notice = ref('')
const locked = computed(() => props.blocked || busy.value || !!pending.value)
const validation = computed(() => {
  if (!body.value.trim()) return __('Escribe un mensaje para el cliente.')
  if (Array.from(body.value).length > 1024)
    return __('El mensaje admite hasta 1024 caracteres.')
  if (kind.value === 'product_list' && !header.value.trim())
    return __('Escribe un título para la lista de productos.')
  if (kind.value === 'product_list' && Array.from(header.value).length > 60)
    return __('El título admite hasta 60 caracteres.')
  if (Array.from(footer.value).length > 60)
    return __('El pie de mensaje admite hasta 60 caracteres.')
  if (kind.value === 'product' && selected.size !== 1)
    return __('Selecciona un producto para este mensaje.')
  if (
    kind.value === 'product_list' &&
    (selected.size < 1 || selected.size > 30)
  )
    return __('Selecciona entre 1 y 30 productos para la lista.')
  return ''
})
const canSend = computed(
  () =>
    props.eligible &&
    props.context.capabilities?.[kind.value] === true &&
    !validation.value,
)

let epoch = 0,
  searchEpoch = 0,
  timer
function price(rate, currency) {
  return rate == null
    ? __('Precio por verificar')
    : `${rate} ${currency || ''}`.trim()
}
function toggle(item) {
  if (locked.value) return
  if (selected.has(item.item_code)) selected.delete(item.item_code)
  else {
    if (kind.value === 'product_list' && selected.size >= 30) return
    if (kind.value === 'product') selected.clear()
    selected.set(item.item_code, item)
  }
}
function scheduleSearch() {
  clearTimeout(timer)
  timer = setTimeout(() => search(), 250)
}
async function search(more = false) {
  const stamp = ++searchEpoch,
    component = epoch
  loading.value = true
  searchError.value = ''
  try {
    const result = await call('crm.api.catalog_commerce.get_products', {
      conversation: props.conversation.name,
      query: query.value,
      offset: more ? items.value.length : 0,
    })
    if (stamp !== searchEpoch || component !== epoch) return
    if (!Array.isArray(result?.items))
      throw new Error('Unconfirmed product list')
    items.value = more
      ? [
          ...new Map(
            [...items.value, ...result.items].map((item) => [
              item.item_code,
              item,
            ]),
          ).values(),
        ]
      : result.items
    hasMore.value = result.has_more === true
  } catch {
    if (stamp === searchEpoch && component === epoch)
      searchError.value = __(
        'No se pudieron cargar los productos. Reintenta; tu selección se conserva.',
      )
  } finally {
    if (stamp === searchEpoch && component === epoch) loading.value = false
  }
}
watch(kind, () => {
  if (kind.value !== 'catalog_message') search()
})
watch(
  () => !!pending.value,
  (value) => emit('pending', value),
  { flush: 'sync' },
)
async function send() {
  if (busy.value || props.blocked || (!pending.value && !canSend.value)) return
  if (!pending.value)
    pending.value = Object.freeze({
      conversation: props.conversation.name,
      expected_generation: props.conversation.generation,
      request_id: crypto.randomUUID(),
      kind: kind.value,
      products: Object.freeze(
        kind.value === 'catalog_message' ? [] : [...selected.keys()],
      ),
      body: body.value,
      header: kind.value === 'product_list' ? header.value : '',
      footer: footer.value,
    })
  const stamp = epoch
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await call(
      'crm.api.catalog_commerce.queue_catalog',
      pending.value,
    )
    if (stamp !== epoch) return
    if (!result?.name || !result?.state)
      throw new Error('Unconfirmed catalog request')
    pending.value = null
    notice.value = __('Solicitud guardada. Consulta su estado en Envíos.')
    selected.clear()
    body.value = ''
    header.value = ''
    footer.value = ''
    emit('queued', result)
  } catch (e) {
    if (stamp !== epoch) return
    if (
      [
        'PermissionError',
        'AuthenticationError',
        'TimestampMismatchError',
        'ValidationError',
      ].includes(e?.exc_type || e?.responseJSON?.exc_type)
    ) {
      pending.value = null
      error.value = __(
        'No se confirmó el envío. Revisa el control de la conversación, el catálogo y el contenido antes de intentarlo de nuevo.',
      )
      emit('refresh')
    } else
      error.value = __(
        'La respuesta no llegó. Comprueba la misma solicitud; no vuelvas a crear el envío.',
      )
  } finally {
    if (stamp === epoch) busy.value = false
  }
}
if (kind.value && kind.value !== 'catalog_message') search()
onUnmounted(() => {
  epoch++
  searchEpoch++
  clearTimeout(timer)
  emit('pending', false)
})
</script>
