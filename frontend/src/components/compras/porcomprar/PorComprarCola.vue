<template>
  <!-- Compras › Por comprar: what Muelle proposes to buy, grouped by
       supplier, added to each supplier's draft purchase in place. -->
  <section
    v-if="queue && (queue.on || queue.can_configure)"
    class="space-y-3 px-4 pb-3 sm:px-6"
    :aria-label="__('Proposed purchases', null, 'PorComprar')"
    data-por-comprar
  >
    <!-- Off: the owner's one tile and its switch. -->
    <div
      v-if="!queue.on"
      class="flex min-h-14 items-center gap-3 rounded-7 bg-surface-gray-1 py-1 pl-4 pr-2"
      data-pc-apagado
    >
      <span class="min-w-0 flex-1 text-base font-medium text-ink-gray-9">{{
        __('Muelle proposes what to buy', null, 'PorComprar')
      }}</span>
      <AjustesSwitch
        :model-value="false"
        :disabled="busy.has('switch')"
        :label="__('Muelle proposes what to buy', null, 'PorComprar')"
        data-pc-encender
        @update:model-value="turnOn"
      />
    </div>

    <template v-else>
      <!-- Sort chips, and the legend of each line's numbers. -->
      <div class="flex flex-wrap items-center gap-x-2" data-pc-orden>
        <button
          v-for="chip in sortChips"
          :key="chip.value"
          type="button"
          :class="chipClass(sort === chip.value)"
          :aria-pressed="sort === chip.value"
          :data-pc-sort="chip.value"
          @click="sort = chip.value"
        >
          <span :class="[chip.icon, 'size-4']" aria-hidden="true" />
          {{ chip.label }}
        </button>
        <button
          v-if="queue.can_configure"
          type="button"
          class="press -mr-2 ml-auto flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          :aria-label="__('Settings', null, 'PorComprar')"
          :title="__('Settings', null, 'PorComprar')"
          data-pc-ajustes
          @click="openAjustes()"
        >
          <span class="lucide-settings size-5" aria-hidden="true" />
        </button>
      </div>

      <div
        v-if="queue.reason"
        role="alert"
        class="flex items-center gap-3 rounded-7 bg-surface-amber-1 px-4 py-3 text-base text-ink-amber-8"
        data-pc-razon
      >
        <span
          class="lucide-triangle-alert size-5 flex-none"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1">{{ queue.reason }}</span>
      </div>

      <div
        v-else-if="!blocks.length && !search"
        class="flex min-h-14 items-center gap-3 rounded-7 bg-surface-gray-1 px-4 text-base text-ink-gray-8"
        data-pc-cubierto
      >
        <span
          class="lucide-circle-check size-5 flex-none text-ink-green-6"
          aria-hidden="true"
        />
        {{ __('Everything is covered', null, 'PorComprar') }}
      </div>

      <div
        v-if="problem"
        role="alert"
        class="flex flex-wrap items-center gap-2 rounded-7 bg-surface-red-1 px-4 py-3 text-base text-ink-red-7"
        data-pc-problema
      >
        <span class="min-w-0 flex-1"
          ><strong>{{ problem.title }}.</strong> {{ problem.detail }}</span
        >
        <button
          v-if="problem.again"
          type="button"
          class="press inline-flex h-10 items-center rounded-full px-4 text-sm font-medium hover:bg-surface-red-2"
          @click="problem.again()"
        >
          {{ __('Try again', null, 'PorComprar') }}
        </button>
      </div>

      <!-- One tonal group per supplier: its header, then its products. -->
      <section
        v-for="(block, index) in blocks"
        :key="block.key"
        class="space-y-0.5 overflow-hidden rounded-7"
        :aria-label="block.label || __('No supplier', null, 'PorComprar')"
        :data-pc-bloque="block.supplier || 'sin-proveedor'"
      >
        <header
          class="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 bg-surface-gray-1 py-2 pl-3 pr-2"
        >
          <span
            class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-3 text-sm font-semibold text-ink-gray-8"
            aria-hidden="true"
            >{{ block.supplier ? initials(block.label) : '?' }}</span
          >
          <span class="min-w-0 flex-1 basis-40">
            <span
              class="block break-words text-base font-semibold text-ink-gray-9"
              >{{
                block.supplier
                  ? block.label
                  : __('No supplier', null, 'PorComprar')
              }}</span
            >
            <span
              class="flex flex-wrap items-center gap-x-2 text-sm text-ink-gray-7"
            >
              <template v-if="!block.supplier">{{
                productsText(block.entries.length)
              }}</template>
              <template v-else>
                <span v-if="block.draft" data-pc-borrador>{{
                  __(
                    'Draft · {0} of {1}',
                    [block.added, block.total],
                    'PorComprar',
                  )
                }}</span>
                <span
                  v-if="block.amount !== null"
                  class="num font-medium tabular-nums text-ink-gray-8"
                  data-pc-importe
                  >{{ money(block.amount, block.currency) }}</span
                >
                <DiasStepper
                  v-if="leadOpen === block.supplier"
                  :model-value="leadDays(block)"
                  :large="false"
                  :max="365"
                  :label="__('Delivery days', null, 'PorComprar')"
                  data-pc-entrega-editar
                  @update:model-value="setLead(block, $event)"
                />
                <button
                  v-else-if="queue.can_configure"
                  type="button"
                  class="press -mx-2 inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-ink-gray-7 hover:bg-surface-gray-2"
                  :aria-label="
                    __(
                      'Delivery days: {0}',
                      [daysText(leadDays(block))],
                      'PorComprar',
                    )
                  "
                  data-pc-entrega
                  @click="leadOpen = block.supplier"
                >
                  <span class="lucide-truck size-4" aria-hidden="true" />
                  {{ daysText(leadDays(block)) }}
                </button>
                <span
                  v-else
                  class="inline-flex items-center gap-1"
                  data-pc-entrega
                >
                  <span class="lucide-truck size-4" aria-hidden="true" />
                  {{ daysText(leadDays(block)) }}
                </span>
              </template>
            </span>
          </span>
          <button
            v-if="block.draft"
            type="button"
            :class="['press', index === 0 ? BTN.filled : BTN.tonal]"
            data-pc-revisar
            @click="review(block)"
          >
            {{ __('Review', null, 'PorComprar') }}
          </button>
          <button
            v-else-if="block.supplier && queue.can_add && block.open.length"
            type="button"
            :class="['press', index === 0 ? BTN.filled : BTN.tonal]"
            :disabled="busy.has(`block:${block.supplier}`)"
            data-pc-agregar
            @click="addBlock(block)"
          >
            <span
              :class="[
                busy.has(`block:${block.supplier}`)
                  ? 'lucide-loader-circle animate-spin'
                  : 'lucide-plus',
                'size-4',
              ]"
              aria-hidden="true"
            />
            {{ __('Add {0}', [block.open.length], 'PorComprar') }}
          </button>
        </header>

        <div
          v-if="wide"
          class="pc-fila bg-surface-gray-1 px-4 py-1.5 text-xs font-medium text-ink-gray-6"
          aria-hidden="true"
        >
          <span>{{ __('Product', null, 'PorComprar') }}</span>
          <span>{{ __('Lasts', null, 'PorComprar') }}</span>
          <span class="text-right">{{ soldLabel }}</span>
          <span class="text-right">{{ __('Left', null, 'PorComprar') }}</span>
          <span class="text-right">{{ __('Coming', null, 'PorComprar') }}</span>
          <span class="text-center">{{
            __('Quantity', null, 'PorComprar')
          }}</span>
          <span />
          <span v-if="!queue.quantities_only" class="text-right">{{
            __('Price', null, 'PorComprar')
          }}</span>
          <span v-else />
        </div>

        <PorComprarLinea
          v-for="entry in block.entries"
          :key="entry.line.item"
          :entry="entry"
          :quantity="qtyOf(entry)"
          :wide="wide"
          :can-add="Boolean(queue.can_add)"
          :busy="
            busy.has(`line:${entry.line.item}`) ||
            busy.has(`hide:${entry.line.item}`) ||
            busy.has(`show:${entry.line.item}`)
          "
          :quantities-only="Boolean(queue.quantities_only)"
          :currency="queue.currency || ''"
          :cycle="Number(queue.cycle) || 14"
          :sold-label="soldLabel"
          @set-qty="setQty(entry, $event)"
          @add="addLine(entry)"
          @take-out="takeOut(entry)"
          @open-sheet="openSheet(entry)"
          @hide-for="hideFor(entry.line.struck, $event)"
          @undo="unstrike(entry.line.struck)"
        />
      </section>

      <!-- What was taken off the queue, back with one tap. -->
      <section
        v-if="queue.hidden"
        class="overflow-hidden rounded-7 bg-surface-gray-1"
        data-pc-ocultos
      >
        <button
          type="button"
          class="state-layer flex min-h-14 w-full items-center gap-3 px-4 text-left"
          :aria-expanded="hiddenOpen"
          @click="toggleHidden"
        >
          <span
            class="lucide-eye-off size-5 text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="flex-1 text-base text-ink-gray-9"
            >{{ __('Hidden', null, 'PorComprar') }}
            <span class="num ml-1 font-semibold tabular-nums">{{
              queue.hidden
            }}</span></span
          >
          <span
            :class="[
              hiddenOpen ? 'lucide-chevron-up' : 'lucide-chevron-down',
              'size-5 text-ink-gray-6',
            ]"
            aria-hidden="true"
          />
        </button>
        <ul v-if="hiddenOpen && hiddenRows" class="pb-1">
          <li
            v-for="row in hiddenRows"
            :key="row.item"
            class="flex min-h-12 items-center gap-3 pl-4 pr-2"
            :data-pc-oculto="row.item"
          >
            <span
              class="min-w-0 flex-1 break-words text-base text-ink-gray-8"
              >{{ row.item_name || row.item }}</span
            >
            <span class="flex-none text-sm text-ink-gray-6">{{
              row.always || !row.until
                ? __('Always', null, 'PorComprar')
                : __('Until {0}', [shortDay(row.until)], 'PorComprar')
            }}</span>
            <button
              v-if="queue.can_add"
              type="button"
              class="press flex size-11 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
              :aria-label="
                __('Bring back {0}', [row.item_name || row.item], 'PorComprar')
              "
              :disabled="busy.has(`show:${row.item}`)"
              data-pc-traer
              @click="bringBack(row)"
            >
              <span class="lucide-undo-2 size-5" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>
    </template>

    <ProveedorSheet
      v-model:open="sheet.open"
      :line="sheet.entry?.line || null"
      :picked="sheet.entry?.supplier || ''"
      :suppliers="queue.suppliers || []"
      :currency="queue.currency"
      :quantities-only="Boolean(queue.quantities_only)"
      :locked="Boolean(sheet.entry?.line?.in_draft) || !queue.can_add"
      @pick="pickSupplier"
    />
    <PorComprarAjustes
      v-if="queue.can_configure"
      v-model:open="ajustes.open"
      :turn-on="ajustes.turnOn"
      @saved="settingsSaved"
    />
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { chipClass } from '@/components/ui/chipClass'
import { initials } from '@/components/ui/host'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import {
  money,
  outcomeUnknown,
  problemOf,
  requestId,
} from '@/composables/useCompras'
import DiasStepper from './DiasStepper.vue'
import PorComprarLinea from './PorComprarLinea.vue'
import ProveedorSheet from './ProveedorSheet.vue'
import PorComprarAjustes from './PorComprarAjustes.vue'
import {
  blocksOf,
  daysText,
  draftsShown,
  lineQty,
  pcApi,
  proposedCount,
  putLines,
  shortDay,
} from './porComprar'

