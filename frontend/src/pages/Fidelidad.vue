<template>
  <!-- «Fidelidad» (Ventas): what the shop gives back. On top the four quick
       jobs as big tiles, each one sheet of taps; under them the running
       promotions, the points members and the customer groups. The register
       applies and redeems all of it (doco.fidelidad.api). -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-fidelidad
  >
    <AppBar :title="__('Loyalty')" :loading="loading && !!board" />
    <div class="mx-auto w-full max-w-3xl flex-none">
      <p
        v-if="error && !board"
        role="alert"
        class="mx-4 my-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
      >
        {{ error }}
      </p>
      <div v-else-if="!board" role="status" class="space-y-3 px-4 py-4">
        <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div
            v-for="n in 4"
            :key="n"
            class="h-24 animate-pulse rounded-7 bg-surface-gray-2"
          />
        </div>
        <div
          v-for="n in 4"
          :key="`r${n}`"
          class="h-14 animate-pulse rounded-6 bg-surface-gray-2"
        />
      </div>
      <EmptyState
        v-else-if="!caps.register"
        class="py-10"
        :title="__('Promotions need the register')"
        :message="__('Ask whoever runs Muelle to add the register app to this shop.')"
      />
      <template v-else>
        <section
          class="grid grid-cols-2 gap-2 px-4 pt-2 lg:grid-cols-4"
          :aria-label="__('Quick actions')"
          data-fidelidad-rapidas
        >
          <button
            v-for="tile in tiles"
            :key="tile.key"
            type="button"
            class="press flex min-h-24 flex-col items-start justify-between gap-2 rounded-7 border border-outline-gray-2 bg-surface-base p-3 text-left hover:bg-surface-gray-1"
            :class="tile.denied && 'opacity-60'"
            :aria-disabled="tile.denied ? 'true' : undefined"
            :data-testid="`fidelidad-rapida-${tile.key}`"
            @click="openTile(tile)"
          >
            <span
              class="grid size-10 place-items-center rounded-full bg-surface-gray-2"
            >
              <span :class="tile.icon" class="size-5" aria-hidden="true" />
            </span>
            <span class="text-base font-medium leading-tight text-ink-gray-9">
              {{ tile.label }}
            </span>
          </button>
        </section>
        <p
          v-if="deniedNote"
          class="px-4 pt-2 text-sm text-ink-gray-6"
          role="note"
          data-testid="fidelidad-denied"
        >
          {{ deniedNote }}
        </p>

        <div class="px-4 pt-4">
          <Segmented
            v-model="vista"
            :label="__('View')"
            :options="vistaOptions"
          />
        </div>

        <!-- Promociones -->
        <template v-if="vista === 'promociones'">
          <FilterChips
            class="py-2"
            :model-value="estado"
            :chips="estadoChips"
            :deselectable="false"
            :label="__('State')"
            @update:model-value="(v) => v && (estado = v)"
          />
          <EmptyState
            v-if="!shownOffers.length"
            class="py-10"
            :title="emptyTitle"
            :message="caps.create_offer ? __('Start one in a few taps.') : ''"
            :action="caps.create_offer ? __('New promotion') : ''"
            @action="sheet = 'promo'"
          />
          <ul v-else class="divide-y divide-outline-gray-1" data-testid="fidelidad-promos">
            <li v-for="o in shownOffers" :key="o.name">
              <ListRow
                :title="o.title"
                :subtitle="`${offerSummary(o, currency)} · ${offerWhen(o)}`"
                :subtitle-tone="o.ending_soon ? 'text-ink-amber-8' : ''"
                :icon="o.coupon_based ? 'lucide-ticket' : 'lucide-badge-percent'"
                @click="openOffer(o)"
              >
                <template #trailing>
                  <StatusChip
                    :label="offerChip(o).label"
                    :tone="offerChip(o).tone"
                  />
                </template>
              </ListRow>
            </li>
          </ul>
        </template>

        <!-- Puntos -->
        <template v-else-if="vista === 'puntos'">
          <div v-if="program?.state === 'active'" class="px-4 pt-3">
            <div
              class="grid grid-cols-2 gap-px overflow-hidden rounded-7 border border-outline-gray-2 bg-surface-gray-2 lg:grid-cols-4"
              data-testid="fidelidad-programa"
            >
              <div v-for="fact in programFacts" :key="fact.label" class="bg-surface-base p-3">
                <p class="text-xs text-ink-gray-6">{{ fact.label }}</p>
                <p class="num text-base font-semibold text-ink-gray-9">
                  {{ fact.value }}
                </p>
              </div>
            </div>
            <input
              v-model="memberQuery"
              type="search"
              autocomplete="off"
              :placeholder="__('Search a member')"
              :aria-label="__('Search a member')"
              class="mt-3 min-h-12 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base"
              data-testid="fidelidad-miembros-buscar"
            />
          </div>
          <EmptyState
            v-else
            class="py-10"
            :title="__('No points program yet')"
            :message="
              program?.can_create
                ? __('Create it from a customer: Contacts, the customer, «Points and balance».')
                : __('An accounts manager can create it.')
            "
          />
          <p v-if="membersError" role="alert" class="px-4 pt-2 text-sm text-ink-red-7">
            {{ membersError }}
          </p>
          <ul
            v-if="program?.state === 'active' && members.length"
            class="mt-2 divide-y divide-outline-gray-1"
            data-testid="fidelidad-miembros"
          >
            <li v-for="(m, i) in members" :key="m.name" class="flex items-center">
              <ListRow
                class="min-w-0 flex-1"
                :title="m.customer_name"
                :subtitle="m.customer_group || ''"
                :avatar="m.customer_name"
                :to="sourceRoute('Customer', m.name)"
              >
                <template #trailing>
                  <span class="num whitespace-nowrap text-sm font-semibold">
                    {{ __('{0} pts', [m.points]) }}
                  </span>
                </template>
              </ListRow>
              <button
                v-if="caps.adjust_points"
                type="button"
                class="press mr-2 grid size-11 flex-none place-items-center rounded-full hover:bg-surface-gray-2"
                :aria-label="__('Adjust points of {0}', [m.customer_name])"
                :title="__('Adjust points of {0}', [m.customer_name])"
                :data-testid="`fidelidad-ajustar-${i}`"
                @click="adjust(m)"
              >
                <span class="lucide-coins size-4" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <p
            v-else-if="program?.state === 'active' && !membersLoading"
            class="px-4 py-6 text-sm text-ink-gray-6"
          >
            {{ memberQuery ? __('Nothing matches that.') : __('No members yet.') }}
          </p>
        </template>

        <!-- Grupos -->
        <template v-else>
          <p class="px-4 pt-3 text-sm text-ink-gray-6">
            {{ __('A group sets the price list its customers buy at.') }}
          </p>
          <p v-if="groupsError" role="alert" class="px-4 pt-2 text-sm text-ink-red-7">
            {{ groupsError }}
          </p>
          <ul class="mt-2 divide-y divide-outline-gray-1" data-testid="fidelidad-grupos">
            <li v-for="g in groups" :key="g.name">
              <ListRow
                :title="g.label"
                :subtitle="groupLine(g)"
                icon="lucide-users"
                @click="openGroup(g)"
              />
            </li>
          </ul>
        </template>
      </template>
      <div class="h-24 flex-none lg:h-10" aria-hidden="true" />
    </div>

    <Fab
      v-if="phone && caps.create_offer"
      :label="__('New promotion')"
      @click="sheet = 'promo'"
    />

    <PromoSheet
      v-if="mounted.promo"
      :open="sheet === 'promo'"
      :currency="currency"
      :company="board?.company || ''"
      @update:open="(v) => !v && (sheet = '')"
      @created="onCreated"
    />
    <CuponSheet
      v-if="mounted.cupon"
      :open="sheet === 'cupon'"
      :board="board"
      :offer-name="couponOffer"
      :customer="couponCustomer"
      :company="board?.company || ''"
      @update:open="(v) => !v && (sheet = '')"
      @given="load"
      @new-promo="newCouponPromo"
    />
    <PuntosSheet
      v-if="mounted.puntos"
      :open="sheet === 'puntos'"
      :customer="pointsCustomer"
      :company="board?.company || ''"
      @update:open="(v) => !v && (sheet = '')"
      @adjusted="loadMembers"
    />
    <OfertaSheet
      v-if="mounted.oferta"
      :open="sheet === 'oferta'"
      :offer="openedOffer"
      :currency="currency"
      @update:open="(v) => !v && (sheet = '')"
      @changed="onChanged"
      @coupon="giveCoupon"
    />
    <BottomSheet
      :open="sheet === 'grupo'"
      :title="openedGroup?.label || ''"
      :subtitle="openedGroup ? groupLine(openedGroup) : ''"
      @update:open="(v) => !v && (sheet = '')"
    >
      <template v-if="openedGroup">
        <ChipGroup
          v-if="caps.edit_groups"
          v-model="groupPriceList"
          :label="__('Price list')"
          :options="priceListOptions"
          :clear-value="''"
          testid="grupo-lista"
        />
        <p v-else class="text-sm text-ink-gray-6" role="note">
          {{ __('Whoever manages customer groups can change it.') }}
        </p>
        <p v-if="groupsError" role="alert" class="mt-2 text-sm text-ink-red-7">
          {{ groupsError }}
        </p>
      </template>
      <template v-if="caps.edit_groups" #actions>
        <button
          type="button"
          :class="BTN.filled"
          class="press"
          :disabled="groupSaving || groupPriceList === (openedGroup?.price_list || '')"
          data-testid="grupo-guardar"
          @click="saveGroup"
        >
          {{ __('Save price list') }}
        </button>
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  ChipGroup,
  EmptyState,
  Fab,
  FilterChips,
  ListRow,
  Segmented,
  StatusChip,
} from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/documentos/api'
import { isMobile as phone } from '@/composables/breakpoint'
import { sourceRoute } from '@/utils/shellRoutes'
import { formatMoney } from '@/utils/display'
import {
  fidelidadApi,
  offerChip,
  offerSummary,
  offerWhen,
} from '@/composables/fidelidad'

