<!--
  Score Rules — FCRM redesign (handoff §5.13). Lead Scoring Rule CRUD + live preview
  (recompute a sample without persisting) + grade distribution. Data: doco_marketing.
  api.score_rules.* + createListResource('Lead Scoring Rule').
-->
<template>
  <div class="scb flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-white">
    <!-- header -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 px-5">
      <div class="flex items-center gap-2">
        <button class="text-[13px] text-ink-gray-5 hover:text-ink-gray-9" @click="$router.push('/leads')">← {{ __('Leads') }}</button>
        <span class="text-ink-gray-4">/</span>
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Reglas de Score') }}</span>
      </div>
      <button class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12.5px] font-semibold text-ink-gray-7" @click="runPreview">
        {{ __('Vista previa') }}
      </button>
    </div>

    <!-- grade legend -->
    <div class="flex flex-none items-center gap-3 border-b border-outline-gray-1 px-5 py-2.5">
      <span v-for="g in legend" :key="g.grade" class="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-gray-6">
        <span class="rounded px-1.5 py-px text-[10px] font-bold text-white" :style="`background:${g.color}`">{{ g.grade }}</span>
        {{ g.range }}
      </span>
      <span class="ml-auto text-[11px] text-ink-gray-4">{{ dist.A + dist.B + dist.C + dist.D + dist.Ungraded }} {{ __('leads') }}</span>
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- rules -->
      <div class="scb min-h-0 flex-1 overflow-y-auto p-5">
        <div class="mb-3 flex items-center justify-between">
          <div class="text-[13px] font-bold text-ink-gray-9">{{ __('Reglas') }}</div>
          <button class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white" style="background: var(--brand)" @click="showAdd = !showAdd">
            + {{ __('Nueva regla') }}
          </button>
        </div>

        <!-- add form -->
        <div v-if="showAdd" class="mb-3 grid grid-cols-[1fr_1fr_120px_1fr_70px_auto] items-center gap-2 rounded-[10px] border border-outline-gray-2 p-3">
          <input v-model="form.rule_name" :placeholder="__('Nombre')" class="rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12px] focus:outline-none" />
          <input v-model="form.field" :placeholder="__('Campo (p.ej. source)')" class="rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12px] focus:outline-none" />
          <select v-model="form.operator" class="rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12px]">
            <option v-for="o in operators" :key="o" :value="o">{{ o }}</option>
          </select>
          <input v-model="form.value" :placeholder="__('Valor')" class="rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12px] focus:outline-none" />
          <input v-model.number="form.points" type="number" :placeholder="__('Pts')" class="rounded-md border border-outline-gray-2 px-2 py-1.5 text-[12px] focus:outline-none" />
          <button class="rounded-md px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50" style="background: var(--brand)" :disabled="!form.rule_name.trim() || !form.field.trim()" @click="addRule">
            {{ __('Crear') }}
          </button>
        </div>

        <div v-if="!rules.length" class="py-6 text-center text-xs text-ink-gray-4">{{ __('Sin reglas') }}</div>
        <div
          v-for="r in rules"
          :key="r.name"
          class="mb-1.5 flex items-center gap-3 rounded-[10px] border border-outline-gray-2 px-3 py-2.5"
        >
          <button
            class="flex h-5 w-9 flex-none items-center rounded-full px-0.5 transition"
            :class="r.enabled ? 'bg-surface-green-3' : 'bg-surface-gray-4'"
            :style="r.enabled ? 'justify-content:flex-end' : 'justify-content:flex-start'"
            @click="toggleRule(r)"
          >
            <span class="h-4 w-4 rounded-full bg-white" />
          </button>
          <div class="min-w-0 flex-1">
            <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ r.rule_name }}</div>
            <div class="truncate text-[11.5px] text-ink-gray-5">
              <span class="font-medium">{{ r.field }}</span> {{ r.operator }} <span class="font-medium">{{ r.value }}</span>
            </div>
          </div>
          <span class="flex-none rounded-md px-2 py-[3px] text-[12px] font-bold" :class="r.points >= 0 ? 'text-ink-green-3 bg-surface-green-2' : 'text-ink-red-4 bg-surface-red-1'">
            {{ r.points >= 0 ? '+' : '' }}{{ r.points }}
          </span>
          <button class="flex-none text-[13px] text-ink-gray-4 hover:text-ink-red-4" @click="deleteRule(r)">✕</button>
        </div>
      </div>

      <!-- preview / distribution -->
      <div class="scb min-h-0 w-[360px] flex-none overflow-y-auto border-l border-outline-gray-1 p-5">
        <div class="mb-2.5 text-[11px] font-bold uppercase tracking-[.07em] text-ink-gray-4">{{ __('Distribución') }}</div>
        <div v-for="g in legend" :key="g.grade" class="mb-2 flex items-center gap-3">
          <span class="w-4 text-[12.5px] font-bold" :style="`color:${g.color}`">{{ g.grade }}</span>
          <div class="h-2 flex-1 rounded-sm bg-surface-gray-2">
            <div class="h-full rounded-sm" :style="`width:${distPct(g.grade)}%;background:${g.color}`" />
          </div>
          <span class="w-8 text-right text-[12px] text-ink-gray-6">{{ dist[g.grade] || 0 }}</span>
        </div>

        <!-- 📈 backtest mensual (spec 5.4 remainder) — ¿los A cierran de verdad? -->
        <ScoreBacktest />

        <div v-if="preview.length" class="mt-5">
          <div class="mb-2.5 text-[11px] font-bold uppercase tracking-[.07em] text-ink-gray-4">{{ __('Vista previa') }} ({{ preview.length }})</div>
          <div v-for="p in preview" :key="p.lead" class="mb-1.5 flex items-center gap-2 rounded-md border border-outline-gray-1 px-2.5 py-1.5 text-[12px]">
            <span class="min-w-0 flex-1 truncate text-ink-gray-8">{{ p.lead_name || p.lead }}</span>
            <span class="text-ink-gray-5">{{ p.old_score }}</span>
            <span class="text-ink-gray-4">→</span>
            <span class="font-bold" :style="`color:${gradeColor(p.new_grade)}`">{{ p.new_score }}</span>
            <span class="rounded px-1 text-[9.5px] font-bold text-white" :style="`background:${gradeColor(p.new_grade)}`">{{ p.new_grade }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { createListResource, createResource, call as frappeCall, toast } from 'frappe-ui'
import { confirmDialog } from '@/utils/dialogs'
import { GRADE_COLORS } from '@/composables/crmFormat'
import ScoreBacktest from '@/components/doco/ScoreBacktest.vue'

const operators = ['equals', 'not equals', 'is set', 'is not set', 'contains', 'greater than', 'less than', 'in']
const legend = [
  { grade: 'A', range: '80-100', color: GRADE_COLORS.A[0] },
  { grade: 'B', range: '60-79', color: GRADE_COLORS.B[0] },
  { grade: 'C', range: '40-59', color: GRADE_COLORS.C[0] },
  { grade: 'D', range: '0-39', color: GRADE_COLORS.D[0] },
]

const rulesRes = createListResource({
  doctype: 'Lead Scoring Rule',
  fields: ['name', 'rule_name', 'enabled', 'field', 'operator', 'value', 'points'],
  orderBy: 'creation asc',
  pageLength: 100,
  auto: true,
})
const rules = computed(() => rulesRes.data || [])

const distRes = createResource({ url: 'doco_marketing.api.score_rules.get_score_distribution', auto: true })
const dist = computed(() => distRes.data || { A: 0, B: 0, C: 0, D: 0, Ungraded: 0 })
function distPct(g) {
  const total = ['A', 'B', 'C', 'D', 'Ungraded'].reduce((a, k) => a + (dist.value[k] || 0), 0) || 1
  return Math.round(((dist.value[g] || 0) / total) * 100)
}
function gradeColor(g) {
  return GRADE_COLORS[g]?.[0] || '#9aa2ae'
}

// preview
const previewRes = createResource({ url: 'doco_marketing.api.score_rules.preview_scores' })
const preview = computed(() => previewRes.data || [])
function runPreview() {
  previewRes.submit({ sample_limit: 25 })
}

// CRUD
const showAdd = ref(false)
const form = ref({ rule_name: '', field: '', operator: 'equals', value: '', points: 10 })
async function addRule() {
  try {
    await frappeCall('frappe.client.insert', {
      doc: { doctype: 'Lead Scoring Rule', enabled: 1, ...form.value },
    })
    form.value = { rule_name: '', field: '', operator: 'equals', value: '', points: 10 }
    showAdd.value = false
    toast.success(__('Regla creada'))
    rulesRes.reload()
    distRes.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo crear'))
  }
}
async function toggleRule(r) {
  await frappeCall('frappe.client.set_value', { doctype: 'Lead Scoring Rule', name: r.name, fieldname: 'enabled', value: r.enabled ? 0 : 1 })
  rulesRes.reload()
}
function deleteRule(r) {
  confirmDialog({
    title: __('Eliminar regla'),
    message: __('¿Eliminar esta regla?'),
    confirmLabel: __('Eliminar'),
    onConfirm: async () => {
      await frappeCall('frappe.client.delete', { doctype: 'Lead Scoring Rule', name: r.name })
      toast.success(__('Eliminada'))
      rulesRes.reload()
    },
  })
}
</script>
