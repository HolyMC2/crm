<!--
  One call: when it happened and who was on shift, the recording, what the
  analysis found (doco_marketing services/call_analysis.py), the transcript and
  notes with «Guardar y crear tarea». Data via doco_marketing.api.calls.
-->
<template>
  <!-- On body: inside the page it opened under the shell's bar and dock. -->
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[200] flex justify-end"
      @click.self="$emit('close')"
    >
      <div class="absolute inset-0 bg-black/20" @click="$emit('close')" />
      <div
        class="scb relative z-10 flex h-full w-full flex-col overflow-y-auto bg-surface-base shadow-2xl sm:w-[460px]"
        role="dialog"
        :aria-label="title"
      >
        <!-- header: what kind of call and when, in words -->
        <div
          class="flex flex-none items-start justify-between gap-3 border-b border-outline-gray-1 px-5 py-3"
        >
          <div class="min-w-0">
            <div class="text-lg font-semibold text-ink-gray-9">{{ title }}</div>
            <div class="num text-sm text-ink-gray-5">
              {{
                [callWhen(d.start_time), duration].filter(Boolean).join(' · ')
              }}
            </div>
          </div>
          <button
            type="button"
            class="press flex size-9 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
            :aria-label="__('Cerrar')"
            @click="$emit('close')"
          >
            <span class="lucide-x size-5" aria-hidden="true" />
          </button>
        </div>

        <div class="call-drawer-body flex-1 space-y-5 px-5 pt-4">
          <!-- facts -->
          <dl
            class="divide-y divide-outline-gray-1 rounded-8 border border-outline-gray-2"
          >
            <Fact :k="__('Número')" :v="phone" />
            <Fact :k="__('Fecha y hora')" :v="callWhen(d.start_time)" />
            <Fact
              :k="__('En turno')"
              :v="shiftNames || __('Nadie en el horario')"
            />
            <Fact :k="__('Estado')" :v="statusLabel(d.status, 'call') || '—'" />
          </dl>

          <!-- recording_url_path = authenticated proxy; the raw recording_url needs Twilio auth -->
          <section v-if="d.recording_url_path">
            <h3 class="mb-1.5 text-sm font-medium text-ink-gray-5">
              {{ __('Grabación') }}
            </h3>
            <audio :src="d.recording_url_path" controls class="w-full" />
          </section>

          <!-- analysis: why, what for, whether it worked, the mood -->
          <section v-if="analyzed" data-testid="call-analysis">
            <h3 class="mb-1.5 text-sm font-medium text-ink-gray-5">
              {{ __('Análisis') }}
            </h3>
            <dl
              class="divide-y divide-outline-gray-1 rounded-8 border border-outline-gray-2"
            >
              <Fact v-if="d.call_reason" :k="__('Motivo')" :v="d.call_reason" />
              <Fact v-if="d.call_goal" :k="__('Objetivo')" :v="d.call_goal" />
              <div v-if="goal" class="px-3 py-2">
                <div class="flex items-center justify-between gap-3">
                  <dt class="text-sm text-ink-gray-5">
                    {{ __('¿Se logró?') }}
                  </dt>
                  <dd><StatusChip :label="goal.label" :tone="goal.tone" /></dd>
                </div>
                <p v-if="d.goal_note" class="mt-1 text-sm text-ink-gray-7">
                  {{ d.goal_note }}
                </p>
              </div>
              <div
                v-if="mood"
                class="flex items-center justify-between gap-3 px-3 py-2"
              >
                <dt class="text-sm text-ink-gray-5">
                  {{ __('Ánimo del cliente') }}
                </dt>
                <dd><StatusChip :label="mood.label" :tone="mood.tone" /></dd>
              </div>
            </dl>
            <p
              v-if="d.ai_summary"
              class="mt-3 text-base leading-relaxed text-ink-gray-8"
            >
              {{ d.ai_summary }}
            </p>
          </section>

          <!-- the one action: transcribe and analyze, with why when it cannot -->
          <section>
            <button
              type="button"
              class="press flex h-10 w-full items-center justify-center gap-2 rounded-8 border border-outline-gray-2 text-base font-medium text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
              :disabled="!action.allowed || starting"
              data-testid="call-analyze"
              @click="analyze"
            >
              <span class="lucide-sparkles size-4" aria-hidden="true" />
              {{ action.label }}
            </button>
            <p
              v-if="message || action.hint"
              class="mt-1.5 text-sm"
              :class="
                d.analysis_status === 'error' || message
                  ? 'text-ink-red-7'
                  : 'text-ink-gray-5'
              "
              role="status"
            >
              {{ message || action.hint }}
            </p>
          </section>

          <!-- transcript: folded, it is long -->
          <section v-if="d.transcript">
            <button
              type="button"
              class="flex w-full items-center justify-between text-sm font-medium text-ink-gray-5"
              :aria-expanded="showTranscript"
              @click="showTranscript = !showTranscript"
            >
              {{ __('Transcripción') }}
              <span
                class="lucide-chevron-down size-4 transition-transform"
                :class="showTranscript ? 'rotate-180' : ''"
                aria-hidden="true"
              />
            </button>
            <div
              v-if="showTranscript"
              class="mt-1.5 whitespace-pre-wrap rounded-8 bg-surface-gray-1 p-3 text-sm leading-relaxed text-ink-gray-7"
            >
              {{ d.transcript }}
            </div>
          </section>

          <!-- notes -->
          <section>
            <h3 class="mb-1.5 text-sm font-medium text-ink-gray-5">
              {{ __('Notas') }}
            </h3>
            <textarea
              v-model="note"
              rows="3"
              :placeholder="__('Notas de la llamada…')"
              class="w-full resize-none rounded-8 border border-outline-gray-2 bg-surface-gray-2 p-3 text-base text-ink-gray-9 placeholder-ink-gray-4 focus:border-outline-gray-4 focus:bg-surface-base focus:outline-none focus:ring-0"
            />
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                class="rounded-6 border border-outline-gray-2 px-3 py-1.5 text-sm font-medium text-ink-gray-7"
                :disabled="saving"
                @click="saveNote"
              >
                {{ __('Guardar nota') }}
              </button>
              <button
                type="button"
                class="rounded-6 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style="background: var(--brand)"
                :disabled="saving"
                @click="saveAndTask"
              >
                {{ __('Guardar y crear tarea') }}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createResource, call as frappeCall, toast } from 'frappe-ui'
