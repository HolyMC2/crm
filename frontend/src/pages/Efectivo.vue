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
      @update:scope="pickScope"
      @update:search="(v) => (search = v)"
      @update:search-open="(v) => (searchOpen = v)"
    />

    <div class="mx-auto w-full max-w-3xl flex-1">
      <div
        v-if="loadError"
        role="alert"
        class="mx-4 my-3 space-y-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
      >
        <p>{{ loadError }}</p>
        <Button label="Reintentar" @click="load()" />
      </div>
      <div v-else-if="!data" role="status" aria-label="Cargando efectivo…" class="space-y-3 px-4 py-4">
        <div class="h-28 animate-pulse rounded-7 bg-surface-gray-2" />
        <div v-for="n in 4" :key="n" class="h-16 animate-pulse rounded-7 bg-surface-gray-2" />
      </div>
      <template v-else>
        <EmptyState
          v-if="!safes.length"
          class="py-10"
          state="empty"
          title="Sin cajas fuertes a tu cargo"
          message="Cuando el encargado te dé acceso a la caja fuerte de tu tienda, aquí ves sus bolsas y lo que te toca."
        />

        <!-- Hero: the cash this worker answers for, in figures. -->
        <section
          v-if="hero"
          class="mx-4 mt-2 rounded-8 bg-surface-gray-1 p-4"
          aria-label="Efectivo en las cajas fuertes"
          data-efectivo-hero
        >
          <p class="text-sm text-ink-gray-6">{{ hero.label }}</p>
          <p class="num mt-1 break-words text-3xl font-semibold text-ink-gray-9">
            {{ money(hero.balance, hero.currency) }}
          </p>
          <dl class="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt class="text-ink-gray-6">Suelto</dt>
              <dd class="num font-medium text-ink-gray-9">{{ money(hero.loose, hero.currency) }}</dd>
            </div>
            <div>
              <dt class="text-ink-gray-6">En bolsas</dt>
              <dd class="num font-medium text-ink-gray-9">{{ money(hero.bagged, hero.currency) }}</dd>
            </div>
            <div>
              <dt class="text-ink-gray-6">Rumbo al banco</dt>
              <dd class="num font-medium text-ink-gray-9">{{ money(hero.transit, hero.currency) }}</dd>
            </div>
          </dl>
        </section>
        <p
          v-else-if="safes.length"
          class="mx-4 mt-2 rounded-8 bg-surface-gray-1 p-4 text-sm text-ink-gray-7"
        >
          Los saldos de la caja fuerte los ve quien la cuida. Aquí ves tus bolsas y quién las tiene.
        </p>

        <!-- Te toca: this worker's next steps, oldest first. -->
        <section v-if="waitingRows.length" class="mt-5" aria-label="Te toca" data-efectivo-waiting>
          <h2 class="flex items-baseline gap-2 px-4 pb-1 text-sm font-semibold text-ink-gray-8">
            <span class="num text-ink-gray-9">{{ waitingRows.length }}</span> Te toca
          </h2>
          <ul class="divide-y divide-outline-gray-1">
            <li v-for="row in shownWaiting" :key="row.key" class="flex items-center" :data-waiting="row.action">
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
                  <span class="num text-base font-semibold text-ink-gray-9">{{ row.amount }}</span>
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

        <!-- The safes: balance and the island of what the safe itself needs. -->
        <section v-if="visibleSafes.length > 1 || (visibleSafes[0] && visibleSafes[0].can.count_safe)" class="mt-5" aria-label="Cajas fuertes">
          <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-8">Cajas fuertes</h2>
          <ul class="space-y-2 px-4">
            <li
              v-for="safe in visibleSafes"
              :key="safe.safe"
              class="flex items-center gap-3 rounded-7 border border-outline-gray-1 px-4 py-3"
              :data-safe="safe.safe"
            >
              <span class="lucide-vault size-6 flex-none text-ink-gray-6" aria-hidden="true" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-base font-medium text-ink-gray-9">{{ safe.title }}</p>
                <p class="truncate text-sm text-ink-gray-6">{{ safeLine(safe) }}</p>
              </div>
              <span v-if="safe.balance !== null" class="num text-base font-semibold text-ink-gray-9">{{
                money(safe.balance, safe.currency)
              }}</span>
              <div v-if="safe.can.count_safe" class="flex flex-none rounded-full bg-surface-gray-1 p-0.5">
                <button
                  type="button"
                  class="press grid size-10 place-items-center rounded-full text-ink-gray-7"
                  :aria-label="`Contar ${safe.title}`"
                  title="Contar la caja fuerte"
                  @click="open(countSafe(safe))"
                >
                  <span class="lucide-calculator size-5" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ul>
        </section>

        <!-- Bags by state. -->
        <section v-if="allBags.length" class="mt-5" aria-label="Bolsas" data-efectivo-bags>
          <h2 class="px-4 pb-2 text-sm font-semibold text-ink-gray-8">Bolsas</h2>
          <div class="px-4 pb-2">
            <Segmented v-model="bagView" label="Bolsas" fit="content" :options="bagViews" />
          </div>
          <ul v-if="shownBags.length" class="divide-y divide-outline-gray-1">
            <li v-for="bag in shownBags" :key="bag.name" :data-bag="bag.name">
              <ListRow
                :title="bag.seal"
                :subtitle="bagLine(bag)"
                :subtitle-tone="bag.state === 'Disputed' ? 'danger' : ''"
                icon="lucide-banknote"
                :to="{ name: 'EfectivoBolsa', params: { name: bag.name } }"
              >
                <template #trailing>
                  <div class="flex flex-col items-end gap-1">
                    <span class="num text-base font-semibold text-ink-gray-9">{{ money(bag.amount, bag.currency) }}</span>
                    <StatusChip v-if="bag.state === 'Unverified'" label="Falta verificar" tone="warning" />
                    <StatusChip v-else-if="bagView === 'done'" :label="bagState(bag.state).label" tone="neutral" />
                  </div>
                </template>
              </ListRow>
            </li>
          </ul>
          <p v-else class="px-4 py-3 text-sm text-ink-gray-6">{{ emptyBags }}</p>
        </section>

        <!-- Traslados between the safe and the cajas. -->
        <section v-if="liveTransfers.length" class="mt-5" aria-label="Traslados">
          <h2 class="flex items-baseline gap-2 px-4 pb-1 text-sm font-semibold text-ink-gray-8">
            <span class="num text-ink-gray-9">{{ liveTransfers.length }}</span> Traslados
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
                  <span class="num text-base font-semibold text-ink-gray-9">{{
                    t.amounts_hidden ? '' : money(fromMinor(t.dispatched_minor !== '0' ? t.dispatched_minor : t.declared_minor), t.currency)
                  }}</span>
                </template>
              </ListRow>
            </li>
          </ul>
        </section>

        <!-- Arqueos: recent safe counts and every count still waiting for review. -->
        <section v-if="arqueos.length" class="mt-5" aria-label="Arqueos">
          <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-8">Arqueos</h2>
          <ul class="divide-y divide-outline-gray-1">
            <li v-for="c in arqueos" :key="c.name">
              <ListRow
                :title="countTitle(c)"
                :subtitle="`${who(c.counted_by, people)} · ${formatDateTime(c.modified)}`"
                :subtitle-tone="c.state === 'Exception' ? 'danger' : ''"
                icon="lucide-calculator"
                :to="c.bag ? { name: 'EfectivoBolsa', params: { name: c.bag } } : null"
                @click="!c.bag && c.state === 'Exception' && c._safe.can.review && open(reviewCount(c, c._safe, people))"
              >
                <template #trailing>
                  <div class="flex flex-col items-end">
                    <span class="num text-base font-semibold text-ink-gray-9">{{ money(c.amount, c._safe.currency) }}</span>
                    <span v-if="c.state === 'Exception' && c.difference" class="num text-sm text-ink-red-7">{{
                      signed(c.difference, c._safe.currency)
                    }}</span>
                  </div>
                </template>
              </ListRow>
            </li>
          </ul>
        </section>
        <div class="h-28 flex-none lg:h-12" aria-hidden="true" />
      </template>
    </div>

    <Fab v-if="sealable.length" label="Sellar bolsa" icon="lucide-package-plus" @click="startSeal" />

    <BottomSheet v-model:open="choosing" title="¿De qué caja fuerte sale?" flush>
      <ul class="divide-y divide-outline-gray-1">
        <li v-for="safe in sealable" :key="safe.safe">
          <ListRow
            :title="safe.title"
            :subtitle="safe.loose_balance === null ? '' : `Suelto ${money(safe.loose_balance, safe.currency)}`"
            icon="lucide-vault"
            @click="(choosing = false), open(sealBag(safe, me))"
          />
        </li>
      </ul>
    </BottomSheet>
    <StepHost :step="step" @close="step = null" @done="afterStep" />
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { AppBar, BottomSheet, EmptyState, Fab, ListRow, Segmented, StatusChip } from '@/components/ui'
import StepHost from '@/components/efectivo/StepHost.vue'
import {
  WAITING_LABELS,
  bagState,
  errorText,
  fromMinor,
  holderText,
  homeRead,
  money,
  who,
} from '@/components/efectivo/efectivo'
import {
  approveChange,
  authorize,
  countSafe,
  declineChange,
  handTransfer,
  reviewCount,
  sealBag,
} from '@/components/efectivo/steps'
import { useLiveList } from '@/composables/liveList'
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
const me = computed(() => data.value?.user || '')
const safes = computed(() => data.value?.safes || [])
const scope = computed(() => String(route.query.caja || ''))
const safeScopes = computed(() =>
  safes.value.length > 1
    ? [{ value: '', label: 'Todas las cajas fuertes' }, ...safes.value.map((s) => ({ value: s.safe, label: s.title }))]
    : [],
)
const visibleSafes = computed(() =>
  scope.value ? safes.value.filter((s) => s.safe === scope.value) : safes.value,
)
function pickScope(value) {
  router.replace({ query: { ...route.query, caja: value || undefined } })
}

