<template>
  <ModuleLayout
    title="Productos"
    :entries="entries"
    :saved-entries="inventoryEntries"
    :saved-label="__('Inventory', null, 'Productos')"
    :active-key="view"
    @select="selectView"
  >
    <template v-if="catalog && !guard" #sidebar>
      <div class="mt-6 border-t border-outline-gray-2 px-3 pt-5">
        <CatalogFilters
          :facets="facets"
          :state="state"
          :loading="facetsLoading"
          :sections="['group']"
          @update="filterBy"
        />
        <PriceListsToggle
          v-model="shownLists"
          :lists="boot?.price_lists || []"
          :main="boot?.default_price_list || ''"
        />
      </div>
    </template>
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Productos is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button :label="__('Copy access request')" @click="copyRequest()" />
        <Button :label="__('Back', null, 'Productos')" @click="router.back()" />
      </div>
      <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
        {{ copied }}
      </p>
    </section>
    <template v-else>
      <PageHeader :title="heading" :subtitle="subtitle" :level="1">
        <template #actions>
          <!-- On a phone the app bar already carries the scan icon. -->
          <a
            v-if="scanHref"
            :href="scanHref"
            class="hidden min-h-11 items-center gap-1.5 rounded-md sm:inline-flex bg-surface-gray-2 px-3 text-base text-ink-gray-8 hover:bg-surface-gray-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:min-h-8"
            :title="
              __('Scan a code and open its product (S)', null, 'Productos')
            "
          >
            <span class="lucide-scan-barcode h-4 w-4" aria-hidden="true" />
            {{ __('Scan', null, 'Productos') }}
          </a>
          <Button
            v-if="catalog && boot?.capabilities?.packs && rows.length"
            class="min-h-11 sm:min-h-8"
            :label="__('Build a pack', null, 'Productos')"
            :title="
              __(
                'Images, PDF or a price message of this list, to send',
                null,
                'Productos',
              )
            "
            @click="packOpen = true"
          >
            <template #prefix>
              <FeatherIcon name="layers" class="h-4 w-4" aria-hidden="true" />
            </template>
          </Button>
          <Button
            v-if="returnTo"
            :label="__('Back to {0}', [returnLabel])"
            class="min-h-11 sm:min-h-8"
            @click="goReturn"
          />
        </template>
      </PageHeader>
      <PackDialog
        v-model="packOpen"
        :filters="packFilters"
        :label="packLabel"
      />
      <section
        v-if="inventory && summary?.readable"
        :aria-label="__('Inventory health')"
        class="px-4 pb-3 sm:px-6"
      >
        <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button
            v-for="chip in chips"
            :key="chip.view"
            class="min-h-11 shrink-0 rounded-full border px-3 text-sm sm:min-h-8"
            :class="
              chip.view === view
                ? 'border-outline-gray-4 bg-surface-gray-3 font-semibold text-ink-gray-9'
                : 'border-outline-gray-2 text-ink-gray-7 hover:bg-surface-gray-1'
            "
            :aria-current="chip.view === view ? 'page' : undefined"
            @click="selectView(chip.view)"
          >
            {{ chip.text }}
          </button>
        </div>
        <div class="mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
          <p class="text-xs text-ink-gray-6">
            {{
              __('{0} products with stock · this week {1} counted, {2} filed', [
                summary.stocked.toLocaleString(),
                summary.week.counted.toLocaleString(),
                summary.week.cajones.toLocaleString(),
              ])
            }}
          </p>
          <div
            class="flex h-6 items-end gap-0.5"
            role="img"
            :aria-label="trendLabel"
            :title="trendLabel"
          >
            <span
              v-for="week in summary.trend"
              :key="week.week"
              class="w-2 rounded-sm bg-surface-gray-5"
              :class="week.week === 0 ? 'bg-surface-gray-7' : ''"
              :style="{ height: `${trendHeight(week.counted)}px` }"
            />
          </div>
        </div>
      </section>
      <div
        v-if="
          boot?.price_setup && ['sin-precio', 'precio-revisar'].includes(view)
        "
        role="status"
        class="mx-4 mb-3 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-7 sm:mx-6"
      >
        {{ boot.price_setup.reason }}
      </div>
      <div class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
        <FormControl
          class="h-11 w-full sm:hidden"
          type="select"
          :aria-label="__('List', null, 'Productos')"
          :model-value="view"
          :options="phoneViews"
          @update:model-value="selectView"
        />
        <label
          class="relative flex min-w-0 flex-1 items-center"
          :class="inventory ? 'sm:max-w-xs' : ''"
        >
          <span
            class="lucide-search pointer-events-none absolute left-3 h-4 w-4 text-ink-gray-5"
            aria-hidden="true"
          />
          <input
            ref="searchBox"
            v-model="search"
            type="search"
            class="h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base pl-9 pr-3 text-base text-ink-gray-9 placeholder:text-ink-gray-4 focus:border-outline-gray-4 focus:ring-0 sm:h-10 sm:text-sm"
            :placeholder="__('Search name, code or barcode')"
            :aria-label="__('Search name, code or barcode')"
          />
        </label>
        <FormControl
          v-if="storeOptions.length > 2"
          class="h-11 w-full sm:h-auto sm:w-56"
          type="select"
          :aria-label="__('Store', null, 'Productos')"
          :model-value="store"
          :options="storeOptions"
          @update:model-value="selectStore"
        />
        <button
          v-if="catalog"
          type="button"
          class="inline-flex h-11 items-center gap-2 rounded-lg border border-outline-gray-2 px-3 text-sm text-ink-gray-8 sm:hidden"
          :aria-expanded="filterSheet"
          @click="filterSheet = true"
        >
          <FeatherIcon name="sliders" class="h-4 w-4" aria-hidden="true" />
          {{ __('Filters', null, 'Productos') }}
          <span
            v-if="filterChips.length"
            class="rounded-full bg-surface-gray-9 px-1.5 text-xs text-ink-base"
            >{{ filterChips.length }}</span
          >
        </button>
        <div
          v-if="!inventory"
          class="flex h-11 shrink-0 items-center rounded-lg bg-surface-gray-2 p-0.5 sm:h-10"
          role="group"
          :aria-label="__('View', null, 'Productos')"
        >
          <button
            v-for="option in layoutOptions"
            :key="option.value"
            type="button"
            class="flex h-full items-center gap-1.5 rounded-md px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
            :class="
              layout === option.value
                ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm'
                : 'text-ink-gray-6 hover:text-ink-gray-8'
            "
            :aria-pressed="layout === option.value"
            :title="option.label"
            @click="setLayout(option.value)"
          >
            <FeatherIcon
              :name="option.icon"
              class="h-4 w-4"
              aria-hidden="true"
            />
            <span class="hidden md:inline">{{ option.label }}</span>
          </button>
        </div>
        <div
          v-if="inventory"
          class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto"
        >
          <FormControl
            v-if="view === 'sin-contar'"
            class="h-11 sm:h-auto sm:w-44"
            type="select"
            :aria-label="__('Not counted in')"
            :model-value="String(state.days)"
            :options="dayOptions"
            @update:model-value="(value) => update({ dias: value, sel: '' })"
          />
          <FormControl
            v-if="view !== 'conteos-abiertos' && filterOptions.groups.length"
            class="h-11 sm:h-auto sm:w-48"
            type="select"
            :aria-label="__('Group', null, 'Productos')"
            :model-value="state.group"
            :options="groupOptions"
            @update:model-value="(value) => update({ grupo: value, sel: '' })"
          />
          <FormControl
            v-if="view !== 'conteos-abiertos' && filterOptions.brands.length"
            class="h-11 sm:h-auto sm:w-44"
            type="select"
            :aria-label="__('Brand', null, 'Productos')"
            :model-value="state.brand"
            :options="brandOptions"
            @update:model-value="(value) => update({ marca: value, sel: '' })"
          />
        </div>
      </div>
      <div
        v-if="!inventory && !reason"
        class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3 text-sm sm:px-6"
      >
        <p class="text-ink-gray-7" role="status">
          <template v-if="total !== null">
            <strong class="font-semibold tabular-nums text-ink-gray-9">{{
              rows.length.toLocaleString()
            }}</strong>
            {{ __('of {0} products', [total.toLocaleString()]) }}
          </template>
          <template v-else-if="rows.length">
            <strong class="font-semibold tabular-nums text-ink-gray-9">{{
              rows.length.toLocaleString()
            }}</strong>
            {{
              hasMore
                ? __('products shown, more below')
                : __('products', null, 'Productos')
            }}
          </template>
        </p>
        <span v-if="catalog" class="hidden items-center gap-2 sm:flex">
          <FormControl
            class="w-48"
            type="select"
            size="sm"
            :aria-label="__('Stock', null, 'Productos')"
            :model-value="state.stock"
            :options="stockChoices"
            @update:model-value="(value) => filterBy({ existencias: value })"
          />
          <FormControl
            class="w-44"
            type="select"
            size="sm"
            :aria-label="__('Photo', null, 'Productos')"
            :model-value="state.photo"
            :options="photoChoices"
            @update:model-value="(value) => filterBy({ foto: value })"
          />
        </span>
        <button
          v-for="chip in filterChips"
          :key="chip.key"
          type="button"
          class="inline-flex min-h-8 items-center gap-1 rounded-full border border-outline-gray-2 bg-surface-gray-1 py-0.5 pl-3 pr-2 text-xs text-ink-gray-8 hover:bg-surface-gray-2"
          :aria-label="__('Remove filter {0}', [chip.label])"
          @click="filterBy(chip.query)"
        >
          {{ chip.label }}
          <span class="lucide-x h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          v-if="filterChips.length > 1"
          type="button"
          class="text-xs text-ink-gray-6 underline-offset-2 hover:underline"
          @click="filterBy({ grupo: '', existencias: '', foto: '' })"
        >
          {{ __('Clear filters') }}
        </button>
        <span
          v-if="loading && rows.length"
          class="text-xs text-ink-gray-5"
          role="status"
          >{{ __('Updating…') }}</span
        >
      </div>
      <div
        v-if="notice"
        role="status"
        class="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8 sm:mx-6"
      >
        <span class="min-w-0 flex-1">{{ notice }}</span>
        <Button :label="__('Close', null, 'Productos')" @click="notice = ''" />
      </div>
      <div
        v-if="problem"
        role="alert"
        class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button
          v-if="problem.retry !== false"
          class="ml-2"
          :label="__('Retry', null, 'Productos')"
          @click="load()"
        />
      </div>
      <div
        ref="scroller"
        class="min-h-0 flex-1 overflow-y-auto pb-6"
        @scroll.passive="rememberScroll"
      >
        <div
          v-if="selected.size"
          class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-outline-gray-2 bg-surface-base px-4 py-2 sm:px-6"
        >
          <span class="text-sm font-medium" role="status">{{
            selected.size === 1
              ? __('1 selected')
              : __('{0} selected', [selected.size])
          }}</span>
          <Button
            variant="solid"
            class="min-h-11 sm:min-h-8"
            :label="
              countCaps
                ? __('Ask for a count of…')
                : __('Ask the manager for a count')
            "
            @click="openCount(selectedRows)"
          />
          <Button
            class="min-h-11 sm:min-h-8"
            :label="__('Clear selection')"
            @click="clearSelection"
          />
        </div>
        <div
          v-if="reason"
          role="status"
          class="mx-auto max-w-md space-y-3 px-6 py-10 text-center text-ink-gray-7"
        >
          <p class="text-lg font-semibold">
            {{ __('Not allowed', null, 'Productos') }}
          </p>
          <p class="text-sm">{{ reason }}</p>
          <Button
            :label="__('Copy access request')"
            @click="copyRequest(reason)"
          />
          <p v-if="copied" class="text-sm text-ink-gray-6">{{ copied }}</p>
        </div>
        <div
          v-else-if="loading && !rows.length"
          role="status"
          class="px-6 py-8 text-sm text-ink-gray-6"
        >
          {{ __('Loading products…') }}
        </div>
        <div
          v-else-if="!rows.length"
          class="mx-auto max-w-md px-6 py-12 text-center text-ink-gray-7"
        >
          <span
            class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-gray-2"
            aria-hidden="true"
            ><span class="lucide-package-search h-6 w-6 text-ink-gray-6"
          /></span>
          <p class="text-lg font-semibold">{{ emptyTitle }}</p>
          <p class="mt-1 text-sm">{{ emptyBody }}</p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              v-if="search"
              class="min-h-11 sm:min-h-8"
              :label="__('Clear search')"
              @click="search = ''"
            />
            <Button
              v-if="filterChips.length"
              class="min-h-11 sm:min-h-8"
              :label="__('Clear filters')"
              @click="filterBy({ grupo: '', existencias: '', foto: '' })"
            />
            <Button
              v-if="view !== 'todos' && !inventory"
              class="min-h-11 sm:min-h-8"
              :label="__('See all products')"
              @click="selectView('todos')"
            />
          </div>
        </div>
        <ul
          v-else-if="inventory"
          class="divide-y divide-outline-gray-1"
          :aria-label="viewLabel(view)"
        >
          <li
            v-for="row in rows"
            :key="row.key"
            :data-key="row.key"
            :aria-current="focusKey === row.key ? 'true' : undefined"
            :class="
              focusKey === row.key
                ? 'bg-surface-gray-2 ring-1 ring-inset ring-outline-gray-4'
                : ''
            "
          >
            <div class="flex items-start gap-2 px-4 py-3 sm:gap-3 sm:px-6">
              <label
                v-if="selectable(row)"
                class="-my-2 -ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
              >
                <input
                  type="checkbox"
                  class="h-4 w-4 rounded"
                  :checked="selected.has(row.key)"
                  :aria-label="__('Select {0}', [row.title])"
                  @change="toggle(row)"
                />
              </label>
              <div class="min-w-0 flex-1">
                <RouterLink
                  v-if="['stock', 'conteo'].includes(row.kind)"
                  :to="productRoute(row, rowListPath(row))"
                  class="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
                  @click="leaveFor(row)"
                >
                  <span class="block truncate font-medium text-ink-gray-9">{{
                    row.title
                  }}</span>
                  <span class="block truncate text-sm text-ink-gray-6">{{
                    [row.name, groupOf(row), row.warehouse_label]
                      .filter(Boolean)
                      .join(' · ')
                  }}</span>
                </RouterLink>
                <div v-else>
                  <span class="block truncate font-medium text-ink-gray-9">{{
                    row.kind === 'task'
                      ? row.assigned_to_name
                      : __('Stock reconciliation {0}', [row.name])
                  }}</span>
                  <span class="block truncate text-sm text-ink-gray-6">{{
                    [row.warehouse_label, row.task].filter(Boolean).join(' · ')
                  }}</span>
                </div>
                <p
                  v-for="(line, index) in rowLines(row)"
                  :key="index"
                  class="mt-0.5 text-sm"
                  :class="line.tone || 'text-ink-gray-7'"
                >
                  {{ line.text }}
                </p>
              </div>
              <span
                class="shrink-0 text-right text-sm font-medium tabular-nums"
                :class="
                  row.actual_qty < 0 ? 'text-ink-red-7' : 'text-ink-gray-9'
                "
              >
                {{ rowFigure(row) }}
              </span>
            </div>
            <div
              v-if="actionsOf(row).length"
              class="flex flex-wrap gap-2 px-4 pb-3 sm:px-6"
            >
              <div
                class="flex flex-wrap gap-2"
                :class="selectable(row) ? 'ml-12' : ''"
              >
                <template v-for="action in actionsOf(row)" :key="action.key">
                  <a
                    v-if="action.href && !action.disabled"
                    :href="action.href"
                    :target="action.external ? '_blank' : undefined"
                    :rel="action.external ? 'noopener' : undefined"
                    class="inline-flex min-h-11 items-center rounded-md bg-surface-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:min-h-7"
                    @click="leaveFor(row)"
                    >{{ action.label }}</a
                  >
                  <Button
                    v-else
                    class="min-h-11 sm:min-h-7"
                    :label="action.label"
                    :title="action.reason || undefined"
                    @click="runAction(row, action)"
                  />
                </template>
              </div>
            </div>
          </li>
        </ul>
        <ul
          v-else-if="layout === 'tarjetas'"
          class="grid grid-cols-1 gap-3 px-4 pt-1 sm:grid-cols-2 sm:px-6 xl:grid-cols-3 2xl:grid-cols-4"
          :aria-label="viewLabel(view)"
        >
          <li
            v-for="(row, index) in rows"
            :key="`${row.name}:${row.warehouse || ''}`"
            :data-key="legacyKey(row)"
            class="min-w-0"
          >
            <CatalogItem
              :row="row"
              layout="tarjetas"
              :to="productRoute(row, listPath, searching)"
              :tiers="catalog ? tierLines(row, shownLists) : []"
              :focused="focusKey === legacyKey(row)"
              :eager="index < 12"
              :detail="row.warehouse ? stockLabel(row) : ''"
              @click="leaveFor(row)"
            />
          </li>
        </ul>
        <div v-else>
          <div
            class="sticky top-0 z-[1] hidden grid-cols-[2.5rem_minmax(0,1fr)_12rem_9rem_8rem] gap-x-3 border-b border-outline-gray-2 bg-surface-base px-6 py-2 text-xs font-medium uppercase tracking-wide text-ink-gray-5 lg:grid"
            aria-hidden="true"
          >
            <span />
            <span>{{ __('Product', null, 'Productos') }}</span>
            <span>{{ __('Group', null, 'Productos') }}</span>
            <span>{{ __('Stock', null, 'Productos') }}</span>
            <span class="text-right">{{ __('Price', null, 'Productos') }}</span>
          </div>
          <ul
            class="divide-y divide-outline-gray-1"
            :aria-label="viewLabel(view)"
          >
            <li
              v-for="(row, index) in rows"
              :key="`${row.name}:${row.warehouse || ''}`"
              :data-key="legacyKey(row)"
              :class="focusKey === legacyKey(row) ? 'bg-surface-gray-2' : ''"
            >
              <CatalogItem
                :row="row"
                :to="productRoute(row, listPath, searching)"
                :tiers="catalog ? tierLines(row, shownLists) : []"
                :eager="index < 12"
                :detail="row.warehouse ? stockLabel(row) : ''"
                @click="leaveFor(row)"
              />
            </li>
          </ul>
        </div>
        <div
          v-if="hasMore && !reason && !inventory"
          ref="sentinel"
          class="h-px"
          aria-hidden="true"
        />
        <div v-if="hasMore && !reason" class="px-4 py-4 sm:px-6">
          <Button
            :label="__('Load more', null, 'Productos')"
            :loading="loading"
            class="min-h-11 w-full sm:w-auto"
            @click="load({ more: true })"
          />
        </div>
      </div>
    </template>
    <BottomSheet
      v-if="catalog"
      :open="filterSheet"
      :title="__('Filters', null, 'Productos')"
      @update:open="(value) => (filterSheet = value)"
    >
      <div class="px-4 pb-6">
        <CatalogFilters
          touch
          :facets="facets"
          :state="state"
          :loading="facetsLoading"
          @update="filterBy"
        />
        <PriceListsToggle
          v-model="shownLists"
          :lists="boot?.price_lists || []"
          :main="boot?.default_price_list || ''"
        />
      </div>
    </BottomSheet>
    <CountDialog
      v-model="countDialog.open"
      :groups="countDialog.groups"
      :store="store"
      :task="countDialog.task"
      @sent="countSent"
    />
  </ModuleLayout>
