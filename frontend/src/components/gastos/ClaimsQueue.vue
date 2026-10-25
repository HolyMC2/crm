<template>
  <div
    ref="root"
    class="relative flex min-h-0 min-w-0 flex-1 flex-col"
    data-testid="claims-queue"
  >
    <!-- One scroller, the header inside it (Shell C5). On a phone the title is
         the shell's AppBar and create is the FAB (MOBILE_REFERENCES). -->
    <div
      ref="scrollerEl"
      class="min-h-0 flex-1 overflow-y-auto"
      :class="claims.file && isPhone ? 'pb-24' : 'pb-6'"
      data-claims-scroller
      @scroll.passive="rememberScroll"
    >
      <PageHeader
        v-if="!isPhone"
        :title="__('From employees', null, 'Gastos')"
        :subtitle="subtitle"
        :level="1"
      >
        <template v-if="claims.file" #actions>
          <Button
            variant="solid"
            icon-left="lucide-camera"
            class="min-h-8"
            data-testid="claim-new"
            :label="__('New expense')"
            @click="update({ nuevo: '1' })"
          />
        </template>
      </PageHeader>

      <div v-if="!claims.enabled" class="mx-4 mb-3 sm:mx-6">
        <ClaimGuard
          :guard="{
            code: claims.code,
            message: claims.reason,
            actions: claims.actions,
          }"
          @action="onGuardAction"
        />
      </div>
      <template v-else>
        <!-- The lists, and for approvals whose they are: one chip row each. -->
        <FilterChips
          v-if="chipChoices.length"
          :model-value="chip"
          :chips="chipChoices"
          :deselectable="false"
          :label="__('Lists of employee expenses')"
          @update:model-value="(value) => update({ chip: value, scope: '' })"
        />
        <FilterChips
          v-if="chip === 'por-aprobar'"
          :model-value="scope"
          :chips="scopeChoices"
          :deselectable="false"
          :label="__('Whose approvals')"
          @update:model-value="(value) => update({ scope: value })"
        />
        <div class="flex flex-wrap items-center gap-2 px-4 pb-3 pt-2 sm:px-6">
          <TextInput
            v-model="search"
            class="w-full min-w-0 sm:max-w-xs"
            type="search"
            data-list-search
            :placeholder="__('Search person or expense')"
            :aria-label="__('Search person or expense')"
          />
          <span
            v-if="employee"
            class="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-3 text-sm sm:min-h-8"
          >
            {{ __('Only {0}', [employeeName || employee]) }}
            <button
              type="button"
              class="min-h-11 text-ink-blue-link underline sm:min-h-0"
              @click="update({ employee: '' })"
            >
              {{ __('See everyone') }}
            </button>
          </span>
        </div>
        <div
          v-if="problem"
          role="alert"
          class="mx-4 mb-3 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <Button
            class="ml-2"
            :label="__('Retry', null, 'Gastos')"
            @click="load()"
          />
        </div>
        <div v-if="guard" class="mx-4 mb-3 sm:mx-6">
          <ClaimGuard :guard="guard" />
        </div>

        <EmptyState
          v-if="(loading && !rows.length) || (!rows.length && !guard)"
          :state="loading && !rows.length ? 'loading' : 'empty'"
          :title="
            loading && !rows.length ? __('Loading expenses…') : emptyTitle
          "
          :message="loading && !rows.length ? '' : emptyBody"
          :action="
            !isPhone && chip === 'mios' && claims.file ? __('New expense') : ''
          "
          @action="update({ nuevo: '1' })"
        />
        <ul v-else class="divide-y divide-outline-gray-1">
          <li v-for="row in rows" :key="`${row.doctype}:${row.name}`">
            <!-- An expense claim: its record. -->
            <ListRow
              v-if="row.doctype === CLAIM"
              :to="{
                name: 'GastoEmpleado',
                params: { name: row.name },
                query: { list: listPath },
              }"
              :avatar="row.employee_name || ''"
              :title="claimTitle(row)"
              :subtitle="claimSubtitle(row)"
              :subtitle-lines="2"
              :meta="money(rowAmount(row), row.currency)"
              @click="rememberScroll"
            >
              <template #trailing>
                <StatusChip
                  :label="stateLabel(row)"
                  :tone="stateChipTone(row)"
                />
              </template>
            </ListRow>
            <!-- An open advance: what is left and the claims that discount it. -->
            <ListRow
              v-else-if="row.doctype === 'Employee Advance'"
              icon="lucide-wallet"
              :title="row.employee_name"
              :subtitle="advanceLine(row)"
              :meta="__('{0} left', [money(row.remaining, row.currency)])"
            >
              <template #subtitle>
                <span class="block truncate">{{ advanceLine(row) }}</span>
                <span class="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <RouterLink
                    v-for="c in row.claims"
                    :key="c.name"
                    class="inline-flex min-h-11 items-center text-ink-blue-link underline sm:min-h-0"
                    :to="{
                      name: 'GastoEmpleado',
                      params: { name: c.name },
                      query: { list: listPath },
                    }"
                    >{{
                      c.pending
                        ? __('{0}: {1} to discount', [
                            c.name,
                            money(c.allocated, row.currency),
                          ])
                        : __('{0}: {1} discounted', [
                            c.name,
                            money(c.allocated, row.currency),
                          ])
                    }}</RouterLink
                  >
                </span>
              </template>
            </ListRow>
            <!-- What the cash register gave: a read-only movement. -->
            <ListRow
              v-else
              :icon="
                row.kind === 'advance' ? 'lucide-wallet' : 'lucide-shopping-bag'
              "
              :title="movementTitle(row)"
              :subtitle="movementSubtitle(row)"
              :subtitle-lines="2"
              :meta="money(row.amount, row.currency)"
            />
          </li>
        </ul>
      </template>
      <div v-if="hasMore" class="px-4 py-4 sm:px-6">
        <Button
          :label="__('Load more', null, 'Gastos')"
          :loading="loading"
          class="min-h-11 w-full sm:w-auto"
          @click="load(true)"
        />
      </div>
    </div>
    <ClaimSheet v-model="sheetOpen" @sent="sent" @saved="saved" />
    <Fab
      v-if="isPhone && claims.file"
      :label="__('New expense')"
      icon="lucide-camera"
      @click="update({ nuevo: '1' })"
    />
  </div>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, TextInput, toast } from 'frappe-ui'
