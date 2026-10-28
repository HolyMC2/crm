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
      :context="
        view ? [view.kind, view.number].filter(Boolean).join(' · ') : ''
      "
      :title="view?.title || entry?.label || 'Documento'"
      :bell="phone"
      :loading="(loading || busy) && !!record"
    >
      <!-- WhatsApp-style: the name, and under it the state and the number. -->
      <template v-if="view" #title>
        <div class="flex min-h-12 min-w-0 flex-col justify-center px-3">
          <span
            class="title-face line-clamp-2 break-words text-xl font-semibold leading-tight [text-wrap:balance]"
            data-appbar-title
            >{{ view.title || entry?.label || 'Documento' }}</span
          >
          <span class="flex min-w-0 items-center gap-2 pt-0.5">
            <!-- Shell D12: under a Workflow the chip is its state («Aprobada»). -->
            <StatusChip
              v-if="record.workflow && record.workflow_state"
              :status="record.workflow_state.value"
              :label="record.workflow_state.label"
              data-testid="documentos-workflow-state"
            />
            <StatusChip
              v-else-if="view.status"
              :status="view.status"
              :label="view.statusLabel || ''"
              :tone="view.tone"
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              [view.kind, view.number].filter(Boolean).join(' ')
            }}</span>
          </span>
        </div>
      </template>
      <template #actions>
        <RecordIsland
          v-if="record"
          :reach="record.header.reach || {}"
          :who="view?.title || ''"
          :mail="record.actions?.email || null"
          :composer="composerOn"
          :groups="boltGroups"
          :phone="phone"
          :subtitle="scopeTitle"
          @message="composerOpen = true"
          @mail="mail"
          @pick="onBolt"
          @tools="toolsOpen = true"
        />
        <!-- In the split the close sits last, where a window's close sits. -->
        <button
          v-if="pane"
          type="button"
          class="flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          aria-label="Cerrar documento (Esc)"
          @click="close"
        >
          <span class="lucide-x size-6" aria-hidden="true" />
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
          pane ? 'documento-grid-pane' : 'lg:grid-cols-[minmax(0,1fr)_22rem]'
        "
      >
        <div class="flex min-w-0 flex-col gap-5 pt-4">
          <section
            class="flex flex-col gap-2 px-4"
            data-testid="documentos-hero"
          >
            <span v-if="record.header.is_return" class="text-sm text-ink-gray-7"
              >Devolución</span
            >
            <p
              v-if="view.amount"
              class="text-3xl font-semibold tabular-nums leading-tight text-ink-gray-9"
            >
              {{ view.amount }}
            </p>
            <StageSteps v-if="stages" :stages="stages" class="py-2" />
            <p class="flex flex-wrap gap-x-3 text-base text-ink-gray-7">
              <span v-if="view.date">{{ view.date }}</span>
              <span v-if="view.due" :class="overdue ? 'text-ink-red-7' : ''">{{
                view.due
              }}</span>
            </p>
            <div
              v-if="step || altSteps.length || canEdit"
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
                v-for="alt in altSteps"
                :key="alt.label"
                type="button"
                :class="BTN.tonal"
                :disabled="busy"
                data-testid="documentos-alt-step"
                @click="runStep(alt)"
              >
                <span
                  v-if="alt.icon"
                  :class="[alt.icon, 'size-5']"
                  aria-hidden="true"
                />
                {{ alt.label }}
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
            <!-- Shell D12: a Workflow's next steps («Aprobar», «Rechazar»). -->
            <TransicionesBar
              v-if="record.workflow"
              :doctype="doctype"
              :name="name"
              :title="view?.title || ''"
              class="pt-2"
              @done="onWorkflowDone"
            />
          </section>
          <component
            :is="panel.component"
            v-for="panel in heroPanels"
            :key="panel.key"
            :record="record"
            :doctype="doctype"
            :name="name"
          />
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
        <aside class="flex min-w-0 flex-col gap-5 pt-5">
          <component
            :is="panel.component"
            v-for="panel in asidePanels"
            :key="panel.key"
            :record="record"
            :doctype="doctype"
            :name="name"
          />
          <Conexiones
            v-if="sections.includes('conexiones')"
            :connections="record.connections"
            :scope-label="scopeLabel"
          />
          <RecordActivity
            v-if="sections.includes('actividad')"
            ref="recordActivity"
            :doctype="doctype"
            :name="name"
            :activity="record.activity"
            :noun="noun"
            :currency="record.header.currency || 'MXN'"
            :title="view?.title || scopeTitle"
            :curate="profile.printFormats || null"
            :can-attach="!!record.actions?.attach?.allowed"
            @attach="pickFile"
            @changed="setActivity"
          />
          <component
            :is="recordPendientes"
            v-if="recordPendientes && view"
            :reference-type="doctype"
            :reference-name="name"
            :reference-label="scopeTitle"
            :return-label="view.kind"
            class="px-4"
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
        :tools="sheetTools"
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
        :curate="profile.printFormats || null"
        @shared="onShared"
      />
      <CorreoSheet
        v-if="correoMounted"
        v-model:open="correoOpen"
        :doctype="doctype"
        :name="name"
        :title="view?.title || ''"
        :curate="profile.printFormats || null"
      />
      <EditSheet
        v-if="canEdit"
        v-model:open="editOpen"
        :record="record"
        :edit-fields="profile.editFields"
        :more-fields="profile.moreFields || null"
        :field-labels="profile.fieldLabels || null"
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
      <ChannelComposer
        v-if="composerOpen"
        v-model="composerOpen"
        :doctype="doctype"
        :docname="name"
        :phone="record.header.reach?.phone || ''"
        :contact-name="view?.title || ''"
      />
      <RepetirSheet
        v-if="repetirOpen"
        v-model:open="repetirOpen"
        :doctype="doctype"
        :name="name"
        :title="view?.title || ''"
        @changed="saved()"
      />
    </template>
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, shallowRef, watch } from 'vue'
import {
  SOURCE_DOCTYPES as LABEL_SOURCES,
  etiquetasHref,
} from '@/composables/useEtiquetas'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { AppBar, EmptyState, StatusChip } from '@/components/ui'
import Conexiones from '@/components/documentos/Conexiones.vue'
import StageSteps from '@/components/documentos/StageSteps.vue'
import DatosList from '@/components/documentos/DatosList.vue'
import DocTotals from '@/components/documentos/DocTotals.vue'
import ItemsCards from '@/components/documentos/ItemsCards.vue'
import ToolsSheet from '@/components/documentos/ToolsSheet.vue'
import RecordIsland from '@/components/documentos/RecordIsland.vue'
import ConfirmSheet from '@/components/documentos/ConfirmSheet.vue'
import {
  assistantEnabled,
  openAssistant,
  useAssistantContext,
} from '@/components/assistant/useAssistant'
import { isMobile, isWide } from '@/composables/breakpoint'
import { useFormKeys } from '@/composables/pageKeys'
import { shellBoot } from '@/composables/muelleShell'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
import { FOLLOW_UP, recordActionsFor } from '@/documentos/acciones'
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
import { feminineNoun, formatDue, kindLabel } from '@/utils/display'

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
// Shell D12: «Enviar por correo» and the record's mail, «Repetir cada…», and a
// Workflow's steps.
const CorreoSheet = defineAsyncComponent(
  () => import('@/components/correo/CorreoSheet.vue'),
)
// Actividad y comentarios: chips, comment box, emails and the timeline.
const RecordActivity = defineAsyncComponent(
  () => import('@/components/documentos/RecordActivity.vue'),
)
const recordActivity = ref(null)
// WhatsApp with the shop's templates and a logged intent (Ventas); without
// Ventas the icon opens wa.me.
const ChannelComposer = defineAsyncComponent(
  () => import('@/components/doco/channel/ChannelComposer.vue'),
)
const RepetirSheet = defineAsyncComponent(
  () => import('@/components/automatizaciones/RepetirSheet.vue'),
)
const TransicionesBar = defineAsyncComponent(
  () => import('@/components/automatizaciones/TransicionesBar.vue'),
)
// Packages that land on their own: D5's «Avísame…» and D6's «Todos los
// ajustes». A glob finds them when they are on this branch, else nothing.
const AVISAME = import.meta.glob('../components/documentos/avisame.js')
const AVISAME_SHEET = import.meta.glob(
  '../components/documentos/AvisameSheet.vue',
)
const AJUSTES = import.meta.glob('../components/ajustes/ajustes.js')
// D7's camera door (DD14): «Tomar foto» shows only once it is on this branch.
const CAMERA = import.meta.glob('../components/captura/cameraDoor.js')
// D8's pendientes of this record (DD15), once it is on this branch.
const PENDIENTES = import.meta.glob(
  '../components/pendientes/RecordPendientes.vue',
)
const [pendientesLoader] = Object.values(PENDIENTES)
const recordPendientes = pendientesLoader
  ? defineAsyncComponent(pendientesLoader)
  : null

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
  return feminineNoun(kind) ? `la ${kind}` : `el ${kind}`
})
const scopeLabel = computed(() =>
  view.value ? `${noun.value} de ${view.value.title}` : '',
)
const scopeTitle = computed(() =>
  view.value ? `${view.value.kind} de ${view.value.title}` : '',
)
const pdfTitle = computed(() =>
  view.value
    ? [view.value.kind, view.value.number].filter(Boolean).join(' ')
    : name.value,
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
const stages = computed(() =>
  record.value && profile.value?.stages
    ? profile.value.stages(record.value) || null
    : null,
)
// A step is offered only when the record allows it (a draft the worker may submit).
function offered(s) {
  if (!s) return false
  if (s.submit && !record.value?.actions?.submit?.allowed) return false
  // A mapper step needs create on what it makes (server: actions.make_<key>).
  if (s.make && record.value?.actions?.[`make_${s.make}`]?.allowed === false)
    return false
  return true
}
const step = computed(() => {
  if (!record.value || !profile.value?.nextStep) return null
  const s = profile.value.nextStep(record.value)
  return offered(s) ? s : null
})
// Other steps of this state (Pedido: «Entregar» filled, «Facturar» tonal).
const altSteps = computed(() => {
  if (!record.value || !profile.value?.altSteps) return []
  return (profile.value.altSteps(record.value) || []).filter(offered)
})

// Profile panels (the «Creado desde» chain, Atribución): lazy components
// under the hero (`at: 'hero'`) or at the top of the side column (`aside`).
const panelCache = new Map()
function panelsAt(at) {
  return (profile.value?.panels || [])
    .filter((p) => (p.at || 'aside') === at && p.load)
    .filter((p) => !p.when || (record.value && p.when(record.value)))
    .map((p) => {
      const key = p.key || p.at
      if (!panelCache.has(p.load))
        panelCache.set(p.load, defineAsyncComponent(p.load))
      return { key, component: panelCache.get(p.load) }
    })
}
const heroPanels = computed(() => (record.value ? panelsAt('hero') : []))
const asidePanels = computed(() => (record.value ? panelsAt('aside') : []))

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
const correoOpen = ref(false)
const correoMounted = ref(false)
const repetirOpen = ref(false)
const avisameSheet = shallowRef(null)
const avisameDoctypes = ref(null)
const ajustes = shallowRef(null)
const busy = ref(false)

const extraTools = computed(() => {
  const out = []
  if (ajustes.value)
    out.push({
      key: 'ajustes',
      label: 'Ficha completa',
      icon: 'lucide-sliders-horizontal',
      allowed: true,
      hint: 'Cada campo con lo que hace',
    })
  if (recordPendientes)
    out.push({
      key: 'pendiente',
      label: 'Nuevo pendiente',
      icon: 'lucide-circle-check',
      allowed: true,
      hint: 'Queda ligado a este documento',
    })
  if (assistantEnabled.value)
    out.push({
      key: 'preguntar',
      label: 'Pregúntale a Muelle sobre esta ficha',
      icon: 'lucide-sparkles',
      allowed: true,
    })
  // Labels for what this document brought in (Shell-S13): its lines, one
  // label per piece, serial or lote, in Productos › Etiquetas.
  const labelDocstatus =
    record.value?.header?.docstatus ?? record.value?.doc?.docstatus
  if (
    LABEL_SOURCES.includes(doctype.value) &&
    (labelDocstatus === 1 ||
      (doctype.value === 'Purchase Invoice' && labelDocstatus === 0))
  )
    out.push({
      key: 'etiquetas',
      label: 'Imprimir etiquetas',
      icon: 'lucide-tag',
      allowed: true,
      hint: 'Una por pieza de este documento',
    })
  const actions = record.value?.actions || {}
  if (actions.email)
    out.push({
      key: 'correo',
      label: 'Enviar por correo',
      icon: 'lucide-mail',
      allowed: !!actions.email.allowed,
      reason: actions.email.reason || '',
      hint: 'Con el PDF y una plantilla',
    })
  // «Repetir cada…» shows when it can run, and on a confirmed document with
  // the reason (the owner can allow it); drafts do not list it.
  const repeat = actions.auto_repeat
  const docstatus =
    record.value?.header?.docstatus ?? record.value?.doc?.docstatus
  if (
    repeat &&
    (repeat.allowed || (record.value?.submittable && docstatus === 1))
  )
    out.push({
      key: 'repetir',
      label: 'Repetir cada…',
      icon: 'lucide-refresh-cw',
      allowed: true,
      hint: repeat.allowed ? 'Se crea una copia sola' : repeat.reason || '',
    })
  return out
})
const tools = computed(() =>
  toolsFor(record.value, {
    wide: isWide.value,
    avisame: !!avisameDoctypes.value?.includes(doctype.value),
    camera: Object.keys(CAMERA).length > 0,
    extra: extraTools.value,
  }),
)
// The bolt holds the steps and the follow-ups; «⋯» keeps the rest.
const boltGroups = computed(() =>
  record.value
    ? recordActionsFor({
        steps: [step.value, ...altSteps.value].filter(Boolean),
        canEdit: canEdit.value,
        tools: tools.value,
      })
    : [],
)
const sheetTools = computed(() =>
  tools.value.filter((t) => !FOLLOW_UP.includes(t.key)),
)
function onBolt({ key }) {
  if (key === 'editar') editOpen.value = true
  else if (key.startsWith('paso:')) {
    const s = [step.value, ...altSteps.value].filter(Boolean)[
      Number(key.slice(5))
    ]
    if (s) runStep(s)
  } else onTool(key)
}
const composerOn = computed(() => moduleEnabled(shellBoot.value, 'ventas'))
const composerOpen = ref(false)
function mail() {
  const action = record.value?.actions?.email
  if (action?.allowed) onTool('correo')
  else toast.error(action?.reason || 'No se puede enviar por correo.')
}
const confirmCopyFor = computed(() =>
  confirmCopy(confirmKind.value, {
    noun: noun.value,
    title: view.value?.title || '',
    doctype: doctype.value,
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
        props.pane
          ? { path: listTo.value.path, query: route.query }
          : listTo.value,
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

// A Workflow step done: back to «Por aprobar» when the worker came from it.
async function onWorkflowDone() {
  const { completeTo, goTo } = await import('@/composables/useAprobaciones')
  const back = completeTo(route.query.return_to, doctype.value, name.value)
  if (back) return goTo(router, back)
  await saved()
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

async function takePhoto() {
  const [door] = Object.values(CAMERA)
  if (!door) return
  try {
    const { openCamera } = await door()
    const filed = await openCamera({
      record: { doctype: doctype.value, name: name.value },
      title: 'Tomar foto',
    })
    if (filed) await load()
  } catch (e) {
    toast.error(e?.message || 'No se pudo abrir la cámara.')
  }
}

function onShared(result) {
  if (result === 'copied') toast.success('Enlace copiado')
  else if (result === 'failed') toast.error('No se pudo compartir.')
}

async function onTool(key) {
  const nuevo = (query) => {
    const to = documentRoute(doctype.value, 'nuevo', { hint: record.value.doc })
    router.push({
      path: to?.path || floorRoute(doctype.value, 'nuevo').path,
      query,
    })
  }
  switch (key) {
    case 'assign':
      assignOpen.value = true
      break
    case 'comment':
      // the comment box under Actividad when the record shows it, else the sheet
      if (recordActivity.value) recordActivity.value.open('comment')
      else commentOpen.value = true
      break
    case 'tag':
    case 'team':
      recordActivity.value?.open(key === 'team' ? 'share' : 'tag')
      break
    case 'attach':
      pickFile()
      break
    case 'camera':
      await takePhoto()
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
    case 'correo':
      // RecordActivity sends and then lists the new email; the page's sheet
      // only serves a record without Actividad.
      if (recordActivity.value) recordActivity.value.open('correo')
      else {
        correoMounted.value = true
        correoOpen.value = true
      }
      break
    case 'repetir':
      repetirOpen.value = true
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
    case 'pendiente':
      router.push({
        path: '/pendientes',
        query: {
          create: 1,
          reference_type: doctype.value,
          reference_name: name.value,
          reference_label: scopeTitle.value,
          return_to: `/crm${route.fullPath}`,
        },
      })
      break
    case 'preguntar':
      openAssistant({ text: '' })
      break
    case 'desk':
      window.open(deskUrl(doctype.value, name.value), '_blank', 'noopener')
      break
    case 'etiquetas':
      router.push(
        etiquetasHref([], { desde: `${doctype.value}:${name.value}` }),
      )
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
  // Esc over a sheet closes the sheet only, never the record under it (the
  // sheet's own Esc runs too; its dialog is still in the DOM at this point).
  when: {
    edit: () => canEdit.value && !overSheet(),
    close: () => !overSheet(),
  },
})
function overSheet() {
  return !!document.querySelector('[role="dialog"], [role="alertdialog"]')
}

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
<style scoped>
@media (min-width: 1536px) {
  .documento-grid-pane {
    grid-template-columns: minmax(0, 1fr) 20rem;
  }
}
</style>
