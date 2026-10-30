<template>
  <!-- One product in Precios: why it asks for a decision, what it costs now
       against when its price was set, and its price per list with the margin
       as you type. «Sigue igual» confirms the price; «Historial» opens the
       purchases over time. Nothing saves until «Revisar y guardar». -->
  <article
    class="min-w-0 rounded-8 border bg-surface-base p-3 sm:p-4"
    :class="[
      selected
        ? 'border-[var(--muelle-accent)] ring-1 ring-[var(--muelle-accent)]'
        : 'border-outline-gray-2',
      result && !result.ok ? 'border-outline-red-2' : '',
    ]"
    :data-precio-row="row.item_code"
  >
    <header class="flex items-start gap-3">
      <label
        v-if="selecting"
        class="press -ml-1 flex size-11 flex-none items-center justify-center"
      >
        <input
          type="checkbox"
          class="size-5 rounded"
          :checked="selected"
          :aria-label="`Seleccionar ${row.item_name}`"
          @change="emit('select', row.item_code)"
        />
      </label>
      <ProductThumb :image="row.image" :title="row.item_name" class="size-11" />
      <div class="min-w-0 flex-1">
        <RouterLink
          :to="{ name: 'Producto', params: { item: row.item_code } }"
          class="line-clamp-2 text-base font-medium leading-snug text-ink-gray-9 hover:underline"
        >
          {{ row.item_name }}
        </RouterLink>
        <p
          class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-gray-6"
        >
          <span
            v-if="chip"
            class="rounded-full px-2 py-0.5 text-xs font-medium"
            :class="CHIP_TONES[chip.tone]"
          >
            {{ chip.label }}
          </span>
          <span v-if="lineText">{{ lineText }}</span>
          <span v-if="stockText">{{ stockText }}</span>
        </p>
      </div>
      <button
        type="button"
        class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
        :aria-label="`Historial de ${row.item_name}`"
        title="Historial de compras y precios"
        @click="emit('history', row.item_code)"
      >
        <span class="lucide-history size-5" aria-hidden="true" />
      </button>
    </header>

    <button
      v-if="costText"
      type="button"
      class="press mt-2 flex w-full items-center gap-3 rounded-6 bg-surface-gray-1 px-3 py-2 text-left"
      :aria-label="`${costText}. Ver historial`"
      @click="emit('history', row.item_code)"
    >
      <span class="num min-w-0 flex-1 text-sm text-ink-gray-8">{{
        costText
      }}</span>
      <svg
        v-if="spark"
        width="64"
        height="20"
        viewBox="0 0 64 20"
        aria-hidden="true"
        class="flex-none"
      >
        <path
          :d="spark"
          fill="none"
          stroke="#ea580c"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </svg>
    </button>

    <p v-if="row.prices_reason" class="mt-2 text-sm text-ink-gray-6">
      {{ plain(row.prices_reason) }}
    </p>

    <div class="mt-3 space-y-3">
      <div
        v-for="cell in cells"
        :key="cell.price_list"
        class="space-y-1.5"
        :data-precio-lista="cell.price_list"
      >
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ink-gray-8">
              {{ cell.price_list }}
            </p>
            <p class="num text-sm text-ink-gray-6">
              <template v-if="cell.rate === null || cell.rate === undefined"
                >Sin precio por {{ unitOf(cell) }}</template
              >
              <template v-else>
                Hoy {{ money(cell.rate, cell.currency || currency) }}
                <template v-if="cell.margin !== null">
                  · margen {{ cell.margin }} %</template
                >
              </template>
            </p>
          </div>
          <label class="relative w-32 flex-none sm:w-36">
            <span class="sr-only"
              >Precio nuevo de {{ row.item_name }} en
              {{ cell.price_list }}</span
            >
            <span
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-ink-gray-5"
              >$</span
            >
            <input
              :value="valueOf(cell)"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              enterkeyhint="next"
              :disabled="!cell.can_write || kept"
              :placeholder="cell.rate ? String(cell.rate) : '0.00'"
              class="num h-11 w-full rounded-6 border bg-surface-base pl-7 pr-3 text-right text-base text-ink-gray-9 placeholder:text-ink-gray-4 disabled:bg-surface-gray-1 disabled:text-ink-gray-5"
              :class="
                cell.check.changed
                  ? 'border-[var(--muelle-accent)]'
                  : cell.invalid
                    ? 'border-outline-red-3'
                    : 'border-outline-gray-2'
              "
              :data-precio-input="cell.price_list"
              @input="
                emit('draft', {
                  code: row.item_code,
                  list: cell.price_list,
                  value: $event.target.value,
                })
              "
            />
          </label>
        </div>
        <p
          v-if="!cell.can_write && cell.blocked_reason"
          class="text-sm text-ink-gray-6"
        >
          {{ plain(cell.blocked_reason) }}
        </p>
        <p v-if="cell.invalid" class="text-sm text-ink-red-7">
          Escribe un precio mayor que cero.
        </p>
        <p v-if="cell.check.changed" class="num text-sm text-ink-gray-8">
          <template v-if="cell.check.first">Primer precio</template>
          <template v-else>
            {{ cell.delta > 0 ? '▲' : '▼' }} {{ Math.abs(cell.delta) }} %
          </template>
          <template v-if="cell.nextMargin !== null">
            · margen {{ cell.nextMargin }} %</template
          >
        </p>
        <button
          v-if="cell.suggestion && !kept"
          type="button"
          class="press inline-flex min-h-9 items-center gap-1.5 rounded-full border border-outline-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-1"
          :title="`El margen que tenía cuando pusiste el precio, con el costo nuevo`"
          @click="
            emit('draft', {
              code: row.item_code,
              list: cell.price_list,
              value: String(cell.suggestion),
            })
          "
        >
          Mantener margen
          <span class="num font-medium text-ink-gray-9">{{
            money(cell.suggestion, cell.currency || currency)
          }}</span>
        </button>
        <label
          v-if="cell.check.needsAck"
          class="flex min-h-11 items-start gap-2 text-sm text-ink-amber-8"
        >
          <input
            type="checkbox"
            class="mt-1"
            :checked="acks.has(cell.key)"
            @change="
              emit('ack', { key: cell.key, value: $event.target.checked })
            "
          />
          <span>{{ ackText(cell, cell.check) }}</span>
        </label>
      </div>
    </div>

    <div
      v-if="result && !result.ok"
      role="alert"
      class="mt-3 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
    >
      <strong>{{ step.title }}.</strong> {{ result.reason }}
      <div class="mt-2 flex flex-wrap gap-2">
        <RouterLink
          v-if="result.kind === 'permission'"
          :to="{
            name: 'Producto',
            params: { item: row.item_code },
            query: { accion: 'precio' },
          }"
          class="press inline-flex min-h-9 items-center rounded-6 bg-surface-base px-3 font-medium text-ink-gray-9"
        >
          {{ step.action }}
        </RouterLink>
        <button
          type="button"
          class="press inline-flex min-h-9 items-center rounded-6 bg-surface-base px-3 font-medium text-ink-gray-9"
          @click="emit('discard', row.item_code)"
        >
          Quitar mi cambio
        </button>
      </div>
    </div>
    <p
      v-else-if="result?.ok"
      class="mt-3 text-sm text-ink-green-8"
      role="status"
    >
      {{
        result.kept ? 'Confirmado: el precio sigue igual.' : 'Precio guardado.'
      }}
    </p>

    <footer
      v-if="canKeep"
      class="mt-3 flex items-center gap-2 border-t border-outline-gray-1 pt-3"
    >
      <button
        type="button"
        :class="[chipClass(kept), 'press']"
        :aria-pressed="kept"
        title="Marca que revisaste el precio y lo dejas como está"
        @click="emit('keep', { code: row.item_code, value: !kept })"
      >
        <span class="lucide-check size-4 flex-none" aria-hidden="true" />
        Sigue igual
      </button>
      <span v-if="kept" class="text-sm text-ink-gray-6"
        >Se confirma al guardar.</span
      >
    </footer>
  </article>
