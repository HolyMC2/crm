<!--
  WorkloadView — manager surface (P2 spec 7.2 / S11). Who owns how many OPEN
  conversations, who is over their auto-assign cap, and one-tap reassignment. Pairs with
  the per-agent metrics (S2) and the 2.3 auto-assignment machinery; the numbers come
  straight from doco_marketing.api.workload.get_workload, which reuses the assignment
  service's own pool + open-load definitions.

  Manager-gated server-side (System/Sales Manager). A non-manager gets a PermissionError
  → the amber "solo gerentes" banner (same pattern as ReportsAgents / Reports). Mobile
  first: agent cards with a load bar vs cap + overdue badge; tap an agent to see their
  open conversations, multi-select, and reassign to another agent in the pool. frappe-ui
  tokens only (dark-safe), es-MX via __().
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-base">
    <!-- manager gate -->
    <div v-if="restricted" class="p-5">
      <div
        class="rounded-[10px] border border-outline-amber-4 bg-surface-amber-1 px-4 py-2.5 text-[12.5px] text-ink-amber-7"
      >
        {{ __('La carga de trabajo requiere permiso de gerente (Sales Manager o System Manager).') }}
      </div>
    </div>

    <template v-else>
      <!-- stats -->
      <div class="flex flex-none items-center justify-between border-b border-outline-gray-1 px-5 py-3">
        <div class="flex gap-6">
          <Stat :label="__('Agentes')" :value="agents.length" />
          <Stat :label="__('Sin asignar')" :value="data.unassigned" :color="data.unassigned ? '#e5484d' : undefined" />
          <Stat :label="__('Sobre cap')" :value="overCapCount" :color="overCapCount ? '#e5484d' : undefined" />
        </div>
        <button
          class="press rounded-lg border border-outline-gray-2 px-3 py-[7px] text-[12.5px] font-semibold text-ink-gray-7"
          @click="load"
        >
          {{ __('Actualizar') }}
        </button>
      </div>

      <!-- sort chips -->
      <div class="flex flex-none flex-wrap items-center gap-1.5 border-b border-outline-gray-1 px-5 py-2.5">
        <button
          v-for="c in columns"
          :key="c.key"
          type="button"
          class="press rounded-full px-2.5 py-1 text-[11px] font-medium"
          :class="sort.key === c.key ? 'bg-surface-gray-3 text-ink-gray-9' : 'bg-surface-gray-2 text-ink-gray-6'"
          :aria-pressed="sort.key === c.key"
          @click="onSort(c.key)"
        >
          {{ c.label }}<span v-if="sort.key === c.key"> {{ sort.dir === 'desc' ? '▼' : '▲' }}</span>
        </button>
      </div>

      <!-- agent list -->
      <div class="scb min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div v-if="loading && !agents.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>
        <div v-else-if="!agents.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Nadie en la rotación') }}</div>

        <div v-else class="flex flex-col gap-2.5">
          <div
            v-for="a in sorted"
            :key="a.user"
            class="rounded-[10px] border bg-surface-base"
            :class="a.user === selectedAgent ? 'border-outline-gray-3' : 'border-outline-gray-2'"
          >
            <!-- card head (tap to open conversations) -->
            <button class="press flex w-full items-center gap-3 p-3 text-left" :aria-expanded="a.user === selectedAgent" @click="openAgent(a)">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate text-[13.5px] font-bold text-ink-gray-9" :title="a.user">{{ a.full_name }}</span>
                  <span
                    v-if="a.over_cap"
                    class="flex-none rounded-md bg-surface-red-1 px-1.5 py-[1px] text-[10px] font-bold text-ink-red-7 dark:text-ink-red-8"
                  >
                    {{ __('sobre cap') }}
                  </span>
                  <span
                    v-if="a.sla_overdue_count"
                    class="flex-none rounded-md bg-surface-amber-1 px-1.5 py-[1px] text-[10px] font-bold text-ink-amber-7"
                    :title="__('Conversaciones con SLA vencido')"
                  >
                    ⏰ {{ a.sla_overdue_count }}
                  </span>
                </div>
                <div class="mt-1 flex items-center gap-2">
                  <div class="text-[11.5px] text-ink-gray-5">
                    {{ a.open_total }} {{ __('abiertas') }}
                    <span class="text-ink-gray-4">· {{ a.open_leads }} leads · {{ a.open_deals }} deals</span>
                  </div>
                </div>
                <!-- load bar vs cap -->
                <div v-if="cap > 0" class="mt-2 flex items-center gap-2">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-gray-3">
                    <div class="h-full rounded-full" :class="barToken(a.open_total, cap)" :style="`width:${barWidth(a.open_total, cap)}%`" />
                  </div>
                  <span class="w-11 flex-none text-right text-[10.5px] font-medium text-ink-gray-5">{{ a.open_total }}/{{ cap }}</span>
                </div>
              </div>
              <span class="flex-none text-[15px] text-ink-gray-4">{{ a.user === selectedAgent ? '▾' : '›' }}</span>
            </button>

            <!-- conversations panel -->
            <div v-if="a.user === selectedAgent" class="border-t border-outline-gray-1 px-3 pb-3 pt-2">
              <div v-if="convLoading" class="py-4 text-center text-[11.5px] text-ink-gray-4">{{ __('Cargando conversaciones…') }}</div>
              <div v-else-if="!conversations.length" class="py-4 text-center text-[11.5px] text-ink-gray-4">{{ __('Sin conversaciones') }}</div>

              <template v-else>
                <div class="mb-1.5 flex items-center justify-between">
                  <button class="press text-[11px] font-semibold text-ink-gray-6" @click="toggleAll">
                    {{ allSelected ? __('Quitar selección') : __('Seleccionar todo') }}
                  </button>
                  <span class="text-[11px] text-ink-gray-4">{{ selected.size }} {{ __('seleccionadas') }}</span>
                </div>

                <div class="flex flex-col gap-1">
                  <button
                    v-for="c in conversations"
                    :key="c.key"
                    type="button"
                    role="checkbox"
                    :aria-checked="selected.has(c.key)"
                    :aria-label="c.label"
                    class="press flex items-center gap-2.5 rounded-[8px] border px-2.5 py-2 text-left"
                    :class="selected.has(c.key) ? 'border-outline-green-4 bg-surface-green-1' : 'border-outline-gray-1 bg-surface-base'"
                    @click="toggle(c.key)"
                  >
                    <span
                      class="flex h-4 w-4 flex-none items-center justify-center rounded-[5px] border text-[10px] text-ink-green-1"
                      :class="selected.has(c.key) ? 'border-transparent bg-surface-green-7' : 'border-outline-gray-3 bg-surface-base'"
                    >
                      <span v-if="selected.has(c.key)">✓</span>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[12.5px] font-medium text-ink-gray-9">{{ c.label }}</span>
                      <span class="block truncate text-[10.5px] text-ink-gray-4">{{ c.kind }} · {{ c.status || '—' }}</span>
                    </span>
                  </button>
                </div>

                <!-- reassign footer -->
                <div class="mt-2.5 flex items-center justify-end">
                  <Dropdown v-if="selected.size" :options="reassignOptions" placement="right">
                    <button
                      class="press rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white"
                      style="background: var(--brand)"
                    >
                      {{ __('Reasignar a…') }}
                    </button>
                  </Dropdown>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, h, ref } from 'vue'
