<template>
  <!-- «Repetir cada…» (Shell D12, Frappe Auto Repeat): how often a copy of
       this record is made, from when, until when; the current repetition with
       «Quitar repetición»; the owner can let a kind of document repeat. -->
  <BottomSheet
    v-model:open="open"
    title="Repetir cada…"
    :subtitle="info?.titulo || title"
    :dismissible="!busy"
  >
    <div class="space-y-4 pb-2" data-repetir>
      <p v-if="loading && !info" class="text-base text-ink-gray-6">Cargando…</p>
      <p v-else-if="loadError" role="alert" class="text-base text-ink-red-7">
        {{ loadError }}
      </p>

      <!-- Already repeating -->
      <template v-else-if="info?.actual">
        <div class="space-y-1 rounded-lg bg-surface-gray-1 p-3">
          <p class="text-base font-medium text-ink-gray-9">
            Se repite {{ (info.actual.frecuencia_texto || '').toLowerCase() }}
          </p>
          <p class="text-sm text-ink-gray-7">{{ linea }}</p>
          <p class="text-sm text-ink-gray-6">
            Cada copia se crea como borrador, para que la revises.
          </p>
        </div>
        <p v-if="confirming === 'quitar'" class="text-base text-ink-gray-8">
          Ya no se crearán más copias. Las que ya existen se quedan.
        </p>
      </template>

      <!-- Not allowed (yet) -->
      <template v-else-if="info && !info.permitido">
        <p class="text-base text-ink-gray-8" data-repetir-motivo>
          {{ info.motivo }}
        </p>
        <p
          v-if="info.puede_permitir && confirming === 'permitir'"
          class="text-base text-ink-gray-8"
        >
          Después podrás repetir cualquiera de {{ info.plural }} desde su menú
          ⋯. Tú decides cuáles.
        </p>
      </template>

      <!-- New repetition -->
      <template v-else-if="info">
        <fieldset class="space-y-1">
          <legend class="pb-1 text-sm font-medium text-ink-gray-7">
            ¿Cada cuánto?
          </legend>
          <div role="radiogroup" class="flex flex-wrap gap-x-2">
            <button
              v-for="option in FRECUENCIAS"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="freq === option.value ? 'true' : 'false'"
              class="flex min-h-11 items-center"
              @click="freq = option.value"
            >
              <span :class="chipClass(freq === option.value)">
                <span
                  v-if="freq === option.value"
                  class="lucide-check size-4 flex-none"
                  aria-hidden="true"
                />
                {{ option.label }}
              </span>
            </button>
          </div>
        </fieldset>

        <FechaInput v-model="inicio" label="Empieza" :min="today" />

        <fieldset class="space-y-1">
          <legend class="pb-1 text-sm font-medium text-ink-gray-7">
            Termina
          </legend>
          <div role="radiogroup" class="flex flex-wrap gap-x-2">
            <button
              v-for="option in ENDS"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="termina === option.value ? 'true' : 'false'"
              class="flex min-h-11 items-center"
              @click="termina = option.value"
            >
              <span :class="chipClass(termina === option.value)">
                {{ option.label }}
              </span>
            </button>
          </div>
          <FechaInput
            v-if="termina === 'fecha'"
            v-model="fin"
            label="Último día"
            :min="inicio || today"
          />
        </fieldset>

        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-base text-ink-gray-9">
              Avisarme por correo al crear
            </p>
            <p class="text-sm text-ink-gray-6">
              Te llega a ti con la copia nueva; al cliente no se le escribe.
            </p>
          </div>
          <Interruptor
            :on="notificar"
            label="Avisarme por correo al crear"
            @toggle="(value) => (notificar = value)"
          />
        </div>

        <p
          v-if="resumen"
          class="rounded-lg bg-surface-gray-1 p-3 text-base text-ink-gray-9"
          data-repetir-resumen
        >
          {{ resumen }}
          <span class="block pt-1 text-sm text-ink-gray-6">
            Cada copia se crea como borrador, para que la revises.
          </span>
        </p>
      </template>

      <p v-if="error" role="alert" class="text-base text-ink-red-7">
        {{ error }}
      </p>
    </div>

    <template #actions>
      <template v-if="info?.actual">
        <button
          v-if="info.puede_quitar"
          type="button"
          :class="confirming === 'quitar' ? BTN.danger : BTN.tonal"
          :disabled="busy"
          data-repetir-quitar
          @click="quitar"
        >
          {{
            confirming === 'quitar'
              ? 'Sí, quitar repetición'
              : 'Quitar repetición'
          }}
        </button>
        <RouterLink
          v-if="openTo"
          :to="openTo"
          :class="BTN.text"
          @click="open = false"
          >Abrir {{ info.articulo }}</RouterLink
        >
      </template>
      <template v-else-if="info && !info.permitido">
        <button
          v-if="info.puede_permitir"
          type="button"
          :class="BTN.filled"
          :disabled="busy"
          data-repetir-permitir
          @click="permitir"
        >
          {{
            confirming === 'permitir'
              ? 'Sí, permitir'
              : 'Permitir que se repitan'
          }}
        </button>
        <button type="button" :class="BTN.text" @click="open = false">
          Cerrar
        </button>
      </template>
      <template v-else-if="info">
        <button
          type="button"
          :class="BTN.filled"
          :disabled="busy || Boolean(invalid)"
          data-repetir-confirmar
          @click="repetir"
        >
          <span
            v-if="busy"
            class="lucide-loader-circle size-5 animate-spin"
            aria-hidden="true"
          />
          Repetir {{ frecuencia(freq)?.every || '' }}
        </button>
        <p v-if="invalid" class="text-center text-sm text-ink-gray-6">
          {{ invalid }}
        </p>
      </template>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { documentRoute } from '@/documentos/registry'
