<template>
  <section
    class="max-h-[55vh] min-w-0 shrink-0 overflow-y-auto border-t border-outline-gray-1 p-3 text-sm [overflow-wrap:anywhere]"
    aria-label="Catálogo y pedidos de WhatsApp"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="font-semibold">{{ __('Catálogo y pedidos') }}</h3>
      <button
        type="button"
        class="min-h-11 rounded px-3 text-xs underline focus-visible:ring-2"
        :disabled="loading || pending || blocked"
        @click="loadContext"
      >
        {{ loading ? __('Cargando…') : __('Actualizar catálogo y carritos') }}
      </button>
    </div>
    <p v-if="error" class="my-2" role="alert">{{ error }}</p>
    <template v-if="context">
      <p v-if="!context.available" class="py-2 text-xs text-ink-gray-5">
        {{ reasonText(context.reason_code) }}
      </p>
      <template v-else>
        <p class="text-xs text-ink-gray-5">
          {{ __('Catálogo de WhatsApp') }} · {{ context.account_name }}
        </p>
        <p class="mt-1 text-xs text-ink-gray-5" role="status">
          {{ connectionText }}
          <span v-if="context.connection?.checked_at">
            · {{ __('Consulta: {0}', [context.connection.checked_at]) }}
          </span>
        </p>
        <p class="mt-1 text-xs text-ink-gray-5">
          {{
            __(
              'Facebook Shop y Marketplace tienen capacidades independientes; esta acción solo usa el catálogo de WhatsApp.',
            )
          }}
        </p>
        <button
          v-if="canOfferProducts"
          type="button"
          class="my-2 min-h-11 rounded border border-outline-gray-2 px-3 font-medium focus-visible:ring-2"
          :aria-expanded="showProducts"
          :disabled="blocked || pending"
          @click="showProducts = !showProducts"
        >
          {{
            showProducts
              ? __('Cerrar selector')
              : __('Compartir catálogo o productos')
          }}
        </button>
        <p v-if="!eligible" class="my-2 text-xs text-ink-gray-5">
          {{
            __(
              'Para enviar necesitas el control humano vigente y un canal disponible. Puedes consultar los carritos recibidos.',
            )
          }}
        </p>
        <CatalogProductPicker
          v-if="productOpened"
          v-show="showProducts"
          :conversation="conversation"
          :context="context"
          :eligible="eligible"
          :blocked="blocked || cartPending || !!error"
          @pending="productPending = $event"
          @queued="$emit('queued', $event)"
          @refresh="$emit('refresh')"
        />
      </template>
      <div v-if="context.carts?.length" class="mt-3">
        <h4 class="text-xs font-semibold">{{ __('Carritos recibidos') }}</h4>
        <ul class="mt-1 space-y-1">
          <li v-for="cart in context.carts" :key="cart.name">
            <button
              type="button"
              class="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded border border-outline-gray-2 px-3 py-2 text-left focus-visible:ring-2"
              :class="
                selectedCart === cart.name
                  ? 'bg-surface-gray-2'
                  : 'bg-surface-base'
              "
              :disabled="blocked || pending"
              :aria-pressed="selectedCart === cart.name"
              @click="
                selectedCart = selectedCart === cart.name ? '' : cart.name
              "
            >
              <span
                >{{ cart.name }} ·
                {{ __('{0} líneas', [cart.line_count]) }}</span
              >
              <span class="text-xs text-ink-gray-5">{{
                cart.sales_order ? __('Pedido creado') : __('Revisar carrito')
              }}</span>
            </button>
          </li>
        </ul>
      </div>
      <p
        v-else-if="context.available && !loading && !error"
        class="my-2 text-xs text-ink-gray-5"
      >
        {{ __('Todavía no hay carritos recibidos en esta conversación.') }}
      </p>
      <CatalogCartReview
        v-if="selectedCart"
        :key="`${conversation.name}:${actor}:${selectedCart}`"
        :name="selectedCart"
        :context="context"
        :blocked="blocked || productPending || !context.available || !!error"
        @pending="cartPending = $event"
        @created="loadContext"
      />
    </template>
  </section>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import CatalogProductPicker from './CatalogProductPicker.vue'
import CatalogCartReview from './CatalogCartReview.vue'