import {
  EmptyState,
  Fab,
  FilterChips,
  ListRow,
  PageHeader,
  StatusChip,
} from '@/components/ui'
import ClaimGuard from '@/components/gastos/ClaimGuard.vue'
import ClaimSheet from '@/components/gastos/ClaimSheet.vue'
import { isMobile as isPhone } from '@/composables/breakpoint'
import {
  CLAIM,
  SCOPES,
  chipLabel,
  claimChips,
  claimProblem,
  claimsApi,
  money,
  normalizeClaimChip,
  normalizeScope,
  rowAmount,
  stateChipTone,
  stateLabel,
} from '@/composables/useGastosEmpleados'

// «De empleados»: one chip at a time (mine, to approve, to reimburse,
// advances, the register's week). Opening a claim keeps this list as `list`,
// so the record returns here and «Siguiente» follows the same chip.
const props = defineProps({ boot: { type: Object, required: true } })
const emit = defineEmits(['segment'])
const route = useRoute()
const router = useRouter()
const root = ref(null)
const scrollerEl = ref(null)
const rows = ref([])
const counts = ref(null)
const answeredChip = ref('')
const answeredScope = ref('')
const employeeName = ref('')
const guard = ref(null)
const hasMore = ref(false)
const loading = ref(false)
const problem = ref(null)
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const sheetOpen = ref(route.query.nuevo === '1')
let ticket = 0
let searchTimer = 0

const CHIP_ICONS = {
  mios: 'lucide-receipt',
  'por-aprobar': 'lucide-check',
  'por-reembolsar': 'lucide-banknote',
  adelantos: 'lucide-wallet',
  caja: 'lucide-shopping-bag',
}
const claims = computed(() => props.boot.claims || {})
const chips = computed(() => claimChips(claims.value))
const askedChip = computed(() =>
  normalizeClaimChip(route.query.chip, claims.value),
)
// The server opens the first chip with work for me when the URL names none.
const chip = computed(() => askedChip.value || answeredChip.value)
const scope = computed(
  () => normalizeScope(chip.value, route.query.scope) || answeredScope.value,
)
const employee = computed(() =>
  typeof route.query.employee === 'string' ? route.query.employee : '',
)
// The list a record returns to: always this segment and the chip it opened.
const listPath = computed(() => {
  const query = new URLSearchParams({ segment: 'empleados' })
  for (const [key, value] of Object.entries(route.query))
    if (
      !['nuevo', 'segment'].includes(key) &&
      typeof value === 'string' &&
      value
    )
      query.set(key, value)
  if (!query.get('chip') && chip.value) query.set('chip', chip.value)
  return `/gastos?${query}`
})

const capped = (n) => (counts.value?.capped && n >= 500 ? '500+' : String(n))
function countOf(value) {
  const n = counts.value?.[value]
  return n ? capped(n) : undefined
}
const chipChoices = computed(() =>
  chips.value.map((c) => ({
    value: c.value,
    label: chipLabel(c.value),
    icon: CHIP_ICONS[c.value],
    count: countOf(c.value),
  })),
)
const scopeChoices = computed(() =>
  SCOPES.map((s) => ({
    value: s.value,
    label: __(s.label, null, 'Gastos'),
    count: countOf(s.value === 'mine' ? 'por-aprobar-mine' : 'por-aprobar'),
  })),
)

