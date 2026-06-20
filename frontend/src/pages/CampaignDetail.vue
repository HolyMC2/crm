<!--
  Campaign detail + EDITOR (handoff §5.6) — fully configurable from the SPA:
  settings (type/trigger/audience), a step builder (trigger→wait→send→branch→end),
  enroll, activate/pause. Saves via doco_marketing.api.campaigns.save_campaign.
-->
<template>
  <div class="scb flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-white">
    <!-- header -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 px-5">
      <div class="flex min-w-0 items-center gap-2">
        <button class="text-[13px] text-ink-gray-5 hover:text-ink-gray-9" @click="$router.push('/campaigns')">← {{ __('Campañas') }}</button>
        <span style="color: #d7dae1">/</span>
        <input v-model="form.title" class="min-w-0 border-0 bg-transparent text-[15px] font-bold text-ink-gray-9 focus:outline-none focus:ring-0" :placeholder="__('Nombre de la campaña')" />
        <span class="rounded-md px-2 py-[3px] text-[11px] font-semibold" :style="statusChip(form.status)">{{ form.status }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button v-if="dirty || saving" class="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50" style="background: #16a34a" :disabled="saving" @click="save">
          {{ saving ? __('Guardando…') : __('Guardar') }}
        </button>
        <button v-if="form.status === 'Active'" class="rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold" style="color: #b9790a; border-color: #f1dca6; background: #fdf6e9" @click="changeStatus('Paused')">⏸ {{ __('Pausar') }}</button>
        <button v-else-if="form.status === 'Paused'" class="rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold" style="color: #15803d; border-color: #c7ecd5; background: #e9f7ef" @click="changeStatus('Active')">▶ {{ __('Reanudar') }}</button>
        <button v-else-if="form.status === 'Draft'" class="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white" style="background: #16a34a" @click="activate">▶ {{ __('Activar') }}</button>
      </div>
    </div>

    <!-- settings -->
    <div class="flex flex-none flex-wrap items-end gap-4 border-b border-outline-gray-1 px-5 py-3">
      <Field :label="__('Tipo')">
        <select v-model="form.type" class="dm-input"><option v-for="t in TYPES" :key="t" :value="t">{{ typeLabel(t) }}</option></select>
      </Field>
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
    </div>

    <!-- metrics -->
    <div class="flex flex-none gap-6 border-b border-outline-gray-1 px-5 py-3">
      <Metric :label="__('Inscritos')" :value="c.enrolled_count || 0" />
      <Metric :label="__('Enviados')" :value="metrics.sent_count || 0" />
      <Metric :label="__('Apertura')" :value="`${metrics.open_rate || 0}%`" color="#16a34a" />
      <Metric :label="__('Clics')" :value="`${metrics.click_rate || 0}%`" color="#2f6fed" />
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- step builder -->
      <div class="scb min-h-0 flex-1 overflow-y-auto border-r border-outline-gray-1 p-5">
        <div class="mb-3 flex items-center justify-between">
          <div class="text-[13px] font-bold text-ink-gray-9">{{ __('Secuencia') }}</div>
          <button class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style="background: #16a34a" @click="addStep">+ {{ __('Paso') }}</button>
        </div>
        <div v-if="!form.steps.length" class="rounded-[10px] border border-dashed border-outline-gray-2 py-6 text-center text-xs text-ink-gray-4">
          {{ __('Sin pasos. Agrega un paso para empezar.') }}
        </div>

        <div v-for="(s, i) in form.steps" :key="i" class="mb-2 max-w-[520px]">
          <div class="rounded-[11px] border border-outline-gray-2 p-3">
            <div class="mb-2 flex items-center gap-2">
              <span class="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-[14px]" style="background: #f1f2f4">{{ stepGlyph(s.step_type) }}</span>
              <select v-model="s.step_type" class="dm-input flex-1" @change="onTypeChange(s)">
                <option value="send_whatsapp">{{ __('Enviar WhatsApp') }}</option>
                <option value="send_email">{{ __('Enviar Email') }}</option>
                <option value="wait">{{ __('Esperar') }}</option>
                <option value="branch">{{ __('Bifurcación') }}</option>
                <option value="end">{{ __('Fin') }}</option>
              </select>
              <span class="flex-none text-[10.5px] font-semibold text-ink-gray-4">#{{ i + 1 }}</span>
              <button class="flex-none text-ink-gray-4 hover:text-ink-gray-8 disabled:opacity-30" :disabled="i === 0" @click="moveStep(i, -1)" :aria-label="__('Subir')">▲</button>
              <button class="flex-none text-ink-gray-4 hover:text-ink-gray-8 disabled:opacity-30" :disabled="i === form.steps.length - 1" @click="moveStep(i, 1)" :aria-label="__('Bajar')">▼</button>
              <button class="flex-none text-ink-gray-4 hover:text-ink-red-4" @click="removeStep(i)" :aria-label="__('Eliminar')">✕</button>
            </div>

            <!-- per-type config -->
            <div v-if="s.step_type === 'wait'" class="flex items-center gap-2 text-[12px]">
              <span class="text-ink-gray-5">{{ __('Esperar') }}</span>
              <input v-model.number="s.wait_hours" type="number" min="0" class="dm-input w-20" /><span class="text-ink-gray-5">{{ __('horas') }}</span>
            </div>
            <div v-else-if="s.step_type === 'send_whatsapp'" class="flex items-center gap-2 text-[12px]">
              <span class="text-ink-gray-5">{{ __('Plantilla') }}</span>
              <select v-model="s.template" class="dm-input flex-1"><option value="">{{ __('(texto libre / ninguna)') }}</option><option v-for="t in waTemplates.data || []" :key="t.name" :value="t.name">{{ t.template_name || t.name }}</option></select>
            </div>
            <div v-else-if="s.step_type === 'send_email'" class="flex items-center gap-2 text-[12px]">
              <span class="text-ink-gray-5">{{ __('Plantilla') }}</span>
              <select v-model="s.template" class="dm-input flex-1"><option value="">{{ __('(ninguna)') }}</option><option v-for="t in emailTemplates.data || []" :key="t.name" :value="t.name">{{ t.name }}</option></select>
            </div>
            <div v-else-if="s.step_type === 'branch'" class="flex flex-wrap items-center gap-2 text-[12px]">
              <select v-model="s.branch_condition" class="dm-input">
                <option value="opened_previous">{{ __('Si abrió el anterior') }}</option>
                <option value="clicked_previous">{{ __('Si dio clic anterior') }}</option>
                <option value="score_gte">{{ __('Si score ≥') }}</option>
              </select>
              <input v-if="s.branch_condition === 'score_gte'" v-model.number="s.branch_value" type="number" class="dm-input w-20" placeholder="60" />
              <span class="text-ink-gray-5">→ {{ __('saltar a') }}</span>
              <select v-model.number="s.branch_to_step" class="dm-input">
                <option v-for="j in forwardSteps(i)" :key="j" :value="j">{{ __('Paso') }} {{ j + 1 }}</option>
              </select>
            </div>
            <div v-if="(s.step_type === 'send_whatsapp' || s.step_type === 'send_email') && (s.sent || s.opened || s.clicked)" class="mt-1.5 text-[11px] text-ink-gray-5">
              {{ s.sent || 0 }} {{ __('enviados') }} · {{ s.opened || 0 }} {{ __('abiertos') }} · {{ s.clicked || 0 }} {{ __('clics') }}
            </div>
          </div>
          <div v-if="i < form.steps.length - 1" class="ml-[18px] h-3 w-px" style="background: #d7dae1" />
        </div>
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
          <span class="flex-none rounded px-2 py-[2px] text-[10.5px] font-semibold" :style="enrStatusChip(e.status)">{{ e.status }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, ref, watch } from 'vue'
import { createResource, createListResource, call as frappeCall, toast } from 'frappe-ui'
import { avatarColor, initials, timeAgo } from '@/composables/crmFormat'

const props = defineProps({ campaignId: { type: String, required: true } })
const TYPES = ['whatsapp', 'email', 'sms', 'automation']

const campaign = createResource({ url: 'doco_marketing.api.campaigns.get_campaign' })
const enroll = createResource({ url: 'doco_marketing.api.campaigns.get_enrollments' })
const audiences = createListResource({ doctype: 'Marketing Audience', fields: ['name', 'title'], pageLength: 100, auto: true })
const waTemplates = createListResource({ doctype: 'WhatsApp Templates', fields: ['name', 'template_name'], pageLength: 100, auto: true })
const emailTemplates = createListResource({ doctype: 'Email Template', fields: ['name'], pageLength: 100, auto: true })
const dealStatuses = createListResource({ doctype: 'CRM Deal Status', fields: ['name'], orderBy: 'position asc', pageLength: 50, auto: true })

const form = ref({ title: '', type: 'automation', status: 'Draft', enrollment_trigger: 'manual', trigger_value: '', audience: '', steps: [] })
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

// ── step builder ops ─────────────────────────────────────────────────────────
function addStep() {
  form.value.steps.push({ step_type: 'send_whatsapp', channel: 'whatsapp', wait_hours: 0, template: '', branch_condition: 'opened_previous' })
}
function removeStep(i) {
  form.value.steps.splice(i, 1)
}
function moveStep(i, dir) {
  const j = i + dir
  if (j < 0 || j >= form.value.steps.length) return
  const s = form.value.steps.splice(i, 1)[0]
  form.value.steps.splice(j, 0, s)
}
function onTypeChange(s) {
  s.channel = s.step_type === 'send_whatsapp' ? 'whatsapp' : s.step_type === 'send_email' ? 'email' : ''
}
function forwardSteps(i) {
  const out = []
  for (let j = i + 1; j < form.value.steps.length; j++) out.push(j)
  return out
}

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
const TYPE_META = { whatsapp: ['WhatsApp', '#16a34a', '#e9f7ef'], email: ['Email', '#2f6fed', '#eaf1fe'], sms: ['SMS', '#7b3fa0', '#f3e9fb'], automation: ['Automatización', '#b9790a', '#fdf6e9'] }
function typeLabel(t) {
  return TYPE_META[t]?.[0] || t
}
const STATUS_META = { Active: ['#15803d', '#e9f7ef'], Paused: ['#b9790a', '#fdf6e9'], Draft: ['#5b6472', '#f1f2f4'], Completed: ['#2f6fed', '#eaf1fe'] }
function statusChip(s) {
  const m = STATUS_META[s] || ['#5b6472', '#f1f2f4']
  return `color:${m[0]};background:${m[1]}`
}
function enrStatusChip(s) {
  const map = { Active: '#15803d;background:#e9f7ef', Completed: '#2f6fed;background:#eaf1fe', Suppressed: '#e5484d;background:#fdecec', Paused: '#b9790a;background:#fdf6e9' }
  return `color:${map[s] || '#5b6472;background:#f1f2f4'}`
}
const STEP_GLYPH = { send_whatsapp: '💬', send_email: '✉', wait: '⏳', branch: '🔀', end: '⏹' }
function stepGlyph(t) {
  return STEP_GLYPH[t] || '•'
}
function who(e) {
  return e.contact || e.lead || e.deal || e.customer || e.name
}

const Field = (props, { slots }) =>
  h('div', { class: 'flex flex-col gap-1' }, [h('span', { class: 'text-[10px] font-semibold uppercase tracking-[.07em] text-ink-gray-4' }, props.label), slots.default?.()])
Field.props = ['label']
const Metric = (props) =>
  h('div', {}, [h('div', { class: 'text-[10px] font-semibold uppercase tracking-[.07em] text-ink-gray-4' }, props.label), h('div', { class: 'text-[18px] font-bold', style: `color:${props.color || '#1c2230'}` }, String(props.value))])
Metric.props = ['label', 'value', 'color']
</script>

<style scoped>
.dm-input {
  border: 1px solid var(--outline-gray-2, #e4e7ec);
  border-radius: 8px;
  padding: 5px 9px;
  font-size: 12px;
  background: #fff;
  color: #1c2230;
}
.dm-input:focus {
  outline: none;
  border-color: #16a34a;
}
</style>
