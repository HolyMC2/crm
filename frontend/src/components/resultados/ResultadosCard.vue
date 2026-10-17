<template>
  <article
    :id="`card-${cardKey}`"
    :data-testid="`resultados-card-${cardKey}`"
    :data-state="state"
    class="flex min-w-0 flex-col gap-3 rounded-xl border border-outline-gray-2 bg-surface-base p-4 sm:p-5"
    :class="[span, state === 'ready' || state === 'loading' ? 'min-h-44' : '']"
    :aria-busy="state === 'loading' ? 'true' : undefined"
  >
    <header class="flex items-center gap-2.5">
      <span
        class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-gray-2 text-ink-gray-7"
        aria-hidden="true"
      >
        <span :class="icon" class="size-4" />
      </span>
      <h2 class="min-w-0 flex-1 truncate text-sm font-medium text-ink-gray-7">
        {{ card?.label || cardTitle(cardKey) }}
      </h2>
      <span
        v-if="chartHeader"
        class="shrink-0 text-xs tabular-nums text-ink-gray-6"
        data-testid="chart-total"
        >{{ chartHeader }}</span
      >
      <span
        v-if="delta"
        data-testid="delta"
        class="inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
        :class="deltaClass"
        :title="compareText"
      >
        <span
          v-if="delta.arrow !== 'flat'"
          :class="
            delta.arrow === 'up'
              ? 'lucide-arrow-up-right'
              : 'lucide-arrow-down-right'
          "
          class="size-3"
          aria-hidden="true"
        />{{ delta.label }}</span
      >
    </header>

    <template v-if="state === 'loading'">
      <div class="h-8 w-32 animate-pulse rounded bg-surface-gray-2" />
      <div class="h-4 w-48 animate-pulse rounded bg-surface-gray-2" />
      <div
        class="mt-auto animate-pulse rounded-lg bg-surface-gray-2"
        :class="size ? 'h-32' : 'h-8'"
      />
    </template>

    <!-- Blocked or failed: the reason and a way forward, never a zero. -->
    <div
      v-else-if="state === 'blocked' || state === 'error'"
      role="status"
      data-testid="guard"
      class="flex flex-1 flex-col gap-2"
    >
      <p class="text-sm text-ink-gray-7">{{ card.blocked_reason }}</p>
      <div class="mt-auto flex flex-wrap gap-2">
        <Button
          v-if="state === 'error'"
          :label="__('Retry', null, CTX)"
          class="min-h-11"
          @click="$emit('retry', cardKey)"
        />
        <Button
          v-else
          :label="__('Copy access request')"
          class="min-h-11"
          @click="copy"
        />
      </div>
      <p v-if="copied" role="status" class="text-xs text-ink-gray-6">
        {{ copied }}
      </p>
    </div>

    <template v-else-if="state === 'ready'">
      <div v-if="!isRanked" class="flex items-end gap-3">
        <div class="min-w-0 flex-1">
          <p
            class="font-semibold tabular-nums tracking-tight text-ink-gray-9"
            :class="size === 'full' ? 'text-3xl' : 'text-2xl'"
          >
            {{ formatValue(card.value, card.format, currency) }}
            <span
              v-if="card.value_label"
              class="text-sm font-normal tracking-normal text-ink-gray-6"
              >{{ card.value_label }}</span
            >
          </p>
          <p
            v-if="prevText"
            class="mt-0.5 text-xs tabular-nums text-ink-gray-5"
            data-testid="prev"
          >
            {{ prevText }}
          </p>
        </div>
      </div>
      <svg
        v-if="spark"
        class="h-10 w-full overflow-visible"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-testid="spark"
      >
        <path
          v-if="spark.prev"
          :d="spark.prev"
          fill="none"
          stroke="currentColor"
          class="text-ink-gray-3"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
        <path
          :d="spark.line"
          fill="none"
          stroke="var(--brand)"
          stroke-width="2"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <dl
        v-if="card.facts?.length"
        class="grid gap-x-4 gap-y-1 text-sm"
        :class="size ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'"
      >
        <div v-for="fact in card.facts" :key="fact.label" class="min-w-0">
          <dt class="truncate text-xs text-ink-gray-6">{{ fact.label }}</dt>
          <dd class="truncate font-medium tabular-nums text-ink-gray-8">
            {{ formatValue(fact.value, fact.format, currency) }}
          </dd>
        </div>
      </dl>
      <ResultadosChart
        v-if="card.chart"
        :chart="card.chart"
        :card-key="cardKey"
        :currency="currency"
        :compara="compara"
        :back="back"
        @filter="(f) => $emit('filter', f)"
      />
      <ul v-if="card.items?.length" class="space-y-1 text-sm">
        <li v-for="item in card.items" :key="item.label" class="flex gap-2">
          <component
            :is="item.href ? 'a' : 'span'"
            :href="item.href ? itemHref(item.href) : undefined"
            class="min-w-0 flex-1 truncate"
            :class="
              item.href
                ? 'text-ink-gray-8 hover:text-ink-gray-9 hover:underline'
                : 'text-ink-gray-7'
            "
            >{{ item.label }}</component
          >
          <span
            class="tabular-nums"
            :class="item.value < 0 ? 'text-ink-red-7' : 'text-ink-gray-8'"
            >{{ formatValue(item.value, item.format, currency) }}</span
          >
        </li>
      </ul>
      <p v-if="card.note" class="text-xs text-ink-gray-6">{{ card.note }}</p>
      <div class="mt-auto flex flex-col gap-1">
        <a
          v-if="attentionHref"
          :href="attentionHref"
          data-testid="attention"
          class="flex min-h-11 items-center gap-2 rounded-lg bg-surface-amber-1 px-3 text-sm font-medium text-ink-amber-8 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          @click="follow($event, attentionHref)"
        >
          <span
            class="lucide-circle-alert size-4 shrink-0"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">{{ card.attention.label }}</span>
          <span
            class="lucide-chevron-right size-4 shrink-0"
            aria-hidden="true"
          />
        </a>
        <a
          v-if="drillLink"
          :href="drillLink"
          data-testid="drill"
          class="group inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-ink-gray-8 hover:text-ink-gray-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          @click="follow($event, drillLink)"
          >{{ card.drill.label || __('See documents') }}</a
        >
      </div>
    </template>

    <div
      v-else
      class="flex flex-1 flex-col items-center justify-center gap-2 py-4 text-center"
      data-testid="empty"
    >
      <span :class="icon" class="size-5 text-ink-gray-4" aria-hidden="true" />
      <p class="max-w-xs text-sm text-ink-gray-6">
        {{ card?.note || __('Nothing to show for this period yet.') }}
      </p>
      <a
        v-if="drillLink"
        :href="drillLink"
        data-testid="drill"
        class="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-gray-8 hover:text-ink-gray-9"
        @click="follow($event, drillLink)"
        >{{ card.drill.label || __('See documents') }}</a
      >
    </div>
  </article>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import ResultadosChart from '@/components/resultados/ResultadosChart.vue'
