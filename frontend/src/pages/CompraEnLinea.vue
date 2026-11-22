<template>
  <!-- Compras › «En línea»: what the business bought through Mercado Pago and
       Mercado Libre. The title is the door to the states (Por registrar,
       Registradas, Apartadas, Todas); one search; the page's one action is
       «Traer compras», which asks Mercado Libre for the last days now (they
       otherwise arrive with Mercado Pago's notice, about a day later). -->
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
      :scope-title="__('Online purchases', null, 'EnLinea')"
      searchable
      :search-label="__('Search product, seller or order', null, 'EnLinea')"
      :loading="loading && loaded"
      @update:scope="setState"
    />

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <div class="mx-auto w-full max-w-3xl pt-2">
        <EmptyState
          v-if="guard"
          role="alert"
          state="error"
          :title="guard.title"
          :message="guard.detail"
          :action="guard.retry ? __('Retry', null, 'Compras') : ''"
          @action="load"
        />
        <EmptyState
          v-else-if="loading && !loaded"
          role="status"
          state="loading"
          :title="__('Loading online purchases…', null, 'EnLinea')"
        />
        <EmptyState
          v-else-if="loaded && !rows.length"
          :title="emptyTitle"
          :message="emptyMessage"
          :action="
            canPull && !search ? __('Bring purchases', null, 'EnLinea') : ''
          "
          @action="openPull"
        />
        <ul
          v-else
          class="divide-y divide-outline-gray-1"
          data-testid="en-linea"
        >
          <li v-for="row in rows" :key="row.compra">
            <ListRow
              :to="rowTo(row.compra)"
              :title="purchaseTitle(row)"
              :subtitle="purchaseSubtitle(row)"
              :meta="money(row.monto)"
              :data-compra="row.compra"
            >
              <template v-if="state === 'todas'" #trailing>
                <StatusChip
                  :label="stateChip(row.estado).label"
                  :tone="stateChip(row.estado).tone"
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
            {{ __('Show more purchases', null, 'EnLinea') }}
          </button>
        </div>
      </div>
    </div>

    <Fab
      v-if="canPull"
      :label="__('Bring purchases', null, 'EnLinea')"
      icon="lucide-refresh-cw"
      extended
      data-en-linea-traer
      @click="openPull"
    />

    <BottomSheet
      :open="pull.open"
      :title="__('Bring purchases from Mercado Libre', null, 'EnLinea')"
      :subtitle="
        __(
          'Nothing is registered: they wait here to be registered.',
          null,
          'EnLinea',
        )
      "
      @close="pull.open = false"
    >
      <div class="space-y-3 px-4 pb-2">
        <p class="text-sm text-ink-gray-7">
          {{ __('How far back', null, 'EnLinea') }}
        </p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="d in [7, 30, 90]"
            :key="d"
            type="button"
            :class="['press', chipClass(pull.dias === d)]"
            :aria-pressed="pull.dias === d"
            @click="setDays(d)"
          >
            {{ __('{0} days', [d], 'EnLinea') }}
          </button>
        </div>
        <p v-if="pull.problem" role="alert" class="text-sm text-ink-red-7">
          {{ pull.problem }}
        </p>
      </div>
      <template #actions>
        <button
          type="button"
          :class="['press', BTN.text]"
          @click="pull.open = false"
        >
          {{ __('Cancel', null, 'Compras') }}
        </button>
        <button
          type="button"
          :class="['press', BTN.filled]"
          :disabled="pull.busy || Boolean(pull.problem)"
          data-en-linea-traer-ahora
          @click="runPull"
        >
          {{ __('Bring now', null, 'EnLinea') }}
        </button>
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  Fab,
  ListRow,
  StatusChip,
} from '@/components/ui'
import { chipClass } from '@/components/ui/chipClass'
import { BTN } from '@/documentos/tools'
import { money, problemOf, requestId } from '@/composables/useCompras'
import {
  STATES,
  applyCard,
  enLineaApi,
  lineError,
  normalizeState,
  previewCard,
  purchaseSubtitle,
  purchaseTitle,
  stateChip,
  stateTitle,
} from '@/composables/useComprasEnLinea'

const route = useRoute()
const router = useRouter()
const text = (value) =>
  typeof value === 'string' && value.length <= 140 ? value.trim() : ''