const subtitle = computed(() => {
  if (!claims.value.enabled) return ''
  if (chip.value === 'por-reembolsar') {
    const totals = (counts.value?.totals || [])
      .map((t) => money(t.amount, t.currency))
      .join(' + ')
    return totals
      ? __('Approved expenses still owed to the team: {0}', [totals])
      : __('Approved expenses still owed to the team.')
  }
  return (
    {
      mios: __(
        'What you spent for the shop: send the receipt photo and follow it.',
      ),
      'por-aprobar': __('Expenses waiting for a decision, oldest first.'),
      adelantos: __(
        'Advances from the register and the expenses that discount them.',
      ),
      caja: __('What the register gave out this week: expenses and advances.'),
    }[chip.value] || ''
  )
})
const emptyTitle = computed(() => {
  if (search.value) return __('No expenses match')
  return (
    {
      mios: __('You have no expenses yet'),
      'por-aprobar': __('Nothing to approve'),
      'por-reembolsar': __('Nothing to reimburse'),
      adelantos: __('No advances to discount'),
      caja: __('Nothing from the register this week'),
    }[chip.value] || __('Nothing here', null, 'Gastos')
  )
})
const emptyBody = computed(() => {
  if (search.value) return __('Try another name or expense.')
  return (
    {
      mios: __(
        'When you pay for something for the shop, take the photo of the receipt and send it for approval.',
      ),
      'por-aprobar': __(
        'When someone sends an expense to you, it appears here.',
      ),
      'por-reembolsar': __(
        'Approved expenses waiting for their money appear here.',
      ),
      adelantos: __(
        'Advances given at the register appear here until expenses use them up.',
      ),
      caja: __(
        'Expenses and advances the register gives appear here during the week.',
      ),
    }[chip.value] || ''
  )
})

/** The row's first line: who or what, the one fact that tells claims apart. */
function claimTitle(row) {
  if (row.mine) return row.type_label || row.name
  return row.employee_name || row.name
}
/** Its one useful second line: the type of another's claim, the note, the day. */
function claimSubtitle(row) {
  return [row.mine ? '' : row.type_label, row.note, row.date]
    .filter(Boolean)
    .join(' · ')
}
function advanceLine(row) {
  return [row.date, row.purpose].filter(Boolean).join(' · ')
}
function movementTitle(row) {
  if (row.kind === 'advance')
    return __('Advance to {0}', [row.employee_name || '—'])
  return row.remarks || __('Expense from the register')
}
function movementSubtitle(row) {
  return [row.cashier, row.date, row.register].filter(Boolean).join(' · ')
}

async function load(more = false) {
  const mine = ++ticket
  loading.value = true
  problem.value = null
  try {
    const page = await claimsApi('queue', {
      chip: askedChip.value,
      scope: normalizeScope(askedChip.value, route.query.scope),
      employee: employee.value,
      search: search.value.trim(),
      start: more ? rows.value.length : 0,
      page_length: 30,
    })
    if (mine !== ticket) return
    rows.value = more ? [...rows.value, ...page.rows] : page.rows
    counts.value = page.counts
    answeredChip.value = page.chip
    answeredScope.value = page.scope || ''
    employeeName.value = page.employee_name || ''
    guard.value = page.guard
    hasMore.value = page.has_more
    if (!more) restoreScroll()
  } catch (error) {
    if (mine === ticket) problem.value = claimProblem(error)
  } finally {
    if (mine === ticket) loading.value = false
  }
}

function update(query) {
  const next = { ...route.query, segment: 'empleados', ...query }
  for (const key of Object.keys(next)) if (!next[key]) delete next[key]
  router.replace({ query: next })
}

function onGuardAction(action) {
  if (action.key === 'bills') emit('segment', 'por-pagar')
}

// The page scroller here is the list's own: remember where it was.
function scroller() {
  return scrollerEl.value
}
const scrollKey = () => `muelle:gastos:claims:scroll:${listPath.value}`
function rememberScroll() {
  try {
    sessionStorage.setItem(scrollKey(), String(scroller()?.scrollTop || 0))
  } catch {
    /* convenience only */
  }
}
function restoreScroll() {
  nextTick(() => {
    try {
      const top = Number(sessionStorage.getItem(scrollKey()) || 0)
      const node = scroller()
      if (node && top) node.scrollTop = top
      sessionStorage.removeItem(scrollKey())
    } catch {
      /* convenience only */
    }
  })
}

function closeSheet() {
  if (route.query.nuevo) update({ nuevo: '' })
}
function sent(result) {
  toast.success(result.message || __('Sent for approval'))
  update({ nuevo: '', chip: 'mios', scope: '' })
  load()
}
function saved(result) {
  toast.success(
    __('Expense saved. Send it for approval when you have the photo.'),
  )
  update({ nuevo: '', chip: 'mios', scope: '' })
  if (result) load()
}

watch(sheetOpen, (value) => {
  if (!value) closeSheet()
})
watch(
  () => route.query.nuevo,
  (value) => (sheetOpen.value = value === '1' && Boolean(claims.value.file)),
)
watch(search, (value) => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => update({ q: value.trim() }), 250)
})
watch(
  () => [
    route.query.chip,
    route.query.scope,
    route.query.employee,
    route.query.q,
  ],
  () => {
    if (route.name === 'Gastos' && claims.value.enabled) load()
  },
)
onMounted(() => {
  if (claims.value.enabled) load()
  sheetOpen.value = route.query.nuevo === '1' && Boolean(claims.value.file)
})
</script>
