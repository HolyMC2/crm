<template>
  <div ref="scroller" class="min-h-0 min-w-0 flex-1 overflow-y-auto">
    <!-- Phone: the title is the door to the views (Muelle's and the
         person's own); the view's actions live behind «⋯». -->
    <AppBar
      v-if="phone"
      :context="__('Results')"
      :title="vistaTitle"
      :scopes="tabs"
      :scope="vista"
      :scope-title="__('Views', null, CTX)"
      :loading="loading && loaded"
      @update:scope="openView"
    >
      <template #actions>
        <button
          type="button"
          class="press flex size-12 items-center justify-center rounded-full text-ink-gray-7"
          :aria-label="__('Ask Muelle', null, CTX)"
          :title="__('Ask Muelle', null, CTX)"
          @click="ask()"
        >
          <span class="lucide-sparkles size-5" aria-hidden="true" />
        </button>
        <Dropdown :options="viewMenu" align="end">
          <button
            type="button"
            class="press flex size-12 items-center justify-center rounded-full text-ink-gray-7"
            :aria-label="__('More view actions', null, CTX)"
            :title="__('More actions', null, CTX)"
            data-testid="view-menu"
          >
            <span class="lucide-ellipsis-vertical size-5" aria-hidden="true" />
          </button>
        </Dropdown>
      </template>
    </AppBar>
    <div
      v-if="pull || refreshing"
      class="flex items-center justify-center overflow-hidden text-ink-gray-6"
      :style="{ height: `${refreshing ? 48 : pull}px` }"
      role="status"
    >
      <span
        class="lucide-refresh-cw size-5"
        :class="refreshing ? 'animate-spin' : ''"
        aria-hidden="true"
      />
      <span class="sr-only">{{ __('Refreshing') }}</span>
    </div>
    <div
      class="mx-auto w-full max-w-7xl px-4 pb-24 pt-2 sm:px-6 sm:pb-10 sm:pt-6"
    >
      <header class="flex flex-wrap items-start gap-3">
        <div class="min-w-0 flex-1">
          <h1
            class="sr-only text-2xl font-semibold tracking-tight text-ink-gray-9 sm:not-sr-only"
          >
            {{ __('Results') }}
          </h1>
          <p class="mt-0.5 text-sm text-ink-gray-6" data-testid="period-range">
            {{ rangeText }}
            <span v-if="generatedAt" class="text-ink-gray-5">
              · {{ __('updated {0}', [generatedAt], CTX) }}</span
            >
          </p>
        </div>
        <Button
          v-if="!phone && canPersonalize && !editing"
          class="min-h-11"
          :label="__('Customize')"
          :loading="forking"
          data-testid="customize"
          @click="personalize"
        >
          <template #prefix>
            <span class="lucide-pencil size-4" aria-hidden="true" />
          </template>
        </Button>
        <Button
          class="hidden min-h-11 sm:inline-flex"
          :label="__('Refresh')"
          :loading="loading"
          @click="refresh"
        >
          <template #prefix>
            <span class="lucide-refresh-cw size-4" aria-hidden="true" />
          </template>
        </Button>
      </header>

      <!-- Desk: the views as tabs; a new view and the view's actions share
           one island at the row's end. -->
      <nav
        v-if="!phone"
        class="mt-4 flex items-end gap-2 border-b border-outline-gray-2"
        :aria-label="__('Views', null, CTX)"
      >
        <div
          role="tablist"
          class="-mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto"
          data-testid="view-tabs"
        >
          <button
            v-for="t in tabs"
            :key="t.value"
            type="button"
            role="tab"
            :aria-selected="t.value === vista ? 'true' : 'false'"
            class="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
            :class="
              t.value === vista
                ? 'border-ink-gray-9 text-ink-gray-9'
                : 'border-transparent text-ink-gray-6 hover:text-ink-gray-8'
            "
            :title="t.shared ? __('Shared by {0}', [t.owner], CTX) : undefined"
            :data-testid="`view-${t.value}`"
            @click="openView(t.value)"
          >
            <span :class="t.icon" class="size-4" aria-hidden="true" />
            {{ t.label }}
            <span
              v-if="t.value === savedVista"
              class="lucide-pin size-3.5 text-ink-gray-5"
              :aria-label="__('Opens first', null, CTX)"
            />
          </button>
        </div>
        <div
          class="mb-1 flex shrink-0 items-center gap-0.5 rounded-full bg-surface-gray-2 p-0.5"
        >
          <button
            v-if="tablerosOn"
            type="button"
            class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7"
            :aria-label="__('New view', null, CTX)"
            :title="__('New view', null, CTX)"
            data-testid="new-view"
            @click="openNewView"
          >
            <span class="lucide-plus size-4" aria-hidden="true" />
          </button>
          <Dropdown :options="viewMenu" align="end">
            <button
              type="button"
              class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7"
              :aria-label="__('More view actions', null, CTX)"
              :title="__('More actions', null, CTX)"
              data-testid="view-menu"
            >
              <span
                class="lucide-ellipsis-vertical size-4"
                aria-hidden="true"
              />
            </button>
          </Dropdown>
        </div>
      </nav>

      <!-- Phone: one chip row for the period; comparison, company and shop
           in the «Filtros» sheet (S1 FilterChips), so the first number is in
           sight. -->
      <FilterChips
        v-if="phone"
        class="-mx-4 mt-1"
        data-testid="periodo-chips"
        :label="__('Period')"
        :model-value="periodPicked"
        :chips="periodChips"
        :deselectable="false"
        :filters-label="__('Filters')"
        :filters-count="filtersOn"
        @update:model-value="pickPeriod"
      >
        <template #filters="{ close }">
          <div class="space-y-4">
            <div>
              <p class="mb-2 text-sm font-medium text-ink-gray-8">
                {{ __('Compare with') }}
              </p>
              <Segmented
                :label="__('Compare with')"
                :model-value="state.compara"
                :options="
                  COMPARES.map((c) => ({
                    value: c.value,
                    label: compareLabel(c.value),
                  }))
                "
                @update:model-value="(value) => update({ compara: value })"
              />
            </div>
            <FormControl
              v-if="companies.length > 1"
              type="select"
              class="[&_select]:min-h-11 [&_[role=combobox]]:min-h-11"
              :label="__('Company')"
              :model-value="state.empresa"
              :options="[
                { label: __('All companies'), value: '' },
                ...companies.map((x) => ({ label: x, value: x })),
              ]"
              @update:model-value="
                (value) => update({ empresa: value, tienda: '' })
              "
            />
            <FormControl
              v-if="visibleShops.length > 1 || state.tienda"
              type="select"
              class="[&_select]:min-h-11 [&_[role=combobox]]:min-h-11"
              :label="__('Shop')"
              :model-value="state.tienda"
              :options="[
                { label: __('All shops'), value: '' },
                ...visibleShops.map((x) => ({ label: x.label, value: x.name })),
              ]"
              @update:model-value="(value) => update({ tienda: value })"
            />
            <Button
              v-if="canPersonalize && !editing"
              class="min-h-11 w-full"
              :label="__('Customize this view', null, CTX)"
              data-testid="customize"
              @click="personalize(), close()"
            >
              <template #prefix>
                <span class="lucide-pencil size-4" aria-hidden="true" />
              </template>
            </Button>
          </div>
        </template>
      </FilterChips>
      <div
        v-else
        class="mt-3 flex flex-col gap-3 rounded-7 border border-outline-gray-2 bg-surface-gray-1 p-2 lg:flex-row lg:items-center"
      >
        <div
          role="radiogroup"
          :aria-label="__('Period')"
          class="flex gap-0.5 overflow-x-auto rounded-6 bg-surface-gray-2 p-0.5"
        >
          <button
            v-for="p in PERIODS"
            :key="p.value"
            role="radio"
            :aria-checked="periodPicked === p.value"
            :data-testid="`periodo-${p.value}`"
            class="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-5 px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
            :class="
              periodPicked === p.value
                ? 'bg-surface-base text-ink-gray-9 shadow-sm'
                : 'text-ink-gray-6 hover:text-ink-gray-8'
            "
            @click="pickPeriod(p.value)"
          >
            <span
              v-if="p.value === 'rango'"
              class="lucide-calendar-range size-4"
              aria-hidden="true"
            />{{ periodLabel(p.value) }}
          </button>
        </div>
        <div
          role="radiogroup"
          :aria-label="__('Compare with')"
          class="flex gap-0.5 overflow-x-auto rounded-6 bg-surface-gray-2 p-0.5"
          data-testid="compara"
        >
          <button
            v-for="c in COMPARES"
            :key="c.value"
            role="radio"
            :aria-checked="state.compara === c.value"
            :data-testid="`compara-${c.value}`"
            class="min-h-11 shrink-0 whitespace-nowrap rounded-5 px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
            :class="
              state.compara === c.value
                ? 'bg-surface-base text-ink-gray-9 shadow-sm'
                : 'text-ink-gray-6 hover:text-ink-gray-8'
            "
            @click="update({ compara: c.value })"
          >
            {{ compareLabel(c.value) }}
          </button>
        </div>
        <div class="flex flex-wrap gap-2 lg:ml-auto">
          <FormControl
            v-if="companies.length > 1"
            class="w-full sm:w-52"
            type="select"
            data-testid="empresa"
            :aria-label="__('Company')"
            :model-value="state.empresa"
            :options="[
              { label: __('All companies'), value: '' },
              ...companies.map((x) => ({ label: x, value: x })),
            ]"
            @update:model-value="
              (value) => update({ empresa: value, tienda: '' })
            "
          />
          <FormControl
            v-if="visibleShops.length > 1 || state.tienda"
            class="w-full sm:w-60"
            type="select"
            data-testid="tienda"
            :aria-label="__('Shop')"
            :model-value="state.tienda"
            :options="[
              { label: __('All shops'), value: '' },
              ...visibleShops.map((x) => ({ label: x.label, value: x.name })),
            ]"
            @update:model-value="(value) => update({ tienda: value })"
          />
        </div>
      </div>

      <form
        v-if="rangeOpen"
        class="mt-2 flex flex-wrap items-end gap-2 rounded-7 border border-outline-gray-2 p-3"
        data-testid="rango"
        @submit.prevent="applyRange"
      >
        <FormControl
          v-model="draft.desde"
          class="w-full sm:w-44"
          type="date"
          :label="__('From')"
          :max="draft.hasta || undefined"
        />
        <FormControl
          v-model="draft.hasta"
          class="w-full sm:w-44"
          type="date"
          :label="__('To')"
          :min="draft.desde || undefined"
        />
        <Button
          type="submit"
          variant="solid"
          class="min-h-11"
          :label="__('Show these dates')"
          :disabled="!draft.desde || !draft.hasta"
        />
        <Button
          class="min-h-11"
          variant="ghost"
          :label="__('Cancel')"
          @click="rangeOpen = false"
        />
        <p class="w-full text-xs text-ink-gray-6">
          {{
            __('Up to one year. The comparison uses the same number of days.')
          }}
        </p>
      </form>

      <div
        v-if="shopName"
        class="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-gray-7"
      >
        <span class="lucide-store size-4" aria-hidden="true" />
        {{ __('Only {0}', [shopName]) }}
        <button
          class="inline-flex min-h-11 items-center gap-1 rounded-5 px-2 font-medium text-ink-gray-8 hover:bg-surface-gray-2"
          @click="update({ tienda: '' })"
        >
          <span class="lucide-x size-4" aria-hidden="true" />{{
            __('All shops')
          }}
        </button>
      </div>

      <!-- Editing a view of one's own: drag, resize, add, and the board's
           history, library and Muelle a tap away. -->
      <div
        v-if="editing && board"
        class="mt-3 flex flex-wrap items-center gap-2 rounded-7 border border-outline-gray-2 bg-surface-gray-1 p-2"
        data-testid="edit-band"
      >
        <p
          class="min-w-0 flex-1 px-1 text-sm text-ink-gray-7"
          :class="phone ? 'basis-0' : 'basis-56'"
        >
          {{
            phone
              ? __(
                  'Tap a pencil to change a piece. It saves on its own.',
                  null,
                  CTX,
                )
              : __(
                  'Drag a piece to move it and its corner to resize it. It saves on its own.',
                  null,
                  CTX,
                )
          }}
        </p>
        <!-- Phone: «Agregar» is the docked button and the sparkle sits in the
             bar, so the band keeps «Listo» beside the hint and the rest as
             one row of labelled icons under it. -->
        <div
          v-if="phone"
          class="order-last grid w-full gap-1"
          :class="bandActions.length === 3 ? 'grid-cols-3' : 'grid-cols-2'"
        >
          <button
            v-for="a in bandActions"
            :key="a.id"
            type="button"
            class="press flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-6 bg-surface-base text-xs text-ink-gray-8 hover:bg-surface-gray-2"
            :data-testid="a.id"
            @click="a.run"
          >
            <span :class="a.icon" class="size-4" aria-hidden="true" />
            {{ a.label }}
          </button>
        </div>
        <template v-else>
          <Button
            variant="solid"
            class="min-h-11"
            :label="__('Add', null, CTX)"
            data-testid="add-widget"
            @click="openSheet(null)"
          >
            <template #prefix>
              <span class="lucide-plus size-4" aria-hidden="true" />
            </template>
          </Button>
          <Button
            v-for="a in bandActions"
            :key="a.id"
            class="min-h-11"
            :label="a.label"
            :data-testid="a.id"
            @click="a.run"
          >
            <template #prefix>
              <span :class="a.icon" class="size-4" aria-hidden="true" />
            </template>
          </Button>
          <Button
            class="min-h-11"
            :label="__('Ask Muelle', null, CTX)"
            data-testid="ask-board"
            @click="ask()"
          >
            <template #prefix>
              <span class="lucide-sparkles size-4" aria-hidden="true" />
            </template>
          </Button>
        </template>
        <Button
          variant="subtle"
          class="min-h-11"
          :label="__('Done', null, CTX)"
          data-testid="done-editing"
          @click="editing = false"
        />
      </div>

      <div
        v-if="builtin ? problem : boardProblem"
        role="alert"
        class="mt-4 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        <template v-if="builtin">
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <Button
            class="ml-2"
            :label="__('Retry', null, CTX)"
            @click="load()"
          />
        </template>
        <template v-else>
          <strong>{{ boardProblem.title }}.</strong> {{ boardProblem.detail }}
          <Button
            class="ml-2"
            :label="__('Retry', null, CTX)"
            @click="loadBoard()"
          />
          <Button
            class="ml-2"
            variant="ghost"
            :label="__('Back to the summary', null, CTX)"
            @click="openView(DEFAULT_VISTA)"
          />
        </template>
      </div>

      <section
        class="mt-4"
        :aria-label="__('Numbers for the period')"
        :aria-busy="(builtin ? loading : loadingBoard) ? 'true' : undefined"
      >
        <BoardCanvas
          v-if="builtin && builtinWidgets.length"
          :key="vista"
          :widgets="builtinWidgets"
          :grid="builtinGrid"
          :datos="builtinDatos"
          :currency="currency"
          :back="back"
          @update:grid="(value) => (builtinGrid = value)"
          @retry="retryCard"
          @fit="builtinFit"
          @filter="(patch) => update(patch)"
        />
        <div
          v-else-if="builtin && loaded"
          class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
        >
          <p class="text-lg font-semibold">
            {{ __('No numbers for you here yet') }}
          </p>
          <p class="mt-1 text-sm">
            {{
              __(
                'The numbers you may see appear here once your manager gives you access.',
              )
            }}
          </p>
        </div>
        <EmptyState
          v-else-if="!builtin && loadingBoard && !board"
          state="loading"
          :title="__('Opening the view…', null, CTX)"
        />
        <EmptyState
          v-else-if="board && !board.widgets.length"
          :title="__('This view is empty', null, CTX)"
          :message="
            board.can_write
              ? __(
                  'Add a chart, a number or a note, or ask Muelle to build it for you.',
                  null,
                  CTX,
                )
              : __(
                  'Whoever shares it has not put anything on it yet.',
                  null,
                  CTX,
                )
          "
          :action="board.can_write ? __('Add', null, CTX) : ''"
          @action="startAdding"
        />
        <BoardCanvas
          v-else-if="board"
          :key="vista"
          :widgets="board.widgets"
          :grid="grid"
          :datos="customDatos"
          :loading="loadingData"
          :can-edit="editing && board.can_write"
          :arranging="editing && board.can_write && !phone"
          :currency="currency"
          :back="back"
          @update:grid="(value) => (grid = value)"
          @layout="onLayout"
          @edit="openSheet"
          @retry="retryWidget"
          @fit="fit"
          @filter="(patch) => update(patch)"
        />
      </section>
    </div>

    <Fab
      v-if="phone && editing && board?.can_write"
      :label="__('Add', null, CTX)"
      @click="openSheet(null)"
    />

    <WidgetSheet
      v-if="sheet.mounted && board"
      v-model:open="sheet.open"
      :widget="sheet.widget"
      :saving="sheet.saving"
      :problem="sheet.problem"
      :tablero="board.name"
      :period-args="boardDataArgs(state)"
      :period-label="periodWords"
      :currency="currency"
      @save="saveWidget"
      @duplicate="duplicateWidget"
      @remove="removeWidget"
      @catch-up="catchUp"
      @kept="() => loadBoard({ quiet: true })"
      @ask="(draft) => ask(sheet.widget?.id ? sheet.widget : draft)"
    />
    <VersionsSheet
      v-if="versions.mounted && board"
      v-model:open="versions.open"
      :board="board"
      @restored="(view) => replace(view, { all: true })"
    />
    <LibrarySheet
      v-if="library.mounted && board"
      v-model:open="library.open"
      :tablero="board.name"
      :can-write="board.can_write"
      @inserted="(view) => replace(view)"
    />
    <ShareSheet
      v-if="share.mounted && board"
      v-model:open="share.open"
      doctype="Tablero"
      :name="board.name"
      :title="board.title"
      :shared="board.shared || []"
      :can="board.mine"
      @done="onShared"
    />
    <BottomSheet v-model:open="rename.open" :title="__('View name', null, CTX)">
      <form id="rename-view" @submit.prevent="saveTitle">
        <FormControl
          v-model="rename.title"
          type="text"
          :label="__('Name', null, CTX)"
          :maxlength="80"
          class="[&_input]:min-h-11"
        />
      </form>
      <template #footer>
        <Button
          variant="solid"
          type="submit"
          form="rename-view"
          class="min-h-11 w-full"
          :label="__('Save name', null, CTX)"
          :disabled="!rename.title.trim()"
        />
      </template>
    </BottomSheet>
    <BottomSheet
      v-model:open="newView.open"
      :title="__('New view', null, CTX)"
      :dismissible="!newView.saving"
    >
      <form
        id="new-view"
        class="space-y-4"
        data-testid="new-view-form"
        @submit.prevent="createView"
      >
        <FormControl
          v-model="newView.title"
          type="text"
          :label="__('Name', null, CTX)"
          :placeholder="newViewTitle"
          :maxlength="80"
          class="[&_input]:min-h-11"
        />
        <fieldset>
          <legend class="mb-2 text-sm font-medium text-ink-gray-8">
            {{ __('Start from', null, CTX) }}
          </legend>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="start in starts"
              :key="start.value"
              type="button"
              :aria-pressed="newView.from === start.value ? 'true' : 'false'"
              :class="chipClass(newView.from === start.value)"
              :data-testid="`start-${start.value}`"
              @click="newView.from = start.value"
            >
              {{ start.label }}
            </button>
          </div>
        </fieldset>
        <p class="text-sm text-ink-gray-6">
          {{
            __(
              'It follows the period and filters of the page, like Muelle’s views. Muelle can also build it for you: open it and ask.',
              null,
              CTX,
            )
          }}
        </p>
      </form>
      <template #footer>
        <Button
          variant="solid"
          type="submit"
          form="new-view"
          class="min-h-11 w-full"
          :label="__('Create view', null, CTX)"
          :loading="newView.saving"
        />
      </template>
    </BottomSheet>
  </div>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Dropdown, FormControl, toast } from 'frappe-ui'
