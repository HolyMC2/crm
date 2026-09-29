<template>
  <LayoutHeader>
    <template #left-header>
      <ViewBreadcrumbs v-model="viewControls" routeName="Deals" />
    </template>
    <template #right-header>
      <VerticalSlot v-if="!isMobile" slot-name="deals_list_header" />
      <CustomActions
        v-if="dealsListView?.customListActions"
        :actions="dealsListView.customListActions"
      />
      <Button
        variant="solid"
        :label="__('Create')"
        iconLeft="plus"
        @click="showDealModal = true"
      />
    </template>
  </LayoutHeader>
  <!-- phone: the deal search box (taller tenants) gets its own row; inside the
       header its fixed width pushed «Crear» past the viewport. Hidden when the
       slot renders nothing. -->
  <div v-if="isMobile" class="px-3 pt-1.5 empty:hidden">
    <VerticalSlot slot-name="deals_list_header" />
  </div>
  <!-- a report drilled into this list: the way back to it -->
  <div v-if="drill" class="flex items-center px-5 pt-2">
    <Button
      variant="ghost"
      size="sm"
      iconLeft="arrow-left"
      :label="__('Back to {0}', [__(drill.source.label)])"
      @click="backToDrillSource"
    />
  </div>
  <ViewControls
    ref="viewControls"
    v-model="deals"
    v-model:loadMore="loadMore"
    v-model:resizeColumn="triggerResize"
    v-model:updatedPageCount="updatedPageCount"
    doctype="CRM Deal"
    :options="{
      allowedViews: ['list', 'group_by', 'kanban'],
      persistState: true,
      routeFilters: parseDealListQuery,
    }"
  />
  <DealsListSummary
    v-if="deals.data"
    v-model:funnel="showFunnel"
    :summary="metrics.summary.value"
    :currency="metrics.currency.value"
    :loading="metrics.loading.value"
    :error="metrics.error.value"
    :pipelines="pipelineList"
    :pipeline="selectedPipeline"
    :stage="selectedStage"
    :stage-options="stageOptions"
    :show-filters="isMobile"
    :filter-count="sheetFilterCount"
    @update:pipeline="setPipeline"
    @update:stage="setStage"
    @retry="metrics.reload()"
    @open-filters="showFilterSheet = true"
  />
  <FunnelView
    v-if="showFunnel && deals.data"
    :groups="stageOptions"
    :counts="metrics.summary.value.byStatus"
  />
  <KanbanView
    v-else-if="route.params.viewType == 'kanban'"
    v-model="deals"
    :options="{
      getRoute: (row) =>
        dealRowRoute(router.hasRoute, row.name, {
          view: route.query.view,
          viewType: route.params.viewType,
        }),
      onNewClick: (column) => onNewClick(column),
    }"
    @update="(data) => viewControls.updateKanbanSettings(data)"
    @loadMore="(columnName) => viewControls.loadMoreKanban(columnName)"
  >
    <template #title="{ titleField, itemName }">
      <div class="flex gap-2 items-center">
        <div v-if="titleField === 'status'">
          <IndicatorIcon :class="getRow(itemName, titleField).color" />
        </div>
        <div
          v-else-if="
            titleField === 'organization' && getRow(itemName, titleField).label
          "
        >
          <Avatar
            class="flex items-center"
            :image="getRow(itemName, titleField).logo"
            :label="getRow(itemName, titleField).label"
            size="sm"
          />
        </div>
        <div
          v-else-if="
            titleField === 'deal_owner' &&
            getRow(itemName, titleField).full_name
          "
        >
          <Avatar
            class="flex items-center"
            :image="getRow(itemName, titleField).user_image"
            :label="getRow(itemName, titleField).full_name"
            size="sm"
          />
        </div>
        <div
          v-if="
            [
              'modified',
              'creation',
              'first_response_time',
              'first_responded_on',
              'response_by',
            ].includes(titleField)
          "
          class="truncate text-base"
        >
          <Tooltip :text="getRow(itemName, titleField).label">
            <div>{{ getRow(itemName, titleField).timeAgo }}</div>
          </Tooltip>
        </div>
        <div v-else-if="titleField === 'sla_status'" class="truncate text-base">
          <Badge
            v-if="getRow(itemName, titleField).value"
            :variant="'subtle'"
            :theme="getRow(itemName, titleField).color"
            size="md"
            :label="getRow(itemName, titleField).value"
          />
        </div>
        <div
          v-else-if="getRow(itemName, titleField).label"
          class="truncate text-base"
        >
          {{ getRow(itemName, titleField).label }}
        </div>
        <div v-else class="text-ink-gray-4">{{ __('No Title') }}</div>
      </div>
    </template>

    <template #fields="{ fieldName, itemName }">
      <div
        v-if="getRow(itemName, fieldName).label"
        class="truncate flex items-center gap-2"
      >
        <div v-if="fieldName === 'status'">
          <IndicatorIcon :class="getRow(itemName, fieldName).color" />
        </div>
        <div v-else-if="fieldName === 'organization'">
          <Avatar
            v-if="getRow(itemName, fieldName).label"
            class="flex items-center"
            :image="getRow(itemName, fieldName).logo"
            :label="getRow(itemName, fieldName).label"
            size="xs"
          />
        </div>
        <div v-else-if="fieldName === 'deal_owner'">
          <Avatar
            v-if="getRow(itemName, fieldName).full_name"
            class="flex items-center"
            :image="getRow(itemName, fieldName).user_image"
            :label="getRow(itemName, fieldName).full_name"
            size="xs"
          />
        </div>
        <div
          v-if="
            [
              'modified',
              'creation',
              'first_response_time',
              'first_responded_on',
              'response_by',
            ].includes(fieldName)
          "
          class="truncate text-base"
        >
          <Tooltip :text="getRow(itemName, fieldName).label">
            <div>{{ getRow(itemName, fieldName).timeAgo }}</div>
          </Tooltip>
        </div>
        <div v-else-if="fieldName === 'sla_status'" class="truncate text-base">
          <Badge
            v-if="getRow(itemName, fieldName).value"
            :variant="'subtle'"
            :theme="getRow(itemName, fieldName).color"
            size="md"
            :label="getRow(itemName, fieldName).value"
          />
        </div>
        <div
          v-else-if="fieldName === '_assign'"
          class="flex items-center truncate"
        >
          <MultipleAvatar
            :avatars="getRow(itemName, fieldName).label"
            size="xs"
          />
        </div>
        <div v-else class="truncate text-base">
          {{ getRow(itemName, fieldName).label }}
        </div>
      </div>
    </template>

    <template #actions="{ itemName }">
      <div class="flex gap-2 items-center justify-between">
        <div class="text-ink-gray-5 flex items-center gap-1.5">
          <EmailAtIcon class="h-4 w-4" />
          <span v-if="getRow(itemName, '_email_count').label">
            {{ getRow(itemName, '_email_count').label }}
          </span>
          <span class="text-4xl leading-[0]"> &middot; </span>
          <NoteIcon class="h-4 w-4" />
          <span v-if="getRow(itemName, '_note_count').label">
            {{ getRow(itemName, '_note_count').label }}
          </span>
          <span class="text-4xl leading-[0]"> &middot; </span>
          <TaskIcon class="h-4 w-4" />
          <span v-if="getRow(itemName, '_task_count').label">
            {{ getRow(itemName, '_task_count').label }}
          </span>
          <span class="text-4xl leading-[0]"> &middot; </span>
          <CommentIcon class="h-4 w-4" />
          <span v-if="getRow(itemName, '_comment_count').label">
            {{ getRow(itemName, '_comment_count').label }}
          </span>
        </div>
        <Dropdown
          class="flex items-center gap-2"
          :options="actions(itemName)"
          variant="ghost"
          @click.stop.prevent
        >
          <Button icon="lucide-plus" variant="ghost" />
        </Dropdown>
      </div>
    </template>
  </KanbanView>
  <DealsMobileList
    v-else-if="isMobile && deals.data && rawRows.length"
    ref="mobileList"
    :rows="rawRows"
    :loading="deals.loading"
    :has-more="deals.data.total_count > rawRows.length"
    :menu-for="mobileMenu"
    @open="openDeal"
    @load-more="() => loadMore++"
  />
  <DealsListView
    v-else-if="deals.data && rows.length"
    ref="dealsListView"
    v-model="deals.data.page_length_count"
    v-model:list="deals"
    :rows="rows"
    :columns="columns"
    :options="{
      showTooltip: false,
      resizeColumn: true,
      rowCount: deals.data.row_count,
      totalCount: deals.data.total_count,
    }"
    @loadMore="() => loadMore++"
    @columnWidthUpdated="() => triggerResize++"
    @updatePageCount="(count) => (updatedPageCount = count)"
    @applyFilter="(data) => viewControls.applyFilter(data)"
    @applyLikeFilter="(data) => viewControls.applyLikeFilter(data)"
    @likeDoc="(data) => viewControls.likeDoc(data)"
    @selectionsChanged="
      (selections) => viewControls.updateSelections(selections)
    "
    @followUpSaved="onFollowUpSaved"
  />
  <EmptyState
    v-else-if="deals.data && !rows.length"
    name="Deals"
    :icon="DealsIcon"
  />
  <DealModal
    v-if="showDealModal"
    v-model="showDealModal"
    :defaults="defaults"
  />
  <MobileFilterSheet
    v-if="isMobile"
    v-model="showFilterSheet"
    :groups="sheetGroups"
    :count="deals.data?.total_count ?? null"
    @change="onSheetChange"
    @clear="clearSheetFilters"
  />