</template>
<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { chipClass } from '@/components/ui'
import ProductThumb from '@/components/productos/ProductThumb.vue'
import { plain } from '@/composables/useProductos'
import {
  ackText,
  changePct,
  costFor,
  costLine,
  draftCheck,
  draftKey,
  keepMarginPrice,
  marginPct,
  money,
  refusalStep,
  signalChip,
  sparkPath,
} from '@/composables/usePrecios'

const props = defineProps({
  row: { type: Object, required: true },
  /** The lists shown, the active one first. */
  lists: { type: Array, default: () => [] },
  currency: { type: String, default: 'MXN' },
  /** Map key → { code, list, value }. */
  drafts: { type: Object, required: true },
  acks: { type: Object, required: true },
  kept: { type: Boolean, default: false },
  selecting: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  rounding: { type: String, default: 'centavos' },
  /** The last save's answer for this product, if any. */
  result: { type: Object, default: null },
})
const emit = defineEmits([
  'draft',
  'keep',
  'ack',
  'history',
  'select',
  'discard',
])

const CHIP_TONES = {
  warning: 'bg-surface-amber-1 text-ink-amber-8',
  success: 'bg-surface-green-1 text-ink-green-8',
  info: 'bg-surface-gray-2 text-ink-gray-8',
}