import {
  AppBar,
  BottomSheet,
  EmptyState,
  Fab,
  FilterChips,
  Segmented,
} from '@/components/ui'
import { chipClass } from '@/components/ui/chipClass'
import BoardCanvas from '@/components/tableros/BoardCanvas.vue'
import {
  openAssistant,
  useAssistantContext,
} from '@/components/assistant/useAssistant'
import { isMobile } from '@/composables/breakpoint'
import { useLiveList } from '@/composables/liveList'
import { problemOf } from '@/composables/useCobranza'
import { shellBoot } from '@/composables/muelleShell'
import { usePullRefresh } from '@/composables/usePullRefresh'
import { createListCache } from '@/utils/listCache'
import {
  COMPARES,
  CTX,
  PERIODS,
  compareLabel,
  dayText,
  periodLabel,
  readQuery,
  resultadosApi,
  toQuery,
} from '@/composables/useResultados'
import {
  DEFAULT_VISTA,
  VISTAS,
  boardDataArgs,
  builtinVista,
  cardKeyOf,
  cardPayload,
  copyTitle,
  forkWidgets,
  ownCopy,
  pickVista,
  readVistaCopy,
  vistaTabs,
  vistaWidgets,
  writeVistaCopy,
} from '@/composables/resultadosVistas'
import { askPrompt, fitRows, gridOf, tablerosApi } from '@/tableros/board'
import { useBoard } from '@/tableros/useBoard'