const props = defineProps({
  search: { type: String, default: '' },
  wide: { type: Boolean, default: false },
})
const emit = defineEmits(['drafts', 'count', 'on'])

const route = useRoute()
const router = useRouter()
const BTN = Object.freeze({
  filled:
    'ml-auto inline-flex h-10 flex-none items-center gap-1.5 rounded-full bg-surface-gray-10 px-4 text-sm font-medium text-ink-base hover:bg-surface-gray-9 disabled:opacity-50',
  tonal:
    'ml-auto inline-flex h-10 flex-none items-center gap-1.5 rounded-full bg-[var(--muelle-secondary-container)] px-4 text-sm font-medium text-[var(--muelle-on-secondary-container)] disabled:opacity-50',
})
const SAVE_AFTER_MS = 600

const queue = ref(null)
const problem = ref(null)
const sort = ref('alcanza')
const picks = reactive({})
const typed = reactive({})
const struck = ref([])
const busy = reactive(new Set())
const leadOpen = ref('')
const leadTyped = reactive({})
const hiddenOpen = ref(false)
const hiddenRows = ref(null)
const sheet = reactive({ open: false, entry: null })
const ajustes = reactive({ open: false, turnOn: false })
// One request id per pending write: asking again after a lost answer reuses it.
const pending = {}
const timers = {}

