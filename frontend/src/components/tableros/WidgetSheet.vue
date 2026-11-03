<template>
  <BottomSheet
    :open="open"
    :title="widget?.id ? 'Editar widget' : 'Agregar widget'"
    :dismissible="!saving"
    @update:open="(value) => $emit('update:open', value)"
  >
    <form
      v-if="draft"
      id="widget-form"
      class="space-y-5 pb-2"
      data-testid="widget-sheet"
      @submit.prevent="save"
    >
      <FormControl
        v-model="draft.titulo"
        type="text"
        label="Título"
        :maxlength="80"
        placeholder="Ventas por día"
        class="[&_input]:min-h-11"
      />

      <fieldset>
        <legend class="mb-2 text-sm font-medium text-ink-gray-8">
          Qué muestra
        </legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="t in TIPOS"
            :key="t.value"
            type="button"
            :aria-pressed="draft.tipo === t.value ? 'true' : 'false'"
            :class="chipClass(draft.tipo === t.value)"
            class="!text-sm"
            :data-testid="`tipo-${t.value}`"
            @click="setTipo(t.value)"
          >
            <span :class="t.icon" class="size-4" aria-hidden="true" />
            {{ t.label }}
          </button>
        </div>
      </fieldset>

      <section v-if="needsSource">
        <p class="mb-2 text-sm font-medium text-ink-gray-8">
          {{ draft.tipo === 'custom' ? 'Datos que recibe' : 'Datos' }}
        </p>
        <button
          v-if="!picking"
          type="button"
          class="press flex min-h-11 w-full items-center gap-3 rounded-6 border border-outline-gray-2 px-3 text-left"
          data-testid="fuente-pick"
          @click="startPicking"
        >
          <span
            class="lucide-database size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate text-base text-ink-gray-8">
            {{ sourceTitle || 'Elige de dónde salen los números' }}
          </span>
          <span
            class="lucide-chevron-right size-4 text-ink-gray-5"
            aria-hidden="true"
          />
        </button>
        <div v-else class="rounded-6 border border-outline-gray-2 p-2">
          <input
            ref="searchInput"
            v-model="search"
            type="search"
            class="min-h-11 w-full rounded-5 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 placeholder-ink-gray-5 focus:ring-0"
            placeholder="Buscar: ventas, cobranza, reparaciones…"
            aria-label="Buscar datos"
          />
          <p
            v-if="fuentesError"
            role="alert"
            class="mt-2 text-sm text-ink-red-7"
          >
            {{ fuentesError }}
          </p>
          <p v-else-if="loadingFuentes" class="mt-2 text-sm text-ink-gray-6">
            Cargando…
          </p>
          <p
            v-else-if="!shownFuentes.length"
            class="mt-2 text-sm text-ink-gray-6"
          >
            Nada con esas palabras. Prueba otra o pídeselo a Muelle.
          </p>
          <ul class="mt-1 max-h-72 overflow-y-auto">
            <li v-for="f in shownFuentes" :key="f.id">
              <button
                type="button"
                class="press flex min-h-11 w-full flex-col items-start rounded-5 px-2 py-1.5 text-left hover:bg-surface-gray-2"
                :data-testid="`fuente-${f.id}`"
                @click="pickSource(f)"
              >
                <span class="text-base text-ink-gray-9">{{ f.titulo }}</span>
                <span
                  v-if="f.descripcion"
                  class="line-clamp-2 text-sm text-ink-gray-6"
                  >{{ f.descripcion }}</span
                >
              </button>
            </li>
          </ul>
          <p
            v-if="!assistantOn && fuentesReason"
            class="mt-2 text-xs text-ink-gray-6"
          >
            {{ fuentesReason }}
          </p>
        </div>
      </section>

      <FormControl
        v-if="draft.tipo === 'nota'"
        v-model="draft.texto"
        type="textarea"
        label="Texto"
        :rows="5"
        placeholder="Meta del mes: 100 mil. **Negritas** y listas con guiones."
      />

      <section v-if="draft.tipo === 'grafica'">
        <p class="mb-2 text-sm font-medium text-ink-gray-8">Forma</p>
        <Segmented
          label="Forma de la gráfica"
          :options="KINDS"
          :model-value="draft.vista.kind || ''"
          @update:model-value="(value) => (draft.vista.kind = value)"
        />
      </section>

      <section v-if="draft.tipo !== 'custom'">
        <p class="mb-2 text-sm font-medium text-ink-gray-8">
          {{
            draft.tipo === 'grafica' ? 'Color de la serie' : 'Color del número'
          }}
        </p>
        <Swatches v-model="draft.vista.color" label="Color" />
      </section>
      <section>
        <p class="mb-2 text-sm font-medium text-ink-gray-8">Fondo</p>
        <Swatches v-model="draft.vista.fondo" label="Fondo" />
      </section>

      <section>
        <p class="mb-2 text-sm font-medium text-ink-gray-8">Tamaño</p>
        <Segmented
          label="Tamaño"
          :options="SIZES"
          :model-value="sizeOf(draft.layout)"
          @update:model-value="setSize"
        />
        <p class="mt-1 text-xs text-ink-gray-6">
          En la computadora también lo cambias arrastrando su esquina.
        </p>
      </section>

      <section v-if="draft.tipo === 'custom'" class="space-y-3">
        <p class="text-sm text-ink-gray-7">
          Corre en una caja cerrada: sin red y sin acceso a tu sesión. Recibe
          los datos con
          <code class="rounded-4 bg-surface-gray-2 px-1"
            >muelle.onData(function (datos) {…})</code
          >, donde
          <code class="rounded-4 bg-surface-gray-2 px-1">datos.datos</code> es
          lo que devuelve la fuente. Muelle puede escribirlo por ti.
        </p>
        <FormControl
          v-for="part in ['html', 'css', 'js']"
          :key="part"
          v-model="draft.codigo[part]"
          type="textarea"
          :label="part.toUpperCase()"
          :rows="part === 'js' ? 8 : 4"
          class="[&_textarea]:font-mono [&_textarea]:text-sm"
          spellcheck="false"
        />
      </section>

      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        {{ problem }}
      </p>
    </form>

    <template #footer>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          variant="solid"
          type="submit"
          form="widget-form"
          class="min-h-11 flex-1"
          :loading="saving"
          :disabled="!ready"
          :label="widget?.id ? 'Guardar cambios' : 'Agregar al tablero'"
          data-testid="widget-save"
        />
        <Button
          class="min-h-11"
          label="Pídeselo a Muelle"
          data-testid="widget-ask"
          @click="$emit('ask', draft)"
        >
          <template #prefix>
            <span class="lucide-sparkles size-4" aria-hidden="true" />
          </template>
        </Button>
        <template v-if="widget?.id">
          <Button
            class="min-h-11"
            label="Duplicar"
            data-testid="widget-duplicate"
            @click="$emit('duplicate')"
          />
          <Button
            v-if="!confirmRemove"
            class="min-h-11 min-w-11"
            aria-label="Quitar del tablero"
            title="Quitar del tablero"
            data-testid="widget-remove"
            @click="confirmRemove = true"
          >
            <span class="lucide-trash-2 size-4" aria-hidden="true" />
          </Button>
          <Button
            v-else
            theme="red"
            variant="subtle"
            class="min-h-11"
            label="Quitar"
            data-testid="widget-remove-confirm"
            @click="$emit('remove')"
          />
        </template>
      </div>
      <p v-if="!ready && draft" class="mt-2 text-xs text-ink-gray-6">
        {{ readyHint }}
      </p>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import { chipClass } from '@/components/ui/chipClass'
