<template>
  <!-- «Fidelidad» (Ventas): what the shop gives back. On a phone the four
       quick jobs are big tiles, each one sheet of taps, over one list at a
       time: the running promotions, the points members or the customer
       groups. On desktop the quick jobs are buttons in the bar and the whole
       board shows at once: the figures, the promotions as a table, the points
       programme beside them and the groups under them. The register applies
       and redeems all of it (doco.fidelidad.api). -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-fidelidad
  >
    <AppBar :title="__('Loyalty')" :loading="loading && !!board">
      <template v-if="!phone && board && caps.register" #actions>
        <div
          class="mr-1 flex items-center gap-2"
          role="group"
          :aria-label="__('Quick actions')"
          data-fidelidad-rapidas
        >
          <button
            v-for="tile in tiles"
            :key="tile.key"
            type="button"
            class="press inline-flex h-10 items-center justify-center gap-2 rounded-full text-base-medium"
            :class="[
              tile.key === 'promo'
                ? 'bg-surface-gray-10 px-4 text-ink-base hover:bg-surface-gray-9'
                : 'bg-surface-gray-2 text-ink-gray-9 hover:bg-surface-gray-3',
              tile.key !== 'promo' && (roomy ? 'px-4' : 'w-10'),
              tile.denied && 'opacity-60',
            ]"
            :aria-label="roomy || tile.key === 'promo' ? undefined : tile.label"
            :title="tile.label"
            :aria-describedby="
              tile.denied && deniedTile === tile.key
                ? 'fidelidad-denied'
                : undefined
            "
            :data-testid="`fidelidad-rapida-${tile.key}`"
            @click="openTile(tile)"
          >
            <span :class="tile.icon" class="size-4" aria-hidden="true" />
            <template v-if="roomy || tile.key === 'promo'">{{
              tile.label
            }}</template>
          </button>
        </div>
      </template>
    </AppBar>
    <div
      ref="frame"
      class="mx-auto w-full flex-none"
      :class="phone ? 'max-w-3xl' : 'max-w-6xl px-6 pt-5'"
    >
      <p
        v-if="error && !board"
        role="alert"
        class="my-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
        :class="phone && 'mx-4'"
      >
        {{ error }}
      </p>
      <div
        v-else-if="!board"
        role="status"
        class="space-y-3"
        :class="phone && 'p-4'"
      >
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
        :message="
          __('Ask whoever runs Muelle to add the register app to this shop.')
        "
      />

      <!-- Phone: the quick tiles, then one list at a time. -->
      <template v-else-if="phone">
        <section
          class="grid grid-cols-2 gap-2 px-4 pt-2"
          :aria-label="__('Quick actions')"
          data-fidelidad-rapidas
        >
          <button
            v-for="tile in tiles"
            :key="tile.key"
            type="button"
            class="press flex min-h-24 flex-col items-start justify-between gap-2 rounded-7 border border-outline-gray-2 bg-surface-base p-3 text-left hover:bg-surface-gray-1"
            :class="tile.denied && 'opacity-60'"
            :aria-describedby="
              tile.denied && deniedTile === tile.key
                ? 'fidelidad-denied'
                : undefined
            "
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
          id="fidelidad-denied"
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
          <PromosLista
            v-else
            :offers="shownOffers"
            :currency="currency"
            @open="openOffer"
          />
        </template>

        <template v-else-if="vista === 'puntos'">
          <div v-if="programActive" class="px-4 pt-3">
            <div
              class="grid grid-cols-2 gap-px overflow-hidden rounded-7 border border-outline-gray-2 bg-surface-gray-2"
              data-testid="fidelidad-programa"
            >
              <div
                v-for="fact in programFacts"
                :key="fact.key"
                class="bg-surface-base p-3"
              >
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
            :message="noProgramMessage"
          />
          <p
            v-if="membersError"
            role="alert"
            class="px-4 pt-2 text-sm text-ink-red-7"
          >
            {{ membersError }}
          </p>
          <MiembrosLista
            v-if="programActive && members.length"
            class="mt-2"
            :members="members"
            :can-adjust="!!caps.adjust_points"
            @adjust="adjust"
          />
          <p
            v-else-if="programActive && !membersLoading"
            class="px-4 py-6 text-sm text-ink-gray-6"
          >
            {{ noMembersText }}
          </p>
        </template>

        <div v-else-if="vista === 'tarjetas'" class="pt-3">
          <TarjetasCliente :company="board?.company || ''" />
        </div>

        <template v-else>
          <p class="px-4 pt-3 text-sm text-ink-gray-6">
            {{ __('A group sets the price list its customers buy at.') }}
          </p>
          <p
            v-if="groupsError"
            role="alert"
            class="px-4 pt-2 text-sm text-ink-red-7"
          >
            {{ groupsError }}
          </p>
          <GruposLista class="mt-2" :groups="groups" @open="openGroup" />
        </template>
      </template>

      <!-- Desktop: the figures, then every list at once. -->
      <template v-else>
        <p
          v-if="deniedNote"
          id="fidelidad-denied"
          class="pb-3 text-sm text-ink-gray-6"
          role="note"
          data-testid="fidelidad-denied"
        >
          {{ deniedNote }}
        </p>
        <KpiGrid data-testid="fidelidad-cifras">
          <KpiTile
            v-for="figure in figures"
            :key="figure.key"
            :label="figure.label"
            :value="figure.value"
            :hint="figure.hint"
          />
        </KpiGrid>
        <div
          class="mt-6 grid gap-x-8 gap-y-6"
          :class="twoColumns && 'grid-cols-[minmax(0,1fr)_22rem] items-start'"
        >
          <div class="min-w-0 space-y-6">
            <HoySection
              id="fidelidad-promociones"
              :title="__('Promotions')"
              icon="lucide-badge-percent"
            >
              <FilterChips
                class="pb-2 pl-1"
                :model-value="estado"
                :chips="estadoChips"
                :deselectable="false"
                :label="__('State')"
                @update:model-value="(v) => v && (estado = v)"
              />
              <EmptyState
                v-if="!shownOffers.length"
                class="py-8"
                :title="emptyTitle"
                :message="
                  caps.create_offer ? __('Start one in a few taps.') : ''
                "
                :action="caps.create_offer ? __('New promotion') : ''"
                @action="sheet = 'promo'"
              />
              <PromosLista
                v-else
                :offers="shownOffers"
                :currency="currency"
                :table="tableRows"
                @open="openOffer"
              />
            </HoySection>
            <HoySection
              id="fidelidad-grupos"
              :title="__('Customer groups')"
              icon="lucide-users"
              :skeleton="!groupsReady && !groupsError"
              :collapsed="groupsError"
              :failed="!!groupsError"
              @retry="loadGroups"
            >
              <p class="px-5 pb-2 text-sm text-ink-gray-6">
                {{ __('A group sets the price list its customers buy at.') }}
              </p>
              <GruposLista
                :groups="groups"
                :table="tableRows"
                @open="openGroup"
              />
            </HoySection>
          </div>
          <div class="min-w-0 space-y-6">
            <HoySection
              id="fidelidad-puntos"
              :title="program?.label || __('Points')"
              icon="lucide-coins"
              :collapsed="programActive ? '' : noProgramMessage"
            >
              <div class="px-5">
                <dl
                  class="grid gap-px overflow-hidden rounded-7 border border-outline-gray-2 bg-surface-gray-2"
                  :class="twoColumns ? 'grid-cols-1' : 'grid-cols-3'"
                  data-testid="fidelidad-programa"
                >
                  <div
                    v-for="fact in programFacts.filter(
                      (f) => f.key !== 'members',
                    )"
                    :key="fact.key"
                    class="flex items-baseline justify-between gap-3 bg-surface-base px-3 py-2"
                  >
                    <dt class="text-sm text-ink-gray-6">{{ fact.label }}</dt>
                    <dd class="num text-base font-semibold text-ink-gray-9">
                      {{ fact.value }}
                    </dd>
                  </div>
                </dl>
                <input
                  v-model="memberQuery"
                  type="search"
                  autocomplete="off"
                  :placeholder="__('Search a member')"
                  :aria-label="__('Search a member')"
                  class="mt-3 min-h-10 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base"
                  data-testid="fidelidad-miembros-buscar"
                />
              </div>
              <p
                v-if="membersError"
                role="alert"
                class="px-5 pt-2 text-sm text-ink-red-7"
              >
                {{ membersError }}
              </p>
              <MiembrosLista
                v-if="members.length"
                class="mt-2"
                :members="shownMembers"
                :can-adjust="!!caps.adjust_points"
                @adjust="adjust"
              />
              <p
                v-else-if="!membersLoading"
                class="px-5 py-4 text-sm text-ink-gray-6"
              >
                {{ noMembersText }}
              </p>
              <button
                v-if="members.length > MEMBERS_FOLDED"
                type="button"
                class="mx-3 mt-1 flex min-h-10 items-center rounded-6 px-2 text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-2"
                :aria-expanded="String(membersOpen)"
                data-testid="fidelidad-miembros-todos"
                @click="membersOpen = !membersOpen"
              >
                {{
                  membersOpen
                    ? __('Show fewer')
                    : __('Show all {0}', [members.length])
                }}
              </button>
            </HoySection>
            <HoySection
              v-if="caps.cards"
              id="fidelidad-tarjetas"
              :title="__('Customer cards')"
              icon="lucide-id-card"
            >
              <TarjetasCliente :company="board?.company || ''" />
            </HoySection>
          </div>
        </div>
      </template>
      <div class="h-24 flex-none sm:h-10" aria-hidden="true" />
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
        <p v-if="groupError" role="alert" class="mt-2 text-sm text-ink-red-7">
          {{ groupError }}
        </p>
      </template>
      <template v-if="caps.edit_groups" #actions>
        <button
          type="button"
          :class="BTN.filled"
          class="press"
          :disabled="
            groupSaving || groupPriceList === (openedGroup?.price_list || '')
          "
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
import {
  computed,
  defineAsyncComponent,
  nextTick,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDebounceFn, useElementSize } from '@vueuse/core'
import { toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  ChipGroup,
  EmptyState,
  Fab,
  FilterChips,
  KpiGrid,
  KpiTile,
  Segmented,
} from '@/components/ui'
import HoySection from '@/components/hoy/HoySection.vue'
import PromosLista from '@/components/fidelidad/PromosLista.vue'
import MiembrosLista from '@/components/fidelidad/MiembrosLista.vue'
import GruposLista from '@/components/fidelidad/GruposLista.vue'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/documentos/api'
import { isMobile as phone } from '@/composables/breakpoint'
import { formatMoney } from '@/utils/display'
import { boardFigures, fidelidadApi, groupLine } from '@/composables/fidelidad'

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
// The register's customer cards: loaded with their section.
const TarjetasCliente = defineAsyncComponent(
  () => import('@/components/fidelidad/TarjetasCliente.vue'),
)

const route = useRoute()
const router = useRouter()
const board = ref(null)
const loading = ref(false)
const error = ref('')
const sheet = ref('')
const mounted = reactive({
  promo: false,
  cupon: false,
  puntos: false,
  oferta: false,
})
watch(sheet, (name) => name && name in mounted && (mounted[name] = true))

const caps = computed(() => board.value?.capabilities || {})
const currency = computed(() => board.value?.currency || 'MXN')
const program = computed(() => board.value?.program)
const programActive = computed(() => program.value?.state === 'active')

