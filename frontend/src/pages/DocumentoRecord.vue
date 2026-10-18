<template>
  <!-- One document (Shell SPEC §6 DD4): the bar names the party with the kind
       and number as small meta; the status and amount are the hero, then the
       one filled «siguiente paso» (and «Editar» on a draft); items as cards,
       totals, Datos, Conexiones, Actividad and Archivos. «⋯» holds every tool
       (DD5). In the desktop split (`pane`) the list stays on the left. -->
  <div
    ref="root"
    class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden"
  >
    <AppBar
      :back="pane ? false : backTo"
      :back-label="backLabel"
      :context="view ? `${view.kind} · ${view.number}` : ''"
      :title="view?.title || entry?.label || 'Documento'"
      :bell="phone"
      :loading="(loading || busy) && !!record"
    >
      <template #actions>
        <button
          v-if="pane"
          type="button"
          class="flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          aria-label="Cerrar documento (Esc)"
          @click="close"
        >
          <span class="lucide-x size-6" aria-hidden="true" />
        </button>
        <button
          v-if="record"
          type="button"
          class="flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          aria-label="Herramientas"
          data-testid="documentos-tools-open"
          @click="toolsOpen = true"
        >
          <span class="lucide-ellipsis-vertical size-6" aria-hidden="true" />
        </button>
      </template>
    </AppBar>
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto pb-10">
      <EmptyState
        v-if="error"
        :state="denied ? 'denied' : 'error'"
        :title="
          denied
            ? 'No puedes ver este documento'
            : 'No se pudo abrir el documento'
        "
        :message="error"
        :action="denied ? '' : 'Reintentar'"
        @action="load"
      />
      <EmptyState v-else-if="!record" state="loading" title="Abriendo…" />
      <div
        v-else
        class="mx-auto grid w-full max-w-6xl gap-x-6"
        :class="
          pane
            ? '2xl:grid-cols-[minmax(0,1fr)_20rem]'
            : 'lg:grid-cols-[minmax(0,1fr)_22rem]'
        "
      >
        <div class="flex min-w-0 flex-col gap-5 pt-4">
          <section
            class="flex flex-col gap-2 px-4"
            data-testid="documentos-hero"
          >
            <div class="flex flex-wrap items-center gap-2">
              <StatusChip
                v-if="view.status"
                :status="view.status"
                :tone="view.tone"
              />
              <span
                v-if="record.header.is_return"
                class="text-sm text-ink-gray-7"
                >Devolución</span
              >
            </div>
            <p
              v-if="view.amount"
              class="text-3xl font-semibold tabular-nums leading-tight text-ink-gray-9"
            >
              {{ view.amount }}
            </p>
            <p class="flex flex-wrap gap-x-3 text-base text-ink-gray-7">
              <span v-if="view.date">{{ view.date }}</span>
              <span v-if="view.due" :class="overdue ? 'text-ink-red-7' : ''">{{
                view.due
              }}</span>
            </p>
            <div
              v-if="step || canEdit"
              class="flex flex-wrap gap-2 pt-2"
              data-testid="documentos-next"
            >
              <button
                v-if="step"
                type="button"
                :class="BTN.filled"
                :disabled="busy"
                data-testid="documentos-next-step"
                @click="runStep(step)"
              >
                <span
                  v-if="step.icon"
                  :class="[step.icon, 'size-5']"
                  aria-hidden="true"
                />
                {{ step.label }}
              </button>
              <button
                v-if="canEdit"
                type="button"
                :class="BTN.tonal"
                data-testid="documentos-edit"
                @click="editOpen = true"
              >
                <span class="lucide-pencil size-5" aria-hidden="true" />
                Editar
              </button>
            </div>
          </section>
          <template v-for="key in mainSections" :key="key">
            <ItemsCards
              v-if="key === 'items'"
              :items="record.items"
              :currency="currency"
            />
            <DocTotals
              v-else-if="key === 'totals'"
              :totals="record.totals"
              :taxes="record.taxes"
              :currency="currency"
              :docstatus="record.header.docstatus"
              :owed-label="profile.owedLabel"
            />
            <DatosList
              v-else-if="key === 'datos'"
              :fields="record.fields"
              :currency="currency"
              :boot="shellBoot"
            />
          </template>
        </div>
        <aside class="flex min-w-0 flex-col gap-5 pt-5 lg:pt-4">
          <Conexiones
            v-if="sections.includes('conexiones')"
            :connections="record.connections"
            :scope-label="scopeLabel"
          />
          <Actividad
            v-if="sections.includes('actividad')"
            :activity="record.activity"
            :noun="noun"
            :can-attach="!!record.actions?.attach?.allowed"
            @attach="pickFile"
          />
        </aside>
      </div>
    </div>
    <input
      ref="fileInput"
      type="file"
      class="hidden"
      aria-hidden="true"
      tabindex="-1"
      @change="onFile"
    />
    <template v-if="record">
      <ToolsSheet
        v-model:open="toolsOpen"
        :tools="tools"
        :subtitle="scopeTitle"
        @tool="onTool"
      />
      <ConfirmSheet
        v-model:open="confirmOpen"
        :copy="confirmCopyFor"
        :busy="busy"
        :error="confirmError"
        @confirm="doConfirm"
      />
      <CommentSheet
        v-model:open="commentOpen"
        :doctype="doctype"
        :name="name"
        :subtitle="scopeTitle"
        @done="setActivity"
      />
      <AssignSheet
        v-model:open="assignOpen"
        :doctype="doctype"
        :name="name"
        :subtitle="scopeTitle"
        :assigned="record.activity?.assigned || []"
        @done="setActivity"
      />
      <PrintSheet
        v-model:open="printOpen"
        :doctype="doctype"
        :name="name"
        :title="pdfTitle"
        :subtitle="scopeTitle"
        :url="link"
        @shared="onShared"
      />
      <EditSheet
        v-if="canEdit"
        v-model:open="editOpen"
        :record="record"
        :edit-fields="profile.editFields"
        :subtitle="scopeTitle"
        @saved="saved('Borrador guardado')"
      />
      <component
        :is="avisameSheet"
        v-if="avisameSheet"
        v-model:open="avisameOpen"
        :doctype="doctype"
        :name="name"
        :title="view?.title || ''"
      />
    </template>
  </div>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { AppBar, EmptyState, StatusChip } from '@/components/ui'