import Swatches from '@/components/tableros/Swatches.vue'
import { problemOf } from '@/composables/useCobranza'
import { matchTokens } from '@/vendor/muelle-shell/contracts/search'
import { KINDS, SIZES, TIPOS, sizeOf, tablerosApi } from '@/tableros/board'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The widget being edited; one without an id is a new one. */
  widget: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  problem: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'save', 'duplicate', 'remove', 'ask'])

const draft = ref(null)
const confirmRemove = ref(false)
const picking = ref(false)
const search = ref('')
const searchInput = ref(null)

function copy(widget) {
  const w = JSON.parse(JSON.stringify(widget || {}))
  w.tipo = w.tipo || 'grafica'
  w.titulo = w.titulo || ''
  w.vista = { kind: '', color: '', fondo: '', ...(w.vista || {}) }
  w.layout = w.layout || { w: 10, h: 8 }
  w.codigo = { html: '', css: '', js: '', ...(w.codigo || {}) }
  w.fuentes = w.fuentes || []
  w.texto = w.texto || ''
  return w
}

watch(
  () => [props.open, props.widget],
  ([open]) => {
    if (!open) return
    draft.value = copy(props.widget)
    confirmRemove.value = false
    picking.value = !props.widget?.id && needsSource.value && !currentSource()
    if (picking.value) loadFuentes()
  },
  { immediate: true },
)

