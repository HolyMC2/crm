<template>
  <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col">
    <AppBar
      v-if="phone"
      back
      back-label="Hojas"
      :title="sheet?.title || 'Hoja'"
      :loading="loading || saving"
    >
      <template #actions>
        <button
          type="button"
          class="press flex size-12 items-center justify-center rounded-full text-ink-gray-7"
          aria-label="Pídeselo a Muelle"
          title="Pídeselo a Muelle"
          @click="ask"
        >
          <span class="lucide-sparkles size-5" aria-hidden="true" />
        </button>
        <Dropdown v-if="sheet" :options="menu" align="end">
          <button
            type="button"
            class="press flex size-12 items-center justify-center rounded-full text-ink-gray-7"
            aria-label="Más acciones de la hoja"
            title="Más acciones"
          >
            <span class="lucide-ellipsis-vertical size-5" aria-hidden="true" />
          </button>
        </Dropdown>
      </template>
    </AppBar>

    <header
      v-if="!phone"
      class="flex flex-wrap items-center gap-3 border-b border-outline-gray-1 px-6 py-3"
    >
      <RouterLink
        :to="HOME"
        class="press flex size-10 items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
        aria-label="Volver a Hojas"
        title="Hojas"
      >
        <span class="lucide-arrow-left size-5" aria-hidden="true" />
      </RouterLink>
      <div class="min-w-0 flex-1">
        <h1 class="title-face truncate text-xl font-semibold text-ink-gray-9">
          {{ sheet?.title || 'Hoja' }}
        </h1>
        <p class="truncate text-sm text-ink-gray-6">
          <template v-if="saving">Guardando…</template>
          <template v-else-if="sheet && !sheet.can_write">
            Solo lectura · de {{ sheet.owner_name }}
          </template>
          <template v-else-if="sheet && !sheet.mine">
            De {{ sheet.owner_name }}
          </template>
        </p>
      </div>
      <Button
        v-if="sheet"
        class="min-h-11"
        label="Cambios"
        data-testid="open-changes"
        @click="changes.open = true"
      >
        <template #prefix>
          <span class="lucide-history size-4" aria-hidden="true" />
        </template>
      </Button>
      <Button
        v-if="sheet"
        class="min-h-11"
        label="Descargar Excel"
        data-testid="download-excel"
        @click="download"
      >
        <template #prefix>
          <span class="lucide-download size-4" aria-hidden="true" />
        </template>
      </Button>
      <Button
        variant="solid"
        class="min-h-11"
        label="Pídeselo a Muelle"
        data-testid="ask"
        @click="ask"
      >
        <template #prefix>
          <span class="lucide-sparkles size-4" aria-hidden="true" />
        </template>
      </Button>
      <Dropdown v-if="sheet" :options="menu" align="end">
        <Button class="min-h-11" aria-label="Más acciones de la hoja">
          <span class="lucide-ellipsis-vertical size-4" aria-hidden="true" />
        </Button>
      </Dropdown>
    </header>

    <EmptyState
      v-if="problem"
      state="error"
      :title="problem.title"
      :message="problem.detail"
      action="Volver a intentar"
      @action="load"
    />
    <EmptyState v-else-if="opening" state="loading" title="Abriendo la hoja…" />
    <div
      v-show="sheet && !problem && !opening"
      ref="host"
      class="hoja-host relative min-h-0 flex-1"
      data-testid="sheet-editor"
    />

    <BottomSheet v-model:open="changes.open" title="Cambios">
      <p
        v-if="!changeList.length"
        class="py-6 text-center text-base text-ink-gray-6"
      >
        Todavía no hay cambios guardados.
      </p>
      <ul v-else class="divide-y divide-outline-gray-1">
        <li
          v-for="row in changeList"
          :key="row.revision"
          class="flex items-start gap-3 py-3"
          :data-testid="`change-${row.revision}`"
        >
          <div class="min-w-0 flex-1">
            <p class="text-base font-medium text-ink-gray-9">
              {{ row.author }}
              <span class="font-normal text-ink-gray-6"
                >· {{ when(row.at) }}</span
              >
            </p>
            <p v-if="row.why" class="text-base text-ink-gray-8">
              {{ row.why }}
            </p>
            <p class="text-sm text-ink-gray-6">{{ row.what }}</p>
          </div>
          <Button
            v-if="sheet?.can_write"
            class="min-h-11 shrink-0"
            label="Regresar a antes"
            :loading="restoring === row.revision"
            @click="restore(row.revision)"
          />
        </li>
      </ul>
    </BottomSheet>

    <ShareSheet
      v-if="share.mounted && sheet"
      v-model:open="share.open"
      doctype="Hoja"
      :name="sheet.name"
      :title="sheet.title"
      :shared="sheet.shared || []"
      :can="sheet.mine"
      @done="load({ quiet: true })"
    />
    <BottomSheet v-model:open="rename.open" title="Nombre de la hoja">
      <form id="rename-sheet" @submit.prevent="saveTitle">
        <FormControl
          v-model="rename.title"
          type="text"
          label="Nombre"
          :maxlength="140"
          class="[&_input]:min-h-11"
        />
      </form>
      <template #footer>
        <Button
          variant="solid"
          type="submit"
          form="rename-sheet"
          class="min-h-11 w-full"
          label="Guardar nombre"
          :disabled="!rename.title.trim()"
        />
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button, Dropdown, FormControl, toast } from 'frappe-ui'
import { AppBar, BottomSheet, EmptyState } from '@/components/ui'
import {
  openAssistant,
  useAssistantContext,
} from '@/components/assistant/useAssistant'
import { isMobile as phone } from '@/composables/breakpoint'
import { problemOf } from '@/composables/useCobranza'
import { useShellTheme } from '@/composables/shellTheme'
import { formatDateTime } from '@/utils/display'
import {
  HOME,
  SAVE_DELAY_MS,
  askPrompt,
  bookOf,
  changeRows,
  excelUrl,
  hojasApi,
  loadEditor,
  isNewer,
  sheetContext,
} from '@/hojas/hoja'

