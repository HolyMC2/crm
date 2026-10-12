<template>
  <div ref="scroller" class="min-h-0 min-w-0 flex-1 overflow-y-auto">
    <div
      v-if="pull || refreshing"
      class="flex items-center justify-center overflow-hidden text-ink-gray-6"
      :style="{ height: `${refreshing ? 48 : pull}px` }"
      role="status"
    >
      <span
        class="lucide-refresh-cw size-5"
        :class="refreshing ? 'animate-spin' : ''"
        aria-hidden="true"
      />
      <span class="sr-only">{{ __('Refreshing') }}</span>
    </div>
    <div class="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <header class="flex flex-wrap items-end gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="text-xl font-semibold text-ink-gray-9">
            {{ __('Results') }}
          </h1>
          <p class="text-sm text-ink-gray-6" data-testid="period-range">
            {{ rangeText }}
          </p>
        </div>
        <Button
          class="hidden min-h-11 sm:inline-flex"
          :label="__('Refresh')"
          :loading="loading"
          @click="load({ refresh: true })"
        />
      </header>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          :aria-label="__('Period')"
          class="inline-flex rounded-lg bg-surface-gray-2 p-0.5"
        >
          <button
            v-for="p in PERIODS"
            :key="p.value"
            role="radio"
            :aria-checked="state.periodo === p.value"
            :data-testid="`periodo-${p.value}`"
            class="min-h-11 rounded-md px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
            :class="
              state.periodo === p.value
                ? 'bg-surface-base text-ink-gray-9 shadow-sm'
                : 'text-ink-gray-6'
            "
            @click="update({ periodo: p.value })"
          >
            {{ periodLabel(p.value) }}
          </button>
        </div>
        <FormControl
          class="w-full sm:w-56"
          type="select"
          data-testid="compara"
          :aria-label="__('Compare with')"
          :model-value="state.compara"
          :options="
            COMPARES.map((c) => ({
              label: compareLabel(c.value),
              value: c.value,
            }))
          "
          @update:model-value="(value) => update({ compara: value })"
        />
      </div>

      <div
        v-if="companies.length > 1 || shops.length > 1"
        class="mt-3 flex gap-2 overflow-x-auto pb-1"
        :aria-label="__('Company and shop')"
      >
        <template v-if="companies.length > 1">
          <button
            v-for="c in [
              { value: '', label: __('All companies') },
              ...companies.map((x) => ({ value: x, label: x })),
            ]"
            :key="`c-${c.value}`"
            class="min-h-11 shrink-0 rounded-full border px-3 text-sm"
            :class="chipClass(state.empresa === c.value)"
            :aria-pressed="state.empresa === c.value"
            @click="update({ empresa: c.value, tienda: '' })"
          >
            {{ c.label }}
          </button>
          <span class="w-px shrink-0 bg-outline-gray-2" aria-hidden="true" />
        </template>
        <template v-if="visibleShops.length > 1">
          <button
            v-for="s in [{ name: '', label: __('All shops') }, ...visibleShops]"
            :key="`s-${s.name}`"
            :data-testid="`tienda-${s.name || 'todas'}`"
            class="min-h-11 shrink-0 rounded-full border px-3 text-sm"
            :class="chipClass(state.tienda === s.name)"
            :aria-pressed="state.tienda === s.name"
            @click="update({ tienda: s.name })"
          >
            {{ s.label }}
          </button>
        </template>
      </div>

      <div
        v-if="problem"
        role="alert"
        class="mt-4 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button class="ml-2" :label="__('Retry', null, CTX)" @click="load()" />
      </div>

      <section
        class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        :aria-label="__('Numbers for the period')"
        :aria-busy="loading ? 'true' : undefined"
      >
        <ResultadosCard
          v-for="key in shownKeys"
          :key="key"
          :card-key="key"
          :card="cards[key] || null"
          :loading="loading || retrying === key"
          :compara="state.compara"
          :currency="currency"
          :back="back"
          @retry="retryCard"
        />
      </section>
      <div
        v-if="loaded && !shownKeys.length"
        class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
      >
        <p class="text-lg font-semibold">
          {{ __('No numbers for you here yet') }}
        </p>
        <p class="mt-1 text-sm">
          {{
            __(
              'The numbers you may see appear here once your manager gives you access.',
            )
          }}
        </p>
      </div>
      <p v-if="generatedAt" class="mt-4 text-xs text-ink-gray-5">
        {{ __('Updated {0}', [generatedAt]) }}
      </p>
    </div>
  </div>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, FormControl } from 'frappe-ui'
