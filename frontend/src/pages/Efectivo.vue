<template>
  <!-- Efectivo (Shell-S14): the cash of the store's safes and who holds it.
       What waits on this worker first, then the safes with their balance,
       the bags by state, traslados, arqueos and change requests. Every step
       is POS Awesome's custody command; this page only reads and asks. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-efectivo
  >
    <AppBar
      title="Efectivo"
      context="Dinero"
      :count="waitingRows.length || undefined"
      :scopes="safeScopes"
      :scope="scope"
      scope-title="Caja fuerte"
      searchable
      :search="search"
      :search-open="searchOpen"
      search-label="Buscar sello, persona o importe"
      :selectable="selectable"
      select-label="Seleccionar bolsas"
      :selecting="selecting"
      :selected-count="selected.size"
      @update:scope="pickScope"
      @update:search="(v) => (search = v)"
      @update:search-open="(v) => (searchOpen = v)"
      @start-select="selecting = true"
      @select-all="selectShown"
      @clear-selection="clearSelection"
    />

    <div class="mx-auto w-full max-w-3xl flex-1 lg:max-w-6xl">
      <div
        v-if="loadError"
        role="alert"
        class="mx-4 my-3 space-y-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
      >
        <p>{{ loadError }}</p>
        <Button label="Reintentar" @click="load()" />
      </div>
      <div
        v-else-if="!data"
        role="status"
        aria-label="Cargando efectivo…"
        class="space-y-3 px-4 py-4"
      >
        <div class="h-28 animate-pulse rounded-7 bg-surface-gray-2" />
        <div
          v-for="n in 4"
          :key="n"
          class="h-16 animate-pulse rounded-7 bg-surface-gray-2"
        />
      </div>
      <template v-else>
        <EmptyState
          v-if="!safes.length && !stores.length"
          class="py-10"
          state="empty"
          title="Sin cajas fuertes a tu cargo"
          message="Cuando el encargado te dé acceso a la caja fuerte de tu tienda, aquí ves sus bolsas y lo que te toca."
        />

        <!-- Phone: one column in the order below (order-N). Desk: the cash and
             the safes on the left, the work (Te toca, bags, traslados) on the right. -->
        <div
          class="flex flex-col lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-x-6"
        >
          <div class="contents lg:block">
            <!-- Hero: the cash this worker answers for and where it sits. -->
            <CashMap v-if="cash" class="order-1" :map="cash" @pick="pickPart" />
            <p
              v-else-if="safes.length"
              class="order-1 mx-4 mt-2 rounded-8 bg-surface-gray-1 p-4 text-sm text-ink-gray-7"
            >
              Los saldos de la caja fuerte los ve quien la cuida. Aquí ves tus
              bolsas y quién las tiene.
            </p>

            <!-- The safes: balance and the island of what the safe itself needs. -->
            <section
              v-if="
                visibleSafes.length > 1 ||
                (visibleSafes[0] &&
                  (visibleSafes[0].can.count_safe || visibleSafes[0].can.fund))
              "
              class="order-3 mt-5"
              aria-label="Cajas fuertes"
            >
              <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-8">
                Cajas fuertes
              </h2>
              <ul class="space-y-2 px-4">
                <li
                  v-for="safe in visibleSafes"
                  :key="safe.safe"
                  class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-7 border border-outline-gray-1 px-4 py-3"
                  :data-safe="safe.safe"
                >
                  <span
                    class="lucide-vault size-6 flex-none text-ink-gray-6"
                    aria-hidden="true"
                  />
                  <div class="min-w-24 flex-1">
                    <p class="truncate text-base font-medium text-ink-gray-9">
                      {{ safe.title }}
                    </p>
                    <p class="truncate text-sm text-ink-gray-6">
                      {{ safeLine(safe) }}
                    </p>
                  </div>
                  <span
                    v-if="safe.balance !== null"
                    class="num text-base font-semibold text-ink-gray-9"
                    >{{ money(safe.balance, safe.currency) }}</span
                  >
                  <div
                    v-if="safe.can.count_safe || safe.can.fund"
                    class="ml-auto flex flex-none rounded-full bg-surface-gray-1 p-0.5"
                  >
                    <button
                      v-if="safe.can.fund"
                      type="button"
                      class="press grid size-10 place-items-center rounded-full text-ink-gray-7"
                      :aria-label="`Ingresar efectivo a ${safe.title}`"
                      title="Ingresar efectivo"
                      data-efectivo-fund
                      @click="open(fundSafe(safe))"
                    >
                      <span
                        class="lucide-hand-coins size-5"
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      v-if="safe.can.count_safe"
                      type="button"
                      class="press grid size-10 place-items-center rounded-full text-ink-gray-7"
                      :aria-label="`Contar ${safe.title}`"
                      title="Contar la caja fuerte"
                      @click="open(countSafe(safe))"
                    >
                      <span
                        class="lucide-calculator size-5"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </li>
              </ul>
            </section>

            <!-- Cajas: each store's registers, managed on their own page. -->
            <section
              v-if="stores.length"
              class="order-4 mt-5"
              aria-label="Cajas"
              data-efectivo-cajas
            >
              <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-8">
                Cajas
              </h2>
              <ul class="divide-y divide-outline-gray-1">
                <li v-for="store in stores" :key="store.name">
                  <ListRow
                    :title="store.store_name"
                    :subtitle="storeLine(store)"
                    :subtitle-tone="store.attention ? 'danger' : ''"
                    icon="lucide-store"
                    :to="{
                      name: 'EfectivoCajas',
                      query: { tienda: store.name },
                    }"
                  >
                    <template #trailing>
                      <span
                        class="num text-base font-semibold text-ink-gray-9"
                        >{{ store.registers }}</span
                      >
                    </template>
                  </ListRow>
                </li>
              </ul>
            </section>

            <!-- Arqueos: recent safe counts and every count still waiting for review. -->
            <section
              v-if="arqueos.length"
              class="order-7 mt-5"
              aria-label="Arqueos"
            >
              <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-8">
                Arqueos
              </h2>
              <ul class="divide-y divide-outline-gray-1">
                <li v-for="c in arqueos" :key="c.name">
                  <ListRow
                    :title="countTitle(c)"
                    :subtitle="`${who(c.counted_by, people)} · ${formatDateTime(c.modified)}`"
                    :subtitle-tone="c.state === 'Exception' ? 'danger' : ''"
                    icon="lucide-calculator"
                    :to="
                      c.bag
                        ? { name: 'EfectivoBolsa', params: { name: c.bag } }
                        : null
                    "
                    @click="
                      !c.bag &&
                        c.state === 'Exception' &&
                        c._safe.can.review &&
                        open(reviewCount(c, c._safe, people))
                    "
                  >
                    <template #trailing>
                      <div class="flex flex-col items-end">
                        <span
                          class="num text-base font-semibold text-ink-gray-9"
                          >{{ money(c.amount, c._safe.currency) }}</span
                        >
                        <span
                          v-if="c.state === 'Exception' && c.difference"
                          class="num text-sm text-ink-red-7"
                          >{{ signed(c.difference, c._safe.currency) }}</span
                        >
                      </div>
                    </template>
                  </ListRow>
                </li>
              </ul>
            </section>
          </div>

          <div class="contents lg:block">
            <!-- Te toca: this worker's next steps, oldest first. -->
            <section
              v-if="waitingRows.length"
              class="order-2 mt-5 lg:mt-2"
              aria-label="Te toca"
              data-efectivo-waiting
            >
              <h2
                class="flex items-baseline gap-2 px-4 pb-1 text-sm font-semibold text-ink-gray-8"
              >
                <span class="num text-ink-gray-9">{{
                  waitingRows.length
                }}</span>
                Te toca
              </h2>
              <ul class="divide-y divide-outline-gray-1">
                <li
                  v-for="row in shownWaiting"
                  :key="row.key"
                  class="flex items-center"
                  :data-waiting="row.action"
                >
                  <ListRow
                    class="min-w-0 flex-1"
                    :title="row.title"
                    :subtitle="row.subtitle"
                    :subtitle-tone="row.urgent ? 'danger' : ''"
                    :icon="row.icon"
                    :to="row.to"
                    @click="row.open && row.open()"
                  >
                    <template #trailing>
                      <span
                        class="num text-base font-semibold text-ink-gray-9"
                        >{{ row.amount }}</span
                      >
                    </template>
                  </ListRow>
                  <button
                    v-if="row.decline"
                    type="button"
                    class="press mr-3 grid size-10 flex-none place-items-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                    aria-label="No dar el cambio"
                    title="No dar el cambio"
                    @click="row.decline()"
                  >
                    <span class="lucide-x size-5" aria-hidden="true" />
                  </button>
                </li>
              </ul>
              <button
                v-if="waitingRows.length > shownWaiting.length"
                type="button"
                class="press mx-4 mt-1 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-ink-gray-8"
                data-efectivo-more
                @click="allWaiting = true"
              >
                Ver los {{ waitingRows.length }}
                <span class="lucide-chevron-down size-4" aria-hidden="true" />
              </button>
            </section>

            <!-- Bags by state. A long press on one starts choosing several. -->
            <section
              v-if="allBags.length"
              ref="bagsSection"
              class="order-5 mt-5 scroll-mt-16"
              aria-label="Bolsas"
              data-efectivo-bags
            >
              <h2 class="px-4 pb-2 text-sm font-semibold text-ink-gray-8">
                Bolsas
              </h2>
              <div class="px-4 pb-2">
                <Segmented
                  v-model="bagView"
                  label="Bolsas"
                  fit="content"
                  :options="bagViews"
                />
              </div>
              <p
                v-if="selecting && otherSafe"
                class="px-4 pb-2 text-sm text-ink-gray-6"
              >
                Eliges bolsas de {{ selectionSafe.title }}. Las de otra caja
                fuerte se manejan aparte.
              </p>
              <TransitionGroup
                :key="bagView"
                tag="ul"
                name="ef-row"
                class="relative divide-y divide-outline-gray-1"
              >
                <li
                  v-for="bag in shownBags"
                  :key="bag.name"
                  class="select-none [-webkit-touch-callout:none]"
                  :class="flash === bag.state ? 'ef-flash' : ''"
                  :data-bag="bag.name"
                  @pointerdown="pressStart($event, bag)"
                  @pointermove="pressMove"
                  @pointerup="pressEnd"
                  @pointercancel="pressEnd"
                  @pointerleave="pressEnd"
                  @click.capture="afterLongPress"
                  @contextmenu="pressMenu"
                >
                  <ListRow
                    :title="bag.seal"
                    :subtitle="bagLine(bag)"
                    :subtitle-tone="bag.state === 'Disputed' ? 'danger' : ''"
                    :to="
                      selecting
                        ? null
                        : { name: 'EfectivoBolsa', params: { name: bag.name } }
                    "
                    :selected="selected.has(bag.name)"
                    :aria-pressed="
                      selecting ? selected.has(bag.name) : undefined
                    "
                    :disabled="selecting && !pickable(bag)"
                    :class="selecting && !pickable(bag) ? 'opacity-50' : ''"
                    @click="selecting && toggle(bag)"
                  >
                    <template #leading>
                      <span
                        class="ef-glyph relative grid size-9 flex-none place-items-center rounded-full"
                        :class="
                          selecting && selected.has(bag.name)
                            ? 'bg-surface-gray-10 text-ink-base'
                            : 'bg-surface-gray-2 text-ink-gray-7'
                        "
                        aria-hidden="true"
                        :data-efectivo-check="selecting || undefined"
                      >
                        <Transition name="ef-pop">
                          <span
                            v-if="selecting && selected.has(bag.name)"
                            class="lucide-check absolute size-5"
                          />
                          <span
                            v-else-if="!selecting"
                            class="lucide-banknote absolute size-5"
                          />
                        </Transition>
                        <span
                          v-if="!selecting"
                          class="ef-dot absolute -bottom-0.5 -right-0.5 size-3 rounded-full"
                          :class="stateDot(bag.state)"
                          :data-state-dot="bag.state"
                        />
                      </span>
                    </template>
                    <template #trailing>
                      <div class="flex flex-col items-end gap-1">
                        <span
                          class="num text-base font-semibold text-ink-gray-9"
                          >{{ money(bag.amount, bag.currency) }}</span
                        >
                        <StatusChip
                          v-if="bag.state === 'Unverified'"
                          label="Falta verificar"
                          tone="warning"
                        />
                        <StatusChip
                          v-else-if="bagView === 'done'"
                          :label="bagState(bag.state).label"
                          tone="neutral"
                        />
                      </div>
                    </template>
                  </ListRow>
                </li>
              </TransitionGroup>
              <p
                v-if="!shownBags.length"
                class="px-4 py-3 text-sm text-ink-gray-6"
              >
                {{ emptyBags }}
              </p>
            </section>

            <!-- Traslados between the safe and the cajas. -->
            <section
              v-if="liveTransfers.length"
              class="order-6 mt-5"
              aria-label="Traslados"
            >
              <h2
                class="flex items-baseline gap-2 px-4 pb-1 text-sm font-semibold text-ink-gray-8"
              >
                <span class="num text-ink-gray-9">{{
                  liveTransfers.length
                }}</span>
                Traslados
              </h2>
              <ul class="divide-y divide-outline-gray-1">
                <li v-for="t in liveTransfers" :key="t.name">
                  <ListRow
                    :title="transferTitle(t)"
                    :subtitle="transferLine(t)"
                    icon="lucide-arrow-left-right"
                    @click="transferStep(t)"
                  >
                    <template #trailing>
                      <span
                        class="num text-base font-semibold text-ink-gray-9"
                        >{{
                          t.amounts_hidden
                            ? ''
                            : money(
                                fromMinor(
                                  t.dispatched_minor !== '0'
                                    ? t.dispatched_minor
                                    : t.declared_minor,
                                ),
                                t.currency,
                              )
                        }}</span
                      >
                    </template>
                  </ListRow>
                </li>
              </ul>
            </section>
          </div>
        </div>
        <div class="h-28 flex-none lg:h-12" aria-hidden="true" />
      </template>
    </div>

    <!-- The selection: how much it holds and what to do with all of it. -->
    <Transition name="ef-bar">
      <PowerBulkBar
        v-if="selected.size"
        :count="selected.size"
        :summary="`${bagsWord(selectedBags.length)} · ${money(selectedTotal, selectionSafe?.currency)}`"
        label="Bolsas elegidas"
        stacked
        :clearable="false"
        data-efectivo-bulk
      >
        <Button
          v-if="mainAction"
          variant="solid"
          class="min-h-12 flex-1 sm:min-h-8 sm:flex-none"
          :label="mainAction.label"
          data-efectivo-bulk-main
          @click="runBulk(mainAction)"
        />
        <Button
          v-if="bulk.length > (mainAction ? 1 : 0)"
          class="min-h-12 sm:min-h-8"
          :class="mainAction ? '' : 'flex-1 sm:flex-none'"
          :label="mainAction ? 'Más' : 'Qué hacer'"
          data-efectivo-bulk-more
          @click="actionsOpen = true"
        >
          <template #prefix>
            <span class="lucide-ellipsis size-4" aria-hidden="true" />
          </template>
        </Button>
      </PowerBulkBar>
    </Transition>
    <BottomSheet
      v-model:open="actionsOpen"
      :title="`Qué hacer con ${bagsWord(selectedBags.length)}`"
      flush
    >
      <ul class="divide-y divide-outline-gray-1" data-efectivo-bulk-actions>
        <li v-for="action in bulk" :key="action.key" :data-action="action.key">
          <ListRow
            :title="action.label"
            :subtitle="actionLine(action)"
            :icon="action.icon"
            @click="(actionsOpen = false), runBulk(action)"
          />
        </li>
      </ul>
    </BottomSheet>

    <Fab
      v-if="sealable.length && !selecting"
      label="Sellar bolsa"
      icon="lucide-package-plus"
      @click="startSeal"
    />

    <BottomSheet
      v-model:open="choosing"
      title="¿De qué caja fuerte sale?"
      flush
    >
      <ul class="divide-y divide-outline-gray-1">
        <li v-for="safe in sealable" :key="safe.safe">
          <ListRow
            :title="safe.title"
            :subtitle="
              safe.loose_balance === null
                ? ''
                : `Suelto ${money(safe.loose_balance, safe.currency)}`
            "
            icon="lucide-vault"
            @click="(choosing = false), open(sealBag(safe))"
          />
        </li>
      </ul>
    </BottomSheet>
    <StepHost :step="step" @close="step = null" @done="afterStep" />
  </div>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  Fab,
  ListRow,
  Segmented,
  StatusChip,
} from '@/components/ui'
import CashMap from '@/components/efectivo/CashMap.vue'
import StepHost from '@/components/efectivo/StepHost.vue'
import PowerBulkBar from '@/components/power/PowerBulkBar.vue'
import {
  WAITING_LABELS,
  bagState,
  bagsTotal,
  bagsWord,
  bulkActions,
  cashMap,
  errorText,
  fromMinor,
  holderText,
  homeRead,
  money,
  printLabels,
  stateDot,
  who,
} from '@/components/efectivo/efectivo'
import {
  approveChange,
  authorize,
  confirmDeposit,
  confirmDeposits,
  countSafe,
  declineChange,
  depositBags,
  dispatchBag,
  dispatchBags,
  fundSafe,
  handTransfer,
  returnBags,
  returnFromBank,
  reviewCount,
  sealBag,
  sendOffsite,
  sendOffsiteBags,
  unpackBag,
  unpackBags,
  verifyEach,
  verifyTogether,
} from '@/components/efectivo/steps'
import { useLiveList } from '@/composables/liveList'
import { useTween } from '@/composables/tween'
import { createListCache } from '@/utils/listCache'
import { formatDateTime } from '@/utils/display'
import { matchTokens } from '@/vendor/muelle-shell/contracts'

