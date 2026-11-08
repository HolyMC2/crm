<template>
  <!-- Compras › Hoy: the owner's buying board. Levels met and the money that
       fills the rest, the week's suppliers with «Armar pedido» (a draft Pedido
       Catalogo, never sent), cheaper offers and price changes, open orders,
       arrivals to receive, bills due, the asks without stock, the month per
       product type, the monthly budgets and the suppliers' delivery days
       (doco.workspaces.compras_hoy). -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="true"
      :back-label="__('Compras', null, 'Compras')"
      :title="__('Today', null, 'ComprasHoy')"
      :bell="phone"
      @back="onBack"
    />

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-12">
      <EmptyState
        v-if="guard"
        role="alert"
        state="error"
        :title="__('Could not open the buying board', null, 'ComprasHoy')"
        :message="guard"
        :action="__('Retry', null, 'Compras')"
        @action="load"
      />
      <EmptyState
        v-else-if="!board"
        role="status"
        state="loading"
        :title="__('Reading the buying board…', null, 'ComprasHoy')"
      />

      <div v-else class="mx-auto w-full max-w-3xl space-y-6 px-4 pt-4 sm:px-6">
        <KpiGrid v-if="tiles.length" data-testid="hoy-tiles">
          <KpiTile
            v-for="t in tiles"
            :key="t.key"
            :label="t.label"
            :value="t.value"
            :hint="t.hint"
            :tone="t.tone"
            :to="t.to"
          />
        </KpiGrid>
        <EmptyState
          v-if="!board.levels"
          :title="__('No stock levels yet', null, 'ComprasHoy')"
          :message="
            __(
              'Set how many pieces you keep of each model and this board tells you what to buy.',
              null,
              'ComprasHoy',
            )
          "
          :action="__('Stock levels', null, 'ComprasHoy')"
          @action="router.push({ name: 'CompraNiveles' })"
        />

        <!-- what to buy -->
        <section
          v-if="board.low.length"
          :aria-label="__('To buy', null, 'ComprasHoy')"
          data-testid="hoy-low"
        >
          <h2 class="title-face text-lg font-semibold text-ink-gray-9">
            {{ __('To buy', null, 'ComprasHoy') }}
          </h2>
          <p class="mb-2 text-sm text-ink-gray-6">
            {{
              __(
                '{0} levels below their minimum; filling them costs {1}.',
                [board.low.length, money(board.money)],
                'ComprasHoy',
              )
            }}
          </p>
          <ul
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          >
            <li
              v-for="row in board.low.slice(0, LOW_ROWS)"
              :key="row.item_group + row.model + row.warehouse"
              class="flex min-h-12 items-center gap-3 px-3 py-2"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base font-medium">{{
                  row.model
                }}</span>
                <span class="block text-xs text-ink-gray-6">{{
                  lowMeta(row)
                }}</span>
              </span>
              <span class="flex-none text-right">
                <span class="num block tabular-nums">{{
                  __('{0} short', [row.need], 'ComprasHoy')
                }}</span>
                <span
                  v-if="row.priced"
                  class="num block text-xs tabular-nums text-ink-gray-6"
                  >{{ money(row.cost) }}</span
                >
              </span>
            </li>
          </ul>
          <p
            v-if="board.low.length > LOW_ROWS"
            class="mt-2 text-xs text-ink-gray-5"
          >
            {{
              __('And {0} more.', [board.low.length - LOW_ROWS], 'ComprasHoy')
            }}
          </p>
          <p
            v-if="board.nobody.length"
            class="mt-3 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
          >
            {{
              __(
                'None of your suppliers brings: {0}.',
                [nobodyText],
                'ComprasHoy',
              )
            }}
          </p>
        </section>

        <!-- the week's suppliers -->
        <section
          v-if="board.suppliers.length"
          :aria-label="__('Who fills it', null, 'ComprasHoy')"
          data-testid="hoy-suppliers"
        >
          <h2 class="title-face text-lg font-semibold text-ink-gray-9">
            {{ __('Who fills it', null, 'ComprasHoy') }}
          </h2>
          <p class="mb-2 text-sm text-ink-gray-6">
            {{
              __(
                'Each supplier’s newest catalogue at its own price. «Build the order» leaves a draft to review; nothing is sent.',
                null,
                'ComprasHoy',
              )
            }}
          </p>
          <ul
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          >
            <li
              v-for="s in board.suppliers"
              :key="s.supplier"
              class="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base font-medium">{{
                  s.supplier
                }}</span>
                <span class="block text-xs text-ink-gray-6">{{
                  __(
                    '{0} models, {1} pieces · {2}',
                    [s.models, s.pieces, money(s.money)],
                    'ComprasHoy',
                  )
                }}</span>
              </span>
              <Button
                v-if="board.owner"
                :label="__('Build the order', null, 'ComprasHoy')"
                class="min-h-11 flex-none sm:min-h-8"
                :loading="busy === 'order:' + s.supplier"
                :disabled="!!busy"
                @click="buildOrder(s.supplier)"
              />
            </li>
          </ul>
          <p v-if="!board.owner" class="mt-2 text-xs text-ink-gray-5">
            {{ __('The owner builds the orders.', null, 'ComprasHoy') }}
          </p>
        </section>

        <section
          v-if="board.cheaper.length || board.changes.length"
          :aria-label="__('Prices', null, 'ComprasHoy')"
        >
          <h2 class="title-face mb-2 text-lg font-semibold text-ink-gray-9">
            {{ __('Prices', null, 'ComprasHoy') }}
          </h2>
          <ul
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          >
            <li
              v-for="c in board.cheaper"
              :key="'c' + c.item_group + c.model"
              class="flex min-h-12 items-center gap-3 px-3 py-2"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base">{{ c.model }}</span>
                <span class="block text-xs text-ink-gray-6">{{
                  __(
                    '{0} at {1} against {2} at {3}',
                    [
                      c.best.supplier,
                      money(c.best.price),
                      c.other.supplier,
                      money(c.other.price),
                    ],
                    'ComprasHoy',
                  )
                }}</span>
              </span>
              <span
                class="num flex-none text-sm tabular-nums text-ink-green-8"
                >{{ __('saves {0}', [money(c.saves)], 'ComprasHoy') }}</span
              >
            </li>
            <li
              v-for="(p, i) in changes"
              :key="'p' + i"
              class="flex min-h-12 items-center gap-3 px-3 py-2"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base">{{
                  p.model || p.code
                }}</span>
                <span class="block text-xs text-ink-gray-6">{{
                  p.model ? `${p.supplier} · ${p.code}` : p.supplier
                }}</span>
              </span>
              <span
                class="num flex-none text-sm tabular-nums"
                :class="p.kind === 'up' ? 'text-ink-red-7' : 'text-ink-green-8'"
                >{{
                  p.kind === 'up'
                    ? __(
                        'up from {0} to {1}',
                        [money(p.old_price), money(p.new_price)],
                        'ComprasHoy',
                      )
                    : __(
                        'down from {0} to {1}',
                        [money(p.old_price), money(p.new_price)],
                        'ComprasHoy',
                      )
                }}</span
              >
            </li>
          </ul>
        </section>

        <!-- orders, arrivals, bills -->
        <section
          v-if="board.orders?.count"
          :aria-label="__('Open orders', null, 'ComprasHoy')"
          data-testid="hoy-orders"
        >
          <h2 class="title-face text-lg font-semibold text-ink-gray-9">
            {{ __('Open orders', null, 'ComprasHoy') }}
          </h2>
          <p class="mb-2 text-sm text-ink-gray-6">
            {{
              __(
                '{0} pending to receive, the oldest first.',
                [money(board.orders.pending)],
                'ComprasHoy',
              )
            }}
          </p>
          <ul
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          >
            <li v-for="o in board.orders.oldest" :key="o.name">
              <RouterLink
                :to="{ name: 'CompraOrden', params: { name: o.name } }"
                class="press flex min-h-12 items-center gap-3 px-3 py-2 [@media(hover:hover)]:hover:bg-surface-gray-1"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-base">{{ o.supplier }}</span>
                  <span
                    class="block text-xs"
                    :class="o.late ? 'text-ink-red-7' : 'text-ink-gray-6'"
                    >{{
                      o.late
                        ? __('{0} days, late', [o.age], 'ComprasHoy')
                        : __('{0} days', [o.age], 'ComprasHoy')
                    }}</span
                  >
                </span>
                <span class="num flex-none tabular-nums">{{
                  money(o.pending)
                }}</span>
              </RouterLink>
            </li>
          </ul>
        </section>

        <section
          v-if="board.arrivals?.count"
          :aria-label="__('Arrived, to receive', null, 'ComprasHoy')"
        >
          <h2 class="title-face mb-2 text-lg font-semibold text-ink-gray-9">
            {{ __('Arrived, to receive', null, 'ComprasHoy') }}
          </h2>
          <ul
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          >
            <li v-for="r in board.arrivals.rows" :key="r.name">
              <RouterLink
                :to="{ name: 'CompraRecepcion', params: { name: r.name } }"
                class="press flex min-h-12 items-center gap-3 px-3 py-2 [@media(hover:hover)]:hover:bg-surface-gray-1"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-base">{{ r.supplier }}</span>
                  <span class="block text-xs text-ink-gray-6">{{
                    formatDate(r.posting_date)
                  }}</span>
                </span>
                <span class="num flex-none tabular-nums">{{
                  money(r.grand_total)
                }}</span>
              </RouterLink>
            </li>
          </ul>
        </section>

        <section
          v-if="board.retire?.length"
          :aria-label="
            __('Models the lists no longer carry', null, 'ComprasHoy')
          "
          data-testid="hoy-retire"
        >
          <h2 class="title-face text-lg font-semibold text-ink-gray-9">
            {{ __('Models the lists no longer carry', null, 'ComprasHoy') }}
          </h2>
          <p class="mb-2 text-sm text-ink-gray-6">
            {{
              __(
                'After a receipt, the models a supplier stopped listing wait for you to archive, delete or keep them.',
                null,
                'ComprasHoy',
              )
            }}
          </p>
          <ul
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          >
            <li v-for="r in board.retire" :key="r.pedido">
              <RouterLink
                :to="{ name: 'CompraLista', params: { name: r.catalog } }"
                class="press flex min-h-12 items-center gap-3 px-3 py-2 [@media(hover:hover)]:hover:bg-surface-gray-1"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-base">{{
                    r.supplier_name
                  }}</span>
                  <span class="block text-xs text-ink-gray-6">{{
                    __('{0} models waiting', [r.count], 'ComprasHoy')
                  }}</span>
                </span>
                <span class="num flex-none tabular-nums">{{ r.count }}</span>
              </RouterLink>
            </li>
          </ul>
        </section>

        <section
          v-if="board.bills?.count"
          :aria-label="__('Bills due this week', null, 'ComprasHoy')"
        >
          <h2 class="title-face mb-2 text-lg font-semibold text-ink-gray-9">
            {{ __('Bills due this week', null, 'ComprasHoy') }}
          </h2>
          <ul
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          >
            <li v-for="b in board.bills.rows" :key="b.name">
              <RouterLink
                :to="{ name: 'GastoFactura', params: { name: b.name } }"
                class="press flex min-h-12 items-center gap-3 px-3 py-2 [@media(hover:hover)]:hover:bg-surface-gray-1"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-base">{{ b.supplier }}</span>
                  <span class="block text-xs text-ink-gray-6">{{
                    __('due {0}', [formatDate(b.due_date)], 'ComprasHoy')
                  }}</span>
                </span>
                <span
                  class="num flex-none tabular-nums"
                  :class="b.overdue ? 'text-ink-red-7' : ''"
                  >{{ money(b.amount) }}</span
                >
              </RouterLink>
            </li>
          </ul>
        </section>

        <!-- the month -->
        <section
          v-if="board.month.groups.length"
          :aria-label="__('This month', null, 'ComprasHoy')"
          data-testid="hoy-month"
        >
          <h2 class="title-face text-lg font-semibold text-ink-gray-9">
            {{ __('This month', null, 'ComprasHoy') }}
          </h2>
          <p class="mb-2 text-sm text-ink-gray-6">
            {{
              __(
                'From {0}, {1} days.',
                [
                  formatDate(board.month.start, { relative: false }),
                  board.month.days,
                ],
                'ComprasHoy',
              )
            }}
          </p>
          <ul
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          >
            <li
              v-for="g in board.month.groups"
              :key="g.item_group"
              class="px-3 py-2.5"
            >
              <span class="flex items-baseline gap-2">
                <span class="min-w-0 flex-1 truncate text-base font-medium">{{
                  g.item_group
                }}</span>
                <span class="num flex-none text-sm tabular-nums">{{
                  __('{0} sold, {1} in stock', [g.sold, g.have], 'ComprasHoy')
                }}</span>
              </span>
              <span class="block text-xs text-ink-gray-6">{{
                monthMeta(g)
              }}</span>
              <span
                v-if="g.tones.length > 1"
                class="block text-xs text-ink-gray-6"
                >{{ tonesMeta(g) }}</span
              >
            </li>
          </ul>
        </section>

        <!-- budgets: the month's plan per product type, as Gastos › Presupuesto
             keeps it; here only how far each one has gone. -->
        <section
          :aria-label="__('Monthly budgets', null, 'ComprasHoy')"
          data-testid="hoy-budgets"
        >
          <div class="mb-2 flex items-center gap-2">
            <h2
              class="title-face min-w-0 flex-1 text-lg font-semibold text-ink-gray-9"
            >
              {{ __('Monthly budgets', null, 'ComprasHoy') }}
            </h2>
            <RouterLink
              v-if="budgetOn"
              to="/gastos/presupuesto"
              class="press flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-gray-8 active:bg-surface-gray-2 sm:min-h-8 [@media(hover:hover)]:hover:bg-surface-gray-2"
              data-testid="hoy-budgets-link"
            >
              <span class="lucide-wallet size-4" aria-hidden="true" />
              {{ __('Budget', null, 'ComprasHoy') }}
            </RouterLink>
          </div>
          <p
            v-if="!board.budgets.length"
            class="rounded-6 bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
          >
            {{
              __(
                'No budgets. With one per product type in Gastos › Presupuesto, a buy plan never spends more than what is left this month.',
                null,
                'ComprasHoy',
              )
            }}
          </p>
          <ul
            v-else
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          >
            <li
              v-for="b in board.budgets"
              :key="b.item_group"
              class="space-y-1.5 px-3 py-2.5"
            >
              <span class="flex items-baseline gap-2">
                <span class="min-w-0 flex-1 truncate text-base">{{
                  b.item_group
                }}</span>
                <span
                  class="num flex-none text-sm tabular-nums"
                  :class="budgetUse(b).spent ? 'text-ink-red-7' : ''"
                  >{{
                    __(
                      '{0} of {1}',
                      [money(b.committed), money(b.amount)],
                      'ComprasHoy',
                    )
                  }}</span
                >
              </span>
              <span
                class="flex h-2 w-full overflow-hidden rounded-full bg-surface-gray-2"
                aria-hidden="true"
              >
                <span
                  class="h-full bg-surface-gray-7"
                  :style="{ width: Math.min(budgetUse(b).pct || 0, 100) + '%' }"
                />
              </span>
              <span class="block text-xs text-ink-gray-6">{{
                budgetUse(b).spent
                  ? __(
                      'Spent: plans of this type wait for next month.',
                      null,
                      'ComprasHoy',
                    )
                  : __('{0} left', [money(budgetUse(b).left)], 'ComprasHoy')
              }}</span>
            </li>
          </ul>
        </section>

        <div class="flex flex-wrap justify-end gap-2">
          <Button
            :label="__('Delivery days', null, 'ComprasHoy')"
            class="min-h-11 sm:min-h-8"
            @click="openLeads"
          />
          <Button
            :label="__('Stock levels', null, 'ComprasHoy')"
            class="min-h-11 sm:min-h-8"
            @click="router.push({ name: 'CompraNiveles' })"
          />
        </div>
      </div>
    </div>

    <BottomSheet
      v-if="leadsMounted"
      v-model:open="leadsOpen"
      :title="__('Delivery days', null, 'ComprasHoy')"
      :subtitle="
        __(
          'Days from the order to the receipt. Empty: measured from its orders.',
          null,
          'ComprasHoy',
        )
      "
      flush
    >
      <p
        v-if="leadsProblem"
        role="alert"
        class="px-4 py-2 text-sm text-ink-red-7"
      >
        {{ leadsProblem }}
      </p>
      <EmptyState
        v-if="leadsLoading"
        role="status"
        state="loading"
        :title="__('Reading the suppliers…', null, 'ComprasHoy')"
      />
      <p v-else-if="!leads.length" class="px-4 py-3 text-sm text-ink-gray-6">
        {{ __('No supplier has a purchase order yet.', null, 'ComprasHoy') }}
      </p>
      <ul v-else class="divide-y divide-outline-gray-1">
        <li
          v-for="row in leads"
          :key="row.supplier"
          class="flex items-center gap-3 px-4 py-2"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-base">{{ row.label }}</span>
            <span class="block text-xs text-ink-gray-6">{{
              leadMeta(row)
            }}</span>
          </span>
          <template v-if="board.owner">
            <input
              v-model="row.own"
              type="number"
              min="0"
              max="365"
              inputmode="numeric"
              class="h-11 w-20 rounded-4 border border-outline-gray-2 px-2 text-right tabular-nums sm:h-9"
              :aria-label="
                __('Delivery days of {0}', [row.label], 'ComprasHoy')
              "
              @keydown.enter.prevent="saveLead(row)"
            />
            <Button
              :label="__('Save', null, 'ComprasHoy')"
              class="min-h-11 flex-none sm:min-h-8"
              :loading="busy === 'lead:' + row.supplier"
              @click="saveLead(row)"
            />
          </template>
        </li>
      </ul>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  KpiGrid,
  KpiTile,
} from '@/components/ui'
import { isMobile } from '@/composables/breakpoint'
import { shellBoot } from '@/composables/muelleShell'
import { comprasApi, money, problemOf } from '@/composables/useCompras'
import { can } from '@/vendor/muelle-shell/contracts'
import { formatDate } from '@/utils/display'
import {
  boardAlerts,
  budgetUse,
  leadRows,
  priceChangeRows,
  tonesText,
} from '@/utils/comprasLoop'