const ShareSheet = defineAsyncComponent(
  () => import('@/components/documentos/ShareSheet.vue'),
)

const route = useRoute()
const router = useRouter()
const name = computed(() => String(route.params.name || ''))
const sheet = ref(null)
const loading = ref(false)
const saving = ref(false)
const problem = ref(null)
const host = ref(null)
const restoring = ref(null)
const removing = ref(false)
const changes = reactive({ open: false })
const share = reactive({ mounted: false, open: false })
const rename = reactive({ open: false, title: '' })
const changeList = computed(() => changeRows(sheet.value))

// --- the editor ---------------------------------------------------------------
let editor = null
let timer = null
let dirty = false
let inFlight = null
// The editor's files start downloading with the page, alongside the sheet itself.
loadEditor().catch(() => {})
const mounting = ref(false)
// «Abriendo la hoja…» covers the first open only; a live reload swaps the sheet in place.
const shown = ref(false)
const opening = computed(
  () => !problem.value && (loading.value || (mounting.value && !shown.value)),
)
const { theme } = useShellTheme()
const dark = computed(
  () =>
    theme.value === 'dark' ||
    (theme.value === 'system' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches),
)
watch(dark, (value) => editor?.setDark(value))

async function mount() {
  editor?.dispose()
  editor = null
  mounting.value = true
  try {
    const { mountSheet } = await loadEditor()
    await nextTick()
    if (!host.value || !sheet.value) return
    editor = mountSheet(host.value, bookOf(sheet.value), {
      onEdit,
      dark: dark.value,
      phone: phone.value,
      readOnly: !sheet.value.can_write,
    })
    shown.value = true
  } catch {
    problem.value = {
      title: 'No se pudo abrir el editor',
      detail: 'Revisa tu conexión y vuelve a intentar.',
    }
  } finally {
    mounting.value = false
  }
}

function onEdit() {
  dirty = true
  clearTimeout(timer)
  timer = setTimeout(save, SAVE_DELAY_MS)
}

async function save() {
  clearTimeout(timer)
  if (!dirty || !editor || !sheet.value?.can_write) return
  if (inFlight) return inFlight.then(save)
  dirty = false
  const text = editor.changes()
  if (!text) return
  saving.value = true
  inFlight = hojasApi('guardar', {
    name: sheet.value.name,
    revision: sheet.value.revision,
    snapshot: text,
  })
  try {
    const out = await inFlight
    editor?.markSaved(text)
    Object.assign(sheet.value, {
      revision: out.revision,
      cambios: out.cambios,
      modified: out.modified,
    })
  } catch (error) {
    if (error?.exc_type === 'Conflict') {
      toast.info('Alguien más cambió la hoja; se abrió con sus cambios.')
      await load({ quiet: true })
    } else {
      dirty = true
      toast.error(problemOf(error).detail)
    }
  } finally {
    inFlight = null
    saving.value = false
  }
}

