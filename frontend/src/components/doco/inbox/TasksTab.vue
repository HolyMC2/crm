<!-- Inbox Tasks tab — deal tasks via createListResource('CRM Task'), inline add + done. §5.1 -->
<template>
  <div class="scb flex-1 overflow-y-auto px-5 pb-6 pt-4">
    <div class="mb-3.5 flex items-center justify-between">
      <div class="text-[15px] font-bold text-ink-gray-9">{{ __('Tareas del deal') }}</div>
      <button
        class="rounded-lg px-3 py-[7px] text-[12px] font-semibold text-white"
        style="background: #16a34a"
        @click="showAdd = !showAdd"
      >
        ＋ {{ __('Nueva tarea') }}
      </button>
    </div>

    <div v-if="showAdd" class="mb-2.5 flex gap-2">
      <input
        v-model="newTitle"
        :placeholder="__('Título de la tarea…')"
        class="flex-1 rounded-[9px] border border-outline-gray-2 px-3 py-2 text-[13px] focus:outline-none focus:ring-0"
        @keydown.enter="addTask"
      />
      <button
        class="rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
        style="background: #16a34a"
        :disabled="!newTitle.trim() || adding"
        @click="addTask"
      >
        {{ __('Crear') }}
      </button>
    </div>

    <div v-if="tasks.loading && !rows.length" class="py-6 text-center text-xs text-ink-gray-4">
      {{ __('Cargando…') }}
    </div>
    <div v-else-if="!rows.length" class="py-6 text-center text-xs text-ink-gray-4">
      {{ __('Sin tareas') }}
    </div>

    <div
      v-for="t in rows"
      :key="t.name"
      class="mb-2 flex items-center gap-3 rounded-[11px] border px-3.5 py-3"
      :style="t.status === 'Done' ? 'border-color:#e7e9ee;opacity:.6' : 'border-color:#e7e9ee'"
    >
      <button
        class="flex h-5 w-5 flex-none items-center justify-center rounded-md border-[1.5px]"
        :style="t.status === 'Done' ? 'background:#16a34a;border-color:#16a34a;color:#fff' : 'border-color:#cdd2da'"
        @click="toggle(t)"
      >
        <span v-if="t.status === 'Done'" class="text-[12px]">✓</span>
      </button>
      <div class="min-w-0 flex-1">
        <div
          class="text-[13px] font-semibold text-ink-gray-9"
          :class="t.status === 'Done' ? 'text-ink-gray-5 line-through' : ''"
        >
          {{ t.title }}
        </div>
        <div v-if="t.due_date" class="text-[11.5px] text-ink-gray-5">{{ dueText(t.due_date) }}</div>
      </div>
      <span
        v-if="t.priority && t.status !== 'Done'"
        class="flex-none rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold"
        :style="prioStyle(t.priority)"
      >
        {{ t.priority }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { createListResource, call as frappeCall, toast } from 'frappe-ui'
import { activeDeal } from '@/composables/inbox'

const showAdd = ref(false)
const newTitle = ref('')
const adding = ref(false)

const tasks = createListResource({
  doctype: 'CRM Task',
  fields: ['name', 'title', 'status', 'due_date', 'priority'],
  orderBy: 'due_date asc',
  pageLength: 50,
})
watch(
  activeDeal,
  (d) => {
    if (!d) return
    tasks.filters = { reference_doctype: 'CRM Deal', reference_docname: d }
    tasks.reload()
  },
  { immediate: true },
)

const rows = computed(() => tasks.data || [])

async function toggle(t) {
  const next = t.status === 'Done' ? 'Todo' : 'Done'
  await frappeCall('frappe.client.set_value', {
    doctype: 'CRM Task',
    name: t.name,
    fieldname: 'status',
    value: next,
  })
  tasks.reload()
}

async function addTask() {
  const title = newTitle.value.trim()
  if (!title || adding.value) return
  adding.value = true
  try {
    await frappeCall('frappe.client.insert', {
      doc: {
        doctype: 'CRM Task',
        title,
        status: 'Todo',
        reference_doctype: 'CRM Deal',
        reference_docname: activeDeal.value,
      },
    })
    newTitle.value = ''
    showAdd.value = false
    toast.success(__('Tarea creada'))
    tasks.reload()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo crear'))
  } finally {
    adding.value = false
  }
}

function dueText(d) {
  return new Date(String(d).replace(' ', 'T')).toLocaleDateString()
}
function prioStyle(p) {
  const map = {
    Urgent: 'color:#e5484d;background:#fdecec',
    High: 'color:#b9790a;background:#fdf6e9',
    Medium: 'color:#2563c9;background:#eaf1fe',
    Low: 'color:#5b6472;background:#f1f2f4',
  }
  return map[p] || 'color:#5b6472;background:#f1f2f4'
}
</script>
