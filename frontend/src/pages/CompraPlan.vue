<template>
  <!-- The assistant's buy plan, whole: every line with its model year, the
       pieces on hand before and after, what the period sold or the repairs
       installed, the price with what the shop paid before and why the line is
       there. −/+ and the year chips correct the same plan the chat holds; the
       bar at the bottom turns it into the draft (doco.workspaces.surtido_plan). -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="true"
      :back-label="__('Surtido', null, 'Surtido')"
      :title="__('Buy plan', null, 'Surtido')"
      :context="ready ? scope : ''"
      :bell="phone"
      @back="onBack"
    >
      <template #actions>
        <button
          v-if="ready && assistantOn"
          type="button"
          class="press flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
          :aria-label="__('Ask Muelle', null, 'Surtido')"
          :title="__('Ask Muelle', null, 'Surtido')"
          data-testid="plan-ask"
          @click="askMuelle"
        >
          <span class="lucide-sparkles size-6" aria-hidden="true" />
        </button>
      </template>
    </AppBar>

    <div class="min-h-0 flex-1 overflow-y-auto pb-6">
      <EmptyState
        v-if="guard"
        role="alert"
        state="error"
        :title="guard.title"
        :message="guard.detail"
        :action="assistantOn ? __('Ask Muelle', null, 'Surtido') : ''"
        @action="askMuelle"
      />
      <EmptyState
        v-else-if="!ready"
        role="status"
        state="loading"
        :title="__('Opening the plan…', null, 'Surtido')"
      />

      <div v-else class="plan-caja mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6">
        <div
          v-if="problem"
          role="alert"
          class="mb-3 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        </div>

        <div
          v-if="plan.draft"
          class="mb-3 flex items-center gap-3 rounded-6 bg-surface-gray-1 px-3 py-2"
          data-testid="plan-draft"
        >
          <span
            class="lucide-file-check size-5 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <p class="min-w-0 flex-1 text-sm text-ink-gray-8">
            {{
              plan.draft.doctype === 'Purchase Order'
                ? __(
                    'Purchase order {0} is a draft. Changes here update it.',
                    [plan.draft.name],
                    'Surtido',
                  )
                : __(
                    'Order {0} is a draft. Changes here update it.',
                    [plan.draft.name],
                    'Surtido',
                  )
            }}
          </p>
          <RouterLink
            :to="plan.draft.route"
            :class="['press flex-none', BTN_SM.tonal]"
          >
            {{ __('Open', null, 'Surtido') }}
          </RouterLink>
        </div>

        <p class="num text-base text-ink-gray-8" data-testid="plan-summary">
          {{
            __(
              '{0} lines, {1} pieces, {2}',
              [
                plan.lines.length,
                piecesShown,
                money(plan.total, plan.currency),
              ],
              'Surtido',
            )
          }}
          <span v-if="saving" class="text-sm text-ink-gray-5">
            · {{ __('saving…', null, 'Surtido') }}</span
          >
        </p>
        <p v-if="plan.priceless" class="text-sm text-ink-gray-6">
          {{
            __(
              '{0} lines have no price and are not in the total; the supplier quotes them.',
              [plan.priceless],
              'Surtido',
            )
          }}
        </p>

        <div
          class="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
          role="group"
          :aria-label="__('Show', null, 'Surtido')"
        >
          <button
            v-for="f in filters"
            :key="f.value"
            type="button"
            :class="chipClass(filter === f.value)"
            :aria-pressed="filter === f.value"
            :data-testid="'plan-filtro-' + f.value"
            @click="filter = f.value"
          >
            {{ f.label }}
            <span class="num tabular-nums">{{ f.count }}</span>
          </button>
        </div>
        <div
          class="-mx-4 mt-1.5 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
          role="group"
          :aria-label="__('Model years', null, 'Surtido')"
        >
          <button
            v-for="y in years"
            :key="y"
            type="button"
            :class="chipClass((plan.since_year || 0) === y)"
            :aria-pressed="(plan.since_year || 0) === y"
            :disabled="!plan.owner || saving"
            :data-testid="'plan-anio-' + y"
            @click="setYear(y)"
          >
            {{
              y
                ? __('{0} or newer', [y], 'Surtido')
                : __('Every year', null, 'Surtido')
            }}
          </button>
        </div>

        <div
          v-if="filter === 'alcanzan' && shown.length && plan.owner"
          class="mt-2 flex flex-wrap items-center gap-2"
        >
          <p class="min-w-0 flex-1 text-sm text-ink-gray-6">
            {{
              __(
                'You still have at least what the period used of these.',
                null,
                'Surtido',
              )
            }}
          </p>
          <button
            type="button"
            :class="['press', BTN_SM.tonal]"
            :disabled="saving"
            data-testid="plan-quitar-alcanzan"
            @click="removeShown"
          >
            {{ __('Remove these {0}', [shown.length], 'Surtido') }}
          </button>
        </div>

        <div
          class="plan-cabeza mt-3 gap-x-3 border-b border-outline-gray-2 px-3 pb-2 text-xs font-medium text-ink-gray-6"
          aria-hidden="true"
        >
          <span>{{ __('Model', null, 'Surtido') }}</span>
          <span class="text-right">{{ __('Year', null, 'Surtido') }}</span>
          <span class="text-right">{{ __('On hand', null, 'Surtido') }}</span>
          <span class="text-right">{{
            plan.installed
              ? __('Used', null, 'Surtido')
              : __('Sold', null, 'Surtido')
          }}</span>
          <span class="text-center">{{ __('Order', null, 'Surtido') }}</span>
          <span class="text-right">{{ __('After', null, 'Surtido') }}</span>
          <span class="text-right">{{ __('Price', null, 'Surtido') }}</span>
          <span class="text-right">{{ __('Total', null, 'Surtido') }}</span>
        </div>

        <p
          v-if="!shown.length"
          class="mt-3 rounded-6 bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
        >
          {{ __('No line of the plan is in this filter.', null, 'Surtido') }}
        </p>
        <ul
          v-else
          class="plan-lista mt-2 divide-y divide-outline-gray-1"
          :aria-label="__('Lines of the plan', null, 'Surtido')"
          data-testid="plan-lineas"
        >
          <li
            v-for="line in shown"
            :key="line.line"
            class="plan-fila grid items-start gap-x-3 py-3 transition-colors duration-700 motion-reduce:transition-none"
            :class="[
              qtyOf(line) ? '' : 'opacity-50',
              changed.has(line.line) ? 'bg-surface-gray-2' : '',
            ]"
            :data-testid="'plan-linea-' + line.line"
            :data-cambio="changed.has(line.line) || null"
          >
            <div class="min-w-0">
              <p class="truncate text-base font-medium text-ink-gray-9">
                {{ line.model || line.name }}
                <span
                  v-if="line.year"
                  class="plan-angosto num ml-1.5 font-normal text-ink-gray-5"
                  >{{ line.year }}</span
                >
              </p>
              <p class="plan-angosto num text-sm text-ink-gray-7">
                {{
                  __(
                    '{0} on hand, {1} after',
                    [line.stock, afterOf(line)],
                    'Surtido',
                  )
                }}
                · {{ movedText(line) }}
              </p>
              <p class="plan-angosto num text-sm text-ink-gray-7">
                {{ priceText(line) }}
              </p>
              <p v-if="line.reasons.length" class="text-xs text-ink-gray-6">
                {{ line.reasons.join('; ') }}
              </p>
              <p v-if="line.history.length" class="num text-xs text-ink-gray-5">
                {{ historyText(line) }}
              </p>
            </div>
            <span class="plan-ancho num text-right text-sm text-ink-gray-7">{{
              line.year || '—'
            }}</span>
            <span class="plan-ancho num text-right text-base text-ink-gray-8">{{
              line.stock
            }}</span>
            <span class="plan-ancho num text-right text-base text-ink-gray-8">{{
              line.moved
            }}</span>
            <div
              class="plan-pasos flex items-center justify-end gap-1"
              role="group"
              :aria-label="
                __('Pieces of {0}', [line.model || line.name], 'Surtido')
              "
            >
              <button
                v-if="plan.owner"
                type="button"
                class="press flex size-11 items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3 disabled:opacity-40"
                :aria-label="__('One less', null, 'Surtido')"
                :title="__('One less', null, 'Surtido')"
                :disabled="!qtyOf(line)"
                @click="step(line, -1)"
              >
                <span class="lucide-minus size-4" aria-hidden="true" />
              </button>
              <span
                class="num min-w-8 text-center text-lg font-semibold text-ink-gray-9"
                aria-live="polite"
                >{{ qtyOf(line) }}</span
              >
              <button
                v-if="plan.owner"
                type="button"
                class="press flex size-11 items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3"
                :aria-label="__('One more', null, 'Surtido')"
                :title="__('One more', null, 'Surtido')"
                @click="step(line, 1)"
              >
                <span class="lucide-plus size-4" aria-hidden="true" />
              </button>
            </div>
            <span class="plan-ancho num text-right text-base text-ink-gray-8">{{
              afterOf(line)
            }}</span>
            <span class="plan-ancho text-right">
              <span class="num block text-base text-ink-gray-8">{{
                line.price ? money(line.price, plan.currency) : '—'
              }}</span>
              <span class="block text-xs text-ink-gray-5">{{
                line.price
                  ? priceSourceText(line)
                  : __('the supplier quotes it', null, 'Surtido')
              }}</span>
            </span>
            <span
              class="plan-ancho num text-right text-base font-medium text-ink-gray-9"
              >{{
                line.price
                  ? money(line.price * qtyOf(line), plan.currency)
                  : '—'
              }}</span
            >
          </li>
        </ul>

        <section
          v-if="plan.left_out.length"
          class="mt-5"
          :aria-label="__('Left out', null, 'Surtido')"
        >
          <h2 class="title-face text-lg font-semibold text-ink-gray-9">
            {{ __('Left out', null, 'Surtido') }}
          </h2>
          <ul class="mt-1 space-y-1 text-sm text-ink-gray-7">
            <li v-for="group in leftOut" :key="group.why">
              <span class="font-medium text-ink-gray-8">{{
                __('{0} {1}', [group.rows.length, group.why], 'Surtido')
              }}</span
              >: {{ group.rows.map((r) => r.name).join(', ') }}
            </li>
          </ul>
        </section>
        <ul
          v-if="plan.notes.length"
          class="mt-4 space-y-1 text-sm text-ink-gray-6"
        >
          <li v-for="note in plan.notes" :key="note">{{ note }}</li>
        </ul>
      </div>
    </div>

    <!-- the total and the one action, in thumb reach -->
    <div
      v-if="ready && plan.lines.length"
      class="flex-none border-t border-outline-gray-2 bg-surface-base px-4 py-3 sm:px-6"
      data-testid="plan-dock"
    >
      <div class="mx-auto flex w-full max-w-5xl items-center gap-3">
        <div class="min-w-0 flex-1">
          <p class="num truncate text-base font-semibold text-ink-gray-9">
            {{ money(plan.total, plan.currency) }}
          </p>
          <p class="truncate text-sm text-ink-gray-6">
            {{ __('{0} pieces', [piecesShown], 'Surtido') }}
          </p>
        </div>
        <button
          v-if="plan.owner"
          type="button"
          :class="['press flex-none', BTN.filled]"
          :disabled="saving || busy === 'order' || !piecesShown"
          data-testid="plan-crear"
          @click="startOrder"
        >
          <span
            class="lucide-file-plus hidden size-5 min-[360px]:inline-block"
            aria-hidden="true"
          />
          {{ orderLabel }}
        </button>
        <p v-else class="max-w-48 text-sm text-ink-gray-6">
          {{ __('The owner turns the plan into an order.', null, 'Surtido') }}
        </p>
      </div>
    </div>

    <BottomSheet
      v-if="sheetMounted"
      v-model:open="sheetOpen"
      :title="__('Create the purchase order', null, 'Surtido')"
      :dismissible="busy !== 'order'"
    >
      <form id="plan-orden" class="space-y-4 pb-4" @submit.prevent="order">
        <fieldset>
          <legend class="mb-1.5 text-sm text-ink-gray-7">
            {{ __('Where it goes in', null, 'Surtido') }}
          </legend>
          <p
            v-if="!plan.warehouses.length"
            class="rounded-6 bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
          >
            {{
              __(
                'You cannot use any warehouse of the company. Ask the owner for access in the Desk.',
                null,
                'Surtido',
              )
            }}
          </p>
          <div v-else class="flex flex-wrap gap-1.5">
            <button
              v-for="w in plan.warehouses"
              :key="w.name"
              type="button"
              :class="chipClass(warehouse === w.name)"
              :aria-pressed="warehouse === w.name"
              @click="warehouse = w.name"
            >
              {{ w.label }}
            </button>
          </div>
        </fieldset>
        <label class="block">
          <span class="mb-1.5 block text-sm text-ink-gray-7">{{
            __('Supplier', null, 'Surtido')
          }}</span>
          <input
            v-model="supplier"
            type="text"
            autocomplete="off"
            class="h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-4"
            :placeholder="
              __('The one you bought from last time', null, 'Surtido')
            "
          />
        </label>
        <p v-if="sheetProblem" role="alert" class="text-sm text-ink-red-7">
          {{ sheetProblem }}
        </p>
      </form>
      <template #actions>
        <button
          type="button"
          :class="['press', BTN.text]"
          :disabled="busy === 'order'"
          @click="sheetOpen = false"
        >
          {{ __('Cancel', null, 'Surtido') }}
        </button>
        <button
          type="submit"
          form="plan-orden"
          :class="['press', BTN.filled]"
          :disabled="busy === 'order' || !warehouse"
          data-testid="plan-crear-orden"
        >
          {{ __('Create the purchase order', null, 'Surtido') }}
        </button>
      </template>
    </BottomSheet>
  </div>
