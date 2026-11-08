<template>
  <!-- Gastos › Presupuesto: the month's plan per concept against what the month
       has really used (doco.workspaces.presupuesto). One figure for the month,
       then every concept as a row with its bar; a row opens the records that
       used it; the pencil edits the month's plan in a sheet. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="true"
      :back-label="__('Gastos', null, 'Gastos')"
      :context="__('Gastos', null, 'Gastos')"
      :title="__('Budget', null, 'Presupuesto')"
      :bell="phone"
      @back="onBack"
    >
      <template #actions>
        <button
          v-if="board?.can_edit"
          type="button"
          class="press flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
          :aria-label="__('Edit the budget', null, 'Presupuesto')"
          :title="__('Edit the budget', null, 'Presupuesto')"
          data-testid="presupuesto-edit"
          @click="openEdit"
        >
          <span class="lucide-pencil size-6" aria-hidden="true" />
        </button>
      </template>
    </AppBar>

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-12">
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
        v-else-if="!board"
        role="status"
        state="loading"
        :title="__('Reading the budget…', null, 'Presupuesto')"
      />

      <div v-else class="mx-auto w-full max-w-3xl space-y-5 px-4 pt-3 sm:px-6">
        <!-- the month -->
        <div class="flex items-center gap-1" data-testid="presupuesto-month">
          <button
            type="button"
            class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
            :aria-label="__('Previous month', null, 'Presupuesto')"
            :title="__('Previous month', null, 'Presupuesto')"
            @click="go(-1)"
          >
            <span class="lucide-chevron-left size-5" aria-hidden="true" />
          </button>
          <h2
            class="title-face min-w-0 flex-1 truncate text-center text-xl font-semibold text-ink-gray-9"
            aria-live="polite"
          >
            {{ board.label }}
          </h2>
          <button
            type="button"
            class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
            :aria-label="__('Next month', null, 'Presupuesto')"
            :title="__('Next month', null, 'Presupuesto')"
            @click="go(1)"
          >
            <span class="lucide-chevron-right size-5" aria-hidden="true" />
          </button>
        </div>
        <p v-if="loading" role="status" class="sr-only">
          {{ __('Reading the budget…', null, 'Presupuesto') }}
        </p>

        <!-- the company, when there is more than one -->
        <Segmented
          v-if="companies.length > 1 && companies.length <= 4"
          :model-value="board.company"
          :options="companies"
          :label="__('Company', null, 'Presupuesto')"
          fit="content"
          data-testid="presupuesto-company"
          @update:model-value="setCompany"
        />
        <label v-else-if="companies.length > 4" class="block">
          <span class="mb-1.5 block text-xs text-ink-gray-5">{{
            __('Company', null, 'Presupuesto')
          }}</span>
          <select
            class="form-select block min-h-11 w-full rounded-6 text-base sm:min-h-8 sm:text-sm"
            :value="board.company"
            data-testid="presupuesto-company"
            @change="setCompany($event.target.value)"
          >
            <option v-for="c in companies" :key="c.value" :value="c.value">
              {{ c.label }}
            </option>
          </select>
        </label>

        <!-- no plan yet -->
        <EmptyState
          v-if="!board.lines.length"
          :title="__('No budget for {0}', [board.label], 'Presupuesto')"
          :message="
            board.can_edit
              ? __(
                  'Set what each product type and expense account may use this month, and a sales goal. The buy plan, the bills and Hoy follow it.',
                  null,
                  'Presupuesto',
                )
              : __(
                  'Whoever manages the accounts sets the budget.',
                  null,
                  'Presupuesto',
                )
          "
          :action="
            board.can_edit ? __('Set the budget', null, 'Presupuesto') : ''
          "
          data-testid="presupuesto-empty"
          @action="openEdit"
        />

        <template v-else>
          <p
            v-if="board.inherited_from"
            class="rounded-6 bg-surface-gray-1 px-3 py-2 text-sm text-ink-gray-7"
            data-testid="presupuesto-inherited"
          >
            {{
              __(
                'Same plan as {0}. Saving a change here keeps a plan of its own for {1}.',
                [
                  board.inherited_label || monthLabel(board.inherited_from),
                  board.label,
                ],
                'Presupuesto',
              )
            }}
          </p>

          <KpiGrid :aria-label="__('The month', null, 'Presupuesto')">
            <KpiTile
              v-for="t in tiles"
              :key="t.key"
              :label="t.label"
              :value="t.value"
              :hint="t.hint"
              :tone="t.tone"
              :data-tile="t.key"
            />
          </KpiGrid>

          <section
            v-for="group in groups"
            :key="group.kind"
            :aria-label="group.title"
            :data-testid="'presupuesto-' + group.kind.toLowerCase()"
          >
            <h2 class="title-face mb-2 text-lg font-semibold text-ink-gray-9">
              {{ group.title }}
            </h2>
            <ul
              class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
            >
              <li
                v-for="line in group.lines"
                :id="rowId(line.key)"
                :key="line.key"
                class="rounded-6 transition-shadow"
                :class="
                  focusKey === line.key
                    ? 'ring-2 ring-inset ring-[var(--muelle-accent)]'
                    : ''
                "
              >
                <button
                  type="button"
                  class="press flex w-full flex-col gap-1.5 px-3 py-2.5 text-left active:bg-surface-gray-1 [@media(hover:hover)]:hover:bg-surface-gray-1"
                  :data-linea="line.key"
                  @click="openDocuments(line)"
                >
                  <span class="flex w-full items-baseline gap-2">
                    <span
                      class="min-w-0 flex-1 truncate text-base text-ink-gray-9"
                      >{{ line.label }}</span
                    >
                    <span
                      class="num flex-none text-sm tabular-nums"
                      :class="
                        line.state === 'over'
                          ? 'text-ink-red-7'
                          : 'text-ink-gray-7'
                      "
                      >{{ usedOfText(line) }}</span
                    >
                  </span>
                  <span
                    role="progressbar"
                    :aria-label="line.label"
                    :aria-valuenow="barPct(line)"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    class="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-gray-2"
                  >
                    <span
                      class="h-full rounded-full"
                      :class="BAR[line.state] || BAR.ok"
                      :style="{ width: barPct(line) + '%' }"
                    />
                  </span>
                  <span
                    class="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-gray-6"
                  >
                    <StatusChip
                      v-if="stateLabel(line.state)"
                      :label="stateLabel(line.state)"
                      :tone="stateTone(line.state)"
                    />
                    <span>{{ remainingText(line) }}</span>
                    <span v-if="line.note" class="min-w-0 truncate">{{
                      line.note
                    }}</span>
                  </span>
                </button>
              </li>
            </ul>
          </section>

          <!-- the last months -->
          <section
            v-if="columns.length > 1"
            :aria-label="__('Last months', null, 'Presupuesto')"
            data-testid="presupuesto-history"
          >
            <h2 class="title-face mb-2 text-lg font-semibold text-ink-gray-9">
              {{ __('Last months', null, 'Presupuesto') }}
            </h2>
            <ol
              class="flex h-32 items-end gap-2 rounded-6 border border-outline-gray-2 px-3 pb-2 pt-3"
            >
              <li
                v-for="col in columns"
                :key="col.month"
                class="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                :aria-label="
                  __(
                    '{0}: {1} of {2}',
                    [col.label, money(col.used), money(col.amount)],
                    'Presupuesto',
                  )
                "
                :title="
                  __(
                    '{0}: {1} of {2}',
                    [col.label, money(col.used), money(col.amount)],
                    'Presupuesto',
                  )
                "
              >
                <span
                  class="relative flex w-full min-h-0 flex-1 items-end justify-center"
                  aria-hidden="true"
                >
                  <span
                    class="absolute bottom-0 w-full rounded-t-4 bg-surface-gray-2"
                    :style="{ height: col.amountPct + '%' }"
                  />
                  <span
                    class="relative w-1/2 rounded-t-4"
                    :class="col.over ? 'bg-surface-red-5' : 'bg-surface-gray-7'"
                    :style="{ height: col.usedPct + '%' }"
                  />
                </span>
                <span
                  class="truncate text-xs"
                  :class="
                    col.month === board.month
                      ? 'font-medium text-ink-gray-9'
                      : 'text-ink-gray-6'
                  "
                  >{{ col.label }}</span
                >
              </li>
            </ol>
            <p class="mt-1.5 text-xs text-ink-gray-6">
              {{
                __(
                  'Light: the budget of the month. Dark: what it used.',
                  null,
                  'Presupuesto',
                )
              }}
            </p>
          </section>
        </template>
      </div>
    </div>

    <!-- the records that used one concept -->
    <BottomSheet
      v-if="docsMounted"
      v-model:open="docsOpen"
      :title="docsLine?.label || ''"
      :subtitle="docsLine ? usedOfText(docsLine) : ''"
      flush
    >
      <p
        v-if="docsProblem"
        role="alert"
        class="px-4 py-2 text-sm text-ink-red-7"
      >
        {{ docsProblem }}
      </p>
      <EmptyState
        v-if="docsLoading"
        role="status"
        state="loading"
        :title="__('Reading the records…', null, 'Presupuesto')"
      />
      <p
        v-else-if="!docs.length && !docsProblem"
        class="px-4 py-3 text-sm text-ink-gray-6"
      >
        {{
          __('Nothing used this concept this month yet.', null, 'Presupuesto')
        }}
      </p>
      <ul
        v-else
        class="divide-y divide-outline-gray-1"
        data-testid="presupuesto-docs"
      >
        <li v-for="row in docs" :key="row.doctype + row.name">
          <ListRow
            :title="row.party || row.name"
            :subtitle="docSubtitle(row)"
            :meta="money(row.amount)"
            :to="row.url ? toRoute(row.url) : null"
          />
        </li>
      </ul>
    </BottomSheet>

    <!-- the plan -->
    <BottomSheet
      v-if="editMounted"
      v-model:open="editOpen"
      :title="__('Budget for {0}', [board?.label || ''], 'Presupuesto')"
      :subtitle="
        __(
          'What each concept may use this month. Empty amounts drop the line.',
          null,
          'Presupuesto',
        )
      "
      :dismissible="!saving"
      :fullscreen="phone ? editFull : null"
      @update:fullscreen="(v) => (editFull = v)"
    >
      <form
        class="space-y-5 pb-4"
        data-testid="presupuesto-form"
        @submit.prevent="save"
      >
        <fieldset class="space-y-2">
          <legend
            class="title-face mb-1 text-base font-semibold text-ink-gray-9"
          >
            {{ kindTitle('Ventas') }}
          </legend>
          <div v-for="row in rowsOf('Ventas')" :key="row.key">
            <FormControl
              v-model="row.amount"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              :label="__('Sales this month', null, 'Presupuesto')"
              data-testid="presupuesto-ventas"
            />
          </div>
        </fieldset>

        <fieldset class="space-y-3">
          <legend
            class="title-face mb-1 text-base font-semibold text-ink-gray-9"
          >
            {{ kindTitle('Gastos') }}
          </legend>
          <div
            v-for="row in rowsOf('Gastos')"
            :key="row.key"
            class="grid grid-cols-[1fr_7.5rem] items-end gap-2 sm:grid-cols-[1fr_8rem_auto]"
          >
            <template v-if="!row.account && !row.pick">
              <p class="self-center text-base text-ink-gray-9">
                {{
                  __('Operating expenses (every account)', null, 'Presupuesto')
                }}
              </p>
            </template>
            <ComprasPicker
              v-else
              v-model="row.account"
              :display="row.label || row.account"
              :label="__('Account', null, 'Presupuesto')"
              :placeholder="__('Search account', null, 'Presupuesto')"
              :load="findAccounts"
              @pick="(o) => (row.label = o?.label || '')"
            />
            <FormControl
              v-model="row.amount"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              :label="__('Per month', null, 'Presupuesto')"
            />
            <button
              v-if="row.account || row.pick"
              type="button"
              class="press col-span-2 flex h-11 items-center justify-center gap-2 rounded-full text-sm text-ink-gray-6 active:bg-surface-gray-2 sm:col-span-1 sm:size-11 sm:gap-0 [@media(hover:hover)]:hover:bg-surface-gray-2"
              :aria-label="__('Remove line', null, 'Presupuesto')"
              :title="__('Remove line', null, 'Presupuesto')"
              @click="removeRow(row)"
            >
              <span class="lucide-trash-2 size-5" aria-hidden="true" />
              <span class="sm:hidden">{{
                __('Remove line', null, 'Presupuesto')
              }}</span>
            </button>
          </div>
          <Button
            :label="__('Add an account', null, 'Presupuesto')"
            class="min-h-11 sm:min-h-8"
            @click="addRow('Gastos')"
          />
        </fieldset>

        <fieldset class="space-y-3">
          <legend
            class="title-face mb-1 text-base font-semibold text-ink-gray-9"
          >
            {{ kindTitle('Compras') }}
          </legend>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'Purchase orders and bills without an order count against the type of what they buy. The buy plan takes what is left.',
                null,
                'Presupuesto',
              )
            }}
          </p>
          <div
            v-for="row in rowsOf('Compras')"
            :key="row.key"
            class="grid grid-cols-[1fr_7.5rem] items-end gap-2 sm:grid-cols-[1fr_8rem_auto]"
          >
            <ComprasPicker
              v-model="row.item_group"
              :display="row.item_group"
              :label="__('Product type', null, 'Presupuesto')"
              :placeholder="__('Search group', null, 'Presupuesto')"
              :load="findGroups"
            />
            <FormControl
              v-model="row.amount"
              type="number"
              min="0"
              step="0.01"
              inputmode="decimal"
              :label="__('Per month', null, 'Presupuesto')"
            />
            <button
              type="button"
              class="press col-span-2 flex h-11 items-center justify-center gap-2 rounded-full text-sm text-ink-gray-6 active:bg-surface-gray-2 sm:col-span-1 sm:size-11 sm:gap-0 [@media(hover:hover)]:hover:bg-surface-gray-2"
              :aria-label="__('Remove line', null, 'Presupuesto')"
              :title="__('Remove line', null, 'Presupuesto')"
              @click="removeRow(row)"
            >
              <span class="lucide-trash-2 size-5" aria-hidden="true" />
              <span class="sm:hidden">{{
                __('Remove line', null, 'Presupuesto')
              }}</span>
            </button>
          </div>
          <Button
            :label="__('Add a product type', null, 'Presupuesto')"
            class="min-h-11 sm:min-h-8"
            @click="addRow('Compras')"
          />
        </fieldset>

        <p v-if="saveProblem" role="alert" class="text-sm text-ink-red-7">
          {{ saveProblem }}
        </p>
        <div class="flex justify-end">
          <Button
            type="submit"
            variant="solid"
            :label="__('Save the budget', null, 'Presupuesto')"
            class="min-h-11 sm:min-h-8"
            :loading="saving"
          />
        </div>
      </form>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, FormControl, toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  KpiGrid,
  KpiTile,
  ListRow,
  Segmented,
  StatusChip,
} from '@/components/ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { isMobile } from '@/composables/breakpoint'
import { comprasApi, money, problemOf } from '@/composables/useCompras'
import { formatDate } from '@/utils/display'
import {
  API,
  barPct,
  boardTiles,
  editRows,
  groupLines,
  historyColumns,
  kindTitle,
  linesPayload,
  monthLabel,
  queryMonth,
  remainingText,
  shiftMonth,
  stateLabel,
  stateTone,
  usedOfText,
} from '@/utils/presupuesto'

