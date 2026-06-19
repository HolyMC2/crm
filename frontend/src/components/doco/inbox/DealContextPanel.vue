<!-- Inbox right pane (296px): Acciones + Score + Resumen + Contacto. handoff §5.1 -->
<template>
  <div class="scb w-[296px] flex-none overflow-y-auto border-l border-outline-gray-1" style="background: #fcfcfd">
    <!-- acciones -->
    <div class="border-b border-outline-gray-1 p-3.5">
      <div class="mb-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('Acciones') }}</div>
      <div class="flex items-center justify-between py-1 text-[12px]">
        <span class="text-ink-gray-5">{{ __('Estado') }}</span>
        <span v-if="row.status" class="rounded-md px-2 py-[2px] text-[11px] font-semibold" :style="statusChip(row.status)">{{ row.status }}</span>
      </div>
      <div class="flex items-center justify-between py-1 text-[12px]">
        <span class="text-ink-gray-5">{{ __('Asignado a') }}</span>
        <span v-if="extra.deal_owner" class="inline-flex items-center gap-1.5 font-medium text-ink-gray-8">
          <span class="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold" :style="`background:${avatarColor(extra.deal_owner)[0]};color:${avatarColor(extra.deal_owner)[1]}`">
            {{ initials(ownerName) }}
          </span>
          {{ ownerName }}
        </span>
        <span v-else class="text-ink-gray-4">—</span>
      </div>
      <div class="mt-2 flex gap-2">
        <button class="flex-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-white" style="background: #16a34a" @click="call">
          ☎ {{ __('Llamar') }}
        </button>
        <button class="flex-1 rounded-lg border border-outline-gray-2 px-2.5 py-1.5 text-[11.5px] font-medium text-ink-gray-7" @click="$router.push('/inbox')">
          💬 {{ __('Chat') }}
        </button>
      </div>
    </div>

    <!-- score -->
    <div v-if="grade" class="border-b border-outline-gray-1 p-3.5">
      <div class="mb-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('Score') }} · {{ name }}</div>
      <div class="flex items-center gap-2.5 rounded-[9px] border p-2.5" style="background: #f8fffe; border-color: #c7ecd5">
        <div class="relative h-11 w-11 flex-none">
          <svg viewBox="0 0 44 44" width="44" height="44" style="transform: rotate(-90deg)">
            <circle cx="22" cy="22" r="18" fill="none" stroke="#f0f1f3" stroke-width="4" />
            <circle cx="22" cy="22" r="18" fill="none" :stroke="gradeColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="113.1" :stroke-dashoffset="dashOffset" />
          </svg>
          <div class="absolute inset-0 flex items-center justify-center text-[12px] font-extrabold" :style="`color:${gradeColor}`">{{ score }}</div>
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-[17px] font-extrabold" :style="`color:${gradeColor}`">{{ grade }}</span>
            <span class="rounded px-1.5 py-px text-[10px] font-semibold" style="color: #15803d; background: #e9f7ef">{{ gradeWord }}</span>
          </div>
          <div v-if="extra.probability" class="mt-0.5 text-[10px] text-ink-gray-5">{{ extra.probability }}% {{ __('prob. conversión') }}</div>
        </div>
      </div>
      <div class="mt-2.5 flex gap-3 text-[11px] text-ink-gray-4">
        <span class="cursor-pointer text-ink-blue-link" @click="$router.push('/score-rules')">{{ __('Reglas de score') }} →</span>
        <span v-if="extra.lead || row.deal" class="cursor-pointer text-ink-blue-link" @click="open360">360° →</span>
      </div>
    </div>

    <!-- resumen -->
    <div class="border-b border-outline-gray-1 p-3.5">
      <div class="mb-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('Resumen del deal') }}</div>
      <SummaryRow :k="__('ID')" :v="activeDeal" />
      <SummaryRow v-if="extra.deal_value" :k="__('Valor')" :v="money(extra.deal_value)" />
      <SummaryRow v-if="row.device" :k="__('Equipo')" :v="row.device" />
      <SummaryRow v-if="extra.source" :k="__('Origen')" :v="extra.source" />
      <SummaryRow v-if="extra.organization" :k="__('Organización')" :v="extra.organization" />
      <SummaryRow v-if="extra.creation" :k="__('Creado')" :v="created" />
    </div>

    <!-- contacto -->
    <div class="p-3.5">
      <div class="mb-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('Contacto') }}</div>
      <div class="mb-2.5 flex items-center gap-2.5">
        <span class="flex h-[34px] w-[34px] items-center justify-center rounded-full text-[13px] font-semibold" :style="`background:${avatarColor(name)[0]};color:${avatarColor(name)[1]}`">
          {{ initials(name) }}
        </span>
        <div class="min-w-0">
          <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ name || '—' }}</div>
        </div>
      </div>
      <div v-if="row.mobile_no" class="flex items-center gap-2 py-[3px] text-[12px] text-ink-gray-7">
        <span class="text-ink-gray-4">☎</span>{{ row.mobile_no }}
      </div>
      <div v-if="extra.email" class="flex items-center gap-2 py-[3px] text-[12px]">
        <span class="text-ink-gray-4">✉</span><span class="truncate text-ink-blue-link">{{ extra.email }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createResource } from 'frappe-ui'
