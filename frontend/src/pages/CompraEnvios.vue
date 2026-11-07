<template>
  <!-- Compras «Reglas de envío»: the buying Shipping Rules a purchase picks
       in «Más datos»; ERPNext adds the charge on every save. The title is the
       door to the states (Activas, Desactivadas, Todas); one search; the
       page's one create action is «Nueva regla de envío». -->
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
      :scope-title="__('Shipping rules')"
      searchable
      :search-label="__('Search shipping rule or account')"
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
          :action="__('Retry', null, 'Compras')"
          @action="load"
        />
        <EmptyState
          v-else-if="loading && !loaded"
          role="status"
          state="loading"
          :title="__('Loading shipping rules…')"
        />
        <EmptyState
          v-else-if="loaded && !rows.length"
          :title="emptyTitle"
          :message="emptyMessage"
          :action="
            canCreate && !search ? __('New shipping rule', null, 'Envios') : ''
          "
          @action="router.push(newRoute)"
        />
        <ul v-else class="divide-y divide-outline-gray-1" data-testid="envios">
          <li v-for="rule in rows" :key="rule.name">
            <ListRow
              :to="ruleRoute(rule.name, backQuery)"
              icon="lucide-truck"
              :title="rule.label"
              :subtitle="rowLine(rule)"
              :subtitle-lines="2"
              :data-envio="rule.name"
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
            {{ __('Show more shipping rules') }}
          </button>
          <p v-if="capped" class="py-2 text-sm text-ink-gray-6">
            {{
              __(
                'Showing the newest 500 shipping rules. Search to find an older one.',
              )
            }}
          </p>
        </div>
      </div>
    </div>

    <Fab
      v-if="canCreate"
      :label="__('New shipping rule', null, 'Envios')"
      icon="lucide-plus"
      :to="newRoute"
    />
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AppBar, EmptyState, Fab, ListRow, StatusChip } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { problemOf } from '@/composables/useCompras'
import {
  STATES,
  chargeSummary,
  enviosApi,
  normalizeState,
  ruleRoute,
  stateChip,
  stateTitle,
} from '@/composables/useEnvios'

const route = useRoute()
const router = useRouter()
const text = (value) =>
  typeof value === 'string' && value.length <= 140 ? value.trim() : ''

const state = ref(
  route.query.estado === '' ? '' : normalizeState(route.query.estado),
)
const search = ref(text(route.query.q))
const searchOpen = ref(Boolean(search.value))
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
    label: __(s.label, null, 'Envios'),
    count: s.value ? counts.value[s.value] ?? undefined : undefined,
  })),
)
const title = computed(() => stateTitle(state.value))
const emptyTitle = computed(() =>
  search.value
    ? __('No shipping rule matches «{0}»', [search.value])
    : state.value === 'activo'
      ? __('No active shipping rules')
      : __('No shipping rules here'),
)
const emptyMessage = computed(() =>
  search.value
    ? __('Try the rule’s name, the account or another state.')
    : __(
        'A shipping rule adds what the delivery costs to a purchase: a fixed amount, or by the purchase’s amount or weight.',
      ),
)
// What it charges first (what a buyer scans for), then where it goes.
function rowLine(rule) {
  const line = chargeSummary(rule)
  const account = rule.account?.label
  return account ? `${line}. ${__('Charged to {0}', [account])}.` : `${line}.`
}
const newRoute = computed(() => ruleRoute('nuevo'))
// A rule opened from here comes back to this same list.
const backQuery = computed(() => ({
  return_to: `/crm${route.fullPath}`,
  return_label: __('Shipping rules'),
}))

async function load({ more = false } = {}) {
  const mine = ++ticket
  loading.value = true
  guard.value = null
  try {
    const result = await enviosApi('rules', {
      search: search.value,
      state: state.value,
      start: more ? rows.value.length : 0,
    })
    if (mine !== ticket) return
    rows.value = more ? rows.value.concat(result.rows) : result.rows
    counts.value = result.counts || {}
    hasMore.value = Boolean(result.has_more)
    capped.value = Boolean(result.capped)
    canCreate.value = Boolean(result.can_create)
    loaded.value = true
  } catch (error) {
    if (mine !== ticket) return
    const p = problemOf(error)
    guard.value = {
      title:
        p.kind === 'permission'
          ? __('You cannot see the shipping rules')
          : __('Could not load the shipping rules'),
      detail: p.detail,
    }
  } finally {
    if (mine === ticket) loading.value = false
  }
}

// The URL is the list's state: state and search.
function syncQuery() {
  const query = {}
  if (state.value !== 'activo') query.estado = state.value
  if (search.value) query.q = search.value
  router.replace({ query })
}
function setState(value) {
  state.value = value
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
onMounted(load)
onBeforeUnmount(() => window.clearTimeout(timer))
</script>