// Sheets mount on their first open (they carry the forms).
const PromoSheet = defineAsyncComponent(
  () => import('@/components/fidelidad/PromoSheet.vue'),
)
const CuponSheet = defineAsyncComponent(
  () => import('@/components/fidelidad/CuponSheet.vue'),
)
const PuntosSheet = defineAsyncComponent(
  () => import('@/components/fidelidad/PuntosSheet.vue'),
)
const OfertaSheet = defineAsyncComponent(
  () => import('@/components/fidelidad/OfertaSheet.vue'),
)

const route = useRoute()
const router = useRouter()
const board = ref(null)
const loading = ref(false)
const error = ref('')
const sheet = ref('')
const mounted = reactive({ promo: false, cupon: false, puntos: false, oferta: false })
watch(sheet, (name) => name && name in mounted && (mounted[name] = true))

const caps = computed(() => board.value?.capabilities || {})
const currency = computed(() => board.value?.currency || 'MXN')
const program = computed(() => board.value?.program)

// --- the view and its state chip live in the URL (back keeps them) -------
const VISTAS = ['promociones', 'puntos', 'grupos']
const vista = computed({
  get: () =>
    VISTAS.includes(route.query.vista) ? route.query.vista : 'promociones',
  set: (value) =>
    router.replace({
      query: { ...route.query, vista: value === 'promociones' ? undefined : value },
    }),
})
const ESTADOS = ['live', 'scheduled', 'paused', 'ended']
const estado = computed({
  get: () => (ESTADOS.includes(route.query.estado) ? route.query.estado : 'live'),
  set: (value) =>
    router.replace({
      query: { ...route.query, estado: value === 'live' ? undefined : value },
    }),
})