// Bar colour means state: grey while fine, amber near the limit or behind
// the sales pace, red over it, green when the goal is met.
const BAR = {
  ok: 'bg-surface-gray-7',
  warn: 'bg-surface-amber-5',
  behind: 'bg-surface-amber-5',
  over: 'bg-surface-red-5',
  met: 'bg-surface-green-7',
}
const FOCUS_MS = 2500

const route = useRoute()
const router = useRouter()
const phone = isMobile
const board = ref(null)
const guard = ref(null)
const loading = ref(false)
const focusKey = ref('')
let focusTimer = 0

const tiles = computed(() => boardTiles(board.value))
const groups = computed(() => groupLines(board.value?.lines || []))
const columns = computed(() => historyColumns(board.value?.history || []))
const companies = computed(() =>
  (board.value?.companies || []).map((c) =>
    typeof c === 'string'
      ? { value: c, label: c }
      : { value: c.name || c.value, label: c.label || c.name || c.value },
  ),
)

const rowId = (key) => 'linea-' + String(key).replace(/[^\w-]/g, '_')

async function load(args = {}) {
  guard.value = null
  loading.value = true
  try {
    const next = await comprasApi(API + 'board', {
      company: args.company ?? board.value?.company ?? null,
      month: args.month ?? (queryMonth(route.query.mes) || null),
    })
    board.value = next
    syncQuery(next)
    await nextTick()
    focusLine(route.query.linea)
  } catch (error) {
    if (!board.value) guard.value = problemOf(error)
    else toast.error(problemOf(error).detail)
  } finally {
    loading.value = false
  }
}

