<template>
  <section
    class="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2 border-b border-outline-gray-1 px-3 py-2 text-xs [overflow-wrap:anywhere]"
    aria-label="Etiquetas, posponer y macros"
  >
    <p v-if="error" role="alert" class="w-full">{{ error }}</p>
    <p v-if="notice" role="status" class="w-full">{{ notice }}</p>
    <div class="flex min-w-0 flex-wrap items-center gap-1">
      <span class="font-medium">Etiquetas</span>
      <span
        v-for="item in current"
        :key="item"
        class="inline-flex items-center gap-1 rounded-4 border border-outline-gray-2 px-1.5 py-0.5"
      >
        {{ item }}
        <button
          type="button"
          class="leading-none"
          :aria-label="`Quitar etiqueta ${item}`"
          :disabled="busy || blocked"
          @click="saveLabels(current.filter((v) => v !== item))"
        >
          ×
        </button>
      </span>
      <select
        v-if="available.length"
        class="rounded-4 border border-outline-gray-2 bg-surface-base p-1"
        :disabled="busy || blocked"
        aria-label="Añadir etiqueta"
        @change="addLabel"
      >
        <option value="">Añadir…</option>
        <option v-for="item in available" :key="item.name" :value="item.name">
          {{ item.name }}
        </option>
      </select>
      <span v-else-if="!labels.length" class="text-ink-gray-5"
        >Un gerente crea las etiquetas en «Etiqueta de conversación».</span
      >
    </div>
    <div v-if="canSteer" class="flex min-w-0 flex-wrap items-center gap-1">
      <template v-if="conversation.snoozed_until">
        <span>Pospuesta hasta {{ when(conversation.snoozed_until) }}</span>
        <button
          type="button"
          class="underline"
          :disabled="busy || blocked"
          @click="unsnooze"
        >
          Reanudar ahora
        </button>
      </template>
      <template v-else-if="conversation.control_state !== 'Closed'">
        <label class="font-medium" :for="`${id}-snooze`">Posponer</label>
        <select
          :id="`${id}-snooze`"
          class="rounded-4 border border-outline-gray-2 bg-surface-base p-1"
          :disabled="busy || blocked"
          @change="snooze"
        >
          <option value="">Elegir…</option>
          <option value="1h">1 hora</option>
          <option value="3h">3 horas</option>
          <option value="tomorrow">Mañana al abrir</option>
          <option value="next_week">El lunes al abrir</option>
        </select>
      </template>
    </div>
    <div
      v-if="canSteer && macros.length"
      class="flex min-w-0 flex-wrap items-center gap-1"
    >
      <label class="font-medium" :for="`${id}-macro`">Macro</label>
      <select
        :id="`${id}-macro`"
        v-model="chosen"
        class="rounded-4 border border-outline-gray-2 bg-surface-base p-1"
        :disabled="busy || blocked"
      >
        <option value="">Elegir…</option>
        <option v-for="item in macros" :key="item.name" :value="item.name">
          {{ item.title }}
        </option>
      </select>
      <button
        v-if="macro"
        type="button"
        class="rounded-4 bg-surface-gray-10 px-2 py-1 text-ink-base"
        :disabled="busy || blocked"
        @click="runMacro"
      >
        Aplicar
      </button>
      <p v-if="macro" class="w-full text-ink-gray-5">
        {{ macro.steps.map(describe).join(' → ') }}
      </p>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch, useId } from 'vue'
import { call } from 'frappe-ui'
import { formatDateTime } from '@/utils/display'

const API = 'crm.api.inbox.'
const props = defineProps({
  conversation: { type: Object, required: true },
  actor: { type: String, required: true },
  labels: { type: Array, default: () => [] },
  macros: { type: Array, default: () => [] },
  blocked: Boolean,
})
const emit = defineEmits(['refresh', 'pending'])
const id = useId()
const busy = ref(false),
  error = ref(''),
  notice = ref(''),
  chosen = ref('')
let epoch = 0
const current = computed(() => props.conversation.labels || [])
const available = computed(() =>
  props.labels.filter((l) => !current.value.includes(l.name)),
)
// The broker's rule (crm.inbox.can_steer): the owner, anyone on an unowned
// conversation, or a manager. The server decides; this only hides dead ends.
const canSteer = computed(() => {
  const doc = props.conversation
  return (
    doc.human_owner === props.actor ||
    (['Human', 'Paused'].includes(doc.control_state) && !doc.human_owner) ||
    !!doc.manager_reason_required
  )
})
const macro = computed(() => props.macros.find((m) => m.name === chosen.value))
const when = (value) => formatDateTime(value)
const STEP = {
  'Send reply': (v) => `responder «${v}»`,
  'Add label': (v) => `etiquetar ${v}`,
  'Remove label': (v) => `quitar ${v}`,
  'Add private note': () => 'nota interna',
  'Send to team': (v) => (v ? `enviar a ${v}` : 'quitar equipo'),
  Snooze: (v) => `posponer ${v} h`,
  Close: () => 'cerrar',
}
const describe = (step) =>
  (STEP[step.action] || (() => step.action))(step.value)
watch(
  () => props.conversation.name,
  () => {
    epoch++
    busy.value = false
    error.value = ''
    notice.value = ''
    chosen.value = ''
  },
)
watch(busy, (value) => emit('pending', value))
// The server explains a refusal (which step, which label); show its words.
const message = (e, fallback) =>
  e?.messages?.length ? String(e.messages[0]).replace(/<[^>]+>/g, '') : fallback
async function run(method, args, done, fallback) {
  if (busy.value || props.blocked) return
  const stamp = epoch
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await call(API + method, {
      name: props.conversation.name,
      command_id: crypto.randomUUID(),
      ...args,
    })
    if (stamp !== epoch) return
    notice.value = done
    emit('refresh')
  } catch (e) {
    if (stamp === epoch) error.value = message(e, fallback)
  } finally {
    if (stamp === epoch) busy.value = false
  }
}
function saveLabels(list) {
  return run(
    'set_labels',
    { labels: JSON.stringify(list) },
    'Etiquetas guardadas.',
    'No se guardaron las etiquetas. Actualiza la conversación e inténtalo de nuevo.',
  )
}
function addLabel(event) {
  const value = event.target.value
  event.target.value = ''
  if (value) saveLabels([...current.value, value])
}
function snooze(event) {
  const preset = event.target.value
  event.target.value = ''
  if (!preset) return
  run(
    'snooze_conversation',
    { preset },
    'Pospuesta. Vuelve a tu lista a la hora elegida o cuando el cliente escriba.',
    'No se pudo posponer. Actualiza la conversación e inténtalo de nuevo.',
  )
}
function unsnooze() {
  run(
    'unsnooze_conversation',
    {},
    'La conversación volvió a tu lista.',
    'No se pudo reanudar. Actualiza la conversación e inténtalo de nuevo.',
  )
}
async function runMacro() {
  if (!macro.value) return
  await run(
    'run_macro',
    {
      macro: macro.value.name,
      expected_generation: props.conversation.generation,
    },
    `Macro «${macro.value.title}» aplicada.`,
    'La macro no se aplicó. Ningún paso quedó a medias; revisa la conversación e inténtalo de nuevo.',
  )
  chosen.value = ''
}
</script>
