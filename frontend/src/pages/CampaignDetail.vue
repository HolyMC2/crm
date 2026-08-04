<!--
  Campaign detail + EDITOR (handoff §5.6) — fully configurable from the SPA:
  settings (type/trigger/audience), a step builder (trigger→wait→send→branch→end),
  enroll, activate/pause. Saves via doco_marketing.api.campaigns.save_campaign.
-->
<template>
  <div class="scb flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-base">
    <!-- header -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 px-5">
      <div class="flex min-w-0 items-center gap-2">
        <button class="text-[13px] text-ink-gray-5 hover:text-ink-gray-9" @click="$router.push('/campaigns')">← {{ __('Campañas') }}</button>
        <span class="text-ink-gray-4">/</span>
        <input v-model="form.title" class="min-w-0 border-0 bg-transparent text-[15px] font-bold text-ink-gray-9 focus:outline-none focus:ring-0" :placeholder="__('Nombre de la campaña')" />
        <span class="rounded-md px-2 py-[3px] text-[11px] font-semibold" :class="statusChip(form.status)">{{ form.status }}</span>
        <span v-if="isCadence" class="flex-none rounded-md bg-surface-violet-1 px-2 py-[3px] text-[11px] font-semibold text-ink-violet-1">{{ __('Cadencia 1:1') }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button v-if="dirty || saving" class="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50" style="background: var(--brand)" :disabled="saving" @click="save">
          {{ saving ? __('Guardando…') : __('Guardar') }}
        </button>
        <button v-if="form.status === 'Active'" class="rounded-lg border border-outline-amber-3 bg-surface-amber-1 px-3 py-1.5 text-[12.5px] font-semibold text-ink-amber-6" @click="changeStatus('Paused')">⏸ {{ __('Pausar') }}</button>
        <button v-else-if="form.status === 'Paused'" class="rounded-lg border border-outline-green-3 bg-surface-green-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-green-6" @click="changeStatus('Active')">▶ {{ __('Reanudar') }}</button>
        <button v-else-if="form.status === 'Draft'" class="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white" style="background: var(--brand)" @click="activate">▶ {{ __('Activar') }}</button>
      </div>
    </div>

    <!-- settings -->
    <div class="flex flex-none flex-wrap items-end gap-4 border-b border-outline-gray-1 px-5 py-3">
      <Field :label="__('Tipo')">
        <select v-model="form.type" class="dm-input"><option v-for="t in TYPES" :key="t" :value="t">{{ typeLabel(t) }}</option></select>
      </Field>

      <!-- Cadencia 1:1 toggle — flips is_cadence. Locked once deals are enrolled
           (client guard only; the server does NOT enforce it — see S19 report). -->
      <Field :label="__('Flujo')">
        <label
          class="flex h-[29px] cursor-pointer items-center gap-1.5 text-[12px] font-medium"
          :class="cadenceLocked ? 'cursor-not-allowed text-ink-gray-4' : 'text-ink-gray-7'"
          :title="cadenceLocked ? __('No se puede cambiar: la campaña ya tiene inscritos.') : ''"
        >
          <input type="checkbox" v-model="isCadence" :disabled="cadenceLocked" style="accent-color: var(--brand)" />
          {{ __('Cadencia 1:1') }}
        </label>
      </Field>

      <template v-if="!isCadence">
        <Field :label="__('Disparador')">
          <select v-model="form.enrollment_trigger" class="dm-input">
            <option value="manual">{{ __('Manual') }}</option>
            <option value="lead_created">{{ __('Lead creado') }}</option>
            <option value="stage_entered">{{ __('Entra a etapa') }}</option>
            <option value="score_threshold">{{ __('Umbral de score') }}</option>
          </select>
        </Field>
        <Field v-if="form.enrollment_trigger === 'stage_entered'" :label="__('Etapa')">
          <select v-model="form.trigger_value" class="dm-input"><option value="">—</option><option v-for="s in dealStatuses.data || []" :key="s.name" :value="s.name">{{ s.name }}</option></select>
        </Field>
        <Field v-else-if="form.enrollment_trigger === 'score_threshold'" :label="__('Score ≥')">
          <input v-model="form.trigger_value" type="number" class="dm-input w-20" placeholder="60" />
        </Field>
        <Field :label="__('Audiencia')">
          <select v-model="form.audience" class="dm-input"><option value="">—</option><option v-for="a in audiences.data || []" :key="a.name" :value="a.name">{{ a.title || a.name }}</option></select>
        </Field>
        <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-medium text-ink-gray-7 disabled:opacity-50" :disabled="!form.audience || enrolling" @click="doEnroll">
          {{ enrolling ? __('Inscribiendo…') : '+ ' + __('Inscribir audiencia') }}
        </button>
      </template>

      <!-- cadences enroll 1:1 from the deal header, never from an audience here -->
      <div v-else class="flex h-[29px] items-center text-[11.5px] text-ink-gray-5">
        {{ __('Las cadencias se inician 1:1 desde el encabezado del trato.') }}
      </div>
    </div>

    <!-- metrics -->
    <div class="flex flex-none gap-6 border-b border-outline-gray-1 px-5 py-3">
      <Metric :label="__('Inscritos')" :value="c.enrolled_count || 0" />
      <Metric :label="__('Enviados')" :value="metrics.sent_count || 0" />
      <Metric :label="__('Apertura')" :value="`${metrics.open_rate || 0}%`" color="var(--brand)" />
      <Metric :label="__('Clics')" :value="`${metrics.click_rate || 0}%`" color="#2f6fed" />
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- step builder (shared editor — NEXT_BETS #3) -->
      <div class="scb min-h-0 flex-1 overflow-y-auto border-r border-outline-gray-1 p-5">
        <StepCardList
          v-model="form.steps"
          kind="campaign"
          :frozen="form.status === 'Active'"
          :frozen-hint="__('Los pasos están congelados mientras la campaña está Activa — pausa para editarlos (las inscripciones en curso siguen la posición de cada paso).')"
        />
      </div>

      <!-- enrolled -->
      <div class="scb min-h-0 w-[380px] flex-none overflow-y-auto p-5">
        <div class="mb-3 flex items-center justify-between">
          <div class="text-[13px] font-bold text-ink-gray-9">{{ __('Inscritos') }}</div>
          <span class="text-[12px] text-ink-gray-5">{{ enrolled.length }}</span>
        </div>
        <div v-if="!enrolled.length" class="py-6 text-center text-xs text-ink-gray-4">{{ __('Nadie inscrito') }}</div>
        <div v-for="e in enrolled" :key="e.name" class="mb-1.5 flex items-center gap-2.5 rounded-[10px] border border-outline-gray-2 px-3 py-2.5">
          <span class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[10px] font-semibold" :style="`background:${avatarColor(who(e))[0]};color:${avatarColor(who(e))[1]}`">{{ initials(who(e)) }}</span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-[12.5px] font-semibold text-ink-gray-9">{{ who(e) }}</div>
            <div class="text-[11px] text-ink-gray-4">{{ __('Paso') }} {{ (e.current_step ?? 0) + 1 }} · {{ e.last_sent_at ? timeAgo(e.last_sent_at) : '—' }}</div>
          </div>
          <span class="flex-none rounded px-2 py-[2px] text-[10.5px] font-semibold" :class="enrStatusChip(e.status)">{{ e.status }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, ref, watch } from 'vue'
import { createResource, createListResource, call as frappeCall, toast } from 'frappe-ui'
import { avatarColor, initials, timeAgo } from '@/composables/crmFormat'
import StepCardList from '@/components/doco/flows/StepCardList.vue'
import { cadenceToggleLocked } from '@/utils/cadenceScaffold'

const props = defineProps({ campaignId: { type: String, required: true } })
const TYPES = ['whatsapp', 'email', 'sms', 'automation']

const campaign = createResource({ url: 'doco_marketing.api.campaigns.get_campaign' })
const enroll = createResource({ url: 'doco_marketing.api.campaigns.get_enrollments' })
const audiences = createListResource({ doctype: 'Marketing Audience', fields: ['name', 'title'], pageLength: 100, auto: true })
const dealStatuses = createListResource({ doctype: 'CRM Deal Status', fields: ['name'], orderBy: 'position asc', pageLength: 50, auto: true })

const form = ref({ title: '', type: 'automation', status: 'Draft', enrollment_trigger: 'manual', trigger_value: '', audience: '', is_cadence: 0, steps: [] })
let loaded = '' // JSON snapshot to detect dirty
const dirty = computed(() => JSON.stringify(form.value) !== loaded)

function loadForm(d) {
  form.value = {
    title: d.title || '',
    type: d.type || 'automation',
    status: d.status || 'Draft',
    enrollment_trigger: d.enrollment_trigger || 'manual',
    trigger_value: d.trigger_value || '',
    audience: d.audience || '',
    is_cadence: d.is_cadence ? 1 : 0,
    steps: (d.steps || []).map((s) => ({
      step_type: s.step_type, channel: s.channel, wait_hours: s.wait_hours, template: s.template || '',
      branch_condition: s.branch_condition || 'opened_previous', branch_value: s.branch_value, branch_to_step: s.branch_to_step,
      sent: s.sent, opened: s.opened, clicked: s.clicked,
    })),
  }
  loaded = JSON.stringify(form.value)
}

watch(
  () => props.campaignId,
  (id) => {
    if (!id) return
    campaign.submit({ name: id }).then((d) => d && loadForm(d))
    enroll.submit({ campaign: id, limit: 100 })
  },
  { immediate: true },
)

const c = computed(() => campaign.data || {})
const metrics = computed(() => c.value.metrics || {})
const enrolled = computed(() => enroll.data || [])

// Cadencia 1:1 (spec 4.2). is_cadence lives on the form so it round-trips through
// save_campaign (which does NOT skip it). The toggle is a two-way proxy over the
// 0/1 flag; it locks once any deal is enrolled — a client-side guard against
// stranding live enrollments (the server does not enforce this — S19 report).
const isCadence = computed({
  get: () => !!form.value.is_cadence,
  set: (v) => {
    form.value.is_cadence = v ? 1 : 0
  },
})
const cadenceLocked = computed(() => cadenceToggleLocked(c.value.enrolled_count))

// ── save / status / enroll ───────────────────────────────────────────────────
const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const res = await frappeCall('doco_marketing.api.campaigns.save_campaign', {
      payload: JSON.stringify({ name: props.campaignId, ...form.value }),
    })
    if (res) {
      campaign.data = res
      loadForm(res)
    }
    enroll.submit({ campaign: props.campaignId, limit: 100 })
    toast.success(__('Campaña guardada'))
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo guardar (revisa los pasos)'))
  } finally {
    saving.value = false
  }
}
async function changeStatus(status) {
  if (dirty.value) await save()
  await frappeCall('doco_marketing.api.campaigns.set_status', { name: props.campaignId, status })
  form.value.status = status
  loaded = JSON.stringify(form.value)
  toast.success(__('Estado actualizado'))
}
async function activate() {
  if (!form.value.steps.length) {
    toast.error(__('Agrega al menos un paso antes de activar.'))
    return
  }
  await changeStatus('Active')
}
const enrolling = ref(false)
async function doEnroll() {
  if (dirty.value) await save()
  enrolling.value = true
  try {
    const r = await frappeCall('doco_marketing.api.campaigns.enroll_audience', { campaign: props.campaignId })
    toast.success(__('{0} inscritos', [r?.enrolled ?? 0]))
    enroll.submit({ campaign: props.campaignId, limit: 100 })
    campaign.submit({ name: props.campaignId })
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo inscribir'))
  } finally {
    enrolling.value = false
  }
}