import { call, createListResource, toast, Dropdown } from 'frappe-ui'
import { barToken, barWidth, sortWorkload } from '@/utils/workloadFormat'

const columns = [
  { key: 'open_total', label: __('Abiertas') },
  { key: 'open_deals', label: __('Deals') },
  { key: 'open_leads', label: __('Leads') },
  { key: 'sla_overdue_count', label: __('SLA') },
  { key: 'full_name', label: __('Agente') },
]

// ── workload (manager-gated; PermissionError → banner) ───────────────────────
const restricted = ref(false)
const loading = ref(false)
const data = ref({ cap: 0, unassigned: 0, agents: [] })

async function load() {
  loading.value = true
  restricted.value = false
  try {
    data.value = await call('doco_marketing.api.workload.get_workload')
  } catch (e) {
    restricted.value = true
  } finally {
    loading.value = false
  }
}
load()

const cap = computed(() => data.value.cap || 0)
const agents = computed(() => data.value.agents || [])
const overCapCount = computed(() => agents.value.filter((a) => a.over_cap).length)

const sort = ref({ key: 'open_total', dir: 'desc' })
const sorted = computed(() => sortWorkload(agents.value, sort.value.key, sort.value.dir))
function onSort(key) {
  // clicking a new column starts descending; re-clicking the active one toggles.
  if (sort.value.key !== key) sort.value = { key, dir: 'desc' }
  else sort.value = { key, dir: sort.value.dir === 'desc' ? 'asc' : 'desc' }
}

