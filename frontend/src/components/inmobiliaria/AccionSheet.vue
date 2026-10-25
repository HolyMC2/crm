<template>
  <!-- One action of a record (INMO-SH): the fields the app asks for, its
       warning, one filled button. Bounded task → bottom sheet (SPEC §1.2). -->
  <BottomSheet
    :open="open"
    :title="accion?.etiqueta || ''"
    :subtitle="subtitle"
    @update:open="(v) => !v && close()"
  >
    <form
      v-if="accion"
      class="flex flex-col gap-4 pb-2"
      data-testid="inmo-accion-form"
      @submit.prevent="submit"
    >
      <p
        v-if="accion.confirmar"
        class="rounded-lg bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-8"
      >
        {{ accion.confirmar }}
      </p>
      <div
        v-for="campo in accion.campos"
        :key="campo.fieldname"
        class="flex flex-col gap-1"
      >
        <label
          :for="`inmo-${campo.fieldname}`"
          class="text-sm font-medium text-ink-gray-7"
          >{{ campo.label
          }}<span v-if="campo.reqd" class="text-ink-red-7" aria-hidden="true">
            *</span
          ></label
        >
        <select
          v-if="campo.fieldtype === 'Select'"
          :id="`inmo-${campo.fieldname}`"
          v-model="values[campo.fieldname]"
          :required="campo.reqd"
          :class="INPUT"
        >
          <option v-if="!campo.reqd" value="">Sin elegir</option>
          <option v-for="o in campo.options" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </select>
        <textarea
          v-else-if="campo.fieldtype === 'Small Text'"
          :id="`inmo-${campo.fieldname}`"
          v-model="values[campo.fieldname]"
          :required="campo.reqd"
          rows="3"
          :class="[INPUT, 'py-2']"
        />
        <CampoBusqueda
          v-else-if="campo.fieldtype === 'Link'"
          :id="`inmo-${campo.fieldname}`"
          v-model="values[campo.fieldname]"
          :tipo="campo.busqueda"
          :required="campo.reqd"
          :crear="campo.crear"
        />
        <div
          v-else-if="campo.fieldtype === 'Attach'"
          class="flex flex-col gap-2"
        >
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              :class="PILL"
              :data-testid="`inmo-tomar-${campo.fieldname}`"
              @click="takePhoto(campo)"
            >
              <span class="lucide-camera size-5" aria-hidden="true" />
              Tomar foto
            </button>
            <!-- The phone's own camera when the shell camera cannot open. -->
            <input
              :ref="(el) => (cameraInputs[campo.fieldname] = el)"
              type="file"
              accept="image/*"
              capture="environment"
              class="sr-only"
              tabindex="-1"
              aria-hidden="true"
              :data-testid="`inmo-camara-${campo.fieldname}`"
              @change="(e) => pick(campo, e)"
            />
            <label :class="PILL">
              <span class="lucide-paperclip size-5" aria-hidden="true" />
              Elegir archivo
              <input
                :id="`inmo-${campo.fieldname}`"
                type="file"
                accept="image/*,application/pdf"
                class="sr-only"
                @change="(e) => pick(campo, e)"
              />
            </label>
          </div>
          <p
            v-if="uploading[campo.fieldname]"
            class="text-sm text-ink-gray-6"
            role="status"
          >
            Subiendo…
          </p>
          <p
            v-else-if="values[campo.fieldname]"
            class="flex items-center gap-2 break-all text-sm text-ink-gray-8"
          >
            <span
              class="lucide-check size-4 text-ink-green-8"
              aria-hidden="true"
            />
            {{ fileNames[campo.fieldname] || 'Archivo listo' }}
          </p>
        </div>
        <input
          v-else
          :id="`inmo-${campo.fieldname}`"
          v-model="values[campo.fieldname]"
          :type="inputType(campo)"
          :inputmode="campo.fieldtype === 'Currency' ? 'decimal' : undefined"
          :step="campo.fieldtype === 'Currency' ? '0.01' : undefined"
          :required="campo.reqd"
          :class="INPUT"
        />
        <p v-if="campo.descripcion" class="text-sm text-ink-gray-6">
          {{ campo.descripcion }}
        </p>
      </div>
      <p
        v-if="error"
        class="rounded-lg bg-surface-red-1 px-3 py-2 text-base text-ink-red-7"
        role="alert"
      >
        {{ error }}
      </p>
      <Button
        type="submit"
        variant="solid"
        :theme="accion.tipo === 'danger' ? 'red' : 'gray'"
        size="lg"
        class="w-full"
        :loading="busy"
        :disabled="busyUpload"
        :label="accion.etiqueta"
        data-testid="inmo-accion-submit"
      />
    </form>
  </BottomSheet>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import CampoBusqueda from '@/components/inmobiliaria/CampoBusqueda.vue'
