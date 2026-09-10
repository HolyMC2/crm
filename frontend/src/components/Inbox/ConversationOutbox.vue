<template>
  <details
    class="min-w-0 max-h-64 shrink-0 overflow-y-auto border-t border-outline-gray-1 p-3 text-sm [overflow-wrap:anywhere]"
    aria-label="Envíos"
    :open="!!error || !!pending || rows.some((r) => r.state === 'Unknown')"
  >
    <summary class="cursor-pointer font-medium">Envíos</summary>
    <p v-if="error" role="alert" class="my-2">{{ error }}</p>
    <button
      type="button"
      class="my-2 text-xs underline"
      :disabled="busy"
      @click="pending ? reconcile() : load()"
    >
      {{ pending ? 'Comprobar estado del cambio' : 'Actualizar envíos' }}
    </button>
    <p v-if="!rows.length && !busy" class="my-2 text-xs text-ink-gray-5">
      Sin envíos registrados en esta conversación.
    </p>
    <article
      v-for="row in rows"
      :key="row.name"
      class="border-t border-outline-gray-1 py-2"
      :data-intent="row.name"
    >
      <div class="flex flex-wrap justify-between gap-2 text-xs">
        <strong>{{ labels[row.state] || 'Estado no disponible' }}</strong
        ><time>{{ row.creation }}</time>
      </div>
      <p class="mt-1 whitespace-pre-wrap">{{ row.text }}</p>
      <p v-if="row.reason_code" class="mt-1 text-xs text-ink-gray-5">
        {{ reasons[row.reason_code] || 'Requiere revisión' }}
        <span>({{ safeReason(row.reason_code) }})</span>
      </p>
      <p v-if="row.state === 'Unknown'" class="mt-2 text-xs">
        Resultado incierto. Este envío no puede repetirse ni cancelarse.
      </p>
      <div v-else class="mt-2 flex flex-wrap gap-3 text-xs">
        <button
          v-if="canRetry(row)"
          type="button"
          class="underline"
          :disabled="busy || !!pending || blocked"
          @click="act('retry', row)"
        >
          Reintentar envío
        </button>
        <button
          v-if="canCancel(row)"
          type="button"
          class="underline"
          :disabled="busy || !!pending || blocked"
          @click="act('cancel', row)"
        >
          Cancelar envío
        </button>
      </div>
    </article>
    <button
      v-if="more"
      type="button"
      class="mt-2 text-xs underline"
      :disabled="busy"
      @click="load(true)"
    >
      Cargar envíos anteriores
    </button>
  </details>
</template>
<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { call } from 'frappe-ui'
const props = defineProps({
  conversation: { type: Object, required: true },
  actor: { type: String, required: true },
  blocked: Boolean,
})
const emit = defineEmits(['pending', 'refresh'])
const rows = ref([]),
  busy = ref(false),
  pending = ref(null),
  more = ref(false),
  error = ref('')
let epoch = 0,
  sequence = 0
onUnmounted(() => {
  epoch++
  emit('pending', false)
})
const labels = {
  Queued: 'En cola',
  Claimed: 'En preparación',
  Submitting: 'Envío en curso',
  Accepted: 'Aceptado por WhatsApp',
  Delivered: 'Entregado',
  Read: 'Leído',
  Blocked: 'Bloqueado',
  Failed: 'Falló',
  Cancelled: 'Cancelado',
  Deferred: 'Aplazado',
  Unknown: 'Resultado incierto',
}
const reasons = {
  account_unavailable: 'Cuenta no disponible',
  account_configuration_invalid: 'Revisa la configuración de la cuenta',
  account_configuration_changed: 'La configuración cambió',
  conversation_changed: 'Cambió el control de la conversación',
  authority_revoked: 'El acceso ya no está vigente',
  customer_window_unverified: 'No hay una ventana de respuesta verificada',
  recipient_suppressed: 'El destinatario no permite este contacto',
  reply_expired: 'La solicitud venció',
  operator_cancelled: 'Cancelado por un operador',
  provider_response_uncertain:
    'No se pudo confirmar la respuesta del proveedor',
  channel_not_ready: 'El canal aún no está disponible',
}
const safeReason = (value) =>
  /^[a-z0-9_]{1,100}$/.test(value || '') ? value : 'unavailable'
const owns = () =>
  props.conversation.human_owner === props.actor &&
  !!props.conversation.allowed_actions?.length
