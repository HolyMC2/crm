<!--
  Tasks list — FCRM redesign (handoff §5.7). Tabs (All/Overdue/Today/Upcoming) +
  dense table + inline done + the real wired CRM Task modal (create/edit). Upstream Tasks.vue kept at
  /tasks/view/:viewType. No new backend (CRM Task CRUD).
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-white">
    <!-- toolbar -->
    <div class="flex min-h-[52px] flex-none flex-wrap items-center justify-between gap-y-1.5 border-b border-outline-gray-1 px-5 py-1.5">
      <div class="flex items-center gap-2">
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Tareas') }}</span>
        <div class="ml-1 flex overflow-hidden rounded-lg border border-outline-gray-2">
          <button
            v-for="(s, i) in scopes"
            :key="s.key"
            class="px-[11px] py-[5px] text-[12px]"
            :class="[i ? 'border-l border-outline-gray-2' : '', scope === s.key ? 'bg-surface-gray-3 text-ink-gray-9 font-semibold' : 'bg-surface-white text-ink-gray-6']"
            @click="scope = s.key"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
      <button class="rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white" style="background: #16a34a" @click="openNew">
        + {{ __('Nueva tarea') }}
      </button>
    </div>

    <!-- tabs -->
    <div class="flex flex-none items-center gap-1.5 border-b border-outline-gray-1 px-5 py-2">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="rounded-full px-3 py-1 text-[11.5px] font-semibold"
        :class="tabStyle(t)"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- header -->
    <div
      class="grid flex-none items-center border-b border-outline-gray-1 bg-surface-gray-1 px-5 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4"
      :style="`grid-template-columns:${GRID};height:34px`"
    >
      <div />
      <div>{{ __('Tarea') }}</div>
      <template v-if="!isMobile">
        <div>{{ __('Deal') }}</div>
        <div>{{ __('Prioridad') }}</div>
      </template>
      <div>{{ __('Vence') }}</div>
      <div />
    </div>

    <!-- rows -->
    <div class="scb min-h-0 flex-1 overflow-y-auto">
      <div v-if="tasks.loading && !rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Cargando…') }}</div>
      <div v-else-if="!rows.length" class="py-10 text-center text-xs text-ink-gray-4">{{ __('Sin tareas') }}</div>

      <div
        v-for="t in rows"
        :key="t.name"
        class="grid items-center border-b border-outline-gray-1 px-5"
        :class="rowClass(t)"
        :style="`grid-template-columns:${GRID};min-height:52px`"
      >
        <button
          class="flex h-5 w-5 flex-none items-center justify-center rounded-md border-[1.5px]"
          :class="t.status === 'Done' ? 'bg-surface-green-3 border-outline-green-2 text-white' : 'border-outline-gray-3'"
          @click="toggleDone(t)"
        >
          <span v-if="t.status === 'Done'" class="text-[12px]">✓</span>
        </button>
        <div class="flex min-w-0 items-center gap-2">
          <button
            class="block min-w-0 flex-1 truncate text-left text-[13px] font-semibold hover:underline"
            :class="t.status === 'Done' ? 'text-ink-gray-5 line-through' : 'text-ink-gray-9'"
            @click="openEdit(t)"
          >
            {{ t.title }}
          </button>
          <span
            v-if="t.assigned_to"
            class="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[9px] font-semibold"
            :style="`background:${avatarColor(t.assigned_to)[0]};color:${avatarColor(t.assigned_to)[1]}`"
            :title="ownerName(t.assigned_to)"
          >
            {{ initials(ownerName(t.assigned_to)) }}
          </span>
        </div>
        <template v-if="!isMobile">
          <button
            v-if="t.reference_doctype === 'CRM Deal' && t.reference_docname"
            class="truncate text-left text-[12px] text-ink-blue-link hover:underline"
            @click="openConversation(t)"
          >
            {{ t.reference_docname }}
          </button>
          <span v-else class="text-[12px] text-ink-gray-4">—</span>
          <div>
            <span v-if="t.priority" class="rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold" :class="prioStyle(t.priority)">{{ t.priority }}</span>
          </div>
        </template>
        <div class="text-[12px]" :class="dueClass(t)">{{ t.due_date ? dueText(t.due_date) : '—' }}</div>
        <Dropdown :options="rowMenu(t)" @click.stop>
          <button class="text-[14px] text-ink-gray-4">···</button>
        </Dropdown>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Dropdown, createListResource, call as frappeCall, toast } from 'frappe-ui'
import { confirmDialog } from '@/utils/dialogs'
import { usersStore } from '@/stores/users'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { avatarColor, initials } from '@/composables/crmFormat'
import { isMobile } from '@/composables/breakpoint'

// the real wired CRM Task modal (date/assignee/priority/reminder/notifications),
// mounted globally via DoctypeModals in App.vue
const { showModal } = useDoctypeModal()
const taskCallbacks = { afterInsert: () => applyFilters(), afterUpdate: () => applyFilters() }
function openNew() {
  showModal({ doctype: 'CRM Task', title: __('Task'), defaults: { status: 'Backlog', priority: 'Low' }, callbacks: taskCallbacks })
}
function openEdit(t) {
  showModal({ name: t.name, doctype: 'CRM Task', title: __('Task'), callbacks: taskCallbacks })
}