const chip = computed(() => signalChip(props.row))
const step = computed(() => refusalStep(props.result))
const active = computed(() => props.row.prices?.[props.lists[0]] || null)
const costText = computed(() =>
  costLine(props.row, active.value, props.currency),
)
const spark = computed(() => sparkPath(props.row.cost?.spark || []))
const stockText = computed(() => {
  const qty = props.row.stock
  if (qty === null || qty === undefined) return ''
  if (qty <= 0) return 'Sin existencia'
  return `${Number(qty).toLocaleString(undefined, { maximumFractionDigits: 2 })} en existencia`
})
const lineText = computed(() => {
  const line = props.row.line
  if (!line) return ''
  const qty = Number(line.qty || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })
  if (line.kind === 'venta' && line.sold_at)
    return `Se vendieron ${qty} a ${money(line.sold_at, props.currency)}`
  return line.kind === 'compra' ? `Llegaron ${qty}` : `${qty} en el documento`
})

function valueOf(cell) {
  return props.drafts.get(cell.key)?.value ?? ''
}
function unitOf(cell) {
  return cell?.uom || props.row.stock_uom || ''
}
const toNumber = (value) => Number(String(value ?? '').replace(',', '.'))

const cells = computed(() =>
  props.lists
    .map((list) => props.row.prices?.[list])
    .filter(Boolean)
    .map((cell) => {
      const key = draftKey(props.row.item_code, cell.price_list)
      const raw = props.drafts.get(key)?.value ?? ''
      const value = raw === '' ? '' : toNumber(raw)
      const check = raw === '' ? { changed: false } : draftCheck(cell, value)
      const cost = costFor(props.row, cell)
      const suggestion = keepMarginPrice(props.row, cell, props.rounding)
      return {
        ...cell,
        key,
        check,
        invalid: raw !== '' && !check.valid,
        margin: marginPct(cell.rate, cost),
        nextMargin: check.changed ? marginPct(value, cost) : null,
        delta: check.changed ? changePct(value, cell.rate) : null,
        suggestion:
          suggestion &&
          cell.can_write &&
          Math.abs(suggestion - toNumber(raw || 0)) > 1e-9
            ? suggestion
            : null,
      }
    }),
)
const canKeep = computed(() =>
  cells.value.some(
    (cell) => cell.can_write && cell.rate !== null && cell.rate !== undefined,
  ),
)
</script>