</template>

<script setup>
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { AppBar, BottomSheet, EmptyState, chipClass } from '@/components/ui'
import { isMobile } from '@/composables/breakpoint'
import {
  assistantOn,
  loadAssistant,
} from '@/components/assistant/assistantDoor'
import { comprasApi, money, problemOf } from '@/composables/useCompras'
import { BTN } from '@/documentos/tools'
import { formatDate } from '@/utils/display'
import {
  FILTERS,
  changedLines,
  changesOf,
  filterCounts,
  followsEvent,
  movedText,
  planScope,
  priceSourceText,
  removals,
  shownLines,
  yearChips,
} from '@/utils/surtidoPlan'

const props = defineProps({ id: { type: String, required: true } })

const API = 'doco.workspaces.surtido_plan.'
const call = (method, args = {}) => comprasApi(API + method, args)
const BTN_SM = Object.freeze({
  tonal:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3 disabled:opacity-50 sm:min-h-9',
})
const SAVE_PAUSE = 450
// doco sourcing.PLAN_EVENT: {chain, id} of each new plan, to the plan's person
const PLAN_EVENT = 'surtido_plan'
const MARK_MS = 1600

const router = useRouter()
const phone = isMobile
const ready = ref(false)
const guard = ref(null)
const problem = ref(null)
const busy = ref('')
const saving = ref(false)
const plan = ref(null)
const filter = ref('todas')
const edits = ref({})
const years = yearChips()
let saveTimer = null
let markTimer = null
const changed = ref(new Set())
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
let dropContext = null