import Actividad from '@/components/documentos/Actividad.vue'
import Conexiones from '@/components/documentos/Conexiones.vue'
import DatosList from '@/components/documentos/DatosList.vue'
import DocTotals from '@/components/documentos/DocTotals.vue'
import ItemsCards from '@/components/documentos/ItemsCards.vue'
import ToolsSheet from '@/components/documentos/ToolsSheet.vue'
import ConfirmSheet from '@/components/documentos/ConfirmSheet.vue'
import {
  assistantEnabled,
  openAssistant,
  useAssistantContext,
} from '@/components/assistant/useAssistant'
import { isMobile, isWide } from '@/composables/breakpoint'
import { useFormKeys } from '@/composables/pageKeys'
import { shellBoot } from '@/composables/muelleShell'
import { docApi, errorText } from '@/documentos/api'
import { makeTarget } from '@/documentos/form'
import { loadProfile } from '@/documentos/profiles'
import {
  documentRoute,
  floorRoute,
  listRoute,
  profileBySlug,
  profileFor,
} from '@/documentos/registry'
import {
  BTN,
  confirmCopy,
  copyText,
  deskUrl,
  shareDocument,
  shellUrl,
  toolsFor,
  uploadAttachment,
} from '@/documentos/tools'
import { formatDue, kindLabel } from '@/utils/display'

const CommentSheet = defineAsyncComponent(
  () => import('@/components/documentos/CommentSheet.vue'),
)
const AssignSheet = defineAsyncComponent(
  () => import('@/components/documentos/AssignSheet.vue'),
)
const PrintSheet = defineAsyncComponent(
  () => import('@/components/documentos/PrintSheet.vue'),
)
const EditSheet = defineAsyncComponent(
  () => import('@/components/documentos/EditSheet.vue'),
)
// Packages that land on their own: D5's «Avísame…» and D6's «Todos los
// ajustes». A glob finds them when they are on this branch, else nothing.
const AVISAME = import.meta.glob('../components/documentos/avisame.js')
const AVISAME_SHEET = import.meta.glob(
  '../components/documentos/AvisameSheet.vue',
)
const AJUSTES = import.meta.glob('../components/ajustes/ajustes.js')

const props = defineProps({
  // Inside the desktop split: no back arrow (the list is beside it), Esc closes.
  pane: { type: Boolean, default: false },
})

const route = useRoute()
const router = useRouter()
const phone = isMobile

const base = computed(() =>
  route.path.startsWith('/inventario') ? '/inventario' : '/documentos',
)
const entry = computed(() =>
  route.params.slug ? profileBySlug(route.params.slug, base.value) : null,
)
const doctype = computed(
  () => entry.value?.doctype || String(route.params.doctype || ''),
)
const name = computed(() => String(route.params.name || ''))

const root = ref(null)
const profile = ref(null)
const record = ref(null)
const loading = ref(false)
const error = ref('')
const denied = ref(false)

