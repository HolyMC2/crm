<template>
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-etq-trabajo
  >
    <AppBar
      v-if="phone"
      :back="back"
      back-label="Volver a los trabajos"
      context="Etiquetas"
      :title="job?.title || 'Trabajo de etiquetas'"
    />
    <header v-else class="px-6 pb-2 pt-6">
      <RouterLink
        :to="back"
        class="mb-1 inline-flex min-h-8 items-center gap-1 text-sm text-ink-gray-6 hover:text-ink-gray-9"
      >
        <span class="lucide-arrow-left size-4" aria-hidden="true" />
        Trabajos de etiquetas
      </RouterLink>
      <h1 class="title-face text-2xl font-semibold text-ink-gray-9">
        {{ job?.title || 'Trabajo de etiquetas' }}
      </h1>
    </header>

    <EmptyState
      v-if="problem && !job"
      class="mx-auto my-8 max-w-md"
      :state="denied ? 'denied' : 'error'"
      :title="
        denied ? 'No puedes ver este trabajo' : 'No pude abrir el trabajo'
      "
      :message="problem"
      :action="denied ? 'Volver a los trabajos' : 'Volver a intentar'"
      @action="denied ? router.push(back) : load()"
    />
    <div
      v-else-if="!job"
      class="space-y-3 px-4 py-4 sm:px-6"
      role="status"
      aria-label="Cargando el trabajo"
    >
      <div
        class="h-6 w-1/2 animate-pulse rounded-6 bg-surface-gray-2 motion-reduce:animate-none"
      />
      <div
        class="h-48 animate-pulse rounded-8 bg-surface-gray-2 motion-reduce:animate-none"
      />
    </div>

    <div
      v-else
      class="grid gap-4 px-4 pb-6 pt-2 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start"
    >
      <div class="min-w-0 space-y-4">
        <!-- The state first, in words, and what it means for the worker. -->
        <section class="space-y-2" aria-label="Cómo salió">
          <div class="flex flex-wrap items-center gap-2">
            <StatusChip :label="state.label" :tone="state.tone" />
            <span class="text-sm text-ink-gray-6">{{ line }}</span>
          </div>
          <p
            v-if="job.status === 'Failed'"
            role="alert"
            class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
          >
            {{ job.error || 'El navegador no pudo imprimir.' }} Vuelve a
            imprimirla; si el navegador no imprime, descarga las etiquetas.
          </p>
          <p
            v-else-if="job.status === 'Rendered'"
            class="text-sm text-ink-gray-6"
          >
            Se dibujó pero no se confirmó la impresión. Si no salió, vuelve a
            imprimirla.
          </p>
          <p v-if="problemText" role="alert" class="text-sm text-ink-red-7">
            {{ problemText }}
          </p>
        </section>

        <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt class="text-ink-gray-6">Plantilla</dt>
          <dd class="text-ink-gray-9">{{ job.layout_label || '—' }}</dd>
          <template v-if="job.price_list">
            <dt class="text-ink-gray-6">Precios de</dt>
            <dd class="text-ink-gray-9">{{ job.price_list }}</dd>
          </template>
          <template v-if="job.source">
            <dt class="text-ink-gray-6">Salió de</dt>
            <dd class="min-w-0">
              <RouterLink
                v-if="sourceRoute"
                :to="sourceRoute"
                class="text-ink-gray-9 underline underline-offset-2"
                >{{ sourceName(job.source.doctype) }}
                {{ job.source.name }}</RouterLink
              >
              <span v-else class="text-ink-gray-9"
                >{{ sourceName(job.source.doctype) }}
                {{ job.source.name }}</span
              >
            </dd>
          </template>
          <dt class="text-ink-gray-6">Quién</dt>
          <dd class="text-ink-gray-9">
            {{ job.mine ? 'Tú' : job.owner_name }}
          </dd>
          <template v-if="job.print_count > 1">
            <dt class="text-ink-gray-6">Impresa</dt>
            <dd class="num text-ink-gray-9">{{ job.print_count }} veces</dd>
          </template>
        </dl>

        <section aria-labelledby="etq-trabajo-filas" class="space-y-2">
          <h2
            id="etq-trabajo-filas"
            class="text-base font-semibold text-ink-gray-9"
          >
            Productos
            <span class="num ml-1 font-normal text-ink-gray-6">{{
              labelsText(job.label_count)
            }}</span>
          </h2>
          <ul
            class="divide-y divide-outline-gray-1 rounded-8 border border-outline-gray-2"
          >
            <li
              v-for="(row, index) in job.rows"
              :key="index"
              class="flex items-center gap-3 px-4 py-2"
            >
              <div class="min-w-0 flex-1">
                <RouterLink
                  :to="{ name: 'Producto', params: { item: row.item_code } }"
                  class="line-clamp-2 text-base text-ink-gray-9 hover:underline"
                  >{{ row.item_name }}</RouterLink
                >
                <p class="truncate text-sm text-ink-gray-6">
                  {{ rowLine(row) }}
                  <template v-if="rowPrice(row)">
                    · <span class="num">{{ rowPrice(row) }}</span>
                  </template>
                </p>
              </div>
              <span class="num flex-none text-base text-ink-gray-8"
                >× {{ row.qty }}</span
              >
            </li>
          </ul>
        </section>
      </div>

      <aside class="min-w-0 space-y-3 lg:sticky lg:top-4">
        <EtqPreview
          :html="job.preview"
          :caption="
            job.label_count > 6
              ? `Muestra de las primeras 6 de ${labelsText(job.label_count)}.`
              : ''
          "
          :empty="job.problem || 'Sin muestra.'"
        />
        <p
          v-if="job.problem"
          role="alert"
          class="rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-9"
        >
          Esta plantilla ya no imprime: {{ job.problem }} Usa «Cambiar y volver
          a imprimir» para elegir otra.
        </p>
        <div
          class="sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-2 border-t border-outline-gray-1 bg-surface-base px-4 pb-3 pt-2 lg:static lg:mx-0 lg:border-0 lg:p-0"
        >
          <Button
            variant="solid"
            class="press min-h-12 flex-1 text-base"
            label="Volver a imprimir"
            :loading="busy"
            :disabled="!job.can_reprint"
            @click="reprint"
          >
            <template #prefix>
              <Icon icon="printer" class="size-5" />
            </template>
          </Button>
          <Button
            class="press min-h-12"
            label="Cambiar y volver a imprimir"
            @click="
              router.push({
                name: 'Etiquetas',
                query: { trabajo: job.name },
              })
            "
          />
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <button
            v-if="lastHtml"
            type="button"
            class="press min-h-11 font-medium text-ink-gray-8 underline underline-offset-2"
            @click="downloadHtml(lastHtml, `${job.name}.html`)"
          >
            Descargar etiquetas
          </button>
          <a
            v-if="job.desk_url"
            :href="job.desk_url"
            target="_blank"
            rel="noopener"
            class="inline-flex min-h-11 items-center text-ink-gray-6 underline underline-offset-2"
            >Abrir en el escritorio</a
          >
        </div>
      </aside>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { AppBar, EmptyState, StatusChip } from '@/components/ui'
