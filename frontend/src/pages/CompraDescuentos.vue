<template>
  <!-- Compras «Descuentos de proveedor»: the buying Pricing Rules ERPNext
       applies on every purchase save. The title is the door to the states
       (Activos, Programados, Vencidos, Desactivados, Todos); one search; the
       page's one create action is «Nuevo descuento». In the desktop split
       (`pane`) it is the left column: the open discount is lit and rows keep
       the list's state, search and supplier. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      v-model:search="search"
      v-model:search-open="searchOpen"
      :back="{ name: 'Compras' }"
      :back-label="__('Compras', null, 'Compras')"
      :context="__('Compras', null, 'Compras')"
      :title="title"
      :scopes="scopes"
      :scope="state"
      :scope-title="__('Supplier discounts')"
      searchable
      :search-label="__('Search discount, supplier or item')"
      :loading="loading && loaded"
      @update:scope="setState"
    />

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <div :class="['w-full pt-2', pane ? '' : 'mx-auto max-w-3xl']">
        <div v-if="supplier" class="flex flex-wrap gap-2 px-4 pb-2">
          <button
            type="button"
            class="press inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-gray-2 pl-4 pr-2 text-base text-ink-gray-9"
            :aria-label="__('Show every supplier')"
            data-testid="descuentos-proveedor"
            @click="clearSupplier"
          >
            {{ __('Only {0}', [supplierLabel || __('this supplier')]) }}
            <span class="lucide-x size-4" aria-hidden="true" />
          </button>
        </div>

        <EmptyState
          v-if="guard"
          role="alert"
          state="error"
          :title="guard.title"
          :message="guard.detail"
          :action="__('Retry', null, 'Compras')"
          @action="load"
        />
        <EmptyState
          v-else-if="loading && !loaded"
          role="status"
          state="loading"
          :title="__('Loading discounts…')"
        />
        <EmptyState
          v-else-if="loaded && !rows.length"
          :title="emptyTitle"
          :message="emptyMessage"
          :action="
            canCreate && !search ? __('New discount', null, 'Descuentos') : ''
          "
          @action="router.push(newRoute)"
        />
        <ul
          v-else
          class="divide-y divide-outline-gray-1"
          data-testid="descuentos"
        >
          <li v-for="rule in rows" :key="rule.name">
            <ListRow
              :to="rowTo(rule.name)"
              :title="rule.title"
              :subtitle="ruleLine(rule)"
              :subtitle-lines="2"
              :meta="discountFigure(rule.discount, rule.currency || 'MXN')"
              :selected="pane && rule.name === route.params.name"
              :data-descuento="rule.name"
            >
              <template v-if="!state" #trailing>
                <StatusChip
                  :label="stateChip(rule.state).label"
                  :tone="stateChip(rule.state).tone"
                />
              </template>
            </ListRow>
          </li>
        </ul>
        <div class="px-4">
          <button
            v-if="hasMore"
            type="button"
            :class="['press mt-1', BTN.text]"
            :disabled="loading"
            @click="load({ more: true })"
          >
            {{ __('Show more discounts') }}
          </button>
          <p v-if="capped" class="py-2 text-sm text-ink-gray-6">
            {{
              __(
                'Showing the newest 500 discounts. Search to find an older one.',
              )
            }}
          </p>
        </div>
      </div>
    </div>

    <Fab
      v-if="canCreate"
      :label="__('New discount', null, 'Descuentos')"
      icon="lucide-plus"
      :extended="!pane"
      :to="newRoute"
    />
  </div>
</template>
<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  watchEffect,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AppBar, EmptyState, Fab, ListRow, StatusChip } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { problemOf } from '@/composables/useCompras'
import {
  STATES,
  descuentosApi,
  discountFigure,
  normalizeState,
  ruleLine,
  ruleRoute,
  stateChip,
  stateTitle,
} from '@/composables/useDescuentos'