const WidgetSheet = defineAsyncComponent(
  () => import('@/components/tableros/WidgetSheet.vue'),
)
const VersionsSheet = defineAsyncComponent(
  () => import('@/components/tableros/VersionsSheet.vue'),
)
const LibrarySheet = defineAsyncComponent(
  () => import('@/components/tableros/LibrarySheet.vue'),
)
const ShareSheet = defineAsyncComponent(
  () => import('@/components/documentos/ShareSheet.vue'),
)

const route = useRoute()
const router = useRouter()
const scroller = ref(null)
const phone = isMobile
const cards = reactive({})
const order = ref([])
const scope = ref({ companies: [], shops: [] })
const period = ref(null)
const loading = ref(false)
const loaded = ref(false)
const retrying = ref('')
const problem = ref(null)
const generatedAt = ref('')
let ticket = 0

const state = computed(() => readQuery(route.query))
const companies = computed(() => scope.value.companies || [])
const shops = computed(() => scope.value.shops || [])
const visibleShops = computed(() =>
  shops.value.filter(
    (s) => !state.value.empresa || s.company === state.value.empresa,
  ),
)
const currency = computed(() => shellBoot.value?.currency || '')
const back = computed(() => `/crm${route.fullPath}`)
const shopName = computed(() => {
  const name = state.value.tienda
  if (!name) return ''
  return shops.value.find((s) => s.name === name)?.label || name
})
const rangeOpen = ref(false)
const draft = reactive({ desde: '', hasta: '' })
const periodPicked = computed(() =>
  rangeOpen.value ? 'rango' : state.value.periodo,
)
const span = (from, to) =>
  from === to ? dayText(from) : `${dayText(from)} – ${dayText(to)}`
