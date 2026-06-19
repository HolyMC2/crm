<!--
  Leads list — FCRM redesign (handoff §5.2). Dense pro-tool table with Stage/Score/
  Source filters + live search + bulk select + New Lead modal. New page (upstream
  Leads.vue left untouched for rebase-cleanliness); data via createListResource.
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-white">
    <!-- toolbar -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 px-5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Leads') }}</span>
        <span class="rounded-full px-[9px] py-0.5 text-[11.5px] font-semibold text-ink-gray-6" style="background: #f1f2f4">
          {{ count }}
        </span>
        <div class="mx-1 h-[18px] w-px" style="background: #e4e7ec" />
        <div class="flex overflow-hidden rounded-lg border border-outline-gray-2">
          <button
            v-for="(v, i) in views"
            :key="v.key"
            class="inline-flex items-center gap-1 px-[11px] py-[5px] text-[12px]"
            :class="i ? 'border-l border-outline-gray-2' : ''"
            :style="v.key === 'list' ? 'background:#1c2230;color:#fff;font-weight:600' : 'background:#fff;color:#5b6472'"
            @click="v.to && $router.push(v.to)"
          >
            {{ v.label }}
          </button>
        </div>
        <div class="mx-1 h-[18px] w-px" style="background: #e4e7ec" />
        <FilterPopover :label="__('Stage')" :options="stageOptions" :selected="statusF" @update:selected="statusF = $event" />
        <FilterPopover :label="__('Score')" :options="scoreOptions" :selected="gradeF" @update:selected="gradeF = $event" />
        <FilterPopover :label="__('Source')" :options="sourceOptions" :selected="sourceF" @update:selected="sourceF = $event" />
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5 rounded-lg border border-outline-gray-2 px-2.5 py-1.5">
          <LucideSearch class="h-3.5 w-3.5 text-ink-gray-4" />
          <input
            :value="search"
            @input="onSearch($event.target.value)"
            :placeholder="__('Buscar leads…')"
            class="w-[140px] border-0 bg-transparent text-[12px] text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
          />
        </div>
        <button
          class="rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white"
          style="background: #16a34a"
          @click="showLeadModal = true"
        >
          + {{ __('New Lead') }}
        </button>
      </div>
    </div>

    <!-- active filter chips -->
    <div v-if="chips.length" class="flex flex-none flex-wrap items-center gap-2 border-b border-outline-gray-1 px-5 py-2">
      <span
        v-for="c in chips"
        :key="c.key"
        class="inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-1 text-[11.5px] font-medium"
        style="color: #16a34a; background: #e9f7ef; border-color: #c7ecd5"
      >
        {{ c.label }}
        <button class="text-[13px] leading-none" @click="removeChip(c)">×</button>
      </span>
      <button class="text-[11.5px] text-ink-gray-5" @click="clearAll">{{ __('Limpiar todo') }}</button>
    </div>

    <!-- bulk bar -->
    <div v-if="selectedRows.length" class="flex flex-none items-center gap-3 border-b border-outline-gray-1 bg-surface-gray-1 px-5 py-2">
      <span class="text-[12.5px] font-semibold text-ink-gray-8">{{ selectedRows.length }} {{ __('seleccionados') }}</span>
      <button class="rounded-md px-2.5 py-1 text-[12px] font-medium text-ink-red-4 hover:bg-surface-red-1" @click="bulkDelete">
        {{ __('Eliminar') }}
      </button>
      <button class="text-[12px] text-ink-gray-5" @click="selectedRows = []">{{ __('Deseleccionar') }}</button>
    </div>

    <!-- table header -->
    <div
      class="grid flex-none items-center border-b border-outline-gray-1 bg-surface-gray-1 px-5 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4"
      :style="`grid-template-columns:${GRID};height:34px`"
    >
      <input type="checkbox" style="accent-color: #16a34a" :checked="allSelected" @change="toggleAll" />
      <button class="text-left uppercase" @click="sortBy('lead_name')">{{ __('Contacto') }}{{ sortArrow('lead_name') }}</button>
      <button class="text-left uppercase" :style="'color:#16a34a'" @click="sortBy('lead_score')">{{ __('Score') }}{{ sortArrow('lead_score') }}</button>
      <div>{{ __('Stage') }}</div>
      <div>{{ __('Source') }}</div>
      <button class="text-left uppercase" @click="sortBy('modified')">{{ __('Última act.') }}{{ sortArrow('modified') }}</button>
      <div>{{ __('Owner') }}</div>
      <div />
    </div>

    <!-- rows -->
    <div class="scb min-h-0 flex-1 overflow-y-auto">
      <div v-if="leads.loading && !rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>
      <div v-else-if="!rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Sin leads') }}</div>

      <div
        v-for="r in rows"
        :key="r.name"
        class="grid cursor-pointer items-center border-b px-5 hover:bg-surface-gray-1"
        :style="`grid-template-columns:${GRID};min-height:50px;border-color:#f0f1f3`"
        @click="openLead(r.name)"
      >
        <input type="checkbox" style="accent-color: #16a34a" :checked="selectedRows.includes(r.name)" @click.stop="toggleRow(r.name)" />
        <div class="flex items-center gap-2">
          <span
            class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold"
            :style="`background:${avatarColor(label(r))[0]};color:${avatarColor(label(r))[1]}`"
          >
            {{ initials(label(r)) }}
          </span>
          <div class="min-w-0">
            <div class="truncate text-[13px] font-semibold text-ink-gray-9">{{ label(r) }}</div>
            <div class="truncate text-[11px] text-ink-gray-4">{{ r.organization || r.mobile_no || '—' }}</div>
          </div>
        </div>
        <div>
          <div class="mb-[3px] flex items-center justify-between" style="width: 62px">
            <span class="text-[12.5px] font-bold" :style="`color:${gradeColor(r.score_grade)}`">{{ r.lead_score ?? '—' }}</span>
            <span
              v-if="r.score_grade"
              class="rounded-[3px] px-[5px] py-px text-[9px] font-bold text-white"
              :style="`background:${gradeColor(r.score_grade)}`"
            >
              {{ r.score_grade }}
            </span>
          </div>
          <div class="h-1 rounded-sm" style="width: 62px; background: #f0f1f3">
            <div class="h-full rounded-sm" :style="`width:${Math.min(100, r.lead_score || 0)}%;background:${gradeColor(r.score_grade)}`" />
          </div>
        </div>
        <div>
          <span
            v-if="r.status"
            class="rounded-md px-2 py-[3px] text-[11.5px] font-semibold"
            :style="statusChip(r.status)"
          >
            {{ r.status }}
          </span>
        </div>
        <div class="flex items-center gap-1.5 text-[12px] text-ink-gray-6">
          <span v-if="r.source" class="h-[7px] w-[7px] flex-none rounded-full" :style="`background:${sourceDot(r.source)}`" />
          <span class="truncate">{{ r.source || '—' }}</span>
        </div>
        <div class="text-[12px] text-ink-gray-5">{{ timeAgo(r.modified) }}</div>
        <div>
          <span
            v-if="r.lead_owner"
            class="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[10px] font-semibold"
            :style="`background:${avatarColor(r.lead_owner)[0]};color:${avatarColor(r.lead_owner)[1]}`"
            :title="r.lead_owner"
          >
            {{ initials(ownerName(r.lead_owner)) }}
          </span>
        </div>
        <Dropdown :options="rowMenu(r)" @click.stop>
          <button class="text-[14px] text-ink-gray-4" @click.stop>···</button>
        </Dropdown>
      </div>

      <div v-if="leads.hasNextPage" class="py-3 text-center">
        <button class="rounded-lg border border-outline-gray-2 px-4 py-1.5 text-[12px] font-medium text-ink-gray-7" @click="leads.next()">
          {{ __('Cargar más') }}
        </button>
      </div>
    </div>

    <LeadModal v-if="showLeadModal" v-model="showLeadModal" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dropdown, createListResource, call as frappeCall, toast } from 'frappe-ui'
