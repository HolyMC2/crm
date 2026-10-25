<template>
  <!-- Disparadores › «Avisos del sistema» (Shell D12, Frappe Notification):
       one card per aviso, with the same rhythm as the recipes (title and
       switch, then «Cuándo · A quién · Por dónde» in words), «Nuevo aviso»,
       and the doors to assignment rules and repetitions. -->
  <section
    class="space-y-3"
    aria-labelledby="avisos-sistema"
    data-avisos-sistema
  >
    <h2 id="avisos-sistema" class="pt-2 text-lg font-semibold text-ink-gray-9">
      Avisos del sistema
    </h2>
    <p class="text-base text-ink-gray-7">
      Correos y avisos que el sistema manda solo cuando algo pasa en un
      documento: una factura nueva, una fecha que se acerca, un estado que
      cambia.
    </p>

    <EmptyState
      v-if="loading && !rows.length && manager !== false"
      state="loading"
      title="Cargando avisos…"
    />
    <EmptyState
      v-else-if="error && !rows.length"
      state="error"
      title="No se pudieron cargar los avisos"
      :message="error"
      action="Reintentar"
      @action="load"
    />
    <p v-else-if="manager === false" class="text-sm text-ink-gray-6">
      {{ motivo || 'Solo el dueño ve y cambia los avisos del sistema.' }}
    </p>
    <p
      v-else-if="manager && !rows.length && !loading"
      class="text-base text-ink-gray-7"
    >
      Todavía no hay avisos. Crea uno para que tu equipo se entere a tiempo.
    </p>

    <ul v-if="rows.length" class="grid gap-3 lg:grid-cols-2">
      <li v-for="row in rows" :key="row.name">
        <article
          class="space-y-3 rounded-6 border border-outline-gray-2 bg-surface-base p-4"
          :aria-label="row.titulo"
          :data-aviso="row.name"
        >
          <div class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="break-words text-base font-semibold text-ink-gray-9">
                {{ row.titulo }}
              </h3>
              <!-- The system's own (English) subject, for the owner only. -->
              <p
                v-if="row.asunto_original"
                class="break-words text-sm text-ink-gray-6"
                data-asunto-original
              >
                Asunto: {{ row.asunto_original }}
              </p>
              <p class="text-sm text-ink-gray-6">
                {{ row.documento
                }}{{ row.estandar ? ' · viene con el sistema' : '' }}
              </p>
            </div>
            <Interruptor
              :on="row.activo"
              :label="row.titulo"
              :disabled="busy === row.name"
              @toggle="(value) => toggle(row, value)"
            />
          </div>
          <dl class="space-y-1 text-base">
            <div class="flex flex-wrap gap-x-2">
              <dt class="text-ink-gray-6">Cuándo</dt>
              <dd class="min-w-0 break-words text-ink-gray-8">
                {{ row.cuando }}{{ row.condicion ? `, ${row.condicion}` : '' }}
              </dd>
            </div>
            <div class="flex flex-wrap gap-x-2">
              <dt class="text-ink-gray-6">A quién</dt>
              <dd
                class="min-w-0 break-words"
                :class="
                  row.a_quien === 'Nadie todavía'
                    ? 'text-ink-red-4'
                    : 'text-ink-gray-8'
                "
              >
                {{ row.a_quien }}
              </dd>
            </div>
            <div class="flex flex-wrap gap-x-2">
              <dt class="text-ink-gray-6">Por dónde</dt>
              <dd class="text-ink-gray-8">{{ row.por_donde }}</dd>
            </div>
          </dl>
        </article>
      </li>
    </ul>

    <button
      v-if="manager"
      type="button"
      :class="BTN.tonal"
      data-nuevo-aviso
      @click="creating = true"
    >
      <span class="lucide-plus size-5" aria-hidden="true" />
      Nuevo aviso
    </button>

    <ul
      class="-mx-4 border-t border-outline-gray-1 pt-2"
      aria-label="Más automatizaciones"
    >
      <li>
        <ListRow
          to="/automatizaciones/asignacion"
          icon="lucide-user-plus"
          title="Reglas de asignación"
          subtitle="Reparte los documentos nuevos entre tu equipo"
        >
          <template #trailing>
            <span
              class="lucide-chevron-right size-5 text-ink-gray-5"
              aria-hidden="true"
            />
          </template>
        </ListRow>
      </li>
      <li>
        <ListRow
          to="/automatizaciones/repeticiones"
          icon="lucide-refresh-cw"
          title="Repeticiones"
          subtitle="Facturas y pedidos que se crean solos cada cierto tiempo"
        >
          <template #trailing>
            <span
              class="lucide-chevron-right size-5 text-ink-gray-5"
              aria-hidden="true"
            />
          </template>
        </ListRow>
      </li>
    </ul>

    <NuevoAvisoSheet
      v-if="creating"
      v-model:open="creating"
      @created="created"
    />
  </section>
</template>
<script setup>
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { toast } from 'frappe-ui'
import { EmptyState, ListRow } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import Interruptor from './Interruptor.vue'
import { autoApi, errorText } from './automatizaciones'

const NuevoAvisoSheet = defineAsyncComponent(
  () => import('./NuevoAvisoSheet.vue'),
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
    const data = await autoApi('avisos')
    manager.value = Boolean(data?.manager)
    motivo.value = data?.motivo || ''
    rows.value = data?.avisos || []
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
    rows.value[index] = await autoApi('activar_aviso', {
      name: row.name,
      activo: value ? 1 : 0,
    })
    toast.success(value ? `Encendido: ${row.titulo}.` : 'Apagado.')
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