// --- the sheet ------------------------------------------------------------------
async function load({ quiet = false } = {}) {
  if (!name.value) return
  if (!quiet) loading.value = true
  problem.value = null
  try {
    sheet.value = await hojasApi('abrir', { name: name.value })
    dirty = false
    await mount()
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    loading.value = false
  }
}

function show(view) {
  sheet.value = view
  dirty = false
  mount()
}

async function undo() {
  try {
    await save()
    show(await hojasApi('deshacer', { name: sheet.value.name }))
    toast.success('Listo, quedó como antes.')
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}

async function restore(revision) {
  restoring.value = revision
  try {
    await save()
    show(await hojasApi('restaurar', { name: sheet.value.name, revision }))
    changes.open = false
    toast.success('Listo, regresó a como estaba. Puedes deshacerlo.')
  } catch (error) {
    toast.error(problemOf(error).detail)
  } finally {
    restoring.value = null
  }
}

async function saveTitle() {
  try {
    const out = await hojasApi('renombrar', {
      name: sheet.value.name,
      title: rename.title,
    })
    sheet.value.title = out.title
    rename.open = false
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}

async function duplicate() {
  try {
    await save()
    const copy = await hojasApi('duplicar', { name: sheet.value.name })
    router.push(`${HOME}/${copy.name}`)
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}

async function remove() {
  if (!removing.value) {
    removing.value = true
    toast.info('Toca «Borrar hoja» otra vez para borrarla.')
    setTimeout(() => (removing.value = false), 4000)
    return
  }
  try {
    await hojasApi('borrar', { name: sheet.value.name })
    toast.success('Hoja borrada.')
    router.replace(HOME)
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}

async function download() {
  await save()
  window.location.href = excelUrl(sheet.value.name)
}

const menu = computed(() => {
  const s = sheet.value
  if (!s) return []
  const items = []
  if (phone.value) {
    items.push({ label: 'Cambios', onClick: () => (changes.open = true) })
    items.push({ label: 'Descargar Excel', onClick: download })
  }
  if (s.can_write) {
    items.push({
      label: 'Cambiar nombre',
      onClick: () => Object.assign(rename, { open: true, title: s.title }),
    })
    if (s.cambios?.length)
      items.push({ label: 'Deshacer el último cambio', onClick: undo })
  }
  items.push({ label: 'Duplicar hoja', onClick: duplicate })
  if (s.mine)
    items.push({
      label: 'Compartir',
      onClick: () => Object.assign(share, { mounted: true, open: true }),
    })
  if (s.mine)
    items.push({
      label: removing.value ? 'Borrar hoja (confirma)' : 'Borrar hoja',
      theme: 'red',
      onClick: remove,
    })
  return items
})

function when(at) {
  return at ? formatDateTime(at) : ''
}

// --- the assistant ------------------------------------------------------------------
useAssistantContext(() => sheetContext(sheet.value))

async function ask() {
  await save()
  const opened = await openAssistant({ text: askPrompt(sheet.value) })
  if (!opened) toast.error('El asistente no está disponible para tu usuario.')
}

// --- live: Muelle's (or a coworker's) change reloads the sheet ---------------------
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
async function onRemote(event) {
  if (!isNewer(event, sheet.value)) return
  if (inFlight) await inFlight.catch(() => {})
  if (!isNewer(event, sheet.value)) return
  await save()
  await load({ quiet: true })
}

function flush() {
  if (dirty) save()
}

onMounted(() => {
  socket?.on?.('doco_hoja', onRemote)
  window.addEventListener('pagehide', flush)
})
onBeforeUnmount(() => {
  flush()
  socket?.off?.('doco_hoja', onRemote)
  window.removeEventListener('pagehide', flush)
  clearTimeout(timer)
  editor?.dispose()
  editor = null
})

watch(
  name,
  (value) => {
    if (!value || route.name !== 'Hoja') return
    shown.value = false
    load()
  },
  { immediate: true },
)
</script>
<style scoped>
.hoja-host :deep(.univer-workbench) {
  height: 100%;
}
</style>