</template>

<script setup>
import { useCrmOnboarding } from '@/composables/onboarding'
import ViewBreadcrumbs from '@/components/ViewBreadcrumbs.vue'
import MultipleAvatar from '@/components/MultipleAvatar.vue'
import CustomActions from '@/components/CustomActions.vue'
import EmailAtIcon from '@/components/Icons/EmailAtIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import CommentIcon from '@/components/Icons/CommentIcon.vue'
import IndicatorIcon from '@/components/Icons/IndicatorIcon.vue'
import DealsIcon from '@/components/Icons/DealsIcon.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import DealsListView from '@/components/ListViews/DealsListView.vue'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import KanbanView from '@/components/Kanban/KanbanView.vue'
import DealModal from '@/components/Modals/DealModal.vue'
import ViewControls from '@/components/ViewControls.vue'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { getMeta } from '@/stores/meta'
import { globalStore } from '@/stores/global'
import { usersStore } from '@/stores/users'
import { organizationsStore } from '@/stores/organizations'
import { statusesStore } from '@/stores/statuses'
import { callEnabled } from '@/composables/telephony'
import { formatDate, timeAgo, website, formatTime } from '@/utils'
import { timestampCell } from '@/composables/useTimelinePreferences'
import { useTelemetry } from 'frappe-ui/frappe'
import { Tooltip, Avatar, Dropdown } from 'frappe-ui'
import VerticalSlot from '@/components/doco/VerticalSlot.vue'
import FunnelView from '@/components/doco/FunnelView.vue'
import MobileFilterSheet from '@/components/doco/MobileFilterSheet.vue'
import DealsListSummary from '@/components/doco/deals/DealsListSummary.vue'
import DealsMobileList from '@/components/doco/deals/DealsMobileList.vue'
import { isMobile } from '@/composables/breakpoint'
import { useDealListMetrics } from '@/composables/dealListMetrics'
import { isVirtualKey } from '@/utils/listColumns'
import { isBackToSource, parseDealListQuery } from '@/utils/listRouteQuery'
import {
  dealRowRoute,
  filterValues,
  pipelineStageOptions,
  selectedEquals,
  withEqualsFilter,
  withMultiFilter,
  withPipelineFilter,
} from '@/utils/dealsListSummary'
import { createResource } from 'frappe-ui'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import {
  ref,
  reactive,
  computed,
  h,
  provide,
  watch,
  nextTick,
  onMounted,
} from 'vue'

