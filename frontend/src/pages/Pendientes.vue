<template>
  <ModuleLayout
    title="Pendientes"
    :entries="deskEntries"
    :active-key="state.segment"
    @select="selectSegment"
  >
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Pendientes is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button :label="__('Copy access request')" @click="copyRequest" />
        <Button :label="__('Back')" @click="router.back()" />
      </div>
      <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
        {{ copied }}
      </p>
    </section>
    <div v-else class="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <!-- Phone: the view is the large title (a sheet picks any list, with
           counts); the four smart views sit under it as one island. -->
      <AppBar
        v-if="phone"
        v-model:search="search"
        v-model:search-open="searchOpen"
        :context="__('Pendientes')"
        :title="segmentLabel(state.segment)"
        :count="titleCount"
        :scopes="phoneEntries"
        :scope="state.segment"
        :scope-title="__('Choose a list')"
        searchable
        :search-label="__('Search pendientes')"
        @update:scope="selectSegment"
      >
        <!-- Search opens the filters under it (ui/AppBar #search-panel). -->
        <template v-if="!approvals" #search-panel>
          <FilterChips
            v-if="sourceChips.length"
            inline
            :label="__('Task source')"
            :model-value="state.source === 'all' ? '' : state.source"
            :chips="sourceChips"
            @update:model-value="(value) => update({ source: value || 'all' })"
          />
          <ChipGroup
            :label="__('Priority')"
            :options="priorityChips"
            :model-value="state.priority"
            data-pendientes-priority
            @update:model-value="(value) => update({ priority: value || '' })"
          />
          <button
            v-if="state.from || state.to"
            type="button"
            :class="chipClass(true)"
            @click="update({ from: '', to: '' })"
          >
            {{ rangeLabel }} <span aria-hidden="true">×</span
            ><span class="sr-only">{{ __('Remove date range') }}</span>
          </button>
        </template>
        <template v-if="!approvals && activeChips.length" #active>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="chip in activeChips"
              :key="chip.key"
              type="button"
              :class="chipClass(true)"
              :aria-label="__('Remove filter {0}', [chip.label])"
              @click="chip.clear"
            >
              {{ chip.label }}
              <span class="lucide-x size-3 flex-none" aria-hidden="true" />
            </button>
          </div>
        </template>
      </AppBar>
      <header
        v-else
        class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
      >
        <!-- The title owns its row on phones (basis-full) so the buttons can
             never squeeze it down to one letter; it wraps between words. -->
        <div class="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <h1
            class="title-face flex items-baseline gap-2 text-2xl font-semibold text-ink-gray-9 [overflow-wrap:break-word] [text-wrap:balance]"
          >
            {{ segmentLabel(state.segment) }}
            <span
              v-if="titleCount"
              class="num text-lg font-medium text-ink-gray-5"
              >{{ titleCount }}</span
            >
          </h1>
          <p class="text-sm text-ink-gray-6 [text-wrap:pretty]">
            {{ subtitle }}
          </p>
        </div>
        <template v-if="!approvals">
          <Segmented
            v-if="!phone"
            class="sm:w-56"
            :label="__('View', null, 'Pendientes')"
            :model-value="state.view || 'list'"
            :options="viewOptions"
            @update:model-value="
              (value) => update({ view: value === 'board' ? 'board' : '' })
            "
          />
          <!-- The one task editor creates sales tasks too (on a lead or deal);
               CRM's own form is only for sellers without pendientes. -->
          <Button
            v-if="boot?.capabilities?.create_crm && !boot?.capabilities?.create"
            variant="solid"
            :icon-left="LucideBriefcase"
            :label="__('New sales task')"
            class="min-h-11 sm:min-h-8"
            @click="newSalesTask"
          />
          <Button
            v-if="boot?.capabilities?.create"
            variant="solid"
            :icon-left="LucidePlus"
            :label="__('New pendiente')"
            class="min-h-11 sm:min-h-8"
            @click="openCreate()"
          />
        </template>
      </header>
      <!-- Phone: the smart views as one island, what waits for a decision
           beside them when anything does. -->
      <div
        v-if="phone && !searchOpen"
        class="space-y-2 px-4 pb-2 pt-1"
        data-pendientes-views
      >
        <Segmented
          fit="content"
          :label="__('Smart lists')"
          :model-value="islandValue"
          :options="islandOptions"
          @update:model-value="selectSegment"
        />
        <button
          v-if="approveWaiting && state.segment !== 'approve'"
          type="button"
          class="press flex min-h-9 items-center gap-2 rounded-full bg-surface-amber-1 px-3 text-sm text-ink-amber-9"
          data-pendientes-approve-nudge
          @click="selectSegment('approve')"
        >
          <span class="num font-semibold">{{ approveWaiting }}</span>
          {{ __('waiting for your OK') }}
          <Icon icon="chevron-right" class="size-4" aria-hidden="true" />
        </button>
      </div>
      <div
        v-if="!phone"
        class="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-2 sm:px-6"
      >
        <FormControl
          v-model="search"
          data-list-search
          class="w-full min-w-0 sm:w-64"
          type="search"
          :placeholder="__('Search pendientes')"
          :aria-label="__('Search pendientes')"
        />
        <FilterChips
          v-if="!approvals && sourceChips.length"
          class="[&>div]:px-0"
          :label="__('Task source')"
          :model-value="state.source === 'all' ? '' : state.source"
          :chips="sourceChips"
          @update:model-value="(value) => update({ source: value || 'all' })"
        />
        <FilterChips
          v-if="!approvals"
          class="[&>div]:px-0"
          :label="__('Priority')"
          :model-value="state.priority"
          :chips="priorityChips"
          @update:model-value="(value) => update({ priority: value || '' })"
        />
        <button
          v-if="state.from || state.to"
          type="button"
          class="flex min-h-8 items-center gap-1 rounded-full bg-surface-gray-2 px-3 text-sm"
          @click="update({ from: '', to: '' })"
        >
          {{ rangeLabel }} <span aria-hidden="true">×</span
          ><span class="sr-only">{{ __('Remove date range') }}</span>
        </button>
      </div>
      <div
        v-if="problem"
        role="alert"
        class="mx-4 mb-3 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button class="ml-2" :label="__('Retry')" @click="load()" />
      </div>
      <PendientesBoard
        v-if="board"
        :rows="boardRows"
        :today="today"
        :query="returnQuery"
        :show-assignee="assigneeShown"
        :movable-all="state.segment === 'delegated'"
        :busy="busy"
        @move="moveTo"
      />
      <div v-else class="flex min-h-0 flex-1">
        <div
          ref="scroller"
          class="min-h-0 overflow-y-auto pb-24 sm:pb-6"
          :class="
            split
              ? 'w-[26rem] flex-none border-r border-outline-gray-1 xl:w-[30rem]'
              : 'flex-1'
          "
          @scroll.passive="rememberScroll"
        >
          <!-- «Por aprobar» / «Esperando respuesta»: the owners' rows (useAprobaciones). -->
          <ApprovalList
            v-if="approvals"
            :state="state"
            :restore="restoreScroll"
            @loaded="approvalLoaded"
            @segment="selectSegment"
          />
          <template v-else>
            <!-- Desk: the line to add one sits on top of the list (Google Tasks). -->
            <QuickAdd
              v-if="!phone && canQuickAdd"
              ref="composer"
              :today="today"
              :me="boot?.user || ''"
              @add="quickAdd"
              @details="detailsFromComposer"
            />
            <!-- Skeleton rows while the first answer is on its way, never a spinner. -->
            <div
              v-if="loading && !loaded"
              role="status"
              :aria-label="__('Loading pendientes…')"
              class="px-4 pt-2 sm:px-6"
            >
              <div
                v-for="n in 5"
                :key="n"
                class="flex items-start gap-3 border-b border-outline-gray-1 py-3"
              >
                <span class="size-5 shrink-0 rounded-full bg-surface-gray-2" />
                <span class="min-w-0 flex-1 space-y-2">
                  <span
                    class="block h-3.5 rounded-full bg-surface-gray-2"
                    :style="{ width: `${88 - n * 9}%` }"
                  />
                  <span class="block h-3 w-24 rounded-full bg-surface-gray-1" />
                </span>
              </div>
            </div>
            <template v-else-if="sectioned">
              <div
                v-if="allClear"
                class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
              >
                <Icon
                  icon="sun"
                  class="mx-auto mb-3 size-8 text-ink-gray-4"
                  aria-hidden="true"
                />
                <p class="text-lg font-semibold">
                  {{
                    state.segment === 'hoy'
                      ? __('Nothing left for today')
                      : __('You are up to date')
                  }}
                </p>
                <p class="mt-1 text-sm">
                  {{
                    __(
                      'Nothing is due. Plan the next follow-up so it does not slip.',
                    )
                  }}
                </p>
                <Button
                  v-if="state.segment === 'hoy' && counts.upcoming?.value"
                  class="mt-4 min-h-11 sm:min-h-8"
                  :label="
                    __('See upcoming ({0})', [countText(counts.upcoming)])
                  "
                  @click="selectSegment('upcoming')"
                />
                <Button
                  v-else-if="canCreate"
                  class="mt-4 min-h-11 sm:min-h-8"
                  :label="__('Add a pendiente')"
                  @click="startCreate"
                />
              </div>
              <!-- Open sections: a sticky heading with the count as a figure;
                   an empty one folds into its heading line. -->
              <section
                v-for="group in shownGroups"
                v-else
                :key="group"
                :aria-labelledby="`pendientes-${group}`"
              >
                <h2
                  :id="`pendientes-${group}`"
                  class="sticky top-0 z-10 flex items-baseline gap-2 bg-surface-base px-4 pb-1.5 pt-4 text-sm font-semibold text-ink-gray-8 sm:px-6"
                >
                  {{ groupLabel(group) }}
                  <span
                    v-if="
                      sections[group]?.rows?.length &&
                      countText(sections[group]?.count)
                    "
                    class="num font-medium"
                    :class="
                      group === 'overdue' ? 'text-ink-red-7' : 'text-ink-gray-5'
                    "
                    >{{ countText(sections[group]?.count) }}</span
                  >
                  <span
                    v-if="!sections[group]?.rows?.length"
                    class="font-normal text-ink-gray-5"
                    >{{ emptyText(group) }}</span
                  >
                </h2>
                <TransitionGroup
                  tag="div"
                  name="pd-list"
                  class="relative"
                  :data-reorder-list="group"
                >
                  <PendienteRow
                    v-for="row in sections[group]?.rows || []"
                    :key="row.doctype + row.name"
                    :data-scroll-key="row.doctype + row.name"
                    :data-row-key="rowKey(row)"
                    :row="row"
                    :today="today"
                    :query="returnQuery"
                    :link="split ? selectLink(row) : null"
                    :selected="isSelected(row)"
                    :busy="busy.has(row.doctype + row.name)"
                    :fresh="fresh.has(rowKey(row))"
                    :completing="completing.has(rowKey(row))"
                    :reorderable="canReorder(row)"
                    @complete="quickComplete"
                    @complete-next="openComplete"
                    @reschedule="reschedule"
                    @star="toggleStar"
                    @step="tickStep"
                  />
                </TransitionGroup>
                <div v-if="sections[group]?.has_more" class="px-4 py-2 sm:px-6">
                  <Button
                    :label="__('See all')"
                    @click="
                      selectSegment(group === 'upcoming' ? 'upcoming' : group)
                    "
                  />
                </div>
              </section>
            </template>
            <template v-else>
              <p
                v-if="!rows.length"
                class="mx-auto max-w-md px-6 py-10 text-center text-sm text-ink-gray-6"
              >
                {{ emptyText(state.segment) }}
              </p>
              <!-- «Próximos»: a heading per day. -->
              <section
                v-for="block in flatBlocks"
                :key="block.day || 'all'"
                :aria-label="block.label || undefined"
              >
                <h2
                  v-if="block.label"
                  class="sticky top-0 z-10 flex items-baseline gap-2 bg-surface-base px-4 pb-1.5 pt-4 text-sm font-semibold text-ink-gray-8 sm:px-6"
                >
                  {{ block.label }}
                  <span class="num font-medium text-ink-gray-5">{{
                    block.rows.length
                  }}</span>
                </h2>
                <TransitionGroup
                  tag="div"
                  name="pd-list"
                  class="relative"
                  :data-reorder-list="`day:${block.day}`"
                >
                  <PendienteRow
                    v-for="row in block.rows"
                    :key="row.doctype + row.name"
                    :data-scroll-key="row.doctype + row.name"
                    :data-row-key="rowKey(row)"
                    :row="row"
                    :today="today"
                    :query="returnQuery"
                    :show-assignee="assigneeShown"
                    :link="split ? selectLink(row) : null"
                    :selected="isSelected(row)"
                    :busy="busy.has(row.doctype + row.name)"
                    :fresh="fresh.has(rowKey(row))"
                    :completing="completing.has(rowKey(row))"
                    :reorderable="canReorder(row)"
                    @complete="quickComplete"
                    @complete-next="openComplete"
                    @reschedule="reschedule"
                    @star="toggleStar"
                    @step="tickStep"
                  />
                </TransitionGroup>
              </section>
              <div v-if="hasMore" class="px-4 py-3 sm:px-6">
                <Button
                  :label="__('Load more')"
                  :loading="loading"
                  @click="load(rows.length)"
                />
              </div>
            </template>
            <!-- Done work folds under the open work (Google Tasks «Completadas (n)»);
                 a ticked row slides in here. -->
            <section
              v-if="doneShown"
              class="mt-4 border-t border-outline-gray-1"
              data-pendientes-done
            >
              <button
                type="button"
                class="flex min-h-14 w-full items-center gap-2 px-4 text-left text-base font-semibold text-ink-gray-8 sm:px-6"
                :aria-expanded="String(doneOpen)"
                aria-controls="pendientes-done"
                @click="toggleDone"
              >
                <Icon
                  icon="chevron-right"
                  class="size-5 text-ink-gray-5 transition-transform duration-150"
                  :class="doneOpen ? 'rotate-90' : ''"
                  aria-hidden="true"
                />
                {{ __('Completed', null, 'Pendientes') }}
                <Transition name="pd-bump" mode="out-in">
                  <span
                    :key="doneCount"
                    class="num font-medium text-ink-gray-5"
                    >{{ doneCount }}</span
                  >
                </Transition>
              </button>
              <ExpandTransition>
                <div v-if="doneOpen" id="pendientes-done">
                  <TransitionGroup tag="div" name="pd-list" class="relative">
                    <PendienteRow
                      v-for="row in doneRows"
                      :key="row.doctype + row.name"
                      :row="row"
                      :today="today"
                      :query="returnQuery"
                      :link="split ? selectLink(row) : null"
                      :selected="isSelected(row)"
                      :busy="busy.has(row.doctype + row.name)"
                      @complete="undo"
                    />
                  </TransitionGroup>
                  <div class="px-4 py-2 sm:px-6">
                    <Button
                      variant="ghost"
                      class="min-h-11 sm:min-h-8"
                      :label="__('See all')"
                      @click="selectSegment('done')"
                    />
                  </div>
                </div>
              </ExpandTransition>
            </section>
          </template>
        </div>
        <!-- Desktop ≥1024: the chosen pendiente beside the list (?sel=). -->
        <section
          v-if="split"
          class="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 pb-10 pt-2"
          :aria-label="__('Pendiente details')"
        >
          <PendienteDetail
            v-if="selection"
            :key="selection.doctype + selection.name"
            :doctype="selection.doctype"
            :name="selection.name"
            :wide="false"
            @changed="detailChanged"
            @redirect="(target) => router.replace(selectLink(target))"
          >
            <template #leave>
              <Button :label="__('Close')" @click="closeDetail" />
            </template>
          </PendienteDetail>
          <div
            v-else
            class="mx-auto mt-16 max-w-sm text-center text-sm text-ink-gray-6"
          >
            <LucidePanelLeft
              class="mx-auto mb-3 block size-8 text-ink-gray-4"
              aria-hidden="true"
            />
            {{
              __('Choose a pendiente to see its details, notes and activity.')
            }}
          </div>
        </section>
      </div>
      <Fab
        v-if="phone && !approvals && canCreate && !composerOpen"
        :label="__('New pendiente')"
        @click="fabCreate"
      />
      <!-- Phone: the line to add one rises over the command bar from the +. -->
      <QuickAdd
        v-if="phone && canQuickAdd"
        ref="composer"
        v-model:open="composerOpen"
        docked
        :today="today"
        :me="boot?.user || ''"
        @add="quickAdd"
        @details="detailsFromComposer"
      />
    </div>
    <CompleteDialog
      v-model="completeOpen"
      :row="selected"
      :today="today"
      :with-next="true"
      @done="afterComplete"
      @reload="reloadAfterConflict"
    />
    <CreateDialog
      v-model="createOpen"
      :today="today"
      :reference="createReference"
      :prefill="createPrefill"
      :sales-task="Boolean(boot?.capabilities?.create_crm)"
      @created="afterCreate"
      @sales-task="salesFromCreate"
    />
    <DoctypeModals v-if="nativeEditor" />
  </ModuleLayout>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { Button, FormControl, toast } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import { AppBar, Fab, FilterChips, Segmented } from '@/components/ui'
import ChipGroup from '@/components/ui/ChipGroup.vue'
import ExpandTransition from '@/components/ui/ExpandTransition.vue'
import { chipClass } from '@/components/ui/chipClass'
import Icon from '@/components/Icon.vue'
import { useMediaQuery } from '@vueuse/core'
import { isMobile as phone } from '@/composables/breakpoint'
import { useListKeys } from '@/composables/pageKeys'
import { useLiveList } from '@/composables/liveList'
import { useReorder } from '@/composables/useReorder'
import PendienteRow from '@/components/pendientes/PendienteRow.vue'
import ApprovalList from '@/components/pendientes/ApprovalList.vue'
import CompleteDialog from '@/components/pendientes/CompleteDialog.vue'
import CreateDialog from '@/components/pendientes/CreateDialog.vue'
import QuickAdd from '@/components/pendientes/QuickAdd.vue'
import { loadShell, shellBoot } from '@/composables/muelleShell'
import {
  aprobacionesApi,
  countText as approvalCountText,
} from '@/composables/useAprobaciones'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { safeIntendedRoute } from '@/utils/shellRoutes'
import { formatDay } from '@/utils/contactos'
import {
  captureScroll,
  readScroll,
  scrollTarget,
  sessionStore,
  settleScroll,
  writeScroll,
} from '@/utils/listScroll'
import {
  GROUPS,
  byDay,
  canCreateOn,
  countText,
  dayHeading,
  groupOf,
  isApprovalSegment,
  parseQuery,
  parseSelection,
  pendienteError,
  pendienteRoute,
  pendientesApi,
  queueArgs,
  requestId,
  segmentEntries,
  segmentLabel,
  selectionKey,
  serverSegment,
  stateLabel,
  toQuery,
  viewCounts,
  viewGroups,
} from '@/composables/usePendientes'
import { createListCache } from '@/utils/listCache'
import LucideBriefcase from '~icons/lucide/briefcase'
import LucidePlus from '~icons/lucide/plus'
import LucidePanelLeft from '~icons/lucide/panel-left'

// Desktop only (the detail beside the list, the board): loaded when shown.
const PendienteDetail = defineAsyncComponent(
  () => import('@/components/pendientes/PendienteDetail.vue'),
)
const PendientesBoard = defineAsyncComponent(
  () => import('@/components/pendientes/PendientesBoard.vue'),
)
// CRM's own wired CRM Task editor, loaded only for workers who create sales tasks.
const DoctypeModals = defineAsyncComponent(
  () => import('@/components/Modals/DoctypeModals.vue'),
)
const { showModal } = useDoctypeModal()
const route = useRoute(),
  router = useRouter()
const state = computed(() => parseQuery(route.query))
const boot = computed(() => shellBoot.value?.modules?.pendientes || null)
const today = computed(() => boot.value?.today || '')
const approvalCounts = ref(null)
// The smart lists' counts, from the last «Mis pendientes» answer.
const mineAnswer = ref(null)
const counts = computed(() => viewCounts(mineAnswer.value))
const countOf = (segment) =>
  isApprovalSegment(segment)
    ? approvalCountText(approvalCounts.value?.[segment])
    : countText(counts.value[segment])

// The lists in the order a worker reaches for them: the smart views first.
const ORDER = [
  'hoy',
  'upcoming',
  'assigned',
  'mine',
  'approve',
  'waiting',
  'delegated',
  'team',
  'done',
  'overdue',
  'today',
  'undated',
]
const entries = computed(() =>
  segmentEntries({
    team: Boolean(boot.value?.capabilities?.team),
    delegated: Boolean(boot.value?.capabilities?.delegated),
    // A link to either list always opens it; the pills follow the capability.
    approve:
      Boolean(boot.value?.capabilities?.approve) ||
      state.value.segment === 'approve',
    waiting:
      Boolean(boot.value?.capabilities?.waiting) ||
      state.value.segment === 'waiting',
  })
    .concat(
      // An old link to one due section still names it in the lists.
      ['overdue', 'today', 'undated']
        .filter((segment) => segment === state.value.segment)
        .map((segment) => ({
          value: segment,
          label: segmentLabel(segment),
          icon: 'calendar',
        })),
    )
    .sort((a, b) => ORDER.indexOf(a.value) - ORDER.indexOf(b.value))
    .map((entry) => ({ ...entry, count: countOf(entry.value) || undefined })),
)
// Desk: the lists in the module's side column, each with its figure.
const deskEntries = computed(() =>
  entries.value.filter(
    (entry) => entry.value !== 'done' || state.value.segment === 'done',
  ),
)
const approvals = computed(() => isApprovalSegment(state.value.segment))
// On a phone «Hechos» is the «Completadas (n)» fold, not a list in the picker
// (a «See all» link from that fold still opens it).
const phoneEntries = computed(() =>
  entries.value.filter(
    (entry) => entry.value !== 'done' || state.value.segment === 'done',
  ),
)
// The phone island: four smart views; any other list lives behind the title.
const ISLAND = ['hoy', 'upcoming', 'assigned', 'mine']
const islandOptions = computed(() =>
  ISLAND.map((segment) => ({
    value: segment,
    label:
      segment === 'mine'
        ? __('All', null, 'Pendientes')
        : segment === 'upcoming'
          ? __('Upcoming', null, 'Pendientes short')
          : segmentLabel(segment),
    // A zero says nothing on the island; the list itself says it is empty.
    count: ['', '0'].includes(countOf(segment)) ? undefined : countOf(segment),
  })),
)
const islandValue = computed(() =>
  ISLAND.includes(state.value.segment) ? state.value.segment : '',
)
const approveWaiting = computed(() =>
  approvalCountText(approvalCounts.value?.approve),
)
const titleCount = computed(() => {
  if (approvals.value) return undefined
  const count = countOf(state.value.segment)
  return count || undefined
})
const searchOpen = ref(Boolean(state.value.q))
// Source chips only where sources mix (both lists readable, not the team list).
const sourceChips = computed(() =>
  boot.value?.sources?.['CRM Task'] && state.value.segment !== 'team'
    ? [
        { value: 'ToDo', label: __('Pendientes') },
        { value: 'CRM Task', label: __('Sales tasks') },
      ]
    : [],
)
// What narrows the phone list, as removable chips under the closed search.
const activeChips = computed(() => {
  const out = []
  const source = sourceChips.value.find((c) => c.value === state.value.source)
  if (source)
    out.push({
      key: 'source',
      label: source.label,
      clear: () => update({ source: 'all' }),
    })
  const priority = priorityChips.value.find(
    (c) => c.value === state.value.priority,
  )
  if (priority)
    out.push({
      key: 'priority',
      label: priority.label,
      clear: () => update({ priority: '' }),
    })
  if (state.value.from || state.value.to)
    out.push({
      key: 'range',
      label: rangeLabel.value,
      clear: () => update({ from: '', to: '' }),
    })
  return out
})
const priorityChips = computed(() => [
  { value: 'High', label: __('High') },
  { value: 'Medium', label: __('Medium') },
  { value: 'Low', label: __('Low') },
])
const viewOptions = computed(() => [
  { value: 'list', label: __('List') },
  { value: 'board', label: __('Board') },
])
// Desktop ≥1024: list + detail side by side; the board is its own view.
const wide = useMediaQuery('(min-width: 1024px)')
const board = computed(
  () => !phone.value && !approvals.value && state.value.view === 'board',
)
const split = computed(() => wide.value && !approvals.value && !board.value)
const selection = computed(() =>
  split.value ? parseSelection(route.query.sel) : null,
)
const assigneeShown = computed(() =>
  ['team', 'delegated'].includes(state.value.segment),
)
const canCreate = computed(() =>
  Boolean(
    boot.value?.capabilities?.create || boot.value?.capabilities?.create_crm,
  ),
)
// Quick add writes a ToDo: only for who may create one.
const canQuickAdd = computed(() => Boolean(boot.value?.capabilities?.create))
// «Mis pendientes» and «Hoy» are sections of one answer; the rest are flat.
const sectioned = computed(() => viewGroups(state.value.segment).length > 0)
const doneCount = ref(0),
  doneOpen = ref(false),
  doneRows = ref([])
const doneShown = computed(() => sectioned.value && doneCount.value > 0)
// Empty sections fold into one heading line; the phone hides them.
const shownGroups = computed(() =>
  viewGroups(state.value.segment).filter(
    (group) =>
      sections[group]?.rows?.length ||
      (!phone.value &&
        !(state.value.segment === 'mine' && group === 'overdue')),
  ),
)
const guard = ref(''),
  copied = ref(''),
  problem = ref(null),
  loading = ref(false),
  loaded = ref(false),
  sections = reactive({}),
  rows = ref([]),
  hasMore = ref(false),
  busy = reactive(new Set()),
  completing = reactive(new Set()),
  scroller = ref(null),
  composer = ref(null),
  composerOpen = ref(false),
  search = ref(state.value.q)
const completeOpen = ref(false),
  selected = ref(null),
  createOpen = ref(false),
  createReference = ref(null),
  createPrefill = ref(null),
  nativeEditor = ref(false)
// Keyboard standard: search, j/k rows, Enter opens, c adds (the quick line on
// the desk, else the editor). x completes and s stars the row under focus.
useListKeys({
  page: 'pendientes',
  search: true,
  rows: true,
  open: true,
  create: () => startCreate(),
  when: {
    create: () => canCreate.value,
  },
  extra: () => [
    {
      id: 'pendiente.complete',
      keys: ['x'],
      description: 'Complete',
      run: () => onFocusedRow(quickComplete),
    },
    {
      id: 'pendiente.star',
      keys: ['s'],
      description: 'Star',
      run: () => onFocusedRow(toggleStar),
    },
  ],
})
// x and s act on the row under the focus (j/k move it), only on my own open work.
function onFocusedRow(action) {
  const row = findRow(
    document.activeElement?.closest?.('[data-row-key]')?.dataset?.rowKey,
  )
  if (!row || !row.mine || row.cancelled || row.status !== 'Open') return false
  action(row)
}

// Records return to exactly this list (segment, search and filters).
const returnQuery = computed(() => ({
  list: new URLSearchParams(toQuery(state.value)).toString(),
}))
const allClear = computed(
  () =>
    loaded.value &&
    !state.value.q &&
    viewGroups(state.value.segment).every(
      (group) => !sections[group]?.rows?.length,
    ),
)
const subtitle = computed(
  () =>
    ({
      hoy: __('What is late and what is due today'),
      upcoming: __('What comes next, day by day'),
      assigned: __('What someone else handed you'),
      team: __('Open work of your team that you can see'),
      delegated: __('What you handed to others, until they finish it'),
      done: __('Closed and cancelled work, newest first'),
      approve: __('Everything waiting for your OK, oldest first'),
      waiting: __('What you asked for and is still waiting for an answer'),
    })[state.value.segment] ||
    __('Your follow-ups from Contactos, Ventas and other records in one list'),
)
const rangeLabel = computed(() =>
  [state.value.from, state.value.to]
    .map((day) => (day ? formatDay(day) : '…'))
    .join(' – '),
)
// «Próximos» reads day by day; other flat lists are one block.
const flatBlocks = computed(() =>
  state.value.segment === 'upcoming'
    ? byDay(rows.value).map((block) => ({
        ...block,
        label: dayHeading(block.day, today.value),
      }))
    : [{ day: '', label: '', rows: rows.value }],
)

function groupLabel(group) {
  return (
    {
      overdue: __('Overdue', null, 'Pendientes section'),
      today: __('Today'),
      upcoming: __('Upcoming'),
    }[group] || segmentLabel(group)
  )
}
function emptyText(group) {
  return (
    {
      overdue: __('Nothing overdue.'),
      today: __('Nothing else due today.'),
      upcoming: __('Nothing planned yet.'),
      undated: __('Everything has a date.'),
      assigned: __('Nobody handed you anything open.'),
      team: __('Your team has no open work you can see.'),
      delegated: __('Nothing you handed to others is open.'),
      done: __('Nothing completed yet.'),
    }[group] || __('No pendientes with these filters.')
  )
}

const rowKey = (row) => `${row.doctype}:${row.name}`
function allLists() {
  return [
    rows.value,
    ...GROUPS.map((g) => sections[g]?.rows || []),
    doneRows.value,
  ]
}
function findRow(key) {
  if (!key) return null
  for (const list of allLists()) {
    const found = list.find((row) => rowKey(row) === key)
    if (found) return found
  }
  return null
}

function update(patch) {
  // Filters keep the open pendiente beside the list; a new list does not.
  const sel = typeof route.query.sel === 'string' ? route.query.sel : ''
  router.replace({
    name: 'Pendientes',
    query: {
      ...toQuery({ ...state.value, ...patch }),
      ...(sel ? { sel } : {}),
    },
  })
}
function selectLink(row) {
  return {
    name: 'Pendientes',
    query: { ...toQuery(state.value), sel: selectionKey(row) },
  }
}
function isSelected(row) {
  const open = selection.value
  return Boolean(
    open && open.doctype === row.doctype && open.name === String(row.name),
  )
}
function closeDetail() {
  router.replace({ name: 'Pendientes', query: toQuery(state.value) })
}
function detailChanged(row) {
  if (row) replaceRow(row)
  load()
}
function selectSegment(segment) {
  if (!segment || segment === state.value.segment) return
  router.push({
    name: 'Pendientes',
    query: toQuery({ ...state.value, segment }),
  })
}
let searchTimer
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => update({ q: value.trim() }), 250)
})