const view = computed(() =>
  record.value && profile.value ? profile.value.header(record.value) : null,
)
const currency = computed(() => record.value?.header?.currency || 'MXN')
const sections = computed(() => profile.value?.sections || [])
const mainSections = computed(() =>
  sections.value.filter((key) => ['items', 'totals', 'datos'].includes(key)),
)
const overdue = computed(() => {
  const h = record.value?.header
  return !!(h?.due && Number(h?.outstanding) > 0 && formatDue(h.due).overdue)
})
// «la factura de Ana López»: the scope line on a connection's list.
const noun = computed(() => {
  const kind = (kindLabel(doctype.value) || 'documento').toLowerCase()
  // Gender from the first word: factura, cotización, solicitud → la.
  return /(a|ón|d)$/.test(kind.split(' ')[0]) ? `la ${kind}` : `el ${kind}`
})
const scopeLabel = computed(() =>
  view.value ? `${noun.value} de ${view.value.title}` : '',
)
const scopeTitle = computed(() =>
  view.value ? `${view.value.kind} de ${view.value.title}` : '',
)
const pdfTitle = computed(() =>
  view.value ? `${view.value.kind} ${view.value.number}` : name.value,
)
const link = computed(() => shellUrl(route.path))

// Back: to where the worker came from (the list keeps its filters and scroll),
// else up to the list.
const listTo = computed(() =>
  entry.value ? listRoute(entry.value) : floorRoute(doctype.value),
)
const backTo = computed(() =>
  typeof window !== 'undefined' && window.history.state?.back
    ? true
    : listTo.value,
)
const backLabel = computed(() =>
  entry.value ? `Volver a ${entry.value.label.toLowerCase()}` : 'Volver',
)

// ── next step and editing ──
const canEdit = computed(() => !!record.value?.actions?.edit?.allowed)
const step = computed(() => {
  if (!record.value || !profile.value?.nextStep) return null
  const s = profile.value.nextStep(record.value)
  if (!s) return null
  if (s.submit && !record.value.actions?.submit?.allowed) return null
  return s
})

// ── tools (DD5) ──
const toolsOpen = ref(false)
const confirmOpen = ref(false)
const confirmKind = ref('')
const confirmError = ref('')
const commentOpen = ref(false)
const assignOpen = ref(false)
const printOpen = ref(false)
const editOpen = ref(false)
const avisameOpen = ref(false)
const avisameSheet = shallowRef(null)
const avisameDoctypes = ref(null)
const ajustes = shallowRef(null)
const busy = ref(false)

const extraTools = computed(() => {
  const out = []
  if (ajustes.value)
    out.push({
      key: 'ajustes',
      label: 'Todos los ajustes',
      icon: 'lucide-sliders-horizontal',
      allowed: true,
      hint: 'Cada campo con lo que hace',
    })
  if (assistantEnabled.value)
    out.push({
      key: 'preguntar',
      label: 'Pregúntale a Muelle sobre esta ficha',
      icon: 'lucide-sparkles',
      allowed: true,
    })
  return out
})
const tools = computed(() =>
  toolsFor(record.value, {
    wide: isWide.value,
    avisame: !!avisameDoctypes.value?.includes(doctype.value),
    extra: extraTools.value,
  }),
)
const confirmCopyFor = computed(() =>
  confirmCopy(confirmKind.value, {
    noun: noun.value,
    title: view.value?.title || '',
  }),
)

function ask(kind) {
  confirmKind.value = kind
  confirmError.value = ''
  confirmOpen.value = true
}

async function runStep(s) {
  if (s.submit) return ask('submit')
  if (s.make) {
    const target = makeTarget(doctype.value, s.make)
    const to = documentRoute(target.doctype, 'nuevo', { hint: target.hint })
    if (!to) return toast.error('No puedes crear ese documento aquí.')
    return router.push({
      path: to.path,
      query: { origen: doctype.value, desde: name.value, con: s.make },
    })
  }
  if (s.to) return router.push(s.to)
}

async function doConfirm() {
  const kind = confirmKind.value
  busy.value = true
  confirmError.value = ''
  try {
    await docApi('act', {
      doctype: doctype.value,
      name: name.value,
      action: kind,
    })
    confirmOpen.value = false
    if (kind === 'delete') {
      toast.success('Borrador eliminado')
      return router.replace(
        props.pane ? { path: listTo.value.path, query: route.query } : listTo.value,
      )
    }
    await saved(kind === 'submit' ? 'Confirmado' : 'Cancelado')
  } catch (e) {
    confirmError.value = errorText(e)
  } finally {
    busy.value = false
  }
}

async function saved(message) {
  if (message) toast.success(message)
  await load()
}