const soldLabel = computed(() =>
  __('Sold {0} wk', [queue.value?.weeks || 8], 'PorComprar'),
)
const sortChips = computed(() => [
  {
    value: 'alcanza',
    label: __('Lasts', null, 'PorComprar'),
    icon: 'lucide-hourglass',
  },
  { value: 'vendido', label: soldLabel.value, icon: 'lucide-shopping-bag' },
  {
    value: 'quedan',
    label: __('Left', null, 'PorComprar'),
    icon: 'lucide-package',
  },
])
const blocks = computed(() =>
  blocksOf(queue.value, {
    picks,
    typed,
    struck: struck.value,
    sort: sort.value,
    search: props.search,
  }),
)

function productsText(n) {
  return n === 1
    ? __('1 product', null, 'PorComprar')
    : __('{0} products', [n], 'PorComprar')
}
function qtyOf(entry) {
  return lineQty(entry.line, typed)
}
function leadDays(block) {
  return leadTyped[block.supplier] ?? block.lead
}

// ── reads ──────────────────────────────────────────────────────────────────

let reading = 0
async function load() {
  const ticket = ++reading
  try {
    const data = await pcApi('queue')
    if (ticket !== reading) return
    queue.value = data
    // what the server now holds needs no typed number of its own
    for (const line of data?.lines || [])
      if (
        line.in_draft &&
        !timers[line.item] &&
        Number(line.in_draft.qty) === typed[line.item]
      )
        delete typed[line.item]
    if (hiddenOpen.value) loadHidden()
  } catch (error) {
    if (ticket !== reading) return
    problem.value = { ...problemOf(error), again: retryRead }
  }
}
function retryRead() {
  problem.value = null
  load()
}
async function loadHidden() {
  try {
    hiddenRows.value = (await pcApi('hidden'))?.rows || []
  } catch (error) {
    problem.value = { ...problemOf(error), again: loadHidden }
  }
}
function onVisible() {
  if (document.visibilityState === 'visible') load()
}