import {
  SIN_METODO,
  inmobiliariaApi,
  problemText,
  uploadFile,
} from '@/composables/useInmobiliaria'

const props = defineProps({
  open: { type: Boolean, default: false },
  accion: { type: Object, default: null },
  /** The record the action works on (uploads attach to it). */
  doctype: { type: String, default: '' },
  name: { type: String, default: '' },
  subtitle: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'done'])

const INPUT =
  'min-h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9 focus:border-outline-gray-4 focus:outline-none'
const PILL =
  'flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-surface-gray-2 px-3 text-base-medium text-ink-gray-8 focus-within:ring-2 focus-within:ring-outline-gray-4'

const values = reactive({})
const uploading = reactive({})
const fileNames = reactive({})
const busy = ref(false)
const error = ref('')
const busyUpload = computed(() => Object.values(uploading).some(Boolean))

watch(
  () => [props.open, props.accion],
  () => {
    if (!props.open || !props.accion) return
    for (const key of Object.keys(values)) delete values[key]
    for (const key of Object.keys(fileNames)) delete fileNames[key]
    for (const campo of props.accion.campos || [])
      values[campo.fieldname] = campo.default ?? ''
    error.value = ''
  },
  { immediate: true },
)

function inputType(campo) {
  if (campo.fieldtype === 'Date') return 'date'
  if (['Currency', 'Float', 'Int'].includes(campo.fieldtype)) return 'number'
  return 'text'
}

// «Tomar foto» opens the shell camera (Shell D7, DD14: page crop, several pages
// as one PDF); this sheet keeps its own upload. Without it, the phone's camera.
const cameraInputs = {}
async function takePhoto(campo) {
  error.value = ''
  try {
    const { openCamera } = await import('@/components/captura/cameraDoor')
    await openCamera({
      title: props.accion?.etiqueta || 'Tomar foto',
      onFiles: async ([file]) => (file ? upload(campo, file) : null),
    })
  } catch {
    cameraInputs[campo.fieldname]?.click()
  }
}

async function pick(campo, event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (file) await upload(campo, file)
}

async function upload(campo, file) {
  uploading[campo.fieldname] = true
  error.value = ''
  try {
    values[campo.fieldname] = await uploadFile(file, props.doctype, props.name)
    fileNames[campo.fieldname] = file.name
  } catch (e) {
    error.value = problemText(e)
  } finally {
    uploading[campo.fieldname] = false
  }
}

function close() {
  if (!busy.value) emit('update:open', false)
}

async function submit() {
  const accion = props.accion
  if (!accion || busy.value) return
  // An outdated screen may hold an action without its method: say what to do
  // instead of failing with a programming error.
  if (!accion.metodo) {
    error.value = SIN_METODO
    return
  }
  const missing = (accion.campos || []).find(
    (c) => c.reqd && (values[c.fieldname] ?? '') === '',
  )
  if (missing) {
    error.value = `Falta «${missing.label}».`
    return
  }
  busy.value = true
  error.value = ''
  try {
    const args = { ...(accion.args || {}) }
    for (const [key, value] of Object.entries(values))
      if (value !== '' && value !== null) args[key] = value
    const answer = await inmobiliariaApi(accion.metodo, args)
    emit('done', { accion, answer })
    emit('update:open', false)
  } catch (e) {
    error.value = problemText(e)
  } finally {
    busy.value = false
  }
}
</script>
