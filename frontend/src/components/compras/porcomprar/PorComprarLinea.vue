<template>
  <!-- One proposed product: its name, how long it lasts, what sold, what is
       left and coming, the quantity, the add (a ring check once it is in the
       purchase) and the supplier's price, which opens the supplier sheet. -->
  <div class="bg-surface-gray-1" :data-pc-linea="line.item">
    <!-- Taken off the queue on this screen: for some days or for good. -->
    <div
      v-if="line.struck"
      class="flex min-h-14 flex-wrap items-center gap-x-2 py-1 pl-4 pr-2"
      data-pc-oculta
    >
      <span
        class="lucide-eye-off size-4 flex-none text-ink-gray-5"
        aria-hidden="true"
      />
      <span
        class="min-w-0 flex-1 basis-40 break-words text-base text-ink-gray-6 line-through"
        >{{ line.item_name }}</span
      >
      <span class="ml-auto flex flex-none items-center gap-x-2">
        <button
          type="button"
          :class="chipClass(!line.struck.always)"
          :aria-pressed="!line.struck.always"
          :disabled="busy"
          data-pc-ocultar-dias
          @click="emit('hide-for', false)"
        >
          {{ daysText(cycle) }}
        </button>
        <button
          type="button"
          :class="chipClass(line.struck.always)"
          :aria-pressed="line.struck.always"
          :disabled="busy"
          data-pc-ocultar-siempre
          @click="emit('hide-for', true)"
        >
          {{ __('Always', null, 'PorComprar') }}
        </button>
        <button
          type="button"
          class="press flex size-11 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
          :aria-label="__('Undo', null, 'PorComprar')"
          :disabled="busy"
          data-pc-deshacer
          @click="emit('undo')"
        >
          <span class="lucide-undo-2 size-5" aria-hidden="true" />
        </button>
      </span>
    </div>

    <div v-else-if="wide" class="pc-fila min-h-14 px-4 py-1.5">
      <span class="min-w-0 break-words text-base text-ink-gray-9">{{
        line.item_name
      }}</span>
      <span>
        <span
          v-if="pill"
          :class="[PILL, pill.kind === 'agotado' ? PILL_OUT : PILL_SOFT]"
          :data-pc-pill="pill.kind"
          ><span
            v-if="pill.kind === 'dias'"
            class="lucide-hourglass size-3.5"
            aria-hidden="true"
          />{{ pill.label }}</span
        >
      </span>
      <span class="num text-right tabular-nums">{{ qty(line.sold) }}</span>
      <span class="num text-right tabular-nums">{{ qty(line.on_hand) }}</span>
      <span class="num text-right tabular-nums text-ink-gray-7">{{
        Number(line.on_way) ? qty(line.on_way) : ''
      }}</span>
      <span class="flex justify-center">
        <ListaStepper
          :qty="quantity"
          :disabled="!canAdd"
          :label="__('Quantity of {0}', [line.item_name], 'PorComprar')"
          @step="emit('set-qty', quantity + $event)"
          @set="emit('set-qty', $event)"
        />
      </span>
      <span class="flex justify-center">
        <button
          type="button"
          :class="addClass"
          :disabled="!canAdd || !ready || busy"
          :aria-pressed="String(added)"
          :aria-label="addLabel"
          :data-pc-linea-agregar="added ? 'agregada' : 'no'"
          @click="emit(added ? 'take-out' : 'add')"
        >
          <span :class="[addIcon, 'size-5']" aria-hidden="true" />
        </button>
      </span>
      <span class="flex justify-end">
        <button
          v-if="!supplier"
          type="button"
          :class="[chipClass(false), 'gap-1']"
          data-pc-proveedor
          @click="emit('open-sheet')"
        >
          {{ __('Supplier', null, 'PorComprar') }}
          <span class="lucide-chevron-down size-4" aria-hidden="true" />
        </button>
        <button
          v-else
          type="button"
          :class="PRICE_BUTTON"
          :aria-label="
            __('Supplier and price of {0}', [line.item_name], 'PorComprar')
          "
          data-pc-precio-abrir
          @click="emit('open-sheet')"
        >
          <template v-if="!quantitiesOnly">
            <span
              v-if="price === null"
              class="text-ink-gray-6"
              data-pc-sin-precio
              >{{ __('No price', null, 'PorComprar') }}</span
            >
            <template v-else>
              <span
                class="num font-semibold tabular-nums text-ink-gray-9"
                data-pc-precio
                >{{ priceText(price, offer.price_currency || currency) }}</span
              >
              <span
                v-if="offer.price_date"
                class="inline-flex items-center gap-0.5"
                :class="
                  offer.price_stale ? 'text-ink-amber-7' : 'text-ink-gray-6'
                "
                :data-pc-fecha="offer.price_stale ? 'vieja' : 'reciente'"
                ><span
                  v-if="offer.price_stale"
                  class="lucide-clock size-3.5"
                  aria-hidden="true"
                />{{ shortDay(offer.price_date) }}</span
              >
            </template>
          </template>
          <span
            class="lucide-chevron-down size-4 text-ink-gray-6"
            aria-hidden="true"
          />
        </button>
      </span>
    </div>

    <div v-else class="px-4 py-3">
      <!-- On a narrow phone the name takes its own line above the controls. -->
      <div class="flex flex-wrap items-start gap-x-2 gap-y-1">
        <span
          class="min-w-0 flex-1 basis-40 break-words pt-2.5 text-base text-ink-gray-9"
          >{{ line.item_name }}</span
        >
        <span class="ml-auto flex flex-none items-center gap-2">
          <ListaStepper
            :qty="quantity"
            large
            :disabled="!canAdd"
            :label="__('Quantity of {0}', [line.item_name], 'PorComprar')"
            @step="emit('set-qty', quantity + $event)"
            @set="emit('set-qty', $event)"
          />
          <button
            type="button"
            :class="addClass"
            :disabled="!canAdd || !ready || busy"
            :aria-pressed="String(added)"
            :aria-label="addLabel"
            :data-pc-linea-agregar="added ? 'agregada' : 'no'"
            @click="emit(added ? 'take-out' : 'add')"
          >
            <span :class="[addIcon, 'size-5']" aria-hidden="true" />
          </button>
        </span>
      </div>
      <div
        class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-gray-8"
      >
        <span
          v-if="pill"
          :class="[PILL, pill.kind === 'agotado' ? PILL_OUT : PILL_SOFT]"
          :data-pc-pill="pill.kind"
          ><span
            v-if="pill.kind === 'dias'"
            class="lucide-hourglass size-3.5"
            aria-hidden="true"
          />{{ pill.label }}</span
        >
        <span
          class="inline-flex items-center gap-1"
          :title="soldLabel"
          data-pc-vendido
        >
          <span
            class="lucide-shopping-bag size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="num tabular-nums">{{ qty(line.sold) }}</span>
        </span>
        <span
          class="inline-flex items-center gap-1"
          :title="__('Left', null, 'PorComprar')"
          data-pc-quedan
        >
          <span
            class="lucide-package size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="num tabular-nums">{{ qty(line.on_hand) }}</span>
        </span>
        <span
          v-if="Number(line.on_way)"
          class="inline-flex items-center gap-1"
          :title="__('Coming', null, 'PorComprar')"
          data-pc-en-camino
        >
          <span
            class="lucide-truck size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="num tabular-nums">{{ qty(line.on_way) }}</span>
        </span>
        <span class="ml-auto">
          <button
            v-if="!supplier"
            type="button"
            :class="[chipClass(false), 'gap-1']"
            data-pc-proveedor
            @click="emit('open-sheet')"
          >
            {{ __('Supplier', null, 'PorComprar') }}
            <span class="lucide-chevron-down size-4" aria-hidden="true" />
          </button>
          <button
            v-else
            type="button"
            :class="PRICE_BUTTON"
            :aria-label="
              __('Supplier and price of {0}', [line.item_name], 'PorComprar')
            "
            data-pc-precio-abrir
            @click="emit('open-sheet')"
          >
            <template v-if="!quantitiesOnly">
              <span
                v-if="price === null"
                class="text-ink-gray-6"
                data-pc-sin-precio
                >{{ __('No price', null, 'PorComprar') }}</span
              >
              <template v-else>
                <span
                  class="num font-semibold tabular-nums text-ink-gray-9"
                  data-pc-precio
                  >{{
                    priceText(price, offer.price_currency || currency)
                  }}</span
                >
                <span
                  v-if="offer.price_date"
                  class="inline-flex items-center gap-0.5"
                  :class="
                    offer.price_stale ? 'text-ink-amber-7' : 'text-ink-gray-6'
                  "
                  :data-pc-fecha="offer.price_stale ? 'vieja' : 'reciente'"
                  ><span
                    v-if="offer.price_stale"
                    class="lucide-clock size-3.5"
                    aria-hidden="true"
                  />{{ shortDay(offer.price_date) }}</span
                >
              </template>
            </template>
            <span
              class="lucide-chevron-down size-4 text-ink-gray-6"
              aria-hidden="true"
            />
          </button>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { chipClass } from '@/components/ui/chipClass'
