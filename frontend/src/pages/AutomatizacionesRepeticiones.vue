<template>
  <div class="flex h-full min-w-0 flex-1 flex-col overflow-y-auto">
    <!-- Disparadores › Repeticiones (Shell D12, Frappe Auto Repeat): what is
         made again by itself, titled by its customer or concept (never the
         ID), how often as a chip, and the next date. A row opens its
         «Repetir cada…» sheet (change it, stop it, open the document). -->
    <AppBar
      v-if="isPhone"
      back="/disparadores"
      back-label="Disparadores"
      title="Repeticiones"
      :loading="loading"
    />
    <div class="mx-auto w-full max-w-3xl space-y-3 pb-24 pt-3">
      <header v-if="!isPhone" class="flex flex-wrap items-center gap-3 px-4">
        <RouterLink
          to="/disparadores"
          class="inline-flex min-h-11 items-center rounded-lg px-2 text-base text-ink-gray-7 hover:bg-surface-gray-2"
          >Disparadores</RouterLink
        >
        <h1 class="flex-1 text-xl font-semibold text-ink-gray-9">
          Repeticiones
        </h1>
      </header>
      <p class="px-4 text-base text-ink-gray-7">
        Documentos que se copian solos cada cierto tiempo, como borrador para
        que los revises.
      </p>

      <EmptyState
        v-if="loading && !rows.length"
        state="loading"
        title="Cargando repeticiones…"
      />
      <EmptyState
        v-else-if="error && !rows.length"
        state="error"
        title="No se pudieron cargar las repeticiones"
        :message="error"
        action="Reintentar"
        @action="load"
      />
      <EmptyState
        v-else-if="denied"
        title="No ves las repeticiones"
        :message="motivo"
      />
      <EmptyState
        v-else-if="!loading && !rows.length"
        title="Nada se repite todavía"
        message="Abre una factura o un pedido y elige «Repetir cada…» en ⋯ para que se cree solo cada mes."
        action="Ver facturas"
        @action="router.push('/documentos/facturas')"
      />

      <ul v-if="rows.length" aria-label="Repeticiones">
        <li v-for="row in rows" :key="row.name">
          <ListRow
            icon="lucide-refresh-cw"
            :title="row.titulo"
            :subtitle="isPhone ? '' : subtitle(row)"
            :data-repeticion="row.name"
            @click="editing = row"
          >
            <!-- Phone: the frequency is a chip under the title and the line
                 «Póliza · la siguiente el …» gets two lines of the full width. -->
            <template v-if="isPhone" #subtitle>
              <span class="mt-1 flex">
                <span
                  :class="chipClass(row.activo)"
                  class="whitespace-nowrap"
                  >{{ row.frecuencia_texto }}</span
                >
              </span>
              <!-- The row's subtitle box truncates on one line: this line wraps. -->
              <span
                class="mt-1 line-clamp-2 break-words"
                style="white-space: normal"
                >{{ subtitle(row) }}</span
              >
            </template>
            <template v-else #trailing>
              <span :class="chipClass(row.activo)" class="whitespace-nowrap">{{
                row.frecuencia_texto
              }}</span>
            </template>
          </ListRow>
        </li>
      </ul>
    </div>

    <RepetirSheet
      v-if="editing"
      :open="Boolean(editing)"
      :doctype="editing.doctype"
      :name="editing.documento"
      :title="editing.titulo"
      open-record
      @update:open="(value) => !value && (editing = null)"
      @changed="load"
    />
  </div>
</template>
<script setup>
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { AppBar, EmptyState, ListRow } from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import {
  autoApi,
  chipClass,
  errorText,
  siguienteTexto,
} from '@/components/automatizaciones/automatizaciones'

const RepetirSheet = defineAsyncComponent(
  () => import('@/components/automatizaciones/RepetirSheet.vue'),
)

const router = useRouter()
const rows = ref([])
const loading = ref(false)
const error = ref('')
const denied = ref(false)
const motivo = ref('')
const editing = ref(null)

function subtitle(row) {
  return [row.tipo, siguienteTexto(row)].filter(Boolean).join(' · ')
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await autoApi('repeticiones')
    denied.value = !data?.puede_ver
    motivo.value = data?.motivo || ''
    rows.value = data?.filas || []
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>
