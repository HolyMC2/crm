<template>
  <!-- «Nueva regla» (Shell D12, Frappe Assignment Rule): Documento → Quiénes
       → Cómo → Condición → Confirmar. The condition is a field and a value;
       the server writes the rule's expression from them. -->
  <BottomSheet
    v-model:open="open"
    title="Nueva regla de asignación"
    :subtitle="`Paso ${index + 1} de ${PASOS.length} · ${paso.title}`"
    :dismissible="!busy"
    flush
  >
    <div class="pb-2" :data-paso="paso.key">
      <template v-if="paso.key === 'documento'">
        <p class="px-4 pb-2 text-base text-ink-gray-8">
          ¿Qué documentos nuevos quieres repartir?
        </p>
        <div class="px-4 pb-1">
          <FormControl
            v-model="search"
            type="text"
            placeholder="Buscar otro tipo de documento"
            aria-label="Buscar otro tipo de documento"
            class="[&_input]:min-h-12"
          />
        </div>
        <ul role="radiogroup" aria-label="Documento">
          <li v-for="tipo in tipos" :key="tipo.doctype">
            <ListRow
              role="radio"
              :aria-checked="state.doctype === tipo.doctype ? 'true' : 'false'"
              :title="tipo.label"
              :selected="state.doctype === tipo.doctype"
              @click="elegirTipo(tipo)"
            >
              <template #leading>
                <RadioDot :on="state.doctype === tipo.doctype" />
              </template>
            </ListRow>
          </li>
        </ul>
      </template>

      <template v-else-if="paso.key === 'como' && opciones">
        <ul role="radiogroup" aria-label="Cómo se reparten">
          <li v-for="modo in modos" :key="modo.value">
            <ListRow
              role="radio"
              :aria-checked="state.modo === modo.value ? 'true' : 'false'"
              :title="modo.label"
              :subtitle="modo.hint"
              :selected="state.modo === modo.value"
              @click="state.modo = modo.value"
            >
              <template #leading>
                <RadioDot :on="state.modo === modo.value" />
              </template>
            </ListRow>
          </li>
        </ul>
        <div v-if="state.modo === 'Based on Field'" class="px-4 pt-3">
          <label class="block space-y-1">
            <span class="block text-sm font-medium text-ink-gray-7"
              >¿Qué campo dice la persona?</span
            >
            <select
              v-model="state.campo"
              class="min-h-12 w-full rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
            >
              <option value="" disabled>Elige…</option>
              <option
                v-for="campo in opciones.personas"
                :key="campo.fieldname"
                :value="campo.fieldname"
              >
                {{ campo.label }}
              </option>
            </select>
          </label>
        </div>
      </template>

      <template v-else-if="paso.key === 'quienes'">
        <ul v-if="state.usuarios.length">
          <li v-for="person in state.usuarios" :key="person.user">
            <ListRow :avatar="person.name" :title="person.name">
              <template #trailing>
                <Button
                  variant="ghost"
                  class="min-h-11"
                  label="Quitar"
                  :aria-label="`Quitar a ${person.name}`"
                  @click="quitar(person)"
                />
              </template>
            </ListRow>
          </li>
        </ul>
        <div class="px-4 pt-1">
          <FormControl
            v-model="personSearch"
            type="text"
            placeholder="Buscar a alguien del equipo"
            aria-label="Buscar a alguien del equipo"
            class="[&_input]:min-h-12"
          />
        </div>
        <ul v-if="matches.length" class="pt-1">
          <li v-for="person in matches" :key="person.user">
            <ListRow
              :avatar="person.name"
              :title="person.name"
              subtitle="Agregar"
              @click="agregar(person)"
            />
          </li>
        </ul>
      </template>

      <template v-else-if="paso.key === 'condicion' && opciones">
        <ul role="radiogroup" aria-label="Condición">
          <li>
            <ListRow
              role="radio"
              :aria-checked="!state.condicion ? 'true' : 'false'"
              title="Todos"
              subtitle="Cada documento nuevo"
              :selected="!state.condicion"
              @click="state.condicion = null"
            >
              <template #leading><RadioDot :on="!state.condicion" /></template>
            </ListRow>
          </li>
          <li>
            <ListRow
              role="radio"
              :aria-checked="state.condicion ? 'true' : 'false'"
              title="Solo si…"
              subtitle="Un campo tiene un valor"
              :selected="Boolean(state.condicion)"
              @click="
                state.condicion = state.condicion || { campo: null, valor: '' }
              "
            >
              <template #leading>
                <RadioDot :on="Boolean(state.condicion)" />
              </template>
            </ListRow>
          </li>
        </ul>
        <div v-if="state.condicion" class="space-y-3 px-4 pt-3">
          <label class="block space-y-1">
            <span class="block text-sm font-medium text-ink-gray-7">Campo</span>
            <select
              :value="state.condicion.campo?.fieldname || ''"
              class="min-h-12 w-full rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
              @change="elegirCampo($event.target.value)"
            >
              <option value="" disabled>Elige…</option>
              <option
                v-for="campo in opciones.condiciones"
                :key="campo.fieldname"
                :value="campo.fieldname"
              >
                {{ campo.label }}
              </option>
            </select>
          </label>
          <template v-if="state.condicion.campo">
            <label
              v-if="state.condicion.campo.options?.length"
              class="block space-y-1"
            >
              <span class="block text-sm font-medium text-ink-gray-7">Es</span>
              <select
                v-model="state.condicion.valor"
                class="min-h-12 w-full rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
              >
                <option value="" disabled>Elige…</option>
                <option
                  v-for="option in state.condicion.campo.options"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label
              v-else-if="state.condicion.campo.fieldtype === 'Check'"
              class="block space-y-1"
            >
              <span class="block text-sm font-medium text-ink-gray-7">Es</span>
              <select
                v-model="state.condicion.valor"
                class="min-h-12 w-full rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
              >
                <option value="" disabled>Elige…</option>
                <option value="1">Sí</option>
                <option value="0">No</option>
              </select>
            </label>
            <label v-else class="block space-y-1">
              <span class="block text-sm font-medium text-ink-gray-7">Es</span>
              <input
                v-model.trim="state.condicion.valor"
                type="text"
                maxlength="140"
                class="min-h-12 w-full rounded-lg border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
              />
            </label>
          </template>
        </div>
      </template>

      <template v-else-if="paso.key === 'confirmar' && opciones">
        <p
          class="mx-4 rounded-lg bg-surface-gray-1 p-3 text-base text-ink-gray-9"
          data-regla-resumen
        >
          {{ frase }}.
        </p>
        <p class="px-4 pt-2 text-sm text-ink-gray-6">
          Aplica a los documentos que se creen o cambien desde ahora, todos los
          días.
        </p>
      </template>

      <p v-if="error" role="alert" class="px-4 pt-3 text-base text-ink-red-7">
        {{ error }}
      </p>
    </div>

    <template #actions>
      <button
        type="button"
        :class="BTN.filled"
        :disabled="busy || Boolean(pendiente)"
        data-regla-siguiente
        @click="siguiente"
      >
        <span
          v-if="busy"
          class="lucide-loader-circle size-5 animate-spin"
          aria-hidden="true"
        />
        {{ paso.key === 'confirmar' ? 'Crear regla' : 'Siguiente' }}
      </button>
      <p
        v-if="pendiente && touched"
        class="text-center text-sm text-ink-gray-6"
      >
        {{ pendiente }}
      </p>
      <button
        v-if="index > 0"
        type="button"
        :class="BTN.text"
        :disabled="busy"
        @click="index--"
      >
        Atrás
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { Button, FormControl, toast } from 'frappe-ui'
import { BottomSheet, ListRow } from '@/components/ui'
import RadioDot from '@/components/documentos/RadioDot.vue'
import { BTN } from '@/documentos/tools'
import { docApi } from '@/documentos/api'
import {
  MODOS,
  autoApi,
  errorText,
  fraseCondicion,
  fraseRegla,
} from './automatizaciones'

