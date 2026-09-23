<!--
  «Próximo paso» cell: what this deal owes the customer next, and the one place a
  rep can date it without leaving the list.

  Scheduling a follow-up used to require opening the deal, which is why deals
  rarely carried one. So the cell is a button — it shows the next activity (or
  «Sin seguimiento») and opens a compact popover that creates or reschedules the
  canonical CRM Task through
  utils/followUpService, the same endpoints Deal 360 writes with. `next_activity_*`
  is derived from that task by the crm/pipeline hooks, never written here; the
  saved event carries what the hooks left so the row updates without a reload.

  The panel is teleported and positioned from the trigger's rect: inside the
  table's scroller an absolutely positioned panel would be clipped.
-->
<template>
  <div class="min-w-0">
    <button
      ref="trigger"
      type="button"
      class="flex w-full min-w-0 items-center rounded-md px-1 py-1 text-left hover:bg-surface-gray-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-3"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :aria-label="triggerLabel"
      @click.stop="toggle"
      @keydown.enter.stop
      @keydown.space.stop
    >
      <NextActivityChip
        :at="row.next_activity_at || ''"
        :title="row.next_activity_title || ''"
        :type="row.next_activity_type || ''"
        :empty-label="
          row.next_activity_task
            ? __('Pendiente sin fecha')
            : __('Sin seguimiento')
        "
      />
    </button>

    <Teleport to="body">
      <template v-if="open">
        <div class="fixed inset-0 z-[300]" @click="close" />
        <div
          ref="panel"
          role="dialog"
          :aria-label="__('Próximo paso')"
          class="fixed z-[310] w-[300px] rounded-xl border border-outline-gray-2 bg-surface-base p-3 text-ink-gray-8 shadow-2xl"
          :style="panelStyle"
          @click.stop
          @keydown.esc.stop.prevent="close"
        >
          <div class="mb-2 flex items-center justify-between gap-2">
            <h2
              class="text-[12px] font-semibold uppercase tracking-[.06em] text-ink-gray-5"
            >
              {{
                row.next_activity_task
                  ? __('Reprogramar seguimiento')
                  : __('Programar seguimiento')
              }}
            </h2>
            <button
              type="button"
              class="text-[13px] leading-none text-ink-gray-5"
              :aria-label="__('Cerrar')"
              @click="close"
            >
              ✕
            </button>
          </div>

          <label
            class="block text-[11px] font-medium text-ink-gray-6"
            :for="`fu-title-${uid}`"
            >{{ __('Qué sigue') }}</label
          >
          <input
            :id="`fu-title-${uid}`"
            ref="titleInput"
            v-model="draft.title"
            type="text"
            class="mb-2 mt-1 h-8 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-2 text-[13px] text-ink-gray-9 placeholder:text-ink-gray-4 focus:border-outline-gray-4 focus:ring-0"
            :placeholder="__('Ej. Confirmar entrega')"
            @keydown.enter.prevent="submit"
          />

          <div class="flex gap-2">
            <div class="min-w-0 flex-1">
              <label
                class="block text-[11px] font-medium text-ink-gray-6"
                :for="`fu-date-${uid}`"
                >{{ __('Fecha') }}</label
              >
              <input
                :id="`fu-date-${uid}`"
                v-model="draft.date"
                type="date"
                class="mt-1 h-8 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-2 text-[13px] text-ink-gray-9 focus:border-outline-gray-4 focus:ring-0 dark:[color-scheme:dark]"
              />
            </div>
            <div class="w-[104px] flex-none">
              <label
                class="block text-[11px] font-medium text-ink-gray-6"
                :for="`fu-time-${uid}`"
                >{{ __('Hora (opcional)') }}</label
              >
              <input
                :id="`fu-time-${uid}`"
                v-model="draft.time"
                type="time"
                class="mt-1 h-8 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-2 text-[13px] text-ink-gray-9 focus:border-outline-gray-4 focus:ring-0 dark:[color-scheme:dark]"
              />
            </div>
          </div>

          <div class="mt-2 flex flex-wrap gap-1">
            <button
              v-for="s in shortcuts"
              :key="s.days"
              type="button"
              class="rounded-full border px-2 py-[3px] text-[11px] font-medium"
              :class="
                draft.date === s.date
                  ? 'border-outline-green-3 bg-surface-green-2 text-ink-green-8'
                  : 'border-outline-gray-2 text-ink-gray-6 hover:bg-surface-gray-2'
              "
              :aria-pressed="draft.date === s.date"
              @click="draft.date = s.date"
            >
              {{ s.label }}
            </button>
          </div>

          <div class="mt-2" role="group" :aria-label="__('Tipo de actividad')">
            <span class="block text-[11px] font-medium text-ink-gray-6">{{
              __('Tipo')
            }}</span>
            <div class="mt-1 flex flex-wrap gap-1">
              <button
                v-for="t in activityTypes"
                :key="t.value"
                type="button"
                class="rounded-md border px-2 py-[3px] text-[11px] font-medium"
                :class="
                  draft.type === t.value
                    ? 'border-outline-gray-4 bg-surface-gray-3 text-ink-gray-9'
                    : 'border-outline-gray-2 text-ink-gray-6 hover:bg-surface-gray-2'
                "
                :aria-pressed="draft.type === t.value"
                @click="draft.type = t.value"
              >
                {{ __(t.label) }}
              </button>
            </div>
          </div>

          <p
            v-if="error"
            role="alert"
            class="mt-2 text-[11.5px] text-ink-red-8"
          >
            {{ error }}
          </p>

          <div class="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              class="rounded-lg px-2.5 py-1.5 text-[12px] text-ink-gray-6 hover:bg-surface-gray-2"
              @click="close"
            >
              {{ __('Cancelar') }}
            </button>
            <button
              type="button"
              class="rounded-lg bg-surface-gray-7 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
              :disabled="saving"
              @click="submit"
            >
              {{ saving ? __('Guardando…') : __('Guardar') }}
            </button>
          </div>
        </div>
      </template>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId } from 'vue'
