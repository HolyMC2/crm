<template>
  <ModuleLayout
    title="Garantías"
    :entries="entries"
    :active-key="state.segment"
    @select="selectSegment"
  >
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Garantías is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button :label="__('Copy access request')" @click="copyRequest" />
        <Button :label="__('Back', null, 'Garantías')" @click="router.back()" />
      </div>
      <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
        {{ copied }}
      </p>
    </section>
    <div
      v-else
      :ref="(el) => (list.scroller.value = el)"
      class="flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-garantias-scroller
      @scroll.passive="list.rememberScroll"
    >
      <PowerAppBar
        v-if="list.phone.value"
        v-model:search="list.search.value"
        v-model:search-open="list.searchOpen.value"
        :title="segmentLabel(state.segment)"
        :count="countLabel(state.segment)"
        :loading="list.loading.value && rows.length > 0"
        :entries="phoneEntries"
        :active="state.segment"
        :search-label="__('Search customer, serial or document')"
        :selectable="rows.length > 0 && state.segment !== 'cerradas'"
        :select-label="__('Select cases')"
        :selecting="list.selecting.value"
        :selected-count="list.selected.value.size"
        @select="selectSegment"
        @start-select="list.selecting.value = true"
        @select-all="list.selectAll"
        @clear-selection="list.clearSelection"
      >
        <template v-if="boot?.capabilities?.create" #actions>
          <button
            type="button"
            class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
            :aria-label="__('New case')"
            @click="openCreate()"
          >
            <FeatherIcon name="plus" class="h-6 w-6" />
          </button>
        </template>
        <!-- No counts strip: the chip row under the bar carries the counts. -->
      </PowerAppBar>
      <header
        v-else
        class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
      >
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-semibold text-ink-gray-9">
            {{ segmentLabel(state.segment) }}
          </h1>
          <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
        </div>
        <button
          type="button"
          class="text-sm text-ink-gray-6 hover:text-ink-gray-8"
          :aria-keyshortcuts="'Alt+H'"
          @click="openShortcutSheet()"
        >
          <kbd
            class="rounded border border-outline-gray-2 px-1.5 py-0.5 text-xs"
            >?</kbd
          >
          {{ __('Keyboard shortcuts') }}
        </button>
        <Button
          v-if="boot?.capabilities?.create"
          variant="solid"
          icon-left="plus"
          :label="__('New case')"
          class="min-h-11 sm:min-h-8"
          @click="openCreate()"
        />
      </header>
      <p
        v-if="boot?.setup_note"
        role="status"
        class="mx-4 my-3 rounded-md bg-surface-amber-1 px-3 py-2 text-sm text-ink-amber-8 sm:mx-6 sm:mt-0"
      >
        {{ boot.setup_note }}
      </p>
      <div
        class="flex flex-wrap items-center gap-2 px-4 pb-2 pt-2 sm:px-6 sm:pt-0"
      >
        <FormControl
          v-if="!list.phone.value"
          v-model="list.search.value"
          class="min-w-0 flex-1 sm:max-w-xs"
          type="search"
          :placeholder="__('Search customer, serial or document')"
          :aria-label="__('Search customer, serial or document')"
          :aria-keyshortcuts="'/'"
          data-power-search
        />
        <FormControl
          type="select"
          class="h-11 w-40 sm:h-auto"
          :aria-label="__('Kind', null, 'Garantías')"
          :model-value="state.kind"
          :options="[
            { label: __('All kinds'), value: '' },
            ...KINDS.map((k) => ({
              label: kindLabel(k.value),
              value: k.value,
            })),
          ]"
          @update:model-value="(value) => list.navigate({ kind: value })"
        />
      </div>
      <!-- One filter row: what needs attention (past the SLA, nobody on it)
           and «Míos» instead of a separate checkbox. -->
      <div
        class="flex gap-2 overflow-x-auto px-4 pb-3 sm:flex-wrap sm:px-6"
        role="group"
        :aria-label="__('Needs attention')"
        data-garantias-chips
      >
        <button
          v-for="chip in state.segment !== 'cerradas' ? chips : []"
          :key="chip.value || 'all'"
          type="button"
          class="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-sm sm:min-h-8"
          :class="
            state.chip === chip.value
              ? 'border-outline-gray-4 bg-surface-gray-10 text-ink-base'
              : 'border-outline-gray-2 text-ink-gray-8 hover:bg-surface-gray-2'
          "
          :aria-pressed="state.chip === chip.value"
          @click="list.navigate({ chip: chip.value })"
        >
          {{ chip.label }}
          <span
            v-if="chip.count !== undefined"
            class="tabular-nums"
            :class="state.chip === chip.value ? '' : 'text-ink-gray-6'"
            >{{ chip.count }}</span
          >
        </button>
        <button
          v-if="state.segment !== 'mis-casos'"
          type="button"
          class="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-sm sm:min-h-8"
          :class="
            state.mine
              ? 'border-outline-gray-4 bg-surface-gray-10 text-ink-base'
              : 'border-outline-gray-2 text-ink-gray-8 hover:bg-surface-gray-2'
          "
          :aria-pressed="Boolean(state.mine)"
          data-garantias-mine
          @click="list.navigate({ mine: state.mine ? '' : '1' })"
        >
          {{ __('Mine', null, CTX) }}
        </button>
      </div>
      <div
        v-if="problem"
        role="alert"
        class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button
          v-if="problem.row"
          class="ml-2"
          :label="__('Open case')"
          @click="list.openRow(problem.row)"
        />
        <Button
          class="ml-2"
          :label="__('Retry', null, 'Garantías')"
          @click="retry"
        />
      </div>
      <div class="flex-1 pb-6">
        <div
          v-if="list.loading.value && !rows.length"
          role="status"
          class="px-6 py-8 text-sm text-ink-gray-6"
        >
          {{ __('Loading cases…') }}
        </div>
        <div
          v-else-if="!rows.length"
          class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
        >
          <p class="text-lg font-semibold">{{ emptyTitle }}</p>
          <p class="mt-1 text-sm">{{ emptyBody }}</p>
          <Button
            v-if="state.chip"
            class="mt-3 min-h-11 sm:min-h-8"
            :label="__('Show every case')"
            @click="list.navigate({ chip: '' })"
          />
          <Button
            v-else-if="state.segment === 'nuevas' && boot?.capabilities?.create"
            class="mt-4"
            :label="__('New case')"
            @click="openCreate()"
          />
        </div>
        <ul
          v-else
          :ref="(el) => (list.listbox.value = el)"
          tabindex="0"
          class="divide-y divide-outline-gray-1 focus:outline-none"
          role="listbox"
          :aria-label="segmentLabel(state.segment)"
          :aria-multiselectable="true"
          :aria-activedescendant="
            list.focusKey.value ? list.domId(list.focusKey.value) : undefined
          "
        >
          <li
            v-for="row in rows"
            :id="list.domId(row.name)"
            :key="row.name"
            role="option"
            :aria-selected="list.selected.value.has(row.name)"
            :data-row-key="row.name"
            class="group relative"
            :class="[
              list.focusKey.value === row.name ? 'bg-surface-gray-2' : '',
              list.selected.value.has(row.name) ? 'bg-surface-blue-1' : '',
            ]"
          >
            <div class="flex items-start">
              <label
                v-if="
                  state.segment !== 'cerradas' &&
                  (!list.phone.value || list.selecting.value)
                "
                class="flex min-h-14 shrink-0 cursor-pointer items-center pl-5"
                :aria-label="__('Select {0}', [row.name])"
              >
                <input
                  type="checkbox"
                  class="h-5 w-5 rounded"
                  :checked="list.selected.value.has(row.name)"
                  @change="list.toggleRow(row)"
                />
              </label>
              <a
                :href="recordHref(row)"
                class="flex min-h-14 min-w-0 flex-1 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
                :class="
                  !list.phone.value || list.selecting.value
                    ? 'pl-2 sm:pl-2'
                    : ''
                "
                @click="list.onRowClick($event, row)"
              >
                <FeatherIcon
                  name="shield"
                  class="mt-0.5 h-4 w-4 shrink-0 text-ink-gray-5"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium text-ink-gray-9">
                    {{ row.customer_name }}
                  </span>
                  <span class="block truncate text-sm text-ink-gray-6">
                    {{
                      [
                        row.name,
                        row.item_name || row.serial_no,
                        row.against_name,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    }}
                  </span>
                  <span
                    v-if="row.complaint"
                    class="mt-0.5 block truncate text-sm text-ink-gray-8"
                    >{{ row.complaint }}</span
                  >
                  <span
                    v-if="nextStepLabel(row)"
                    class="mt-0.5 block truncate text-sm font-medium text-ink-gray-8"
                    data-next-step
                    >{{ nextStepLabel(row) }}</span
                  >
                  <span class="mt-1 flex flex-wrap gap-1">
                    <Badge theme="gray" :label="kindLabel(row.kind)" />
                    <Badge
                      v-if="state.segment === 'cerradas'"
                      :theme="stateTheme(row.state)"
                      :label="stateLabel(row.state)"
                    />
                    <template v-else>
                      <Badge
                        v-if="state.segment === 'mis-casos'"
                        :theme="stateTheme(row.state)"
                        :label="stateLabel(row.state)"
                      />
                      <Badge
                        v-if="row.due"
                        :theme="dueTheme(row.due)"
                        :label="dueLabel(row.due)"
                      />
                      <Badge
                        v-if="ageLabel(row.age_days)"
                        :theme="ageTone(row.age_days)"
                        :label="ageLabel(row.age_days)"
                        data-age
                      />
                      <Badge
                        v-if="!row.assignees?.length"
                        theme="orange"
                        :label="__('Unassigned')"
                      />
                    </template>
                    <Badge
                      v-for="person in row.assignees"
                      :key="person.user"
                      theme="blue"
                      :label="person.full_name"
                    />
                  </span>
                </span>
              </a>
            </div>
            <!-- The focused row's actions, each with its key (desktop; a phone opens the case). -->
            <div
              v-if="
                !list.phone.value &&
                list.focusKey.value === row.name &&
                state.segment !== 'cerradas'
              "
              class="flex flex-wrap justify-end gap-1 px-4 pb-2"
              data-row-actions
            >
              <Button
                v-for="action in rowActions(row)"
                :key="action.key"
                size="sm"
                variant="ghost"
                :label="`${action.label} · ${action.hint}`"
                :aria-keyshortcuts="action.hint"
                :loading="busyRow === row.name"
                @click="runVerb(action.key, row)"
              >
                <template #prefix>
                  <FeatherIcon :name="action.icon" class="h-4 w-4" />
                </template>
              </Button>
            </div>
          </li>
        </ul>
        <div v-if="list.hasMore.value" class="px-4 py-4 sm:px-6">
          <Button
            :label="__('Load more', null, 'Garantías')"
            :loading="list.loading.value"
            class="min-h-11 w-full sm:w-auto"
            @click="list.load({ more: true })"
          />
        </div>
      </div>

      <PowerBulkBar
        v-if="list.selected.value.size"
        :count="list.selected.value.size"
        :label="__('Selected cases')"
      >
        <Button
          variant="solid"
          class="min-h-12 sm:min-h-8"
          :label="__('Assign', null, 'Garantías')"
          @click="bulkOpen = true"
        >
          <template #prefix
            ><FeatherIcon name="user-plus" class="h-4 w-4"
          /></template>
        </Button>
      </PowerBulkBar>
    </div>
    <NewClaimDialog
      v-model="creating"
      :prefill="prefill"
      @created="onCreated"
    />
    <AssignDialog
      v-model="assignOpen"
      :claim="sheetRow?.name || ''"
      :assignees="sheetRow?.assignees || []"
      @changed="assigned"
    />
    <BulkAssignSheet
      v-model="bulkOpen"
      :rows="list.selectedRows.value"
      :me="boot?.user || ''"
      @done="bulkDone"
      @open="openFromResult"
    />
  </ModuleLayout>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import AssignDialog from '@/components/garantias/AssignDialog.vue'
import BulkAssignSheet from '@/components/garantias/BulkAssignSheet.vue'
import NewClaimDialog from '@/components/garantias/NewClaimDialog.vue'
import PowerAppBar from '@/components/power/PowerAppBar.vue'
import PowerBulkBar from '@/components/power/PowerBulkBar.vue'
import { openShortcutSheet } from '@/composables/shellKeyboard'
import { offerUndo, runUndo } from '@/composables/powerUndo'
import { usePowerList } from '@/composables/usePowerList'
import {
  CHIPS,
  CREATE_KEYS,
  CTX,
  KINDS,
  LIVE_DOCTYPES,
  QUEUE_KEYS,
  SEGMENTS,
  ageLabel,
  ageTone,
  caseStep,
  createPrefill,
  dueLabel,
  dueTheme,
  garantiasApi,
  garantiasBoot,
  kindLabel,
  listHref,
  listMemoryKey,
  loadGarantiasBoot,
  nextStepLabel,
  normalizeSegment,
  problemOf,
  queueShortcuts,
  queueState,
  recordRoute,
  safeReturn,
  segmentLabel,
  stateLabel,
  stateTheme,
} from '@/composables/useGarantias'

const route = useRoute()
const router = useRouter()
const boot = garantiasBoot
const counts = ref({})
const attention = ref(null)
const slaTracked = ref(false)
const countCap = ref(100)
const copied = ref('')
const creating = ref(false)
const prefill = ref({})
const sheetRow = ref(null)
const assignOpen = ref(false)
const bulkOpen = ref(false)
const busyRow = ref('')
// The URL is the state: list, attention chip, kind, mine, search and focused case.
const state = computed(() => queueState(route.query))

const list = usePowerList({
  name: 'garantias',
  routeName: 'Garantias',
  filters: (query) => {
    const s = queueState(query)
    return [s.segment, s.chip, s.kind, s.mine, s.q]
  },
  memoryKey: listMemoryKey,
  fetch: ({ start, page_length }) =>
    garantiasApi('queue', {
      segment: state.value.segment,
      kind: state.value.kind,
      mine: state.value.mine ? 1 : 0,
      chip: state.value.chip,
      q: state.value.q.trim(),
      start,
      page_length,
    }),
  onPage: (page) => {
    counts.value = page.counts || {}
    attention.value = page.attention || null
    slaTracked.value = Boolean(page.sla)
    countCap.value = page.count_cap || 100
  },
  problemOf,
  open: (row) => router.push(recordRouteFor(row)),
  keys: QUEUE_KEYS,
  verbs: {
    assign: (row, { selectedRows }) =>
      selectedRows.length ? (bulkOpen.value = true) : runVerb('assign', row),
    take: (row) => runVerb('take', row),
    review: (row) => runVerb('review', row),
  },
  shortcuts: () => queueShortcuts(),
  enabled: () => Boolean(boot.value?.enabled),
  paused: () => Boolean(guard.value),
  // Assigning several cases at once is the bulk action: open cases only.
  selectable: () => state.value.segment !== 'cerradas',
  live: { doctypes: LIVE_DOCTYPES, minIntervalMs: 5000 },
})
const rows = list.rows
const problem = list.problem

const capText = (value) =>
  value === undefined || value === null
    ? ''
    : value >= countCap.value
      ? `${countCap.value - 1}+`
      : String(value)
function countLabel(value) {
  return value === 'cerradas' || counts.value[value] === undefined
    ? undefined
    : capText(counts.value[value])
}
const entries = computed(() =>
  SEGMENTS.map((s) => ({
    ...s,
    label:
      segmentLabel(s.value) +
      (countLabel(s.value) !== undefined ? ` (${countLabel(s.value)})` : ''),
  })),
)
const phoneEntries = computed(() =>
  SEGMENTS.map((s) => ({
    ...s,
    title: segmentLabel(s.value),
    count: countLabel(s.value),
  })),
)
const chips = computed(() =>
  CHIPS.filter((chip) => chip.value !== 'vencidas' || slaTracked.value).map(
    (chip) => ({
      ...chip,
      label: __(chip.label, null, CTX),
      count: chip.value ? capText(attention.value?.[chip.value]) : undefined,
    }),
  ),
)
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __('Ask your manager for access to warranty and return cases.')
    : '',
)
const subtitle = computed(
  () =>
    ({
      'mis-casos': __(
        'Open cases assigned to you, oldest first, with their next step.',
      ),
      nuevas: __('Cases nobody has reviewed yet, oldest first.'),
      'en-revision': __('Cases being repaired or decided.'),
      'con-proveedor': __('Products sent to the supplier.'),
      cerradas: __('Resolved and cancelled cases.'),
    })[state.value.segment],
)
const emptyTitle = computed(() =>
  state.value.q ? __('No cases match') : __('Nothing here', null, 'Garantías'),
)
const emptyBody = computed(() => {
  if (state.value.q)
    return __('Try another customer, serial number or document.')
  if (state.value.chip === 'vencidas')
    return __('No case in this list is past its due time.')
  if (state.value.chip === 'sin-asignar')
    return __('Every case in this list has someone on it.')
  if (state.value.segment === 'mis-casos')
    return __(
      'Take a case (key T) or ask to be assigned one, and it shows up here.',
    )
  return state.value.segment === 'nuevas'
    ? __(
        'When a customer comes back with a product, open a case here or from Taller.',
      )
    : __('Cases move here as they progress.')
})

