<!--
  Inbox right pane (320px): quick Acciones + doco Score, then the FULL upstream
  editable deal-field sidebar (SidePanelLayout) so no field is hidden. handoff §5.1.
-->
<template>
  <div class="scb flex w-[320px] flex-none flex-col overflow-y-auto border-l border-outline-gray-1" style="background: #fcfcfd">
    <!-- acciones -->
    <div class="flex-none border-b border-outline-gray-1 p-3.5">
      <div class="mb-2.5 text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">{{ __('Acciones') }}</div>
      <div class="flex gap-2">
        <button class="flex-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-white" style="background: #16a34a" @click="call">
          ☎ {{ __('Llamar') }}
        </button>
        <button class="flex-1 rounded-lg border border-outline-gray-2 px-2.5 py-1.5 text-[11.5px] font-medium text-ink-gray-7" @click="activeTab = 'conversation'">
          💬 {{ __('Chat') }}
        </button>
      </div>
      <button class="mt-2 w-full text-[11px] text-ink-blue-link" @click="$router.push(`/deal/${activeDeal}`)">⛶ {{ __('Abrir 360°') }}</button>
    </div>

    <!-- score (doco-specific; not in the upstream sidepanel) -->
    <div v-if="grade" class="flex-none border-b border-outline-gray-1 p-3.5">
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
          <div v-if="probability" class="mt-0.5 text-[10px] text-ink-gray-5">{{ probability }}% {{ __('prob. conversión') }}</div>
        </div>
      </div>
      <div class="mt-2.5 text-[11px]">
        <span class="cursor-pointer text-ink-blue-link" @click="$router.push('/score-rules')">{{ __('Reglas de score') }} →</span>
      </div>
    </div>

    <!-- full editable deal fields (upstream — nothing hidden) -->
    <div class="min-h-0 flex-1">
      <SidePanelLayout
        v-if="sections.data"
        :key="activeDeal"
        :sections="sections.data"
        doctype="CRM Deal"
        :docname="activeDeal"
        @reload="sections.reload"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { createResource } from 'frappe-ui'
import { globalStore } from '@/stores/global'
import SidePanelLayout from '@/components/SidePanelLayout.vue'
import { activeDeal, activeTab, queue, GRADE_COLORS } from '@/composables/inbox'

const { makeCall } = globalStore()

const row = computed(() => (queue.data || []).find((r) => r.deal === activeDeal.value) || {})
const name = computed(() => row.value.contact_name || row.value.mobile_no || '')
const grade = computed(() => row.value.score_grade)
const score = computed(() => row.value.lead_score ?? 0)
const gradeColor = computed(() => GRADE_COLORS[grade.value]?.[0] || '#9aa2ae')
const gradeWord = computed(() => ({ A: __('Top tier'), B: __('Bueno'), C: __('Medio'), D: __('Bajo') })[grade.value] || '')
const dashOffset = computed(() => (113.1 * (100 - Math.min(100, Number(score.value) || 0))) / 100)

// upstream side-panel field layout (all deal fields, editable)
const sections = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_sidepanel_sections',
  params: { doctype: 'CRM Deal' },
  auto: true,
})

// conversion probability for the Score card
const probability = computed(() => probRes.data?.probability)
const probRes = createResource({ url: 'frappe.client.get_value' })
watch(
  activeDeal,
  (d) => d && probRes.submit({ doctype: 'CRM Deal', filters: d, fieldname: 'probability' }),
  { immediate: true },
)

function call() {
  if (row.value.mobile_no) makeCall(row.value.mobile_no)
}
</script>
