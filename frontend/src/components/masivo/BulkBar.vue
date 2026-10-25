<template>
  <!-- Ediciones masivas (Shell D12): the selection's actions, a bottom bar
       under the thumb while the top bar says «3 seleccionados». Every write
       asks first, then a snackbar offers «Deshacer»; refused documents are
       listed in words. Mounted lazily by the list when selection starts. -->
  <div
    class="absolute inset-x-0 bottom-0 z-10 border-t border-outline-gray-1 bg-surface-base pb-[env(safe-area-inset-bottom)]"
    role="toolbar"
    aria-label="Acciones para los seleccionados"
    data-testid="masivo-bar"
  >
    <p
      v-if="loadError"
      role="alert"
      class="px-4 py-3 text-base text-ink-red-7"
      data-testid="masivo-error"
    >
      {{ loadError }}
    </p>
    <p v-else-if="!nombres.length" class="px-4 py-3 text-base text-ink-gray-6">
      Toca los documentos que quieres cambiar.
    </p>
    <div v-else class="mx-auto flex w-full max-w-3xl">
      <button
        v-for="action in actions"
        :key="action.clave"
        type="button"
        class="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2 disabled:opacity-50"
        :disabled="busy"
        :aria-label="action.etiqueta"
        :data-testid="`masivo-${action.clave}`"
        @click="pick(action)"
      >
        <span :class="[action.icon, 'size-5']" aria-hidden="true" />
        <span class="max-w-full truncate text-xs">{{ action.short }}</span>
      </button>
      <p
        v-if="loading && !actions.length"
        class="flex min-h-14 flex-1 items-center justify-center text-base text-ink-gray-6"
      >
        Cargando…
      </p>
      <p
        v-else-if="!loading && !actions.length"
        class="flex min-h-14 flex-1 items-center px-4 text-base text-ink-gray-6"
      >
        Tu usuario no puede cambiar estos documentos en grupo.
      </p>
    </div>

    <!-- Step sheets: who, which tag, which field, which format. -->
    <BottomSheet
      :open="!!sheet"
      :title="sheetTitle"
      :subtitle="what"
      flush
      @update:open="(v) => !v && (sheet = '')"
    >
      <template v-if="sheet === 'asignar'">
        <div class="px-4 pb-2">
          <label class="sr-only" for="masivo-people-search"
            >Buscar persona</label
          >
          <input
            id="masivo-people-search"
            v-model="peopleSearch"
            type="search"
            enterkeyhint="search"
            class="h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
            placeholder="Buscar persona"
            autocomplete="off"
          />
        </div>
        <ul class="pb-2" data-testid="masivo-people">
          <li v-for="person in people" :key="person.user">
            <ListRow
              :avatar="person.name"
              :title="person.name"
              @click="askAssign(person)"
            />
          </li>
          <li
            v-if="!peopleLoading && !people.length"
            class="px-4 py-3 text-base text-ink-gray-6"
          >
            Nadie se llama así en tu equipo.
          </li>
        </ul>
      </template>

      <div v-else-if="sheet === 'etiquetar'" class="px-4 pb-2">
        <label class="block pb-1 text-sm text-ink-gray-6" for="masivo-tag">
          Etiqueta
        </label>
        <div class="flex gap-2">
          <input
            id="masivo-tag"
            v-model="tagDraft"
            type="text"
            maxlength="40"
            enterkeyhint="done"
            class="h-11 min-w-0 flex-1 rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
            placeholder="Por ejemplo: revisar"
            autocomplete="off"
            @keydown.enter.prevent="addTag(tagDraft)"
          />
          <button
            type="button"
            :class="BTN.tonal"
            :disabled="!tagDraft.trim()"
            @click="addTag(tagDraft)"
          >
            Añadir
          </button>
        </div>
        <div v-if="tags.length" class="flex flex-wrap gap-2 pt-3">
          <button
            v-for="tag in tags"
            :key="tag"
            type="button"
            class="inline-flex min-h-11 items-center gap-1 rounded-full bg-surface-gray-3 px-3 text-base text-ink-gray-9"
            :aria-label="`Quitar ${tag}`"
            @click="tags = tags.filter((t) => t !== tag)"
          >
            {{ tag }}
            <span class="lucide-x size-4" aria-hidden="true" />
          </button>
        </div>
        <template v-if="suggestions.length">
          <p class="pb-1 pt-3 text-sm text-ink-gray-6">Ya usadas aquí</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="tag in suggestions"
              :key="tag"
              type="button"
              class="inline-flex min-h-11 items-center rounded-full border border-outline-gray-2 px-3 text-base text-ink-gray-8 hover:bg-surface-gray-2"
              @click="addTag(tag)"
            >
              {{ tag }}
            </button>
          </div>
        </template>
      </div>

      <template v-else-if="sheet === 'campo'">
        <ul v-if="!field" class="pb-2" data-testid="masivo-fields">
          <li v-for="option in fields" :key="option.fieldname">
            <ListRow
              :title="option.label"
              :subtitle="option.solo_borrador ? 'Solo en borradores' : ''"
              @click="chooseField(option)"
            />
          </li>
        </ul>
        <div v-else class="px-4 pb-2">
          <button
            type="button"
            class="mb-2 inline-flex min-h-11 items-center gap-2 text-base text-ink-gray-7"
            @click="field = null"
          >
            <span class="lucide-arrow-left size-5" aria-hidden="true" />
            Otro campo
          </button>
          <p class="pb-2 text-base-medium text-ink-gray-9">
            {{ field.label }}
          </p>
          <AjustesControl id="masivo-value" v-model="value" :field="field" />
          <p v-if="field.solo_borrador" class="pt-2 text-sm text-ink-gray-6">
            Los confirmados no cambian este campo.
          </p>
        </div>
      </template>

      <ul v-else-if="sheet === 'imprimir'" class="pb-2">
        <li v-for="format in formats" :key="format.name">
          <ListRow
            icon="lucide-file-text"
            :title="format.label"
            :subtitle="format.hint || (format.default ? 'El de siempre' : '')"
            @click="openPdf(format.name)"
          />
        </li>
      </ul>

      <template
        v-if="sheet === 'etiquetar' || (sheet === 'campo' && field)"
        #actions
      >
        <button
          type="button"
          :class="BTN.filled"
          :disabled="sheet === 'etiquetar' && !tags.length && !tagDraft.trim()"
          data-testid="masivo-next"
          @click="sheet === 'etiquetar' ? askTag() : askField()"
        >
          Siguiente
        </button>
      </template>
    </BottomSheet>

    <ConfirmSheet
      :open="!!pending"
      :copy="pending?.copy"
      :busy="busy"
      :error="applyError"
      @update:open="(v) => !v && !busy && (pending = null)"
      @confirm="apply"
    />

    <!-- What stayed as it was, in words. -->
    <BottomSheet
      :open="!!report"
      :title="report?.title || ''"
      :subtitle="report?.subtitle || ''"
      flush
      @update:open="(v) => !v && (report = null)"
    >
      <ul class="pb-2" data-testid="masivo-refused">
        <li v-for="row in report?.rows || []" :key="row.key">
          <ListRow
            :title="row.title"
            :subtitle="row.subtitle"
            :subtitle-lines="2"
            :meta="row.meta"
          />
        </li>
      </ul>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import { BottomSheet, ListRow } from '@/components/ui'