import {
  CTX,
  accessRequest,
  cardSpan,
  cardState,
  cardTitle,
  compareLabel,
  deltaChip,
  drillHref,
  formatValue,
  routerPath,
} from '@/composables/useResultados'

const ICONS = {
  ventas: 'lucide-receipt',
  tickets: 'lucide-ticket',
  ticket_promedio: 'lucide-shopping-bag',
  promedio_diario: 'lucide-calendar-days',
  tratos: 'lucide-handshake',
  tendencia: 'lucide-chart-spline',
  meta: 'lucide-target',
  margen: 'lucide-percent',
  descuentos: 'lucide-tag',
  devoluciones: 'lucide-undo-2',
  cancelaciones: 'lucide-circle-x',
  efectivo: 'lucide-wallet',
  clientes: 'lucide-users',
  por_cobrar: 'lucide-hand-coins',
  reparaciones: 'lucide-wrench',
  tiendas: 'lucide-store',
  mix_grupos: 'lucide-layers',
  top_articulos: 'lucide-package',
  vendedores: 'lucide-user-round',
  formas_pago: 'lucide-credit-card',
  por_hora: 'lucide-clock',
  dia_semana: 'lucide-calendar',
  hora_dia: 'lucide-grid-3x3',
}
// Ranked lists show their total in the header instead of a big number.
const RANKED = new Set(['bars', 'columns', 'heatmap'])

const props = defineProps({
  cardKey: { type: String, required: true },
  card: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  compara: { type: String, default: 'anterior' },
  currency: { type: String, default: '' },
  back: { type: String, default: '' },
  // Width while loading (the card has not said yet).
  skeletonSize: { type: String, default: '' },
  // Columns on the 4-column grid, when the board widens a card to close a gap.
  lgSpan: { type: Number, default: 0 },
})
defineEmits(['retry', 'filter'])
const router = useRouter()
const copied = ref('')

const state = computed(() => cardState(props.card, { loading: props.loading }))
const size = computed(() => props.card?.size || props.skeletonSize || '')
const span = computed(() => cardSpan(size.value, props.lgSpan))
const icon = computed(() => ICONS[props.cardKey] || 'lucide-chart-column')
const isRanked = computed(() => RANKED.has(props.card?.chart?.type))
const chartHeader = computed(() => {
  if (state.value !== 'ready' || !isRanked.value) return ''
  const total = formatValue(props.card.value, props.card.format, props.currency)
  return props.card.value_label
    ? `${total} · ${props.card.value_label}`
    : __('Total {0}', [total])
})
const delta = computed(() =>
  state.value === 'ready' ? deltaChip(props.card, props.compara) : null,
)
const compareText = computed(() => compareLabel(props.compara))
const deltaClass = computed(
  () =>
    ({
      up: 'bg-surface-green-2 text-ink-green-8',
      down: 'bg-surface-red-2 text-ink-red-8',
      flat: 'bg-surface-gray-2 text-ink-gray-7',
    })[delta.value?.tone] || '',
)
const prevText = computed(() => {
  const c = props.card
  if (props.compara === 'no' || !c || c.prev === null || c.prev === undefined)
    return ''
  return __('before {0}', [formatValue(c.prev, c.format, props.currency)])
})
const spark = computed(() => {
  const s = props.card?.spark
  if (!s?.values || s.values.length < 2) return null
  const prev = props.compara === 'no' ? null : s.prev
  const all = [...s.values, ...(prev || [])]
  const max = Math.max(...all, 0) || 1
  const path = (values) =>
    values
      .map(
        (v, i) =>
          `${i ? 'L' : 'M'}${(i / (values.length - 1)) * 100},${38 - (Math.max(0, v) / max) * 36}`,
      )
      .join(' ')
  return {
    line: path(s.values),
    prev: prev?.length > 1 ? path(prev) : '',
  }
})
const attentionHref = computed(() =>
  drillHref(props.card?.attention?.drill, props.back),
)
const drillLink = computed(() => drillHref(props.card?.drill, props.back))

function itemHref(href) {
  return drillHref({ href }, props.back) || href
}
function follow(event, href) {
  const local = routerPath(href)
  if (!local || event.metaKey || event.ctrlKey || event.shiftKey) return
  event.preventDefault()
  router.push(local)
}
async function copy() {
  const text = accessRequest(props.card)
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}
</script>