const rangeText = computed(() => {
  const p = period.value
  if (!p) return periodLabel(state.value.periodo)
  const main = span(p.from, p.to)
  if (state.value.compara === 'no' || !p.compare_from) return main
  return __('{0} · compared with {1}', [
    main,
    span(p.compare_from, p.compare_to),
  ])
})
/** The period in words, beside the editor's preview. */
const periodWords = computed(() =>
  state.value.periodo === 'rango' && state.value.desde
    ? span(state.value.desde, state.value.hasta)
    : periodLabel(state.value.periodo).toLowerCase(),
)

function update(patch) {
  router.replace({ query: toQuery({ ...state.value, ...patch }) })
}
const periodChips = computed(() =>
  PERIODS.map((p) => ({
    value: p.value,
    label: periodLabel(p.value),
    icon: p.value === 'rango' ? 'lucide-calendar-range' : undefined,
  })),
)
// How many of the sheet's filters move away from the default view.
const filtersOn = computed(
  () =>
    (state.value.compara && state.value.compara !== 'anterior' ? 1 : 0) +
    (state.value.empresa ? 1 : 0) +
    (state.value.tienda ? 1 : 0),
)
function pickPeriod(value) {
  if (value !== 'rango') {
    rangeOpen.value = false
    return update({ periodo: value })
  }
  // Start from what the board shows now, so «Dates» is one tweak away.
  draft.desde = state.value.desde || period.value?.from || ''
  draft.hasta = state.value.hasta || period.value?.to || ''
  rangeOpen.value = true
}
function applyRange() {
  if (!draft.desde || !draft.hasta) return
  const [desde, hasta] = [draft.desde, draft.hasta].sort()
  rangeOpen.value = false
  update({ periodo: 'rango', desde, hasta })
}