const route = useRoute()
const router = useRouter()
const data = ref(null)
const loadError = ref('')
const search = ref('')
const searchOpen = ref(false)
const step = ref(null)
const choosing = ref(false)
const bagView = ref('sealed')

const people = computed(() => data.value?.people || {})
const safes = computed(() => data.value?.safes || [])
const stores = computed(() => data.value?.cajas?.stores || [])
/** «3 cajas, 1 abierta · 1 por atender» */
function storeLine(store) {
  const parts = [store.registers === 1 ? '1 caja' : `${store.registers} cajas`]
  if (store.open)
    parts.push(store.open === 1 ? '1 abierta' : `${store.open} abiertas`)
  const line = parts.join(', ')
  return store.attention ? `${line} · ${store.attention} por atender` : line
}
const scope = computed(() => String(route.query.caja || ''))
const safeScopes = computed(() =>
  safes.value.length > 1
    ? [
        { value: '', label: 'Todas las cajas fuertes' },
        ...safes.value.map((s) => ({ value: s.safe, label: s.title })),
      ]
    : [],
)
const visibleSafes = computed(() =>
  scope.value ? safes.value.filter((s) => s.safe === scope.value) : safes.value,
)
function pickScope(value) {
  router.replace({ query: { ...route.query, caja: value || undefined } })
}

