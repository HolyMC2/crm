<template>
  <!-- Buttons keep the composer focused on mousedown: blurring it collapses the
       composer, moves this strip and loses the click (seen on the lab). -->
  <div
    v-if="view"
    class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2.5 py-1.5 text-xs"
    :class="toneClass"
    role="status"
    :aria-label="__('Control de la conversación')"
  >
    <span class="min-w-0 flex-1 truncate font-medium">{{ view.text }}</span>
    <template v-if="reasonFor">
      <input
        v-model="reason"
        class="min-w-0 flex-1 rounded border border-outline-gray-2 bg-surface-white px-2 py-0.5 text-xs text-ink-gray-8"
        :placeholder="__('Motivo')"
        :aria-label="__('Motivo')"
        @keydown.enter.prevent="apply(reasonFor, reason)"
      />
      <button
        type="button"
        class="font-semibold underline"
        :disabled="busy || !reason.trim()"
        @mousedown.prevent
        @click="apply(reasonFor, reason)"
      >
        {{ __('Confirmar') }}
      </button>
      <button
        type="button"
        class="underline"
        :disabled="busy"
        @mousedown.prevent
        @click="reasonFor = ''"
      >
        {{ __('Cancelar') }}
      </button>
    </template>
    <template v-else>
      <button
        v-for="a in view.actions"
        :key="a.action"
        type="button"
        class="font-semibold underline"
        :disabled="busy"
        @mousedown.prevent
        @click="choose(a.action)"
      >
        {{ a.label }}
      </button>
    </template>
    <RouterLink
      :to="{
        name: 'Inbox',
        query: { workspace: 'conversations', conversation: control.name },
      }"
      class="text-ink-gray-5 underline"
    >
      {{ __('Gestionar') }}
    </RouterLink>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { call, toast } from 'frappe-ui'
import { globalStore } from '@/stores/global'
import { controlView, needsReason } from '@/utils/conversationControl'

const props = defineProps({
  referenceDoctype: { type: String, required: true },
  referenceName: { type: String, required: true },
  phone: { type: String, default: '' },
  whatsappAccount: { type: String, default: '' },
})
const emit = defineEmits(['changed'])

const control = ref(null)
const busy = ref(false)
const reasonFor = ref('')
const reason = ref('')
const view = computed(() => controlView(control.value, __))
const toneClass = computed(
  () =>
    ({
      green: 'bg-surface-green-1 text-ink-green-8',
      blue: 'bg-surface-blue-1 text-ink-blue-9',
      amber: 'bg-surface-amber-1 text-ink-amber-7',
      gray: 'bg-surface-gray-2 text-ink-gray-7',
    })[view.value?.tone] || 'bg-surface-gray-2 text-ink-gray-7',
)

let seq = 0
async function load() {
  const mine = ++seq
  if (!props.phone) {
    control.value = null
    return
  }
  try {
    const result = await call('crm.api.outbox_bridge.thread_control', {
      reference_doctype: props.referenceDoctype,
      reference_name: props.referenceName,
      phone: props.phone,
      whatsapp_account: props.whatsappAccount || undefined,
    })
    if (mine === seq) control.value = result
  } catch {
    // The strip is advisory; the composer still explains any refused send.
    if (mine === seq) control.value = null
  }
}

function choose(action) {
  reason.value = ''
  if (needsReason(control.value, action)) reasonFor.value = action
  else apply(action)
}

async function apply(action, why) {
  if (busy.value || !control.value?.name) return
  busy.value = true
  try {
    await call('crm.api.conversations.apply_control', {
      name: control.value.name,
      action,
      expected_generation: control.value.generation,
      command_id: crypto.randomUUID(),
      reason: why?.trim() || undefined,
    })
    reasonFor.value = ''
    emit('changed')
  } catch (error) {
    toast.error(
      error?.messages?.[0] ||
        __('La conversación cambió. Revisa su estado y vuelve a intentarlo.'),
    )
  } finally {
    busy.value = false
    await load()
  }
}

function onUpdated(event) {
  if (event?.name && event.name === control.value?.name) load()
}

watch(
  () => [
    props.referenceDoctype,
    props.referenceName,
    props.phone,
    props.whatsappAccount,
  ],
  load,
)
const { $socket } = globalStore()
onMounted(() => {
  load()
  $socket?.on('crm_conversation_updated', onUpdated)
})
onBeforeUnmount(() => $socket?.off('crm_conversation_updated', onUpdated))
defineExpose({ load })
</script>