const open = defineModel('open', { type: Boolean, default: false })
const emit = defineEmits(['created'])

const PASOS = [
  { key: 'documento', title: 'Documento' },
  { key: 'quienes', title: 'Quiénes' },
  { key: 'como', title: 'Cómo' },
  { key: 'condicion', title: 'Condición' },
  { key: 'confirmar', title: 'Confirmar' },
]

const index = ref(0)
const paso = computed(() => PASOS[index.value])
const busy = ref(false)
const error = ref('')
const touched = ref(false)
const search = ref('')
const tipos = ref([])
const opciones = ref(null)
const personSearch = ref('')
const found = ref([])

const state = reactive({
  doctype: '',
  usuarios: [],
  modo: 'Round Robin',
  campo: '',
  condicion: null,
})

// «Según un campo» only when the document names a person somewhere.
const modos = computed(() =>
  MODOS.filter(
    (m) => m.value !== 'Based on Field' || opciones.value?.personas?.length,
  ),
)
const matches = computed(() =>
  found.value.filter((p) => !state.usuarios.some((q) => q.user === p.user)),
)
const campoLabel = computed(
  () =>
    opciones.value?.personas?.find((p) => p.fieldname === state.campo)?.label ||
    '',
)
const frase = computed(() =>
  fraseRegla({
    plural: opciones.value?.plural,
    modo: state.modo,
    usuarios: state.usuarios.map((p) => p.name),
    condicion: state.condicion?.campo
      ? fraseCondicion(state.condicion.campo, state.condicion.valor)
      : '',
    campo: campoLabel.value,
  }),
)
const pendiente = computed(() => {
  switch (paso.value.key) {
    case 'documento':
      return state.doctype && opciones.value ? '' : 'Elige un documento.'
    case 'quienes':
      return state.usuarios.length ? '' : 'Elige al menos a una persona.'
    case 'como':
      return state.modo === 'Based on Field' && !state.campo
        ? 'Elige el campo.'
        : ''
    case 'condicion':
      if (!state.condicion) return ''
      if (!state.condicion.campo) return 'Elige el campo de la condición.'
      return state.condicion.valor === '' ? 'Escribe el valor.' : ''
    default:
      return ''
  }
})