const needsSource = computed(() => draft.value && draft.value.tipo !== 'nota')

function currentSource() {
  const d = draft.value
  if (!d) return null
  return d.tipo === 'custom' ? d.fuentes?.[0] || null : d.fuente || null
}

// --- sources ------------------------------------------------------------------
const fuentes = ref([])
const loadingFuentes = ref(false)
const fuentesError = ref('')
const fuentesReason = ref('')
const assistantOn = ref(true)
let loaded = false

async function loadFuentes() {
  if (loaded || loadingFuentes.value) return
  loadingFuentes.value = true
  fuentesError.value = ''
  try {
    const out = await tablerosApi('fuentes')
    fuentes.value = out.fuentes || []
    assistantOn.value = Boolean(out.assistant)
    fuentesReason.value = out.reason || ''
    loaded = true
  } catch (error) {
    fuentesError.value = problemOf(error).detail
  } finally {
    loadingFuentes.value = false
  }
}

const shownFuentes = computed(() => {
  const tipo = draft.value?.tipo
  return fuentes.value
    .filter((f) => tipo === 'custom' || !f.tipos || f.tipos.includes(tipo))
    .filter((f) => matchTokens(search.value, f.titulo, f.descripcion, f.app))
})

const sourceTitle = computed(() => {
  const id = currentSource()?.id
  if (!id) return ''
  return fuentes.value.find((f) => f.id === id)?.titulo || id
})

async function startPicking() {
  picking.value = true
  loadFuentes()
  await nextTick()
  searchInput.value?.focus()
}

function pickSource(f) {
  const fuente = { id: f.id, params: {} }
  if (draft.value.tipo === 'custom')
    draft.value.fuentes = [{ alias: 'datos', ...fuente }]
  else draft.value.fuente = fuente
  if (!draft.value.titulo) draft.value.titulo = f.titulo
  picking.value = false
  search.value = ''
}

function setTipo(value) {
  const d = draft.value
  if (value === 'custom' && d.fuente && !d.fuentes.length)
    d.fuentes = [{ alias: 'datos', ...d.fuente }]
  if (value !== 'custom' && value !== 'nota' && !d.fuente && d.fuentes[0]) {
    const { id, params } = d.fuentes[0]
    d.fuente = { id, params }
  }
  d.tipo = value
}

function setSize(value) {
  const size = SIZES.find((s) => s.value === value)
  if (size) draft.value.layout = { ...draft.value.layout, w: size.w, h: size.h }
}

const ready = computed(() => {
  const d = draft.value
  if (!d) return false
  if (d.tipo === 'nota') return Boolean(d.texto.trim())
  if (d.tipo === 'custom')
    return Boolean(d.codigo.html || d.codigo.css || d.codigo.js)
  return Boolean(d.fuente?.id)
})
const readyHint = computed(() => {
  const tipo = draft.value?.tipo
  if (tipo === 'nota') return 'Escribe el texto de la nota para guardarla.'
  if (tipo === 'custom')
    return 'Escribe su código, o pídele a Muelle que lo escriba.'
  return 'Elige sus datos para guardarlo.'
})

/** What the board stores: only the fields its type uses. */
function save() {
  if (!ready.value) return
  const d = draft.value
  const vista = Object.fromEntries(
    Object.entries(d.vista).filter(([, value]) => value),
  )
  if (d.tipo !== 'grafica') delete vista.kind
  const out = { tipo: d.tipo, titulo: d.titulo.trim(), vista, layout: d.layout }
  if (props.widget?.id) out.id = props.widget.id
  if (d.tipo === 'nota') out.texto = d.texto
  else if (d.tipo === 'custom') {
    out.codigo = d.codigo
    out.fuentes = d.fuentes
  } else out.fuente = d.fuente
  emit('save', out)
}
</script>
