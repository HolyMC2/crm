<!--
  Campaign detail — FCRM redesign (handoff §5.6). Step sequence (read) + enrolled
  contacts + pause/resume. Data via doco_marketing.api.campaigns.{get_campaign,
  get_enrollments,set_status}.
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-white">
    <!-- header -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 px-5">
      <div class="flex items-center gap-2">
        <button class="text-[13px] text-ink-gray-5 hover:text-ink-gray-9" @click="$router.push('/campaigns')">
          ← {{ __('Campañas') }}
        </button>
        <span style="color: #d7dae1">/</span>
        <span class="text-[15px] font-bold text-ink-gray-9">{{ c.title || campaignId }}</span>
        <span class="rounded-md px-2 py-[3px] text-[11px] font-semibold" :style="statusChip(c.status)">{{ c.status }}</span>
        <span class="rounded-md px-2 py-[3px] text-[11px] font-semibold" :style="typeChip(c.type)">{{ typeLabel(c.type) }}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="c.status === 'Active' || c.status === 'Paused'"
          class="rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold"
          :style="c.status === 'Active' ? 'color:#b9790a;border-color:#f1dca6;background:#fdf6e9' : 'color:#15803d;border-color:#c7ecd5;background:#e9f7ef'"
          @click="toggleStatus"
        >
          {{ c.status === 'Active' ? '⏸ ' + __('Pausar') : '▶ ' + __('Reanudar') }}
        </button>
        <button
          v-else-if="c.status === 'Draft'"
          class="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white"
          style="background: #16a34a"
          @click="setStatus('Active')"
        >
          ▶ {{ __('Activar') }}
        </button>
      </div>
    </div>

    <!-- metrics bar -->
    <div class="flex flex-none gap-6 border-b border-outline-gray-1 px-5 py-3">
      <Metric :label="__('Inscritos')" :value="c.enrolled_count || 0" />
      <Metric :label="__('Enviados')" :value="metrics.sent_count || 0" />
      <Metric :label="__('Apertura')" :value="`${metrics.open_rate || 0}%`" color="#16a34a" />
      <Metric :label="__('Clics')" :value="`${metrics.click_rate || 0}%`" color="#2f6fed" />
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- left: step sequence -->
      <div class="scb min-h-0 flex-1 overflow-y-auto border-r border-outline-gray-1 p-5">
        <div class="mb-3 text-[13px] font-bold text-ink-gray-9">{{ __('Secuencia') }}</div>
        <div v-if="!steps.length" class="text-xs text-ink-gray-4">{{ __('Sin pasos definidos') }}</div>
        <div v-for="(s, i) in steps" :key="i" class="relative mb-2 max-w-[440px]">
          <div class="flex items-center gap-3 rounded-[11px] border border-outline-gray-2 p-3">
            <span class="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-[16px]" style="background: #f1f2f4">
              {{ stepGlyph(s.step_type) }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="text-[13px] font-semibold text-ink-gray-9">{{ stepTitle(s) }}</div>
              <div v-if="s.sent || s.opened || s.clicked" class="text-[11px] text-ink-gray-5">
                {{ s.sent || 0 }} {{ __('enviados') }} · {{ s.opened || 0 }} {{ __('abiertos') }} · {{ s.clicked || 0 }} {{ __('clics') }}
              </div>
            </div>
            <span class="flex-none text-[10.5px] font-semibold text-ink-gray-4">#{{ i + 1 }}</span>
          </div>
          <div v-if="i < steps.length - 1" class="ml-[18px] h-3 w-px" style="background: #d7dae1" />
        </div>
      </div>

      <!-- right: enrolled contacts -->
      <div class="scb min-h-0 w-[440px] flex-none overflow-y-auto p-5">
        <div class="mb-3 flex items-center justify-between">
          <div class="text-[13px] font-bold text-ink-gray-9">{{ __('Inscritos') }}</div>
          <span class="text-[12px] text-ink-gray-5">{{ enrolled.length }}</span>
        </div>
        <div v-if="enroll.loading && !enrolled.length" class="py-6 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>
        <div v-else-if="!enrolled.length" class="py-6 text-center text-xs text-ink-gray-4">{{ __('Nadie inscrito') }}</div>
        <div
          v-for="e in enrolled"
          :key="e.name"
          class="mb-1.5 flex items-center gap-2.5 rounded-[10px] border border-outline-gray-2 px-3 py-2.5"
        >
          <span
            class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[10px] font-semibold"
            :style="`background:${avatarColor(who(e))[0]};color:${avatarColor(who(e))[1]}`"
          >
            {{ initials(who(e)) }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-[12.5px] font-semibold text-ink-gray-9">{{ who(e) }}</div>
            <div class="text-[11px] text-ink-gray-4">
              {{ __('Paso') }} {{ (e.current_step ?? 0) + 1 }} · {{ e.last_sent_at ? timeAgo(e.last_sent_at) : '—' }}
            </div>
          </div>
          <span class="flex-none rounded px-2 py-[2px] text-[10.5px] font-semibold" :style="enrStatusChip(e.status)">{{ e.status }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, watch } from 'vue'
import { createResource, call as frappeCall, toast } from 'frappe-ui'
import { avatarColor, initials, timeAgo } from '@/composables/crmFormat'

const props = defineProps({ campaignId: { type: String, required: true } })

const campaign = createResource({ url: 'doco_marketing.api.campaigns.get_campaign' })
const enroll = createResource({ url: 'doco_marketing.api.campaigns.get_enrollments' })
watch(
  () => props.campaignId,
  (id) => {
    if (!id) return
    campaign.submit({ name: id })
    enroll.submit({ campaign: id, limit: 100 })
  },
  { immediate: true },
)

const c = computed(() => campaign.data || {})
const metrics = computed(() => c.value.metrics || {})
const steps = computed(() => c.value.steps || [])
const enrolled = computed(() => enroll.data || [])

const TYPE_META = {
  whatsapp: ['WhatsApp', '#16a34a', '#e9f7ef'],
  email: ['Email', '#2f6fed', '#eaf1fe'],
  sms: ['SMS', '#7b3fa0', '#f3e9fb'],
  automation: ['Auto', '#b9790a', '#fdf6e9'],
}
function typeLabel(t) {
  return TYPE_META[t]?.[0] || t
}
function typeChip(t) {
  const m = TYPE_META[t] || ['', '#5b6472', '#f1f2f4']
  return `color:${m[1]};background:${m[2]}`
}
const STATUS_META = {
  Active: ['#15803d', '#e9f7ef'],
  Paused: ['#b9790a', '#fdf6e9'],
  Draft: ['#5b6472', '#f1f2f4'],
  Completed: ['#2f6fed', '#eaf1fe'],
}
function statusChip(s) {
  const m = STATUS_META[s] || ['#5b6472', '#f1f2f4']
  return `color:${m[0]};background:${m[1]}`
}
function enrStatusChip(s) {
  const map = {
    Active: '#15803d;background:#e9f7ef',
    Completed: '#2f6fed;background:#eaf1fe',
    Suppressed: '#e5484d;background:#fdecec',
    Paused: '#b9790a;background:#fdf6e9',
  }
  return `color:${map[s] || '#5b6472;background:#f1f2f4'}`
}

const STEP_GLYPH = { send_whatsapp: '💬', send_email: '✉', wait: '⏳', branch: '🔀', end: '⏹', trigger: '⚡' }
function stepGlyph(t) {
  return STEP_GLYPH[t] || '•'
}
function stepTitle(s) {
  if (s.step_type === 'wait') return `${__('Esperar')} ${s.wait_hours || 0}h`
  if (s.step_type === 'branch') return `${__('Bifurcación')} · ${s.branch_condition || ''}`
  if (s.step_type === 'send_whatsapp') return `${__('Enviar WhatsApp')}${s.template ? ' · ' + s.template : ''}`
  if (s.step_type === 'send_email') return `${__('Enviar Email')}${s.template ? ' · ' + s.template : ''}`
  if (s.step_type === 'end') return __('Fin')
  return s.step_type
}
function who(e) {
  return e.contact || e.lead || e.deal || e.customer || e.name
}

async function setStatus(status) {
  await frappeCall('doco_marketing.api.campaigns.set_status', { name: props.campaignId, status })
  toast.success(__('Estado actualizado'))
  campaign.submit({ name: props.campaignId })
}
function toggleStatus() {
  setStatus(c.value.status === 'Active' ? 'Paused' : 'Active')
}

const Metric = (props) =>
  h('div', {}, [
    h('div', { class: 'text-[10px] font-semibold uppercase tracking-[.07em] text-ink-gray-4' }, props.label),
    h('div', { class: 'text-[18px] font-bold', style: `color:${props.color || '#1c2230'}` }, String(props.value)),
  ])
Metric.props = ['label', 'value', 'color']
</script>