const API = 'doco.workspaces.compras_hoy.'
const LOW_ROWS = 12

const router = useRouter()
const phone = isMobile
const board = ref(null)
const guard = ref('')
const busy = ref('')

async function load() {
  guard.value = ''
  try {
    board.value = await comprasApi(API + 'board')
  } catch (error) {
    guard.value = problemOf(error).detail
  }
}

const tiles = computed(() =>
  boardAlerts(board.value || {}).map((a) => {
    if (a.key === 'levels')
      return {
        key: a.key,
        label: __('Levels met', null, 'ComprasHoy'),
        value: __('{0} of {1}', [a.value, a.of], 'ComprasHoy'),
        hint: a.urgent ? money(board.value.money) : '',
        tone: a.urgent ? 'warning' : 'success',
        to: { name: 'CompraNiveles' },
      }
    if (a.key === 'orders')
      return {
        key: a.key,
        label: __('Open orders', null, 'ComprasHoy'),
        value: a.value,
        hint: a.late
          ? __('{0} late', [a.late], 'ComprasHoy')
          : money(board.value.orders.pending),
        tone: a.urgent ? 'danger' : 'neutral',
        to: { name: 'Compras' },
      }
    if (a.key === 'arrivals')
      return {
        key: a.key,
        label: __('To receive', null, 'ComprasHoy'),
        value: a.value,
        hint: '',
        tone: a.urgent ? 'warning' : 'neutral',
        to: null,
      }
    if (a.key === 'bills')
      return {
        key: a.key,
        label: __('Bills this week', null, 'ComprasHoy'),
        value: a.value,
        hint: a.overdue
          ? __('{0} overdue', [a.overdue], 'ComprasHoy')
          : money(board.value.bills.amount),
        tone: a.urgent ? 'danger' : 'neutral',
        to: null,
      }
    return {
      key: a.key,
      label: __('Asked without stock', null, 'ComprasHoy'),
      value: a.value,
      hint: __('this week', null, 'ComprasHoy'),
      tone: a.urgent ? 'warning' : 'neutral',
      to: { name: 'CompraNiveles', query: { ver: 'perdidas' } },
    }
  }),
)

