<template>
  <section
    class="min-w-0 border-t border-outline-gray-1 p-3 text-sm [overflow-wrap:anywhere]"
    aria-label="Responder al cliente"
  >
    <p v-if="error" role="alert" class="mb-2">{{ error }}</p>
    <p v-if="notice" role="status" class="mb-2">{{ notice }}</p>
    <form v-if="eligible || pending" @submit.prevent="submit">
      <label class="block text-xs font-medium"
        >Respuesta a {{ conversation.display_name || conversation.peer_id }}
        <textarea
          v-model="body"
          :maxlength="maxLength"
          rows="3"
          required
          class="mt-2 block w-full min-w-0 resize-y rounded border border-outline-gray-2 bg-surface-white p-2 text-sm"
          :disabled="busy || !!pending || blocked"
          aria-label="Texto de respuesta"
        />
      </label>
      <p v-if="pending" class="my-2 text-xs">
        La respuesta no se ha confirmado. Conservamos el texto y la misma
        solicitud.
      </p>
      <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span class="text-xs text-ink-gray-5"
          >{{ body.length }}/{{ maxLength }} · Consulta el estado en
          Envíos.</span
        >
        <button
          type="submit"
          class="rounded bg-surface-gray-7 px-3 py-2 text-ink-white"
          :disabled="busy || blocked || (!pending && !body.trim())"
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
    <p v-else class="text-xs text-ink-gray-5">
      {{
        nativeChannel
          ? 'Para responder necesitas el control humano vigente de esta conversación.'
          : 'El envío nativo aún no está disponible para este canal.'
      }}
    </p>
  </section>
</template>
<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { call } from 'frappe-ui'
const props = defineProps({
  conversation: { type: Object, required: true },
  actor: { type: String, required: true },
  blocked: Boolean,
})
const emit = defineEmits(['pending', 'queued', 'refresh'])
const body = ref(''),
  pending = ref(null),
  busy = ref(false),
  error = ref(''),
  notice = ref('')
let epoch = 0
const nativeChannel = computed(() =>
  ['WhatsApp', 'Webchat'].includes(props.conversation.provider),
)
const maxLength = computed(() =>
  props.conversation.provider === 'Webchat' ? 2000 : 4096,
)
onUnmounted(() => {
  epoch++
  emit('pending', false)
})
const eligible = computed(
  () =>
    nativeChannel.value &&
    props.conversation.send_available === true &&
    props.conversation.control_state === 'Human' &&
    props.conversation.human_owner === props.actor,
)
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
    if (!body.value.trim() || body.value.length > maxLength.value) return
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