function setActivity(activity) {
  if (record.value && activity) record.value = { ...record.value, activity }
}

const fileInput = ref(null)
function pickFile() {
  fileInput.value?.click()
}
async function onFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  busy.value = true
  try {
    await uploadAttachment({ doctype: doctype.value, name: name.value, file })
    toast.success('Archivo adjuntado')
    await load()
  } catch (e) {
    toast.error(e?.message || 'No se pudo subir el archivo.')
  } finally {
    busy.value = false
  }
}

function onShared(result) {
  if (result === 'copied') toast.success('Enlace copiado')
  else if (result === 'failed') toast.error('No se pudo compartir.')
}

async function onTool(key) {
  const nuevo = (query) => {
    const to = documentRoute(doctype.value, 'nuevo', { hint: record.value.doc })
    router.push({ path: to?.path || floorRoute(doctype.value, 'nuevo').path, query })
  }
  switch (key) {
    case 'assign':
      assignOpen.value = true
      break
    case 'comment':
      commentOpen.value = true
      break
    case 'attach':
      pickFile()
      break
    case 'share':
      onShared(
        await shareDocument({
          doctype: doctype.value,
          name: name.value,
          title: pdfTitle.value,
          url: link.value,
        }),
      )
      break
    case 'print':
      printOpen.value = true
      break
    case 'avisame':
      avisameOpen.value = true
      break
    case 'duplicate':
      nuevo({ duplicar: name.value })
      break
    case 'amend':
      nuevo({ modificar: name.value })
      break
    case 'link':
      if (await copyText(link.value)) toast.success('Enlace copiado')
      else toast.error('No se pudo copiar el enlace')
      break
    case 'cancel':
    case 'delete':
      ask(key)
      break
    case 'ajustes':
      router.push(ajustes.value(doctype.value, name.value))
      break
    case 'preguntar':
      openAssistant({ text: '' })
      break
    case 'desk':
      window.open(deskUrl(doctype.value, name.value), '_blank', 'noopener')
      break
  }
}

async function loadExtras() {
  const [avisame] = Object.values(AVISAME)
  const [sheet] = Object.values(AVISAME_SHEET)
  if (avisame && sheet && !avisameDoctypes.value) {
    try {
      avisameDoctypes.value = (await avisame()).AVISAME_DOCTYPES || []
      avisameSheet.value = defineAsyncComponent(sheet)
    } catch {
      avisameDoctypes.value = []
    }
  }
  const [aj] = Object.values(AJUSTES)
  if (aj && !ajustes.value) {
    try {
      ajustes.value = (await aj()).ajustesRoute || null
    } catch {
      ajustes.value = null
    }
  }
}

// ── keys: e edits a draft, Esc closes (the split's record, or back) ──
function close() {
  if (props.pane)
    return router.push({ path: listTo.value.path, query: route.query })
  if (window.history.state?.back) return router.back()
  router.push(listTo.value)
}
useFormKeys({
  page: 'documento',
  root,
  edit: () => {
    editOpen.value = true
  },
  close,
  when: { edit: () => canEdit.value },
})

// The assistant knows which record this is (D6: «Pregúntale sobre esta ficha»).
useAssistantContext(() =>
  record.value
    ? { doctype: doctype.value, name: name.value, title: view.value?.title }
    : null,
)

let seq = 0
async function load() {
  if (!doctype.value || !name.value) return
  const mine = ++seq
  loading.value = true
  error.value = ''
  denied.value = false
  try {
    const [loaded, own] = await Promise.all([
      docApi('record', { doctype: doctype.value, name: name.value }),
      loadProfile({ doctype: doctype.value, entry: entry.value }),
    ])
    if (mine !== seq) return
    // One doctype, several lists (Payment Entry: cobros · pagos): land on the right one.
    const right = profileFor(doctype.value, loaded.doc)
    if (entry.value && right && right.slug !== entry.value.slug) {
      const to = documentRoute(doctype.value, name.value, { hint: loaded.doc })
      if (to) return router.replace(to)
    }
    profile.value = own
    record.value = loaded
    loadExtras()
  } catch (e) {
    if (mine !== seq) return
    denied.value =
      e?.exc_type === 'PermissionError' ||
      /permission|permiso/i.test(e?.message || '')
    error.value = denied.value
      ? 'Pide al dueño o al encargado que revise tu usuario.'
      : e?.exc_type === 'DoesNotExistError'
        ? 'Este documento ya no existe o cambió de número.'
        : errorText(e)
  } finally {
    if (mine === seq) loading.value = false
  }
}

watch(
  () => [doctype.value, name.value],
  () => {
    record.value = null
    load()
  },
  { immediate: true },
)
</script>