// ── view helpers ─────────────────────────────────────────────────────────────
const TYPE_META = { whatsapp: ['WhatsApp', 'var(--brand)', 'var(--brand-soft)'], email: ['Email', '#2f6fed', '#eaf1fe'], sms: ['SMS', '#7b3fa0', '#f3e9fb'], automation: ['Automatización', '#b9790a', '#fdf6e9'] }
function typeLabel(t) {
  return TYPE_META[t]?.[0] || t
}
const STATUS_CHIP = { Active: 'text-ink-green-6 bg-surface-green-2', Paused: 'text-ink-amber-6 bg-surface-amber-1', Draft: 'text-ink-gray-6 bg-surface-gray-2', Completed: 'text-ink-blue-5 bg-surface-blue-1' }
function statusChip(s) {
  return STATUS_CHIP[s] || 'text-ink-gray-6 bg-surface-gray-2'
}
function enrStatusChip(s) {
  const map = { Active: 'text-ink-green-6 bg-surface-green-2', Completed: 'text-ink-blue-5 bg-surface-blue-1', Suppressed: 'text-ink-red-8 bg-surface-red-1', Paused: 'text-ink-amber-6 bg-surface-amber-1' }
  return map[s] || 'text-ink-gray-6 bg-surface-gray-2'
}
function who(e) {
  return e.contact || e.lead || e.deal || e.customer || e.name
}

const Field = (props, { slots }) =>
  h('div', { class: 'flex flex-col gap-1' }, [h('span', { class: 'text-[10px] font-semibold uppercase tracking-[.07em] text-ink-gray-4' }, props.label), slots.default?.()])
Field.props = ['label']
const Metric = (props) =>
  h('div', {}, [h('div', { class: 'text-[10px] font-semibold uppercase tracking-[.07em] text-ink-gray-4' }, props.label), h('div', { class: 'text-[18px] font-bold ' + (props.color ? '' : 'text-ink-gray-9'), style: props.color ? `color:${props.color}` : undefined }, String(props.value))])
Metric.props = ['label', 'value', 'color']
</script>

<style scoped>
.dm-input {
  border: 1px solid var(--outline-gray-2, #e4e7ec);
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 12px;
  background: var(--surface-gray-2);
  color: var(--text-ink-gray-8);
}
.dm-input:focus {
  outline: none;
  background: var(--surface-base);
  border-color: var(--outline-green-3);
}
</style>
