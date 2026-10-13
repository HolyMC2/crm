<template>
  <div ref="root" class="pb-6" data-testid="claims-queue">
    <header
      class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
    >
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-xl font-semibold text-ink-gray-9">
          {{ __('From employees', null, 'Gastos') }}
        </h1>
        <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
      </div>
      <Button
        v-if="claims.file"
        variant="solid"
        icon-left="lucide-camera"
        class="min-h-11 sm:min-h-8"
        data-testid="claim-new"
        :label="__('New expense')"
        @click="update({ nuevo: '1' })"
      />
    </header>

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
      <!-- A deliberate horizontal chip row: the only sideways scroller. -->
      <div
        role="group"
        :aria-label="__('Lists of employee expenses')"
        class="flex gap-1 overflow-x-auto px-4 pb-2 sm:flex-wrap sm:px-6"
      >
        <Button
          v-for="c in chips"
          :key="c.value"
          class="min-h-11 shrink-0 sm:min-h-8"
          :variant="chip === c.value ? 'solid' : 'subtle'"
          :aria-pressed="chip === c.value"
          :label="chipText(c)"
          @click="update({ chip: c.value, scope: '' })"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
        <div
          v-if="chip === 'por-aprobar'"
          role="group"
          :aria-label="__('Whose approvals')"
          class="flex gap-1"
        >
          <Button
            v-for="s in SCOPES"
            :key="s.value"
            class="min-h-11 sm:min-h-8"
            :variant="scope === s.value ? 'solid' : 'subtle'"
            :aria-pressed="scope === s.value"
            :label="scopeText(s)"
            @click="update({ scope: s.value })"
          />
        </div>
        <FormControl
          v-model="search"
          class="min-w-0 flex-1 sm:max-w-xs"
          type="search"
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
            class="text-ink-blue-link underline"
            @click="update({ employee: '' })"
          >
            {{ __('See everyone') }}
          </button>
        </span>
      </div>
      <div
        v-if="problem"
        role="alert"
        class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
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

      <div
        v-if="loading && !rows.length"
        role="status"
        class="px-6 py-8 text-sm text-ink-gray-6"
      >
        {{ __('Loading expenses…') }}
      </div>
      <div
        v-else-if="!rows.length && !guard"
        class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
      >
        <p class="text-lg font-semibold">{{ emptyTitle }}</p>
        <p class="mt-1 text-sm">{{ emptyBody }}</p>
        <Button
          v-if="chip === 'mios' && claims.file"
          class="mt-4 min-h-11"
          variant="solid"
          icon-left="lucide-camera"
          :label="__('New expense')"
          @click="update({ nuevo: '1' })"
        />
      </div>
      <ul v-else class="divide-y divide-outline-gray-1">
        <li v-for="row in rows" :key="`${row.doctype}:${row.name}`">
          <!-- An expense claim: its record. -->
          <RouterLink
            v-if="row.doctype === CLAIM"
            :to="{
              name: 'GastoEmpleado',
              params: { name: row.name },
              query: { list: listPath },
            }"
            class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
            @click="rememberScroll"
          >
            <FeatherIcon
              name="file-text"
              class="mt-0.5 h-4 w-4 shrink-0 text-ink-gray-5"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium text-ink-gray-9">
                {{
                  row.mine
                    ? row.type_label || row.name
                    : row.employee_name || row.name
                }}
              </span>
              <span class="block truncate text-sm text-ink-gray-6">
                {{
                  [row.mine ? '' : row.type_label, row.note, row.date]
                    .filter(Boolean)
                    .join(' · ')
                }}
              </span>
              <span class="mt-0.5 block text-sm text-ink-gray-8">{{
                stateLabel(row)
              }}</span>
            </span>
            <span
              class="shrink-0 text-right text-sm font-medium tabular-nums text-ink-gray-9"
              >{{ money(rowAmount(row), row.currency) }}</span
            >
          </RouterLink>
          <!-- An open advance: what is left and the claims that discount it. -->
          <div
            v-else-if="row.doctype === 'Employee Advance'"
            class="flex items-start gap-3 px-4 py-3 sm:px-6"
          >
            <FeatherIcon
              name="briefcase"
              class="mt-0.5 h-4 w-4 shrink-0 text-ink-gray-5"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium text-ink-gray-9">{{
                row.employee_name
              }}</span>
              <span class="block truncate text-sm text-ink-gray-6">
                {{
                  [
                    __('Advance of {0}', [money(row.paid, row.currency)]),
                    row.date,
                    row.purpose,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                }}
              </span>
              <span class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
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
            </span>
            <span
              class="shrink-0 text-right text-sm font-medium tabular-nums text-ink-gray-9"
              >{{ __('{0} left', [money(row.remaining, row.currency)]) }}</span
            >
          </div>
          <!-- What the cash register gave this week: a read-only view. -->
          <details v-else class="group px-4 py-3 sm:px-6">
            <summary
              class="flex min-h-11 cursor-pointer list-none items-start gap-3"
            >
              <FeatherIcon
                :name="row.kind === 'advance' ? 'briefcase' : 'shopping-bag'"
                class="mt-0.5 h-4 w-4 shrink-0 text-ink-gray-5"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-ink-gray-9">
                  {{
                    row.kind === 'advance'
                      ? __('Advance to {0}', [row.employee_name || '—'])
                      : __('Expense from the register')
                  }}
                </span>
                <span class="block truncate text-sm text-ink-gray-6">{{
                  [row.date, row.register].filter(Boolean).join(' · ')
                }}</span>
              </span>
              <span
                class="shrink-0 text-right text-sm font-medium tabular-nums text-ink-gray-9"
                >{{ money(row.amount, row.currency) }}</span
              >
            </summary>
            <dl class="mt-2 grid grid-cols-1 gap-1 pl-7 text-sm sm:grid-cols-2">
              <div v-if="row.remarks">
                <dt class="text-ink-gray-6">{{ __('Note') }}</dt>
                <dd class="text-ink-gray-8">{{ row.remarks }}</dd>
              </div>
              <div v-if="row.cashier">
                <dt class="text-ink-gray-6">
                  {{ __('Cashier', null, 'Gastos') }}
                </dt>
                <dd class="text-ink-gray-8">{{ row.cashier }}</dd>
              </div>
              <div v-if="row.advance">
                <dt class="text-ink-gray-6">
                  {{ __('Advance', null, 'Gastos') }}
                </dt>
                <dd class="text-ink-gray-8">{{ row.advance }}</dd>
              </div>
            </dl>
          </details>
        </li>
      </ul>
      <div v-if="hasMore" class="px-4 py-4 sm:px-6">
        <Button
          :label="__('Load more', null, 'Gastos')"
          :loading="loading"
          class="min-h-11 w-full sm:w-auto"
          @click="load(true)"
        />
      </div>
    </template>

    <ClaimSheet v-model="sheetOpen" @sent="sent" @saved="saved" />
  </div>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import ClaimGuard from '@/components/gastos/ClaimGuard.vue'
import ClaimSheet from '@/components/gastos/ClaimSheet.vue'
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
function chipText(c) {
  const label = chipLabel(c.value)
  const n = counts.value?.[c.value]
  return n ? `${label} · ${capped(n)}` : label
}
function scopeText(s) {
  const label = __(s.label, null, 'Gastos')
  const n =
    s.value === 'mine'
      ? counts.value?.['por-aprobar-mine']
      : counts.value?.['por-aprobar']
  return n ? `${label} · ${capped(n)}` : label
}

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

// The page scroller is the layout's column: remember where the list was.
function scroller() {
  let node = root.value?.parentElement
  while (node && node !== document.body) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY)) return node
    node = node.parentElement
  }
  return null
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