</template>
<script setup>
import {
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BottomSheet, Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import { PageHeader } from '@/components/ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import CountDialog from '@/components/productos/CountDialog.vue'
import CatalogFilters from '@/components/productos/CatalogFilters.vue'
import CatalogItem from '@/components/productos/CatalogItem.vue'
import PackDialog from '@/components/productos/PackDialog.vue'
import PriceListsToggle from '@/components/productos/PriceListsToggle.vue'
import { scanPickHref } from '@/composables/shellRail'
import { registerPageShortcuts } from '@/composables/shellKeyboard'
import { hoyLive } from '@/composables/useHoy'
import { useLiveWatch } from '@/vendor/muelle-shell/live-sync/vue'
import {
  DAY_CHOICES,
  SELECTION_URL_MAX,
  activeFilters,
  catalogArgs,
  loadLayout,
  loadShownLists,
  saveLayout,
  saveShownLists,
  tierLines,
  VIEWS,
  daysSince,
  encodeSelection,
  escanerDone,
  groupFacets,
  groupOf,
  healthChips,
  isInventoryView,
  lastCountedLabel,
  listReturn,
  listState,
  loadProductosBoot,
  money,
  normalizeView,
  problemOf,
  productRoute,
  productosApi,
  productosBoot,
  qty,
  requestedLabel,
  rowActions,
  safeReturn,
  scrollKey,
  selectable,
  selectionGroups,
  stockLabel,
  viewLabel,
  withoutDone,
} from '@/composables/useProductos'

const PAGE = 30
// Changes that move these queues; Bin itself is written without events, so
// the ledger (a sale, a receipt) stands in for it. Refetches are bounded.
const LIVE_DOCTYPES = [
  'Stock Reconciliation',
  'Stock Ledger Entry',
  'Mercado Cycle Count Task',
  'Taller Item Ubicacion',
  'Taller Bin Movement',
]
// The catalogue also follows the product and its prices (a price edited in
// Desk or by a colleague), refreshed in place without reordering the list.
const CATALOG_LIVE_DOCTYPES = ['Item', 'Item Price', 'Stock Ledger Entry']
const route = useRoute()
const router = useRouter()
const boot = productosBoot
const rows = ref([])
const counts = ref({})
const summary = ref(null)
const filterOptions = ref({ groups: [], brands: [] })
const hasMore = ref(false)
const loading = ref(false)
const problem = ref(null)
const reason = ref('')
const notice = ref('')
const copied = ref('')
const scroller = ref(null)
const searchBox = ref(null)
const focusKey = ref('')
const selected = ref(new Set())
const known = new Map()
const countDialog = reactive({ open: false, groups: [], task: null })
const total = ref(null)
const facets = ref(null)
const facetsLoading = ref(false)
const filterSheet = ref(false)
const sentinel = ref(null)
const layout = ref('lista')
const state = computed(() => listState(route.query))
const view = computed(() => state.value.view)
const store = computed(() => state.value.store)
const inventory = computed(() => isInventoryView(view.value))
// «Todos» is the catálogo: filters by group, stock and photo, with counts.
const catalog = computed(() => view.value === 'todos')
const filterChips = computed(() =>
  catalog.value ? activeFilters(state.value) : [],
)
// «Escanear» (S): Escáner reads one code and the shell opens its product,
// with «Volver» to this list. «Armar pack»: this list, as Mercado renders it.
const scanHref = computed(() => scanPickHref(route.fullPath, 'Productos'))
const packOpen = ref(false)
// «Precios que se muestran», remembered per browser user.
const shownLists = ref([])
watch(shownLists, (value) => saveShownLists(boot.value?.user, value))
const packFilters = computed(() => ({
  search: search.value.trim(),
  store: store.value,
  ...catalogArgs(state.value),
}))
const packLabel = computed(() =>
  [search.value.trim(), ...filterChips.value.map((chip) => chip.label)]
    .filter(Boolean)
    .join(' · '),
)
const layoutOptions = computed(() => [
  { value: 'lista', label: __('List', null, 'Productos'), icon: 'list' },
  {
    value: 'tarjetas',
    label: __('Cards', null, 'Productos'),
    icon: 'grid',
  },
])
const facetCount = (value) =>
  value === undefined || value === null
    ? ''
    : ` (${Number(value).toLocaleString()})`
const stockChoices = computed(() => [
  { label: __('Stock: all'), value: '' },
  {
    label: __('With stock') + facetCount(facets.value?.stock?.con),
    value: 'con',
  },
  {
    label: __('Sold out') + facetCount(facets.value?.stock?.sin),
    value: 'sin',
  },
])
const photoChoices = computed(() => [
  { label: __('Photo: all'), value: '' },
  {
    label: __('With photo') + facetCount(facets.value?.photo?.con),
    value: 'con',
  },
  {
    label: __('Without photo') + facetCount(facets.value?.photo?.sin),
    value: 'sin',
  },
])
function setLayout(value) {
  layout.value = value
  saveLayout(boot.value?.user, value)
}
const search = ref(state.value.search)
const listPath = computed(() => route.fullPath)
const returnTo = computed(() => safeReturn(route.query.return_to))
const returnLabel = computed(() =>
  String(route.query.return_label || __('Inventario')).slice(0, 40),
)
const caps = computed(() => boot.value?.inventory || null)
const countCaps = computed(() => Boolean(caps.value?.conteo_manager))
let ticket = 0
let searchTimer = 0
let anchor = ''

function countLabel(value) {
  const count = counts.value[value]
  return count
    ? `${viewLabel(value)} · ${count.count.toLocaleString()}${count.more ? '+' : ''}`
    : viewLabel(value)
}
const entries = computed(() =>
  VIEWS.filter((v) => !v.inventory).map((v) => ({
    ...v,
    label: countLabel(v.value),
  })),
)
const inventoryEntries = computed(() =>
  VIEWS.filter((v) => v.inventory && caps.value?.views?.[v.value]).map((v) => ({
    ...v,
    label: countLabel(v.value),
  })),
)
const phoneViews = computed(() => [
  ...entries.value.map((e) => ({ label: e.label, value: e.value })),
  ...inventoryEntries.value.map((e) => ({
    label: `${__('Inventory', null, 'Productos')} · ${e.label}`,
    value: e.value,
  })),
])
const chips = computed(() => healthChips(summary.value))
const storeOptions = computed(() => [
  { label: __('All my stores'), value: '' },
  ...(boot.value?.stores || []),
])
const dayOptions = computed(() =>
  (caps.value?.days || DAY_CHOICES).map((days) => ({
    label: __('Not counted in {0} days', [days]),
    value: String(days),
  })),
)
const groupOptions = computed(() => [
  { label: __('All groups'), value: '' },
  ...groupFacets(filterOptions.value.groups).map((g) => ({
    label: `${g.value} (${g.count.toLocaleString()})`,
    value: g.value,
  })),
])
const brandOptions = computed(() => [
  { label: __('All brands'), value: '' },
  ...filterOptions.value.brands.map((b) => ({
    label: `${b.value} (${b.count.toLocaleString()})`,
    value: b.value,
  })),
])
const trendLabel = computed(() =>
  (summary.value?.trend || [])
    .map((week) =>
      __('Week of {0}: {1} counted, {2} filed', [
        week.start,
        week.counted,
        week.cajones,
      ]),
    )
    .join(' · '),
)
const trendTop = computed(() =>
  Math.max(1, ...(summary.value?.trend || []).map((week) => week.counted)),
)
function trendHeight(value) {
  return value ? Math.max(3, Math.round((value / trendTop.value) * 24)) : 2
}
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __('Ask your manager for permission to read items, then retry.')
    : '',
)
// While searching, the heading names the search and the order is by match.
const searching = computed(() => search.value.trim())
const heading = computed(() =>
  searching.value
    ? __('Results for “{0}”', [searching.value], 'Productos')
    : viewLabel(view.value),
)
const subtitle = computed(() =>
  searching.value && view.value === 'todos'
    ? __(
        'Exact code first, then what is on hand and selling; variants under their product.',
        null,
        'Productos',
      )
    : {
        todos: __(
          'Every active product: on hand and selling first, variants under their product.',
          null,
          'Productos',
        ),
        'sin-precio': __('For sale but without a price in the store list.'),
        'precio-revisar': __(
          'Prices with dates, units or packs that need a decision.',
        ),
        faltan: __('Products with a minimum and nothing on hand in a store.'),
        'bajo-minimo': __('Still on hand, but below the store minimum.'),
        'sin-cajon': __(
          'On hand but not filed in a bin of that store; biggest value first.',
        ),
        'sin-contar': __(
          'On hand and not counted in {0} days (cycle count, bin count or stock adjustment); biggest value first.',
          [state.value.days],
        ),
        negativo: __(
          'The system says less than zero: something left without being recorded coming in.',
        ),
        'por-revisar': __(
          'Counts with a difference waiting for review, and draft stock adjustments.',
        ),
        'conteos-abiertos': __(
          'Counts asked of someone and not sent yet, oldest first.',
        ),
      }[view.value],
)
const emptyTitle = computed(() =>
  search.value ? __('No products match') : __('Nothing here'),
)
const emptyBody = computed(() =>
  search.value
    ? __('Try another name, code or barcode.')
    : view.value === 'todos'
      ? __('Products appear here once they are created.')
      : __('Nothing to do in this list right now.'),
)

