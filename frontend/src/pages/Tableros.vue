<template>
  <div class="flex h-full flex-col overflow-y-auto">
    <AppBar
      v-if="phone"
      back
      back-label="Más"
      title="Tableros"
      :loading="loading"
    />
    <div class="mx-auto w-full max-w-3xl space-y-4 px-4 pb-24 pt-3 sm:pt-6">
      <header v-if="!phone" class="flex flex-wrap items-center gap-3">
        <h1 class="title-face flex-1 text-2xl font-semibold text-ink-gray-9">
          Tableros
        </h1>
        <Button
          class="min-h-11"
          label="Pídele uno a Muelle"
          data-testid="ask-new"
          @click="askNew"
        >
          <template #prefix>
            <span class="lucide-sparkles size-4" aria-hidden="true" />
          </template>
        </Button>
        <Button
          variant="solid"
          class="min-h-11"
          label="Nuevo tablero"
          :loading="creating"
          data-testid="new-board"
          @click="create"
        >
          <template #prefix>
            <span class="lucide-plus size-4" aria-hidden="true" />
          </template>
        </Button>
      </header>
      <p class="text-base text-ink-gray-7">
        Tus gráficas y números de todas las apps en una sola pantalla. Los
        acomodas tú o se los pides a Muelle: «hazme un tablero de ventas y
        cobranza».
      </p>

      <EmptyState
        v-if="loading && !rows.length"
        state="loading"
        title="Cargando tableros…"
      />
      <EmptyState
        v-else-if="problem"
        state="error"
        :title="problem.title"
        :message="problem.detail"
        action="Reintentar"
        @action="load"
      />
      <EmptyState
        v-else-if="loaded && !rows.length"
        title="Todavía no tienes tableros"
        message="Arma el primero tú, o pídeselo a Muelle con tus palabras."
        action="Nuevo tablero"
        @action="create"
      />

      <section v-if="mine.length" aria-label="Mis tableros">
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="row in mine" :key="row.name">
            <ListRow
              :to="`${HOME}/${row.name}`"
              icon="lucide-layout-dashboard"
              :title="row.title"
              :subtitle="edited(row)"
              :data-testid="`board-${row.name}`"
            />
          </li>
        </ul>
      </section>
      <section v-if="shared.length" aria-labelledby="shared-title">
        <h2 id="shared-title" class="mb-1 text-sm font-medium text-ink-gray-6">
          Compartidos contigo
        </h2>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="row in shared" :key="row.name">
            <ListRow
              :to="`${HOME}/${row.name}`"
              icon="lucide-users"
              :title="row.title"
              :subtitle="`De ${row.owner_name}`"
            />
          </li>
        </ul>
      </section>
    </div>
    <Fab v-if="phone" label="Nuevo tablero" @click="create" />
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import { AppBar, EmptyState, Fab, ListRow } from '@/components/ui'
import { openAssistant } from '@/components/assistant/useAssistant'
import { isMobile as phone } from '@/composables/breakpoint'
import { problemOf } from '@/composables/useCobranza'
import { formatDate } from '@/utils/display'
import { HOME, tablerosApi } from '@/tableros/board'

const router = useRouter()
const rows = ref([])
const loading = ref(false)
const loaded = ref(false)
const problem = ref(null)
const creating = ref(false)

const mine = computed(() => rows.value.filter((r) => r.mine))
const shared = computed(() => rows.value.filter((r) => !r.mine))

function edited(row) {
  return row.modified ? `Cambiado ${formatDate(row.modified)}` : ''
}

async function load() {
  loading.value = true
  problem.value = null
  try {
    rows.value = await tablerosApi('listar')
    loaded.value = true
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    loading.value = false
  }
}

async function create() {
  creating.value = true
  try {
    const board = await tablerosApi('crear', { title: 'Mi tablero' })
    router.push(`${HOME}/${board.name}`)
  } catch (error) {
    toast.error(problemOf(error).detail)
  } finally {
    creating.value = false
  }
}

async function askNew() {
  const opened = await openAssistant({ text: 'Hazme un tablero con ' })
  if (!opened) toast.error('El asistente no está disponible para tu usuario.')
}

onMounted(load)
</script>