const hero = computed(() => {
  const shown = visibleSafes.value.filter((s) => s.balance !== null && s.balance !== undefined)
  if (!shown.length) return null
  const currency = shown[0].currency
  if (shown.some((s) => s.currency !== currency)) return null
  const sum = (key) => shown.reduce((n, s) => n + (Number(s[key]) || 0), 0)
  return {
    label: shown.length === 1 ? `En ${shown[0].title}` : 'En tus cajas fuertes',
    currency,
    balance: sum('balance'),
    loose: sum('loose_balance'),
    bagged: sum('balance') - sum('loose_balance'),
    transit: sum('in_transit'),
  }
})

function safeLine(safe) {
  const open = safe.bags.filter((b) => ['Unverified', 'Available', 'Disputed'].includes(b.state)).length
  const transit = safe.bags.filter((b) => b.state === 'In Transit').length
  const parts = []
  parts.push(open === 1 ? '1 bolsa sellada' : `${open} bolsas selladas`)
  if (transit) parts.push(`${transit} rumbo al banco`)
  return parts.join(', ')
}

const tagged = (key) =>
  visibleSafes.value.flatMap((safe) => (safe[key] || []).map((row) => ({ ...row, currency: safe.currency, _safe: safe })))
const allBags = computed(() => tagged('bags'))
const matches = (bag) =>
  !search.value.trim() ||
  matchTokens(
    [bag.seal, who(bag.prepared_by, people.value), who(bag.holder?.user, people.value), String(bag.amount), bagState(bag.state).label].join(' '),
    search.value,
  )
