<template>
  <div class="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
    <!-- One print format (Shell D12, DD20). Desktop: the Jinja code (and CSS)
         on the left, the live preview against a real record on the right.
         Phone: the preview and the fields (tap copies a field); no editing. -->
    <AppBar
      v-if="isPhone"
      :back="{ name: 'Impresion' }"
      back-label="Formatos de impresión"
      :context="
        data
          ? groupTitle({ doctype: data.doc_type, label: data.doctype_label })
          : ''
      "
      :title="data?.label || 'Formato'"
      :loading="loading"
    />
    <div
      class="mx-auto w-full space-y-4 px-4 pb-24 pt-3"
      :class="isWide ? '' : 'max-w-5xl'"
    >
      <EmptyState
        v-if="denied"
        state="denied"
        title="Solo el dueño cambia los formatos"
        :message="error"
      />
      <EmptyState
        v-else-if="loading && !data"
        state="loading"
        title="Abriendo el formato…"
      />
      <EmptyState
        v-else-if="error && !data"
        state="error"
        title="No se pudo abrir el formato"
        :message="error"
        action="Reintentar"
        @action="load"
      />

      <template v-if="data">
        <header class="space-y-2">
          <RouterLink
            v-if="!isPhone"
            :to="{ name: 'Impresion' }"
            class="inline-flex min-h-11 items-center gap-2 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          >
            <span class="lucide-chevron-left size-4" aria-hidden="true" />
            Formatos de impresión
          </RouterLink>
          <div class="flex flex-wrap items-center gap-2">
            <h1
              v-if="!isPhone"
              class="mr-2 text-xl font-semibold text-ink-gray-9"
            >
              {{ data.label }}
            </h1>
            <StatusChip :label="kindText(data.kind)" tone="neutral" />
            <StatusChip
              v-if="data.standard"
              label="De fábrica"
              tone="neutral"
            />
            <StatusChip v-if="data.broken" label="Dañado" tone="danger" />
            <StatusChip
              v-else-if="data.default"
              label="Predeterminado"
              tone="success"
            />
            <div
              v-if="isWide"
              class="ml-auto flex flex-wrap items-center gap-2"
            >
              <button
                type="button"
                :class="BTN.text"
                data-testid="impresion-versiones"
                @click="openVersions"
              >
                <span class="lucide-history size-5" aria-hidden="true" />
                Versiones
              </button>
              <a
                v-if="data.print_designer && data.designer_url"
                :href="data.designer_url"
                :class="BTN.tonal"
                target="_blank"
                rel="noopener"
                data-testid="impresion-print-designer"
              >
                <span class="lucide-external-link size-5" aria-hidden="true" />
                Abrir en Print Designer
              </a>
              <button
                v-if="!data.editable"
                type="button"
                :class="data.kind === 'jinja' ? BTN.filled : BTN.tonal"
                @click="openDuplicate"
              >
                <span class="lucide-copy size-5" aria-hidden="true" />
                {{
                  data.kind === 'jinja' ? 'Duplicar para editar' : 'Duplicar'
                }}
              </button>
              <template v-else>
                <button type="button" :class="BTN.tonal" @click="openDuplicate">
                  <span class="lucide-copy size-5" aria-hidden="true" />
                  Duplicar
                </button>
                <button
                  type="button"
                  :class="BTN.filled"
                  :disabled="!dirty"
                  data-testid="impresion-guardar"
                  @click="confirmSave = true"
                >
                  Guardar
                </button>
              </template>
            </div>
          </div>
          <p
            v-if="data.standard && data.kind === 'jinja'"
            class="text-sm text-ink-gray-6"
          >
            Es de fábrica: se ve pero no se cambia.
            {{
              isWide
                ? 'Duplícalo para editar la copia.'
                : 'Para editarlo, duplícalo en la computadora.'
            }}
          </p>
          <p v-else-if="data.print_designer" class="text-sm text-ink-gray-6">
            Se diseña en Print Designer{{
              isWide ? '' : ', en la computadora'
            }}; aquí ves cómo sale con un documento real.
          </p>
          <p
            v-else-if="data.editable && !isWide"
            class="text-sm text-ink-gray-6"
          >
            El código se edita en la computadora. Aquí puedes ver cómo sale y
            copiar campos.
          </p>
        </header>

        <Segmented
          v-if="!isWide"
          v-model="phoneTab"
          :options="[
            { value: 'vista', label: 'Vista previa' },
            { value: 'campos', label: 'Campos' },
          ]"
          label="Vista"
        />

        <div :class="editorShown ? 'grid grid-cols-2 items-start gap-4' : ''">
          <!-- Left (desktop, Jinja): code, styles, fields. -->
          <div v-if="editorShown" class="min-w-0 space-y-2">
            <Segmented
              v-model="tab"
              :options="[
                { value: 'html', label: 'Código' },
                { value: 'css', label: 'Estilos' },
                { value: 'campos', label: 'Campos' },
              ]"
              label="Editor"
            />
            <CodeEditor
              v-if="tab === 'html'"
              ref="editor"
              v-model="html"
              label="Código de la plantilla"
              :readonly="!data.editable"
              :error-line="renderError?.line || 0"
              @save="askSave"
            />
            <CodeEditor
              v-else-if="tab === 'css'"
              v-model="css"
              label="Estilos"
              :readonly="!data.editable"
              @save="askSave"
            />
            <FieldList
              v-else
              :fields="data.fields"
              :action-label="data.editable ? 'Insertar' : 'Copiar'"
              @pick="useField"
            />
            <div
              v-if="renderError"
              role="alert"
              class="flex items-start gap-2 rounded-lg bg-surface-red-1 px-3 py-2 text-base text-ink-red-7"
              data-testid="impresion-error"
            >
              <span
                class="lucide-info mt-0.5 size-4 flex-none"
                aria-hidden="true"
              />
              <span class="flex-1">{{ renderError.message }}</span>
              <button
                v-if="renderError.line && tab === 'html'"
                type="button"
                class="min-h-11 flex-none rounded-full px-3 text-sm font-medium hover:bg-surface-gray-2"
                @click="editor?.goToLine(renderError.line)"
              >
                Ir a la línea
              </button>
            </div>
          </div>

          <!-- Right (and the phone's «Vista previa»): a real record, rendered. -->
          <div v-if="isWide || phoneTab === 'vista'" class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-end gap-2">
              <!-- Phone: the picker on its own line, the zoom under it. -->
              <RecordPicker
                v-model="record"
                :class="isWide ? 'min-w-0 flex-1' : 'w-full'"
                :doctype="data.doc_type"
              />
              <ZoomControls v-model="zoom" />
              <button
                v-if="editorShown"
                type="button"
                :class="BTN.tonal"
                :disabled="rendering || !record"
                data-testid="impresion-probar"
                @click="render"
              >
                <span class="lucide-refresh-cw size-5" aria-hidden="true" />
                {{ rendering ? 'Probando…' : 'Probar' }}
              </button>
            </div>
            <EmptyState
              v-if="!record && !loading"
              title="No hay documentos para probar"
              :message="'Cuando haya documentos de este tipo podrás ver aquí cómo sale.'"
            />
            <EmptyState
              v-else-if="previewError && !srcdoc"
              state="error"
              :title="previewError.message"
              :message="
                previewError.detalle &&
                previewError.detalle !== previewError.message
                  ? previewError.detalle
                  : ''
              "
            />
            <p
              v-else-if="previewError && !editorShown"
              role="alert"
              class="text-base text-ink-red-7"
            >
              {{ previewError.message }}
            </p>
            <EmptyState
              v-if="rendering && !srcdoc && record"
              state="loading"
              title="Preparando la vista previa…"
            />
            <PreviewFrame
              v-if="srcdoc"
              v-model:zoom="zoom"
              class="rounded-lg"
              :srcdoc="srcdoc"
              :loading="rendering"
              :title="`Vista previa de ${data.label}`"
            />
          </div>

          <FieldList
            v-if="!isWide && phoneTab === 'campos'"
            :fields="data.fields"
            action-label="Copiar"
            @pick="useField"
          />
        </div>
      </template>
    </div>

    <!-- Guardar: say what it changes before it does. -->
    <BottomSheet
      v-model:open="confirmSave"
      :title="`¿Guardar «${data?.label || ''}»?`"
      :dismissible="!saving"
    >
      <p class="text-base text-ink-gray-7">
        Desde la próxima impresión, {{ each }} sale con este código. La versión
        anterior queda en «Versiones».
      </p>
      <p v-if="renderError" class="pt-2 text-base text-ink-red-7">
        Ojo: la última prueba falló ({{ renderError.message }}).
      </p>
      <template #actions>
        <button
          type="button"
          :class="BTN.filled"
          :disabled="saving"
          data-testid="impresion-confirmar-guardar"
          @click="save"
        >
          {{ saving ? 'Guardando…' : 'Guardar' }}
        </button>
        <button
          type="button"
          :class="BTN.text"
          :disabled="saving"
          @click="confirmSave = false"
        >
          Seguir editando
        </button>
      </template>
    </BottomSheet>

    <!-- Duplicar: a custom copy the owner can edit. -->
    <BottomSheet
      v-model:open="duplicating"
      title="Duplicar formato"
      :subtitle="data?.label || ''"
      :dismissible="!saving"
    >
      <label class="block text-sm text-ink-gray-6" for="impresion-copia">
        Nombre de la copia
      </label>
      <input
        id="impresion-copia"
        v-model="copyTitle"
        type="text"
        class="mt-1 min-h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
        @keydown.enter="duplicate"
      />
      <p v-if="dirty" class="pt-2 text-sm text-ink-gray-6">
        La copia lleva el formato guardado; tus cambios sin guardar no.
      </p>
      <template #actions>
        <button
          type="button"
          :class="BTN.filled"
          :disabled="saving || !copyTitle.trim()"
          @click="duplicate"
        >
          {{ saving ? 'Duplicando…' : 'Duplicar' }}
        </button>
        <button
          type="button"
          :class="BTN.text"
          :disabled="saving"
          @click="duplicating = false"
        >
          Cancelar
        </button>
      </template>
    </BottomSheet>

    <!-- Versiones: Frappe's change history of the format. -->
    <BottomSheet
      v-model:open="showVersions"
      title="Versiones"
      :subtitle="data?.label || ''"
      flush
    >
      <EmptyState
        v-if="versionsLoading && !versions.length"
        state="loading"
        title="Cargando versiones…"
      />
      <EmptyState
        v-else-if="!versions.length"
        title="Sin cambios todavía"
        message="Cada vez que alguien guarde este formato aparecerá aquí."
      />
      <ul v-else>
        <li v-for="v in versions" :key="v.name">
          <ListRow
            icon="lucide-history"
            :title="v.summary"
            :subtitle="`${v.who} · ${formatDateTime(v.when)}`"
          />
        </li>
      </ul>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { useDebounceFn, useEventListener } from '@vueuse/core'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  ListRow,
  Segmented,
  StatusChip,
} from '@/components/ui'
import { isMobile as isPhone, isWide } from '@/composables/breakpoint'
import { errorText } from '@/documentos/api'
import { BTN, copyText } from '@/documentos/tools'
import { formatDateTime } from '@/utils/display'
import { impresionApi, isDenied } from '@/components/impresion/api'
import {
  copyName,
  fieldSnippet,
  groupTitle,
  kindText,
  previewDocument,
} from '@/components/impresion/impresion'
import CodeEditor from '@/components/impresion/CodeEditor.vue'
import FieldList from '@/components/impresion/FieldList.vue'
import PreviewFrame from '@/components/impresion/PreviewFrame.vue'
import RecordPicker from '@/components/impresion/RecordPicker.vue'
import ZoomControls from '@/components/impresion/ZoomControls.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const error = ref('')
const denied = ref(false)
const data = ref(null)
const html = ref('')
const css = ref('')
const saved = ref({ html: '', css: '' })
const record = ref(null)
const tab = ref('html')
const phoneTab = ref('vista')
const zoom = ref(1)
const editor = ref(null)

