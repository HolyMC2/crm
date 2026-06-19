<!-- Inbox right pane (296px): score card + deal summary + contact. handoff §5.1 -->
<template>
  <div class="scb w-[296px] flex-none overflow-y-auto border-l border-outline-gray-1" style="background: #fcfcfd">
    <!-- score -->
    <div v-if="grade" class="border-b border-outline-gray-1 p-3.5">
      <div class="mb-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-5">
        {{ __('Score') }} · {{ name }}
      </div>
      <div
        class="flex items-center gap-2.5 rounded-[9px] border p-2.5"
        style="background: #f8fffe; border-color: #c7ecd5"
      >
        <div class="relative h-11 w-11 flex-none">
          <svg viewBox="0 0 44 44" width="44" height="44" style="transform: rotate(-90deg)">
            <circle cx="22" cy="22" r="18" fill="none" stroke="#f0f1f3" stroke-width="4" />
            <circle
              cx="22" cy="22" r="18" fill="none" :stroke="gradeColor" stroke-width="4"
              stroke-linecap="round" stroke-dasharray="113.1" :stroke-dashoffset="dashOffset"
            />
          </svg>
          <div
            class="absolute inset-0 flex items-center justify-center text-[12px] font-extrabold"
            :style="`color:${gradeColor}`"
          >
            {{ score }}
          </div>
        </div>
        <div>
          <span class="text-[17px] font-extrabold" :style="`color:${gradeColor}`">{{ grade }}</span>
          <div class="mt-0.5 text-[10px] text-ink-gray-5">{{ gradeWord }}</div>
        </div>
      </div>
      <div class="mt-2.5 text-[11px] text-ink-gray-4">
        <span class="cursor-pointer text-ink-blue-link" @click="$router.push('/score-rules')">
          {{ __('Reglas de score') }} →
        </span>
      </div>
    </div>

    <!-- deal summary -->
    <div class="border-b border-outline-gray-1 p-3.5">
      <div class="mb-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-5">
        {{ __('Resumen del deal') }}
      </div>
      <SummaryRow :k="__('ID')" :v="activeDeal" />
      <SummaryRow v-if="row.status" :k="__('Estado')" :v="row.status" />
      <SummaryRow v-if="row.device" :k="__('Equipo')" :v="row.device" />
      <SummaryRow v-if="extra.organization" :k="__('Organización')" :v="extra.organization" />
      <SummaryRow v-if="extra.creation" :k="__('Creado')" :v="created" />
    </div>

    <!-- contact -->
    <div class="p-3.5">
      <div class="mb-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-5">
        {{ __('Contacto') }}
      </div>
      <div class="mb-2.5 flex items-center gap-2.5">
        <span
          class="flex h-[34px] w-[34px] items-center justify-center rounded-full text-[13px] font-semibold"
          :style="`background:${avatarColor(name)[0]};color:${avatarColor(name)[1]}`"
        >
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
        <span class="text-ink-gray-4">✉</span>
        <span class="truncate text-ink-blue-link">{{ extra.email }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, h, watch } from 'vue'
import { createResource } from 'frappe-ui'
import { activeDeal, queue, avatarColor, initials, GRADE_COLORS } from '@/composables/inbox'

const row = computed(() => (queue.data || []).find((r) => r.deal === activeDeal.value) || {})
const name = computed(() => row.value.contact_name || row.value.mobile_no || '')
const grade = computed(() => row.value.score_grade)
const score = computed(() => row.value.lead_score ?? 0)
const gradeColor = computed(() => GRADE_COLORS[grade.value]?.[0] || '#9aa2ae')
const gradeWord = computed(
  () => ({ A: __('Top tier'), B: __('Bueno'), C: __('Medio'), D: __('Bajo') })[grade.value] || '',
)
// ring fill ~ score/100 over circumference 113.1
const dashOffset = computed(() => (113.1 * (100 - Math.min(100, Number(score.value) || 0))) / 100)

// extra deal fields (safe set only)
const deal = createResource({ url: 'frappe.client.get_value' })
watch(
  activeDeal,
  (d) =>
    d &&
    deal.submit({
      doctype: 'CRM Deal',
      filters: d,
      fieldname: JSON.stringify(['organization', 'email', 'creation']),
    }),
  { immediate: true },
)
const extra = computed(() => deal.data || {})
const created = computed(() =>
  extra.value.creation ? new Date(String(extra.value.creation).replace(' ', 'T')).toLocaleDateString() : '',
)

const SummaryRow = (props) =>
  h('div', { class: 'flex justify-between py-1 text-[12.5px]' }, [
    h('span', { class: 'text-ink-gray-5' }, props.k),
    h('span', { class: 'font-medium text-ink-gray-8 truncate ml-2', style: 'max-width:60%' }, props.v),
  ])
SummaryRow.props = ['k', 'v']
</script>