import LucideSearch from '~icons/lucide/search'
import { statusesStore } from '@/stores/statuses'
import { usersStore } from '@/stores/users'
import LeadModal from '@/components/Modals/LeadModal.vue'
import FilterPopover from '@/components/doco/leads/FilterPopover.vue'
import { GRADE_COLORS, avatarColor, initials, timeAgo, CHANNEL_META } from '@/composables/inbox'

const GRID = '28px 1fr 96px 130px 120px 110px 50px 26px'
const router = useRouter()
const { getLeadStatus } = statusesStore()
const { getUser } = usersStore()

const showLeadModal = ref(false)
const statusF = ref([])
const gradeF = ref([])
const sourceF = ref([])
const search = ref('')
const sort = ref({ field: 'lead_score', dir: 'desc' })
const selectedRows = ref([])

const leads = createListResource({
  doctype: 'CRM Lead',
  fields: [
    'name', 'lead_name', 'first_name', 'last_name', 'organization', 'mobile_no',
    'status', 'source', 'lead_owner', 'lead_score', 'score_grade', 'modified',
  ],
  orderBy: 'lead_score desc',
  pageLength: 50,
})
const rows = computed(() => leads.data || [])
const count = computed(() => leads.data?.length ?? 0)

function applyFilters() {
  const f = {}
  if (statusF.value.length) f.status = ['in', statusF.value]
  if (gradeF.value.length) f.score_grade = ['in', gradeF.value]
  if (sourceF.value.length) f.source = ['in', sourceF.value]
  if (search.value.trim()) f.lead_name = ['like', `%${search.value.trim()}%`]
  leads.filters = f
  leads.orderBy = `${sort.value.field} ${sort.value.dir}`
  leads.reload()
}
watch([statusF, gradeF, sourceF], applyFilters, { deep: true })
let _t = null
function onSearch(v) {
  search.value = v
  clearTimeout(_t)
  _t = setTimeout(applyFilters, 300)
}
function sortBy(field) {
  const dir = sort.value.field === field && sort.value.dir === 'desc' ? 'asc' : 'desc'
  sort.value = { field, dir }
  applyFilters()
}
function sortArrow(field) {
  if (sort.value.field !== field) return ''
  return sort.value.dir === 'desc' ? ' ↓' : ' ↑'
}
onMounted(applyFilters)