function syncQuery(next) {
  const query = { ...route.query }
  if (next?.month) query.mes = next.month
  if (JSON.stringify(query) !== JSON.stringify(route.query))
    router.replace({ query })
}

function focusLine(key) {
  if (!key || !board.value?.lines.some((l) => l.key === key)) return
  focusKey.value = key
  document.getElementById(rowId(key))?.scrollIntoView?.({ block: 'center' })
  window.clearTimeout(focusTimer)
  focusTimer = window.setTimeout(() => {
    focusKey.value = ''
  }, FOCUS_MS)
}

// The month lives in the URL (`?mes=`): the switch writes it and the watcher
// below reads it back, so a shared link and the arrows take the same road.
function go(delta) {
  const month = shiftMonth(board.value?.month, delta)
  if (!month) return
  const query = { ...route.query, mes: month }
  delete query.linea
  router.replace({ query })
}

function setCompany(company) {
  if (!company || company === board.value?.company) return
  load({ company })
}

function onBack(event) {
  event?.preventDefault?.()
  router.push({ name: 'Gastos' })
}

watch(
  () => route.query.mes,
  (mes) => {
    const month = queryMonth(mes)
    if (board.value && month && month !== board.value.month) load({ month })
  },
)

// ---- the records of one concept ------------------------------------------
const docsMounted = ref(false)
const docsOpen = ref(false)
const docsLoading = ref(false)
const docsProblem = ref('')
const docsLine = ref(null)
const docs = ref([])