const cash = computed(() => cashMap(visibleSafes.value))
const bagsSection = ref(null)
/** A part of the cash map opens its bags: the tab, then the list in view. */
const flash = ref('')
let flashTimer = 0
function pickPart(part) {
  bagView.value = part.view
  // The bags the tile meant light up once (a tab can hold two states).
  flash.value = part.key
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flash.value = ''), 1600)
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  nextTick(() =>
    bagsSection.value?.scrollIntoView({
      behavior: still ? 'auto' : 'smooth',
      block: 'start',
    }),
  )
}

function safeLine(safe) {
  const open = safe.bags.filter((b) =>
    ['Unverified', 'Available', 'Disputed'].includes(b.state),
  ).length
  const transit = safe.bags.filter((b) => b.state === 'In Transit').length
  const parts = []
  parts.push(open === 1 ? '1 bolsa sellada' : `${open} bolsas selladas`)
  if (transit) parts.push(`${transit} rumbo al banco`)
  return parts.join(', ')
}

const tagged = (key) =>
  visibleSafes.value.flatMap((safe) =>
    (safe[key] || []).map((row) => ({
      ...row,
      currency: safe.currency,
      _safe: safe,
    })),
  )
const allBags = computed(() => tagged('bags'))
const matches = (bag) =>
  !search.value.trim() ||
  matchTokens(
    [
      bag.seal,
      who(bag.prepared_by, people.value),
      who(bag.holder?.user, people.value),
      String(bag.amount),
      bagState(bag.state).label,
    ].join(' '),
    search.value,
  )