const lines = computed(() => plan.value?.lines || [])
const counts = computed(() => filterCounts(lines.value))
const FILTER_LABEL = {
  todas: () => __('All', null, 'Surtido'),
  agotadas: () => __('None left', null, 'Surtido'),
  pocas: () => __('Running low', null, 'Surtido'),
  alcanzan: () => __('Enough for now', null, 'Surtido'),
}
const filters = computed(() =>
  FILTERS.filter((f) => f === 'todas' || counts.value[f]).map((value) => ({
    value,
    label: FILTER_LABEL[value](),
    count: counts.value[value],
  })),
)
const shown = computed(() => shownLines(lines.value, filter.value))
const scope = computed(() =>
  plan.value
    ? planScope(plan.value, (d) => formatDate(d, { relative: false }))
    : '',
)
const qtyOf = (line) => edits.value[line.line] ?? line.qty
const afterOf = (line) => Number(line.stock || 0) + Number(qtyOf(line) || 0)
const piecesShown = computed(() =>
  lines.value.reduce((sum, line) => sum + Number(qtyOf(line) || 0), 0),
)
const leftOut = computed(() => {
  const groups = new Map()
  for (const row of plan.value?.left_out || []) {
    if (!groups.has(row.why)) groups.set(row.why, { why: row.why, rows: [] })
    groups.get(row.why).rows.push(row)
  }
  return [...groups.values()]
})
const orderLabel = computed(() => {
  if (plan.value?.draft) return __('Update the draft', null, 'Surtido')
  return plan.value?.source === 'tienda'
    ? __('Create order', null, 'Surtido')
    : __('Create the order', null, 'Surtido')
})