// ── selection ────────────────────────────────────────────────────────────
const selectedRows = computed(() =>
  [...selected.value].map((key) => known.get(key) || fromKey(key)),
)
function fromKey(key) {
  const [name, warehouse] = key.split('|')
  return { kind: 'stock', key, name, title: name, warehouse }
}
function selectionStoreKey() {
  return scrollKey(route.fullPath).replace(':scroll:', ':sel:')
}
function saveSelection() {
  const keys = [...selected.value]
  try {
    if (keys.length)
      sessionStorage.setItem(selectionStoreKey(), JSON.stringify(keys))
    else sessionStorage.removeItem(selectionStoreKey())
  } catch {
    /* convenience only */
  }
  const encoded = encodeSelection(keys, store.value)
  update({ sel: encoded.length <= SELECTION_URL_MAX ? encoded : '' })
}
function restoreSelection() {
  let keys = state.value.selected
  if (!keys.length) {
    try {
      keys = JSON.parse(sessionStorage.getItem(selectionStoreKey()) || '[]')
    } catch {
      keys = []
    }
  }
  selected.value = new Set(keys.filter((key) => typeof key === 'string'))
}
function toggle(row, on = !selected.value.has(row.key)) {
  if (!selectable(row)) return
  const next = new Set(selected.value)
  if (on && next.size >= 100) {
    notice.value = __('Up to 100 products at a time.')
    return
  }
  if (on) next.add(row.key)
  else next.delete(row.key)
  anchor = row.key
  selected.value = next
  saveSelection()
}
function extendSelection(row) {
  const keys = rows.value.map((r) => r.key)
  const from = keys.indexOf(anchor)
  const to = keys.indexOf(row.key)
  if (from < 0 || to < 0) return toggle(row, true)
  const next = new Set(selected.value)
  for (const r of rows.value.slice(Math.min(from, to), Math.max(from, to) + 1))
    if (selectable(r) && next.size < 100) next.add(r.key)
  selected.value = next
  saveSelection()
}
function clearSelection() {
  selected.value = new Set()
  saveSelection()
}