// phone: done-toggle + task + due + menu — the deal/priority columns forced
// a 414px+ fixed track sum = horizontal scroll on every phone (Marco 07-25)
const GRID = computed(() =>
  isMobile.value ? '28px 1fr 92px 26px' : '28px 1fr 150px 100px 110px 26px',
)
const router = useRouter()
const { getUser } = usersStore()
const currentUser = computed(() => getUser()?.name)

const scope = ref('mine') // mine | all
const scopes = [
  { key: 'mine', label: __('Mis tareas') },
  { key: 'all', label: __('Todo el equipo') },
]
const tab = ref('all') // all | overdue | today | upcoming
const tabs = [
  { key: 'all', label: __('Todas') },
  { key: 'overdue', label: __('Vencidas'), color: '#e5484d' },
  { key: 'today', label: __('Hoy'), color: '#d9930b' },
  { key: 'upcoming', label: __('Próximas') },
]

function localDate(d) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().slice(0, 10)
}
function nowStr() {
  const d = new Date()
  return `${localDate(d)} ${d.toTimeString().slice(0, 8)}`
}

const tasks = createListResource({
  doctype: 'CRM Task',
  fields: ['name', 'title', 'status', 'priority', 'due_date', 'assigned_to', 'reference_doctype', 'reference_docname'],
  orderBy: 'due_date asc',
  pageLength: 100,
})
const rows = computed(() => tasks.data || [])

function applyFilters() {
  const f = { status: ['not in', ['Done', 'Canceled']] }
  // exact match (a LIKE %user% substring matched ana@x.com inside mariana@x.com,
  // and disagreed with the nav-rail badge's exact filter)
  if (scope.value === 'mine' && currentUser.value) f.assigned_to = currentUser.value
  const todayStr = localDate(new Date())
  if (tab.value === 'overdue') f.due_date = ['<', nowStr()]
  else if (tab.value === 'today') f.due_date = ['between', [`${todayStr} 00:00:00`, `${todayStr} 23:59:59`]]
  else if (tab.value === 'upcoming') f.due_date = ['>', `${todayStr} 23:59:59`]
  tasks.filters = f
  tasks.reload()
}
watch([scope, tab, currentUser], applyFilters, { immediate: true })

// ── row styling ───────────────────────────────────────────────────────────────
function isOverdue(t) {
  return t.due_date && new Date(String(t.due_date).replace(' ', 'T')) < new Date() && t.status !== 'Done'
}
function isToday(t) {
  return t.due_date && localDate(new Date(String(t.due_date).replace(' ', 'T'))) === localDate(new Date())
}
// Native-token class strings (theme-aware) — bound via :class, not :style.
function rowClass(t) {
  if (isOverdue(t)) return 'border-l-[3px] border-outline-red-2 bg-surface-red-1'
  if (isToday(t)) return 'border-l-[3px] border-outline-amber-2 bg-surface-amber-1'
  return ''
}
function dueClass(t) {
  if (isOverdue(t)) return 'text-ink-red-4 font-semibold'
  if (isToday(t)) return 'text-ink-amber-3 font-semibold'
  return 'text-ink-gray-6'
}
function dueText(d) {
  return new Date(String(d).replace(' ', 'T')).toLocaleDateString()
}
function prioStyle(p) {
  return (
    { Urgent: 'text-ink-red-4 bg-surface-red-1', High: 'text-ink-amber-3 bg-surface-amber-1', Medium: 'text-ink-blue-2 bg-surface-blue-1', Low: 'text-ink-gray-6 bg-surface-gray-2' }[p] ||
    'text-ink-gray-6 bg-surface-gray-2'
  )
}
function tabStyle(t) {
  if (tab.value === t.key) return 'bg-surface-gray-3 text-ink-gray-9'
  const c = t.key === 'overdue' ? 'text-ink-red-4' : t.key === 'today' ? 'text-ink-amber-3' : 'text-ink-gray-6'
  return `bg-surface-gray-2 ${c}`
}

// ── actions ───────────────────────────────────────────────────────────────────
async function toggleDone(t) {
  const next = t.status === 'Done' ? 'Todo' : 'Done'
  await frappeCall('frappe.client.set_value', { doctype: 'CRM Task', name: t.name, fieldname: 'status', value: next })
  applyFilters()
}
function ownerName(email) {
  return getUser(email)?.full_name || email
}
function deleteTask(t) {
  confirmDialog({
    title: __('Eliminar tarea'),
    message: __('¿Eliminar esta tarea?'),
    confirmLabel: __('Eliminar'),
    onConfirm: async () => {
      await frappeCall('frappe.client.delete', { doctype: 'CRM Task', name: t.name })
      toast.success(__('Eliminada'))
      applyFilters()
    },
  })
}
function openConversation(t) {
  // deep-link the inbox to this deal (Inbox.vue reads ?deal= and selects it)
  router.push({ path: '/inbox', query: { deal: t.reference_docname } })
}
function rowMenu(t) {
  return [
    { label: __('Editar'), onClick: () => openEdit(t) },
    { label: t.status === 'Done' ? __('Reabrir') : __('Marcar hecho'), onClick: () => toggleDone(t) },
    ...(t.reference_doctype === 'CRM Deal' ? [{ label: __('Abrir conversación'), onClick: () => openConversation(t) }] : []),
    { label: __('Eliminar'), onClick: () => deleteTask(t) },
  ]
}
</script>