const props = defineProps({
  // Left pane of the desktop split (CompraReglas).
  pane: { type: Boolean, default: false },
})
// In the split: what the list holds, for the right pane before one opens.
const emit = defineEmits(['summary'])
const route = useRoute()
const router = useRouter()
const text = (value) =>
  typeof value === 'string' && value.length <= 140 ? value.trim() : ''

const state = ref(
  route.query.estado === '' ? '' : normalizeState(route.query.estado),
)
const search = ref(text(route.query.q))
const searchOpen = ref(Boolean(search.value))
const supplier = ref(text(route.query.supplier))
const supplierLabel = ref('')
const rows = ref([])
const counts = ref({})
const hasMore = ref(false)
const capped = ref(false)
const canCreate = ref(false)
const loading = ref(false)
const loaded = ref(false)
const guard = ref(null)
let ticket = 0
let timer = 0

const scopes = computed(() =>
  STATES.map((s) => ({
    value: s.value,
    label: __(s.label, null, 'Descuentos'),
    count: s.value ? counts.value[s.value] ?? undefined : undefined,
  })),
)
const title = computed(() => stateTitle(state.value))
const emptyTitle = computed(() =>
  search.value
    ? __('No discount matches «{0}»', [search.value])
    : state.value === 'activo'
      ? __('No active supplier discounts')
      : __('No discounts here'),
)
const emptyMessage = computed(() =>
  search.value
    ? __('Try the supplier’s name, an item code or another state.')
    : __(
        'A supplier discount takes a % or an amount off what you buy from them; it applies on every purchase you save.',
      ),
)
// The list's own state, which a discount opened beside it keeps in the URL.
const listQuery = computed(() => {
  const query = {}
  if (state.value !== 'activo') query.estado = state.value
  if (search.value) query.q = search.value
  if (supplier.value) query.supplier = supplier.value
  return query
})
// Alone, a discount opened from here comes back to this same list; in the
// split the list stays where it is.
function rowTo(name) {
  return props.pane
    ? ruleRoute(name, listQuery.value)
    : ruleRoute(name, {
        return_to: `/crm${route.fullPath}`,
        return_label: __('Supplier discounts'),
      })
}
const newRoute = computed(() =>
  ruleRoute(
    'nuevo',
    props.pane
      ? listQuery.value
      : supplier.value
        ? { supplier: supplier.value }
        : {},
  ),
)

async function load({ more = false } = {}) {
  const mine = ++ticket
  loading.value = true
  guard.value = null
  try {
    const result = await descuentosApi('rules', {
      search: search.value,
      state: state.value,
      supplier: supplier.value,
      start: more ? rows.value.length : 0,
    })
    if (mine !== ticket) return
    rows.value = more ? rows.value.concat(result.rows) : result.rows
    counts.value = result.counts || {}
    hasMore.value = Boolean(result.has_more)
    capped.value = Boolean(result.capped)
    canCreate.value = Boolean(result.can_create)
    supplierLabel.value = result.supplier_label || ''
    loaded.value = true
  } catch (error) {
    if (mine !== ticket) return
    const p = problemOf(error)
    guard.value = {
      title:
        p.kind === 'permission'
          ? __('You cannot see the supplier discounts')
          : __('Could not load the discounts'),
      detail: p.detail,
    }
  } finally {
    if (mine === ticket) loading.value = false
  }
}

// The URL is the list's state: state, search and supplier.
function syncQuery() {
  router.replace({ query: listQuery.value })
}
function setState(value) {
  state.value = value
  syncQuery()
  load()
}
function clearSupplier() {
  supplier.value = ''
  supplierLabel.value = ''
  syncQuery()
  load()
}
watch(search, () => {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    syncQuery()
    load()
  }, 250)
})
watchEffect(() => {
  if (!props.pane) return
  emit('summary', {
    title: title.value,
    state: state.value,
    rows: rows.value,
    loaded: loaded.value,
    rowTo,
  })
})
onMounted(load)
onBeforeUnmount(() => window.clearTimeout(timer))
// The split reloads it after a discount beside it is saved.
defineExpose({ load })
</script>