function priceText(line) {
  if (!line.price)
    return __('No price: the supplier quotes it', null, 'Surtido')
  const source = priceSourceText(line)
  const each = money(line.price, plan.value.currency)
  const total = money(line.price * qtyOf(line), plan.value.currency)
  return source
    ? __('{0} ({1}), {2}', [each, source, total], 'Surtido')
    : __('{0}, {1}', [each, total], 'Surtido')
}

function historyText(line) {
  const bits = line.history.map((h) =>
    __(
      '{0} on {1}',
      [
        money(h.rate, plan.value.currency),
        formatDate(h.date, { relative: false }),
      ],
      'Surtido',
    ),
  )
  return __('Bought before: {0}', [bits.join(', ')], 'Surtido')
}

function show(next, { mark = false } = {}) {
  if (mark && plan.value) {
    changed.value = changedLines(plan.value.lines, next.lines || [])
    clearTimeout(markTimer)
    markTimer = setTimeout(() => (changed.value = new Set()), MARK_MS)
  }
  plan.value = {
    lines: [],
    left_out: [],
    notes: [],
    warehouses: [],
    ...next,
  }
  if (next.id && next.id !== props.id)
    router.replace({ name: 'CompraSurtido', query: { plan: next.id } })
}

async function start() {
  guard.value = null
  try {
    show(await call('plan_page', { plan: props.id }))
  } catch (error) {
    guard.value = {
      title: __('Could not open the plan', null, 'Surtido'),
      detail: problemOf(error).detail,
    }
    return
  }
  ready.value = true
}