// ── rows ─────────────────────────────────────────────────────────────────
function legacyKey(row) {
  return `${row.name}|${row.warehouse || ''}`
}
function rowListPath(row) {
  return listReturn(route.fullPath, row, store.value).to.slice('/crm'.length)
}
function actionsOf(row) {
  return rowActions(row, {
    back: listReturn(route.fullPath, row, store.value),
    caps: {
      scanner: Boolean(
        boot.value?.capabilities?.scanner && caps.value?.scanner_user,
      ),
    },
  })
}
function rowFigure(row) {
  if (row.kind === 'stock')
    return `${qty(row.actual_qty)} ${row.uom || ''}`.trim()
  if (row.kind === 'conteo')
    return `${row.diff_qty > 0 ? '+' : ''}${qty(row.diff_qty)}`
  if (row.kind === 'task') return `${row.items_completed}/${row.items_count}`
  return ''
}
function rowLines(row) {
  const today = boot.value?.today
  const lines = []
  if (row.kind === 'stock') {
    lines.push({
      text: [
        __('Value {0}', [money(row.stock_value)]),
        row.reserved_qty ? __('Reserved {0}', [qty(row.reserved_qty)]) : '',
        row.ordered_qty ? __('{0} on order', [qty(row.ordered_qty)]) : '',
      ]
        .filter(Boolean)
        .join(' · '),
    })
    lines.push({
      text: lastCountedLabel(row.last_counted, today),
      tone: row.last_counted ? 'text-ink-gray-6' : 'text-ink-amber-7',
    })
    if (row.cajones?.length)
      lines.push({
        text: __('Bins: {0}', [
          row.cajones.map((c) => c.label || c.ubicacion).join(', '),
        ]),
        tone: 'text-ink-gray-6',
      })
    if (row.requested?.length)
      lines.push({
        text: requestedLabel(row.requested),
        tone: 'text-ink-blue-7',
      })
  } else if (row.kind === 'conteo') {
    lines.push({
      text: __('Expected {0} · counted {1} · {2}', [
        qty(row.expected_qty),
        row.observed_qty === null ? '—' : qty(row.observed_qty),
        money(row.value),
      ]),
    })
    lines.push({
      text: __('Counted by {0} · {1}', [
        row.counted_by_name || row.counted_by,
        String(row.counted_at || '').slice(0, 16),
      ]),
      tone: 'text-ink-gray-6',
    })
  } else if (row.kind === 'reconciliation') {
    lines.push({
      text: __('{0} products · {1}', [
        row.items,
        (row.sample || []).join(', '),
      ]),
    })
    lines.push({
      text: __('Draft by {0} · {1}', [row.owner_name, row.posting_date || '']),
      tone: 'text-ink-gray-6',
    })
  } else if (row.kind === 'task') {
    const age = daysSince(row.assigned_date, today)
    lines.push({
      text:
        age > 0
          ? __('{0} of {1} counted · asked {2} days ago ({3})', [
              row.items_completed,
              row.items_count,
              age,
              row.assigned_date,
            ])
          : age < 0
            ? __('{0} products · to count on {1}', [
                row.items_count,
                row.assigned_date,
              ])
            : __('{0} of {1} counted · for today', [
                row.items_completed,
                row.items_count,
              ]),
      tone: age > 2 ? 'text-ink-amber-7' : 'text-ink-gray-7',
    })
    if (row.recount)
      lines.push({ text: __('Recount'), tone: 'text-ink-gray-6' })
  }
  return lines
}
function runAction(row, action) {
  if (action.disabled) {
    problem.value = {
      title: __('Not available'),
      detail: action.reason || '',
      retry: false,
    }
    return
  }
  focusKey.value = row.key
  if (action.key === 'count' || action.key === 'ask') openCount([row])
  else if (action.key === 'reassign') {
    countDialog.groups = []
    countDialog.task = row
    countDialog.open = true
  }
}
function openCount(list) {
  const groups = selectionGroups(list.filter(selectable))
  if (!groups.length) return
  countDialog.task = null
  countDialog.groups = groups
  countDialog.open = true
}
async function countSent(result) {
  if (result.kind === 'reassign') {
    notice.value = __('Count reassigned to {0}.', [result.assigned_to_name])
  } else {
    const done = result.kind === 'ask' ? result.items : result.done
    const next = new Set(selected.value)
    for (const item of done || []) next.delete(`${item}|${result.warehouse}`)
    selected.value = next
    saveSelection()
    notice.value =
      result.kind === 'ask'
        ? __('Asked of {0}.', [result.assigned.join(', ')])
        : __('Count of {0} product(s) asked of {1}.', [
            (done || []).length,
            result.assigned_to_name,
          ])
  }
  await refreshAll({ fresh: true })
}
/** Leaving for the record or Escáner: remember the row, scroll and selection. */
function leaveFor(row) {
  focusKey.value = row.key || legacyKey(row)
  rememberScroll()
  try {
    if (selected.value.size)
      sessionStorage.setItem(
        selectionStoreKey(),
        JSON.stringify([...selected.value]),
      )
  } catch {
    /* convenience only */
  }
}