const props = defineProps({
  conversation: { type: Object, required: true },
  actor: { type: String, required: true },
  blocked: Boolean,
})
const emit = defineEmits(['pending', 'queued', 'refresh'])
const context = ref(null),
  loading = ref(false),
  error = ref('')
const showProducts = ref(false),
  productOpened = ref(false),
  selectedCart = ref('')
const productPending = ref(false),
  cartPending = ref(false)
const pending = computed(() => productPending.value || cartPending.value)
let epoch = 0
const eligible = computed(
  () =>
    props.conversation.provider === 'WhatsApp' &&
    props.conversation.control_state === 'Human' &&
    props.conversation.human_owner === props.actor &&
    props.conversation.send_available === true &&
    Number.isInteger(props.conversation.generation),
)
const canOfferProducts = computed(() =>
  ['catalog_message', 'product', 'product_list'].some(
    (kind) => context.value?.capabilities?.[kind] === true,
  ),
)
const connectionText = computed(() => {
  const state = context.value?.connection?.state
  if (state === 'Observed')
    return __(
      'Meta confirmó el vínculo del catálogo y su visibilidad en la última consulta. La entrega de cada mensaje se confirma por separado.',
    )
  if (state === 'Unavailable')
    return __(
      'La última consulta detectó que el teléfono o el catálogo no está disponible. Revisa la conexión en WhatsApp Manager.',
    )
  if (state === 'Stale')
    return __(
      'La comprobación de la conexión venció. Un administrador puede actualizar el diagnóstico del catálogo.',
    )
  return __(
    'El catálogo está configurado aquí; Meta todavía no ha confirmado su vínculo mediante la API. Revisa WhatsApp Manager si rechaza el envío.',
  )
})
function reasonText(code) {
  const reasons = {
    catalog_not_configured: __('Esta cuenta no tiene un catálogo configurado.'),
    catalog_disabled: __('El catálogo está desactivado para esta cuenta.'),
    wrong_account: __('El catálogo no corresponde a esta cuenta de WhatsApp.'),
    provider_not_supported: __(
      'El catálogo nativo está disponible para conversaciones de WhatsApp.',
    ),
    adapter_unavailable: __(
      'El servicio de catálogo no está instalado o no está disponible.',
    ),
    authentication_unproven: __(
      'La cuenta todavía no tiene una conexión verificada para usar el catálogo.',
    ),
  }
  return (
    reasons[code] ||
    __(
      'El catálogo no está disponible ahora. Consulta la configuración de esta cuenta.',
    )
  )
}
async function loadContext() {
  if (loading.value || pending.value || props.blocked) return
  const stamp = epoch
  loading.value = true
  error.value = ''
  try {
    const result = await call('crm.api.catalog_commerce.get_context', {
      conversation: props.conversation.name,
    })
    if (stamp !== epoch) return
    if (!result || typeof result.available !== 'boolean')
      throw new Error('Unconfirmed catalog context')
    context.value = result
  } catch (e) {
    if (stamp !== epoch) return
    error.value = ['PermissionError', 'AuthenticationError'].includes(
      e?.exc_type || e?.responseJSON?.exc_type,
    )
      ? __(
          'No tienes acceso al catálogo de esta conversación. Revisa tu sesión o consulta a tu administrador.',
        )
      : __(
          'No se pudo consultar el catálogo. Reintenta; los datos pendientes se conservan.',
        )
  } finally {
    if (stamp === epoch) loading.value = false
  }
}
watch(showProducts, (shown) => {
  if (shown) productOpened.value = true
})
watch(
  () => pending.value,
  (value) => emit('pending', value),
  { flush: 'sync' },
)
watch(
  [() => props.conversation.name, () => props.actor],
  () => {
    epoch++
    context.value = null
    error.value = ''
    loading.value = false
    showProducts.value = false
    productOpened.value = false
    selectedCart.value = ''
    productPending.value = false
    cartPending.value = false
    loadContext()
  },
  { immediate: true, flush: 'sync' },
)
watch(
  () => props.blocked,
  (blocked) => {
    if (!blocked && !context.value && !loading.value) loadContext()
  },
)
onUnmounted(() => {
  epoch++
  emit('pending', false)
})
</script>