function step(line, delta) {
  edits.value = {
    ...edits.value,
    [line.line]: Math.max(0, Number(qtyOf(line)) + delta),
  }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, SAVE_PAUSE)
}

async function correct(args) {
  problem.value = null
  saving.value = true
  try {
    show(await call('plan_change', { plan: plan.value.id, ...args }))
    return true
  } catch (error) {
    problem.value = problemOf(error)
    return false
  } finally {
    saving.value = false
    catchUp()
  }
}

// ---- live: the chat (or another tab) corrects the same plan ----------------
// The server publishes each new plan of the chain; the page takes it in place and
// marks the lines that changed. A correction of its own is answered by the request.
let heard = ''

async function follow(id) {
  if (!ready.value) return
  if (saving.value || busy.value) {
    heard = id
    return
  }
  try {
    show(await call('plan_page', { plan: id || plan.value.id }), {
      mark: true,
    })
  } catch {
    // the next event, reconnect or visit reads it again
  }
}

function catchUp() {
  const id = heard
  heard = ''
  if (id && id !== plan.value?.id) follow(id)
}

function onPlanEvent(payload) {
  if (followsEvent(plan.value, payload)) follow(payload.id)
}

function onReturn() {
  if (document.visibilityState !== 'hidden') follow(plan.value?.id)
}

async function save() {
  if (saving.value) {
    saveTimer = setTimeout(save, SAVE_PAUSE)
    return
  }
  const sent = { ...edits.value }
  for (const batch of changesOf(sent)) {
    if (!(await correct({ changes: JSON.stringify(batch) }))) break
  }
  // what changed while the request ran stays for the next save
  const left = {}
  for (const [key, value] of Object.entries(edits.value))
    if (sent[key] !== value) left[key] = value
  edits.value = left
  if (Object.keys(left).length) saveTimer = setTimeout(save, SAVE_PAUSE)
}