import { toast } from 'frappe-ui'
import NextActivityChip from '@/components/doco/NextActivityChip.vue'
import {
  FOLLOW_UP_ACTIVITY_TYPES,
  addDays,
  followUpDraftError,
  followUpParts,
} from '@/utils/dealFollowUp'
import { saveFollowUp } from '@/utils/followUpService'

const props = defineProps({
  // needs: name, deal_owner and the denormalised next_activity_* fields
  row: { type: Object, required: true },
  // today in the SITE's timezone — the list resolves it, the cell never asks the browser
  today: { type: String, default: '' },
})
const emit = defineEmits(['saved'])

const PANEL_W = 300
const PANEL_H = 330
// every row renders one of these: the label/input pairs need ids of their own
const uid = useId()
const activityTypes = FOLLOW_UP_ACTIVITY_TYPES

const open = ref(false)
const saving = ref(false)
const error = ref('')
const trigger = ref(null)
const titleInput = ref(null)
const panelStyle = ref('')
const draft = reactive({ title: '', date: '', time: '', type: 'Task' })

const triggerLabel = computed(() =>
  props.row.next_activity_task
    ? __('Reprogramar seguimiento de {0}', [label.value])
    : __('Programar seguimiento de {0}', [label.value]),
)
const label = computed(
  () =>
    props.row.deal_name ||
    props.row.organization ||
    props.row.lead_name ||
    props.row.name,
)

const shortcuts = computed(() =>
  [
    { days: 0, label: __('Hoy') },
    { days: 1, label: __('Mañana') },
    { days: 3, label: __('En 3 d') },
    { days: 7, label: __('En 7 d') },
  ]
    .map((s) => ({ ...s, date: addDays(props.today, s.days) }))
    .filter((s) => s.date),
)

function position() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_W - 8))
  const below = rect.bottom + 6
  const top =
    below + PANEL_H > window.innerHeight
      ? Math.max(8, rect.top - PANEL_H - 6)
      : below
  panelStyle.value = `top:${Math.round(top)}px;left:${Math.round(left)}px`
}

function toggle() {
  if (open.value) close()
  else show()
}

function show() {
  const parts = followUpParts(props.row.next_activity_at)
  draft.title = props.row.next_activity_title || __('Seguimiento')
  draft.date = parts.date || props.today || ''
  draft.time = parts.time
  draft.type = props.row.next_activity_type || 'Task'
  error.value = ''
  open.value = true
  position()
  window.addEventListener('scroll', position, true)
  window.addEventListener('resize', position)
  nextTick(() => titleInput.value?.focus())
}

function close() {
  if (!open.value) return
  open.value = false
  window.removeEventListener('scroll', position, true)
  window.removeEventListener('resize', position)
  trigger.value?.focus()
}

const ERRORS = {
  title: 'Escribe qué sigue con este trato.',
  date: 'Elige la fecha del seguimiento.',
  time: 'La hora no es válida.',
}

async function submit() {
  if (saving.value) return
  const broken = followUpDraftError(draft)
  if (broken) {
    error.value = __(ERRORS[broken])
    return
  }
  saving.value = true
  error.value = ''
  try {
    const activity = await saveFollowUp({
      deal: props.row.name,
      task: props.row.next_activity_task || '',
      owner: props.row.deal_owner || '',
      title: draft.title,
      date: draft.date,
      time: draft.time,
      type: draft.type,
    })
    emit('saved', activity)
    toast.success(__('Seguimiento programado'))
    close()
  } catch (e) {
    error.value =
      e?.messages?.[0] ||
      __(
        'No se pudo guardar el seguimiento. Revisa tu permiso sobre la tarea y reintenta.',
      )
  } finally {
    saving.value = false
  }
}

onBeforeUnmount(() => {
  window.removeEventListener('scroll', position, true)
  window.removeEventListener('resize', position)
})
</script>
