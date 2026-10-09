<template>
  <section
    v-if="context?.available"
    class="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-t border-outline-gray-1 p-3 text-sm"
    :aria-label="__('Appointments')"
  >
    <h3 class="w-full font-semibold">{{ __('Appointments') }}</h3>
    <button
      v-if="canSend"
      type="button"
      class="min-h-11 rounded bg-surface-gray-2 px-3 hover:bg-surface-gray-3 disabled:opacity-60"
      :disabled="busy || blocked"
      @click="send"
    >
      {{ busy ? __('Sending…') : context.flow ? __('Send booking form') : __('Send booking link') }}
    </button>
    <RouterLink
      v-if="context.canBook"
      class="inline-flex min-h-11 items-center rounded px-3 underline"
      :to="bookRoute"
      >{{ __('Book appointment') }}</RouterLink
    >
    <p v-if="!canSend" class="w-full text-xs text-ink-gray-5">
      {{ __('To send the booking link you need control of this conversation.') }}
    </p>
    <p v-if="notice" role="status" class="w-full text-xs">{{ notice }}</p>
    <p v-if="error" role="alert" class="w-full text-xs">{{ error }}</p>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { call } from 'frappe-ui'

const props = defineProps({
  conversation: { type: Object, required: true },
  actor: { type: String, required: true },
  blocked: Boolean,
})
const emit = defineEmits(['queued'])
const context = ref(null)
const busy = ref(false)
const notice = ref('')
const error = ref('')

const canSend = computed(
  () =>
    props.conversation.control_state === 'Human' &&
    props.conversation.human_owner === props.actor &&
    props.conversation.send_available === true &&
    Number.isInteger(props.conversation.generation),
)
const bookRoute = computed(() => ({
  path: '/agenda',
  query: {
    new_cita: '1',
    conversation: props.conversation.name,
    ...(context.value?.contact
      ? { contact: context.value.contact.name, contact_label: context.value.contact.label }
      : {}),
    return_to: `${window.location.pathname}${window.location.search}`,
    return_label: __('the chat'),
  },
}))

async function load() {
  context.value = null
  if (props.conversation.provider !== 'WhatsApp') return
  try {
    context.value = await call('crm.api.citas.booking_context', {
      conversation: props.conversation.name,
    })
  } catch {
    context.value = null // the section hides itself; the chat keeps working
  }
}
watch(() => props.conversation.name, load, { immediate: true })

async function send() {
  busy.value = true
  notice.value = ''
  error.value = ''
  try {
    const result = await call('crm.api.citas.send_booking_link', {
      conversation: props.conversation.name,
      expected_generation: props.conversation.generation,
      request_id: crypto.randomUUID(),
    })
    notice.value = __('Saved. Check its status in Sends.')
    emit('queued', result)
  } catch (e) {
    error.value = e?.messages?.[0] || e?.message || __('It was not sent. Try again.')
  } finally {
    busy.value = false
  }
}
</script>