const state = ref(normalizeState(route.query.estado))
const search = ref(text(route.query.q))
const searchOpen = ref(Boolean(search.value))
const rows = ref([])
const counts = ref({})
const hasMore = ref(false)
const canPull = ref(false)
const loading = ref(false)
const loaded = ref(false)
const guard = ref(null)
const pull = reactive({
  open: false,
  dias: 7,
  busy: false,
  problem: '',
  rid: '',
})
let ticket = 0
let timer = 0

const scopes = computed(() =>
  STATES.map((s) => ({
    value: s.value,
    label: __(s.label, null, 'EnLinea'),
    count: s.key ? (counts.value[s.key] ?? undefined) : undefined,
  })),
)
const title = computed(() => stateTitle(state.value))
const emptyTitle = computed(() =>
  search.value
    ? __('No purchase matches «{0}»', [search.value], 'EnLinea')
    : state.value === 'por_revisar'
      ? __('Nothing left to register', null, 'EnLinea')
      : __('No purchases here', null, 'EnLinea'),
)
const emptyMessage = computed(() =>
  search.value
    ? __('Try the product, the seller or another state.', null, 'EnLinea')
    : __(
        'What you buy with Mercado Pago or on Mercado Libre arrives here by itself, about a day later. «Bring purchases» asks for it now.',
        null,
        'EnLinea',
      ),
)
const listQuery = computed(() => {
  const query = {}
  if (state.value !== 'por_revisar') query.estado = state.value
  if (search.value) query.q = search.value
  return query
})
function rowTo(name) {
  return {
    name: 'CompraEnLineaDetalle',
    params: { name },
    query: { return_to: `/crm${route.fullPath}` },
  }
}

async function boot() {
  const result = await enLineaApi('bootstrap')
  if (!result.available) {
    guard.value = {
      title: __('Not available', null, 'EnLinea'),
      detail: result.reason,
    }
    return false
  }
  if (!result.can_read) {
    guard.value = {
      title: __('You cannot see the online purchases', null, 'EnLinea'),
      detail: __(
        'Ask your manager for access to the accounting of purchases.',
        null,
        'EnLinea',
      ),
    }
    return false
  }
  counts.value = result.counts || {}
  canPull.value = Boolean(result.can_book)
  return true
}

async function load({ more = false } = {}) {
  const mine = ++ticket
  loading.value = true
  guard.value = null
  try {
    if (!loaded.value && !(await boot())) return
    const result = await enLineaApi('queue', {
      estado: state.value,
      texto: search.value,
      start: more ? rows.value.length : 0,
    })
    if (mine !== ticket) return
    rows.value = more ? rows.value.concat(result.rows) : result.rows
    hasMore.value = Boolean(result.has_more)
    loaded.value = true
  } catch (error) {
    if (mine !== ticket) return
    const p = problemOf(error)
    guard.value = {
      title:
        p.kind === 'permission'
          ? __('You cannot see the online purchases', null, 'EnLinea')
          : __('Could not load the online purchases', null, 'EnLinea'),
      detail: p.detail,
      retry: true,
    }
  } finally {
    if (mine === ticket) loading.value = false
  }
}

function syncQuery() {
  router.replace({ query: listQuery.value })
}
function setState(value) {
  state.value = normalizeState(value)
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

// «Traer compras»: the card first (is Mercado Libre connected?), then the tap.
async function checkPull() {
  pull.problem = ''
  try {
    const card = await previewCard('traer_compras_mercado_libre', {
      dias: pull.dias,
    })
    pull.problem = lineError(card.lines?.[0])
  } catch (error) {
    pull.problem = problemOf(error).detail
  }
}
function openPull() {
  pull.open = true
  pull.rid = requestId()
  checkPull()
}
function setDays(d) {
  pull.dias = d
  pull.rid = requestId()
  checkPull()
}
async function runPull() {
  pull.busy = true
  try {
    const result = await applyCard(
      'traer_compras_mercado_libre',
      { dias: pull.dias },
      pull.rid,
    )
    toast.success(result.receipt || __('Purchases brought in', null, 'EnLinea'))
    pull.open = false
    loaded.value = false
    load()
  } catch (error) {
    pull.problem = problemOf(error).detail
  } finally {
    pull.busy = false
  }
}

onMounted(load)
onBeforeUnmount(() => window.clearTimeout(timer))
</script>
