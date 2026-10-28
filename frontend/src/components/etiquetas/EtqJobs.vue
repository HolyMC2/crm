<template>
  <section aria-label="Trabajos de impresión" class="space-y-3" data-etq-jobs>
    <div class="flex flex-wrap items-center gap-2 px-4 sm:px-0">
      <button
        v-for="choice in JOB_FILTERS"
        v-show="choice.value !== 'mine' || all"
        :key="choice.value"
        type="button"
        :class="chipClass(choice.value === current)"
        :aria-pressed="choice.value === current ? 'true' : 'false'"
        @click="emit('update:filter', choice.value)"
      >
        {{ choice.label }}
        <span
          v-if="choice.value === 'Failed' && counts.failed"
          class="num rounded-full bg-surface-base px-1.5 text-ink-gray-8"
          >{{ counts.failed }}</span
        >
      </button>
      <span
        v-if="loading && rows.length"
        class="lucide-loader-circle size-4 animate-spin text-ink-gray-5 motion-reduce:animate-none"
        role="status"
        aria-label="Actualizando"
      />
    </div>
    <p v-if="problem" role="alert" class="mx-4 space-y-2 text-sm sm:mx-0">
      <span class="block text-ink-red-7">{{ problem }}</span>
      <Button
        label="Volver a intentar"
        class="press min-h-11"
        @click="load()"
      />
    </p>
    <ul
      v-else-if="loading && !rows.length"
      class="space-y-1 px-4 sm:px-0"
      aria-hidden="true"
    >
      <li
        v-for="n in 5"
        :key="n"
        class="h-14 animate-pulse rounded-6 bg-surface-gray-2 motion-reduce:animate-none"
      />
    </ul>
    <EmptyState
      v-else-if="!rows.length"
      :title="current === 'Failed' ? 'Nada falló' : 'Aún no hay trabajos'"
      :message="
        current === 'Failed'
          ? 'Las impresiones de la última semana salieron bien.'
          : 'Cada vez que imprimes etiquetas queda aquí, para ver cómo salió y reimprimirla.'
      "
      action="Imprimir etiquetas"
      @action="emit('print')"
    />
    <ul
      v-else
      class="divide-y divide-outline-gray-1 sm:rounded-8 sm:border sm:border-outline-gray-2"
    >
      <li
        v-for="job in rows"
        :key="job.name"
        class="transition-colors duration-200"
        :class="fresh.has(job.name) ? 'bg-surface-gray-2' : ''"
      >
        <ListRow
          :to="{ name: 'EtiquetasTrabajo', params: { name: job.name } }"
          :title="job.title"
          :subtitle="jobLine(job)"
          :subtitle-lines="2"
          icon="lucide-tag"
        >
          <template #trailing>
            <StatusChip
              :label="jobState(job.status).label"
              :tone="jobState(job.status).tone"
            />
          </template>
        </ListRow>
      </li>
    </ul>
    <div v-if="more" class="px-4 pb-4 text-center sm:px-0">
      <Button
        class="press min-h-11"
        label="Ver más"
        :loading="loading"
        @click="load(rows.length)"
      />
    </div>
  </section>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { chipClass } from '@/components/ui/chipClass'
import { EmptyState, ListRow, StatusChip } from '@/components/ui'
import { useLiveList } from '@/composables/liveList'
import {
  JOB_FILTERS,
  etiquetasApi,
  jobLine,
  jobState,
  problemText,
} from '@/composables/useEtiquetas'

const props = defineProps({
  filter: { type: String, default: '' },
  // Whether this worker sees everyone's jobs (else «Míos» is the whole list).
  all: { type: Boolean, default: false },
})
const emit = defineEmits(['update:filter', 'print', 'counts'])

const rows = ref([])
const more = ref(false)
const loading = ref(false)
const problem = ref('')
const counts = ref({})
const current = computed(() =>
  JOB_FILTERS.some((f) => f.value === props.filter) ? props.filter : '',
)

let ticket = 0
async function load(start = 0, { quiet = false } = {}) {
  const mine = ++ticket
  if (!quiet) loading.value = true
  problem.value = ''
  try {
    const answer = await etiquetasApi('jobs', {
      status: current.value === 'Failed' ? 'Failed' : '',
      mine: current.value === 'mine' ? 1 : 0,
      start,
    })
    if (mine !== ticket) return
    const before = rows.value.map((job) => job.name)
    rows.value = start
      ? [...rows.value, ...(answer?.rows || [])]
      : answer?.rows || []
    more.value = !!answer?.more
    counts.value = answer?.counts || {}
    emit('counts', counts.value)
    if (quiet)
      mark(
        before,
        rows.value.map((job) => job.name),
      )
  } catch (error) {
    if (mine === ticket) problem.value = problemText(error)
  } finally {
    if (mine === ticket) loading.value = false
  }
}

// A colleague's print (or Desk's) shows up without reloading.
const { fresh, mark } = useLiveList('Doco Label Print Job', () =>
  load(0, { quiet: true }),
)

watch(current, () => load())
onMounted(() => load())
defineExpose({ load })
</script>