async function openDocuments(line) {
  docsLine.value = line
  docsMounted.value = true
  docsOpen.value = true
  docsLoading.value = true
  docsProblem.value = ''
  docs.value = []
  try {
    const out = await comprasApi(API + 'documents', {
      company: board.value.company,
      month: board.value.month,
      key: line.key,
    })
    docs.value = out?.rows || []
  } catch (error) {
    docsProblem.value = problemOf(error).detail
  } finally {
    docsLoading.value = false
  }
}

const SHELL_BASE = '/crm'
function toRoute(url) {
  return url.startsWith(`${SHELL_BASE}/`) ? url.slice(SHELL_BASE.length) : url
}
function docSubtitle(row) {
  const parts = []
  if (row.date) parts.push(formatDate(row.date))
  if (row.party && row.name) parts.push(row.name)
  return parts.join(', ')
}

// ---- the plan --------------------------------------------------------------
const editMounted = ref(false)
const editOpen = ref(false)
const editFull = ref(false)
const saving = ref(false)
const saveProblem = ref('')
const rows = ref([])
let rowKey = 0

const rowsOf = (kind) => rows.value.filter((r) => r.kind === kind)

function addRow(kind, extra = {}) {
  rows.value.push({
    key: `new:${++rowKey}`,
    kind,
    item_group: '',
    account: '',
    label: '',
    amount: '',
    note: '',
    pick: kind === 'Gastos',
    ...extra,
  })
}