// The list's last answer paints at once on a visit or a filter change; a
// search is not kept, and approval lists load their own rows. «Hoy» and «Mis
// pendientes» share one answer.
const listCache = createListCache('pendientes', () =>
  state.value.q || approvals.value
    ? null
    : [
        serverSegment(state.value.segment),
        state.value.source,
        state.value.priority,
        state.value.from,
        state.value.to,
      ],
)
function showQueue(response, start = 0) {
  if (response.sections) {
    for (const group of GROUPS) sections[group] = response.sections[group]
    doneCount.value = response.done?.value || 0
    if (!state.value.q) mineAnswer.value = response
  } else {
    rows.value = start ? [...rows.value, ...response.rows] : response.rows
    hasMore.value = response.has_more
  }
  loaded.value = true
}
function paintCached() {
  listCache.paint((response) => {
    showQueue(response)
    restoreScroll()
  })
}

let generation = 0
async function load(start = 0, { quiet = false } = {}) {
  // Approval lists load their own rows (ApprovalList).
  if (guard.value || approvals.value) return
  const current = ++generation
  const listAt = start ? null : listCache.key()
  // The painted copy already holds the remembered place; the read keeps it.
  const fromCache = !start && listCache.showing()
  const before = quiet ? visibleKeys() : null
  loading.value = true
  problem.value = null
  try {
    const response = await pendientesApi('queue', queueArgs(state.value, start))
    if (current !== generation) return
    showQueue(response, start)
    if (before) live.mark(before, visibleKeys())
    if (response.sections && (doneOpen.value || board.value)) loadDone()
    if (!start) listCache.save(listAt, response)
    if (!start && !fromCache && !quiet) restoreScroll()
  } catch (error) {
    if (current === generation && !quiet) problem.value = pendienteError(error)
  } finally {
    if (current === generation) loading.value = false
  }
}
// The counts of the smart lists come with «Mis pendientes»; another view asks
// for them once, without touching what is on screen.
async function loadCounts() {
  if (sectioned.value || state.value.q) return
  try {
    mineAnswer.value = await pendientesApi(
      'queue',
      queueArgs({ ...state.value, segment: 'mine', q: '' }, 0),
    )
  } catch {
    /* the island just shows no figures */
  }
}
function visibleKeys() {
  return [
    ...rows.value,
    ...GROUPS.flatMap((group) => sections[group]?.rows || []),
  ].map(rowKey)
}

