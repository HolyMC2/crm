<template>
  <section
    class="mt-3 space-y-3 rounded border border-outline-gray-2 p-3"
    aria-label="Revisar carrito recibido"
  >
    <h4 class="font-semibold">{{ __('Revisar carrito') }} · {{ name }}</h4>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">{{ __('Cargando carrito…') }}</p>
    <button
      v-if="!cart && !loading"
      type="button"
      class="min-h-11 px-3 underline focus-visible:ring-2"
      @click="loadCart"
    >
      {{ __('Reintentar carrito') }}
    </button>
    <template v-if="cart">
      <p class="text-xs text-ink-gray-5">
        {{ __('Catálogo recibido') }}: {{ cart.catalog_id || '—' }} ·
        {{ cart.creation }}
      </p>
      <p v-if="cart.buyer_note" class="whitespace-pre-wrap text-xs">
        <strong>{{ __('Nota del cliente') }}:</strong> {{ cart.buyer_note }}
      </p>
      <p v-if="cart.reason_code" class="text-xs">
        {{ issueText(cart.reason_code) }}
      </p>
      <ol class="space-y-2" aria-label="Todas las líneas solicitadas">
        <li
          v-for="(line, position) in cart.lines"
          :key="`${line.index}:${position}`"
          class="rounded border border-outline-gray-2 p-2"
        >
          <p class="font-medium">
            {{ __('Línea {0}', [position + 1]) }} ·
            {{ line.item_code || __('Artículo sin identificar') }}
          </p>
          <p class="text-xs">
            {{
              __('Solicitado: {0} × {1} {2}', [
                line.requested_quantity,
                line.requested_price,
                line.requested_currency,
              ])
            }}
          </p>
          <template v-if="reviewLine(line)">
            <p class="mt-1 text-xs">
              {{ reviewLine(line).item_name || line.item_code }} ·
              {{
                __('Vigente: {0} × {1} {2}', [
                  reviewLine(line).quantity,
                  reviewLine(line).rate ?? '—',
                  review.currency,
                ])
              }}
            </p>
            <p class="text-xs text-ink-gray-5">
              {{
                __('Disponible en almacén: {0}', [
                  reviewLine(line).available_qty ?? __('Por verificar'),
                ])
              }}
            </p>
            <ul v-if="reviewLine(line).issues?.length" class="mt-1 text-xs">
              <li v-for="(issue, i) in reviewLine(line).issues" :key="i">
                {{ issueText(issue) }}
              </li>
            </ul>
          </template>
        </li>
      </ol>
      <p v-if="!cart.lines.length" class="text-xs">
        {{ __('El carrito no contiene líneas revisables.') }}
      </p>
      <p v-else-if="!completeCart" role="alert" class="text-xs">
        {{
          __(
            'No se pudo confirmar que llegaron todas las líneas del carrito. Vuelve a abrirlo antes de revisar.',
          )
        }}
      </p>
      <div
        v-if="linkedOrder"
        class="rounded border border-outline-gray-2 bg-surface-gray-2 p-3"
        role="status"
      >
        <p>
          {{ __('Pedido borrador creado: {0}', [linkedOrder.sales_order]) }}
        </p>
        <p class="mt-1 text-xs">
          {{
            __(
              'Abre el pedido para revisar y continuar su proceso. Este carrito no acredita un pago.',
            )
          }}
        </p>
        <a
          :href="orderUrl"
          class="mt-2 inline-flex min-h-11 items-center underline focus-visible:ring-2"
          >{{ __('Abrir pedido de venta') }}</a
        >
      </div>
      <div v-else class="space-y-3">
        <p class="text-xs text-ink-gray-5">
          {{
            __(
              'Selecciona los registros autorizados para este pedido. El teléfono del cliente no asigna una identidad comercial.',
            )
          }}
        </p>
        <div class="cart-scope grid gap-3 sm:grid-cols-2">
          <Link
            v-model="customer"
            doctype="Customer"
            :label="__('Cliente')"
            :placeholder="__('Selecciona un cliente')"
            :disabled="locked"
            :filters="{ disabled: 0 }"
          />
          <Link
            v-model="company"
            doctype="Company"
            :label="__('Empresa')"
            :placeholder="__('Selecciona una empresa')"
            :disabled="locked"
          />
          <Link
            v-model="warehouse"
            doctype="Warehouse"
            :label="__('Almacén')"
            :placeholder="__('Selecciona un almacén')"
            :disabled="locked || !company"
            :filters="{ company, is_group: 0 }"
          />
          <Link
            v-model="deal"
            doctype="CRM Deal"
            :label="__('Negocio (opcional)')"
            :placeholder="__('Vincular un negocio autorizado')"
            :disabled="locked"
          />
        </div>
        <button
          type="button"
          class="min-h-11 rounded border border-outline-gray-2 px-3 focus-visible:ring-2 disabled:opacity-50"
          :disabled="locked || !scopeReady || !completeCart"
          @click="reviewCart"
        >
          {{
            reviewing ? __('Revisando…') : __('Revisar precios y existencias')
          }}
        </button>
        <div v-if="review" class="space-y-2 text-xs" aria-live="polite">
          <p>{{ __('Lista de precios') }}: {{ review.price_list || '—' }}</p>
          <p class="font-semibold">
            {{ __('Total vigente') }}: {{ review.total }} {{ review.currency }}
          </p>
          <ul v-if="review.issues?.length">
            <li v-for="(issue, i) in review.issues" :key="i">
              {{ issueText(issue) }}
            </li>
          </ul>
          <p v-if="!completeReview" role="alert">
            {{
              __(
                'La revisión no incluye todas las líneas originales. Revisa de nuevo antes de crear el pedido.',
              )
            }}
          </p>
          <p v-if="!canCreate && completeReview">
            {{
              __(
                'Resuelve los problemas indicados y vuelve a revisar. No se creará un pedido parcial.',
              )
            }}
          </p>
          <p v-if="canCreate">
            {{
              __(
                'El pedido se creará como borrador con los valores vigentes de esta revisión; todavía no está pagado ni confirmado.',
              )
            }}
          </p>
        </div>
        <p v-if="pending" class="text-xs">
          {{
            __(
              'La creación no está confirmada. Conservamos la misma solicitud; comprueba su resultado antes de continuar.',
            )
          }}
        </p>
        <button
          v-if="review || pending"
          type="button"
          class="min-h-11 rounded bg-surface-gray-7 px-4 py-2 text-ink-white focus-visible:ring-2 disabled:opacity-50"
          :disabled="
            creating || reviewing || blocked || (!pending && !canCreate)
          "
          @click="createOrder"
        >
          {{
            creating
              ? __('Comprobando…')
              : pending
                ? __('Comprobar creación')
                : __('Crear pedido borrador')
          }}
        </button>
      </div>
    </template>
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from 'vue'
import { call } from 'frappe-ui'
const Link = defineAsyncComponent(
  () => import('@/components/Controls/Link.vue'),
)
const props = defineProps({
  name: { type: String, required: true },
  context: { type: Object, required: true },
  blocked: Boolean,
})
const emit = defineEmits(['pending', 'created'])
const cart = ref(null),
  loading = ref(false),
  error = ref(''),
  notice = ref('')