const VIEWS = {
  sealed: ['Unverified', 'Available'],
  transit: ['In Transit'],
  diff: ['Disputed'],
  done: ['Deposited', 'Issued', 'Unpacked', 'Transferred'],
}
const bagViews = computed(() => {
  const count = (v) =>
    allBags.value.filter((b) => VIEWS[v].includes(b.state)).length
  return [
    { value: 'sealed', label: 'Selladas', count: count('sealed') },
    { value: 'transit', label: 'En camino', count: count('transit') },
    { value: 'diff', label: 'Con diferencia', count: count('diff') },
    { value: 'done', label: 'Terminadas', count: count('done') },
  ]
})
const shownBags = computed(() =>
  allBags.value.filter(
    (b) => VIEWS[bagView.value].includes(b.state) && matches(b),
  ),
)
const emptyBags = computed(
  () =>
    ({
      sealed: 'No hay bolsas selladas en la caja fuerte.',
      transit: 'Ninguna bolsa va rumbo al banco.',
      diff: 'Ninguna bolsa tiene diferencia.',
      done: 'Aún no hay bolsas terminadas.',
    })[bagView.value],
)
/** The row's second line: what the bag is for and who answers for it now. */
function bagLine(bag) {
  const fund = bag.purpose === 'Float' ? 'Fondo · ' : ''
  const h = bag.holder || {}
  if (h.kind === 'safe')
    return `${fund}${fund ? 'responde' : 'Responde'} ${who(h.user, people.value)}`
  return fund + holderText(bag, people.value)
}