import Icon from '@/components/Icon.vue'
import EtqPreview from '@/components/etiquetas/EtqPreview.vue'
import { isMobile as phone } from '@/composables/breakpoint'
import { useLiveList } from '@/composables/liveList'
import { documentRoute } from '@/documentos/registry'
import { errorKind } from '@/utils/contactos'
import {
  downloadHtml,
  etiquetasApi,
  jobLine,
  jobState,
  labelsText,
  printHtml,
  problemText as sayProblem,
  rowLine,
  rowPrice,
  sourceName,
} from '@/composables/useEtiquetas'

const props = defineProps({ name: { type: String, required: true } })
const router = useRouter()
const back = { name: 'Etiquetas', query: { vista: 'trabajos' } }

const job = ref(null)
const problem = ref('')
const denied = ref(false)
const problemText = ref('')
const busy = ref(false)
const lastHtml = ref('')

const state = computed(() => jobState(job.value?.status))
const line = computed(() =>
  job.value ? jobLine({ ...job.value, layout_label: '', mine: true }) : '',
)
const sourceRoute = computed(() =>
  job.value?.source
    ? documentRoute(job.value.source.doctype, job.value.source.name)
    : null,
)

async function load({ quiet = false } = {}) {
  if (!quiet) problem.value = ''
  try {
    job.value = await etiquetasApi('job', { name: props.name })
  } catch (error) {
    if (quiet) return
    job.value = null
    denied.value = errorKind(error) === 'permission'
    problem.value = sayProblem(error)
  }
}

async function reprint() {
  busy.value = true
  problemText.value = ''
  try {
    const answer = await etiquetasApi('reprint', { job: props.name })
    lastHtml.value = answer?.html || ''
    const outcome = await printHtml(lastHtml.value)
    const marked = await etiquetasApi('mark', {
      job: props.name,
      outcome: outcome.ok ? 'printed' : 'failed',
      error: outcome.reason || '',
    })
    job.value = { ...job.value, ...(marked?.job || {}) }
  } catch (error) {
    problemText.value = sayProblem(error)
  } finally {
    busy.value = false
  }
}

// Desk or a colleague changing this job shows here too.
useLiveList('Doco Label Print Job', () => load({ quiet: true }))
watch(
  () => props.name,
  () => load(),
)
onMounted(load)
</script>
