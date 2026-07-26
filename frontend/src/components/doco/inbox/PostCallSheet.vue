<!--
  Post-llamada (spec 4.4). A bottom sheet the inbox opens when a call the agent
  handled ends: it receives a `doco_marketing:call_ended` socket payload (the page
  wires the socket and calls `open(payload)` — see the mount patch in the S7
  report). The agent picks an outcome, optionally leaves a note and schedules a
  "call back tomorrow 9:00" follow-up, then Guardar/Omitir.

  Self-contained: emits nothing outside itself, drives its own open state, calls
  doco_marketing.api.postcall.log_outcome directly. Reuses the .sheet-in entrance
  (index.css) — bottom sheet on mobile, floating card bottom-right on desktop.

  The note is rendered nowhere here (it's sent to the server, which escapes it);
  everything shown is our own controlled label text.
-->
<template>
  <div v-if="visible">
    <!-- backdrop: tap to dismiss (same as Omitir) -->
    <div class="fixed inset-0 z-40 bg-black/40" @click="skip" />

    <div
      ref="sheetEl"
      role="dialog"
      aria-modal="true"
      :aria-label="__('Llamada terminada')"
      tabindex="-1"
      class="sheet-in fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col overflow-y-auto rounded-t-2xl bg-surface-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-[0_-8px_32px_rgba(0,0,0,.18)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px] sm:rounded-2xl sm:pb-4"
      @keydown.esc="skip"
    >
      <div class="mx-auto mb-2.5 h-1 w-10 flex-none rounded-full bg-surface-gray-4 sm:hidden" aria-hidden="true" />

      <!-- header -->
      <div class="mb-2 flex items-start justify-between gap-2">
        <div>
          <div class="text-[13.5px] font-semibold text-ink-gray-8">{{ __('Llamada terminada') }}</div>
          <div class="mt-0.5 text-[11.5px] text-ink-gray-5">
            {{ directionLabel }} · {{ duration }} · {{ counterpart }}
          </div>
        </div>
        <button
          type="button"
          class="press flex size-7 flex-none items-center justify-center rounded-lg text-ink-gray-5 hover:bg-surface-gray-2"
          :aria-label="__('Omitir')"
          @click="skip"
        >
          ✕
        </button>
      </div>

      <!-- outcome chips -->
      <div class="mb-1 text-[10.5px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('Resultado') }}</div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="o in outcomes"
          :key="o.value"
          type="button"
          :aria-pressed="outcome === o.value"
          class="press inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] font-medium"
          :class="
            outcome === o.value
              ? 'border-outline-blue-2 bg-surface-blue-2 text-ink-blue-3'
              : 'border-outline-gray-2 bg-surface-white text-ink-gray-7 hover:bg-surface-gray-2'
          "
          @click="outcome = o.value"
        >
          <span aria-hidden="true">{{ o.emoji }}</span>{{ __(o.label) }}
        </button>
      </div>

      <!-- note -->
      <label class="mt-3 block">
        <span class="text-[10.5px] font-medium text-ink-gray-5">{{ __('Nota') }} <span class="text-ink-gray-4">({{ __('opcional') }})</span></span>
        <textarea
          v-model="note"
          rows="2"
          class="mt-1 w-full resize-none rounded-lg border border-outline-gray-2 bg-surface-white px-2.5 py-1.5 text-[13px] text-ink-gray-8 placeholder:text-ink-gray-4 focus:border-outline-gray-3 focus:outline-none"
          :placeholder="__('¿Qué pasó en la llamada?')"
        />
      </label>

      <!-- follow-up task toggle -->
      <button
        type="button"
        class="press mt-2.5 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-[12.5px] font-medium"
        :class="
          createTask
            ? 'border-outline-blue-2 bg-surface-blue-2 text-ink-blue-3'
            : 'border-outline-gray-2 bg-surface-white text-ink-gray-7 hover:bg-surface-gray-2'
        "
        role="switch"
        :aria-checked="createTask"
        @click="createTask = !createTask"
      >
        <span>📅 {{ __('Crear tarea para mañana 9:00') }}</span>
        <span class="flex size-4 flex-none items-center justify-center">{{ createTask ? '✓' : '' }}</span>
      </button>

      <!-- actions -->
      <div class="mt-3.5 flex gap-2">
        <button
          type="button"
          class="press flex-1 rounded-xl border border-outline-gray-2 bg-surface-white py-2 text-[13px] font-semibold text-ink-gray-6 hover:bg-surface-gray-2"
          @click="skip"
        >
          {{ __('Omitir') }}
        </button>
        <button
          type="button"
          class="press flex-1 rounded-xl bg-surface-gray-7 py-2 text-[13px] font-semibold text-ink-white disabled:opacity-40"
          :disabled="!outcome || saving"
          @click="save"
        >
          {{ saving ? __('Guardando…') : __('Guardar') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { call, toast } from 'frappe-ui'
import { OUTCOMES, tomorrow9Epoch, formatCallDuration } from '@/utils/postcallOutcome'

const outcomes = OUTCOMES

const visible = ref(false)
const payload = ref(null)
const sheetEl = ref(null)
let _restoreFocus = null
const outcome = ref('')
const note = ref('')
const createTask = ref(false)
const saving = ref(false)

const directionLabel = computed(() =>
  payload.value?.direction === 'Incoming' ? __('Entrante') : __('Saliente'),
)
const duration = computed(() => formatCallDuration(payload.value?.duration))
// Show the customer's number: the far end of the call (to on outgoing, from on incoming).
const counterpart = computed(() => {
  const p = payload.value
  if (!p) return ''
  return (p.direction === 'Incoming' ? p.from : p.to) || ''
})

// Called by the inbox page's `doco_marketing:call_ended` socket handler.
function open(callPayload) {
  if (!callPayload?.call_log) return
  payload.value = callPayload
  outcome.value = ''
  note.value = ''
  createTask.value = false
  saving.value = false
  visible.value = true
  _restoreFocus = document.activeElement
  nextTick(() => sheetEl.value?.focus())
}

function close() {
  visible.value = false
  payload.value = null
  _restoreFocus?.focus?.()
  _restoreFocus = null
}

function skip() {
  close()
}

async function save() {
  if (!outcome.value || saving.value || !payload.value) return
  saving.value = true
  try {
    await call('doco_marketing.api.postcall.log_outcome', {
      call: payload.value.call_log,
      outcome: outcome.value,
      note: note.value || undefined,
      create_task: createTask.value ? 1 : 0,
      task_due_epoch: createTask.value ? tomorrow9Epoch() : undefined,
    })
    toast.success(createTask.value ? __('Guardado — tarea creada') : __('Guardado'))
    close()
  } catch (e) {
    toast.error(e.messages?.[0] || __('No se pudo guardar'))
  } finally {
    saving.value = false
  }
}

defineExpose({ open })
</script>