const { getFormattedPercent, getFormattedFloat, getFormattedCurrency } =
  getMeta('CRM Deal')
const { makeCall } = globalStore()
const { getUser } = usersStore()
const { getOrganization } = organizationsStore()
const statusStore = statusesStore()
const { getDealStatus } = statusStore
const { updateOnboardingStep } = useCrmOnboarding()
const { capture } = useTelemetry()
const { showModal } = useDoctypeModal()

const route = useRoute()
const router = useRouter()

const dealsListView = ref(null)
const showDealModal = ref(false)

const defaults = reactive({})

// deals data is loaded in the ViewControls component
const deals = ref({})
const loadMore = ref(1)
const triggerResize = ref(1)
const updatedPageCount = ref(20)
const viewControls = ref(null)

// Exposed to <VerticalSlot slot-name="deals_list_header"> children (e.g. taller's
// DealsSearchBox) so they can drive ViewControls.updateSearch without
// touching this file again on rebases.
provide('dealsViewControls', viewControls)

// ── drill-down from a report (?report=pipeline&status=…, utils/listRouteQuery) ──
// ViewControls turns the query into filters; the page offers the way back. Pop
// history when the report is the previous entry, so it keeps its own period and
// pipeline; otherwise open it.
const drill = computed(() => parseDealListQuery(route.query))
function backToDrillSource() {
  const target = router.resolve({ name: drill.value.source.name })
  let back
  try {
    back = window.history.state?.back
  } catch {
    back = undefined
  }
  if (isBackToSource(back, target.path)) router.back()
  else router.push(target)
}