/** The record's route; going back lands on this row of this list. */
function recordRouteFor(row) {
  return {
    ...recordRoute(row.name),
    query: { list: listHref(list.returnQuery(row)) },
  }
}
function recordHref(row) {
  const { query } = recordRouteFor(row)
  return `/crm/garantias/${encodeURIComponent(row.name)}?${new URLSearchParams(query)}`
}

function rowActions(row) {
  const mine = (row.assignees || []).some((a) => a.user === boot.value?.user)
  return [
    !mine && {
      key: 'take',
      label: __('Take the case'),
      icon: 'user-check',
      hint: 'T',
    },
    {
      key: 'assign',
      label: __('Assign the case'),
      icon: 'user-plus',
      hint: 'A',
    },
    row.state === 'Nueva' && {
      key: 'review',
      label: __('Start the review'),
      icon: 'play',
      hint: 'R',
    },
  ].filter(Boolean)
}

// ── verbs: the focused case (keys, the row's buttons) ──────────────────────

function explain(step, row) {
  if (step.kind === 'closed' || step.kind === 'open')
    return toast.error(step.text, {
      action: { label: __('Open case'), onClick: () => list.openRow(row) },
    })
  return toast.success(step.text)
}

async function runVerb(action, row) {
  if (!row) return
  list.focusRow(row)
  sheetRow.value = row
  const step = caseStep(row, action, boot.value?.user)
  if (step.kind !== 'go') return explain(step, row)
  if (action === 'assign') return (assignOpen.value = true)
  if (action === 'take') return take(row)
  if (action === 'review') return review(row)
}

