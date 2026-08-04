<!--
  Call detail drawer — FCRM redesign (handoff §5.10). Recording + AI summary +
  transcript + notes + "Save & create task". Data via doco_marketing.api.calls.
-->
<template>
  <div class="fixed inset-0 z-[200] flex justify-end" @click.self="$emit('close')">
    <div class="absolute inset-0 bg-black/20" @click="$emit('close')" />
    <div class="scb relative z-10 flex h-full w-[460px] flex-col overflow-y-auto bg-surface-base shadow-2xl">
      <!-- header -->
      <div class="flex flex-none items-center justify-between border-b border-outline-gray-1 px-5 py-3">
        <div class="min-w-0">
          <div class="text-[14px] font-bold text-ink-gray-9">{{ __('Detalle de llamada') }}</div>
          <div class="text-[12px] text-ink-gray-5">{{ dirLabel }} · {{ fmtDur(d.duration) }}</div>
        </div>
        <button class="text-[18px] text-ink-gray-5 hover:text-ink-gray-9" :aria-label="__('Cerrar')" @click="$emit('close')">×</button>
      </div>

      <div class="flex-1 px-5 py-4">
        <!-- outcome + quality -->
        <div class="mb-4 flex items-center gap-3">
          <span class="rounded-md px-2 py-[3px] text-[11.5px] font-semibold" :class="outcomeChip(d.status)">{{ d.status || '—' }}</span>
          <div v-if="d.call_quality_score != null" class="ml-auto flex items-center gap-2">
            <div class="relative h-10 w-10">
              <svg viewBox="0 0 40 40" width="40" height="40" style="transform: rotate(-90deg)">
                <circle cx="20" cy="20" r="16" fill="none" style="stroke: var(--outline-gray-2)" stroke-width="4" />
                <circle cx="20" cy="20" r="16" fill="none" stroke="var(--brand)" stroke-width="4" stroke-linecap="round" stroke-dasharray="100.5" :stroke-dashoffset="qualityOffset" />
              </svg>
              <div class="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-ink-gray-9">{{ d.call_quality_score }}</div>
            </div>
            <span class="text-[11px] text-ink-gray-5">{{ __('Calidad') }}</span>
          </div>
        </div>

        <!-- recording -->
        <!-- recording_url_path = authenticated proxy; the raw recording_url needs Twilio auth -->
        <div v-if="d.recording_url_path" class="mb-4">
          <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-[.07em] text-ink-gray-4">{{ __('Grabación') }}</div>
          <audio :src="d.recording_url_path" controls class="w-full" />
        </div>

        <!-- AI summary -->
        <div v-if="d.ai_summary" class="mb-4 rounded-[10px] border-l-[3px] bg-surface-green-2 p-3" style="border-color: var(--outline-green-4)">
          <div class="mb-1 text-[11px] font-semibold uppercase tracking-[.07em] text-ink-green-7">{{ __('Resumen IA') }}</div>
          <div class="text-[12.5px] leading-relaxed text-ink-gray-8">{{ d.ai_summary }}</div>
        </div>
        <button
          v-else
          class="mb-4 rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-medium text-ink-gray-7 disabled:opacity-50"
          :disabled="transcribing || !d.transcript"
          @click="transcribe"
        >
          {{ d.transcript ? __('Generar resumen IA') : __('Sin transcripción aún') }}
        </button>

        <!-- transcript -->
        <div v-if="d.transcript" class="mb-4">
          <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-[.07em] text-ink-gray-4">{{ __('Transcripción') }}</div>
          <div class="whitespace-pre-wrap rounded-[10px] bg-surface-gray-1 p-3 text-[12px] leading-relaxed text-ink-gray-7">{{ d.transcript }}</div>
        </div>

        <!-- detail rows -->
        <div v-if="d.tone || d.talk_ratio || d.next_step_set" class="mb-4 rounded-[10px] border border-outline-gray-2">
          <Row v-if="d.tone" :k="__('Tono')" :v="d.tone" />
          <Row v-if="d.talk_ratio" :k="__('Ratio de habla')" :v="d.talk_ratio" />
          <Row v-if="d.next_step_set" :k="__('Próximo paso')" :v="d.next_step_set" />
        </div>

        <!-- notes -->
        <div class="mb-1.5 text-[11px] font-semibold uppercase tracking-[.07em] text-ink-gray-4">{{ __('Notas') }}</div>
        <textarea
          v-model="note"
          rows="3"
          :placeholder="__('Notas de la llamada…')"
          class="w-full resize-none rounded-[10px] border border-outline-gray-2 bg-surface-gray-2 p-3 text-[12.5px] text-ink-gray-9 placeholder-ink-gray-4 focus:border-outline-gray-4 focus:bg-surface-base focus:outline-none focus:ring-0"
        />
        <div class="mt-2 flex gap-2">
          <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-medium text-ink-gray-7" :disabled="saving" @click="saveNote">
            {{ __('Guardar nota') }}
          </button>
          <button class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" style="background: var(--brand)" :disabled="saving" @click="saveAndTask">
            {{ __('Guardar y crear tarea') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, ref, watch } from 'vue'
import { createResource, call as frappeCall, toast } from 'frappe-ui'

const props = defineProps({ name: { type: String, required: true } })
const emit = defineEmits(['close', 'changed'])

const detail = createResource({ url: 'doco_marketing.api.calls.get_call_detail' })
const note = ref('')
watch(
  () => props.name,
  (n) => {
    if (!n) return
    detail.submit({ name: n }).then(() => {
      note.value = detail.data?.note || ''
    })
  },
  { immediate: true },
)
const d = computed(() => detail.data || {})
const dirLabel = computed(() => (d.value.type === 'Outgoing' ? __('Saliente') : __('Entrante')))
const qualityOffset = computed(() => (100.5 * (100 - (Number(d.value.call_quality_score) || 0))) / 100)

function fmtDur(s) {
  s = Number(s) || 0
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
function outcomeChip(status) {
  if (status === 'Completed') return 'text-ink-green-8 bg-surface-green-2'
  if (['No Answer', 'Missed', 'Busy', 'Failed', 'Canceled'].includes(status)) return 'text-ink-red-7 bg-surface-red-1'
  return 'text-ink-gray-6 bg-surface-gray-2'
}

const saving = ref(false)
async function saveNote() {
  saving.value = true
  try {
    // note is a Link -> FCRM Note; save_call_note owns the note-doc round trip
    await frappeCall('doco_marketing.api.calls.save_call_note', { name: props.name, text: note.value })
    toast.success(__('Nota guardada'))
    emit('changed')
  } finally {
    saving.value = false
  }
}
async function saveAndTask() {
  saving.value = true
  try {
    await frappeCall('doco_marketing.api.calls.save_call_note', { name: props.name, text: note.value })
    const taskDoc = {
      doctype: 'CRM Task',
      title: __('Seguimiento de llamada'),
      status: 'Todo',
      description: note.value,
    }
    if (d.value.reference_doctype === 'CRM Deal' && d.value.reference_docname) {
      taskDoc.reference_doctype = 'CRM Deal'
      taskDoc.reference_docname = d.value.reference_docname
    }
    await frappeCall('frappe.client.insert', { doc: taskDoc })
    toast.success(__('Nota guardada + tarea creada'))
    emit('changed')
    emit('close')
  } catch (e) {
    toast.error(e?.messages?.[0] || __('Error'))
  } finally {
    saving.value = false
  }
}

const transcribing = ref(false)
async function transcribe() {
  transcribing.value = true
  try {
    await frappeCall('doco_marketing.api.calls.enqueue_transcription', { name: props.name })
    toast.success(__('Resumen en proceso…'))
  } finally {
    transcribing.value = false
  }
}

const Row = (props) =>
  h('div', { class: 'flex justify-between border-b border-outline-gray-1 px-3 py-2 text-[12.5px] last:border-0' }, [
    h('span', { class: 'text-ink-gray-5' }, props.k),
    h('span', { class: 'font-medium text-ink-gray-8' }, String(props.v)),
  ])
Row.props = ['k', 'v']
</script>
