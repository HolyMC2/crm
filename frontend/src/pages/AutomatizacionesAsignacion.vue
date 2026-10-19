<template>
  <div class="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
    <!-- Disparadores › Reglas de asignación (Shell D12, Frappe Assignment
         Rule): each rule as a sentence with its switch; a new one from pickers. -->
    <AppBar
      v-if="isPhone"
      back="/disparadores"
      back-label="Disparadores"
      title="Reglas de asignación"
      :loading="loading"
    />
    <div class="mx-auto w-full max-w-3xl space-y-4 px-4 pb-24 pt-3">
      <header v-if="!isPhone" class="flex flex-wrap items-center gap-3">
        <RouterLink
          to="/disparadores"
          class="inline-flex min-h-11 items-center rounded-lg px-2 text-base text-ink-gray-7 hover:bg-surface-gray-2"
          >Disparadores</RouterLink
        >
        <h1 class="flex-1 text-xl font-semibold text-ink-gray-9">
          Reglas de asignación
        </h1>
        <button
          v-if="manager && rows.length"
          type="button"
          :class="BTN.filled"
          @click="creating = true"
        >
          Nueva regla
        </button>
      </header>
      <p class="text-base text-ink-gray-7">
        Cada documento nuevo le llega a alguien de tu equipo sin que nadie lo
        reparta a mano.
      </p>

      <EmptyState
        v-if="loading && !rows.length"
        state="loading"
        title="Cargando reglas…"
      />
      <EmptyState
        v-else-if="error && !rows.length"
        state="error"
        title="No se pudieron cargar las reglas"
        :message="error"
        action="Reintentar"
        @action="load"
      />
      <EmptyState
        v-else-if="manager === false"
        title="Solo el dueño ve las reglas"
        :message="motivo"
      />
      <EmptyState
        v-else-if="manager && !rows.length"
        title="Todavía no repartes documentos solo"
        message="Una regla le pasa cada garantía, factura o trato nuevo a tu equipo: por turnos o al que tenga menos pendientes."
        action="Nueva regla"
        @action="creating = true"
      />

      <ul v-if="rows.length" class="grid gap-3">
        <li v-for="row in rows" :key="row.name">
          <article
            class="flex items-start gap-3 rounded-lg border border-outline-gray-2 bg-surface-white p-4"
            :data-regla="row.name"
          >
            <div class="min-w-0 flex-1 space-y-1">
              <p class="break-words text-base text-ink-gray-9">
                {{ row.frase }}.
              </p>
              <p class="text-sm text-ink-gray-6">
                {{ row.documento }}{{ row.activo ? '' : ' · apagada' }}
              </p>
            </div>
            <Interruptor
              :on="row.activo"
              :label="row.frase"
              :disabled="busy === row.name"
              @toggle="(value) => toggle(row, value)"
            />
          </article>
        </li>
      </ul>
    </div>

    <Fab
      v-if="isPhone && manager && rows.length"
      label="Nueva regla"
      @click="creating = true"
    />
    <NuevaReglaSheet
      v-if="creating"
      v-model:open="creating"
      @created="created"
    />
  </div>
</template>
<script setup>
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'frappe-ui'
import { AppBar, EmptyState, Fab } from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { BTN } from '@/documentos/tools'
import Interruptor from '@/components/automatizaciones/Interruptor.vue'
import {
  autoApi,
  errorText,
} from '@/components/automatizaciones/automatizaciones'

const NuevaReglaSheet = defineAsyncComponent(
  () => import('@/components/automatizaciones/NuevaReglaSheet.vue'),
)

const rows = ref([])
const manager = ref(null)
const motivo = ref('')
const loading = ref(false)
const error = ref('')
const busy = ref('')
const creating = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await autoApi('reglas')
    manager.value = Boolean(data?.manager)
    motivo.value = data?.motivo || ''
    rows.value = data?.reglas || []
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    loading.value = false
  }
}

async function toggle(row, value) {
  const index = rows.value.findIndex((r) => r.name === row.name)
  const before = rows.value[index]
  rows.value[index] = { ...before, activo: value }
  busy.value = row.name
  try {
    rows.value[index] = await autoApi('activar_regla', {
      name: row.name,
      activo: value ? 1 : 0,
    })
    toast.success(value ? 'Regla encendida.' : 'Regla apagada.')
  } catch (failure) {
    rows.value[index] = before
    toast.error(errorText(failure))
  } finally {
    busy.value = ''
  }
}

function created(row) {
  if (row) rows.value = [row, ...rows.value]
}

onMounted(load)
</script>