watch(
  queue,
  (data) => {
    emit('on', Boolean(data?.on))
    emit('count', proposedCount(data))
    emit('drafts', draftsShown(data))
  },
  { immediate: true },
)

// ── writes ─────────────────────────────────────────────────────────────────

async function write(key, run, again) {
  pending[key] ||= requestId()
  busy.add(key)
  problem.value = null
  try {
    const result = await run(pending[key])
    delete pending[key]
    return result ?? true
  } catch (error) {
    if (!outcomeUnknown(error)) delete pending[key]
    problem.value = { ...problemOf(error), again }
    return null
  } finally {
    busy.delete(key)
  }
}

function put(key, supplier, lines, again) {
  return write(
    key,
    (request_id) => putLines({ request_id, supplier, lines }),
    again,
  )
}

async function addLine(entry) {
  const { line, supplier } = entry
  const done = await put(
    `line:${line.item}`,
    supplier,
    [{ item: line.item, qty: qtyOf(entry) }],
    () => addLine(entry),
  )
  if (!done) return
  delete picks[line.item]
  await load()
}

async function addBlock(block) {
  const lines = block.open.map((e) => ({ item: e.line.item, qty: qtyOf(e) }))
  const done = await put(`block:${block.supplier}`, block.supplier, lines, () =>
    addBlock(block),
  )
  if (!done) return
  for (const e of block.open) delete picks[e.line.item]
  await load()
}

async function takeOut(entry) {
  const { line, supplier } = entry
  const done = await put(
    `line:${line.item}`,
    supplier,
    [{ item: line.item, qty: 0 }],
    () => takeOut(entry),
  )
  if (!done) return
  delete typed[line.item]
  await load()
}

function setQty(entry, value) {
  const n = Math.max(0, Math.round(Number(value) || 0))
  const { line } = entry
  if (!n) return strike(entry)
  typed[line.item] = n
  if (!line.in_draft) return
  // an added line saves its new quantity once the taps stop
  clearTimeout(timers[line.item])
  timers[line.item] = setTimeout(async () => {
    delete timers[line.item]
    const done = await put(
      `line:${line.item}`,
      entry.supplier,
      [{ item: line.item, qty: typed[line.item] }],
      () => setQty(entry, typed[line.item]),
    )
    if (done) await load()
  }, SAVE_AFTER_MS)
}

