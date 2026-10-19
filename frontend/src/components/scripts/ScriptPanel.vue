<template>
  <!-- One script, right of the list: what it applies to, on/off, the code
       (read-only, numbered), «Editar» with a confirm, its versions, and
       «¿Qué hace?» for the assistant. A custom field shows its properties. -->
  <section class="min-w-0 space-y-4" data-testid="scripts-panel">
    <EmptyState v-if="loading && !detail" state="loading" title="Cargando…" />
    <EmptyState
      v-else-if="error && !detail"
      state="error"
      title="No se pudo abrir"
      :message="error"
    />
    <template v-else-if="detail">
      <header class="space-y-1">
        <h2 class="break-words text-xl font-semibold text-ink-gray-9">
          {{ detail.titulo }}
        </h2>
        <p class="text-base text-ink-gray-7">{{ detail.aplica }}</p>
        <p v-if="detail.campo" class="text-sm text-ink-gray-6">
          {{ detail.name }}
        </p>
      </header>

      <div class="flex flex-wrap items-center gap-2">
        <label
          v-if="detail.activo !== null && detail.activo !== undefined"
          class="flex min-h-11 items-center gap-2 pr-2 text-base text-ink-gray-8"
        >
          <AjustesSwitch
            :model-value="Boolean(detail.activo)"
            :label="detail.activo ? 'Apagar' : 'Activar'"
            :disabled="!detail.puede_editar || busy"
            @update:model-value="emit('toggle', detail)"
          />
          {{ detail.activo ? 'Activo' : 'Apagado' }}
        </label>
        <button
          v-if="detail.puede_editar && !editing"
          type="button"
          :class="BTN.tonal"
          data-testid="scripts-edit"
          @click="startEdit"
        >
          <span class="lucide-pencil size-4" aria-hidden="true" />
          Editar
        </button>
        <button
          v-if="assistant && detail.codigo !== null && !editing"
          type="button"
          :class="BTN.tonal"
          data-testid="scripts-explain"
          @click="emit('explain', detail)"
        >
          <span class="lucide-sparkles size-4" aria-hidden="true" />
          ¿Qué hace?
        </button>
      </div>

      <p
        v-if="detail.nota"
        class="rounded-lg border border-outline-amber-2 bg-surface-amber-1 px-4 py-3 text-base text-ink-amber-7"
        role="note"
      >
        {{ detail.nota }}
      </p>

      <template v-if="detail.codigo !== null && detail.codigo !== undefined">
        <div v-if="editing" class="space-y-2">
          <label class="sr-only" for="scripts-editor">Código</label>
          <textarea
            id="scripts-editor"
            v-model="draft"
            rows="20"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            class="block w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 font-mono text-sm leading-5 text-ink-gray-9"
            data-testid="scripts-editor"
            @keydown.tab.prevent="indent"
          />
          <p v-if="saveError" role="alert" class="text-base text-ink-red-7">
            {{ saveError }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              :class="BTN.filled"
              :disabled="busy || draft === detail.codigo"
              data-testid="scripts-save"
              @click="confirmOpen = true"
            >
              Guardar
            </button>
            <button
              type="button"
              :class="BTN.text"
              :disabled="busy"
              @click="editing = false"
            >
              Cancelar
            </button>
          </div>
        </div>
        <CodeView
          v-else
          :code="detail.codigo"
          :label="`Código de ${detail.titulo}`"
        />
      </template>

      <dl
        v-if="detail.propiedades?.length"
        class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
      >
        <div
          v-for="prop in detail.propiedades"
          :key="prop.campo"
          class="flex flex-wrap gap-x-4 px-4 py-2"
        >
          <dt class="w-40 flex-none text-sm text-ink-gray-6">
            {{ prop.etiqueta }}
          </dt>
          <dd class="min-w-0 flex-1 break-words text-base text-ink-gray-9">
            {{ prop.valor }}
          </dd>
        </div>
      </dl>

      <section
        v-if="detail.versiones?.length"
        aria-labelledby="scripts-versions"
      >
        <h3
          id="scripts-versions"
          class="pb-1 text-base font-semibold text-ink-gray-9"
        >
          Versiones
        </h3>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="(version, index) in detail.versiones" :key="index">
            <ListRow
              icon="lucide-history"
              :title="version.texto"
              :subtitle="`${version.quien} · ${when(version.cuando)}`"
              v-on="
                version.diff?.length ? { click: () => toggleDiff(index) } : {}
              "
            />
            <pre
              v-if="open.has(index)"
              class="mx-4 mb-2 overflow-x-auto rounded-lg bg-surface-gray-1 px-3 py-2 font-mono text-sm leading-5"
            ><code><span
                v-for="(line, i) in version.diff"
                :key="i"
                class="block whitespace-pre"
                :class="line.startsWith('+') ? 'text-ink-green-8' : line.startsWith('-') ? 'text-ink-red-7' : ''"
              >{{ line }}</span></code></pre>
          </li>
        </ul>
      </section>
    </template>
    <EmptyState
      v-else
      title="Elige un script"
      message="Toca uno de la lista para ver su código y sus versiones."
    />

    <ConfirmSheet
      :open="confirmOpen"
      :copy="copy"
      :busy="busy"
      :error="saveError"
      @update:open="(v) => (confirmOpen = v)"
      @confirm="save"
    />
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { EmptyState, ListRow } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import ConfirmSheet from '@/components/documentos/ConfirmSheet.vue'
import { BTN } from '@/documentos/tools'
import { formatDateTime } from '@/utils/display'
import CodeView from './CodeView.vue'
import { errorText, saveCopy, scriptsApi } from './scripts'

const props = defineProps({
  tipo: { type: String, required: true },
  detail: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  /** The shell assistant is on for this user: «¿Qué hace?» shows. */
  assistant: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle', 'saved', 'explain', 'update:busy'])

const editing = ref(false)
const draft = ref('')
const confirmOpen = ref(false)
const saving = ref(false)
const saveError = ref('')
const open = ref(new Set())
const busy = computed(() => props.busy || saving.value)
const copy = computed(() => saveCopy(props.detail))

watch(
  () => props.detail?.name,
  () => {
    editing.value = false
    saveError.value = ''
    open.value = new Set()
  },
)

const when = (value) => (value ? formatDateTime(value) : '')

function startEdit() {
  draft.value = props.detail?.codigo || ''
  saveError.value = ''
  editing.value = true
}
function toggleDiff(index) {
  const next = new Set(open.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  open.value = next
}
// Tab writes a tab in the editor instead of leaving it.
function indent(event) {
  const el = event.target
  const { selectionStart: start, selectionEnd: end } = el
  draft.value = `${draft.value.slice(0, start)}\t${draft.value.slice(end)}`
  requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1))
}

async function save() {
  if (!props.detail || saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const detail = await scriptsApi('guardar', {
      tipo: props.tipo,
      name: props.detail.name,
      codigo: draft.value,
      modificado: props.detail.modificado,
    })
    confirmOpen.value = false
    editing.value = false
    emit('saved', detail)
  } catch (e) {
    saveError.value = errorText(e)
  } finally {
    saving.value = false
  }
}
</script>
