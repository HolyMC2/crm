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
    <div class="mx-auto w-full max-w-7xl px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <header class="flex flex-wrap items-start gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="text-2xl font-semibold tracking-tight text-ink-gray-9">
            {{ __('Results') }}
          </h1>
          <p class="mt-0.5 text-sm text-ink-gray-6" data-testid="period-range">
            {{ rangeText }}
            <span v-if="generatedAt" class="text-ink-gray-5">
              · {{ __('updated {0}', [generatedAt]) }}</span
            >
          </p>
        </div>
        <Button
          class="hidden min-h-11 sm:inline-flex"
          :label="__('Refresh')"
          :loading="loading"
          @click="load({ refresh: true })"
        >
          <template #prefix>
            <span class="lucide-refresh-cw size-4" aria-hidden="true" />
          </template>
        </Button>
      </header>

      <div
        class="mt-4 flex flex-col gap-3 rounded-xl border border-outline-gray-2 bg-surface-gray-1 p-2 lg:flex-row lg:items-center"
      >
        <div
          role="radiogroup"
          :aria-label="__('Period')"
          class="flex gap-0.5 overflow-x-auto rounded-lg bg-surface-gray-2 p-0.5"
        >
          <button
            v-for="p in PERIODS"
            :key="p.value"
            role="radio"
            :aria-checked="periodPicked === p.value"
            :data-testid="`periodo-${p.value}`"
            class="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
            :class="
              periodPicked === p.value
                ? 'bg-surface-base text-ink-gray-9 shadow-sm'
                : 'text-ink-gray-6 hover:text-ink-gray-8'
            "
            @click="pickPeriod(p.value)"
          >
            <span
              v-if="p.value === 'rango'"
              class="lucide-calendar-range size-4"
              aria-hidden="true"
            />{{ periodLabel(p.value) }}
          </button>
        </div>
        <div
          role="radiogroup"
          :aria-label="__('Compare with')"
          class="flex gap-0.5 overflow-x-auto rounded-lg bg-surface-gray-2 p-0.5"
          data-testid="compara"
        >
          <button
            v-for="c in COMPARES"
            :key="c.value"
            role="radio"
            :aria-checked="state.compara === c.value"
            :data-testid="`compara-${c.value}`"
            class="min-h-11 shrink-0 whitespace-nowrap rounded-md px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
            :class="
              state.compara === c.value
                ? 'bg-surface-base text-ink-gray-9 shadow-sm'
                : 'text-ink-gray-6 hover:text-ink-gray-8'
            "
            @click="update({ compara: c.value })"
          >
            {{ compareLabel(c.value) }}
          </button>
        </div>
        <div class="flex flex-wrap gap-2 lg:ml-auto">
          <FormControl
            v-if="companies.length > 1"
            class="w-full sm:w-52"
            type="select"
            data-testid="empresa"
            :aria-label="__('Company')"
            :model-value="state.empresa"
            :options="[
              { label: __('All companies'), value: '' },
              ...companies.map((x) => ({ label: x, value: x })),
            ]"
            @update:model-value="
              (value) => update({ empresa: value, tienda: '' })
            "
          />
          <FormControl
            v-if="visibleShops.length > 1 || state.tienda"
            class="w-full sm:w-60"
            type="select"
            data-testid="tienda"
            :aria-label="__('Shop')"
            :model-value="state.tienda"
            :options="[
              { label: __('All shops'), value: '' },
              ...visibleShops.map((x) => ({ label: x.label, value: x.name })),
            ]"
            @update:model-value="(value) => update({ tienda: value })"
          />
        </div>
      </div>

      <form
        v-if="rangeOpen"
        class="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-outline-gray-2 p-3"
        data-testid="rango"
        @submit.prevent="applyRange"
      >
        <FormControl
          v-model="draft.desde"
          class="w-full sm:w-44"
          type="date"
          :label="__('From')"
          :max="draft.hasta || undefined"
        />
        <FormControl
          v-model="draft.hasta"
          class="w-full sm:w-44"
          type="date"
          :label="__('To')"
          :min="draft.desde || undefined"
        />
        <Button
          type="submit"
          variant="solid"
          class="min-h-11"
          :label="__('Show these dates')"
          :disabled="!draft.desde || !draft.hasta"
        />
        <Button
          class="min-h-11"
          variant="ghost"
          :label="__('Cancel')"
          @click="rangeOpen = false"
        />
        <p class="w-full text-xs text-ink-gray-6">
          {{ __('Up to one year. The comparison uses the same number of days.') }}
        </p>
      </form>

      <div
        v-if="shopName"
        class="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-gray-7"
      >
        <span class="lucide-store size-4" aria-hidden="true" />
        {{ __('Only {0}', [shopName]) }}
        <button
          class="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-medium text-ink-gray-8 hover:bg-surface-gray-2"
          @click="update({ tienda: '' })"
        >
          <span class="lucide-x size-4" aria-hidden="true" />{{
            __('All shops')
          }}
        </button>
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
        class="mt-4 grid grid-flow-row-dense grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        :aria-label="__('Numbers for the period')"
        :aria-busy="loading ? 'true' : undefined"
      >
        <ResultadosCard
          v-for="[key, size] in shownKeys"
          :key="key"
          :card-key="key"
          :card="cards[key] || null"
          :loading="loading || retrying === key"
          :compara="state.compara"
          :currency="currency"
          :back="back"
          :skeleton-size="size"
          @retry="retryCard"
          @filter="(patch) => update(patch)"
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
  SKELETON,
  compareLabel,
  dayText,
  periodLabel,
  readQuery,
  resultadosApi,
  toQuery,
} from '@/composables/useResultados'

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
const shownKeys = computed(() =>
  loaded.value
    ? order.value.map((key) => [key, cards[key]?.size || ''])
    : SKELETON,
)
const shopName = computed(() => {
  const name = state.value.tienda
  if (!name) return ''
  return shops.value.find((s) => s.name === name)?.label || name
})
const rangeOpen = ref(false)
const draft = reactive({ desde: '', hasta: '' })
const periodPicked = computed(() =>
  rangeOpen.value ? 'rango' : state.value.periodo,
)
const rangeText = computed(() => {
  const p = period.value
  if (!p) return periodLabel(state.value.periodo)
  const span = (from, to) =>
    from === to ? dayText(from) : `${dayText(from)} – ${dayText(to)}`
  const main = span(p.from, p.to)
  if (state.value.compara === 'no' || !p.compare_from) return main
  return __('{0} · compared with {1}', [
    main,
    span(p.compare_from, p.compare_to),
  ])
})

function update(patch) {
  router.replace({ query: toQuery({ ...state.value, ...patch }) })
}
function pickPeriod(value) {
  if (value !== 'rango') {
    rangeOpen.value = false
    return update({ periodo: value })
  }
  // Start from what the board shows now, so «Dates» is one tweak away.
  draft.desde = state.value.desde || period.value?.from || ''
  draft.hasta = state.value.hasta || period.value?.to || ''
  rangeOpen.value = true
}
function applyRange() {
  if (!draft.desde || !draft.hasta) return
  const [desde, hasta] = [draft.desde, draft.hasta].sort()
  rangeOpen.value = false
  update({ periodo: 'rango', desde, hasta })
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
    state.value.desde,
    state.value.hasta,
  ],
  () => {
    if (route.name === 'Resultados') load()
  },
  { immediate: true },
)
</script>