// --- the views --------------------------------------------------------------------
// Muelle's three, then the person's Tableros. The account's «Abrir siempre en
// esta vista» wins over this device's last one; a link's `vista` over both.
const tablerosOn = ref(false)
const boards = ref(null)
const savedVista = ref('')
const localVista = ref(readVistaCopy())
const vista = computed(() =>
  pickVista({
    query: state.value.vista,
    saved: savedVista.value,
    local: localVista.value,
    boards: boards.value,
  }),
)
const builtin = computed(() => builtinVista(vista.value))
const tabs = computed(() => vistaTabs(tablerosOn.value ? boards.value : []))
const vistaTitle = computed(
  () =>
    builtin.value?.titulo ||
    boards.value?.find((b) => b.name === vista.value)?.title ||
    board.value?.title ||
    __('Results'),
)
const editing = ref(false)

function openView(value, { edit = false, view = null } = {}) {
  pending = { name: value, edit, view }
  localVista.value = value
  if (!savedVista.value) writeVistaCopy(value)
  if (value === vista.value) return adoptPending()
  router.replace({ query: toQuery({ ...state.value, vista: value }) })
}

async function loadBoards(event = null) {
  try {
    const rows = await tablerosApi('listar')
    const known = new Set((boards.value || []).map((b) => b.name))
    boards.value = rows
    const made = event?.by === 'bot' && rows.find((b) => b.name === event.name)
    if (made && !known.has(made.name) && made.mine && askedHere()) {
      toast.success(__('Muelle built «{0}».', [made.title], CTX))
      openView(made.name)
    }
  } catch {
    // doco's boards are missing here: Muelle's views still work
    boards.value = []
  }
}
function addBoard(view) {
  const row = {
    name: view.name,
    title: view.title,
    mine: true,
    owner_name: view.owner_name,
  }
  boards.value = [
    row,
    ...(boards.value || []).filter((b) => b.name !== row.name),
  ]
}