// ── filter options ───────────────────────────────────────────────────────────
const leadStatuses = createListResource({
  doctype: 'CRM Lead Status',
  fields: ['name', 'color'],
  orderBy: 'position asc',
  pageLength: 50,
  auto: true,
})
const stageOptions = computed(() =>
  (leadStatuses.data || []).map((s) => ({ value: s.name, label: s.name, color: s.color })),
)
const scoreOptions = [
  { value: 'A', label: 'A · 80+', color: GRADE_COLORS.A[0] },
  { value: 'B', label: 'B · 60+', color: GRADE_COLORS.B[0] },
  { value: 'C', label: 'C · 40+', color: GRADE_COLORS.C[0] },
  { value: 'D', label: 'D · <40', color: GRADE_COLORS.D[0] },
]
const sources = createListResource({
  doctype: 'CRM Lead Source',
  fields: ['name'],
  pageLength: 50,
  auto: true,
})
const sourceOptions = computed(() => (sources.data || []).map((s) => ({ value: s.name, label: s.name })))

// ── chips ────────────────────────────────────────────────────────────────────
const chips = computed(() => {
  const out = []
  for (const v of statusF.value) out.push({ key: `st:${v}`, type: 'status', value: v, label: v })
  for (const v of gradeF.value) out.push({ key: `gr:${v}`, type: 'grade', value: v, label: `Score ${v}` })
  for (const v of sourceF.value) out.push({ key: `sr:${v}`, type: 'source', value: v, label: v })
  return out
})
function removeChip(c) {
  const ref_ = { status: statusF, grade: gradeF, source: sourceF }[c.type]
  ref_.value = ref_.value.filter((x) => x !== c.value)
}
function clearAll() {
  statusF.value = []
  gradeF.value = []
  sourceF.value = []
}

// ── view helpers ─────────────────────────────────────────────────────────────
const views = [
  { key: 'list', label: '≡ List' },
  { key: 'board', label: '⊞ Board' },
  { key: 'cal', label: '📅 Cal', to: '/calendar' },
]
function label(r) {
  return r.lead_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.mobile_no || r.name
}
function gradeColor(g) {
  return GRADE_COLORS[g]?.[0] || '#9aa2ae'
}
function statusChip(status) {
  const c = getLeadStatus(status)?.color || '#5b6472'
  return `color:${c};background:${c}1a`
}
function sourceDot(source) {
  const key = String(source || '').toLowerCase()
  for (const k of Object.keys(CHANNEL_META)) if (key.includes(k) || key.includes(CHANNEL_META[k][0].toLowerCase())) return CHANNEL_META[k][1]
  return '#9aa2ae'
}
function ownerName(email) {
  return getUser(email)?.full_name || email
}

// ── selection + rows ─────────────────────────────────────────────────────────
const allSelected = computed(() => rows.value.length > 0 && selectedRows.value.length === rows.value.length)
function toggleAll() {
  selectedRows.value = allSelected.value ? [] : rows.value.map((r) => r.name)
}
function toggleRow(name) {
  selectedRows.value = selectedRows.value.includes(name)
    ? selectedRows.value.filter((n) => n !== name)
    : [...selectedRows.value, name]
}
function openLead(name) {
  router.push(`/leads/${name}`)
}
function rowMenu(r) {
  return [
    { label: __('Abrir'), onClick: () => openLead(r.name) },
    { label: __('Eliminar'), onClick: () => deleteLead(r.name) },
  ]
}
async function deleteLead(name) {
  if (!window.confirm(__('¿Eliminar este lead?'))) return
  await frappeCall('frappe.client.delete', { doctype: 'CRM Lead', name })
  toast.success(__('Lead eliminado'))
  leads.reload()
}
async function bulkDelete() {
  if (!window.confirm(__('¿Eliminar {0} leads?', [selectedRows.value.length]))) return
  for (const name of selectedRows.value) {
    await frappeCall('frappe.client.delete', { doctype: 'CRM Lead', name })
  }
  toast.success(__('Leads eliminados'))
  selectedRows.value = []
  leads.reload()
}
</script>