const VIEWS = {
  sealed: ['Unverified', 'Available'],
  transit: ['In Transit'],
  diff: ['Disputed'],
  done: ['Deposited', 'Issued', 'Unpacked', 'Transferred'],
}
const bagViews = computed(() => {
  const count = (v) => allBags.value.filter((b) => VIEWS[v].includes(b.state)).length
  return [
    { value: 'sealed', label: 'Selladas', count: count('sealed') },
    { value: 'transit', label: 'En camino', count: count('transit') },
    { value: 'diff', label: 'Con diferencia', count: count('diff') },
    { value: 'done', label: 'Terminadas', count: count('done') },
  ]
})
const shownBags = computed(() =>
  allBags.value.filter((b) => VIEWS[bagView.value].includes(b.state) && matches(b)),
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
  if (h.kind === 'safe') return `${fund}${fund ? 'responde' : 'Responde'} ${who(h.user, people.value)}`
  return fund + holderText(bag, people.value)
}

const liveTransfers = computed(() =>
  tagged('transfers').filter((t) => !['Completed', 'Cancelled', 'Returned', 'Received'].includes(t.state)),
)
const TRANSFER_KIND = { Float: 'Fondo', Change: 'Cambio', Drop: 'Retiro', SafeHandoff: 'Entrega' }
function transferTitle(t) {
  const to = t.destination_kind === 'Safe' ? 'la caja fuerte' : t.destination_label || 'una caja'
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
  if (t.source_kind === 'Safe' && ['Draft', 'Prepared'].includes(t.state) && safe.can.prepare)
    open(handTransfer(t, safe))
}