// ── filters the page drives (pipeline, stage, phone sheet) ─────────────────────
// They write the same `filters` the Filter button does, through ViewControls,
// so saved views, totals and export all see them.
const currentFilters = computed(() => deals.value?.params?.filters || {})
function setFilters(filters) {
  viewControls.value?.updateFilter(filters)
}

const pipelines = createResource({
  url: 'crm.pipeline.api.get_pipelines',
  params: { include_archived: true },
  cache: ['crm-deal-list-pipelines'],
  auto: true,
})
// a site without pipelines (or an error) simply has no pipeline selector
const pipelineList = computed(() =>
  Array.isArray(pipelines.data) ? pipelines.data : [],
)
const selectedPipeline = computed(() =>
  selectedEquals(currentFilters.value, 'pipeline'),
)
const selectedStage = computed(() =>
  selectedEquals(currentFilters.value, 'status'),
)
// read through the store: a destructured pinia computed would freeze
const stageOptions = computed(() =>
  pipelineStageOptions(
    pipelineList.value,
    selectedPipeline.value,
    statusStore.visibleDealStatuses,
  ),
)
function setPipeline(pipeline) {
  const stages = pipelineStageOptions(
    pipelineList.value,
    pipeline,
    statusStore.visibleDealStatuses,
  ).map((s) => s.value)
  setFilters(withPipelineFilter(currentFilters.value, pipeline, stages))
}
function setStage(stage) {
  setFilters(withEqualsFilter(currentFilters.value, 'status', stage))
}

// ── totals + funnel ────────────────────────────────────────────────────────────
const metrics = useDealListMetrics(
  () =>
    deals.value?.params
      ? {
          filters: currentFilters.value,
          or_filters: deals.value.params.or_filters || {},
        }
      : null,
  () => stageOptions.value,
)
// asked after each list load; the composable skips it when filters are unchanged
watch(
  () => deals.value?.data,
  (data) => data && metrics.load(),
)
const showFunnel = ref(false)

// ── phone: cards + filter sheet ─────────────────────────────────────────────────
const showFilterSheet = ref(false)
const mobileList = ref(null)
const rawRows = computed(() => {
  const data = deals.value?.data
  if (!data || data.view_type === 'kanban' || !Array.isArray(data.data))
    return []
  return data.data
})
const ownerOptions = computed(() =>
  (usersStore().crmUsers || [])
    .filter((u) => u.enabled)
    .map((u) => ({ value: u.name, label: u.full_name?.trim() || u.name })),
)
const sheetGroups = computed(() => [
  ...(pipelineList.value.length
    ? [
        {
          key: 'pipeline',
          label: __('Sales pipeline'),
          options: pipelineList.value.map((p) => ({
            value: p.name,
            label: p.pipeline_name || p.name,
          })),
          selected: filterValues(currentFilters.value, 'pipeline'),
        },
      ]
    : []),
  {
    key: 'status',
    label: __('Stage'),
    options: stageOptions.value.map((s) => ({
      value: s.value,
      label: __(s.label),
    })),
    selected: filterValues(currentFilters.value, 'status'),
  },
  {
    key: 'deal_owner',
    label: __('Deal owner'),
    options: ownerOptions.value,
    selected: filterValues(currentFilters.value, 'deal_owner'),
  },
])
const sheetFilterCount = computed(() =>
  sheetGroups.value.reduce((n, g) => n + g.selected.length, 0),
)
function onSheetChange({ key, values }) {
  setFilters(withMultiFilter(currentFilters.value, key, values))
}
function clearSheetFilters() {
  let filters = currentFilters.value
  for (const g of sheetGroups.value)
    filters = withMultiFilter(filters, g.key, [])
  setFilters(filters)
}
function openDeal(name) {
  router.push(
    dealRowRoute(router.hasRoute, name, {
      view: route.query.view,
      viewType: route.params.viewType,
    }),
  )
}
function mobileMenu(name) {
  return [
    { label: __('Open'), onClick: () => openDeal(name) },
    ...actions(name),
  ]
}