const customer = ref(''),
  company = ref(props.context.company || ''),
  warehouse = ref(props.context.warehouse || ''),
  deal = ref('')
const review = ref(null),
  reviewing = ref(false),
  creating = ref(false),
  pending = ref(null),
  created = ref(null)
const scopeReady = computed(
  () => !!customer.value && !!company.value && !!warehouse.value,
)
const locked = computed(
  () => props.blocked || reviewing.value || creating.value || !!pending.value,
)
const completeCart = computed(
  () =>
    cart.value?.name === props.name &&
    cart.value.lines.length > 0 &&
    cart.value.line_count === cart.value.lines.length &&
    new Set(cart.value.lines.map((line) => line.index)).size ===
      cart.value.lines.length,
)
const completeReview = computed(
  () =>
    completeCart.value &&
    Array.isArray(review.value?.lines) &&
    review.value.lines.length === cart.value?.lines.length &&
    cart.value.lines.every((line) =>
      review.value.lines.some((r) => r.index === line.index),
    ),
)
const canCreate = computed(
  () =>
    scopeReady.value &&
    completeReview.value &&
    review.value?.can_create === true &&
    typeof review.value?.review_token === 'string' &&
    !!review.value.review_token,
)
const linkedOrder = computed(
  () => created.value || (cart.value?.sales_order ? cart.value : null),
)
const orderUrl = computed(() =>
  /^\/(?:app|desk)\//.test(linkedOrder.value?.sales_order_url || '')
    ? linkedOrder.value.sales_order_url
    : `/app/sales-order/${encodeURIComponent(linkedOrder.value?.sales_order || '')}`,
)
let epoch = 0
function scope() {
  return {
    name: props.name,
    customer: customer.value,
    company: company.value,
    warehouse: warehouse.value,
    deal: deal.value || null,
  }
}
function reviewLine(line) {
  return review.value?.lines?.find((row) => row.index === line.index)
}
function issueText(issue) {
  const code = typeof issue === 'string' ? issue : issue?.reason_code
  const reasons = {
    unknown_item: __(
      'El artículo solicitado no está identificado en el catálogo.',
    ),
    unpublished_item: __('El artículo no está publicado para esta cuenta.'),
    unpriced_item: __('Falta un precio vigente para este artículo.'),
    wrong_catalog: __('El carrito o artículo corresponde a otro catálogo.'),
    currency_mismatch: __(
      'La moneda solicitada no coincide con la moneda de venta.',
    ),
    invalid_quantity: __('La cantidad solicitada no es válida.'),
    quantity_limit: __('La cantidad solicitada supera el límite permitido.'),
    line_limit: __('El carrito supera el número de líneas permitido.'),
    insufficient_stock: __(
      'No hay existencia suficiente en el almacén seleccionado.',
    ),
    ambiguous_price: __(
      'Hay más de un precio aplicable; revisa la configuración.',
    ),
    price_changed: __(
      'El precio cambió; revisa el valor vigente antes de crear el pedido.',
    ),
    duplicate_line: __(
      'El cliente solicitó este artículo en más de una línea.',
    ),
    adapter_unavailable: __('El servicio comercial no está disponible.'),
    authentication_unproven: __(
      'La cuenta de catálogo todavía no tiene una conexión verificada.',
    ),
    stale_review: __(
      'La revisión ya no está vigente. Revisa de nuevo precios y existencias.',
    ),
  }
  return (
    reasons[code] ||
    __('Este carrito necesita una revisión adicional antes de crear el pedido.')
  )
}
async function loadCart() {
  if (loading.value || pending.value) return
  const stamp = epoch
  loading.value = true
  error.value = ''
  try {
    const result = await call('crm.api.catalog_commerce.get_cart', {
      name: props.name,
    })
    if (stamp !== epoch) return
    if (!result?.name || !Array.isArray(result.lines))
      throw new Error('Unconfirmed cart')
    cart.value = result
  } catch (e) {
    if (stamp === epoch)
      error.value = ['PermissionError', 'AuthenticationError'].includes(
        e?.exc_type || e?.responseJSON?.exc_type,
      )
        ? __(
            'No tienes acceso a este carrito. Revisa tu sesión o los permisos de la cuenta.',
          )
        : __(
            'No se pudo cargar el carrito. Reintenta para ver todas sus líneas.',
          )
  } finally {
    if (stamp === epoch) loading.value = false
  }
}
watch(company, () => {
  warehouse.value = ''
})
watch([customer, company, warehouse, deal], () => {
  review.value = null
  error.value = ''
  notice.value = ''
})
watch(
  () => !!pending.value || reviewing.value,
  (value) => emit('pending', value),
  { flush: 'sync' },
)
async function reviewCart() {
  if (locked.value || !scopeReady.value || !completeCart.value) return
  const stamp = epoch
  reviewing.value = true
  review.value = null
  error.value = ''
  try {
    const result = await call('crm.api.catalog_commerce.review_cart', scope())
    if (stamp !== epoch) return
    if (
      !result ||
      !Array.isArray(result.lines) ||
      typeof result.can_create !== 'boolean'
    )
      throw new Error('Unconfirmed review')
    review.value = result
  } catch (e) {
    if (stamp === epoch)
      error.value = ['PermissionError', 'AuthenticationError'].includes(
        e?.exc_type || e?.responseJSON?.exc_type,
      )
        ? __(
            'No tienes permiso para revisar este carrito con los registros seleccionados.',
          )
        : __(
            'No se pudo completar la revisión. Conservamos todas las líneas; revisa los datos y reintenta.',
          )
  } finally {
    if (stamp === epoch) reviewing.value = false
  }
}
async function createOrder() {
  if (
    creating.value ||
    reviewing.value ||
    props.blocked ||
    (!pending.value && !canCreate.value)
  )
    return
  if (!pending.value)
    pending.value = Object.freeze({
      ...scope(),
      review_token: review.value.review_token,
      request_id: crypto.randomUUID(),
    })
  const stamp = epoch
  creating.value = true
  error.value = ''
  try {
    const result = await call(
      'crm.api.catalog_commerce.create_order',
      pending.value,
    )
    if (stamp !== epoch) return
    if (!result?.sales_order) throw new Error('Unconfirmed order')
    created.value = result
    pending.value = null
    emit('created', result)
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
      review.value = null
      error.value = __(
        'La revisión cambió o ya no es válida. Revisa de nuevo los permisos, precios y existencias antes de crear el pedido.',
      )
    } else
      error.value = __(
        'No llegó la confirmación del pedido. Comprueba la misma solicitud para evitar duplicados.',
      )
  } finally {
    if (stamp === epoch) creating.value = false
  }
}
loadCart()
onUnmounted(() => {
  epoch++
  emit('pending', false)
})
</script>
<style scoped>
.cart-scope :deep(input),
.cart-scope :deep(button) {
  min-height: 44px;
}
</style>