// --- Muelle's views: the Resultados cards, laid out -------------------------------
const present = computed(() => (loaded.value ? new Set(order.value) : null))
const builtinWidgets = computed(() =>
  vistaWidgets(builtin.value, present.value),
)
const builtinGrid = ref([])
// Rows a card asked for, kept so it never shrinks back under its content.
const builtinFitted = {}
watch(
  builtinWidgets,
  (widgets) => (builtinGrid.value = gridOf(widgets, builtinFitted)),
  { immediate: true },
)
// A row of cards grows together, so its bottoms stay even.
function builtinFit(id, px) {
  const rows = fitRows(px)
  const fitted = builtinGrid.value.find((g) => g.i === id)
  if (!fitted) return
  const row = builtinGrid.value.filter((g) => g.y === fitted.y)
  if (row.every((g) => (builtinFitted[g.i] || 0) >= rows)) return
  for (const g of row)
    builtinFitted[g.i] = Math.max(builtinFitted[g.i] || 0, rows)
  builtinGrid.value = builtinGrid.value.map((g) =>
    g.y === fitted.y && g.h < rows ? { ...g, h: rows } : g,
  )
}
const cardQuery = computed(() => ({ compara: state.value.compara }))
const builtinDatos = computed(() =>
  Object.fromEntries(
    builtinWidgets.value.map((w) => [
      w.id,
      cardPayload(w.id, cards, {
        currency: currency.value,
        query: cardQuery.value,
      }),
    ]),
  ),
)

// --- a view of one's own: a Tablero, read with the page's period and filters -----
const {
  board,
  datos,
  loading: loadingBoard,
  loadingData,
  problem: boardProblem,
  grid,
  sheet,
  show,
  fit,
  clear,
  load: loadBoard,
  loadData,
  change,
  replace,
  onLayout,
  openSheet,
  saveWidget,
  duplicateWidget,
  removeWidget,
  catchUp,
  undo,
} = useBoard({
  name: () => (builtin.value ? '' : vista.value),
  dataArgs: () => boardDataArgs(state.value),
  // its plain cards come from the page's own board call: one read, not one each
  local: (widget) => Boolean(cardKeyOf(widget)),
})
const customDatos = computed(() => {
  const out = { ...datos }
  for (const w of board.value?.widgets || []) {
    const key = cardKeyOf(w)
    if (!key) continue
    out[w.id] =
      !loaded.value || present.value?.has(key) || retrying.value === key
        ? cardPayload(key, cards, {
            currency: currency.value,
            query: cardQuery.value,
          })
        : {
            kind: 'blocked',
            reason: __('This card does not apply to you.'),
            retry: false,
          }
  }
  return out
})
function retryWidget(id) {
  const key = cardKeyOf(board.value?.widgets.find((w) => w.id === id))
  return key ? retryCard(key) : loadData([id], true)
}

// A view switch opens the board; a fork or a new view hands its board over
// so it paints at once, and may open straight into editing.
let pending = null
function adoptPending() {
  const wanted = pending
  pending = null
  editing.value = Boolean(wanted?.edit && wanted.name === vista.value)
}
watch(
  () => [vista.value, route.name],
  ([value, name]) => {
    if (name !== 'Resultados') return
    const handed = pending?.name === value ? pending.view : null
    adoptPending()
    clear()
    if (builtin.value) return
    if (handed) {
      show(handed)
      loadData()
    } else loadBoard()
  },
  { immediate: true },
)

const canPersonalize = computed(
  () =>
    tablerosOn.value && (builtin.value ? loaded.value : Boolean(board.value)),
)
const forking = ref(false)

/** «Personalizar»: Muelle's view becomes the person's own copy (or reopens
 * the one they made); someone else's view becomes their copy; their own view
 * opens for changes. */
