<template>
  <div class="flex h-full flex-col overflow-y-auto">
    <AppBar
      v-if="phone"
      back
      back-label="Más"
      title="Hojas"
      :loading="loading"
    />
    <div class="mx-auto w-full max-w-3xl space-y-4 px-4 pb-24 pt-3 sm:pt-6">
      <header v-if="!phone" class="flex flex-wrap items-center gap-3">
        <h1 class="title-face flex-1 text-2xl font-semibold text-ink-gray-9">
          Hojas
        </h1>
        <Button
          class="min-h-11"
          label="Abrir un Excel"
          :loading="importing"
          data-testid="import-excel"
          @click="pick"
        >
          <template #prefix>
            <span class="lucide-file-up size-4" aria-hidden="true" />
          </template>
        </Button>
        <Button
          class="min-h-11"
          label="Pídele una a Muelle"
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
          label="Nueva hoja"
          :loading="creating"
          data-testid="new-sheet"
          @click="create"
        >
          <template #prefix>
            <span class="lucide-plus size-4" aria-hidden="true" />
          </template>
        </Button>
      </header>
      <p class="text-base text-ink-gray-7">
        Hojas de cálculo vivas: presupuestos, proyecciones, escenarios de
        precios. Las mueves tú o se las pides a Muelle: «hazme un presupuesto
        del mes con mis gastos fijos». Se descargan en Excel.
      </p>
      <div v-if="phone" class="flex gap-2">
        <Button
          class="min-h-11 flex-1"
          label="Pídele una a Muelle"
          @click="askNew"
        >
          <template #prefix>
            <span class="lucide-sparkles size-4" aria-hidden="true" />
          </template>
        </Button>
        <Button
          class="min-h-11 flex-1"
          label="Abrir un Excel"
          :loading="importing"
          @click="pick"
        >
          <template #prefix>
            <span class="lucide-file-up size-4" aria-hidden="true" />
          </template>
        </Button>
      </div>
      <input
        ref="picker"
        type="file"
        class="hidden"
        accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        data-testid="excel-input"
        @change="importExcel"
      />

      <EmptyState
        v-if="loading && !rows.length"
        state="loading"
        title="Cargando hojas…"
      />
      <EmptyState
        v-else-if="problem"
        state="error"
        :title="problem.title"
        :message="problem.detail"
        action="Volver a intentar"
        @action="load"
      />
      <EmptyState
        v-else-if="loaded && !rows.length"
        title="Todavía no tienes hojas"
        message="Arma la primera tú, abre un Excel o pídesela a Muelle con tus palabras."
        action="Nueva hoja"
        @action="create"
      />

      <section v-if="mine.length" aria-label="Mis hojas">
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="row in mine" :key="row.name">
            <ListRow
              :to="`${HOME}/${row.name}`"
              icon="lucide-sheet"
              :title="row.title"
              :subtitle="edited(row)"
              :data-testid="`sheet-${row.name}`"
            />
          </li>
        </ul>
      </section>
      <section v-if="shared.length" aria-labelledby="shared-title">
        <h2 id="shared-title" class="mb-1 text-sm font-medium text-ink-gray-6">
          Compartidas contigo
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
    <Fab v-if="phone" label="Nueva hoja" @click="create" />
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import { AppBar, EmptyState, Fab, ListRow } from '@/components/ui'
import { openAssistant } from '@/components/assistant/useAssistant'
import { uploadSheet } from '@/components/importar/importar'
import { isMobile as phone } from '@/composables/breakpoint'
import { problemOf } from '@/composables/useCobranza'
import { formatDate } from '@/utils/display'
import { errorText } from '@/utils/errorText'
import { HOME, askPrompt, hojasApi, prefetchEditor } from '@/hojas/hoja'

const router = useRouter()
const rows = ref([])
const loading = ref(false)
const loaded = ref(false)
const problem = ref(null)
const creating = ref(false)
const importing = ref(false)
const picker = ref(null)

const mine = computed(() => rows.value.filter((r) => r.mine))
const shared = computed(() => rows.value.filter((r) => !r.mine))

function edited(row) {
  return row.modified ? `Cambiada ${formatDate(row.modified)}` : ''
}

async function load() {
  loading.value = true
  problem.value = null
  try {
    rows.value = await hojasApi('listar')
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
    const sheet = await hojasApi('crear', { title: 'Mi hoja' })
    router.push(`${HOME}/${sheet.name}`)
  } catch (error) {
    toast.error(problemOf(error).detail)
  } finally {
    creating.value = false
  }
}

function pick() {
  picker.value?.click()
}

async function importExcel(event) {
  const [file] = event.target.files || []
  event.target.value = ''
  if (!file) return
  importing.value = true
  try {
    const id = await uploadSheet(file)
    const sheet = await hojasApi('importar', { file: id })
    router.push(`${HOME}/${sheet.name}`)
  } catch (error) {
    toast.error(
      errorText(error, 'No pude abrir ese Excel. Prueba con otro archivo.'),
    )
  } finally {
    importing.value = false
  }
}

async function askNew() {
  const opened = await openAssistant({ text: askPrompt(null) })
  if (!opened) toast.error('El asistente no está disponible para tu usuario.')
}

onMounted(() => {
  load()
  // Opening a sheet then starts from cache.
  ;(window.requestIdleCallback || setTimeout)(prefetchEditor)
})
</script>