function removeRow(row) {
  rows.value = rows.value.filter((r) => r !== row)
}

function openEdit() {
  rows.value = editRows(board.value?.lines || [])
  if (!rowsOf('Ventas').length) addRow('Ventas', { pick: false })
  if (!rowsOf('Gastos').some((r) => !r.account))
    rows.value.unshift({
      key: 'gastos:operacion',
      kind: 'Gastos',
      item_group: '',
      account: '',
      label: '',
      amount: '',
      note: '',
      pick: false,
    })
  saveProblem.value = ''
  editMounted.value = true
  editOpen.value = true
}

function findGroups(search) {
  return comprasApi(API + 'grupos', { q: search })
}
function findAccounts(search) {
  return comprasApi(API + 'cuentas', {
    company: board.value.company,
    q: search,
  })
}

async function save() {
  saving.value = true
  saveProblem.value = ''
  try {
    const next = await comprasApi(API + 'save', {
      company: board.value.company,
      month: board.value.month,
      lines: linesPayload(rows.value),
    })
    board.value = next
    editOpen.value = false
    toast.success(__('Budget saved', null, 'Presupuesto'))
  } catch (error) {
    saveProblem.value = problemOf(error).detail
  } finally {
    saving.value = false
  }
}

onMounted(() => load())
</script>