const liveTransfers = computed(() =>
  tagged('transfers').filter(
    (t) =>
      !['Completed', 'Cancelled', 'Returned', 'Received'].includes(t.state),
  ),
)
const TRANSFER_KIND = {
  Float: 'Fondo',
  Change: 'Cambio',
  Drop: 'Retiro',
  SafeHandoff: 'Entrega',
}
function transferTitle(t) {
  const to =
    t.destination_kind === 'Safe'
      ? 'la caja fuerte'
      : t.destination_label || 'una caja'
  return `${TRANSFER_KIND[t.kind] || 'Traslado'} para ${to}`
}
function transferLine(t) {
  const holder = who(t.custodian, people.value)
  const words = {
    Draft: 'Aprobado, falta contarlo y sellarlo',
    Prepared: 'Sellado en la caja fuerte, falta entregarlo',
    InTransit: holder ? `Lo lleva ${holder}` : 'En camino',
    ReceivedPendingReview: 'Recibido con diferencia, por revisar',
    Disputed: 'Con diferencia',
  }
  return words[t.state] || t.state
}
function transferStep(t) {
  const safe = t._safe
  if (
    t.source_kind === 'Safe' &&
    ['Draft', 'Prepared'].includes(t.state) &&
    safe.can.prepare
  )
    open(handTransfer(t, safe))
}