import FechaInput from './FechaInput.vue'
import Interruptor from './Interruptor.vue'
import {
  FRECUENCIAS,
  autoApi,
  chipClass,
  demostrativo,
  errorText,
  fechasInvalidas,
  frecuencia,
  hoyISO,
  lineaRepeticion,
  resumenRepeticion,
} from './automatizaciones'

const open = defineModel('open', { type: Boolean, default: false })
const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  title: { type: String, default: '' },
  /** Show «Abrir …» (from the Repeticiones list; not on the record itself). */
  openRecord: { type: Boolean, default: false },
})
const emit = defineEmits(['changed'])

const ENDS = [
  { value: 'nunca', label: 'Nunca' },
  { value: 'fecha', label: 'En una fecha' },
]

const info = ref(null)
const loading = ref(false)
const loadError = ref('')
const error = ref('')
const busy = ref(false)
const confirming = ref('')
const freq = ref('Monthly')
const today = hoyISO()
const inicio = ref(today)
const termina = ref('nunca')
const fin = ref('')
const notificar = ref(false)

const linea = computed(() => lineaRepeticion(info.value?.actual))
const finValue = computed(() => (termina.value === 'fecha' ? fin.value : null))
const invalid = computed(() => {
  if (!freq.value) return 'Elige cada cuánto.'
  if (termina.value === 'fecha' && !fin.value) return 'Elige el último día.'
  return fechasInvalidas({ inicio: inicio.value, fin: finValue.value })
})
const resumen = computed(() =>
  invalid.value
    ? ''
    : resumenRepeticion({
        demostrativo: demostrativo(info.value?.articulo),
        frecuencia: freq.value,
        inicio: inicio.value,
        fin: finValue.value,
      }),
)
const openTo = computed(() =>
  props.openRecord ? documentRoute(props.doctype, props.name) : null,
)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    info.value = await autoApi('repeticion', {
      doctype: props.doctype,
      name: props.name,
    })
  } catch (failure) {
    loadError.value = errorText(failure)
  } finally {
    loading.value = false
  }
}

watch(
  () => [open.value, props.doctype, props.name],
  () => {
    if (!open.value) return
    error.value = ''
    confirming.value = ''
    freq.value = 'Monthly'
    inicio.value = today
    termina.value = 'nunca'
    fin.value = ''
    notificar.value = false
    load()
  },
  { immediate: true },
)

async function run(method, args, done) {
  busy.value = true
  error.value = ''
  try {
    const result = await autoApi(method, args)
    await done(result)
    emit('changed')
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    busy.value = false
  }
}

function repetir() {
  if (invalid.value) return
  run(
    'repetir',
    {
      doctype: props.doctype,
      name: props.name,
      frecuencia: freq.value,
      inicio: inicio.value,
      fin: finValue.value,
      notificar: notificar.value ? 1 : 0,
    },
    async () => {
      toast.success(`Listo: se repite ${frecuencia(freq.value)?.every}.`)
      // Stay open on the repetition just made («Se repite cada mes · …»).
      await load()
    },
  )
}

function quitar() {
  if (confirming.value !== 'quitar') {
    confirming.value = 'quitar'
    return
  }
  run('quitar_repeticion', { name: info.value.actual.name }, async (result) => {
    toast.success(result?.mensaje || 'Ya no se repite.')
    confirming.value = ''
    await load()
  })
}

function permitir() {
  if (confirming.value !== 'permitir') {
    confirming.value = 'permitir'
    return
  }
  run('permitir_repeticion', { doctype: props.doctype }, async (result) => {
    toast.success(result?.mensaje || 'Listo.')
    confirming.value = ''
    await load()
  })
}
</script>