import { globalStore } from '@/stores/global'
import { statusesStore } from '@/stores/statuses'
import { usersStore } from '@/stores/users'
import { activeDeal, queue, avatarColor, initials, GRADE_COLORS } from '@/composables/inbox'

const router = useRouter()
const { makeCall } = globalStore()
const { getDealStatus } = statusesStore()
const { getUser } = usersStore()

const row = computed(() => (queue.data || []).find((r) => r.deal === activeDeal.value) || {})
const name = computed(() => row.value.contact_name || row.value.mobile_no || '')
const grade = computed(() => row.value.score_grade)
const score = computed(() => row.value.lead_score ?? 0)
const gradeColor = computed(() => GRADE_COLORS[grade.value]?.[0] || '#9aa2ae')
const gradeWord = computed(() => ({ A: __('Top tier'), B: __('Bueno'), C: __('Medio'), D: __('Bajo') })[grade.value] || '')
const dashOffset = computed(() => (113.1 * (100 - Math.min(100, Number(score.value) || 0))) / 100)

const deal = createResource({ url: 'frappe.client.get_value' })
watch(
  activeDeal,
  (d) =>
    d &&
    deal.submit({
      doctype: 'CRM Deal',
      filters: d,
      fieldname: JSON.stringify(['organization', 'email', 'creation', 'deal_owner', 'source', 'deal_value', 'probability', 'lead']),
    }),
  { immediate: true },
)
const extra = computed(() => deal.data || {})
const created = computed(() => (extra.value.creation ? new Date(String(extra.value.creation).replace(' ', 'T')).toLocaleDateString() : ''))
const ownerName = computed(() => getUser(extra.value.deal_owner)?.full_name || extra.value.deal_owner || '')

function statusChip(status) {
  const c = getDealStatus(status)?.color || '#5b6472'
  return `color:${c};background:${c}1a`
}
function money(v) {
  return `$${Number(v || 0).toLocaleString()}`
}
function call() {
  if (row.value.mobile_no) makeCall(row.value.mobile_no)
}
function open360() {
  if (extra.value.lead) router.push(`/leads/${extra.value.lead}`)
}

const SummaryRow = (props) =>
  h('div', { class: 'flex justify-between py-1 text-[12.5px]' }, [
    h('span', { class: 'text-ink-gray-5' }, props.k),
    h('span', { class: 'font-medium text-ink-gray-8 truncate ml-2', style: 'max-width:60%' }, props.v),
  ])
SummaryRow.props = ['k', 'v']
</script>
