<template>
  <div class="flex h-full flex-col overflow-y-auto">
    <!-- Más › Configuración › Herramientas del asistente (Shell Wave D, DD17). -->
    <AppBar
      v-if="isPhone"
      back
      back-label="Más"
      title="Herramientas del asistente"
      :loading="loading"
      searchable
      search-label="Buscar herramienta"
      :search="query"
      :search-open="searchOpen"
      @update:search="(value) => (query = value)"
      @update:search-open="(value) => (searchOpen = value)"
    />
    <div class="mx-auto w-full max-w-3xl space-y-3 px-4 pb-24 pt-3">
      <header v-if="!isPhone" class="flex flex-wrap items-center gap-3">
        <h1 class="flex-1 text-xl font-semibold text-ink-gray-9">
          Herramientas del asistente
        </h1>
        <label class="relative w-72">
          <span class="sr-only">Buscar herramienta</span>
          <span
            class="lucide-search pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-gray-5"
            aria-hidden="true"
          />
          <input
            v-model="query"
            type="search"
            placeholder="Buscar herramienta"
            class="min-h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-white pl-9 pr-3 text-base text-ink-gray-9 placeholder:text-ink-gray-5"
          />
        </label>
      </header>
      <p class="text-base text-ink-gray-7">
        Lo que Pregúntale a Muelle puede consultar y preparar por tu equipo.
        Cada quien solo alcanza lo que su puesto ya permite; aquí puedes apagar,
        limitar o pedir confirmación.
      </p>
      <p
        v-if="sensitiveOff"
        class="rounded-lg bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-8"
      >
        Las que envían algo a un cliente o timbran CFDI vienen apagadas.
        Enciéndelas solo si quieres que el asistente las prepare.
      </p>

      <FilterChips
        v-if="rows.length"
        v-model="chip"
        :chips="chips"
        :deselectable="false"
        label="Mostrar"
      />

      <EmptyState
        v-if="loading && !rows.length"
        state="loading"
        title="Cargando herramientas…"
      />
      <EmptyState
        v-else-if="error && !rows.length"
        state="error"
        title="No se pudieron cargar las herramientas"
        :message="error"
        action="Reintentar"
        @action="load"
      />
      <EmptyState
        v-else-if="!loading && rows.length && !groups.length"
        title="Ninguna herramienta coincide"
        message="Prueba con otra palabra o quita el filtro."
      />

      <section
        v-for="block in groups"
        :key="block.group"
        :aria-labelledby="`grupo-${block.group}`"
        class="space-y-1"
      >
        <h2
          :id="`grupo-${block.group}`"
          class="px-1 pt-3 text-sm font-medium text-ink-gray-6"
        >
          {{ block.group }} · {{ block.items.length }}
        </h2>
        <ul
          class="divide-y divide-outline-gray-1 overflow-hidden rounded-lg border border-outline-gray-2 bg-surface-white"
        >
          <ToolRow
            v-for="row in block.items"
            :key="row.herramienta"
            :row="row"
            :busy="busy === row.herramienta"
            @open="editing = row"
            @toggle="(value) => save(row, { habilitada: value ? 1 : 0 })"
          />
        </ul>
      </section>
    </div>

    <ToolSheet
      v-if="editing"
      :open="Boolean(editing)"
      :row="editing"
      :saving="busy === editing.herramienta"
      :mcp-on="mcpOn"
      @update:open="(value) => !value && (editing = null)"
      @save="(changes) => save(editing, changes)"
      @reset="reset(editing)"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import { toast } from 'frappe-ui'
import { AppBar, EmptyState, FilterChips } from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import ToolRow from '@/components/herramientas/ToolRow.vue'
import {
  chipCounts,
  errorText,
  grouped,
  guardar,
  listar,
  matches,
  restablecer,
} from '@/components/herramientas/herramientas'

const ToolSheet = defineAsyncComponent(
  () => import('@/components/herramientas/ToolSheet.vue'),
)

const loading = ref(false)
const error = ref('')
const rows = ref([])
const mcpOn = ref(false)
const chip = ref('todas')
const query = ref('')
const searchOpen = ref(false)
const busy = ref('')
const editing = ref(null)

const chips = computed(() => chipCounts(rows.value))
const groups = computed(() =>
  grouped(rows.value.filter((row) => matches(row, chip.value, query.value))),
)
const sensitiveOff = computed(() =>
  rows.value.some((row) => row.categoria && !row.habilitada),
)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await listar()
    rows.value = data?.herramientas || []
    mcpOn.value = Boolean(data?.mcp_activo)
  } catch (failure) {
    error.value = errorText(
      failure,
      'Solo el dueño ve esta pantalla. Revisa tu conexión e intenta de nuevo.',
    )
  } finally {
    loading.value = false
  }
}

function replace(updated) {
  const index = rows.value.findIndex(
    (row) => row.herramienta === updated.herramienta,
  )
  if (index === -1) return
  // the server row keeps the group/title this list was built with
  rows.value[index] = { ...rows.value[index], ...updated }
  if (editing.value?.herramienta === updated.herramienta)
    editing.value = rows.value[index]
}

async function save(row, changes) {
  if (!row) return
  busy.value = row.herramienta
  const before = { ...row }
  replace({ ...row, ...changes, cambiada: true })
  try {
    replace(await guardar(row.herramienta, changes))
    if ('habilitada' in changes)
      toast.success(
        changes.habilitada
          ? `Encendida: ${row.titulo}.`
          : `Apagada: ${row.titulo}.`,
      )
  } catch (failure) {
    replace(before)
    toast.error(errorText(failure))
  } finally {
    busy.value = ''
  }
}

async function reset(row) {
  busy.value = row.herramienta
  try {
    replace({ ...(await restablecer(row.herramienta)), cambiada: false })
    toast.success('Volvió a como viene de fábrica.')
  } catch (failure) {
    toast.error(errorText(failure))
  } finally {
    busy.value = ''
  }
}

onMounted(load)
</script>