// ── loading ──────────────────────────────────────────────────────────────
function filterArgs() {
  if (catalog.value) return catalogArgs(state.value)
  return inventory.value
    ? {
        days: state.value.days,
        group: state.value.group,
        brand: state.value.brand,
      }
    : {}
}
let restorePending = false
async function load({ more = false, quiet = false } = {}) {
  // A quiet refresh (live sync, after a dialog) never cancels a load the
  // worker is waiting for; that load brings fresh rows anyway.
  if (quiet && loading.value) return
  const mine = ++ticket
  if (!quiet) loading.value = true
  if (!quiet) problem.value = null
  if (!more && !quiet) restorePending = true
  try {
    const page = await productosApi('queue', {
      view: view.value,
      search: search.value.trim(),
      store: store.value,
      start: more ? rows.value.length : 0,
      page_length: quiet
        ? Math.min(Math.max(rows.value.length, PAGE), 100)
        : PAGE,
      ...filterArgs(),
    })
    if (mine !== ticket) return
    reason.value = page.reason || ''
    if (quiet && !more && view.value === 'todos' && rows.value.length) {
      // In place: the worker's place in the catalogue never jumps.
      const fresh = new Map(page.rows.map((row) => [legacyKey(row), row]))
      rows.value = rows.value.map((row) => fresh.get(legacyKey(row)) || row)
    } else rows.value = more ? [...rows.value, ...page.rows] : page.rows
    for (const row of page.rows) if (row.key) known.set(row.key, row)
    hasMore.value = page.has_more
    if (!more) total.value = typeof page.total === 'number' ? page.total : null
    // The list position (focused row or scroll) comes back once per list load.
    if (!more && restorePending) {
      restorePending = false
      restorePosition()
    }
  } catch (error) {
    if (mine !== ticket) return
    problem.value = problemOf(error)
    // A store that is no longer readable falls back to all of the worker's stores.
    if (problem.value.kind === 'permission' && store.value)
      update({ tienda: '' })
  } finally {
    if (mine === ticket) loading.value = false
  }
}
async function loadCounts({ fresh = false } = {}) {
  try {
    counts.value = await productosApi('counts', {
      store: store.value,
      days: state.value.days,
      group: state.value.group,
      brand: state.value.brand,
      fresh: fresh ? 1 : 0,
    })
  } catch {
    counts.value = {}
  }
}
async function loadSummary({ fresh = false } = {}) {
  if (!inventory.value || !caps.value) return
  try {
    summary.value = await productosApi('health', {
      store: store.value,
      days: state.value.days,
      group: state.value.group,
      brand: state.value.brand,
      fresh: fresh ? 1 : 0,
    })
  } catch {
    summary.value = null
  }
}
let facetTicket = 0
async function loadFacets({ fresh = false } = {}) {
  if (!catalog.value) return
  const mine = ++facetTicket
  facetsLoading.value = true
  try {
    const found = await productosApi('catalog_facets', {
      search: search.value.trim(),
      store: store.value,
      ...catalogArgs(state.value),
      fresh: fresh ? 1 : 0,
    })
    if (mine === facetTicket) facets.value = found
  } catch {
    if (mine === facetTicket) facets.value = null
  } finally {
    if (mine === facetTicket) facetsLoading.value = false
  }
}
async function loadFilters() {
  if (!inventory.value || !caps.value) return
  try {
    filterOptions.value = await productosApi('inventory_filters', {
      store: store.value,
    })
  } catch {
    filterOptions.value = { groups: [], brands: [] }
  }
}
function refreshAll({ fresh = false, quiet = true } = {}) {
  return Promise.all([
    load({ quiet }),
    loadCounts({ fresh }),
    loadSummary({ fresh }),
  ])
}

