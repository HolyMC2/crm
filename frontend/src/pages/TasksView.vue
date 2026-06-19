<!--
  Tasks list — FCRM redesign (handoff §5.7). Tabs (All/Overdue/Today/Upcoming) +
  dense table + inline done/reschedule/delete. New page; upstream Tasks.vue kept at
  /tasks/view/:viewType. No new backend (CRM Task CRUD).
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-white">
    <!-- toolbar -->
    <div class="flex h-[52px] flex-none items-center justify-between border-b border-outline-gray-1 px-5">
      <div class="flex items-center gap-2">
        <span class="text-[15px] font-bold text-ink-gray-9">{{ __('Tareas') }}</span>
        <div class="ml-1 flex overflow-hidden rounded-lg border border-outline-gray-2">
          <button
            v-for="(s, i) in scopes"
            :key="s.key"
            class="px-[11px] py-[5px] text-[12px]"
            :class="i ? 'border-l border-outline-gray-2' : ''"
            :style="scope === s.key ? 'background:#1c2230;color:#fff;font-weight:600' : 'background:#fff;color:#5b6472'"
            @click="scope = s.key"
          >
            {{ s.label }}
          </button>
        </div>
      </div>
      <button class="rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white" style="background: #16a34a" @click="showAdd = !showAdd">
        + {{ __('Nueva tarea') }}
      </button>
    </div>

    <!-- tabs -->
    <div class="flex flex-none items-center gap-1.5 border-b border-outline-gray-1 px-5 py-2">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="rounded-full px-3 py-1 text-[11.5px] font-semibold"
        :style="tabStyle(t)"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="showAdd" class="flex flex-none gap-2 border-b border-outline-gray-1 px-5 py-2">
      <input
        v-model="newTitle"
        :placeholder="__('Título de la tarea…')"
        class="flex-1 rounded-[9px] border border-outline-gray-2 px-3 py-2 text-[13px] focus:outline-none focus:ring-0"
        @keydown.enter="addTask"
      />
      <button class="rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50" style="background: #16a34a" :disabled="!newTitle.trim() || adding" @click="addTask">
        {{ __('Crear') }}
      </button>
    </div>

    <!-- header -->
    <div
      class="grid flex-none items-center border-b border-outline-gray-1 bg-surface-gray-1 px-5 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4"
      :style="`grid-template-columns:${GRID};height:34px`"
    >
      <div />
      <div>{{ __('Tarea') }}</div>
      <div>{{ __('Deal') }}</div>
      <div>{{ __('Prioridad') }}</div>
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
        class="grid items-center border-b px-5"
        :style="`grid-template-columns:${GRID};min-height:52px;${rowStyle(t)}`"
      >
        <button
          class="flex h-5 w-5 flex-none items-center justify-center rounded-md border-[1.5px]"
          :style="t.status === 'Done' ? 'background:#16a34a;border-color:#16a34a;color:#fff' : 'border-color:#cdd2da'"
          @click="toggleDone(t)"
        >
          <span v-if="t.status === 'Done'" class="text-[12px]">✓</span>
        </button>
        <div class="min-w-0">
          <div class="truncate text-[13px] font-semibold" :class="t.status === 'Done' ? 'text-ink-gray-5 line-through' : 'text-ink-gray-9'">
            {{ t.title }}
          </div>
          <div v-if="t.assigned_to" class="truncate text-[11px] text-ink-gray-4">{{ t.assigned_to }}</div>
        </div>
        <button
          v-if="t.reference_doctype === 'CRM Deal' && t.reference_docname"
          class="truncate text-left text-[12px] text-ink-blue-link hover:underline"
          @click="openConversation(t)"
        >
          {{ t.reference_docname }}
        </button>
        <span v-else class="text-[12px] text-ink-gray-4">—</span>
        <div>
          <span v-if="t.priority" class="rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold" :style="prioStyle(t.priority)">{{ t.priority }}</span>
        </div>
        <div class="text-[12px]" :style="dueColor(t)">{{ t.due_date ? dueText(t.due_date) : '—' }}</div>
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
import { usersStore } from '@/stores/users'

const GRID = '28px 1fr 150px 100px 110px 26px'
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
function rowStyle(t) {
  if (isOverdue(t)) return 'border-left:3px solid #e5484d;background:#fffbfb;border-color:#f0f1f3'
  if (isToday(t)) return 'border-left:3px solid #d9930b;background:#fffdf5;border-color:#f0f1f3'
  return 'border-color:#f0f1f3'
}
function dueColor(t) {
  if (isOverdue(t)) return 'color:#e5484d;font-weight:600'
  if (isToday(t)) return 'color:#b9790a;font-weight:600'
  return 'color:#5b6472'
}
function dueText(d) {
  return new Date(String(d).replace(' ', 'T')).toLocaleDateString()
}
function prioStyle(p) {
  return (
    { Urgent: 'color:#e5484d;background:#fdecec', High: 'color:#b9790a;background:#fdf6e9', Medium: 'color:#2563c9;background:#eaf1fe', Low: 'color:#5b6472;background:#f1f2f4' }[p] ||
    'color:#5b6472;background:#f1f2f4'
  )
}
function tabStyle(t) {
  if (tab.value === t.key) return 'color:#fff;background:#1c2230'
  return `color:${t.color || '#5b6472'};background:#f1f2f4`
}

// ── actions ───────────────────────────────────────────────────────────────────
async function toggleDone(t) {
  const next = t.status === 'Done' ? 'Todo' : 'Done'
  await frappeCall('frappe.client.set_value', { doctype: 'CRM Task', name: t.name, fieldname: 'status', value: next })
  applyFilters()
}
async function reschedule(t) {
  const next = window.prompt(__('Nueva fecha (YYYY-MM-DD HH:MM)'))
  if (!next) return
  await frappeCall('frappe.client.set_value', { doctype: 'CRM Task', name: t.name, fieldname: 'due_date', value: next })
  toast.success(__('Reprogramada'))
  applyFilters()
}
async function deleteTask(t) {
  if (!window.confirm(__('¿Eliminar esta tarea?'))) return
  await frappeCall('frappe.client.delete', { doctype: 'CRM Task', name: t.name })
  toast.success(__('Eliminada'))
  applyFilters()
}
function openConversation(t) {
  // deep-link the inbox to this deal (Inbox.vue reads ?deal= and selects it)
  router.push({ path: '/inbox', query: { deal: t.reference_docname } })
}
function rowMenu(t) {
  return [
    { label: t.status === 'Done' ? __('Reabrir') : __('Marcar hecho'), onClick: () => toggleDone(t) },
    { label: __('Reprogramar'), onClick: () => reschedule(t) },
    ...(t.reference_doctype === 'CRM Deal' ? [{ label: __('Abrir conversación'), onClick: () => openConversation(t) }] : []),
    { label: __('Eliminar'), onClick: () => deleteTask(t) },
  ]
}

// ── add ───────────────────────────────────────────────────────────────────────
const showAdd = ref(false)
const newTitle = ref('')
const adding = ref(false)
async function addTask() {
  const title = newTitle.value.trim()
  if (!title || adding.value) return
  adding.value = true
  try {
    await frappeCall('frappe.client.insert', { doc: { doctype: 'CRM Task', title, status: 'Todo' } })
    newTitle.value = ''
    showAdd.value = false
    toast.success(__('Tarea creada'))
    applyFilters()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo crear'))
  } finally {
    adding.value = false
  }
}
</script>
