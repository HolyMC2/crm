<template>
  <!-- A record's workflow buttons (Shell D12, Frappe Workflow): the state in
       words, «Aprobar» filled and the rest tonal, one confirm sheet, the new
       state in Spanish. Nothing shows when the record has no workflow. -->
  <section
    v-if="data && (data.acciones.length || data.motivo || data.estado)"
    class="space-y-2"
    aria-label="Aprobación"
    data-transiciones
  >
    <p v-if="data.estado" class="text-sm text-ink-gray-7">
      Estado: <span class="font-medium text-ink-gray-9">{{ data.estado }}</span>
    </p>
    <div v-if="acciones.length" class="flex flex-wrap gap-2">
      <button
        v-for="accion in acciones"
        :key="accion.accion"
        type="button"
        :class="accion.tono === 'filled' ? BTN.filled : BTN.tonal"
        :disabled="busy"
        :data-transicion="accion.accion"
        @click="pedir(accion)"
      >
        {{ accion.label }}
      </button>
    </div>
    <p v-else-if="data.motivo" class="text-sm text-ink-gray-6">
      {{ data.motivo }}
    </p>
    <ConfirmSheet
      :open="Boolean(elegida)"
      :copy="copia"
      :busy="busy"
      :error="error"
      @update:open="(value) => !value && cerrar()"
      @confirm="aplicar"
    />
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import ConfirmSheet from '@/components/documentos/ConfirmSheet.vue'
import { BTN } from '@/documentos/tools'
import {
  autoApi,
  copiaTransicion,
  errorText,
  ordenAcciones,
} from './automatizaciones'

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  /** The record's title for the confirm sentence («Cliente prueba»). */
  title: { type: String, default: '' },
})
const emit = defineEmits(['done'])

const data = ref(null)
const busy = ref(false)
const error = ref('')
const elegida = ref(null)

const acciones = computed(() => ordenAcciones(data.value?.acciones || []))
const copia = computed(() => copiaTransicion(elegida.value, props.title))

let seq = 0
async function load() {
  const mine = ++seq
  try {
    const result = await autoApi('transiciones', {
      doctype: props.doctype,
      name: props.name,
    })
    if (mine === seq) data.value = result
  } catch {
    // No workflow bar is better than a broken record: the record shows its own errors.
    if (mine === seq) data.value = null
  }
}

function pedir(accion) {
  error.value = ''
  elegida.value = accion
}

function cerrar() {
  if (busy.value) return
  elegida.value = null
  error.value = ''
}

async function aplicar() {
  const accion = elegida.value
  if (!accion) return
  busy.value = true
  error.value = ''
  try {
    const result = await autoApi('aplicar_transicion', {
      doctype: props.doctype,
      name: props.name,
      accion: accion.accion,
    })
    toast.success(result?.mensaje || 'Listo.')
    elegida.value = null
    emit('done', { accion: accion.accion, estado: result?.estado || null })
    await load()
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    busy.value = false
  }
}

watch(() => [props.doctype, props.name], load, { immediate: true })
defineExpose({ reload: load })
</script>