// ── follow-up written from a row ───────────────────────────────────────────────
function onFollowUpSaved({ name, value }) {
  const row = (deals.value?.data?.data || []).find((r) => r.name === name)
  if (row) row._v_next_step = value
}

// ── back from a deal: same scroll position ───────────────────────────────────
// ViewControls keeps filters, search, sort and loaded pages; the page keeps
// where the worker was in the list.
function scrollElement() {
  if (isMobile.value) return mobileList.value?.scrollElement?.() || null
  return dealsListView.value?.scrollElement?.() || null
}
onBeforeRouteLeave(() => {
  viewControls.value?.saveListState({
    scrollTop: scrollElement()?.scrollTop || 0,
  })
})
let pendingScroll = null
onMounted(() => {
  pendingScroll = viewControls.value?.restoredScrollTop || null
})
watch(
  () => [deals.value?.data, deals.value?.loading],
  async ([data, loading]) => {
    if (!pendingScroll || !data || loading) return
    await nextTick()
    const el = scrollElement()
    if (!el) return
    el.scrollTop = pendingScroll
    pendingScroll = null
  },
)

function getRow(name, field) {
  function getValue(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value
    }
    return { label: value }
  }
  return getValue(rows.value?.find((row) => row.name == name)[field])
}

// Rows
const rows = computed(() => {
  if (!deals.value?.data?.data) return []
  if (deals.value.data.view_type === 'group_by') {
    if (!deals.value?.data.group_by_field?.fieldname) return []
    return getGroupedByRows(
      deals.value?.data.data,
      deals.value?.data.group_by_field,
      deals.value.data.columns,
    )
  } else if (deals.value.data.view_type === 'kanban') {
    return getKanbanRows(deals.value.data.data, deals.value.data.fields)
  } else {
    return parseRows(deals.value?.data.data, deals.value.data.columns)
  }
})

const columns = computed(() => {
  let _columns = deals.value?.data?.columns || []

  if (_columns.length) {
    _columns = _columns.map((col, index) => {
      if (index === _columns.length - 1) {
        return { ...col, align: 'right' }
      }
      return col
    })
  }

  return _columns
})

function getGroupedByRows(listRows, groupByField, columns) {
  let groupedRows = []

  groupByField.options?.forEach((option) => {
    let filteredRows

    if (!option) {
      filteredRows = listRows.filter((row) => !row[groupByField.fieldname])
    } else {
      filteredRows = listRows.filter(
        (row) => row[groupByField.fieldname] == option,
      )
    }

    let groupDetail = {
      label: groupByField.label,
      group: option || __(' '),
      collapsed: false,
      rows: parseRows(filteredRows, columns),
    }
    if (groupByField.fieldname == 'status') {
      groupDetail.icon = () =>
        h(IndicatorIcon, {
          class: getDealStatus(option)?.color,
        })
    }
    groupedRows.push(groupDetail)
  })

  return groupedRows || listRows
}

function getKanbanRows(data, columns) {
  let _rows = []
  data.forEach((column) => {
    column.data?.forEach((row) => {
      _rows.push(row)
    })
  })
  return parseRows(_rows, columns)
}

