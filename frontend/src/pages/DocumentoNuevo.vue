<template>
  <!-- /documentos/:slug/nuevo (Shell SPEC §6 DD2, D1.2): a new draft, blank
       or prefilled by ERPNext's mapper (?origen=…&desde=…&con=…), a copy
       (?duplicar=) or an amendment (?modificar=). Saving creates the draft and
       opens it; «Confirmar» is its next step there. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="backTo"
      back-label="Volver"
      :context="context"
      :title="title"
      :bell="false"
    />
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
        <EmptyState
          v-if="loadError"
          :state="denied ? 'denied' : 'error'"
          :title="
            denied ? 'No puedes crear este documento' : 'No se pudo preparar'
          "
          :message="loadError"
          :action="denied ? '' : 'Reintentar'"
          @action="load"
        />
        <EmptyState v-else-if="!form" state="loading" title="Preparando…" />
        <template v-else>
          <p v-if="party" class="pb-4 text-base text-ink-gray-7">
            {{ party }}
          </p>
          <EditForm
            v-model:changes="changes"
            v-model:rows="rows"
            :fields="form.fields"
            :items="form.items"
            :doc="draft?.doc || {}"
          />
        </template>
      </div>
    </div>
    <div
      v-if="form"
      class="flex-none border-t border-outline-gray-1 bg-surface-base documento-nuevo-bar px-4 pt-3"
    >
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-2">
        <p v-if="error" role="alert" class="text-base text-ink-red-7">
          {{ error }}
        </p>
        <button
          type="button"
          :class="BTN.filled"
          :disabled="saving"
          data-testid="documentos-create"
          @click="save"
        >
          {{ saving ? 'Guardando…' : 'Guardar borrador' }}
        </button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AppBar, EmptyState } from '@/components/ui'
import EditForm from '@/components/documentos/EditForm.vue'
import { docApi, errorText } from '@/documentos/api'
import {
  missingRequired,
  prefillFromQuery,
  rowsChanged,
  rowsForSave,
  sourceFromQuery,
} from '@/documentos/form'
import { loadProfile } from '@/documentos/profiles'
import {
  documentRoute,
  floorRoute,
  listRoute,
  profileBySlug,
} from '@/documentos/registry'
import { BTN } from '@/documentos/tools'
import { feminineNoun, kindLabel } from '@/utils/display'

const route = useRoute()
const router = useRouter()

const base = computed(() =>
  route.path.startsWith('/inventario') ? '/inventario' : '/documentos',
)
const entry = computed(() =>
  route.params.slug ? profileBySlug(route.params.slug, base.value) : null,
)
const doctype = computed(
  () => entry.value?.doctype || String(route.params.doctype || ''),
)
const source = computed(() => sourceFromQuery(route.query, doctype.value))

const form = ref(null)
const draft = ref(null)
const changes = ref({})
const rows = ref([])
const startRows = ref([])
const loadError = ref('')
const denied = ref(false)
const error = ref('')
const saving = ref(false)

const kind = computed(() => kindLabel(doctype.value) || 'documento')
// «Nueva factura», «Nuevo cobro»: gender from the noun's first word.
const title = computed(() => {
  const word = kind.value.toLowerCase()
  const fem = feminineNoun(word)
  if (source.value?.amend) return `Modificar ${word}`
  return `${fem ? 'Nueva' : 'Nuevo'} ${word}`
})
const context = computed(() =>
  entry.value ? entry.value.label : kindLabel(doctype.value),
)
const party = computed(() =>
  draft.value?.title && draft.value.title !== draft.value.doc?.name
    ? `Para ${draft.value.title}`
    : '',
)
const backTo = computed(() =>
  typeof window !== 'undefined' && window.history.state?.back
    ? true
    : entry.value
      ? listRoute(entry.value)
      : floorRoute(doctype.value),
)

let seq = 0
async function load() {
  if (!doctype.value) return
  const mine = ++seq
  loadError.value = ''
  denied.value = false
  form.value = null
  try {
    const profile = await loadProfile({
      doctype: doctype.value,
      entry: entry.value,
    })
    const [shape, made] = await Promise.all([
      docApi('form', {
        doctype: doctype.value,
        fields: profile.editFields || undefined,
      }),
      docApi('draft', {
        doctype: doctype.value,
        source: source.value || undefined,
      }),
    ])
    if (mine !== seq) return
    draft.value = made
    startRows.value = (made.items?.rows || []).map((r) => ({ ...r }))
    rows.value = startRows.value.map((r) => ({ ...r }))
    changes.value = prefillFromQuery(route.query, shape.fields)
    form.value = shape
  } catch (e) {
    if (mine !== seq) return
    denied.value = e?.exc_type === 'PermissionError'
    loadError.value = denied.value
      ? 'Pide al dueño o al encargado que revise tu usuario.'
      : errorText(e)
  }
}

async function save() {
  const missing = missingRequired(
    form.value.fields,
    changes.value,
    draft.value?.doc,
  )
  if (missing.length) {
    error.value = `Falta: ${missing.join(', ')}.`
    return
  }
  saving.value = true
  error.value = ''
  const values = { ...changes.value }
  if (
    form.value.items &&
    (rowsChanged(startRows.value, rows.value) || !startRows.value.length)
  )
    values[form.value.items.fieldname] = rowsForSave(rows.value)
  try {
    const saved = await docApi('save', {
      doctype: doctype.value,
      values,
      source: source.value || undefined,
    })
    const to =
      documentRoute(saved.doctype, saved.name, { hint: saved.slug_hint }) ||
      floorRoute(saved.doctype, saved.name)
    router.replace(to)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    saving.value = false
  }
}

watch(
  () => [doctype.value, route.fullPath],
  () => load(),
  { immediate: true },
)
</script>
<style scoped>
.documento-nuevo-bar {
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
}
</style>
