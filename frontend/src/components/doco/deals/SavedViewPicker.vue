<!--
  Shared saved views for the deals list.

  Every row is a «CRM View Settings» document written with the upstream API
  (crm_view_settings.create / update / pin / public / set_as_default / delete) and
  read back through crm.api.views.get_views, so a view is private to whoever made
  it until a Sales Manager publishes it, and pin/default behave as they do in the
  classic list. utils/dealViewSettings owns the mapping between this list's
  context and the document's columns.

  Views made in the classic list are not offered here: their context describes
  that list's columns, not this one's. The browser-local views this list saved
  before the doctype existed stay listed, read-only, so nobody loses a filter set.
-->
<template>
  <div class="relative inline-block">
    <button
      class="flex items-center gap-1 rounded-lg border px-3 py-[7px] text-[12px] font-medium"
      :class="selectedView ? 'border-outline-green-3 bg-surface-green-2 text-ink-green-8' : 'border-outline-gray-2 text-ink-gray-7'"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      {{ __('Vistas') }}<span v-if="selectedView"> · {{ selectedView.label }}</span> ⌄
    </button>

    <template v-if="open">
      <div class="fixed inset-0 z-[90]" @click="open = false" />
      <div
        class="absolute right-0 z-[100] mt-1 max-h-[70vh] w-[320px] overflow-y-auto rounded-[10px] border border-outline-gray-2 bg-surface-base text-ink-gray-8"
        style="box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12)"
      >
        <div class="flex items-center justify-between border-b border-outline-gray-1 px-3 py-2">
          <span class="text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4">{{ __('Vistas guardadas') }}</span>
          <button v-if="selectedView" class="text-[11.5px] text-ink-gray-5 hover:text-ink-gray-8" @click="clearSelection">
            {{ __('Quitar vista') }}
          </button>
        </div>

        <p v-if="views.loading && !views.data" class="px-3 py-3 text-[12px] text-ink-gray-4">{{ __('Cargando vistas…') }}</p>
        <div v-else-if="views.error" class="px-3 py-3">
          <p role="alert" class="text-[12px] text-ink-red-8">{{ __('No se pudieron cargar las vistas guardadas.') }}</p>
          <button class="mt-1 text-[12px] font-semibold underline" @click="views.reload()">{{ __('Reintentar') }}</button>
        </div>

        <template v-for="group in groups" :key="group.key">
          <div v-if="group.rows.length">
            <div class="border-b border-outline-gray-1 bg-surface-gray-1 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4">
              {{ group.label }}
            </div>
            <div
              v-for="v in group.rows"
              :key="v.name"
              class="flex items-center gap-1 border-b border-outline-gray-1 px-2 py-1.5 hover:bg-surface-gray-2"
              :class="String(v.name) === String(selected) ? 'bg-surface-green-2' : ''"
            >
              <button class="min-w-0 flex-1 truncate text-left text-[13px] text-ink-gray-8" @click="apply(v)">
                {{ v.label }}
                <span v-if="v.public" class="ml-1 rounded bg-surface-gray-3 px-1 py-px text-[10px] font-semibold text-ink-gray-6">{{ __('Pública') }}</span>
                <span v-if="v.is_default" class="ml-1 text-[10px] text-ink-gray-5">★ {{ __('Predeterminada') }}</span>
              </button>
              <button
                class="press flex-none px-1 text-[12px]"
                :class="v.pinned ? 'text-ink-green-8' : 'text-ink-gray-4'"
                :title="v.pinned ? __('Quitar de fijadas') : __('Fijar')"
                :aria-label="v.pinned ? __('Quitar de fijadas') : __('Fijar')"
                @click="togglePin(v)"
              >📌</button>
              <button
                v-if="!v.is_default"
                class="press flex-none px-1 text-[12px] text-ink-gray-4"
                :title="__('Usar como predeterminada')"
                :aria-label="__('Usar como predeterminada')"
                @click="makeDefault(v)"
              >★</button>
              <button
                v-if="canPublish"
                class="press flex-none px-1 text-[12px]"
                :class="v.public ? 'text-ink-green-8' : 'text-ink-gray-4'"
                :title="v.public ? __('Volverla privada') : __('Publicar para el equipo')"
                :aria-label="v.public ? __('Volverla privada') : __('Publicar para el equipo')"
                @click="togglePublic(v)"
              >👥</button>
              <button
                class="press flex-none px-1 text-[12px] text-ink-gray-4 hover:text-ink-red-8"
                :title="__('Eliminar vista')"
                :aria-label="__('Eliminar vista')"
                @click="remove(v)"
              >🗑</button>
            </div>
          </div>
        </template>

        <div v-if="legacyViews.length">
          <div class="border-b border-outline-gray-1 bg-surface-gray-1 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4">
            {{ __('Solo en este navegador') }}
          </div>
          <div v-for="v in legacyViews" :key="`legacy:${v.label}`" class="flex items-center gap-1 border-b border-outline-gray-1 px-2 py-1.5 hover:bg-surface-gray-2">
            <button class="min-w-0 flex-1 truncate text-left text-[13px] text-ink-gray-8" @click="applyLegacy(v)">{{ v.label }}</button>
            <button
              class="press flex-none px-1 text-[12px] text-ink-gray-4 hover:text-ink-red-8"
              :title="__('Eliminar vista')"
              :aria-label="__('Eliminar vista')"
              @click="$emit('delete-legacy', v.label)"
            >🗑</button>
          </div>
        </div>

        <p v-if="!views.loading && !anyView && !legacyViews.length" class="px-3 py-3 text-[12px] text-ink-gray-4">
          {{ __('Aún no hay vistas. Guarda tus filtros, colas y columnas actuales para reutilizarlas o compartirlas.') }}
        </p>

        <div class="flex flex-col gap-1 px-3 py-2">
          <button class="rounded-lg bg-surface-gray-7 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60" :disabled="busy" @click="saveAsNew">
            ＋ {{ __('Guardar vista actual') }}
          </button>
          <button v-if="selectedView" class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-medium text-ink-gray-7 disabled:opacity-60" :disabled="busy" @click="updateSelected">
            {{ __('Actualizar «{0}»', [selectedView.label]) }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { call, createResource, toast } from 'frappe-ui'
import { usersStore } from '@/stores/users'
import { confirmDialog, inputDialog } from '@/utils/dialogs'
import { DEAL_VIEW_DOCTYPE, dealListViews, viewContext, viewPayload } from '@/utils/dealViewSettings'

const props = defineProps({
  // the list context to persist: status/source/owner/followUp/search/view/sort/groupBy/columns
  context: { type: Object, required: true },
  selected: { type: [String, Number], default: '' },
  // browser-local views saved before this list had server-side ones
  legacyViews: { type: Array, default: () => [] },
})
const emit = defineEmits(['apply', 'apply-legacy', 'default-view', 'delete-legacy', 'update:selected'])

const SETTINGS = 'crm.fcrm.doctype.crm_view_settings.crm_view_settings'
const { isManager } = usersStore()
const canPublish = computed(() => isManager())
const open = ref(false)
const busy = ref(false)

// Announced once, on the first load: the page decides whether to open on the
// default view. A later reload (after a save or a pin) must not move the worker.
let announced = false
const views = createResource({
  url: 'crm.api.views.get_views',
  params: { doctype: DEAL_VIEW_DOCTYPE },
  auto: true,
  transform: (rows) => dealListViews(rows),
  onSuccess: (rows) => {
    if (announced) return
    announced = true
    const fallback = rows.find((v) => v.is_default)
    if (fallback) emit('default-view', { name: String(fallback.name), context: viewContext(fallback) })
  },
})

const rows = computed(() => views.data || [])
const anyView = computed(() => rows.value.length > 0)
const selectedView = computed(() => rows.value.find((v) => String(v.name) === String(props.selected)) || null)
const groups = computed(() => [
  { key: 'pinned', label: __('Fijadas'), rows: rows.value.filter((v) => v.pinned) },
  { key: 'mine', label: __('Mis vistas'), rows: rows.value.filter((v) => !v.pinned && !v.public) },
  { key: 'public', label: __('Del equipo'), rows: rows.value.filter((v) => !v.pinned && v.public) },
])

function apply(v) {
  emit('update:selected', String(v.name))
  emit('apply', viewContext(v))
  open.value = false
}

function applyLegacy(v) {
  emit('update:selected', '')
  emit('apply-legacy', v)
  open.value = false
}

function clearSelection() {
  emit('update:selected', '')
  open.value = false
}

function saveAsNew() {
  inputDialog({
    title: __('Guardar vista'),
    message: __('Nombre de la vista'),
    placeholder: __('Ej. Tratos activos'),
    confirmLabel: __('Guardar'),
    theme: 'green',
    required: true,
    onConfirm: (label) => run(async () => {
      const doc = await call(`${SETTINGS}.create`, { view: viewPayload(props.context, { label }) })
      await views.reload()
      emit('update:selected', String(doc?.name || ''))
      toast.success(__('Vista guardada'))
    }),
  })
}

function updateSelected() {
  const current = selectedView.value
  if (!current) return
  run(async () => {
    await call(`${SETTINGS}.update`, {
      view: viewPayload(props.context, { label: current.label, icon: current.icon, name: current.name }),
    })
    await views.reload()
    toast.success(__('Vista actualizada'))
  })
}

function togglePin(v) {
  run(async () => {
    await call(`${SETTINGS}.pin`, { name: v.name, value: v.pinned ? 0 : 1 })
    await views.reload()
  })
}

function togglePublic(v) {
  run(async () => {
    await call(`${SETTINGS}.public`, { name: v.name, value: v.public ? 0 : 1 })
    await views.reload()
  })
}

function makeDefault(v) {
  run(async () => {
    await call(`${SETTINGS}.set_as_default`, { name: v.name })
    await views.reload()
    toast.success(__('Vista predeterminada actualizada'))
  })
}

function remove(v) {
  confirmDialog({
    title: __('Eliminar vista'),
    message: __('¿Eliminar la vista «{0}»? Si es pública, dejará de estar disponible para el equipo.', [v.label]),
    confirmLabel: __('Eliminar'),
    onConfirm: () => run(async () => {
      await call(`${SETTINGS}.delete`, { name: v.name })
      if (String(v.name) === String(props.selected)) emit('update:selected', '')
      await views.reload()
      toast.success(__('Vista eliminada'))
    }),
  })
}

// Every write shares the same failure story: the server owns the permission.
async function run(work) {
  if (busy.value) return
  busy.value = true
  try {
    await work()
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo guardar la vista. Revisa tus permisos sobre las vistas del equipo.'))
  } finally {
    busy.value = false
  }
}
</script>