// ── per-agent conversations (owner-filtered; NOT get_conversation_queue — that's a
//    shared file. Plain list resources with an owner filter, newest-first). ─────
const selectedAgent = ref(null)
const selected = ref(new Set())

const deals = createListResource({
  doctype: 'CRM Deal',
  fields: ['name', 'status', 'modified', 'organization'],
  orderBy: 'modified desc',
  pageLength: 50,
})
const leads = createListResource({
  doctype: 'CRM Lead',
  fields: ['name', 'status', 'modified', 'lead_name'],
  orderBy: 'modified desc',
  pageLength: 50,
})
const convLoading = computed(() => deals.loading || leads.loading)

const conversations = computed(() => {
  const d = (deals.data || []).map((r) => ({
    key: `CRM Deal:${r.name}`,
    label: r.organization || r.name,
    status: r.status,
    kind: __('Deal'),
    modified: r.modified,
  }))
  const l = (leads.data || []).map((r) => ({
    key: `CRM Lead:${r.name}`,
    label: r.lead_name || r.name,
    status: r.status,
    kind: __('Lead'),
    modified: r.modified,
  }))
  return [...d, ...l].sort((a, b) => (a.modified < b.modified ? 1 : -1))
})

function openAgent(a) {
  if (selectedAgent.value === a.user) {
    selectedAgent.value = null
    return
  }
  selectedAgent.value = a.user
  selected.value = new Set()
  // same OPEN definition as the card counts (get_workload returns the terminal
  // sets) — without this the drill-down listed closed deals the count excluded.
  const term = data.value?.terminal || {}
  deals.filters = { deal_owner: a.user }
  if (term['CRM Deal']?.length) deals.filters.status = ['not in', term['CRM Deal']]
  leads.filters = { lead_owner: a.user }
  if (term['CRM Lead']?.length) leads.filters.status = ['not in', term['CRM Lead']]
  deals.reload()
  leads.reload()
}

function toggle(key) {
  const s = new Set(selected.value)
  s.has(key) ? s.delete(key) : s.add(key)
  selected.value = s
}
const allSelected = computed(
  () => conversations.value.length > 0 && conversations.value.every((c) => selected.value.has(c.key)),
)
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(conversations.value.map((c) => c.key))
}

// picker = the other agents in the pool (never reassign to the same owner).
const reassignOptions = computed(() =>
  agents.value
    .filter((a) => a.user !== selectedAgent.value)
    .map((a) => ({ label: a.full_name, onClick: () => reassignSelected(a.user) })),
)

async function reassignSelected(toUser) {
  const items = [...selected.value].map((k) => {
    const i = k.indexOf(':')
    return { doctype: k.slice(0, i), name: k.slice(i + 1) }
  })
  if (!items.length) return
  try {
    const res = await call('doco_marketing.api.workload.reassign_bulk', {
      items: JSON.stringify(items),
      to_user: toUser,
    })
    const moved = res?.moved || 0
    const failed = items.length - moved
    if (moved) toast.success(__('{0} conversación(es) reasignada(s)', [moved]))
    if (failed) toast.error(__('{0} no se pudo(ieron) reasignar', [failed]))
    selected.value = new Set()
    await load()
    deals.reload()
    leads.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo reasignar'))
  }
}

// tiny inline stat (same shape as CallsView.vue)
const Stat = (props) =>
  h('div', {}, [
    h('div', { class: 'text-[10px] font-semibold uppercase tracking-[.07em] text-ink-gray-4' }, props.label),
    h(
      'div',
      {
        class: 'text-[18px] font-bold ' + (props.color ? '' : 'text-ink-gray-9'),
        style: props.color ? `color:${props.color}` : undefined,
      },
      String(props.value ?? 0),
    ),
  ])
Stat.props = ['label', 'value', 'color']
</script>