// --- desktop layout, from the room the page has (the shell's rail and the
// Ventas column take a varying share of the window) --------------------------
const frame = ref(null)
const { width: frameWidth } = useElementSize(frame, undefined, {
  box: 'border-box',
})
const inner = computed(() => frameWidth.value - 48)
/** Points beside the lists once the lists keep a table's room. */
const twoColumns = computed(() => inner.value >= 1000)
const mainWidth = computed(() =>
  twoColumns.value ? inner.value - 384 : inner.value,
)
const tableRows = computed(() => mainWidth.value >= 620)
/** The bar's quick jobs keep their words while they fit. */
const roomy = computed(() => frameWidth.value >= 760)

// --- the view and its state chip live in the URL (back keeps them) -------
const VISTAS = ['promociones', 'puntos', 'grupos', 'tarjetas']
const vista = computed({
  get: () =>
    VISTAS.includes(route.query.vista) ? route.query.vista : 'promociones',
  set: (value) =>
    router.replace({
      query: {
        ...route.query,
        vista: value === 'promociones' ? undefined : value,
      },
    }),
})
const ESTADOS = ['live', 'scheduled', 'paused', 'ended']
const estado = computed({
  get: () =>
    ESTADOS.includes(route.query.estado) ? route.query.estado : 'live',
  set: (value) =>
    router.replace({
      query: { ...route.query, estado: value === 'live' ? undefined : value },
    }),
})