// Live (Shell-S8): a pendiente a teammate assigns appears without a reload,
// highlighted for a moment; the worker's own saves are already on screen.
const live = useLiveList(
  () =>
    guard.value || approvals.value
      ? ''
      : ['ToDo', ...(boot.value?.sources?.['CRM Task'] ? ['CRM Task'] : [])],
  () => {
    load(0, { quiet: true })
    loadApprovalCounts()
  },
)
const fresh = computed(() => live.fresh.value)

// Back from a record (phone back gesture, browser back or «Back to
// Pendientes») returns to the same row. The position is saved when leaving and
// while scrolling, and restored only once the sections have rendered and the
// phone header has settled (utils/listScroll).
// Keyed by the list's normalized state, so «Back to Pendientes» (rebuilt from
// the record's `list` query) and browser back find the same entry.
const scrollKey = () => `muelle:pendientes:scroll:${returnQuery.value.list}`
let stopRestore = null
let leaving = false
// «Por aprobar» / «Esperando respuesta» load their own rows (ApprovalList): they
// are on screen once it says so, not when this page's own list has loaded.
const approvalReady = ref(false)
function rememberScroll() {
  // Not mid-restore (clamped in-between positions), nor while the rows are off
  // screen: a collapsed list would save the top and lose the place.
  const ready = approvals.value ? approvalReady.value : loaded.value
  if (leaving || stopRestore || !ready || !scroller.value) return
  writeScroll(sessionStore(), scrollKey(), captureScroll(scroller.value))
}
// Resolves once the list holds the place again (or there is none to restore),
// so the approval list moves its focus only after it (ApprovalList `restore`).
async function restoreScroll() {
  const saved = readScroll(sessionStore(), scrollKey())
  if (!saved?.top) return
  await nextTick()
  const el = scroller.value
  if (!el) return
  stopRestore?.()
  await new Promise((resolve) => {
    let stop = null,
      finished = false
    stop = settleScroll(el, () => scrollTarget(el, saved), {
      onDone: () => {
        finished = true
        if (stopRestore === stop) stopRestore = null
        rememberScroll()
        resolve()
      },
    })
    // Without frames (no rAF) nothing settles: nothing to wait for.
    if (finished || !globalThis.requestAnimationFrame) return resolve()
    stopRestore = stop
  })
}
onBeforeRouteLeave(() => {
  stopRestore?.()
  rememberScroll()
})
onBeforeUnmount(() => {
  // the route has already changed here: never save under the next page's key
  leaving = true
  stopRestore?.()
})

