<template>
  <!-- Más › Configuración › Scripts (Shell D12, desktop only, owner only):
       Server Scripts, Client Scripts and Custom Fields in words, on/off with a
       confirm, the code and its versions, «¿Qué hace?» for the assistant. -->
  <div class="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-6xl space-y-4 px-4 pb-24 pt-3">
      <header class="flex flex-wrap items-center gap-3">
        <h1 class="flex-1 text-xl font-semibold text-ink-gray-9">Scripts</h1>
        <button
          v-if="data?.puede_crear"
          type="button"
          :class="BTN.tonal"
          data-testid="scripts-new"
          @click="openCreate"
        >
          Nuevo script de cliente
        </button>
      </header>
      <p class="text-base text-ink-gray-7">
        Código que cambia cómo trabaja el sistema. Nada se ejecuta si no lo
        activas tú.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <Segmented
          :model-value="tipo"
          :options="tabs"
          label="Tipo de script"
          @update:model-value="setTipo"
        />
        <label class="sr-only" for="scripts-search">Buscar</label>
        <input
          id="scripts-search"
          v-model="search"
          type="search"
          enterkeyhint="search"
          class="h-11 min-w-0 flex-1 rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
          :placeholder="
            tipo === 'campos'
              ? 'Buscar por campo o documento'
              : 'Buscar por nombre o documento'
          "
          autocomplete="off"
          data-testid="scripts-search"
        />
      </div>
      <p
        v-if="data?.nota"
        role="note"
        class="rounded-lg border border-outline-amber-2 bg-surface-amber-1 px-4 py-3 text-base text-ink-amber-7"
        data-testid="scripts-engine-off"
      >
        {{ data.nota }}
      </p>

      <EmptyState
        v-if="denied"
        state="denied"
        title="Solo para el dueño"
        :message="error"
      />
      <EmptyState
        v-else-if="error && !rows.length"
        state="error"
        title="No se pudo cargar la lista"
        :message="error"
        action="Reintentar"
        @action="load()"
      />
      <div v-else class="flex gap-6">
        <div class="w-96 min-w-0 flex-none">
          <EmptyState
            v-if="loading && !rows.length"
            state="loading"
            title="Cargando…"
          />
          <EmptyState
            v-else-if="!rows.length"
            :title="emptyTitle"
            :message="search ? 'Prueba con otra palabra.' : ''"
          />
          <template v-else>
            <p class="px-4 pb-1 text-sm text-ink-gray-6">
              {{ data.total }} en total
            </p>
            <ul data-testid="scripts-list">
              <li v-for="row in rows" :key="row.name" class="flex items-center">
                <ListRow
                  class="min-w-0 flex-1"
                  :title="rowTitle(row)"
                  :subtitle="subtitle(row)"
                  :subtitle-lines="2"
                  :selected="row.name === selected"
                  data-testid="scripts-row"
                  @click="open(row.name)"
                />
                <AjustesSwitch
                  v-if="row.activo !== null && row.activo !== undefined"
                  :model-value="Boolean(row.activo)"
                  :label="`${row.activo ? 'Apagar' : 'Activar'} ${row.titulo}`"
                  :disabled="!data.puede_editar || busy === row.name"
                  @update:model-value="askToggle(row)"
                />
              </li>
            </ul>
            <button
              v-if="data.hay_mas"
              type="button"
              class="flex min-h-12 w-full items-center justify-center text-base-medium text-ink-gray-8"
              :disabled="loading"
              @click="load({ append: true })"
            >
              {{ loading ? 'Cargando…' : 'Cargar más' }}
            </button>
          </template>
        </div>
        <ScriptPanel
          class="flex-1"
          :tipo="tipo"
          :detail="detail"
          :loading="detailLoading"
          :error="detailError"
          :assistant="assistantEnabled"
          :busy="!!busy"
          @toggle="askToggle"
          @saved="onSaved"
          @explain="explain"
        />
      </div>
    </div>

    <ConfirmSheet
      :open="!!toggling"
      :copy="toggling?.copy"
      :busy="!!busy"
      :error="toggleError"
      @update:open="(v) => !v && !busy && (toggling = null)"
      @confirm="applyToggle"
    />

    <BottomSheet
      v-if="createUsed"
      v-model:open="createOpen"
      title="Nuevo script de cliente"
      subtitle="Se crea vacío y apagado."
    >
      <div class="space-y-3 pb-2">
        <div>
          <p class="pb-1 text-sm text-ink-gray-6">Tipo de documento</p>
          <AjustesLink
            id="scripts-new-doctype"
            v-model="createForm.doctype"
            doctype="DocType"
            label="Tipo de documento"
            required
          />
        </div>
        <Segmented
          v-model="createForm.vista"
          :options="[
            { value: 'Form', label: 'Formulario' },
            { value: 'List', label: 'Lista' },
          ]"
          label="Dónde corre"
        />
        <div>
          <label
            class="block pb-1 text-sm text-ink-gray-6"
            for="scripts-new-name"
            >Nombre (opcional)</label
          >
          <input
            id="scripts-new-name"
            v-model="createForm.nombre"
            type="text"
            maxlength="80"
            class="h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
            autocomplete="off"
          />
        </div>
        <p v-if="createError" role="alert" class="text-base text-ink-red-7">
          {{ createError }}
        </p>
      </div>
      <template #actions>
        <button
          type="button"
          :class="BTN.filled"
          :disabled="!createForm.doctype || creating"
          data-testid="scripts-create"
          @click="create"
        >
          Crear apagado
        </button>
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { BottomSheet, EmptyState, ListRow, Segmented } from '@/components/ui'
import AjustesLink from '@/components/ajustes/AjustesLink.vue'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import ConfirmSheet from '@/components/documentos/ConfirmSheet.vue'
import ScriptPanel from '@/components/scripts/ScriptPanel.vue'
import {
  assistantEnabled,
  openAssistant,
  useAssistantContext,
} from '@/components/assistant/useAssistant'
import { BTN } from '@/documentos/tools'
import {
  DOCTYPES,
  PAGE,
  TABS,
  errorText,
  explainPrompt,
  rowSubtitle,
  rowTitle,
  scriptsApi,
  toggleCopy,
} from '@/components/scripts/scripts'

