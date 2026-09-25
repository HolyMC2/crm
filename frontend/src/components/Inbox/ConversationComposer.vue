<template>
  <section
    class="min-w-0 shrink-0 border-t border-outline-gray-1 p-3 pb-16 text-sm [overflow-wrap:anywhere]"
    aria-label="Responder al cliente"
  >
    <p v-if="error" role="alert" class="mb-2">{{ error }}</p>
    <p v-if="notice" role="status" class="mb-2">{{ notice }}</p>
    <form v-if="eligible || pending" @submit.prevent="submit">
      <label class="block text-xs font-medium"
        >Respuesta a {{ conversation.display_name || conversation.peer_id }}
        <textarea
          v-model="body"
          rows="3"
          required
          class="mt-2 block w-full min-w-0 resize-y rounded border border-outline-gray-2 bg-surface-white p-2 text-sm"
          :disabled="busy || !!pending || blocked"
          :aria-invalid="!pending && !!problem"
          :aria-describedby="`${id}-rules`"
          aria-label="Texto de respuesta"
        />
      </label>
      <div :id="`${id}-rules`" aria-live="polite">
        <p v-if="social && !pending" class="my-2 text-xs text-ink-gray-5">
          {{ channel }} solo acepta texto y respuestas dentro de las 24 horas
          posteriores al último mensaje del cliente.
        </p>
        <p v-if="problem && !pending" class="my-2 text-xs" data-reply-problem>
          {{ problem }}
        </p>
      </div>
      <p v-if="pending" class="my-2 text-xs">
        La respuesta no se ha confirmado. Conservamos el texto y la misma
        solicitud.
      </p>
      <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs text-ink-gray-5"
          >{{ length }}/{{ maxLength }} · Consulta el estado en Envíos.</span
        >
        <button
          type="submit"
          class="rounded bg-surface-gray-7 px-3 py-2 text-ink-white"
          :disabled="
            busy || blocked || (!pending && (!body.trim() || !!problem))
          "
        >
          {{
            busy
              ? 'Comprobando…'
              : pending
                ? 'Comprobar solicitud'
                : 'Enviar respuesta'
          }}
        </button>
      </div>
    </form>
    <p v-else class="text-xs text-ink-gray-5">{{ unavailable }}</p>
  </section>
</template>
<script setup>
import { computed, ref, watch, onUnmounted, useId } from 'vue'
import { call } from 'frappe-ui'
const props = defineProps({
  conversation: { type: Object, required: true },
  actor: { type: String, required: true },
  blocked: Boolean,
})
const emit = defineEmits(['pending', 'queued', 'refresh'])
// The server's exact text bounds (crm.api.outbox._payload and the owning
// validators): Python counts code points, so the count below does too.
const LIMITS = {
  WhatsApp: 4096,
  Webchat: 2000,
  Messenger: 2000,
  Instagram: 1000,
}
// Webchat and the Meta Send API refuse C0 controls other than tab, LF and CR.
const STRICT = ['Webchat', 'Messenger', 'Instagram']
function textProblem(text, strict) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++
        continue
      }
      return 'El texto contiene caracteres no válidos.'
    }
    if (code >= 0xdc00 && code <= 0xdfff)
      return 'El texto contiene caracteres no válidos.'
    if (strict && code < 32 && code !== 9 && code !== 10 && code !== 13)
      return 'El texto contiene caracteres de control que este canal no acepta.'
  }
  return ''
}
const id = useId()
const body = ref(''),
  pending = ref(null),
  busy = ref(false),
  error = ref(''),
  notice = ref('')
let epoch = 0
const provider = computed(() => props.conversation.provider)
const nativeChannel = computed(() =>
  Object.prototype.hasOwnProperty.call(LIMITS, provider.value),
)
const social = computed(() =>
  ['Messenger', 'Instagram'].includes(provider.value),
)
const channel = computed(() => provider.value)
const maxLength = computed(() => LIMITS[provider.value] || 0)
const length = computed(() => Array.from(body.value).length)
const problem = computed(() =>
  length.value > maxLength.value
    ? `La respuesta supera el límite de ${maxLength.value} caracteres de este canal.`
    : textProblem(body.value, STRICT.includes(provider.value)),
)
onUnmounted(() => {
  epoch++
  emit('pending', false)
})
const owner = computed(
  () =>
    props.conversation.control_state === 'Human' &&
    props.conversation.human_owner === props.actor,
)
const eligible = computed(
  () =>
    nativeChannel.value &&
    owner.value &&
    props.conversation.send_available === true &&
    Number.isInteger(props.conversation.generation),
)
const unavailable = computed(() => {
  if (!nativeChannel.value)
    return 'El envío nativo aún no está disponible para este canal.'
  if (
    owner.value &&
    !['Ours', 'Not Applicable'].includes(props.conversation.provider_control)
  )
    return social.value
      ? `${channel.value} aún no confirma que esta tienda controla la conversación. Mientras tanto responde desde la bandeja de Meta.`
      : 'Esta conversación se atiende desde la app del proveedor.'
  if (owner.value)
    return 'El envío nativo no está disponible ahora para esta conversación. Revisa la configuración del canal.'
  return 'Para responder necesitas el control humano vigente de esta conversación.'
})
watch(
  [() => props.conversation.name, () => props.actor],
  () => {
    epoch++
    body.value = ''
    pending.value = null
    busy.value = false
    error.value = ''
    notice.value = ''
  },
  { flush: 'sync' },
)
watch(
  () => !!pending.value,
  (value) => emit('pending', value),
  { flush: 'sync' },
)
async function submit() {
  if (busy.value || props.blocked || (!pending.value && !eligible.value)) return
  if (!pending.value) {
    if (!body.value.trim() || problem.value) return
    pending.value = Object.freeze({
      conversation: props.conversation.name,
      expected_generation: props.conversation.generation,
      request_id: crypto.randomUUID(),
      payload: Object.freeze({ type: 'text', text: body.value }),
    })
  }
  const stamp = epoch,
    actor = props.actor,
    request = pending.value
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await call('crm.api.outbox.queue_message', request)
    if (stamp !== epoch || actor !== props.actor) return
    if (!result?.name || !result?.state) throw new Error('Unconfirmed response')
    pending.value = null
    body.value = ''
    notice.value = 'Solicitud guardada. Consulta su estado en Envíos.'
    emit('queued', result)
  } catch (e) {
    if (stamp !== epoch || actor !== props.actor) return
    const type = e?.exc_type || e?.responseJSON?.exc_type
    if (
      [
        'PermissionError',
        'AuthenticationError',
        'TimestampMismatchError',
        'ValidationError',
      ].includes(type)
    ) {
      pending.value = null
      error.value =
        'No se confirmó el envío. Revisa el control vigente y el texto antes de volver a intentarlo.'
      emit('refresh')
    } else
      error.value =
        'La respuesta no llegó. Comprueba la misma solicitud antes de continuar.'
  } finally {
    if (stamp === epoch && actor === props.actor) busy.value = false
  }
}
</script>
