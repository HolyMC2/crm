<template>
  <section
    class="min-w-0 border-b border-outline-gray-1 p-3 [overflow-wrap:anywhere]"
    aria-label="Control de conversación"
  >
    <p class="text-sm font-medium">
      {{ labels[conversation.control_state] || conversation.control_state }} ·
      {{ conversation.human_owner || 'Sin responsable' }}
    </p>
    <p class="mt-1 text-xs text-ink-gray-5">
      El control determina quién puede responder. Un envío ya iniciado puede
      seguir en curso.
    </p>
    <p
      v-for="request in conversation.control_requests || []"
      :key="request.actor_user + request.creation"
      class="mt-2 text-xs"
    >
      {{ request.actor_user }} solicitó el control · {{ request.creation }}
    </p>
    <div
      v-if="pending"
      class="mt-3 rounded bg-surface-gray-2 p-2 text-sm"
      role="status"
    >
      Cambio pendiente de confirmar. Se conservará la misma solicitud.
      <button
        type="button"
        class="mt-2 block underline"
        :disabled="busy"
        @click="$emit('retry')"
      >
        {{ busy ? 'Comprobando…' : 'Comprobar cambio' }}
      </button>
    </div>
    <form
      v-else-if="actions.length"
      class="mt-3 flex min-w-0 flex-wrap items-end gap-2"
      @submit.prevent="submit"
    >
      <label class="min-w-0 flex-1 text-xs"
        >Acción
        <select
          v-model="action"
          :disabled="busy"
          class="mt-1 block w-full rounded border border-outline-gray-2 bg-surface-white p-2 text-sm"
          @change="changed"
        >
          <option value="" disabled>Seleccionar acción</option>
          <option v-for="value in actions" :key="value" :value="value">
            {{ actionLabels[value] }}
          </option>
        </select>
      </label>
      <label v-if="action === 'transfer'" class="w-full text-xs"
        >Nuevo responsable
        <input
          v-model="query"
          placeholder="Buscar operador"
          class="mt-1 block w-full rounded border border-outline-gray-2 p-2"
          :disabled="busy"
          @input="$emit('operators', query)"
        />
        <select
          v-model="owner"
          required
          :disabled="busy"
          class="mt-1 block w-full rounded border border-outline-gray-2 p-2"
        >
          <option value="" disabled>Seleccionar operador autorizado</option>
          <option
            v-for="operator in operators"
            :key="operator.name"
            :value="operator.name"
          >
            {{ operator.label }} · {{ operator.name }}
          </option>
        </select>
      </label>
      <label v-if="action" class="w-full text-xs"
        >Motivo {{ reasonRequired ? '(obligatorio)' : '(opcional)' }}
        <input
          v-model="reason"
          maxlength="500"
          :required="reasonRequired"
          :disabled="busy"
          class="mt-1 block w-full rounded border border-outline-gray-2 p-2"
        />
      </label>
      <button
        type="submit"
        class="rounded bg-surface-gray-7 px-3 py-2 text-sm text-ink-white"
        :disabled="busy || !action"
      >
        {{ busy ? 'Aplicando…' : 'Aplicar cambio' }}
      </button>
    </form>
    <p v-else class="mt-2 text-xs text-ink-gray-5">
      No hay acciones de control disponibles para tu acceso actual.
    </p>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
const props = defineProps({
  conversation: { type: Object, required: true },
  operators: { type: Array, default: () => [] },
  busy: Boolean,
  pending: { type: Object, default: null },
})
const emit = defineEmits(['control', 'retry', 'operators'])
const labels = {
  Human: 'Atención humana',
  Bot: 'Automatización activa',
  Paused: 'En pausa',
  Closed: 'Cerrada',
}
const actionLabels = {
  take: 'Tomar control',
  request: 'Solicitar control',
  transfer: 'Transferir',
  release: 'Liberar responsable',
  pause: 'Pausar',
  close: 'Cerrar',
  reopen: 'Reabrir',
}
const action = ref(''),
  owner = ref(''),
  reason = ref(''),
  query = ref('')
const actions = computed(() => props.conversation.allowed_actions || [])
const reasonRequired = computed(
  () =>
    props.conversation.manager_reason_required && action.value !== 'request',
)
watch(
  () => [props.conversation.name, props.conversation.generation],
  () => {
    action.value = ''
    owner.value = ''
    reason.value = ''
    query.value = ''
  },
)
function changed() {
  owner.value = ''
  if (action.value === 'transfer') emit('operators', '')
}
function submit() {
  if (action.value)
    emit('control', action.value, { owner: owner.value, reason: reason.value })
}
</script>
