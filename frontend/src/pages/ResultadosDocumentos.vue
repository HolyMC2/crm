<template>
  <ModuleLayout
    :title="__('Results')"
    :entries="entries"
    :active-key="state.tipo"
    @select="(value) => update({ tipo: value })"
  >
    <header
      class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
    >
      <div class="min-w-0 flex-1">
        <a
          :href="backHref"
          data-testid="back-to-board"
          class="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9"
          @click="goBack"
          ><span class="lucide-arrow-left size-4" aria-hidden="true" />{{
            __('Back to {0}', [backLabel])
          }}</a
        >
        <h1 class="truncate text-xl font-semibold text-ink-gray-9">
          {{ tipoLabel(state.tipo) }}
        </h1>
        <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
      </div>
    </header>
    <div class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
      <FormControl
        class="w-full sm:hidden"
        type="select"
        :aria-label="__('List', null, CTX)"
        :model-value="state.tipo"
        :options="entries.map((e) => ({ label: e.label, value: e.value }))"
        @update:model-value="(value) => update({ tipo: value })"
      />
      <FormControl
        v-model="search"
        class="min-w-0 flex-1 sm:max-w-xs"
        type="search"
        :placeholder="__('Search customer or document')"
        :aria-label="__('Search customer or document')"
      />
    </div>
    <p
      v-if="capped"
      class="mx-4 mb-2 text-sm text-ink-gray-6 sm:mx-6"
      role="status"
    >
      {{
        __(
          'Showing the latest 500 documents. Pick a shorter period or one shop to see the rest.',
        )
      }}
    </p>
    <div
      v-if="problem"
      role="alert"
      class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
    >
      <strong>{{ problem.title }}.</strong> {{ problem.detail }}
      <div class="mt-2 flex flex-wrap gap-2">
        <Button :label="__('Retry', null, CTX)" @click="load()" />
        <Button
          v-if="problem.kind === 'permission'"
          :label="__('Copy access request')"
          @click="copyRequest"
        />
      </div>
      <p v-if="copied" role="status" class="mt-1 text-xs">{{ copied }}</p>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto pb-6">
      <div
        v-if="loading && !rows.length"
        role="status"
        class="space-y-2 px-4 py-4 sm:px-6"
      >
        <div
          v-for="n in 6"
          :key="n"
          class="h-12 animate-pulse rounded bg-surface-gray-2"
        />
      </div>
      <div
        v-else-if="!filtered.length && !problem"
        class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
      >
        <p class="text-lg font-semibold">{{ __('Nothing in this list') }}</p>
        <p class="mt-1 text-sm">
          {{
            search
              ? __('Try another customer or document number.')
              : __('Pick another period or list.')
          }}
        </p>
      </div>
      <ul v-else class="divide-y divide-outline-gray-1" data-testid="lens-rows">
        <li v-for="row in filtered" :key="`${row.doctype}:${row.name}`">
          <a
            :href="rowHref(row)"
            class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
            @click="open($event, row)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium text-ink-gray-9">{{
                row.title || row.name
              }}</span>
              <span class="block truncate text-sm text-ink-gray-6">
                {{ row.name }} · {{ row.posting_date }}
                <template v-if="row.tickets">
                  · {{ __('{0} purchases', [row.tickets]) }}</template
                >
                <template v-if="row.deal">
                  · {{ __('Sale in Ventas') }}</template
                >
              </span>
            </span>
            <span
              class="shrink-0 text-sm font-medium tabular-nums"
              :class="
                state.tipo === 'cierres' && row.amount
                  ? 'text-ink-red-7'
                  : 'text-ink-gray-9'
              "
              >{{ money(row.amount, currency) }}</span
            >
          </a>
        </li>
      </ul>
    </div>
  </ModuleLayout>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, FormControl } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import { problemOf } from '@/composables/useCobranza'
import { money } from '@/composables/useCompras'
import { shellBoot } from '@/composables/muelleShell'
import {
  CTX,
  TIPOS,
  boardHref,
  compareLabel,
  periodLabel,
  readLensQuery,
  resultadosApi,
  routerPath,
  rowRoute,
  tipoLabel,
} from '@/composables/useResultados'
import { readReturn } from '@/vendor/muelle-shell/contracts'

const route = useRoute()
const router = useRouter()
const rows = ref([])
const loading = ref(false)
const capped = ref(false)
const problem = ref(null)
const copied = ref('')
const period = ref(null)
const search = ref('')
let ticket = 0

const state = computed(() => readLensQuery(route.query))
const currency = computed(() => shellBoot.value?.currency || '')
const entries = computed(() =>
  TIPOS.map((t) => ({
    value: t.value,
    label: tipoLabel(t.value),
    icon: 'list',
  })),
)
// «Volver» goes where the caller asked (the board with its period), else to
// the board for the same query.
const caller = computed(() =>
  readReturn(new URLSearchParams(route.query), {
    allowedPrefixes: ['/crm/'],
    acceptLegacy: false,
  }),
)
const backHref = computed(() => caller.value?.to || boardHref(state.value))
const backLabel = computed(() => caller.value?.label || 'Resultados')
const subtitle = computed(() => {
  const p = period.value
  const range = p
    ? p.from === p.to
      ? dateText(p.from)
      : `${dateText(p.from)} – ${dateText(p.to)}`
    : periodLabel(state.value.periodo)
  return state.value.compara === 'no'
    ? range
    : `${range} · ${compareLabel(state.value.compara)}`
})
const filtered = computed(() => {
  const text = search.value.trim().toLowerCase()
  if (!text) return rows.value
  return rows.value.filter((row) =>
    [row.name, row.title, row.deal].some((v) =>
      String(v || '')
        .toLowerCase()
        .includes(text),
    ),
  )
})

function dateText(iso) {
  const [y, m, d] = String(iso || '')
    .split('-')
    .map(Number)
  if (!y) return ''
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}
function rowHref(row) {
  return rowRoute(row, `/crm${route.fullPath}`)
}
function open(event, row) {
  const local = routerPath(rowHref(row))
  if (!local || event.metaKey || event.ctrlKey || event.shiftKey) return
  event.preventDefault()
  router.push(local)
}
function goBack(event) {
  const local = routerPath(backHref.value)
  if (!local || event.metaKey || event.ctrlKey) return
  event.preventDefault()
  router.push(local)
}
function update(patch) {
  router.replace({ query: { ...route.query, ...patch } })
}

async function load() {
  const mine = ++ticket
  loading.value = true
  problem.value = null
  try {
    const { tipo, periodo, compara, empresa, tienda, desde, hasta } =
      state.value
    const out = await resultadosApi('documents', {
      tipo,
      periodo,
      compara,
      empresa,
      tienda,
      ...(periodo === 'rango' ? { desde, hasta } : {}),
    })
    if (mine !== ticket) return
    rows.value = out.rows || []
    capped.value = !!out.capped
    period.value = { from: out.from, to: out.to }
  } catch (error) {
    if (mine === ticket) {
      rows.value = []
      problem.value = problemOf(error)
    }
  } finally {
    if (mine === ticket) loading.value = false
  }
}
async function copyRequest() {
  const text = __(
    'I need access to «{0}» in Muelle Resultados. The screen says: {1}',
    [tipoLabel(state.value.tipo), problem.value?.detail || ''],
  )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}

watch(
  () => [
    state.value.tipo,
    state.value.periodo,
    state.value.compara,
    state.value.empresa,
    state.value.tienda,
    state.value.desde,
    state.value.hasta,
  ],
  () => {
    if (route.name === 'ResultadosDocumentos') load()
  },
  { immediate: true },
)
</script>