const arqueos = computed(() =>
  tagged('counts')
    .filter((c) => c.state === 'Exception' || c.scope === 'Safe')
    .slice(0, 8),
)
function countTitle(c) {
  const what = { Safe: 'Arqueo de la caja fuerte', Bag: 'Conteo de bolsa', Drawer: 'Corte de caja', Fund: 'Ingreso a la caja fuerte' }[c.scope] || 'Conteo'
  return c.state === 'Exception' ? `${what}: no cuadró` : what
}
function signed(n, currency) {
  const v = Number(n) || 0
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${money(Math.abs(v), currency)}`
}

function waitingLine(action, bag) {
  const name = (u) => who(u, people.value)
  if (action === 'verify') return `la selló ${name(bag.prepared_by)}`
  if (action === 'dispatch') return bag.verified_by ? `la verificó ${name(bag.verified_by)}` : 'verificada'
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
          amount: t.amounts_hidden ? '' : money(fromMinor(t.declared_minor), safe.currency),
          open: () => transferStep({ ...t, _safe: safe }),
        })
      }
    }
  }
  for (const a of data.value?.authorizations || []) {
    rows.push({
      key: `a:${a.name}`,
      action: 'authorize',
      title: a.event === 'cancel' ? 'Autorizar una cancelación' : 'Autorizar un registro',
      subtitle: `${a.title || a.document_name} · lo pide ${who(a.requested_by, people.value)}`,
      urgent: true,
      icon: 'lucide-signature',
      amount: money(fromMinor(a.amount_minor), safes.value[0]?.currency || 'MXN'),
      open: () => open(authorize(a, people.value, safes.value[0]?.currency || 'MXN')),
    })
  }
  return rows
})

const allWaiting = ref(false)
const WAITING_SHOWN = 5
const shownWaiting = computed(() =>
  allWaiting.value || search.value.trim() ? waitingRows.value : waitingRows.value.slice(0, WAITING_SHOWN),
)

const sealable = computed(() => visibleSafes.value.filter((s) => s.can.prepare))
function startSeal() {
  if (sealable.value.length === 1) open(sealBag(sealable.value[0], me.value))
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
function afterStep() {
  load()
}
watch(scope, () => (bagView.value = 'sealed'))
load()
// A cajero's drop, a teammate's verification or the bank run land without a reload.
useLiveList(['POS Cash Bag', 'POS Cash Count', 'POS Cash Transfer', 'POS Cash Change Request'], load)
defineExpose({ reload: load })
</script>
