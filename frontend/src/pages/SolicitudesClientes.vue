<template>
  <!-- «Solicitudes de clientes» (/negocio/solicitudes-clientes): what
       customers ask the shop from their app, as queues (doco
       storefront_support_staff): returns, warranty, personal data, accounts
       they closed and money waiting for a person. «Todas» leads the chips with
       what waits in each; overdue first, the due day on the row. A row opens
       its sheet with the steps; ?id= opens one from a bell notice, ?cola= keeps
       the queue and ?tienda= the shop. Each person sees only the queues their
       roles read; closed requests of the last 60 days are one tap below.
       It is a Ventas section (/ventas/solicitudes-clientes) for whoever has
       Ventas, and an account page with a way back for the accounts staff
       without it (/negocio/solicitudes-clientes). -->
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-solicitudes
  >
    <AppBar
      :title="__('Customer requests', null, CTX)"
      :count="board && !board.closed ? waiting : undefined"
      :back="!inVentas"
      :loading="loading && !!board"
      :scopes="scopes"
      :scope="board?.profile || ''"
      :scope-title="__('Choose a shop', null, CTX)"
      @update:scope="pickShop"
      @back="onBack"
    />
    <div class="mx-auto w-full max-w-3xl pb-28 pt-2 sm:pb-10">
      <div
        v-if="problem && !board"
        role="alert"
        class="mx-4 mt-2 space-y-3 rounded-6 bg-surface-red-1 p-4"
        data-solicitudes-problema
      >
        <p class="text-sm text-ink-red-7">{{ problem }}</p>
        <button type="button" :class="['press', BTN.tonal]" @click="load">
          {{ __('Try again', null, CTX) }}
        </button>
      </div>
      <ul
        v-else-if="!board"
        class="animate-pulse motion-reduce:animate-none"
        role="status"
        :aria-label="__('Loading…', null, CTX)"
      >
        <li
          v-for="n in 5"
          :key="n"
          class="flex min-h-16 items-center gap-3 px-4 py-2"
        >
          <span class="size-9 flex-none rounded-full bg-surface-gray-2" />
          <span class="flex flex-1 flex-col gap-2">
            <span class="h-3.5 w-1/2 rounded-full bg-surface-gray-2" />
            <span class="h-3 w-3/4 rounded-full bg-surface-gray-1" />
          </span>
        </li>
      </ul>
      <template v-else>
        <FilterChips
          class="pb-2"
          :model-value="queue"
          :chips="chips"
          :label="__('Kind of request', null, CTX)"
          @update:model-value="pickQueue"
        />
        <EmptyState
          v-if="!rows.length"
          class="py-10"
          :title="empty.title"
          :message="empty.message"
          data-solicitudes-vacia
        />
        <ul
          v-else
          class="divide-y divide-outline-gray-1"
          data-solicitudes-lista
        >
          <li v-for="row in rows" :key="row.id">
            <ListRow
              :title="row.who"
              :subtitle="row.line"
              :subtitle-lines="2"
              :meta="row.amount"
              :icon="row.icon"
              :selected="openId === row.id"
              :data-solicitud="row.id"
              @click="openRow(row.id)"
            >
              <template v-if="row.due || row.state" #trailing>
                <StatusChip
                  v-if="row.due"
                  :label="row.due.label"
                  :tone="row.due.tone"
                />
                <StatusChip
                  v-else
                  :label="row.state.label"
                  :tone="row.state.tone"
                />
              </template>
            </ListRow>
          </li>
        </ul>
        <div class="flex justify-center px-4 py-4">
          <button
            type="button"
            :class="['press', BTN.text]"
            data-solicitudes-cerradas
            @click="toggleClosed"
          >
            {{
              board.closed
                ? __('See what waits', null, CTX)
                : __('See closed, last 60 days', null, CTX)
            }}
          </button>
        </div>
      </template>
    </div>

    <SolicitudSheet
      v-if="mounted"
      :id="openId"
      :open="!!openId"
      @update:open="(open) => !open && closeRow()"
      @changed="changed"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AppBar,
  EmptyState,
  FilterChips,
  ListRow,
  StatusChip,
} from '@/components/ui'
import { profileScopes } from '@/components/appClientes/view'
import { readQueue } from '@/components/solicitudesClientes/api'
import { refreshSolicitudesCounts } from '@/components/solicitudesClientes/counts'
import { refreshRailCounts } from '@/composables/shellRail'
import {
  CTX,
  QUEUES,
  emptyText,
  itemRows,
  queueChips,
} from '@/components/solicitudesClientes/view'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/utils/errorText'

