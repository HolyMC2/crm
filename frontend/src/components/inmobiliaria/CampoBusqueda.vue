<template>
  <!-- A client, prospect or supplier picker by name (inmobiliaria.api.shell.opciones):
       type a few letters, tap the person; never an ID to copy. -->
  <div class="flex flex-col gap-2">
    <div
      v-if="chosen"
      class="flex min-h-11 items-center gap-2 rounded-lg border border-outline-gray-2 px-3"
    >
      <span class="min-w-0 flex-1">
        <span class="block break-words text-base text-ink-gray-9">{{
          chosen.label
        }}</span>
        <span v-if="chosen.description" class="block text-sm text-ink-gray-6">{{
          chosen.description
        }}</span>
      </span>
      <button
        type="button"
        class="flex size-11 items-center justify-center rounded-full text-ink-gray-6"
        aria-label="Quitar"
        @click="clear"
      >
        <span class="lucide-x size-5" aria-hidden="true" />
      </button>
    </div>
    <template v-else>
      <input
        :id="id"
        v-model="text"
        type="search"
        autocomplete="off"
        :required="required"
        :placeholder="PLACEHOLDER[tipo] || 'Buscar por nombre'"
        class="min-h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9 focus:border-outline-gray-4 focus:outline-none"
        :data-testid="`inmo-buscar-${tipo}`"
      />
      <ul
        v-if="options.length"
        class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-1"
        role="listbox"
      >
        <li v-for="o in options" :key="o.value">
          <button
            type="button"
            role="option"
            class="flex min-h-12 w-full flex-col justify-center px-3 py-2 text-left"
            @click="choose(o)"
          >
            <span class="break-words text-base text-ink-gray-9">{{
              o.label
            }}</span>
            <span v-if="o.description" class="text-sm text-ink-gray-6">{{
              o.description
            }}</span>
          </button>
        </li>
      </ul>
      <p
        v-else-if="text.trim().length >= 2 && !loading"
        class="text-sm text-ink-gray-6"
      >
        Nadie con ese nombre.
      </p>
      <button
        v-if="canAdd"
        type="button"
        class="inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-8"
        :disabled="adding"
        data-testid="inmo-buscar-agregar"
        @click="add"
      >
        <span class="lucide-plus size-5" aria-hidden="true" />
        Agregar «{{ text.trim() }}» como proveedor
      </button>
      <p v-if="addProblem" class="text-sm text-ink-red-7" role="alert">
        {{ addProblem }}
      </p>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { inmobiliariaApi, problemText } from '@/composables/useInmobiliaria'

const props = defineProps({
  modelValue: { type: String, default: '' },
  tipo: { type: String, required: true },
  id: { type: String, default: '' },
  required: { type: Boolean, default: false },
  /** The app says this worker may add a missing supplier (Frappe permission). */
  crear: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const PLACEHOLDER = {
  cliente: 'Nombre del cliente',
  prospecto: 'Nombre o teléfono del prospecto',
  proveedor: 'Nombre del proveedor',
}
const text = ref('')
const options = ref([])
const chosen = ref(null)
const loading = ref(false)
let timer = null
let seq = 0

watch(text, (value) => {
  clearTimeout(timer)
  const q = value.trim()
  if (q.length < 2) {
    options.value = []
    return
  }
  timer = setTimeout(async () => {
    const mine = ++seq
    loading.value = true
    try {
      const rows = await inmobiliariaApi('opciones', { tipo: props.tipo, q })
      if (mine === seq) options.value = rows || []
    } catch {
      if (mine === seq) options.value = []
    } finally {
      if (mine === seq) loading.value = false
    }
  }, 250)
})

watch(
  () => props.modelValue,
  (value) => {
    if (!value) chosen.value = null
  },
)

function choose(option) {
  chosen.value = option
  options.value = []
  text.value = ''
  emit('update:modelValue', option.value)
}
const adding = ref(false)
const addProblem = ref('')
const canAdd = computed(
  () =>
    props.crear &&
    props.tipo === 'proveedor' &&
    text.value.trim().length >= 2 &&
    !loading.value &&
    !options.value.length,
)
async function add() {
  adding.value = true
  addProblem.value = ''
  try {
    choose(
      await inmobiliariaApi('crear_proveedor', { nombre: text.value.trim() }),
    )
  } catch (e) {
    addProblem.value = problemText(e)
  } finally {
    adding.value = false
  }
}
function clear() {
  chosen.value = null
  emit('update:modelValue', '')
}
</script>