const route = useRoute()
const router = useRouter()
const valid = (value) => TABS.some((t) => t.value === value)
const tipo = ref(valid(route.query.tipo) ? route.query.tipo : 'cliente')
const search = ref('')
const data = ref(null)
const rows = ref([])
const loading = ref(false)
const error = ref('')
const denied = ref(false)
const selected = ref(String(route.query.script || ''))
const detail = ref(null)
const detailLoading = ref(false)
const detailError = ref('')
const busy = ref('')
const toggling = ref(null)
const toggleError = ref('')

const tabs = computed(() =>
  TABS.map((t) => ({
    ...t,
    count: t.value === tipo.value ? data.value?.total : undefined,
  })),
)
const emptyTitle = computed(() =>
  search.value
    ? 'Nada coincide con esa búsqueda'
    : {
        servidor: 'No hay scripts de servidor',
        cliente: 'No hay scripts de cliente',
        campos: 'No hay campos agregados',
      }[tipo.value],
)
const subtitle = rowSubtitle

function remember() {
  router.replace({
    query: {
      ...route.query,
      tipo: tipo.value,
      script: selected.value || undefined,
    },
  })
}

let seq = 0
async function load({ append = false } = {}) {
  const mine = ++seq
  loading.value = true
  error.value = ''
  try {
    const page = await scriptsApi('lista', {
      tipo: tipo.value,
      buscar: search.value.trim(),
      inicio: append ? rows.value.length : 0,
      limite: PAGE,
    })
    if (mine !== seq) return
    data.value = page
    rows.value = append ? [...rows.value, ...page.filas] : page.filas
    denied.value = false
  } catch (e) {
    if (mine !== seq) return
    denied.value = e?.exc_type === 'PermissionError'
    error.value = errorText(e)
  } finally {
    if (mine === seq) loading.value = false
  }
}