// The sheet carries the steps: it mounts on its first open.
const SolicitudSheet = defineAsyncComponent(
  () => import('@/components/solicitudesClientes/SolicitudSheet.vue'),
)

const route = useRoute()
const router = useRouter()
// The page's two homes (router.js): the Ventas section, or the account page.
const NAMES = Object.freeze([
  'SolicitudesClientes',
  'VentasSolicitudesClientes',
])
const inVentas = computed(() => route.name === 'VentasSolicitudesClientes')
const board = ref(null)
const problem = ref('')
const loading = ref(false)
const mounted = ref(false)

const queryText = (key) =>
  typeof route.query[key] === 'string' ? route.query[key] : ''
const queue = computed(() => {
  const asked = queryText('cola')
  return QUEUES.includes(asked) ? asked : ''
})
const openId = computed(() => queryText('id'))
const closed = computed(() => queryText('cerradas') === '1')
const chips = computed(() => queueChips(board.value?.queues))
const rows = computed(() => itemRows(board.value?.items, queue.value))
const waiting = computed(
  () => board.value?.queues?.find((one) => one.key === 'todas')?.count || 0,
)
const empty = computed(() => emptyText(queue.value, board.value?.closed))
const scopes = computed(() => profileScopes(board.value))

let sequence = 0
async function load({ quiet = false } = {}) {
  const mine = ++sequence
  loading.value = true
  if (!quiet) problem.value = ''
  try {
    const answer = await readQueue({
      storefront: queryText('tienda'),
      closed: closed.value,
    })
    if (mine === sequence) board.value = answer || null
  } catch (error) {
    if (mine === sequence)
      problem.value = errorText(
        error,
        __('The requests could not open. Try again.', null, CTX),
      )
  } finally {
    if (mine === sequence) loading.value = false
  }
}
watch(
  [() => route.query.tienda, () => route.query.cerradas],
  () => {
    // Leaving the page moves the route before the page goes.
    if (route.name && !NAMES.includes(route.name)) return
    load()
  },
  { immediate: true },
)
watch(
  openId,
  (id) => {
    if (id) mounted.value = true
  },
  { immediate: true },
)

function setQuery(patch) {
  const query = { ...route.query, ...patch }
  for (const key of Object.keys(query))
    if (query[key] === undefined || query[key] === '') delete query[key]
  router.replace({ query })
}
function pickQueue(value) {
  setQuery({ cola: value || undefined })
}
function pickShop(name) {
  setQuery({ tienda: name || undefined })
}
function toggleClosed() {
  setQuery({ cerradas: closed.value ? undefined : '1', id: undefined })
}
function openRow(id) {
  mounted.value = true
  setQuery({ id })
}
function closeRow() {
  setQuery({ id: undefined })
}
// A step answered: the row follows at once, the counts on a quiet read, and
// the Ventas section's and the rail's badges read again.
function changed(detail) {
  if (detail?.id && board.value) {
    const items = board.value.items || []
    const at = items.findIndex((item) => item.id === detail.id)
    const open = detail.state === 'open' || detail.state === 'in_progress'
    if (at >= 0) {
      if (open === !board.value.closed)
        items.splice(at, 1, { ...items[at], ...pick(detail) })
      else items.splice(at, 1)
    }
  }
  load({ quiet: true })
  refreshSolicitudesCounts({ force: true })
  refreshRailCounts({ force: true })
}
const ITEM_KEYS = [
  'id',
  'queue',
  'kind',
  'reason',
  'who',
  'date',
  'due',
  'overdue',
  'state',
  'ref',
  'amount',
  'currency',
  'scheduled',
]
function pick(detail) {
  const out = {}
  for (const key of ITEM_KEYS) out[key] = detail[key]
  return out
}
// Opened from a link with nothing behind it: back goes to the app's settings.
function onBack(event) {
  if (window.history.state?.back) return
  event?.preventDefault?.()
  router.push('/negocio/app-clientes')
}
</script>