/** «Tomar el caso»: assigned to me, with «Deshacer». */
async function take(row) {
  const me = boot.value?.user
  busyRow.value = row.name
  problem.value = null
  try {
    await garantiasApi('assign', { name: row.name, user: me })
    offerUndo(__('Case {0} is yours', [row.name]), () =>
      runUndo(() => garantiasApi('unassign', { name: row.name, user: me }), {
        done: __('Case {0} put back', [row.name]),
        describe: (error) => problemOf(error).detail,
        reload: () => list.load({ quiet: true }),
      }),
    )
    list.load({ quiet: true })
  } catch (error) {
    problem.value = { ...problemOf(error), row }
  } finally {
    busyRow.value = ''
  }
}

/** «Revisar»: the Workflow's own first step (the server says who may). */
async function review(row) {
  busyRow.value = row.name
  problem.value = null
  try {
    await garantiasApi('transition', {
      name: row.name,
      action: 'Revisar',
      modified: row.modified || null,
    })
    toast.success(__('Case {0} is in review', [row.name]))
    list.load({ quiet: true })
  } catch (error) {
    problem.value = { ...problemOf(error), row }
  } finally {
    busyRow.value = ''
  }
}

function assigned() {
  list.load({ quiet: true })
}

function bulkDone(results) {
  const done = results.filter((entry) => entry.status === 'done')
  list.clearSelection()
  list.load({ quiet: true })
  if (!done.length) return
  const user = done[0].user
  offerUndo(
    done.length === 1
      ? __('1 case assigned')
      : __('{0} cases assigned', [done.length]),
    () =>
      runUndo(
        async () => {
          for (const entry of done)
            await garantiasApi('unassign', { name: entry.item.name, user })
        },
        {
          done: __('Assignment undone'),
          describe: (error) => problemOf(error).detail,
          reload: () => list.load({ quiet: true }),
        },
      ),
  )
}
function openFromResult(row) {
  bulkOpen.value = false
  list.openRow(row)
}