const preview = ref(null)
const rendering = ref(false)
const renderError = ref(null)
const previewError = ref(null)

const confirmSave = ref(false)
const duplicating = ref(false)
const copyTitle = ref('')
const saving = ref(false)
const showVersions = ref(false)
const versions = ref([])
const versionsLoading = ref(false)

const name = computed(() => String(route.params.formato || ''))
const editorShown = computed(() => isWide.value && data.value?.kind === 'jinja')
const dirty = computed(
  () =>
    !!data.value?.editable &&
    (html.value !== saved.value.html || css.value !== saved.value.css),
)
const srcdoc = computed(() =>
  preview.value?.html ? previewDocument(preview.value) : '',
)
/** «cada factura», «cada cotización»… for the sentences (no gender to guess). */
const each = computed(() => {
  const title = data.value
    ? groupTitle({
        doctype: data.value.doc_type,
        label: data.value.doctype_label,
      })
    : ''
  return `cada ${(title || 'documento').toLowerCase()}`
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const out = await impresionApi('formato', { name: name.value })
    data.value = out
    html.value = out.html || ''
    css.value = out.css || ''
    saved.value = { html: html.value, css: css.value }
    record.value = out.sample
    renderError.value = null
    previewError.value = null
    preview.value = null
    denied.value = false
    render()
  } catch (e) {
    denied.value = isDenied(e)
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}

let request = 0
async function render() {
  if (!data.value || !record.value) return
  const mine = ++request
  rendering.value = true
  try {
    const out = editorShown.value
      ? await impresionApi('probar', {
          doctype: data.value.doc_type,
          name: record.value.name,
          html: html.value,
          css: css.value,
          formato: data.value.name,
        })
      : await impresionApi('vista_previa', {
          doctype: data.value.doc_type,
          name: record.value.name,
          formato: data.value.name,
        })
    if (mine !== request) return
    // A failed render keeps the last good page and says why next to the code.
    if (out?.html) preview.value = out
    renderError.value = editorShown.value ? out?.error || null : null
    previewError.value = editorShown.value ? null : out?.error || null
  } catch (e) {
    if (mine !== request) return
    const message = errorText(e)
    if (editorShown.value) renderError.value = { message, line: null }
    else previewError.value = { message }
  } finally {
    if (mine === request) rendering.value = false
  }
}
const renderSoon = useDebounceFn(render, 900)
watch([html, css], () => {
  if (editorShown.value && dirty.value) renderSoon()
})
watch(record, (now, was) => {
  if (now && was && now.name !== was.name) render()
})
watch(name, (now, was) => {
  if (now && now !== was) load()
})

async function useField(field) {
  const snippet = fieldSnippet(field)
  if (editorShown.value && data.value.editable) {
    tab.value = 'html'
    // The editor mounts with the tab; insert on the next tick.
    setTimeout(() => editor.value?.insert(snippet), 0)
    return
  }
  if (await copyText(snippet))
    toast.success(`Copiado: ${snippet.split('\n')[0]}`)
  else toast.error('No se pudo copiar.')
}

function askSave() {
  if (dirty.value) confirmSave.value = true
}

async function save() {
  saving.value = true
  try {
    const out = await impresionApi('guardar', {
      name: data.value.name,
      html: html.value,
      css: css.value,
      modified: data.value.modified,
    })
    data.value = { ...data.value, modified: out.modified }
    saved.value = { html: html.value, css: css.value }
    confirmSave.value = false
    toast.success('Guardado. La próxima impresión ya sale así.')
    if (showVersions.value) loadVersions()
  } catch (e) {
    toast.error(errorText(e))
  } finally {
    saving.value = false
  }
}

function openDuplicate() {
  copyTitle.value = copyName(data.value?.label)
  duplicating.value = true
}

async function duplicate() {
  const title = copyTitle.value.trim()
  if (!title || saving.value) return
  saving.value = true
  try {
    const out = await impresionApi('duplicar', {
      name: data.value.name,
      nuevo_nombre: title,
    })
    duplicating.value = false
    toast.success(`Listo: «${out.name}» es tuyo para editar.`)
    saved.value = { html: html.value, css: css.value } // leave without the unsaved prompt
    router.push({ name: 'ImpresionFormato', params: { formato: out.name } })
  } catch (e) {
    toast.error(errorText(e))
  } finally {
    saving.value = false
  }
}

async function loadVersions() {
  versionsLoading.value = true
  try {
    versions.value =
      (await impresionApi('versiones', { name: data.value.name })) || []
  } catch (e) {
    toast.error(errorText(e))
  } finally {
    versionsLoading.value = false
  }
}
function openVersions() {
  showVersions.value = true
  loadVersions()
}

// Unsaved code is never lost silently.
const LEAVE = 'Tienes cambios sin guardar en el formato. ¿Salir sin guardar?'
onBeforeRouteLeave(() => !dirty.value || window.confirm(LEAVE))
useEventListener(window, 'beforeunload', (event) => {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = LEAVE
})

onMounted(load)
onBeforeUnmount(() => {
  request++
})
</script>