function parseRows(rows, columns = []) {
  let view_type = deals.value.data.view_type
  let key = view_type === 'kanban' ? 'fieldname' : 'key'
  let type = view_type === 'kanban' ? 'fieldtype' : 'type'

  return rows.map((deal) => {
    let _rows = {}
    deals.value.data.rows.forEach((row) => {
      _rows[row] = deal[row]
      // provider-computed values arrive ready to show (or as {label, color})
      if (isVirtualKey(row)) return

      let fieldType = columns?.find((col) => (col[key] || col.value) == row)?.[
        type
      ]

      if (
        fieldType &&
        ['Date', 'Datetime'].includes(fieldType) &&
        !['modified', 'creation'].includes(row)
      ) {
        _rows[row] = formatDate(deal[row], '', true, fieldType == 'Datetime')
      }

      if (fieldType && fieldType == 'Currency') {
        _rows[row] = getFormattedCurrency(row, deal)
      }

      if (fieldType && fieldType == 'Float') {
        _rows[row] = getFormattedFloat(row, deal)
      }

      if (fieldType && fieldType == 'Percent') {
        _rows[row] = getFormattedPercent(row, deal)
      }

      if (row == 'organization') {
        _rows[row] = {
          label: deal.organization,
          logo: getOrganization(deal.organization)?.organization_logo,
        }
      } else if (row === 'website') {
        _rows[row] = website(deal.website)
      } else if (row == 'status') {
        _rows[row] = {
          label: deal.status,
          color: getDealStatus(deal.status)?.color,
        }
      } else if (row == 'sla_status') {
        let value = deal.sla_status
        let tooltipText = value
        let color =
          deal.sla_status == 'Failed'
            ? 'red'
            : deal.sla_status == 'Fulfilled'
              ? 'green'
              : 'orange'
        if (value == 'First Response Due' || value == 'Rolling Response Due') {
          value = __(timeAgo(deal.response_by))
          tooltipText = formatDate(deal.response_by)
          if (new Date(deal.response_by) < new Date()) {
            color = 'red'
          }
        }
        _rows[row] = {
          label: tooltipText,
          value: value,
          color: color,
        }
      } else if (row == 'deal_owner') {
        _rows[row] = {
          label: deal.deal_owner && getUser(deal.deal_owner).full_name,
          ...(deal.deal_owner && getUser(deal.deal_owner)),
        }
      } else if (row == '_assign') {
        let assignees = JSON.parse(deal._assign || '[]')
        _rows[row] = assignees.map((user) => ({
          name: user,
          image: getUser(user).user_image,
          label: getUser(user).full_name,
        }))
      } else if (['modified', 'creation'].includes(row)) {
        _rows[row] = timestampCell(deal[row])
      } else if (
        ['first_response_time', 'first_responded_on', 'response_by'].includes(
          row,
        )
      ) {
        let field = row == 'response_by' ? 'response_by' : 'first_responded_on'
        _rows[row] = {
          label: deal[field] ? formatDate(deal[field]) : '',
          timeAgo: deal[row]
            ? row == 'first_response_time'
              ? formatTime(deal[row])
              : __(timeAgo(deal[row]))
            : '',
        }
      }
    })
    _rows['_email_count'] = deal._email_count
    _rows['_note_count'] = deal._note_count
    _rows['_task_count'] = deal._task_count
    _rows['_comment_count'] = deal._comment_count
    return _rows
  })
}

function onNewClick(column) {
  let column_field = deals.value.params.column_field

  if (column_field) {
    defaults[column_field] = column.column.name
  }

  showDealModal.value = true
}

function actions(itemName) {
  let mobile_no = getRow(itemName, 'mobile_no')?.label || ''
  let actions = [
    {
      icon: h(PhoneIcon, { class: 'h-4 w-4' }),
      label: __('Make a Call'),
      onClick: () => makeCall(mobile_no),
      condition: () => mobile_no && callEnabled.value,
    },
    {
      icon: h(NoteIcon, { class: 'h-4 w-4' }),
      label: __('New Note'),
      onClick: () => showNote(itemName),
    },
    {
      icon: h(TaskIcon, { class: 'h-4 w-4' }),
      label: __('New Task'),
      onClick: () => showTask(itemName),
    },
  ]
  return actions.filter((action) =>
    action.condition ? action.condition() : true,
  )
}

function showNote(name) {
  showModal({
    doctype: 'FCRM Note',
    title: 'Note',
    defaults: {
      reference_doctype: 'CRM Deal',
      reference_docname: name,
    },
    callbacks: {
      afterInsert: (d) => after(d, true),
      afterUpdate: after,
    },
  })
}

function showTask(name) {
  showModal({
    doctype: 'CRM Task',
    title: 'Task',
    defaults: {
      reference_doctype: 'CRM Deal',
      reference_docname: name,
    },
    callbacks: {
      afterInsert: (d) => after(d, true),
      afterUpdate: after,
    },
  })
}

function after(d, isNew = false) {
  let a = d.doctype == 'CRM Task' ? 'task' : 'note'
  if (isNew) {
    updateOnboardingStep('create_first_' + a)
    capture(a + '_created')
  } else {
    capture(a + '_updated')
  }
}
</script>