function retry() {
  problem.value = null
  list.load({ quiet: true })
}
function selectSegment(value) {
  list.navigate({
    segment: normalizeSegment(value),
    // «Mis casos» is mine already; the closed list has no attention chips.
    ...(value === 'mis-casos' ? { mine: '' } : {}),
    ...(value === 'cerradas' ? { chip: '' } : {}),
  })
}

/** «Nuevo caso», or a hand-off from Taller/Ventas with the document prefilled. */
function openCreate(values = {}) {
  prefill.value = values
  creating.value = true
}
// A hand-off (Taller order, POS sale) brings its way back; the new case keeps it.
let handoffReturn = null
function onCreated(name) {
  const query = handoffReturn ? { ...handoffReturn } : { list: route.fullPath }
  handoffReturn = null
  router.push({ ...recordRoute(name), query })
}
function createFromQuery() {
  if (route.query.create !== '1' || !boot.value?.capabilities?.create) return
  const values = createPrefill(route.query)
  const back = safeReturn(route.query.return_to)
  handoffReturn = back
    ? {
        return_to: back,
        ...(typeof route.query.return_label === 'string'
          ? { return_label: route.query.return_label.slice(0, 40) }
          : {}),
      }
    : null
  const query = { ...route.query }
  for (const key of ['create', 'return_to', 'return_label', ...CREATE_KEYS])
    delete query[key]
  router.replace({ query })
  openCreate(values)
}

async function retryBoot() {
  await loadGarantiasBoot({ refresh: true })
  if (boot.value?.enabled) list.load({ restore: true })
}
async function copyRequest() {
  const text = __(
    'I need access to Garantías: read permission for Warranty Claim in my company so I can follow warranty and return cases.',
  )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}

onMounted(async () => {
  await loadGarantiasBoot()
  if (!boot.value?.enabled) return
  createFromQuery()
  list.load({ restore: true })
})
</script>