import ResultadosCard from '@/components/resultados/ResultadosCard.vue'
import { problemOf } from '@/composables/useCobranza'
import { shellBoot } from '@/composables/muelleShell'
import { usePullRefresh } from '@/composables/usePullRefresh'
import {
  COMPARES,
  CTX,
  PERIODS,
  compareLabel,
  periodLabel,
  readQuery,
  resultadosApi,
  toQuery,
} from '@/composables/useResultados'

// Every card the board can show, in order; until the first answer arrives
// they render as skeletons so the page does not jump.
const SKELETON_KEYS = [
  'ventas',
  'margen',
  'efectivo',
  'por_cobrar',
  'reparaciones',
]

const route = useRoute()
const router = useRouter()
const scroller = ref(null)
const cards = reactive({})
const order = ref([])
const scope = ref({ companies: [], shops: [] })
const period = ref(null)
const loading = ref(false)
const loaded = ref(false)
const retrying = ref('')
const problem = ref(null)
const generatedAt = ref('')
let ticket = 0

const state = computed(() => readQuery(route.query))
const companies = computed(() => scope.value.companies || [])
const shops = computed(() => scope.value.shops || [])
const visibleShops = computed(() =>
  shops.value.filter(
    (s) => !state.value.empresa || s.company === state.value.empresa,
  ),
)
const currency = computed(() => shellBoot.value?.currency || '')
const back = computed(() => `/crm${route.fullPath}`)
const shownKeys = computed(() => (loaded.value ? order.value : SKELETON_KEYS))
const rangeText = computed(() => {
  const p = period.value
  if (!p) return periodLabel(state.value.periodo)
  const span = (from, to) =>
    from === to ? dateText(from) : `${dateText(from)} – ${dateText(to)}`
  const main = span(p.from, p.to)
  if (state.value.compara === 'no' || !p.compare_from) return main
  return __('{0} · compared with {1}', [
    main,
    span(p.compare_from, p.compare_to),
  ])
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
function chipClass(active) {
  return active
    ? 'border-outline-gray-4 bg-surface-gray-3 font-medium text-ink-gray-9'
    : 'border-outline-gray-2 text-ink-gray-7 hover:bg-surface-gray-1'
}

function update(patch) {
  router.replace({ query: toQuery({ ...state.value, ...patch }) })
}

async function load({ refresh = false } = {}) {
  const mine = ++ticket
  loading.value = !refresh || !loaded.value
  problem.value = null
  try {
    const out = await resultadosApi('board', state.value)
    if (mine !== ticket) return
    for (const key of Object.keys(cards)) delete cards[key]
    for (const card of out.cards || []) cards[card.key] = card
    order.value = (out.cards || []).map((card) => card.key)
    scope.value = out.scope || { companies: [], shops: [] }
    period.value = out.period
    generatedAt.value = new Date().toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
    loaded.value = true
  } catch (error) {
    if (mine === ticket) problem.value = problemOf(error)
  } finally {
    if (mine === ticket) loading.value = false
  }
}

async function retryCard(key) {
  retrying.value = key
  try {
    const out = await resultadosApi('board', { ...state.value, card: key })
    const card = (out.cards || []).find((c) => c.key === key)
    if (card) cards[key] = card
  } catch (error) {
    cards[key] = { key, blocked_reason: problemOf(error).detail, retry: true }
  } finally {
    retrying.value = ''
  }
}

const { pull, refreshing } = usePullRefresh(scroller, () =>
  load({ refresh: true }),
)

watch(
  () => [
    state.value.periodo,
    state.value.compara,
    state.value.empresa,
    state.value.tienda,
  ],
  () => {
    if (route.name === 'Resultados') load()
  },
  { immediate: true },
)
</script>