import AjustesControl from '@/components/ajustes/AjustesControl.vue'
import ConfirmSheet from '@/components/documentos/ConfirmSheet.vue'
import { docApi } from '@/documentos/api'
import { BTN, curateFormats } from '@/documentos/tools'
import {
  barActions,
  confirmCopy,
  cuantos,
  doneText,
  errorText,
  exportUrl,
  masivoApi,
  newRequestId,
  printUrl,
  refusedRows,
  undoneText,
  visiblePeople,
} from './masivo'

const props = defineProps({
  doctype: { type: String, required: true },
  /** The selected document names. */
  nombres: { type: Array, default: () => [] },
  /** How many rows the list holds (for «todos»); informative. */
  total: { type: Number, default: 0 },
  /** The list's words: «factura» / «Facturas». */
  singular: { type: String, default: '' },
  plural: { type: String, default: '' },
  /** The profile's print-format curation (profile.printFormats). */
  curate: { type: Object, default: null },
})
const emit = defineEmits(['done', 'clear'])

const opciones = ref(null)
const loading = ref(false)
const loadError = ref('')
const sheet = ref('')
const pending = ref(null)
const busy = ref(false)
const applyError = ref('')
const report = ref(null)

const words = computed(() => ({
  singular: props.singular,
  plural: props.plural,
}))
const what = computed(() => cuantos(props.nombres.length, words.value))
const actions = computed(() => barActions(opciones.value))
const byKey = (key) => actions.value.find((a) => a.clave === key)
const fields = computed(() => byKey('campo')?.campos || [])
const formats = computed(() =>
  curateFormats(byKey('imprimir')?.formatos || [], props.curate),
)
const suggestions = computed(() =>
  (byKey('etiquetar')?.sugeridas || []).filter((t) => !tags.value.includes(t)),
)
const sheetTitle = computed(
  () =>
    ({
      asignar: 'Asignar a…',
      etiquetar: 'Etiquetar',
      campo: field.value ? 'Nuevo valor' : 'Cambiar campo',
      imprimir: 'Imprimir',
    })[sheet.value] || '',
)

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  loadError.value = ''
  try {
    const data = await masivoApi('opciones', { doctype: props.doctype })
    if (mine === seq) opciones.value = data
  } catch (e) {
    if (mine === seq) loadError.value = errorText(e)
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch(() => props.doctype, load, { immediate: true })

function pick(action) {
  applyError.value = ''
  if (action.clave === 'exportar')
    return download(exportUrl(props.doctype, props.nombres))
  if (action.clave === 'imprimir' && formats.value.length <= 1)
    return openPdf(formats.value[0]?.name || '')
  if (action.clave === 'campo') {
    field.value = fields.value.length === 1 ? fields.value[0] : null
    value.value = field.value ? initialValue(field.value) : null
  }
  if (action.clave === 'etiquetar') {
    tags.value = []
    tagDraft.value = ''
  }
  if (action.clave === 'asignar' && !people.value.length) loadPeople()
  sheet.value = action.clave
}

// ── Asignar ──
const people = ref([])
const peopleSearch = ref('')
const peopleLoading = ref(false)
let peopleSeq = 0
let peopleTimer = null
async function loadPeople() {
  const mine = ++peopleSeq
  peopleLoading.value = true
  try {
    const found = await docApi('people', { search: peopleSearch.value })
    if (mine === peopleSeq) people.value = visiblePeople(found)
  } catch (e) {
    if (mine === peopleSeq) toast.error(errorText(e))
  } finally {
    if (mine === peopleSeq) peopleLoading.value = false
  }
}
watch(peopleSearch, () => {
  clearTimeout(peopleTimer)
  peopleTimer = setTimeout(loadPeople, 250)
})
function askAssign(person) {
  ask('asignar', { usuarios: [person.user] }, { persona: person.name })
}

// ── Etiquetar ──
const tags = ref([])
const tagDraft = ref('')
function addTag(raw) {
  const tag = String(raw || '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
  if (tag && !tags.value.some((t) => t.toLowerCase() === tag.toLowerCase()))
    tags.value = [...tags.value, tag]
  tagDraft.value = ''
}
function askTag() {
  if (tagDraft.value.trim()) addTag(tagDraft.value)
  if (!tags.value.length) return
  ask('etiquetar', { etiquetas: tags.value }, { etiquetas: tags.value })
}

// ── Cambiar campo ──
const field = ref(null)
const value = ref(null)
function initialValue(option) {
  return option.fieldtype === 'Check' ? 0 : null
}
function chooseField(option) {
  field.value = option
  value.value = initialValue(option)
}
function askField() {
  if (!field.value) return
  if (field.value.reqd && (value.value === null || value.value === '')) {
    toast.error(`«${field.value.label}» no puede quedar vacío.`)
    return
  }
  ask(
    'campo',
    { campo: field.value.fieldname, valor: value.value },
    { campo: field.value, valor: value.value },
  )
}

// ── Imprimir / Exportar (nothing changes: no confirm) ──
function openPdf(format) {
  sheet.value = ''
  window.open(
    printUrl(props.doctype, props.nombres, format),
    '_blank',
    'noopener',
  )
}
function download(url) {
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener'
  link.download = ''
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// ── Confirm → apply → snackbar with «Deshacer» ──
function ask(accion, datos, ctx) {
  sheet.value = ''
  applyError.value = ''
  pending.value = {
    accion,
    datos,
    ctx,
    names: [...props.nombres],
    requestId: newRequestId(),
    copy: confirmCopy(accion, {
      ...words.value,
      ...ctx,
      count: props.nombres.length,
      horas: opciones.value?.deshacer_horas,
    }),
  }
}

async function apply() {
  const job = pending.value
  if (!job || busy.value) return
  busy.value = true
  applyError.value = ''
  try {
    const result = await masivoApi('aplicar', {
      doctype: props.doctype,
      nombres: job.names,
      accion: job.accion,
      datos: job.datos,
      request_id: job.requestId,
    })
    pending.value = null
    snack(result)
    if (result?.rechazados?.length)
      report.value = {
        title: `${result.rechazados.length} sin cambiar`,
        subtitle: 'Se quedaron como estaban:',
        rows: refusedRows(result.rechazados),
      }
    emit('done', result)
    if (result?.hechos) emit('clear')
  } catch (e) {
    applyError.value = errorText(e)
  } finally {
    busy.value = false
  }
}

function snack(result) {
  const text = doneText(result, words.value)
  const token = result?.deshacer
  if (!result?.hechos) return toast.error(text)
  toast.success(
    text,
    token
      ? {
          duration: 10000,
          action: { label: 'Deshacer', onClick: () => undo(token) },
        }
      : undefined,
  )
}

async function undo(token) {
  try {
    const result = await masivoApi('deshacer', { token })
    const text = undoneText(result, words.value)
    if (result?.fallidos?.length) {
      toast.error(text)
      report.value = {
        title: 'No se pudo deshacer todo',
        subtitle: 'Revisa estos a mano:',
        rows: refusedRows(result.fallidos),
      }
    } else toast.success(text)
    emit('done', { deshecho: true, ...result })
  } catch (e) {
    toast.error(errorText(e))
  }
}

onBeforeUnmount(() => clearTimeout(peopleTimer))
defineExpose({ undo })
</script>