const counts = computed(() => board.value?.counts || {})
const vistaOptions = computed(() => [
  { value: 'promociones', label: __('Promotions'), count: counts.value.live || undefined },
  { value: 'puntos', label: __('Points') },
  { value: 'grupos', label: __('Groups') },
])
const estadoChips = computed(() => [
  { value: 'live', label: __('Running'), count: counts.value.live },
  { value: 'scheduled', label: __('Scheduled'), count: counts.value.scheduled },
  { value: 'paused', label: __('Paused'), count: counts.value.paused },
  { value: 'ended', label: __('Ended'), count: counts.value.ended },
])
const shownOffers = computed(() =>
  (board.value?.offers || []).filter((o) => o.state === estado.value),
)
const emptyTitle = computed(
  () =>
    ({
      live: __('No promotion is running'),
      scheduled: __('Nothing scheduled'),
      paused: __('Nothing paused'),
      ended: __('Nothing ended lately'),
    })[estado.value],
)

// --- quick tiles ------------------------------------------------------------
const tiles = computed(() => [
  {
    key: 'promo',
    icon: 'lucide-badge-percent',
    label: __('New promotion'),
    denied: caps.value.denied?.create_offer,
  },
  {
    key: 'cupon',
    icon: 'lucide-ticket',
    label: __('Give a coupon'),
    denied: caps.value.denied?.issue_coupon,
  },
  {
    key: 'puntos',
    icon: 'lucide-coins',
    label: __('Adjust points'),
    denied:
      caps.value.denied?.adjust_points ||
      (program.value?.state !== 'active' ? __('There is no points program yet.') : ''),
  },
  {
    key: 'precios',
    icon: 'lucide-tags',
    label: __('Prices'),
    denied: '',
  },
])
const deniedTile = ref('')
const deniedNote = computed(
  () => tiles.value.find((t) => t.key === deniedTile.value)?.denied || '',
)
function openTile(tile) {
  if (tile.denied) {
    // Say why beside the tiles instead of a dead button.
    deniedTile.value = tile.key
    return
  }
  deniedTile.value = ''
  if (tile.key === 'precios') {
    router.push({ name: 'Precios', query: { return_to: `/crm${route.fullPath}` } })
    return
  }
  if (tile.key === 'cupon') {
    couponOffer.value = ''
    couponCustomer.value = null
  }
  if (tile.key === 'puntos') pointsCustomer.value = null
  sheet.value = tile.key
}