function replaceRow(updated, as = null) {
  const key = as || rowKey(updated)
  for (const list of allLists()) {
    const index = list.findIndex((row) => rowKey(row) === key)
    if (index >= 0) list[index] = { ...list[index], ...updated }
  }
}
// Where a row sits now: its list and index, so a failed write puts it back.
function locate(key) {
  for (const group of GROUPS) {
    const list = sections[group]?.rows
    const index = list ? list.findIndex((row) => rowKey(row) === key) : -1
    if (index >= 0) return { list, index, group }
  }
  const index = rows.value.findIndex((row) => rowKey(row) === key)
  return index >= 0 ? { list: rows.value, index, group: '' } : null
}
function bumpCount(group, by) {
  const count = sections[group]?.count
  if (count) count.value = Math.max(0, count.value + by)
}
const reduced = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

// One tap: the check fills, the row slides into «Completadas», undo in the
// toast. The write starts at once; a refusal puts the row back where it was.
async function quickComplete(row) {
  const key = rowKey(row)
  if (busy.has(key) || completing.has(key) || row.status !== 'Open') return
  busy.add(key)
  completing.add(key)
  const request = pendientesApi('complete', {
    doctype: row.doctype,
    name: String(row.name),
    modified: row.modified,
    request_id: requestId(),
  })
  const place = locate(key)
  const closed = { ...row, status: 'Closed', group: 'done' }
  const slide = new Promise((resolve) =>
    setTimeout(resolve, reduced() ? 0 : 320),
  )
  await slide
  if (place) {
    const index = place.list.findIndex((item) => rowKey(item) === key)
    if (index >= 0) place.list.splice(index, 1)
    if (place.group) bumpCount(place.group, -1)
  }
  completing.delete(key)
  doneCount.value += 1
  doneRows.value = [closed, ...doneRows.value]
  try {
    const response = await request
    replaceRow(response.row, key)
    toast.success(__('Pendiente completed'), {
      duration: 8000,
      action: { label: __('Undo'), onClick: () => undo(response.row) },
    })
    load(0, { quiet: true })
  } catch (error) {
    doneRows.value = doneRows.value.filter((item) => rowKey(item) !== key)
    doneCount.value = Math.max(0, doneCount.value - 1)
    if (place) {
      place.list.splice(Math.min(place.index, place.list.length), 0, row)
      if (place.group) bumpCount(place.group, 1)
    }
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`, {
      action:
        reason.kind === 'conflict'
          ? { label: __('Refresh'), onClick: () => load() }
          : undefined,
    })
  } finally {
    busy.delete(key)
  }
}
// Undo (the toast, or the check of a done row): it goes back to its section first.
async function undo(row) {
  const key = rowKey(row)
  if (busy.has(key)) return
  busy.add(key)
  const wasDone = doneRows.value.some((item) => rowKey(item) === key)
  if (wasDone) {
    doneRows.value = doneRows.value.filter((item) => rowKey(item) !== key)
    doneCount.value = Math.max(0, doneCount.value - 1)
  }
  const open = {
    ...row,
    status: 'Open',
    group: groupOf({ ...row, status: 'Open' }, today.value),
  }
  const list = sectioned.value ? sections[open.group]?.rows : null
  if (list && !list.some((item) => rowKey(item) === key)) {
    list.unshift(open)
    bumpCount(open.group, 1)
  }
  try {
    await pendientesApi('reopen', {
      doctype: row.doctype,
      name: String(row.name),
      modified: row.modified,
      request_id: requestId(),
    })
    toast.success(__('Pendiente reopened'))
  } catch (error) {
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`)
  } finally {
    busy.delete(key)
  }
  load(0, { quiet: true })
}
async function reschedule(row, date) {
  const key = row.doctype + row.name
  busy.add(key)
  try {
    await pendientesApi('reschedule', {
      doctype: row.doctype,
      name: String(row.name),
      modified: row.modified,
      date,
      request_id: requestId(),
    })
    toast.success(__('Moved to {0}', [formatDay(date)]))
    load()
  } catch (error) {
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`, {
      action: { label: __('Refresh'), onClick: () => load() },
    })
  } finally {
    busy.delete(key)
  }
}
// The star is «priority: high» (Google Tasks): flips at once, saved behind.
async function toggleStar(row) {
  const key = rowKey(row)
  if (busy.has(key) || row.pending) return
  const before = row.priority || 'Medium'
  const priority = before === 'High' ? 'Medium' : 'High'
  busy.add(key)
  replaceRow({ ...row, priority })
  try {
    const response = await pendientesApi('update', {
      doctype: row.doctype,
      name: String(row.name),
      modified: row.modified,
      values: { priority },
      request_id: requestId(),
    })
    replaceRow(response.row, key)
  } catch (error) {
    replaceRow({ ...row, priority: before }, key)
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`)
  } finally {
    busy.delete(key)
  }
}
// A subtask ticked from the row: the rest of the note stays as it was.
async function tickStep(row, step) {
  const key = rowKey(row)
  if (busy.has(key)) return
  busy.add(key)
  const flip = (checked) =>
    replaceRow(
      {
        ...row,
        steps: (row.steps || []).map((item) =>
          item.index === step.index ? { ...item, checked } : item,
        ),
      },
      key,
    )
  flip(!step.checked)
  try {
    const response = await pendientesApi('check', {
      doctype: row.doctype,
      name: String(row.name),
      modified: row.modified,
      index: step.index,
      checked: !step.checked,
      text: step.text,
      request_id: requestId(),
    })
    replaceRow(response.row, key)
  } catch (error) {
    flip(step.checked)
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`, {
      action: { label: __('Refresh'), onClick: () => load() },
    })
  } finally {
    busy.delete(key)
  }
}

// ── quick add ──
// The line becomes a row at once (new work on top of its day, Google Tasks);
// the server's row replaces it, a refusal gives the words back.
let tempId = 0
async function quickAdd({ values, parsed }) {
  const others = Boolean(values.assigned_to)
  const temp = {
    doctype: 'ToDo',
    name: `nuevo-${++tempId}`,
    description: values.description,
    date: values.date || null,
    time: values.date && values.time ? values.time : null,
    priority: values.priority,
    repeat: values.repeat || null,
    status: 'Open',
    mine: true,
    steps: [],
    pending: true,
  }
  temp.group = groupOf(temp, today.value)
  const key = rowKey(temp)
  const list = others ? null : listFor(temp)
  if (list) {
    list.unshift(temp)
    if (sectioned.value) bumpCount(temp.group, 1)
  }
  try {
    const response = await pendientesApi('create', {
      ...values,
      request_id: requestId(),
    })
    const row = response.row
    if (list) {
      const index = list.findIndex((item) => rowKey(item) === key)
      if (index >= 0) list.splice(index, 1, row)
      live.mark([], [rowKey(row)])
    }
    if (others)
      toast.success(__('Handed to {0}', [parsed.person?.name || '']), {
        action: {
          label: __('See'),
          onClick: () => selectSegment('delegated'),
        },
      })
    else if (!list)
      toast.success(
        __('Added for {0}', [
          values.date ? dayHeading(values.date, today.value) : __('No date'),
        ]),
        {
          action: {
            label: __('See'),
            onClick: () => selectSegment(values.date ? 'upcoming' : 'mine'),
          },
        },
      )
    load(0, { quiet: true })
  } catch (error) {
    if (list) {
      const index = list.findIndex((item) => rowKey(item) === key)
      if (index >= 0) list.splice(index, 1)
      if (sectioned.value) bumpCount(temp.group, -1)
    }
    if (!composer.value?.text)
      composer.value?.restore(parsed.title && textOf(parsed))
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`)
  }
}
// The words as typed, to give back after a refusal.
function textOf(parsed) {
  return [parsed.title, ...parsed.tokens.map((token) => token.text)].join(' ')
}
// The list on screen a new row belongs in (null: another view shows it).
function listFor(row) {
  if (
    state.value.q ||
    state.value.priority ||
    state.value.source === 'CRM Task'
  )
    return null
  if (sectioned.value) {
    if (!viewGroups(state.value.segment).includes(row.group)) return null
    sections[row.group] ||= { rows: [], has_more: false, count: null }
    sections[row.group].rows ||= []
    return sections[row.group].rows
  }
  if (state.value.segment === 'upcoming' && row.group === 'upcoming')
    return rows.value
  return null
}
function detailsFromComposer(parsed) {
  createPrefill.value = {
    title: parsed.title,
    date: parsed.date || '',
    time: parsed.date ? parsed.time || '' : '',
    priority: parsed.priority || 'Medium',
    repeat: parsed.repeat || '',
    assigned_to: parsed.person?.user || '',
    assigned_name: parsed.person?.name || '',
  }
  composerOpen.value = false
  openCreate()
}