function removeShown() {
  edits.value = { ...edits.value, ...removals(shown.value) }
  clearTimeout(saveTimer)
  filter.value = 'todas'
  save()
}

function setYear(year) {
  if ((plan.value.since_year || 0) === year) return
  correct({ since_year: year })
}

// ---- the draft -------------------------------------------------------------
const sheetMounted = ref(false)
const sheetOpen = ref(false)
const sheetProblem = ref('')
const warehouse = ref('')
const supplier = ref('')

function startOrder() {
  if (plan.value.source !== 'tienda' || plan.value.draft) return order()
  sheetProblem.value = ''
  supplier.value = plan.value.supplier || ''
  const only = plan.value.warehouses.length === 1
  warehouse.value = only ? plan.value.warehouses[0].name : warehouse.value
  sheetMounted.value = true
  sheetOpen.value = true
}

async function order() {
  if (Object.keys(edits.value).length) {
    clearTimeout(saveTimer)
    await save()
  }
  busy.value = 'order'
  sheetProblem.value = ''
  problem.value = null
  try {
    show(
      await call('plan_order', {
        plan: plan.value.id,
        warehouse: warehouse.value || null,
        supplier: supplier.value.trim() || null,
      }),
    )
    sheetOpen.value = false
    toast.success(
      plan.value.draft?.doctype === 'Purchase Order'
        ? __(
            'Purchase order {0} saved as a draft',
            [plan.value.draft.name],
            'Surtido',
          )
        : __('Order {0} saved as a draft', [plan.value.draft?.name], 'Surtido'),
    )
  } catch (error) {
    const got = problemOf(error)
    if (sheetOpen.value) sheetProblem.value = got.detail
    else problem.value = got
  } finally {
    busy.value = ''
  }
}

async function askMuelle() {
  const m = await loadAssistant()
  dropContext?.()
  dropContext = m.useAssistantContext(() => ({
    title: __('Buy plan', null, 'Surtido'),
  }))
  m.openAssistant({ text: __('In this buy plan, ', null, 'Surtido') })
}

function onBack(event) {
  event?.preventDefault?.()
  router.push({ name: 'CompraSurtido' })
}

watch(
  () => props.id,
  (id, old) => {
    if (id && old && id !== plan.value?.id) start()
  },
)
onMounted(() => {
  start()
  socket?.on(PLAN_EVENT, onPlanEvent)
  window.addEventListener('socket:reconnected', onReturn)
  document.addEventListener('visibilitychange', onReturn)
})
onBeforeUnmount(() => {
  dropContext?.()
  clearTimeout(saveTimer)
  clearTimeout(markTimer)
  socket?.off(PLAN_EVENT, onPlanEvent)
  window.removeEventListener('socket:reconnected', onReturn)
  document.removeEventListener('visibilitychange', onReturn)
})
</script>

<style scoped>
/* The lines read as a table only where their own box holds every column
   (model at least 12rem): rows on the phone, a tablet and a narrow pane. */
.plan-caja {
  container-type: inline-size;
}
.plan-fila {
  grid-template-columns: minmax(0, 1fr) auto;
}
.plan-cabeza,
.plan-ancho {
  display: none;
}
@container (min-width: 54rem) {
  .plan-cabeza,
  .plan-fila {
    display: grid;
    /* model | year | on hand | used | order | after | price | total */
    grid-template-columns: minmax(12rem, 1fr) 3.5rem 3.5rem 4rem 7.5rem 4rem 6.5rem 6.5rem;
    align-items: center;
    padding-left: 0.75rem;
    padding-right: 0.75rem;
  }
  .plan-lista {
    margin-top: 0;
  }
  .plan-ancho {
    display: block;
  }
  .plan-angosto {
    display: none;
  }
  .plan-pasos {
    justify-content: center;
  }
  .plan-pasos button {
    width: 2.25rem;
    height: 2.25rem;
  }
}
</style>