// --- data -------------------------------------------------------------------
let sequence = 0
async function load() {
  const mine = ++sequence
  loading.value = true
  error.value = ''
  try {
    const out = await fidelidadApi('get_board', {
      company: route.query.empresa || '',
    })
    if (mine === sequence) board.value = out
  } catch (failure) {
    if (mine === sequence) error.value = errorText(failure)
  } finally {
    if (mine === sequence) loading.value = false
  }
}
load()

const openedOffer = ref(null)
function openOffer(offer) {
  openedOffer.value = offer
  sheet.value = 'oferta'
}
function onCreated(offer) {
  load()
  estado.value = offer.state || 'live'
  vista.value = 'promociones'
  if (offer.coupon_based) {
    // A coupon promotion is only useful once someone holds a coupon.
    couponOffer.value = offer.name
    couponCustomer.value = null
    setTimeout(() => (sheet.value = 'cupon'), 0)
  }
}
function onChanged() {
  load()
}

const couponOffer = ref('')
const couponCustomer = ref(null)
function giveCoupon(offerName) {
  couponOffer.value = offerName
  couponCustomer.value = null
  sheet.value = 'cupon'
}
function newCouponPromo() {
  sheet.value = 'promo'
}

// --- points -----------------------------------------------------------------
const members = ref([])
const memberQuery = ref('')
const membersLoading = ref(false)
const membersError = ref('')
let memberSeq = 0
async function loadMembers() {
  const mine = ++memberSeq
  membersLoading.value = true
  membersError.value = ''
  try {
    const rows = await fidelidadApi('get_members', {
      company: board.value?.company || '',
      query: memberQuery.value.trim(),
    })
    if (mine === memberSeq) members.value = rows || []
  } catch (failure) {
    if (mine === memberSeq) membersError.value = errorText(failure)
  } finally {
    if (mine === memberSeq) membersLoading.value = false
  }
}
watch(memberQuery, useDebounceFn(loadMembers, 250))
watch(
  () => [vista.value, program.value?.state],
  ([view, state]) => view === 'puntos' && state === 'active' && loadMembers(),
  { immediate: true },
)
const pointsCustomer = ref(null)
function adjust(member) {
  pointsCustomer.value = {
    name: member.name,
    title: member.customer_name,
    points: member.points,
  }
  sheet.value = 'puntos'
}
const programFacts = computed(() => {
  const p = program.value || {}
  return [
    { label: __('Members'), value: p.members ?? 0 },
    {
      label: __('Earns'),
      value: p.collection_factor
        ? __('1 pt per {0}', [formatMoney(p.collection_factor, currency.value, { decimals: 0 })])
        : '—',
    },
    {
      label: __('A point is worth'),
      value: formatMoney(p.conversion_factor || 0, currency.value),
    },
    {
      label: __('Points last'),
      value: p.expiry_days ? __('{0} days', [p.expiry_days]) : __('Forever'),
    },
  ]
})