const arqueos = computed(() =>
  tagged('counts')
    .filter((c) => c.state === 'Exception' || c.scope === 'Safe')
    .slice(0, 8),
)
function countTitle(c) {
  const what =
    {
      Safe: 'Arqueo de la caja fuerte',
      Bag: 'Conteo de bolsa',
      Drawer: 'Corte de caja',
      Fund: 'Ingreso a la caja fuerte',
    }[c.scope] || 'Conteo'
  return c.state === 'Exception' ? `${what}: no cuadró` : what
}
function signed(n, currency) {
  const v = Number(n) || 0
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${money(Math.abs(v), currency)}`
}

function waitingLine(action, bag) {
  const name = (u) => who(u, people.value)
  if (action === 'verify') return `la selló ${name(bag.prepared_by)}`
  if (action === 'dispatch')
    return bag.verified_by
      ? `la verificó ${name(bag.verified_by)}`
      : 'verificada'
  return holderText(bag, people.value)
}

/** Te toca: one row per step, with what it is and the money it moves. */
const waitingRows = computed(() => {
  const rows = []
  for (const safe of visibleSafes.value) {
    for (const w of safe.waiting || []) {
      if (w.kind === 'bag') {
        const bag = safe.bags.find((b) => b.name === w.name)
        if (!bag || !matches(bag)) continue
        rows.push({
          key: `b:${w.name}:${w.action}`,
          action: w.action,
          title: WAITING_LABELS[w.action],
          subtitle: `${bag.seal} · ${waitingLine(w.action, bag)}`,
          icon: 'lucide-banknote',
          amount: money(bag.amount, safe.currency),
          to: { name: 'EfectivoBolsa', params: { name: bag.name } },
        })
      } else if (w.kind === 'count') {
        const c = safe.counts.find((x) => x.name === w.name)
        if (!c) continue
        rows.push({
          key: `c:${w.name}`,
          action: 'review',
          title: countTitle(c),
          subtitle: `Contó ${who(c.counted_by, people.value)} · diferencia ${signed(c.difference, safe.currency)}`,
          urgent: true,
          icon: 'lucide-calculator',
          amount: money(c.amount, safe.currency),
          to: c.bag ? { name: 'EfectivoBolsa', params: { name: c.bag } } : null,
          open: c.bag ? null : () => open(reviewCount(c, safe, people.value)),
        })
      } else if (w.kind === 'request') {
        const r = safe.requests.find((x) => x.name === w.name)
        if (!r) continue
        rows.push({
          key: `r:${w.name}`,
          action: 'assign',
          title: `Cambio para ${r.register_label || 'una caja'}`,
          subtitle: `Lo pide ${who(r.requested_by, people.value)}`,
          icon: 'lucide-coins',
          amount: money(fromMinor(r.amount_minor), safe.currency),
          open: () => open(approveChange(r, safe, people.value)),
          decline: () => open(declineChange(r, safe, people.value)),
        })
      } else if (w.kind === 'transfer') {
        const t = safe.transfers.find((x) => x.name === w.name)
        if (!t) continue
        rows.push({
          key: `t:${w.name}`,
          action: w.action,
          title: transferTitle(t),
          subtitle: transferLine(t),
          icon: 'lucide-arrow-left-right',
          amount: t.amounts_hidden
            ? ''
            : money(fromMinor(t.declared_minor), safe.currency),
          open: () => transferStep({ ...t, _safe: safe }),
        })
      }
    }
  }
  for (const a of data.value?.authorizations || []) {
    rows.push({
      key: `a:${a.name}`,
      action: 'authorize',
      title:
        a.event === 'cancel'
          ? 'Autorizar una cancelación'
          : 'Autorizar un registro',
      subtitle: `${a.title || a.document_name} · lo pide ${who(a.requested_by, people.value)}`,
      urgent: true,
      icon: 'lucide-signature',
      amount: money(
        fromMinor(a.amount_minor),
        safes.value[0]?.currency || 'MXN',
      ),
      open: () =>
        open(authorize(a, people.value, safes.value[0]?.currency || 'MXN')),
    })
  }
  return rows
})

const allWaiting = ref(false)
const WAITING_SHOWN = 5
const shownWaiting = computed(() =>
  allWaiting.value || search.value.trim()
    ? waitingRows.value
    : waitingRows.value.slice(0, WAITING_SHOWN),
)

// Seleccionar: several bags of one safe, one instruction (`batch.command`).
const selecting = ref(false)
const selected = ref(new Set())
const actionsOpen = ref(false)
const me = computed(() => data.value?.user)
const BULK_CAN = [
  'verify',
  'dispatch',
  'confirm_bank',
  'transfer_safe',
  'unpack',
  'deposit',
]
const selectable = computed(
  () =>
    allBags.value.length > 1 &&
    visibleSafes.value.some((s) => BULK_CAN.some((key) => s.can[key])),
)
const selectedBags = computed(() =>
  allBags.value.filter((b) => selected.value.has(b.name)),
)
/** The first chosen bag names the safe: a batch moves the bags of one safe. */
const selectionSafe = computed(() => selectedBags.value[0]?._safe || null)
const pickable = (bag) =>
  !selectionSafe.value || bag._safe.safe === selectionSafe.value.safe
const otherSafe = computed(() => shownBags.value.some((b) => !pickable(b)))
function toggle(bag) {
  if (!pickable(bag)) return
  const next = new Set(selected.value)
  if (next.has(bag.name)) next.delete(bag.name)
  else next.add(bag.name)
  selected.value = next
}
function selectShown() {
  const first = shownBags.value.find(pickable)
  if (!first) return
  const safe = selectionSafe.value?.safe || first._safe.safe
  selected.value = new Set([
    ...selected.value,
    ...shownBags.value.filter((b) => b._safe.safe === safe).map((b) => b.name),
  ])
}
function clearSelection() {
  selected.value = new Set()
  selecting.value = false
  actionsOpen.value = false
}
/** The selection's total counts as bags join it. */
const selectedTotal = useTween(() => bagsTotal(selectedBags.value))

// A long press on a bag starts the selection with it (the phone's usual way
// into choosing several); the release that ends it neither opens the bag nor
// toggles it again, and the browser's link menu stays shut.
const LONG_PRESS_MS = 450
let pressTimer = 0
let pressAt = null
let longPressed = false
function pressStart(event, bag) {
  if (selecting.value || !selectable.value || event.button > 0) return
  longPressed = false
  pressAt = { x: event.clientX, y: event.clientY }
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    pressAt = null
    longPressed = true
    selecting.value = true
    toggle(bag)
    navigator.vibrate?.(10)
  }, LONG_PRESS_MS)
}
function pressMove(event) {
  if (
    pressAt &&
    Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) > 10
  )
    pressEnd()
}
function pressEnd() {
  clearTimeout(pressTimer)
  pressAt = null
  // The row turned from a link into a button under the finger, so the
  // release may bring no click at all: stop guarding once it has passed.
  if (longPressed) setTimeout(() => (longPressed = false))
}
function afterLongPress(event) {
  if (!longPressed) return
  longPressed = false
  event.preventDefault()
  event.stopPropagation()
}
function pressMenu(event) {
  if (pressAt || longPressed) event.preventDefault()
}
const bulk = computed(() =>
  selectionSafe.value
    ? bulkActions(selectedBags.value, selectionSafe.value, me.value)
    : [],
)
/** The bar's button: the first step every chosen bag can take. */
const mainAction = computed(
  () =>
    bulk.value.find(
      (a) => a.key !== 'labels' && a.bags.length === selectedBags.value.length,
    ) || null,
)
function actionLine(action) {
  const n = selectedBags.value.length
  const amount = money(bagsTotal(action.bags), selectionSafe.value?.currency)
  return action.bags.length === n
    ? `${n === 1 ? 'La bolsa' : `Las ${n}`} · ${amount}`
    : `${action.bags.length} de las ${n} · ${amount}`
}
/** One bag takes its own sheet; several take the batch's. */
const SINGLE = {
  dispatch: (b, s, p, u) => dispatchBag(b, s, p, u),
  confirm_bank: (b, s, p) => confirmDeposit(b, s, p),
  return_bank: (b, s, p) => returnFromBank(b, s, p),
  transfer_safe: (b, s, p) => sendOffsite(b, s, p),
  unpack: (b, s) => unpackBag(b, s),
}
const SEVERAL = {
  verify_together: (bags, s, p) => verifyTogether(bags, s, p),
  verify_each: (bags, s, p) => verifyEach(bags, s, p),
  deposit: (bags, s) => depositBags(bags, s),
  dispatch: (bags, s, p, u) => dispatchBags(bags, s, p, u),
  confirm_bank: (bags, s) => confirmDeposits(bags, s),
  return_bank: (bags, s) => returnBags(bags, s),
  transfer_safe: (bags, s) => sendOffsiteBags(bags, s),
  unpack: (bags, s) => unpackBags(bags, s),
}
async function runBulk(action) {
  const safe = selectionSafe.value
  if (action.key === 'labels') {
    try {
      await printLabels(action.bags.map((b) => b.name))
    } catch (error) {
      toast.error(errorText(error))
    }
    return
  }
  const one = action.bags.length === 1 && SINGLE[action.key]
  open(
    one
      ? one(action.bags[0], safe, people.value, me.value)
      : SEVERAL[action.key](action.bags, safe, people.value, me.value),
  )
}

const sealable = computed(() => visibleSafes.value.filter((s) => s.can.prepare))
function startSeal() {
  if (sealable.value.length === 1) open(sealBag(sealable.value[0]))
  else choosing.value = true
}
function open(next) {
  step.value = next
}

const listCache = createListCache('efectivo', () => [])
let sequence = 0
async function load() {
  const mine = ++sequence
  const at = listCache.key()
  listCache.paint((result) => (data.value = result))
  loadError.value = ''
  try {
    const result = await homeRead()
    if (mine !== sequence) return
    data.value = result
    listCache.save(at, result)
  } catch (error) {
    if (mine === sequence && !data.value) loadError.value = errorText(error)
  }
}
function afterStep(result) {
  navigator.vibrate?.(10)
  clearSelection()
  load()
  // The next bag of «Contar una por una», once this sheet has closed.
  if (result?.next) setTimeout(() => open(result.next))
}
watch(scope, () => (bagView.value = 'sealed'))
watch([scope, bagView], () => (selected.value = new Set()))
load()
// A cajero's drop, a teammate's verification or the bank run land without a reload.
useLiveList(
  [
    'POS Cash Bag',
    'POS Cash Count',
    'POS Cash Transfer',
    'POS Cash Change Request',
  ],
  load,
)
defineExpose({ reload: load })
</script>
<style scoped>
/* A bag that leaves its tab (verified, deposited, sent) slides out while the
   rest close the gap; one that arrives (a teammate's drop) settles in. */
.ef-row-move {
  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ef-row-enter-active {
  transition:
    opacity 180ms ease-out,
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ef-row-leave-active {
  position: absolute;
  inset-inline: 0;
  transition:
    opacity 200ms ease-in,
    transform 220ms ease-in;
}
.ef-row-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.ef-row-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
/* The bags a cash-map tile opened light up once, after the scroll arrives. */
@keyframes ef-flash {
  from {
    background-color: var(--surface-gray-3);
  }
  to {
    background-color: transparent;
  }
}
.ef-flash {
  animation: ef-flash 1.2s ease-out 0.3s both;
}
/* The selection mark: the check pops in where the bag icon was. */
.ef-glyph {
  transition:
    background-color 160ms ease,
    color 160ms ease;
}
.ef-pop-enter-active,
.ef-pop-leave-active {
  transition:
    opacity 140ms ease,
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ef-pop-enter-from,
.ef-pop-leave-to {
  opacity: 0;
  transform: scale(0.5);
}
/* The state dot sits on the icon's edge, cut out of the page around it. */
.ef-dot {
  box-shadow: 0 0 0 2px var(--surface-base);
}
/* The selection's bar rises from the thumb and leaves the same way. */
.ef-bar-enter-active {
  transition: transform 240ms cubic-bezier(0.32, 0.72, 0, 1);
}
.ef-bar-leave-active {
  transition: transform 160ms ease-in;
}
.ef-bar-enter-from,
.ef-bar-leave-to {
  transform: translateY(100%);
}
@media (prefers-reduced-motion: reduce) {
  .ef-row-move,
  .ef-row-enter-active,
  .ef-row-leave-active,
  .ef-pop-enter-active,
  .ef-pop-leave-active,
  .ef-bar-enter-active,
  .ef-bar-leave-active {
    transition: opacity 120ms;
  }
  .ef-row-enter-from,
  .ef-row-leave-to,
  .ef-pop-enter-from,
  .ef-pop-leave-to,
  .ef-bar-enter-from,
  .ef-bar-leave-to {
    transform: none;
    opacity: 0;
  }
}
</style>