const changes = computed(() =>
  priceChangeRows(board.value?.changes, board.value?.low),
)

const nobodyText = computed(() =>
  (board.value?.nobody || [])
    .slice(0, 8)
    .map((r) => `${r.model} (${r.item_group})`)
    .join(', '),
)

function lowMeta(row) {
  const offer = row.offers?.[0]
  return [
    row.item_group,
    tonesText(row.tones),
    offer
      ? __('{0} at {1}', [offer.supplier, money(offer.price)], 'ComprasHoy')
      : '',
    row.lost ? __('asked {0} without stock', [row.lost], 'ComprasHoy') : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function pct(value) {
  return value === null || value === undefined ? '' : `${value} %`
}

function monthMeta(g) {
  return [
    g.sell_through !== null
      ? __('sold {0} of what it had', [pct(g.sell_through)], 'ComprasHoy')
      : '',
    g.stock_days !== null
      ? __('stock for {0} days', [g.stock_days], 'ComprasHoy')
      : '',
    g.turns !== null ? __('{0} turns a year', [g.turns], 'ComprasHoy') : '',
    board.value.cost_visible && g.margin !== null
      ? __('margin {0}', [pct(g.margin)], 'ComprasHoy')
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function tonesMeta(g) {
  return g.tones
    .filter((t) => t.sell_through !== null)
    .map((t) =>
      __('{0} sells {1}', [t.tone, pct(t.sell_through)], 'ComprasHoy'),
    )
    .join(' · ')
}

async function buildOrder(supplier) {
  busy.value = `order:${supplier}`
  try {
    const out = await comprasApi(API + 'build_order', { supplier })
    for (const note of out.notes || []) toast.info(note)
    toast.success(
      __('Draft order ready: {0}', [money(out.total)], 'ComprasHoy'),
    )
    router.push({ name: 'CompraSurtido', query: { pedido: out.pedido } })
  } catch (error) {
    toast.error(problemOf(error).detail)
  } finally {
    busy.value = ''
  }
}

// ---- budgets ---------------------------------------------------------------
// Gastos › Presupuesto owns the plan; this board only reads it.
const budgetOn = computed(() => can(shellBoot.value, 'gastos', 'presupuesto'))

// ---- delivery days ---------------------------------------------------------
const leadsMounted = ref(false)
const leadsOpen = ref(false)
const leadsLoading = ref(false)
const leadsProblem = ref('')
const leads = ref([])

async function openLeads() {
  leadsMounted.value = true
  leadsOpen.value = true
  leadsLoading.value = true
  leadsProblem.value = ''
  try {
    leads.value = leadRows(await comprasApi(API + 'leads'))
  } catch (error) {
    leadsProblem.value = problemOf(error).detail
  } finally {
    leadsLoading.value = false
  }
}

function leadMeta(row) {
  if (row.source === 'proveedor')
    return __('{0} days, yours', [row.days], 'ComprasHoy')
  if (row.source === 'medido')
    return __(
      '{0} days, measured over {1} receipts',
      [row.days, row.samples],
      'ComprasHoy',
    )
  return __('{0} days, the default', [row.days], 'ComprasHoy')
}

async function saveLead(row) {
  busy.value = `lead:${row.supplier}`
  leadsProblem.value = ''
  try {
    const out = await comprasApi(API + 'lead_save', {
      supplier: row.supplier,
      days: row.own === '' ? 0 : Math.round(Number(row.own)),
    })
    leads.value = leadRows(out)
    toast.success(__('Delivery days saved', null, 'ComprasHoy'))
  } catch (error) {
    leadsProblem.value = problemOf(error).detail
  } finally {
    busy.value = ''
  }
}

function onBack(event) {
  event?.preventDefault?.()
  router.push({ name: 'Compras' })
}

onMounted(load)
</script>