// ── my order: drag on the desk, long-press on the phone ──
const ordered = computed(
  () =>
    ['mine', 'hoy', 'upcoming'].includes(state.value.segment) &&
    !state.value.q &&
    !board.value,
)
function canReorder(row) {
  return (
    ordered.value &&
    row.mine &&
    !row.pending &&
    !row.cancelled &&
    row.status === 'Open'
  )
}
useReorder(scroller, { onDrop: dropped, enabled: () => ordered.value })
async function dropped({ list: name, key, keys }) {
  const target = name.startsWith('day:') ? rows.value : sections[name]?.rows
  if (!target) return
  const row = target.find((item) => rowKey(item) === key)
  if (!row) return
  // The new order on screen at once: the dragged rows take the slots the
  // draggable rows held (a row still saving keeps its place).
  const byKey = new Map(target.map((item) => [rowKey(item), item]))
  const inList = keys.map((k) => byKey.get(k)).filter(Boolean)
  const slots = inList.map((item) => target.indexOf(item)).sort((a, b) => a - b)
  slots.forEach((slot, index) => (target[slot] = inList[index]))
  // A row dropped among another day's rows of «Próximos» moves to that day.
  const at = target.indexOf(row)
  const neighbour =
    target[at - 1]?.date && name !== 'overdue' ? target[at - 1] : target[at + 1]
  let day = row.date
  if (
    (name === 'upcoming' || name.startsWith('day:')) &&
    neighbour?.date &&
    neighbour.date !== row.date
  )
    day = neighbour.date
  try {
    if (day !== row.date) {
      const response = await pendientesApi('reschedule', {
        doctype: row.doctype,
        name: String(row.name),
        modified: row.modified,
        date: day,
        request_id: requestId(),
      })
      replaceRow(response.row, key)
      toast.success(__('Moved to {0}', [dayHeading(day, today.value)]))
    }
    const sameDay = target
      .filter((item) => (item.date || '') === (day || '') && canReorder(item))
      .slice(0, 200)
    if (sameDay.length > 1)
      await pendientesApi('reorder', {
        rows: sameDay.map((item) => ({
          doctype: item.doctype,
          name: String(item.name),
        })),
      })
  } catch (error) {
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`)
    load(0, { quiet: true })
  }
}

// The board shows the list's rows; «Mis pendientes» adds the recent done ones.
const boardRows = computed(() =>
  sectioned.value
    ? [
        ...viewGroups(state.value.segment).flatMap(
          (group) => sections[group]?.rows || [],
        ),
        ...doneRows.value,
      ]
    : rows.value,
)
async function moveTo(row, next) {
  const key = row.doctype + row.name
  if (busy.has(key)) return
  busy.add(key)
  try {
    await pendientesApi('update', {
      doctype: row.doctype,
      name: String(row.name),
      modified: row.modified,
      values: { state: next },
      request_id: requestId(),
    })
    toast.success(__('Moved to {0}', [stateLabel(next)]))
  } catch (error) {
    const reason = pendienteError(error)
    toast.error(`${reason.title}. ${reason.detail}`)
  } finally {
    busy.delete(key)
  }
  load()
}
async function loadDone() {
  try {
    const response = await pendientesApi(
      'queue',
      queueArgs({ ...state.value, segment: 'done' }, 0),
    )
    doneRows.value = (response.rows || []).slice(0, 10)
  } catch (error) {
    problem.value = pendienteError(error)
  }
}
function toggleDone() {
  doneOpen.value = !doneOpen.value
  if (doneOpen.value) loadDone()
}
// The + (and «c»): the quick line where it can write a pendiente, else the editor.
function startCreate() {
  if (canQuickAdd.value) {
    if (phone.value) composerOpen.value = true
    else composer.value?.focus()
    return
  }
  fabCreate()
}
function fabCreate() {
  if (canQuickAdd.value && phone.value) composerOpen.value = true
  else if (boot.value?.capabilities?.create) openCreate()
  else newSalesTask()
}
function salesFromCreate() {
  createOpen.value = false
  newSalesTask()
}
function openComplete(row) {
  selected.value = row
  completeOpen.value = true
}
function afterComplete(response) {
  toast.success(
    response.created
      ? __('Done. Next pendiente scheduled.')
      : __('Pendiente completed'),
  )
  load()
}

// Contextual creation: /crm/pendientes?create=1&reference_type=…&return_to=…
function openCreate(reference = null) {
  createReference.value = reference
  createOpen.value = true
}
watch(createOpen, (open) => {
  if (!open) createPrefill.value = null
})
// A sales task with assignee, activity and time: CRM's native create form.
function newSalesTask() {
  nativeEditor.value = true
  showModal({
    doctype: 'CRM Task',
    title: __('Task'),
    defaults: {
      status: 'Todo',
      priority: 'Medium',
      assigned_to: boot.value?.user,
      due_date: today.value ? `${today.value} 09:00:00` : undefined,
    },
    callbacks: { afterInsert: () => load() },
  })
}
function afterCreate(row) {
  const target = route.query.return_to
  if (typeof target === 'string' && target.startsWith('/crm/')) {
    const safe = safeIntendedRoute(target)
    const separator = safe.includes('?') ? '&' : '?'
    router.replace(
      safe.replace(/^\/crm/, '') +
        `${separator}done=${encodeURIComponent(`${row.doctype}:${row.name}`)}`,
    )
    return
  }
  // What the quick line held is now this pendiente.
  if (createPrefill.value && composer.value) composer.value.restore('')
  toast.success(__('Pendiente saved'), {
    action: {
      label: __('Open'),
      onClick: () =>
        router.push(
          split.value
            ? selectLink(row)
            : pendienteRoute(row, returnQuery.value),
        ),
    },
  })
  if (route.query.create) update({})
  load()
}

async function handoffs() {
  const query = route.query
  if (typeof query.pendiente === 'string' && query.pendiente) {
    try {
      const found = await pendientesApi('locate', { name: query.pendiente })
      router.replace(pendienteRoute(found, returnQuery.value))
    } catch (error) {
      problem.value = pendienteError(error)
      update({})
    }
    return true
  }
  const reference =
    typeof query.reference_type === 'string' && query.reference_name
      ? {
          reference_type: query.reference_type,
          reference_name: String(query.reference_name),
          reference_label: String(query.reference_label || ''),
        }
      : null
  if (query.create === '1' && canCreateOn(reference, boot.value))
    openCreate(reference)
  return false
}

async function start() {
  guard.value = ''
  // The last answer shows before the boot and the read even start.
  paintCached()
  try {
    const shell = await loadShell()
    if (!shell?.modules?.pendientes?.enabled) {
      guard.value =
        shell?.modules?.pendientes?.reason ||
        __('Ask your manager for permission to read your pendientes.')
      return
    }
  } catch (error) {
    guard.value = pendienteError(error).detail
    return
  }
  if (await handoffs()) return
  load()
  loadCounts()
  loadApprovalCounts()
}
// The pills' counts, re-read whenever an approval list reloads (after a decision).
async function loadApprovalCounts() {
  const capabilities = boot.value?.capabilities || {}
  if (!capabilities.approve && !capabilities.waiting) return
  try {
    approvalCounts.value = await aprobacionesApi('counts')
  } catch {
    approvalCounts.value = null
  }
}
// The approval list has its rows on screen (it restores the place itself through
// `restore` before moving the focus); from now on scrolling saves the place.
function approvalLoaded() {
  approvalReady.value = true
  loadApprovalCounts()
}
async function retryBoot() {
  await loadShell({ refresh: true }).catch(() => {})
  start()
}
async function copyRequest() {
  const text = __(
    'I need access to Pendientes: permission to read my ToDo (and Sales tasks, if I sell). Please review my user.',
  )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}

watch(
  () => [
    state.value.segment,
    state.value.q,
    state.value.source,
    state.value.priority,
    state.value.from,
    state.value.to,
  ],
  ([segment], [was]) => {
    if (search.value.trim() !== state.value.q) search.value = state.value.q
    // «Hoy» and «Mis pendientes» are one answer: switching keeps the rows.
    const same =
      serverSegment(segment) === serverSegment(was) && segment !== was
    if (!same) {
      loaded.value = false
      rows.value = []
    }
    if (boot.value?.enabled) {
      if (!same) paintCached()
      load(0, { quiet: same })
      loadCounts()
    }
  },
)
// Another approval list (segment, kind, search): its rows are not on screen yet.
watch(board, (on) => {
  if (on && sectioned.value) loadDone()
})
watch(
  () => [state.value.segment, state.value.kind, state.value.q],
  () => (approvalReady.value = false),
)
onMounted(start)
function reloadAfterConflict() {
  completeOpen.value = false
  load()
}
</script>
<style scoped>
/* A row that leaves (done, moved) lifts out while the rest close the gap. */
.pd-list-move {
  transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.pd-list-enter-active {
  transition:
    opacity 180ms ease-out,
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.pd-list-leave-active {
  position: absolute;
  inset-inline: 0;
  transition:
    opacity 160ms ease-in,
    transform 160ms ease-in;
}
.pd-list-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.pd-list-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
.pd-bump-enter-active {
  transition:
    transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 180ms ease-out;
}
.pd-bump-enter-from {
  transform: translateY(-40%);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .pd-list-move,
  .pd-list-enter-active,
  .pd-list-leave-active,
  .pd-bump-enter-active {
    transition: opacity 120ms;
  }
  .pd-list-enter-from,
  .pd-list-leave-to,
  .pd-bump-enter-from {
    transform: none;
  }
}
</style>