async function loadTipos() {
  try {
    tipos.value =
      (await autoApi('tipos', { search: search.value.trim() })) || []
  } catch (failure) {
    error.value = errorText(failure)
  }
}
watchDebounced(search, loadTipos, { debounce: 250 })

watchDebounced(
  personSearch,
  async (text) => {
    if (!text || text.trim().length < 2) {
      found.value = []
      return
    }
    try {
      found.value = (await docApi('people', { search: text.trim() })) || []
    } catch (failure) {
      error.value = errorText(failure, 'No se pudo buscar.')
    }
  },
  { debounce: 250 },
)

async function elegirTipo(tipo) {
  if (state.doctype === tipo.doctype && opciones.value) return
  state.doctype = tipo.doctype
  state.campo = ''
  state.condicion = null
  opciones.value = null
  error.value = ''
  try {
    opciones.value = await autoApi('opciones_regla', { doctype: tipo.doctype })
  } catch (failure) {
    error.value = errorText(failure)
    state.doctype = ''
  }
}

function elegirCampo(fieldname) {
  const campo = opciones.value.condiciones.find(
    (c) => c.fieldname === fieldname,
  )
  state.condicion = { campo, valor: '' }
}

function agregar(person) {
  state.usuarios = [...state.usuarios, person]
  personSearch.value = ''
  found.value = []
}

function quitar(person) {
  state.usuarios = state.usuarios.filter((p) => p.user !== person.user)
}

function siguiente() {
  touched.value = true
  if (pendiente.value) return
  if (paso.value.key === 'confirmar') return crear()
  index.value++
  touched.value = false
}

async function crear() {
  busy.value = true
  error.value = ''
  try {
    const row = await autoApi('crear_regla', {
      datos: {
        doctype: state.doctype,
        modo: state.modo,
        usuarios: state.usuarios.map((p) => p.user),
        campo: state.modo === 'Based on Field' ? state.campo : undefined,
        condicion: state.condicion?.campo
          ? {
              campo: state.condicion.campo.fieldname,
              valor: state.condicion.valor,
            }
          : null,
      },
    })
    toast.success('Listo: la regla quedó encendida.')
    emit('created', row)
    open.value = false
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    busy.value = false
  }
}

watch(index, () => {
  error.value = ''
})
watch(
  open,
  (value) => {
    if (value && !tipos.value.length) loadTipos()
  },
  { immediate: true },
)
</script>