// --- groups -----------------------------------------------------------------
const groups = ref([])
const priceLists = ref([])
const groupsError = ref('')
watch(
  vista,
  async (view) => {
    if (view !== 'grupos' || groups.value.length) return
    try {
      const out = await fidelidadApi('get_groups')
      groups.value = out.groups || []
      priceLists.value = out.price_lists || []
    } catch (failure) {
      groupsError.value = errorText(failure)
    }
  },
  { immediate: true },
)
function groupLine(group) {
  const people = __('{0} customers', [group.customers])
  return group.price_list
    ? `${people} · ${group.price_list}`
    : `${people} · ${__('Default price list')}`
}
const openedGroup = ref(null)
const groupPriceList = ref('')
const groupSaving = ref(false)
const priceListOptions = computed(() => [
  { value: '', label: __('Default') },
  ...priceLists.value.map((name) => ({ value: name, label: name })),
])
function openGroup(group) {
  openedGroup.value = group
  groupPriceList.value = group.price_list || ''
  groupsError.value = ''
  sheet.value = 'grupo'
}
async function saveGroup() {
  groupSaving.value = true
  groupsError.value = ''
  try {
    const row = await fidelidadApi('set_group_price_list', {
      group: openedGroup.value.name,
      price_list: groupPriceList.value || undefined,
    })
    groups.value = groups.value.map((g) => (g.name === row.name ? row : g))
    toast.success(__('Price list saved for {0}', [row.label]))
    sheet.value = ''
  } catch (failure) {
    groupsError.value = errorText(failure)
  } finally {
    groupSaving.value = false
  }
}

// Deep links: /ventas/fidelidad?nuevo=promo|cupon|puntos opens that sheet.
watch(
  () => [route.query.nuevo, board.value],
  ([nuevo, ready]) => {
    if (!ready || !['promo', 'cupon', 'puntos'].includes(nuevo)) return
    router.replace({ query: { ...route.query, nuevo: undefined } })
    openTile(tiles.value.find((t) => t.key === nuevo))
  },
  { immediate: true },
)
</script>