/** Stepped to 0: off the queue for «Pedido cada» days, in place, with undo. */
async function strike(entry) {
  const { line, rank, supplier } = entry
  if (!queue.value?.can_add) return
  const was = {
    inDraft: Boolean(line.in_draft),
    qty: qtyOf(entry),
    supplier,
  }
  if (was.inDraft) {
    const out = await put(
      `line:${line.item}`,
      supplier,
      [{ item: line.item, qty: 0 }],
      () => strike(entry),
    )
    if (!out) return
  }
  const hidden = await write(
    `hide:${line.item}`,
    () => pcApi('hide', { item: line.item }),
    () => strike(entry),
  )
  if (!hidden) return
  delete typed[line.item]
  clearTimeout(timers[line.item])
  delete timers[line.item]
  struck.value = [
    ...struck.value.filter((s) => s.line.item !== line.item),
    {
      line: { ...line, in_draft: null },
      rank,
      always: Boolean(hidden.always),
      until: hidden.until || null,
      was,
    },
  ]
  await load()
}

async function hideFor(gone, always) {
  if (gone.always === always) return
  const hidden = await write(
    `hide:${gone.line.item}`,
    () => pcApi('hide', { item: gone.line.item, always: always ? 1 : 0 }),
    () => hideFor(gone, always),
  )
  if (!hidden) return
  struck.value = struck.value.map((s) =>
    s.line.item === gone.line.item
      ? { ...s, always: Boolean(hidden.always), until: hidden.until || null }
      : s,
  )
}

async function unstrike(gone) {
  const item = gone.line.item
  const shown = await write(
    `show:${item}`,
    () => pcApi('show', { item }),
    () => unstrike(gone),
  )
  if (!shown) return
  struck.value = struck.value.filter((s) => s.line.item !== item)
  if (gone.was.inDraft && gone.was.supplier)
    await put(`line:${item}`, gone.was.supplier, [{ item, qty: gone.was.qty }])
  await load()
}

async function bringBack(row) {
  const shown = await write(
    `show:${row.item}`,
    () => pcApi('show', { item: row.item }),
    () => bringBack(row),
  )
  if (!shown) return
  struck.value = struck.value.filter((s) => s.line.item !== row.item)
  await load()
  await loadHidden()
}

function toggleHidden() {
  hiddenOpen.value = !hiddenOpen.value
  if (hiddenOpen.value) loadHidden()
}

function setLead(block, days) {
  const supplier = block.supplier
  leadTyped[supplier] = Math.max(0, Math.min(365, days))
  clearTimeout(timers[`lead:${supplier}`])
  timers[`lead:${supplier}`] = setTimeout(async () => {
    delete timers[`lead:${supplier}`]
    const done = await write(
      `lead:${supplier}`,
      () => pcApi('lead', { supplier, days: leadTyped[supplier] }),
      () => setLead(block, leadTyped[supplier]),
    )
    if (!done) return
    await load()
    delete leadTyped[supplier]
  }, SAVE_AFTER_MS)
}

function openSheet(entry) {
  sheet.entry = entry
  sheet.open = true
}
function pickSupplier(supplier) {
  const line = sheet.entry?.line
  sheet.open = false
  if (!line || line.in_draft) return
  if (supplier === line.supplier) delete picks[line.item]
  else picks[line.item] = supplier
}

function review(block) {
  router.push({
    name: 'CompraOrden',
    params: { name: block.draft.order },
    query: { list: route.fullPath },
  })
}

function openAjustes({ turnOn = false } = {}) {
  Object.assign(ajustes, { open: true, turnOn })
}
async function turnOn() {
  if (queue.value?.needs_receive_at) return openAjustes({ turnOn: true })
  const done = await write(
    'switch',
    () => pcApi('save_settings', { on: 1 }),
    turnOn,
  )
  if (done) await load()
}
async function settingsSaved() {
  ajustes.open = false
  await load()
}

onMounted(() => {
  load()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  for (const timer of Object.values(timers)) clearTimeout(timer)
})

defineExpose({ load })
</script>

<style scoped>
/* The desktop table of a block: product, lasts, sold, left, coming,
   quantity, add, price. Scoped: keeps the global sheet in budget. */
.pc-fila {
  display: grid;
  grid-template-columns:
    minmax(0, 2.4fr) 6.5rem 5.5rem 4.5rem 4.5rem 7.5rem 3rem
    minmax(9rem, 1.2fr);
  column-gap: 0.75rem;
  align-items: center;
}
</style>