import ListaStepper from '@/components/compras/lista/ListaStepper.vue'
import { qty } from '@/composables/useCompras'
import { daysText, pillOf, priceText, shortDay, unitPrice } from './porComprar'

const props = defineProps({
  // { line, offer, supplier } from blocksOf
  entry: { type: Object, required: true },
  quantity: { type: Number, default: 0 },
  wide: { type: Boolean, default: false },
  canAdd: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  quantitiesOnly: { type: Boolean, default: false },
  currency: { type: String, default: '' },
  cycle: { type: Number, default: 14 },
  soldLabel: { type: String, default: '' },
})
const emit = defineEmits([
  'set-qty',
  'add',
  'take-out',
  'open-sheet',
  'hide-for',
  'undo',
])

const PILL =
  'inline-flex h-6 items-center gap-1 rounded-full px-2 text-sm font-medium'
const PILL_OUT = 'bg-surface-red-2 text-ink-red-8'
const PILL_SOFT = 'bg-surface-gray-3 text-ink-gray-8'
const PRICE_BUTTON =
  'press -mr-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm hover:bg-surface-gray-2'

const line = computed(() => props.entry.line)
const offer = computed(() => props.entry.offer || {})
const supplier = computed(() => props.entry.supplier)
const pill = computed(() => pillOf(line.value))
const price = computed(() => unitPrice(line.value, props.entry.offer))
const added = computed(() => Boolean(line.value.in_draft))
const ready = computed(
  () => added.value || (Boolean(supplier.value) && props.quantity > 0),
)
const addClass = computed(() => [
  'press flex size-11 flex-none items-center justify-center rounded-full disabled:opacity-40',
  added.value
    ? 'border-2 border-current text-ink-gray-9'
    : 'bg-surface-gray-2 text-ink-gray-9',
])
const addIcon = computed(() =>
  props.busy
    ? 'lucide-loader-circle animate-spin'
    : added.value
      ? 'lucide-check'
      : 'lucide-plus',
)
const addLabel = computed(() =>
  added.value
    ? __('Take {0} out of the purchase', [line.value.item_name], 'PorComprar')
    : __('Add {0}', [line.value.item_name], 'PorComprar'),
)
</script>

<style scoped>
/* The desktop table row: product, lasts, sold, left, coming, quantity, add,
   price (the block's header row in PorComprarCola.vue uses the same grid). */
.pc-fila {
  display: grid;
  grid-template-columns:
    minmax(0, 2.4fr) 6.5rem 5.5rem 4.5rem 4.5rem 7.5rem 3rem
    minmax(9rem, 1.2fr);
  column-gap: 0.75rem;
  align-items: center;
}
</style>
