<!--
  Intent → action chips (spec 5.3). Reads the conversation's inbound tail through
  doco_marketing.api.intent.detect_intent and surfaces AT MOST ONE one-tap chip
  above the composer: 💳 Cobrar / 🧾 Facturar / 🔧 Cotizar reparación / 🏷 Ver
  catálogo. The chip NEVER sends and NEVER runs a money action — pressing it emits
  an event the parent maps to an existing surface (catálogo picker, Documentos
  panel, repair tab) or a composer draft. Send always stays human.

  Prop-driven (doctype, name); fetches on mount and whenever the conversation
  changes. Renders nothing when AI is off site-wide (aiEnabled short-circuits the
  call), when there is no inbound text, or when confidence is below the render
  threshold (intentActions.chipForIntent). Assistive only — a failed call is
  swallowed to "no chip", never an error state. Label is plain text (no v-html).
-->
<template>
  <div v-if="chip" class="flex-none px-3 py-1.5">
    <button
      type="button"
      class="press inline-flex items-center gap-1.5 rounded-full border border-outline-blue-3 bg-surface-blue-1 px-3 py-1 text-[12px] font-semibold text-ink-blue-9 hover:bg-surface-blue-2"
      :title="label"
      :aria-label="label"
      @click="onTap"
    >
      <span aria-hidden="true">{{ chip.icon }}</span>{{ label }}
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { call } from 'frappe-ui'
import { aiEnabled } from '@/composables/inbox'
import { chipForIntent } from '@/utils/intentActions'

const props = defineProps({
  doctype: { type: String, default: 'CRM Deal' },
  name: { type: String, default: null },
})
// One per intent bucket; the parent wires each to an existing surface.
const emit = defineEmits(['cobrar', 'factura', 'taller', 'catalogo'])

const data = ref(null)
// Guards against a stale response landing after the operator has already switched
// conversations (only the newest request may write `data`).
let reqId = 0

const chip = computed(() => {
  const d = data.value
  if (!d) return null
  return chipForIntent(d.intent, d.confidence, d.label)
})
// Wrap in __() so the static es-MX defaults stay translatable; a dynamic backend
// label passes through unchanged.
const label = computed(() => (chip.value ? __(chip.value.label) : ''))

async function load() {
  data.value = null
  // Never call the endpoint on an AI-off tenant, and nothing to classify without a record.
  if (!aiEnabled.value || !props.name) return
  const myReq = ++reqId
  try {
    const out = await call('doco_marketing.api.intent.detect_intent', {
      doctype: props.doctype,
      name: props.name,
    })
    if (myReq !== reqId) return
    data.value = out || null
  } catch (e) {
    if (myReq !== reqId) return
    data.value = null // assistive: a failed detection simply shows no chip
  }
}

watch(() => [props.doctype, props.name, aiEnabled.value], load, { immediate: true })

function onTap() {
  if (chip.value) emit(chip.value.event)
}
</script>
