<template>
  <!-- A Resultados card is already a whole card: it draws itself. -->
  <div
    v-if="payload?.kind === 'card'"
    class="relative h-full min-w-0 overflow-auto"
    :data-testid="`widget-${widget.id}`"
    data-tipo="card"
  >
    <ResultadosCard
      ref="cardEl"
      class="min-h-full"
      :card-key="payload.card?.key || payload.key || ''"
      :card="
        title && payload.card ? { ...payload.card, label: title } : payload.card
      "
      :loading="loading || !payload.card"
      :compara="payload.query?.compara || 'anterior'"
      :currency="payload.currency || currency"
      :back="back"
      @retry="$emit('retry')"
      @filter="(patch) => $emit('filter', patch)"
    >
      <template v-if="canEdit" #actions>
        <button
          type="button"
          class="press -my-1 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-gray-5 hover:bg-surface-gray-2 hover:text-ink-gray-9"
          :aria-label="`Editar «${title || payload.card?.label || tipo.label}»`"
          title="Editar"
          data-testid="widget-edit"
          @click="$emit('edit')"
        >
          <span class="lucide-pencil size-4" aria-hidden="true" />
        </button>
      </template>
    </ResultadosCard>
  </div>
  <article
    v-else
    class="flex h-full min-w-0 flex-col overflow-hidden rounded-7 border border-outline-gray-2 bg-surface-base"
    :style="tint"
    :data-testid="`widget-${widget.id}`"
    :data-tipo="widget.tipo"
    :aria-busy="loading ? 'true' : undefined"
  >
    <header
      v-if="title || canEdit"
      class="flex min-h-11 items-center gap-2 pl-4 pr-1.5 pt-1.5"
    >
      <h2 class="min-w-0 flex-1 truncate text-sm font-medium text-ink-gray-7">
        {{ title }}
      </h2>
      <button
        v-if="canEdit"
        type="button"
        class="press flex size-9 shrink-0 items-center justify-center rounded-full text-ink-gray-5 hover:bg-surface-gray-2 hover:text-ink-gray-9"
        :aria-label="`Editar «${title || tipo.label}»`"
        title="Editar"
        data-testid="widget-edit"
        @click="$emit('edit')"
      >
        <span class="lucide-pencil size-4" aria-hidden="true" />
      </button>
    </header>

    <div
      class="min-h-0 flex-1 overflow-auto px-4 pb-3"
      :class="!title && !canEdit && 'pt-3'"
    >
      <div
        v-if="payload?.kind === 'blocked'"
        class="flex h-full flex-col items-start justify-center gap-2 text-sm text-ink-gray-6"
        data-testid="widget-blocked"
      >
        <p>{{ payload.reason }}</p>
        <button
          v-if="payload.retry"
          type="button"
          class="press inline-flex min-h-11 items-center gap-1.5 rounded-6 px-3 font-medium text-ink-gray-8 hover:bg-surface-gray-2"
          @click="$emit('retry')"
        >
          <span class="lucide-refresh-cw size-4" aria-hidden="true" />
          Reintentar
        </button>
      </div>
      <div
        v-else-if="loading && widget.tipo !== 'nota'"
        class="h-full min-h-16 animate-pulse rounded-6 bg-surface-gray-2"
      />
      <AssistantProse
        v-else-if="widget.tipo === 'nota'"
        class="text-base text-ink-gray-8"
        :text="widget.texto || ''"
      />
      <WidgetBox
        v-else-if="widget.tipo === 'custom'"
        fill
        :codigo="widget.codigo || {}"
        :data="customData"
        :title="title"
        @error="(message) => (boxError = message)"
      />
      <div
        v-else-if="payload?.kind === 'number'"
        class="flex h-full flex-col justify-center"
      >
        <p class="num text-3xl font-semibold text-ink-gray-9" :style="ink">
          {{ payload.text }}
        </p>
        <p v-if="payload.label" class="mt-1 text-sm text-ink-gray-6">
          {{ payload.label }}
        </p>
        <p
          v-for="stat in payload.stats || []"
          :key="stat.label"
          class="mt-1 text-sm text-ink-gray-7"
        >
          {{ stat.label }}: <span class="num">{{ stat.value }}</span>
        </p>
      </div>
      <AssistantChart
        v-else-if="chart && widget.tipo === 'grafica'"
        fill
        :values="false"
        :chart="chart"
      />
      <div v-else-if="rows" class="overflow-x-auto">
        <table class="w-full text-left text-sm text-ink-gray-8">
          <thead v-if="rows.columns.some(Boolean)">
            <tr class="text-ink-gray-6">
              <th
                v-for="(column, index) in rows.columns"
                :key="index"
                scope="col"
                class="py-1 pr-3 font-medium"
                :class="index && 'text-right'"
              >
                {{ column }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-gray-2">
            <tr v-for="(row, index) in rows.rows" :key="index">
              <td
                v-for="(cell, at) in row"
                :key="at"
                class="py-1.5 pr-3"
                :class="at && 'num text-right'"
              >
                {{ cell }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="payload" class="text-sm text-ink-gray-6">
        Sin datos para este periodo.
      </p>
      <p
        v-if="boxError"
        role="alert"
        class="mt-1 text-xs text-ink-red-7"
        data-testid="widget-box-error"
      >
        El código de este widget falló: {{ boxError }}
      </p>
    </div>
  </article>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import AssistantProse from '@/components/assistant/AssistantProse.vue'
import { chartOf } from '@/components/assistant/assistantChart'
import { chartFor, rowsFor, safeColor, tipoOf } from '@/tableros/board'

const AssistantChart = defineAsyncComponent(
  () => import('@/components/assistant/AssistantChart.vue'),
)
const ResultadosCard = defineAsyncComponent(
  () => import('@/components/resultados/ResultadosCard.vue'),
)
const WidgetBox = defineAsyncComponent(
  () => import('@/components/tableros/WidgetBox.vue'),
)

const props = defineProps({
  widget: { type: Object, required: true },
  /** The widget's data (doco tableros service.datos): chart, number, table,
   * card, inputs or blocked. A card still on its way is `{kind: 'card', key, card: null}`. */
  payload: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  canEdit: { type: Boolean, default: false },
  currency: { type: String, default: '' },
  back: { type: String, default: '' },
})
const emit = defineEmits(['edit', 'retry', 'fit', 'filter'])

// A Resultados card has its own height; it tells the board when its place is
// too short, and the board grows the place (Tablero.vue fit).
const cardEl = ref(null)
let sizes = null
watch(cardEl, (card) => {
  sizes?.disconnect()
  const el = card?.$el
  if (!el || typeof ResizeObserver === 'undefined') return
  sizes = new ResizeObserver(() => {
    const room = el.parentElement?.clientHeight || 0
    if (el.offsetHeight > room) emit('fit', el.offsetHeight)
  })
  sizes.observe(el)
})
onBeforeUnmount(() => sizes?.disconnect())

const boxError = ref('')
const tipo = computed(() => tipoOf(props.widget))
const title = computed(() => props.widget.titulo || '')
const color = computed(() => safeColor(props.widget.vista?.color))
const ink = computed(() => (color.value ? { color: color.value } : undefined))
// A background is a tint over the theme's own surface, so text stays readable
// in light and dark.
const tint = computed(() => {
  const fondo = safeColor(props.widget.vista?.fondo)
  if (!fondo) return undefined
  const layer = `color-mix(in srgb, ${fondo} 16%, transparent)`
  return { backgroundImage: `linear-gradient(${layer}, ${layer})` }
})
const chart = computed(() => {
  const raw = chartFor(props.widget, props.payload)
  if (!raw) return null
  const clean = chartOf({ chart: raw })
  return clean && { ...clean, color: color.value }
})
const rows = computed(() => rowsFor(props.payload))
const customData = computed(() =>
  props.payload?.kind === 'inputs' ? props.payload.inputs || {} : {},
)
</script>