async function personalize() {
  const b = builtin.value
  if (b) {
    const own = ownCopy(b, boards.value)
    if (own) return openView(own.name, { edit: true })
    return fork(() =>
      tablerosApi('crear', {
        title: copyTitle(b),
        widgets: forkWidgets(b, present.value),
        periodo: 'este_mes',
      }),
    )
  }
  if (board.value && !board.value.can_write)
    return fork(() => tablerosApi('duplicar', { name: board.value.name }))
  editing.value = true
}
async function fork(make) {
  forking.value = true
  try {
    const view = await make()
    addBoard(view)
    openView(view.name, { edit: true, view })
    toast.success(
      __(
        'Your own copy, «{0}», is ready. Change it as you like; the original stays as it was.',
        [view.title],
        CTX,
      ),
    )
  } catch (error) {
    toast.error(problemOf(error).detail)
  } finally {
    forking.value = false
  }
}
function startAdding() {
  editing.value = true
  openSheet(null)
}

// --- the view's own actions ----------------------------------------------------------
const versions = reactive({ mounted: false, open: false })
const library = reactive({ mounted: false, open: false })
const share = reactive({ mounted: false, open: false })
const rename = reactive({ open: false, title: '' })
const openVersions = () =>
  Object.assign(versions, { mounted: true, open: true })
const openLibrary = () => Object.assign(library, { mounted: true, open: true })
// The edit band's secondary actions, as labelled icons on the phone.
const bandActions = computed(() => [
  {
    id: 'open-library',
    icon: 'lucide-library',
    label: __('Library', null, CTX),
    run: openLibrary,
  },
  {
    id: 'open-versions',
    icon: 'lucide-history',
    label: __('Versions', null, CTX),
    run: openVersions,
  },
  ...(board.value?.can_undo
    ? [
        {
          id: 'undo',
          icon: 'lucide-undo-2',
          label: __('Undo', null, CTX),
          run: undo,
        },
      ]
    : []),
])