let detailSeq = 0
async function open(name) {
  selected.value = name
  remember()
  const mine = ++detailSeq
  detailLoading.value = true
  detailError.value = ''
  try {
    const found = await scriptsApi('ver', { tipo: tipo.value, name })
    if (mine === detailSeq) detail.value = found
  } catch (e) {
    if (mine === detailSeq) {
      detail.value = null
      detailError.value = errorText(e)
    }
  } finally {
    if (mine === detailSeq) detailLoading.value = false
  }
}

function setTipo(value) {
  if (!valid(value) || value === tipo.value) return
  tipo.value = value
  selected.value = ''
  detail.value = null
  search.value = ''
  remember()
  load()
}

let timer = null
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(() => load(), 250)
})
onBeforeUnmount(() => clearTimeout(timer))

// ── On/off: always through a confirm that says when it runs ──
function askToggle(row) {
  toggleError.value = ''
  toggling.value = {
    row,
    copy: toggleCopy(row, {
      tipo: tipo.value,
      motorActivo: data.value?.motor_activo !== false,
    }),
  }
}
async function applyToggle() {
  const job = toggling.value
  if (!job || busy.value) return
  busy.value = job.row.name
  toggleError.value = ''
  try {
    const fresh = await scriptsApi('activar', {
      tipo: tipo.value,
      name: job.row.name,
      activo: job.row.activo ? 0 : 1,
      modificado: job.row.modificado,
    })
    toggling.value = null
    replaceRow(fresh)
    if (selected.value === fresh.name) detail.value = fresh
    toast.success(fresh.activo ? 'Activado.' : 'Apagado.')
  } catch (e) {
    toggleError.value = errorText(e)
  } finally {
    busy.value = ''
  }
}
function replaceRow(fresh) {
  rows.value = rows.value.map((row) =>
    row.name === fresh.name ? { ...row, ...pick(fresh) } : row,
  )
}
function pick(fresh) {
  const { name, titulo, aplica, cuando, activo, modificado, modificado_por } =
    fresh
  return { name, titulo, aplica, cuando, activo, modificado, modificado_por }
}
function onSaved(fresh) {
  detail.value = fresh
  replaceRow(fresh)
  toast.success('Guardado. La versión anterior quedó en «Versiones».')
}

// ── «¿Qué hace?»: the assistant with this script as the screen's context ──
useAssistantContext(() =>
  detail.value
    ? {
        doctype: DOCTYPES[tipo.value],
        name: detail.value.name,
        title: detail.value.titulo,
      }
    : null,
)
async function explain(script) {
  const opened = await openAssistant({
    text: explainPrompt(script),
    send: true,
  })
  if (!opened) toast.error('El asistente no está disponible para tu usuario.')
}

// ── Nuevo script de cliente (empty and off) ──
const createUsed = ref(false)
const createOpen = ref(false)
const creating = ref(false)
const createError = ref('')
const createForm = reactive({ doctype: '', vista: 'Form', nombre: '' })
function openCreate() {
  createUsed.value = true
  createError.value = ''
  Object.assign(createForm, { doctype: '', vista: 'Form', nombre: '' })
  createOpen.value = true
}
async function create() {
  if (!createForm.doctype || creating.value) return
  creating.value = true
  createError.value = ''
  try {
    const fresh = await scriptsApi('crear', {
      tipo: 'cliente',
      datos: { ...createForm },
    })
    createOpen.value = false
    await load()
    detail.value = fresh
    selected.value = fresh.name
    remember()
    toast.success(
      'Creado y apagado. Escribe el código y actívalo cuando esté listo.',
    )
  } catch (e) {
    createError.value = errorText(e)
  } finally {
    creating.value = false
  }
}

load().then(() => selected.value && open(selected.value))
</script>