import { StatusChip } from '@/components/ui'
import { formatPhone } from '@/composables/crmFormat'
import { globalStore } from '@/stores/global'
import { statusLabel } from '@/utils/display'
import { GOAL, SENTIMENT, analysisAction, callWhen, onShift } from './calls'

const props = defineProps({
  name: { type: String, required: true },
  /** Shift windows from doco_marketing.api.calls.page_context. */
  shifts: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'changed'])

const detail = createResource({
  url: 'doco_marketing.api.calls.get_call_detail',
})
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
const title = computed(() =>
  d.value.type === 'Outgoing' ? __('Llamada saliente') : __('Llamada entrante'),
)
const duration = computed(() => {
  const s = Number(d.value.duration) || 0
  return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : ''
})
const phone = computed(() => {
  const number = d.value.type === 'Outgoing' ? d.value.to : d.value.from
  return number ? formatPhone(number) : '—'
})
const shiftNames = computed(() =>
  onShift(d.value.start_time, props.shifts).join(', '),
)
const goal = computed(() => GOAL[d.value.goal_met])
const mood = computed(() => SENTIMENT[d.value.tone])
const analyzed = computed(
  () =>
    !!(
      d.value.call_reason ||
      d.value.call_goal ||
      goal.value ||
      mood.value ||
      d.value.ai_summary
    ),
)
const action = computed(() => analysisAction(d.value))
const showTranscript = ref(false)

const saving = ref(false)
async function saveNote() {
  saving.value = true
  try {
    // note is a Link -> FCRM Note; save_call_note owns the note-doc round trip
    await frappeCall('doco_marketing.api.calls.save_call_note', {
      name: props.name,
      text: note.value,
    })
    toast.success(__('Nota guardada'))
    emit('changed')
  } finally {
    saving.value = false
  }
}
async function saveAndTask() {
  saving.value = true
  try {
    await frappeCall('doco_marketing.api.calls.save_call_note', {
      name: props.name,
      text: note.value,
    })
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

// «Transcribir y analizar» queues a background job; its realtime event (or
// reopening the call) brings the result. A refusal says why, in place.
const starting = ref(false)
const message = ref('')
async function analyze() {
  starting.value = true
  message.value = ''
  try {
    const answer = await frappeCall('doco_marketing.api.calls.analyze_call', {
      name: props.name,
    })
    if (answer?.ok === false) message.value = answer.message || ''
    else detail.submit({ name: props.name })
  } catch (e) {
    message.value =
      e?.messages?.[0] || __('No se pudo iniciar. Intenta de nuevo.')
  } finally {
    starting.value = false
  }
}
const { $socket } = globalStore()
function onAnalysis(event) {
  if (event?.name === props.name) detail.submit({ name: props.name })
}
onMounted(() => $socket?.on('doco_call_analysis', onAnalysis))
onBeforeUnmount(() => $socket?.off('doco_call_analysis', onAnalysis))

const Fact = (props) =>
  h('div', { class: 'flex items-baseline justify-between gap-3 px-3 py-2' }, [
    h('dt', { class: 'flex-none text-sm text-ink-gray-5' }, props.k),
    h(
      'dd',
      { class: 'min-w-0 text-right text-base text-ink-gray-8' },
      String(props.v),
    ),
  ])
Fact.props = ['k', 'v']
</script>
<style scoped>
.call-drawer-body {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
</style>