async function saveTitle() {
  const title = rename.title.trim()
  if (!title) return
  try {
    const view = await change([{ op: 'titulo', titulo: title }])
    boards.value = (boards.value || []).map((b) =>
      b.name === view.name ? { ...b, title: view.title } : b,
    )
    rename.open = false
    toast.success(__('Name saved.', null, CTX))
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}
function onShared(activity) {
  if (Array.isArray(activity?.shared))
    board.value = { ...board.value, shared: activity.shared }
}

async function duplicateView() {
  try {
    const copy = await tablerosApi('duplicar', { name: board.value.name })
    addBoard(copy)
    openView(copy.name, { view: copy })
    toast.success(__('View duplicated: this copy is yours.', null, CTX))
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}

const removing = ref(false)
let removeTimer = null
async function removeView() {
  if (!removing.value) {
    removing.value = true
    toast.info(__('Tap «Delete view» again to delete it.', null, CTX))
    clearTimeout(removeTimer)
    removeTimer = setTimeout(() => (removing.value = false), 4000)
    return
  }
  removing.value = false
  const name = board.value.name
  try {
    await tablerosApi('borrar', { name })
    boards.value = (boards.value || []).filter((b) => b.name !== name)
    if (savedVista.value === name) await setOpensFirst('')
    openView(DEFAULT_VISTA)
    toast.success(__('View deleted.', null, CTX))
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}

/** «Abrir siempre en esta vista»: the account keeps it, on every device. */
async function setOpensFirst(value) {
  try {
    const out = await resultadosApi('save_vista', { vista: value })
    savedVista.value = out.vista || ''
    writeVistaCopy(out.vista || vista.value)
    if (value)
      toast.success(__('Resultados opens first in this view.', null, CTX))
  } catch (error) {
    toast.error(problemOf(error).detail)
  }
}

// «Vista nueva»: blank, or a copy of one of Muelle's to start from.
const newView = reactive({ open: false, title: '', from: '', saving: false })
const starts = computed(() => [
  { value: '', label: __('Blank', null, CTX) },
  ...VISTAS.map((v) => ({ value: v.id, label: v.titulo })),
])
// Left blank, the name is the one the placeholder shows.
const newViewTitle = computed(() => {
  const from = builtinVista(newView.from)
  return from ? copyTitle(from) : __('New view', null, CTX)
})
function openNewView() {
  Object.assign(newView, { open: true, title: '', from: '' })
}
async function createView() {
  const title = newView.title.trim() || newViewTitle.value
  newView.saving = true
  try {
    const from = builtinVista(newView.from)
    const view = await tablerosApi('crear', {
      title,
      widgets: from ? forkWidgets(from, present.value) : [],
      periodo: 'este_mes',
    })
    addBoard(view)
    newView.open = false
    openView(view.name, { edit: true, view })
  } catch (error) {
    toast.error(problemOf(error).detail)
  } finally {
    newView.saving = false
  }
}

const viewMenu = computed(() => {
  const items = []
  const b = board.value
  const custom = !builtin.value && b
  if (canPersonalize.value && !editing.value)
    items.push({
      label:
        custom && !b.can_write
          ? __('Make my copy', null, CTX)
          : __('Customize this view', null, CTX),
      onClick: personalize,
    })
  if (custom && b.can_write)
    items.push({
      label: __('Rename', null, CTX),
      onClick: () => Object.assign(rename, { open: true, title: b.title }),
    })
  if (custom) {
    items.push({ label: __('Versions', null, CTX), onClick: openVersions })
    items.push({ label: __('Duplicate', null, CTX), onClick: duplicateView })
  }
  if (custom && b.mine)
    items.push({
      label: __('Share', null, CTX),
      onClick: () => Object.assign(share, { mounted: true, open: true }),
    })
  if (savedVista.value === vista.value)
    items.push({
      label: __('Stop opening first in this view', null, CTX),
      onClick: () => setOpensFirst(''),
    })
  else if (builtin.value || b)
    items.push({
      label: __('Always open in this view', null, CTX),
      onClick: () => setOpensFirst(vista.value),
    })
  if (tablerosOn.value)
    items.push({ label: __('New view', null, CTX), onClick: openNewView })
  if (custom && b.mine)
    items.push({
      label: removing.value
        ? __('Delete view (confirm)', null, CTX)
        : __('Delete view', null, CTX),
      theme: 'red',
      onClick: removeView,
    })
  return items
})

// --- the assistant: it edits the view on screen -------------------------------------
useAssistantContext(() =>
  !builtin.value && board.value
    ? { doctype: 'Tablero', name: board.value.name, title: board.value.title }
    : { title: __('Results, view «{0}»', [vistaTitle.value], CTX) },
)
// A view Muelle builds right after the person asked from here opens by itself.
let askedAt = 0
const askedHere = () => Date.now() - askedAt < 10 * 60 * 1000
async function ask(widget = null) {
  askedAt = Date.now()
  const opened = await openAssistant({
    text: !builtin.value && board.value ? askPrompt(board.value, widget) : '',
  })
  if (!opened)
    toast.error(__('The assistant is not available for your user.', null, CTX))
}

// --- the cards board -----------------------------------------------------------------
// The board's last answer paints at once on a visit or a period change, with
// the time it was read; the read replaces it.
/** The cards board's query: the page's state without the view (one board
 * answers every view). */
function cardsQuery() {
  const query = { ...state.value }
  delete query.vista
  return query
}
const boardCache = createListCache('resultados', cardsQuery)
function showCards(out, at) {
  for (const key of Object.keys(cards)) delete cards[key]
  for (const card of out.cards || []) cards[card.key] = card
  order.value = (out.cards || []).map((card) => card.key)
  scope.value = out.scope || { companies: [], shops: [] }
  period.value = out.period
  generatedAt.value = at
  loaded.value = true
}
function adoptAccount(out) {
  if (typeof out.tableros === 'boolean') tablerosOn.value = out.tableros
  if (out.vista !== undefined) {
    savedVista.value = out.vista || ''
    if (out.vista) writeVistaCopy(out.vista)
  }
}

// `quiet` (a live refresh): as a pull to refresh, and a failed read keeps the
// board without a notice.
async function load({ refresh = false, quiet = false } = {}) {
  const mine = ++ticket
  const boardAt = boardCache.key()
  if (!refresh && !quiet)
    boardCache.paint((saved) => showCards(saved.out, saved.at))
  loading.value = !(refresh || quiet) || !loaded.value
  if (!quiet) problem.value = null
  try {
    const out = await resultadosApi('board', cardsQuery())
    if (mine !== ticket) return
    const at = new Date().toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
    showCards(out, at)
    adoptAccount(out)
    boardCache.save(boardAt, { out, at })
    problem.value = null
  } catch (error) {
    if (mine === ticket && !quiet) problem.value = problemOf(error)
  } finally {
    if (mine === ticket) loading.value = false
  }
}

async function retryCard(key) {
  retrying.value = key
  delete cards[key]
  try {
    const out = await resultadosApi('board', { ...cardsQuery(), card: key })
    const card = (out.cards || []).find((c) => c.key === key)
    if (card) cards[key] = card
  } catch (error) {
    cards[key] = { key, blocked_reason: problemOf(error).detail, retry: true }
  } finally {
    retrying.value = ''
  }
}

function refresh() {
  if (board.value) loadData()
  return load({ refresh: true })
}
const { pull, refreshing } = usePullRefresh(scroller, refresh)

// A sale, a cash closing or a repair order settled elsewhere retires the
// board's cache: the numbers on screen are read again, no more than every
// 15 s while the register is busy.
useLiveList(
  ['Sales Invoice', 'POS Closing Shift', 'Repair Order'],
  () => {
    if (route.name === 'Resultados') return load({ quiet: true })
  },
  { minIntervalMs: 15000 },
)

// A board Muelle (or a coworker) makes, renames or shares shows up as a tab;
// the open board itself follows through useBoard.
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
let listTimer = null
function onBoardEvent(event) {
  clearTimeout(listTimer)
  listTimer = setTimeout(() => loadBoards(event), 500)
}
onMounted(() => {
  loadBoards()
  socket?.on?.('doco_tablero', onBoardEvent)
})
onBeforeUnmount(() => {
  clearTimeout(listTimer)
  clearTimeout(removeTimer)
  socket?.off?.('doco_tablero', onBoardEvent)
})

watch(
  () => [
    state.value.periodo,
    state.value.compara,
    state.value.empresa,
    state.value.tienda,
    state.value.desde,
    state.value.hasta,
  ],
  (now, before) => {
    if (route.name !== 'Resultados') return
    load()
    if (before && board.value) loadData()
  },
  { immediate: true },
)
</script>