const counts = computed(() => board.value?.counts || {})
const vistaOptions = computed(() => [
  { value: 'promociones', label: __('Promotions') },
  { value: 'puntos', label: __('Points') },
  { value: 'grupos', label: __('Groups') },
  ...(caps.value.cards ? [{ value: 'tarjetas', label: __('Cards') }] : []),
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
const figures = computed(() =>
  boardFigures(
    board.value,
    groupsReady.value ? groups.value : null,
    currency.value,
  ),
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
      (!programActive.value ? __('There is no points program yet.') : ''),
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
    router.push({
      name: 'Precios',
      query: { return_to: `/crm${route.fullPath}` },
    })
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
// The phone loads the members when their view opens; desktop shows them.
watch(
  () => [!phone.value || vista.value === 'puntos', programActive.value],
  ([shown, active]) => shown && active && loadMembers(),
  { immediate: true },
)
// Desktop folds a long ranking under its first rows.
const MEMBERS_FOLDED = 8
const membersOpen = ref(false)
const shownMembers = computed(() =>
  membersOpen.value ? members.value : members.value.slice(0, MEMBERS_FOLDED),
)
const noMembersText = computed(() =>
  memberQuery.value ? __('Nothing matches that.') : __('No members yet.'),
)
const noProgramMessage = computed(() =>
  program.value?.can_create
    ? __(
        'Create it from a customer: Contacts, the customer, «Points and balance».',
      )
    : __('An accounts manager can create it.'),
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
    { key: 'members', label: __('Members'), value: p.members ?? 0 },
    {
      key: 'earns',
      label: __('Earns'),
      value: p.collection_factor
        ? __('1 pt per {0}', [
            formatMoney(p.collection_factor, currency.value, { decimals: 0 }),
          ])
        : '—',
    },
    {
      key: 'worth',
      label: __('A point is worth'),
      value: formatMoney(p.conversion_factor || 0, currency.value),
    },
    {
      key: 'lasts',
      label: __('Points last'),
      value: p.expiry_days ? __('{0} days', [p.expiry_days]) : __('Forever'),
    },
  ]
})

// --- groups -----------------------------------------------------------------
const groups = ref([])
const priceLists = ref([])
const groupsReady = ref(false)
const groupsError = ref('')
async function loadGroups() {
  groupsError.value = ''
  try {
    const out = await fidelidadApi('get_groups')
    groups.value = out.groups || []
    priceLists.value = out.price_lists || []
    groupsReady.value = true
  } catch (failure) {
    groupsError.value = errorText(failure)
  }
}
// The phone loads them when their view opens; desktop shows them (and counts
// the groups with their own prices among the figures).
watch(
  () => phone.value && vista.value !== 'grupos',
  (later) => !later && !groupsReady.value && loadGroups(),
  { immediate: true },
)
const openedGroup = ref(null)
const groupPriceList = ref('')
const groupSaving = ref(false)
const groupError = ref('')
const priceListOptions = computed(() => [
  { value: '', label: __('Default') },
  ...priceLists.value.map((name) => ({ value: name, label: name })),
])
function openGroup(group) {
  openedGroup.value = group
  groupPriceList.value = group.price_list || ''
  groupError.value = ''
  sheet.value = 'grupo'
}
async function saveGroup() {
  groupSaving.value = true
  groupError.value = ''
  try {
    const row = await fidelidadApi('set_group_price_list', {
      group: openedGroup.value.name,
      price_list: groupPriceList.value || undefined,
    })
    groups.value = groups.value.map((g) => (g.name === row.name ? row : g))
    toast.success(__('Price list saved for {0}', [row.label]))
    sheet.value = ''
  } catch (failure) {
    groupError.value = errorText(failure)
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
// ?vista=puntos|grupos on desktop: the board shows everything, so bring that
// section into view once it has drawn.
watch(
  () => !!board.value && !phone.value,
  async (drawn) => {
    const target = route.query.vista
    if (!drawn || !['puntos', 'grupos', 'tarjetas'].includes(target)) return
    await nextTick()
    document
      .getElementById(`hoy-fidelidad-${target}`)
      ?.scrollIntoView?.({ block: 'start' })
  },
  { immediate: true },
)
</script>