const canRetry = (r) =>
  owns() &&
  props.conversation.control_state === 'Human' &&
  r.actor_user === props.actor &&
  r.conversation_generation === props.conversation.generation &&
  r.can_retry === true &&
  ['Blocked', 'Failed', 'Deferred'].includes(r.state)
const canCancel = (r) =>
  owns() &&
  r.can_cancel === true &&
  ['Queued', 'Claimed', 'Blocked', 'Deferred', 'Failed'].includes(r.state)
const valid = (stamp, actor, name) =>
  stamp === epoch && actor === props.actor && name === props.conversation.name
function currentRow(row) {
  const previous = rows.value.find((r) => r.name === row.name)
  // Unknown is terminal in the server contract. A late list or mutation
  // response must never restore action buttons for that same intent.
  if (previous?.state === 'Unknown') return previous
  if (previous?.modified && row.modified && previous.modified > row.modified)
    return previous
  return row
}
function upsert(row) {
  rows.value = [
    currentRow(row),
    ...rows.value.filter((r) => r.name !== row.name),
  ].sort(
    (a, b) =>
      String(b.creation).localeCompare(String(a.creation)) ||
      b.name.localeCompare(a.name),
  )
}
function fail(e) {
  const type = e?.exc_type || e?.responseJSON?.exc_type
  if (['PermissionError', 'AuthenticationError'].includes(type)) {
    rows.value = []
    pending.value = null
    emit('refresh')
  }
  error.value = 'No se pudo comprobar el estado. Actualiza antes de actuar.'
}
watch(
  () => !!pending.value,
  (value) => emit('pending', value),
  { flush: 'sync' },
)
watch(
  [() => props.conversation.name, () => props.actor],
  () => {
    epoch++
    rows.value = []
    pending.value = null
    error.value = ''
    more.value = false
    load()
  },
  { immediate: true, flush: 'sync' },
)
async function load(older = false) {
  const stamp = epoch,
    actor = props.actor,
    name = props.conversation.name,
    request = ++sequence
  busy.value = true
  try {
    const result = await call('crm.api.outbox.list_intents', {
      conversation: name,
      limit: 50,
      before: older ? rows.value.at(-1)?.name : null,
    })
    if (!valid(stamp, actor, name) || request !== sequence) return
    if (!Array.isArray(result)) throw new Error('Invalid outbox response')
    const current = result.map(currentRow)
    rows.value = older
      ? [
          ...new Map(
            [...rows.value, ...current].map((r) => [r.name, r]),
          ).values(),
        ]
      : current
    more.value = result.length === 50
    error.value = ''
  } catch (e) {
    if (valid(stamp, actor, name) && request === sequence) fail(e)
  } finally {
    if (valid(stamp, actor, name) && request === sequence) busy.value = false
  }
}
async function act(action, row) {
  if (
    busy.value ||
    pending.value ||
    props.blocked ||
    !(action === 'retry' ? canRetry(row) : canCancel(row))
  )
    return
  const stamp = epoch,
    actor = props.actor,
    name = props.conversation.name
  pending.value = { action, name: row.name }
  busy.value = true
  error.value = ''
  try {
    const result = await call(`crm.api.outbox.${action}_intent`, {
      name: row.name,
    })
    if (!valid(stamp, actor, name)) return
    if (!result?.name || !result?.state) throw new Error('Unconfirmed response')
    upsert(result)
    pending.value = null
  } catch (e) {
    if (!valid(stamp, actor, name)) return
    const type = e?.exc_type || e?.responseJSON?.exc_type
    if (
      [
        'PermissionError',
        'AuthenticationError',
        'ValidationError',
        'TimestampMismatchError',
      ].includes(type)
    ) {
      pending.value = null
      fail(e)
      await load()
    } else
      error.value =
        'La respuesta no llegó. Comprueba el estado; no repitas la acción.'
  } finally {
    if (valid(stamp, actor, name)) busy.value = false
  }
}
async function reconcile() {
  if (busy.value || !pending.value) return
  const stamp = epoch,
    actor = props.actor,
    name = props.conversation.name
  busy.value = true
  try {
    const row = await call('crm.api.outbox.get_intent', {
      name: pending.value.name,
    })
    if (!valid(stamp, actor, name)) return
    if (!row?.name || !row?.state) throw new Error('Unconfirmed response')
    upsert(row)
    pending.value = null
    error.value = ''
  } catch (e) {
    if (valid(stamp, actor, name)) fail(e)
  } finally {
    if (valid(stamp, actor, name)) busy.value = false
  }
}
defineExpose({ load, upsert })
</script>