function update(query) {
  const next = { ...route.query, ...query }
  for (const key of Object.keys(next)) if (!next[key]) delete next[key]
  return router.replace({ query: next })
}
function selectView(value) {
  focusKey.value = ''
  update({ vista: normalizeView(value), sel: '', fila: '' })
}
/** A catálogo filter changed (sidebar, sheet or chip): the list starts over. */
function filterBy(query) {
  focusKey.value = ''
  update({ ...query, sel: '', fila: '' })
}
function selectStore(value) {
  update({ tienda: value || '', sel: '', fila: '' })
}
function goReturn() {
  if (returnTo.value) window.location.assign(returnTo.value)
}

// ── position: scroll memory and the focused row ──────────────────────────
function rememberScroll() {
  try {
    sessionStorage.setItem(
      scrollKey(route.fullPath),
      String(scroller.value?.scrollTop || 0),
    )
  } catch {
    /* convenience only */
  }
}
function restorePosition() {
  nextTick(() => {
    const wanted = state.value.focus
    if (
      wanted &&
      rows.value.some((row) => (row.key || legacyKey(row)) === wanted)
    ) {
      focusKey.value = wanted
      scrollToFocus('center')
      return
    }
    try {
      const top = Number(sessionStorage.getItem(scrollKey(route.fullPath)) || 0)
      if (scroller.value && top) scroller.value.scrollTop = top
    } catch {
      /* convenience only */
    }
  })
}
function scrollToFocus(block = 'nearest') {
  const key =
    typeof CSS !== 'undefined' && CSS.escape
      ? CSS.escape(focusKey.value)
      : focusKey.value.replace(/["\\]/g, '\\$&')
  const element = scroller.value?.querySelector(`[data-key="${key}"]`)
  element?.scrollIntoView?.({ block })
}

// ── keyboard (never while typing or over a dialog) ───────────────────────
registerPageShortcuts(null, () => [
  { id: 'search', keys: ['/'], description: 'Focus the list search' },
  { id: 'row.next', keys: ['j', 'arrowdown'], description: 'Next row' },
  { id: 'row.prev', keys: ['k', 'arrowup'], description: 'Previous row' },
  { id: 'row.open', keys: ['enter'], description: 'Open record' },
  ...(scanHref.value
    ? [{ id: 'scan', keys: ['s'], description: 'Scan a code' }]
    : []),
  ...(inventory.value
    ? [
        { id: 'select.toggle', keys: ['x'], description: 'Toggle selection' },
        {
          id: 'select.range',
          keys: ['shift+x'],
          description: 'Extend selection',
        },
        {
          id: 'select.clear',
          keys: ['escape'],
          description: 'Clear selection',
        },
      ]
    : []),
])
let lastKey = { key: '', at: 0 }
function onKey(event) {
  const previous = lastKey
  lastKey = { key: event.key, at: Date.now() }
  if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented)
    return
  if (document.querySelector('[aria-modal="true"]')) return
  if (
    event.target?.closest?.(
      'input, textarea, select, [contenteditable="true"], [role="combobox"]',
    )
  )
    return
  // `g` then a letter is the shell's «go to»; leave it alone.
  if (previous.key === 'g' && lastKey.at - previous.at < 1200) return
  if (route.name !== 'Productos' || guard.value) return
  const keyOf = (row) => row.key || legacyKey(row)
  const index = rows.value.findIndex((row) => keyOf(row) === focusKey.value)
  const move = (step) => {
    if (!rows.value.length) return
    const next = Math.min(
      rows.value.length - 1,
      Math.max(0, index < 0 ? 0 : index + step),
    )
    focusKey.value = keyOf(rows.value[next])
    scrollToFocus()
  }
  const current = index >= 0 ? rows.value[index] : null
  const actions = {
    j: () => move(1),
    ArrowDown: () => move(1),
    k: () => move(-1),
    ArrowUp: () => move(-1),
    '/': () => searchBox.value?.focus(),
    Enter: () => current && openRow(current),
    x: () => inventory.value && current && toggle(current),
    X: () => inventory.value && current && extendSelection(current),
    Escape: () => selected.value.size && clearSelection(),
    s: () => scanHref.value && window.location.assign(scanHref.value),
  }
  const action = actions[event.key]
  if (!action) return
  if (event.key === 'Escape' && !selected.value.size) return
  event.preventDefault()
  action()
}
function openRow(row) {
  leaveFor(row)
  if (!inventory.value || ['stock', 'conteo'].includes(row.kind))
    return router.push(
      productRoute(row, inventory.value ? rowListPath(row) : listPath.value),
    )
  const first = actionsOf(row).find((action) => action.href)
  if (first?.external) window.open(first.href, '_blank', 'noopener')
  else if (first) window.location.assign(first.href)
}

// ── return from a hand-off: `done=<doctype>:<name>` ──────────────────────
async function handleDone() {
  const done = escanerDone(route.query.done)
  if (!done) {
    // Not ours to say (or malformed): never leave it in the URL to replay.
    if (route.query.done) await router.replace(withoutDone(route.fullPath))
    return false
  }
  toast.success(done.text)
  notice.value = done.text
  // An updated product: its row is the one to look at.
  if (done.doctype === 'Item' && !state.value.focus)
    focusKey.value = rows.value.find((row) => row.name === done.name)?.key || ''
  await router.replace(withoutDone(route.fullPath))
  return true
}

async function retryBoot() {
  await loadProductosBoot({ refresh: true })
  if (boot.value?.enabled) start()
}
async function copyRequest(text) {
  const message =
    text ||
    __(
      'I need access to Productos: read permission for Item so I can see prices and stock.',
    )
  const body = text
    ? __('I need access in Productos: {0}', [plainText(text)])
    : message
  try {
    await navigator.clipboard.writeText(body)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = body
  }
}
function plainText(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

watch(search, (value) => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => update({ q: value.trim() }), 250)
})
watch(
  () => [
    route.query.vista,
    route.query.q,
    route.query.tienda,
    route.query.dias,
    route.query.grupo,
    route.query.marca,
    route.query.existencias,
    route.query.foto,
  ],
  (now, before) => {
    if (route.name !== 'Productos' || !boot.value?.enabled) return
    if (typeof route.query.q !== 'string' && search.value) search.value = ''
    load()
    if (catalog.value) loadFacets()
    const filtersChanged =
      now.slice(2).join('|') !== (before || []).slice(2).join('|')
    if (filtersChanged) loadCounts()
    if (inventory.value) {
      loadSummary()
      if (now[2] !== before?.[2] || !filterOptions.value.groups.length)
        loadFilters()
    }
  },
)
watch(
  () => route.query.sel,
  (value) => {
    if ((value || '') !== encodeSelection([...selected.value], store.value))
      restoreSelection()
  },
)
watch(
  () => route.query.done,
  async (value) => {
    if (value && boot.value?.enabled && (await handleDone()))
      refreshAll({ fresh: true })
  },
)
// Someone counted, filed, moved or sold: refresh the Inventario list quietly.
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
useLiveWatch(
  hoyLive(socket),
  LIVE_DOCTYPES,
  () => (inventory.value && boot.value?.enabled ? refreshAll() : null),
  { minIntervalMs: 15000 },
)
useLiveWatch(
  hoyLive(socket),
  CATALOG_LIVE_DOCTYPES,
  () =>
    !inventory.value && boot.value?.enabled ? load({ quiet: true }) : null,
  { minIntervalMs: 15000 },
)

async function start() {
  layout.value = loadLayout(boot.value?.user)
  shownLists.value = loadShownLists(boot.value?.user).filter((list) =>
    (boot.value?.price_lists || []).includes(list),
  )
  restoreSelection()
  const returned = await handleDone()
  load()
  loadFacets({ fresh: returned })
  loadCounts({ fresh: returned })
  loadSummary({ fresh: returned })
  loadFilters()
}
onMounted(async () => {
  window.addEventListener('keydown', onKey)
  await loadProductosBoot()
  if (boot.value?.enabled) start()
})
// Tarjetas and Lista load the next page as it comes into view; the button stays.
let observer = null
watch(sentinel, (element) => {
  observer?.disconnect()
  observer = null
  if (!element || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(
    (entries) => {
      if (
        entries.some((e) => e.isIntersecting) &&
        hasMore.value &&
        !loading.value
      )
        load({ more: true })
    },
    { root: scroller.value, rootMargin: '400px 0px' },
  )
  observer.observe(element)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('keydown', onKey)
  window.clearTimeout(searchTimer)
})
</script>
