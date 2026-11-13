<!--
  Tratos: the deals list on the shell's list look (Compras, Prospectos; lane
  ventas-parejo). Desktop: the title with its count, one filled button and an
  island of icons; the follow-up queues as the tab row beside the search; the
  filters as one row of pills; a table whose columns fit the list's width.
  Phone: the shell's large title, the search panel and ListRow rows. Board
  and Funnel are layouts of the same list. «Vista clásica» jumps to the
  upstream /deals/view (full filters on every field / group-by). Data via
  createListResource.
-->
<template>
  <div class="relative flex min-h-0 w-full flex-1 flex-col bg-surface-base">
    <!-- Phone: the shell's large title names the list (as in Prospectos); the
         shared search panel holds the queues and the filters, and «⋯» beside
         the pill holds the layouts, Vista clásica and Exportar. Closed, only
         what narrows the list shows as removable chips. -->
    <SearchPanel
      v-if="isMobile"
      v-model:open="searchOpen"
      class="flex-none"
      :query="search"
      :placeholder="__('Buscar cliente, equipo…')"
      :label="__('Buscar tratos')"
      @update:query="onSearch"
    >
      <template #trailing>
        <Dropdown :options="mobileMenu" align="end">
          <button
            type="button"
            class="press flex size-11 items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2"
            :aria-label="__('Más opciones')"
            :title="__('Más opciones')"
            data-testid="deals-more"
          >
            <span class="lucide-ellipsis-vertical size-5" aria-hidden="true" />
          </button>
        </Dropdown>
      </template>
      <template v-if="activeChips.length" #active>
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="c in activeChips"
            :key="c.key"
            type="button"
            :class="chipClass(true)"
            :aria-label="__('Quitar filtro') + ' ' + c.label"
            @click="c.remove()"
          >
            {{ c.label }}
            <LucideX class="size-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="min-h-11 px-2 text-sm text-ink-gray-6 underline"
            @click="clearAll"
          >
            {{ __('Limpiar') }}
          </button>
        </div>
      </template>
      <RecentPicks
        v-if="!search"
        :picks="recentDeals.picks.value"
        @pick="(pick) => openDeal(pick.name)"
        @clear="recentDeals.clear()"
      />
      <ChipGroup
        :label="__('Seguimiento')"
        :options="followUpOptions"
        :model-value="followUp"
        clear-value="all"
        testid="deals-follow-up"
        @update:model-value="selectFollowUp"
      />
      <ChipGroup
        v-if="pipelineF || (pipelines.data || []).length > 1"
        v-model="pipelineF"
        :label="__('Sales pipeline')"
        :options="pipelineOptions"
      />
      <ChipDrill :label="__('Más filtros')" :sections="drillSections" />
      <p v-if="pipelines.error" role="alert" class="text-sm text-ink-red-7">
        {{ __('Pipelines could not load') }}
      </p>
    </SearchPanel>

    <!-- Desktop: the shell's list header (Compras, Prospectos): the title with
         its count and what the queue holds, one filled button and one island
         of icons; the queues as the tab row beside the search; the filters as
         one row of pills with what narrows the list after them. -->
    <header v-else class="flex-none px-4 pb-3 pt-5 sm:px-6" data-deals-header>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div class="min-w-0 flex-1 basis-56">
          <h1
            class="title-face truncate text-3xl font-semibold leading-tight text-ink-gray-9"
          >
            {{ __('Tratos')
            }}<span
              class="num ml-2 font-normal text-ink-gray-5"
              data-testid="deals-count"
              >{{ count }}</span
            >
          </h1>
          <p class="truncate text-sm text-ink-gray-6" :title="queueDescription">
            {{ queueDescription }}
          </p>
        </div>
        <div class="flex flex-none items-center gap-2">
          <div class="w-fit">
            <Segmented
              :model-value="view"
              :options="layoutTabs"
              :label="__('Mostrar como')"
              fit="content"
              data-testid="deals-layouts"
              @update:model-value="(key) => selectView({ key })"
            />
          </div>
          <div
            class="flex items-center gap-0.5 rounded-full bg-surface-gray-2 p-0.5"
            data-deals-island
          >
            <ColumnPicker
              v-if="view === 'list'"
              :columns="availableColumns"
              :selected="activeCols"
              @update:selected="setCols"
              @reset="resetCols"
            />
            <button
              type="button"
              :class="ISLAND_ICON"
              :aria-label="__('Exportar a Excel')"
              :title="__('Exportar a Excel')"
              @click="exportDeals"
            >
              <span class="lucide-download size-5" aria-hidden="true" />
            </button>
            <Dropdown :options="viewMenu" align="end">
              <button
                type="button"
                :class="ISLAND_ICON"
                :aria-label="__('Más opciones')"
                :title="__('Más opciones')"
              >
                <span class="lucide-ellipsis size-5" aria-hidden="true" />
              </button>
            </Dropdown>
          </div>
          <button
            type="button"
            :class="['press', BTN_FILLED]"
            data-testid="deals-new"
            @click="showDealModal = true"
          >
            <span class="lucide-plus size-4" aria-hidden="true" />
            {{ __('New Deal') }}
          </button>
        </div>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div class="w-fit max-w-full">
          <Segmented
            :model-value="followUp"
            :options="queueTabs"
            :label="__('Colas de seguimiento')"
            fit="content"
            data-testid="deals-queues"
            @update:model-value="selectFollowUp"
          />
        </div>
        <label
          class="ml-auto flex h-10 min-w-48 flex-1 items-center gap-2 rounded-full bg-surface-gray-2 px-3.5 focus-within:ring-2 focus-within:ring-outline-gray-4 sm:max-w-xs"
        >
          <span
            :class="[
              deals.loading && search
                ? 'lucide-loader-circle animate-spin'
                : 'lucide-search',
              'size-4 flex-none text-ink-gray-5',
            ]"
            aria-hidden="true"
          />
          <input
            :value="search"
            type="search"
            enterkeyhint="search"
            data-list-search
            class="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-0"
            :aria-label="__('Buscar tratos')"
            :placeholder="__('Buscar cliente, equipo…')"
            @input="onSearch($event.target.value)"
          />
        </label>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-1.5" data-deals-filters>
        <label
          v-if="(pipelines.data || []).length > 1 || pipelineF"
          class="press inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm"
          :class="
            pipelineF
              ? 'bg-surface-green-2 text-ink-green-8'
              : 'bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3'
          "
        >
          <span class="sr-only">{{ __('Sales pipeline') }}</span>
          <select
            v-model="pipelineF"
            class="h-8 max-w-[14rem] cursor-pointer border-0 bg-transparent py-0 pl-0 pr-6 text-sm text-inherit focus:ring-0"
            data-testid="deals-pipeline"
          >
            <option value="">{{ __('All pipelines') }}</option>
            <option
              v-for="pipeline in pipelines.data || []"
              :key="pipeline.name"
              :value="pipeline.name"
            >
              {{ pipelineLabel(pipeline)
              }}{{ pipeline.archived ? ', ' + __('Archived') : '' }}
            </option>
          </select>
        </label>
        <FilterPopover
          :label="__('Stage')"
          :options="stageOptions"
          :selected="statusF"
          @update:selected="statusF = $event"
        />
        <FilterPopover
          :label="__('Source')"
          :options="sourceOptions"
          :selected="sourceF"
          @update:selected="sourceF = $event"
        />
        <FilterPopover
          :label="__('Owner')"
          :options="ownerOptions"
          :selected="ownerF"
          @update:selected="ownerF = $event"
        />
        <Dropdown v-if="view === 'list'" :options="groupByMenu">
          <button
            type="button"
            class="press inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm"
            :class="
              grouped
                ? 'bg-surface-green-2 text-ink-green-8'
                : 'bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3'
            "
          >
            {{ __('Agrupar')
            }}<span v-if="grouped">: {{ __(groupByLabel(groupBy)) }}</span>
            <span class="lucide-chevron-down size-4" aria-hidden="true" />
          </button>
        </Dropdown>
        <SavedViewPicker
          v-model:selected="viewName"
          :context="listContext"
          :legacy-views="savedViews"
          @apply="applyViewContext"
          @apply-legacy="applyView"
          @delete-legacy="deleteView"
          @default-view="onDefaultView"
        />
        <span
          v-if="pipelines.error"
          role="alert"
          class="inline-flex h-8 items-center gap-2 text-sm text-ink-red-7"
        >
          {{ __('Pipelines could not load') }}
          <button
            type="button"
            class="font-medium text-ink-gray-9 underline"
            @click="pipelines.reload()"
          >
            {{ __('Reintentar') }}
          </button>
        </span>
        <template v-if="chips.length">
          <span class="mx-1 h-5 w-px bg-outline-gray-2" aria-hidden="true" />
          <button
            v-for="c in chips"
            :key="c.key"
            type="button"
            class="press inline-flex h-8 items-center gap-1 rounded-full bg-surface-green-2 px-3 text-sm text-ink-green-8"
            :aria-label="__('Quitar filtro') + ' ' + c.label"
            @click="removeChip(c)"
          >
            {{ c.label }}
            <LucideX class="size-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="h-8 px-2 text-sm text-ink-gray-6 underline hover:text-ink-gray-9"
            @click="clearAll"
          >
            {{ __('Limpiar todo') }}
          </button>
        </template>
      </div>
    </header>

    <!-- A failed read keeps the filters and says what to do. -->
    <div
      v-if="deals.error"
      role="alert"
      class="mx-4 mb-2 flex flex-none flex-wrap items-center gap-x-3 gap-y-1 rounded-6 bg-surface-red-1 px-3 py-2 text-sm text-ink-red-7 sm:mx-6"
    >
      <span class="min-w-0 flex-1">{{
        __('No se pudieron cargar los tratos. Tus filtros siguen guardados.')
      }}</span>
      <button
        type="button"
        class="press min-h-11 rounded-full px-3 font-medium text-ink-gray-9 hover:bg-surface-red-2 sm:min-h-8"
        @click="applyFilters({ force: true })"
      >
        {{ __('Reintentar') }}
      </button>
    </div>

    <!-- ── phone list: the shell's rows (ui/ListRow), as in Prospectos ─────── -->
    <div
      v-if="view === 'list' && isMobile"
      ref="listScroller"
      class="scb min-h-0 flex-1 overflow-y-auto pb-20"
    >
      <div
        v-if="deals.loading && !rows.length"
        class="px-4 py-3 text-sm text-ink-gray-6"
        role="status"
      >
        {{ __('Cargando tratos…') }}
      </div>
      <div
        v-else-if="!rows.length && !deals.error"
        class="px-4 py-10 text-center text-sm text-ink-gray-6"
      >
        {{ __('Ningún trato coincide con estos filtros.') }}
      </div>
      <div
        v-for="r in rows"
        :key="r.name"
        class="flex items-start"
        :data-deal="r.name"
        :data-fresh="live.fresh.value.has(r.name) || undefined"
      >
        <ListRow
          class="min-w-0 flex-1 !pr-1"
          :avatar="cardTitle(r)"
          :title="cardTitle(r)"
          :meta="amountOf(r)"
          data-testid="deal-row"
          @click="openDeal(r.name)"
        >
          <template #subtitle>
            <span class="inline-flex min-w-0 items-center gap-1.5">
              <span v-if="r.status" v-bind="stageDot(r.status)" />
              <span class="truncate">{{ phoneLine(r) }}</span>
            </span>
          </template>
          <template #trailing>
            <span
              class="whitespace-nowrap text-sm"
              :class="
                followUpOverdue(r)
                  ? 'font-medium text-ink-red-7'
                  : 'text-ink-gray-6'
              "
              >{{ followUpWords(r) }}</span
            >
          </template>
        </ListRow>
        <Dropdown :options="rowMenu(r)" align="end">
          <button
            type="button"
            class="press mr-1 mt-1.5 flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-6 active:bg-surface-gray-2"
            :aria-label="__('Más acciones') + ' ' + cardTitle(r)"
          >
            <span class="lucide-ellipsis-vertical size-5" aria-hidden="true" />
          </button>
        </Dropdown>
      </div>
      <button
        v-if="deals.hasNextPage && rows.length"
        type="button"
        class="flex min-h-12 w-full items-center justify-center text-base-medium text-ink-gray-8"
        :disabled="deals.loading"
        @click="deals.next()"
      >
        {{ deals.loading ? __('Cargando…') : __('Cargar más') }}
      </button>
    </div>

    <template v-if="view === 'list' && !isMobile">
      <!-- One header, a column per fact. The columns the worker chose that do
           not fit the list's width step aside, last-chosen first, and the
           header says how many (never a sideways scroll). -->
      <div ref="listScroller" class="scb min-h-0 flex-1 overflow-auto">
        <div>
          <!-- table header -->
          <div
            class="sticky top-0 z-[5] grid items-center gap-x-4 border-b border-outline-gray-1 bg-surface-base px-4 text-sm text-ink-gray-6 sm:px-6"
            :style="`grid-template-columns:${GRID};min-height:40px`"
            data-deals-columns
          >
            <input
              type="checkbox"
              data-select-page
              class="h-5 w-5 rounded-4"
              :checked="allSelected"
              :indeterminate.prop="selectedRows.length > 0 && !allSelected"
              :aria-label="__('Seleccionar todo')"
              @change="toggleAll"
            />
            <button class="text-left" @click="sortBy('deal_name')">
              {{ __('Trato') }}{{ sortArrow('deal_name') }}
            </button>
            <div v-if="col('customer')">{{ __('Cliente') }}</div>
            <button
              v-if="col('phone')"
              class="text-left"
              @click="sortBy('mobile_no')"
            >
              {{ __('Teléfono') }}{{ sortArrow('mobile_no') }}
            </button>
            <div v-if="col('device')">{{ __('Equipo') }}</div>
            <div v-if="col('repair_type')">{{ __('Reparación') }}</div>
            <div v-if="col('ro')">{{ __('Orden de reparación') }}</div>
            <div v-if="col('stage')">{{ __('Stage') }}</div>
            <button
              v-if="col('next_activity')"
              class="text-left"
              @click="sortBy('next_activity_at')"
            >
              {{ __('Próximo paso') }}{{ sortArrow('next_activity_at') }}
            </button>
            <button
              v-if="col('close_date')"
              class="text-left"
              @click="sortBy('expected_closure_date')"
            >
              {{ __('Cierre') }}{{ sortArrow('expected_closure_date') }}
            </button>
            <div v-if="col('source')">{{ __('Source') }}</div>
            <button
              v-if="col('modified')"
              class="text-left"
              @click="sortBy('modified')"
            >
              {{ __('Última act.') }}{{ sortArrow('modified') }}
            </button>
            <div v-if="col('owner')">{{ __('Owner') }}</div>
            <button
              v-if="col('expected_value')"
              class="text-right"
              @click="sortBy('expected_deal_value')"
            >
              {{ __('Valor esperado') }}{{ sortArrow('expected_deal_value') }}
            </button>
            <button
              v-if="col('value')"
              class="text-right"
              @click="sortBy('deal_value')"
            >
              {{ __('Valor') }}{{ sortArrow('deal_value') }}
            </button>
            <div
              class="text-right text-xs"
              :title="
                hiddenCols.length
                  ? __('Sin espacio para: {0}', [
                      hiddenCols.map((c) => c.label).join(', '),
                    ])
                  : undefined
              "
              data-testid="deals-hidden-columns"
            >
              {{ hiddenCols.length ? `+${hiddenCols.length}` : '' }}
            </div>
          </div>

          <!-- rows -->
          <div
            v-if="deals.loading && !rows.length"
            class="px-4 py-3 text-sm text-ink-gray-6 sm:px-6"
            role="status"
          >
            {{ __('Cargando tratos…') }}
          </div>
          <div
            v-else-if="!rows.length && !deals.error"
            class="px-4 py-10 text-center text-sm text-ink-gray-6"
          >
            {{ __('Ningún trato coincide con estos filtros.') }}
          </div>

          <template v-for="g in renderGroups" :key="g.key">
            <DealGroupHeader
              v-if="grouped"
              :label="g.label"
              :empty-label="__(groupEmptyLabel)"
              :count="g.count"
              :exact="g.exact"
              :collapsed="collapsed[g.key] === true"
              :color="groupColor(g.key)"
              @toggle="toggleGroup(g.key)"
            />
            <div
              v-for="r in grouped && collapsed[g.key] ? [] : g.rows"
              :key="r.name"
              role="button"
              tabindex="0"
              data-key-row
              :data-row-current="r.name === lastOpened || undefined"
              :data-fresh="live.fresh.value.has(r.name) || undefined"
              class="grid cursor-pointer items-center gap-x-4 border-b border-outline-gray-1 px-4 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
              :class="selectedRows.includes(r.name) ? 'bg-surface-blue-1' : ''"
              :style="`grid-template-columns:${GRID};min-height:56px`"
              :data-deal="r.name"
              :aria-keyshortcuts="'n p r h'"
              @click="openDeal(r.name)"
              @keydown.enter.self="openDeal(r.name)"
              @keydown="onRowKey($event, r)"
            >
              <input
                type="checkbox"
                data-row-check
                class="h-5 w-5 rounded-4"
                :checked="selectedRows.includes(r.name)"
                :aria-label="__('Seleccionar') + ' ' + cardTitle(r)"
                @click.stop="toggleRow(r.name)"
              />
              <div class="flex min-w-0 items-center gap-2.5">
                <span
                  class="flex size-8 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-xs font-semibold text-ink-gray-7"
                  aria-hidden="true"
                >
                  {{ initials(cardTitle(r)) }}
                </span>
                <div class="min-w-0">
                  <div
                    class="truncate text-base font-medium text-ink-gray-9"
                    :title="cardTitle(r)"
                  >
                    {{ cardTitle(r) }}
                  </div>
                  <!-- second line = the customer, so the identity is visible
                       even with the Cliente column hidden -->
                  <div class="truncate text-sm text-ink-gray-6">
                    {{ secondLine(r) }}
                  </div>
                </div>
              </div>
              <div
                v-if="col('customer')"
                class="truncate text-sm text-ink-gray-8"
                :title="customerOf(r) || ''"
              >
                {{ customerOf(r) }}
              </div>
              <div
                v-if="col('phone')"
                class="num truncate text-sm text-ink-gray-8"
              >
                {{ phoneOf(r) ? formatPhone(phoneOf(r)) : '' }}
              </div>
              <div
                v-if="col('device')"
                class="truncate text-sm text-ink-gray-8"
                :title="deviceOf(r) || ''"
              >
                {{ deviceOf(r) }}
              </div>
              <div
                v-if="col('repair_type')"
                class="truncate text-sm text-ink-gray-8"
                :title="repairTypeOf(r) || ''"
              >
                {{ repairTypeOf(r) }}
              </div>
              <div v-if="col('ro')" class="min-w-0 text-sm">
                <template v-if="extra(r).repair_order">
                  <span class="num block truncate text-ink-gray-8"
                    >{{ extra(r).repair_order
                    }}<span
                      v-if="extra(r).repair_count > 1"
                      class="text-ink-gray-5"
                    >
                      +{{ extra(r).repair_count - 1 }}</span
                    ></span
                  >
                  <span
                    v-if="extra(r).repair_status"
                    class="block truncate text-ink-gray-6"
                    >{{ sentenceCase(__(extra(r).repair_status)) }}</span
                  >
                </template>
              </div>
              <div
                v-if="col('stage')"
                class="flex min-w-0 items-center gap-1.5 text-sm text-ink-gray-8"
              >
                <template v-if="r.status">
                  <span v-bind="stageDot(r.status)" />
                  <span class="truncate">{{ stageLabel(r.status) }}</span>
                </template>
              </div>
              <FollowUpCell
                v-if="col('next_activity')"
                :row="r"
                :today="siteToday"
                @saved="onFollowUpSaved(r, $event)"
              />
              <div v-if="col('close_date')" class="text-sm text-ink-gray-8">
                {{
                  r.expected_closure_date
                    ? formatDate(r.expected_closure_date)
                    : ''
                }}
              </div>
              <div
                v-if="col('source')"
                class="truncate text-sm text-ink-gray-8"
              >
                {{ r.source ? __(r.source) : '' }}
              </div>
              <div v-if="col('modified')" class="text-sm text-ink-gray-6">
                {{ relativeTime(r.modified) }}
              </div>
              <div v-if="col('owner')">
                <span
                  v-if="r.deal_owner"
                  class="flex size-7 items-center justify-center rounded-full bg-surface-gray-2 text-[11px] font-semibold text-ink-gray-7"
                  :title="ownerName(r.deal_owner)"
                >
                  {{ initials(ownerName(r.deal_owner)) }}
                </span>
              </div>
              <div
                v-if="col('expected_value')"
                class="num text-right text-sm text-ink-gray-8"
              >
                {{
                  Number(r.expected_deal_value)
                    ? formatMXN(r.expected_deal_value, r.currency)
                    : ''
                }}
              </div>
              <div
                v-if="col('value')"
                class="num text-right text-sm font-medium"
                :class="
                  isOutlier(r, metricsContract)
                    ? 'text-ink-amber-9'
                    : 'text-ink-gray-9'
                "
                :title="
                  isOutlier(r, metricsContract)
                    ? __(
                        'Unusually large amount: left out of totals and averages. Check the value.',
                      )
                    : undefined
                "
              >
                {{ amountOf(r)
                }}<span v-if="isOutlier(r, metricsContract)"> ⚠</span>
              </div>
              <Dropdown :options="rowMenu(r)" align="end" @click.stop>
                <button
                  type="button"
                  class="press flex size-8 items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
                  :aria-label="__('Más acciones')"
                  @click.stop
                >
                  <span class="lucide-ellipsis size-4" aria-hidden="true" />
                </button>
              </Dropdown>
            </div>
          </template>

          <button
            v-if="deals.hasNextPage && rows.length"
            type="button"
            class="flex min-h-12 w-full items-center justify-center text-base-medium text-ink-gray-8 hover:bg-surface-gray-1"
            :disabled="deals.loading"
            @click="deals.next()"
          >
            {{ deals.loading ? __('Cargando…') : __('Cargar más') }}
          </button>
        </div>
      </div>
      <!-- The selection's actions, under the list (PowerBulkBar's place). -->
      <div
        v-if="selectedRows.length"
        class="sticky bottom-0 z-20 flex flex-none flex-wrap items-center gap-2 border-t border-outline-gray-2 bg-surface-base px-4 py-3 shadow-lg sm:px-6"
        role="region"
        :aria-label="__('Tratos seleccionados')"
        data-deals-bulkbar
      >
        <p class="min-w-0 flex-1 text-sm font-medium text-ink-gray-9">
          {{
            selectedRows.length === 1
              ? __('1 trato seleccionado')
              : __('{0} tratos seleccionados', [selectedRows.length])
          }}
        </p>
        <button
          type="button"
          :class="['press', BTN_FILLED]"
          :aria-keyshortcuts="'n'"
          @click="bulkSchedule"
        >
          {{ __('Programar seguimiento') }}
          <kbd class="text-xs opacity-70">N</kbd>
        </button>
        <button
          type="button"
          class="press inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-ink-red-7 hover:bg-surface-red-1"
          @click="bulkDelete"
        >
          {{ __('Eliminar') }}
        </button>
        <button
          type="button"
          class="press inline-flex h-10 items-center rounded-full px-4 text-sm text-ink-gray-7 hover:bg-surface-gray-2"
          @click="selectedRows = []"
        >
          {{ __('Quitar selección') }}
        </button>
      </div>
    </template>

    <!-- board view -->
    <BoardView
      v-else-if="view === 'board'"
      :rows="rows"
      :groups="boardColumns"
      :counts="groupCounts"
      group-field="status"
      :format-value="formatMXN"
      @card-click="(r) => openDeal(r.name)"
      @change="onBoardChange"
    >
      <!-- count · total · probability-weighted total -->
      <template #header-value="{ group }">
        <div class="flex flex-none flex-col items-end leading-tight">
          <button
            v-if="metricsError"
            class="text-[10px] text-ink-red-7"
            @click="loadCounts"
          >
            {{ __('Totals unavailable · Retry') }}
          </button>
          <span
            v-if="groupCounts[group.value]?.outlier_count"
            class="text-[10px] text-ink-amber-9"
            :title="
              __(
                'Unusually large amount: left out of totals and averages. Check the value.',
              )
            "
          >
            {{ __('Unusual amounts left out') }}:
            {{ groupCounts[group.value].outlier_count }}
          </span>
          <span
            v-if="groupCounts[group.value]?.missing_exchange_rate_count"
            class="text-[10px] text-ink-orange-6"
          >
            {{ __('Missing exchange rate') }}:
            {{ groupCounts[group.value].missing_exchange_rate_count }}
          </span>
          <span
            v-if="columnValue(group)"
            class="text-[11px] font-medium text-ink-gray-5"
          >
            {{ formatMXN(columnValue(group)) }}
          </span>
          <span
            v-if="columnWeighted(group)"
            class="text-[10px] text-ink-gray-5"
          >
            {{ __('pond.') }} {{ formatMXN(columnWeighted(group)) }}
          </span>
        </div>
      </template>
      <template #card="{ row }">
        <div class="min-w-0">
          <div class="flex items-start justify-between gap-2">
            <span
              class="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-gray-9"
              >{{ cardTitle(row) }}</span
            >
            <span
              class="num flex-none text-[11px] font-semibold text-ink-gray-7"
              >{{ amountOf(row) }}</span
            >
          </div>
          <div class="mt-0.5 flex items-center justify-between gap-2">
            <span class="min-w-0 flex-1 truncate text-[11px] text-ink-gray-5">
              {{ deviceOf(row) || formatPhone(phoneOf(row)) }}
            </span>
            <span
              v-if="probabilityOf(row)"
              class="flex-none rounded-full bg-surface-gray-2 px-1.5 text-[10px] font-semibold text-ink-gray-6"
              :title="__('Probabilidad')"
            >
              {{ probabilityOf(row) }}%
            </span>
          </div>
          <div
            v-if="tagsOf(row).length"
            class="mt-1 flex flex-wrap items-center gap-1"
          >
            <span
              v-for="t in tagsOf(row)"
              :key="t"
              class="max-w-[110px] truncate rounded-4 px-1 py-px text-[10px] font-medium text-ink-gray-6"
              style="background: var(--surface-gray-2)"
            >
              {{ t }}
            </span>
          </div>
          <div class="mt-1.5 flex items-center gap-1.5">
            <NextActivityChip
              :at="row.next_activity_at"
              :title="row.next_activity_title"
              :type="row.next_activity_type"
              :empty-label="
                row.next_activity_task
                  ? __('Pendiente sin fecha')
                  : __('Sin seguimiento')
              "
              compact
            />
            <div class="ml-auto flex flex-none items-center gap-1.5">
              <span
                v-if="row.deal_owner"
                class="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-surface-gray-2 text-[9px] font-semibold text-ink-gray-7"
                :title="ownerName(row.deal_owner)"
              >
                {{ initials(ownerName(row.deal_owner)) }}
              </span>
              <span
                class="text-[10px] text-ink-gray-5"
                :title="__('Antigüedad')"
                >{{ relativeTime(row.creation) }}</span
              >
            </div>
          </div>
        </div>
      </template>
    </BoardView>

    <!-- funnel view -->
    <FunnelView
      v-else-if="view === 'funnel'"
      :groups="stageOptions"
      :counts="groupCounts"
    />

    <!-- phone: create sits under the thumb, clear of the nav and dock -->
    <!-- the shell's one FAB (bottom end, like every other list) -->
    <Fab
      v-if="isMobile"
      :label="__('New Deal')"
      @click="showDealModal = true"
    />

    <DealModal
      v-if="showDealModal"
      v-model="showDealModal"
      :defaults="pipelineF ? { pipeline: pipelineF } : {}"
    />
    <BoardLostPrompt
      :pending="lostDrop"
      :saving="lostSaving"
      :pending-error="lostError"
      @confirm="confirmLostDrop"
      @cancel="lostDrop = null"
    />
  </div>
</template>

<script setup>
import { errorText } from '@/utils/errorText'
import { useLiveList } from '@/composables/liveList'
import Fab from '@/components/ui/Fab.vue'
import ListRow from '@/components/ui/ListRow.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { computed, defineAsyncComponent, nextTick, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import {
  Dropdown,
  createListResource,
  createResource,
  call as frappeCall,
  toast,
  dayjs,
  getConfig,
} from 'frappe-ui'
import { confirmDialog } from '@/utils/dialogs'
import { statusesStore } from '@/stores/statuses'
import { usersStore } from '@/stores/users'
import FilterPopover from '@/components/doco/leads/FilterPopover.vue'
import { userScopedKey } from '@/utils/storageKeys'
import ColumnPicker from '@/components/doco/ColumnPicker.vue'
import BoardView from '@/components/doco/BoardView.vue'
import BoardLostPrompt from '@/components/Kanban/BoardLostPrompt.vue'
import { boardStages, stageMove } from '@/utils/pipelineStages'
import { guardStatusChange } from '@/utils/statusGuard'
import { requestNextStep } from '@/composables/useNextStep'
import FunnelView from '@/components/doco/FunnelView.vue'
import SearchPanel from '@/components/ui/SearchPanel.vue'
import ChipGroup from '@/components/ui/ChipGroup.vue'
import ChipDrill from '@/components/ui/ChipDrill.vue'
import RecentPicks from '@/components/ui/RecentPicks.vue'
import { chipClass, dotBinding } from '@/components/ui/chipClass'
import { useRecentPicks } from '@/composables/useRecentPicks'
import LucideX from '~icons/lucide/x'
import NextActivityChip from '@/components/doco/NextActivityChip.vue'
import FollowUpCell from '@/components/doco/deals/FollowUpCell.vue'
import { registerPageShortcuts } from '@/composables/shellKeyboard'
import {
  nextStepChanged,
  openBulkNextStep,
  runNextStep,
} from '@/composables/useNextStep'
import {
  NEXT_STEP_SHORTCUTS,
  listReturnPageLength,
  nextStepAction,
  readListReturn,
  rowNextStep,
  writeListReturn,
} from '@/utils/nextStep'
import DealGroupHeader from '@/components/doco/deals/DealGroupHeader.vue'
import SavedViewPicker from '@/components/doco/deals/SavedViewPicker.vue'
import { isMobile } from '@/composables/breakpoint'
import { useListKeys } from '@/composables/pageKeys'
import { hasTaller, reloadQueue } from '@/composables/inbox'
import { initials, formatPhone } from '@/composables/crmFormat'
import { formatDay } from '@/utils/contactos'
import { fitColumns } from '@/utils/fitColumns'
import { money } from '@/utils/numberFormat'
import {
  displayValue,
  dealProbability,
  isOutlier,
  stageValue,
  weightedTotal,
} from '@/utils/pipelineMath'

import { followUpFilters, FOLLOW_UP_QUEUES } from '@/utils/dealFollowUp'
import { pipelineLabel, stageLabel } from '@/utils/stageLabel'
import {
  DEAL_GROUP_BYS,
  groupByLabel,
  groupRows,
  isGroupBy,
} from '@/utils/dealGroups'
import { dealListState } from '@/utils/dealListState'
import { takeCreateRequest } from '@/utils/shellCreate'
const router = useRouter()
const route = useRoute()
const QUEUE_KEY = userScopedKey('crm_deal_list_context')
const RETURN_KEY = userScopedKey('crm_deal_list_return')
const listScroller = ref(null)
let remembered = dealListState()
// Whether this tab already has a context: a saved default view opens the list
// only on a fresh session, never on the way back from a deal.
let hadRemembered = false
try {
  const raw = sessionStorage.getItem(QUEUE_KEY)
  if (raw) {
    remembered = dealListState(JSON.parse(raw))
    hadRemembered = true
  }
} catch {
  /* an unreadable context is no context: the list opens on its defaults */
}

// A report drill-down replaces unrelated remembered filters; its cohort survives
// opening a record and returning to this list through the existing session state.
if (route.query.report === 'pipeline') {
  remembered = dealListState({
    pipeline: route.query.pipeline,
    status: typeof route.query.status === 'string' ? [route.query.status] : [],
    createdFrom: route.query.created_from,
    createdTo: route.query.created_to,
  })
  hadRemembered = true
}
// An Avisos digest opens exactly the deals it names (?report=avisos&deal=…).
if (route.query.report === 'avisos') {
  const deal = route.query.deal
  remembered = dealListState({ deals: Array.isArray(deal) ? deal : [deal] })
  hadRemembered = true
}
// A queue drill-down (Hoy «Tratos sin seguimiento»: ?follow_up=missing&owner=me)
// opens that queue for that owner; the return to Hoy keeps the list's context.
if (typeof route.query.follow_up === 'string') {
  const owner = route.query.owner
  remembered = dealListState({
    followUp: route.query.follow_up,
    owner: typeof owner === 'string' && owner ? [owner] : [],
  })
  hadRemembered = true
}
// A legacy /deals/view/kanban link (router redirect) lands on its layout,
// and keeps it when the worker's default view opens (onDefaultView).
const linkLayout = ['list', 'board', 'funnel'].includes(route.query.layout)
  ? route.query.layout
  : ''
if (linkLayout) remembered = { ...remembered, view: linkLayout }

// ── column config (per-browser show/hide) ─────────────────────────────────────
// trato (contact) is fixed (1fr); checkbox + row-menu are structural. The rest toggle.
// Marco 2026-08-13: the list was unusable — no customer name, no phone, nothing about
// the repair. Identity and repair data don't live on the deal row (identity is on the
// linked Contact, the repair is a taller Repair Order), so those columns are fed by one
// batched enrichment call per page (api.deals.get_deal_display).
const DEAL_COLUMNS = [
  { key: 'contact', label: __('Trato'), fixed: true },
  { key: 'customer', label: __('Cliente') },
  { key: 'phone', label: __('Teléfono') },
  { key: 'device', label: __('Equipo') },
  { key: 'repair_type', label: __('Reparación') },
  { key: 'ro', label: __('Orden de reparación') },
  { key: 'value', label: __('Valor') },
  { key: 'expected_value', label: __('Valor esperado') },
  { key: 'close_date', label: __('Cierre') },
  { key: 'next_activity', label: __('Próximo paso') },
  { key: 'stage', label: __('Stage') },
  { key: 'source', label: __('Source') },
  { key: 'modified', label: __('Última act.') },
  { key: 'owner', label: __('Owner') },
]
// The table's order: who, what the shop has of theirs, where the deal stands
// and what comes next, then the rest; the amount closes the row.
const COL_ORDER = [
  'customer',
  'phone',
  'device',
  'repair_type',
  'ro',
  'stage',
  'next_activity',
  'close_date',
  'source',
  'modified',
  'owner',
  'expected_value',
  'value',
]
const COL_WIDTH = {
  customer: '150px',
  phone: '140px',
  device: '140px',
  repair_type: '130px',
  ro: '140px',
  value: '110px',
  expected_value: '120px',
  close_date: '100px',
  next_activity: '170px',
  stage: '130px',
  source: '110px',
  modified: '100px',
  owner: '44px',
}
// What steps aside first when the list is narrower than the chosen columns.
const DROP_ORDER = [
  'close_date',
  'expected_value',
  'repair_type',
  'source',
  'owner',
  'modified',
  'device',
  'customer',
  'ro',
  'phone',
  'stage',
  'next_activity',
  'value',
]
const DEFAULT_COLS = [
  'customer',
  'phone',
  'device',
  'ro',
  'stage',
  'value',
  'next_activity',
  'modified',
  'owner',
]
// v3: "Próxima actividad" joined the defaults (the whole point of the pipeline
// milestone is that what needs doing is visible on the row); "Valor esperado" and
// "Cierre" ship available but off, the row is wide enough already.
const COLS_KEY = userScopedKey('doco_deals_columns_v3')
const visibleCols = ref(loadCols())
// A saved view carries its own column set. It overrides the browser preference
// while that view is applied and never overwrites it, so dropping the view
// returns the worker to the columns they picked.
const viewCols = ref(null)
const activeCols = computed(() => viewCols.value || visibleCols.value)
function loadCols() {
  try {
    const s = JSON.parse(window.localStorage.getItem(COLS_KEY) || 'null')
    const f = Array.isArray(s) ? s.filter((k) => k in COL_WIDTH) : []
    return f.length ? f : [...DEFAULT_COLS]
  } catch {
    return [...DEFAULT_COLS]
  }
}
function setCols(next) {
  viewCols.value = null
  visibleCols.value = next
  window.localStorage.setItem(COLS_KEY, JSON.stringify(next))
}
function resetCols() {
  setCols([...DEFAULT_COLS])
}
// Repair columns only exist where taller does (mumu has no Repair Order) — never
// render three permanently-empty columns on a retail tenant.
const REPAIR_COLS = ['device', 'repair_type', 'ro']
const availableColumns = computed(() =>
  DEAL_COLUMNS.filter((c) => hasTaller.value || !REPAIR_COLS.includes(c.key)),
)
// The chosen columns this tenant has (no repair columns without taller).
const chosenCols = computed(() =>
  COL_ORDER.filter(
    (key) =>
      activeCols.value.includes(key) &&
      (hasTaller.value || !REPAIR_COLS.includes(key)),
  ),
)
// The list's own width decides how many fit (not the window: the rail and
// Ventas' sections take their share). Before the first measurement all show.
const { width: listWidth } = useElementSize(listScroller)
// checkbox + the deal (at least 220) + the row menu + the gutters, and the
// two 16 px gaps around the fixed tracks (each chosen column adds its own)
const FIXED_W = 40 + 220 + 32 + 48 + 2 * 16
const fittedCols = computed(() =>
  fitColumns(chosenCols.value, {
    widths: COL_WIDTH,
    dropOrder: DROP_ORDER,
    room: listWidth.value,
    fixed: FIXED_W,
    gap: 16,
  }),
)
// Said in the header («+2», with the names on hover), never dropped silently.
const hiddenCols = computed(() =>
  chosenCols.value
    .filter((key) => !fittedCols.value.has(key))
    .map((key) => DEAL_COLUMNS.find((c) => c.key === key)),
)
function col(key) {
  return key === 'contact' || fittedCols.value.has(key)
}
const GRID = computed(() => {
  const parts = ['40px', 'minmax(220px,1fr)'] // checkbox + the deal (always)
  for (const key of COL_ORDER) if (col(key)) parts.push(COL_WIDTH[key])
  parts.push('32px') // row menu
  return parts.join(' ')
})
// NOTE: read the visible-stage list THROUGH the store (`statusStore.visible…`).
// Destructuring a pinia computed unwraps it into a one-shot value and the board
// would keep the stage set it saw on first render.
const statusStore = statusesStore()
const { getDealStatus } = statusStore
const { getUser, users: usersList } = usersStore()

// Opens on «New Deal» only; it carries the field layout and the text editor,
// which the list does not need to paint (bundle budget, SPEC §4).
const DealModal = defineAsyncComponent(
  () => import('@/components/Modals/DealModal.vue'),
)
const showDealModal = ref(false)
const followUp = ref(remembered.followUp)
const followUpQueues = FOLLOW_UP_QUEUES
const pipelineF = ref(remembered.pipeline || '')
const createdFrom = ref(remembered.createdFrom || '')
const createdTo = ref(remembered.createdTo || '')
const pipelines = createResource({
  url: 'crm.pipeline.api.get_pipelines',
  params: { include_archived: true },
  auto: true,
})
const scopedStages = computed(() =>
  pipelineF.value
    ? (pipelines.data || [])
        .find((pipeline) => pipeline.name === pipelineF.value)
        ?.stages?.filter((stage) => !stage.archived) || []
    : statusStore.visibleDealStatuses,
)
const statusF = ref(remembered.status)
const sourceF = ref(remembered.source)
const ownerF = ref(remembered.owner)
const dealsF = ref(remembered.deals)
const search = ref(remembered.search)
const sort = ref(remembered.sort)
const selectedRows = ref([])
const view = ref(remembered.view)
// The deal the worker opened last: back on the list, j/k start there.
const lastOpened = ref(sessionStorage.getItem('muelle.ventas.lastDeal') || '')
watch(lastOpened, (name) =>
  sessionStorage.setItem('muelle.ventas.lastDeal', name),
)
// Keyboard standard on the desktop list: search, j/k, Enter opens the deal,
// x / Shift+X / Ctrl+A select, c new deal. Board and funnel have no rows to walk.
useListKeys({
  page: 'ventas',
  search: true,
  rows: true,
  open: true,
  select: true,
  create: () => {
    showDealModal.value = true
  },
  when: {
    'row.next': () => view.value === 'list' && !isMobile.value,
    'row.prev': () => view.value === 'list' && !isMobile.value,
    'row.open': () => view.value === 'list' && !isMobile.value,
    'select.toggle': () => view.value === 'list' && !isMobile.value,
    'select.range': () => view.value === 'list' && !isMobile.value,
    'select.page': () => view.value === 'list' && !isMobile.value,
  },
})
// «Nuevo trato» from Ctrl+K anywhere: /deals?create=1 opens the deal dialog.
if (takeCreateRequest(route, router)) showDealModal.value = true
const groupBy = ref(remembered.groupBy)
const viewName = ref(remembered.viewName)
const collapsed = ref({})
const groupCounts = ref({})
const countsLoaded = ref(false)
let countsRequest = 0
// What a saved view stores and what a return from a deal restores: one shape.
const listContext = computed(() => ({
  pipeline: pipelineF.value,
  createdFrom: createdFrom.value,
  createdTo: createdTo.value,
  status: statusF.value,
  source: sourceF.value,
  owner: ownerF.value,
  deals: dealsF.value,
  search: search.value,
  sort: sort.value,
  view: view.value,
  followUp: followUp.value,
  groupBy: groupBy.value,
  viewName: viewName.value,
  columns: activeCols.value,
}))
watch(
  listContext,
  (context) => {
    try {
      sessionStorage.setItem(QUEUE_KEY, JSON.stringify(context))
    } catch {
      /* a full or blocked session store must not break the list */
    }
  },
  { deep: true },
)
// A drill-down (Hoy's queue, a report, an Avisos digest) is this tab's context
// from the first render: kept now, so opening a deal and coming back finds the
// same list even when nothing was changed in between.
if (
  typeof route.query.follow_up === 'string' ||
  ['pipeline', 'avisos'].includes(route.query.report)
) {
  try {
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(listContext.value))
  } catch {
    /* no session store: the drill-down simply lasts this visit */
  }
}

const deals = createListResource({
  doctype: 'CRM Deal',
  fields: [
    'name',
    'deal_name',
    'organization',
    'lead_name',
    'mobile_no',
    'email',
    'status',
    'pipeline',
    'source',
    'deal_owner',
    'deal_value',
    'currency',
    'exchange_rate',
    'modified',
    'creation',
    'expected_deal_value',
    'expected_closure_date',
    'probability',
    'next_activity_task',
    'next_activity_at',
    'next_activity_title',
    'next_activity_type',
    '_user_tags',
  ],
  orderBy: 'modified desc',
  // Back from a deal: load as many rows as were loaded, so its row is there.
  pageLength:
    remembered.view === 'board'
      ? 200
      : listReturnPageLength(readListReturn(sessionStorage, RETURN_KEY)),
  onSuccess: () => loadDisplay(),
})
// A teammate's new or changed deal shows without a reload; new rows get a short highlight.
const live = useLiveList('CRM Deal', async () => {
  const before = (deals.data || []).map((r) => r.name)
  await deals.reload()
  live.mark(
    before,
    (deals.data || []).map((r) => r.name),
  )
})
// Sorting by next activity can't be expressed server-side: frappe-ui has no
// `ifnull(next_activity_at, '9999-12-31')`, and plain `asc` would float every
// deal with NOTHING scheduled to the top. So the query asks for `desc` (MariaDB
// puts NULLs last there) and the loaded page is re-ordered here, nulls last.
const rows = computed(() => {
  const data = deals.data || []
  if (sort.value.field !== 'next_activity_at') return data
  const dir = sort.value.dir === 'desc' ? -1 : 1
  const scheduled = data.filter((r) => r.next_activity_at)
  const unscheduled = data.filter((r) => !r.next_activity_at)
  scheduled.sort(
    (a, b) =>
      dir *
      String(a.next_activity_at).localeCompare(String(b.next_activity_at)),
  )
  return [...scheduled, ...unscheduled]
})

// ── display enrichment (cliente / teléfono / equipo / RO) ─────────────────────
// Not on the deal row: identity lives on the linked Contact and the repair is a
// taller Repair Order. One batched call per loaded page fills them; the table
// renders immediately and fills in when it lands (never blocks the list).
const display = ref({})
const displayPending = new Set()
// The board loads 200 deals: ask in pages of 50 side by side, so each answer
// stays fast and the cards fill in as each page lands.
const DISPLAY_PAGE = 50
function loadDisplay() {
  const names = (deals.data || [])
    .map((d) => d.name)
    .filter((n) => !(n in display.value) && !displayPending.has(n))
  const pages = []
  for (let i = 0; i < names.length; i += DISPLAY_PAGE)
    pages.push(names.slice(i, i + DISPLAY_PAGE))
  return Promise.all(pages.map(loadDisplayPage))
}
async function loadDisplayPage(names) {
  names.forEach((n) => displayPending.add(n))
  try {
    const data = await frappeCall('doco_marketing.api.deals.get_deal_display', {
      names: JSON.stringify(names),
    })
    display.value = { ...display.value, ...(data || {}) }
  } catch (e) {
    /* enrichment is additive — a failure leaves the base columns intact */
  } finally {
    names.forEach((n) => displayPending.delete(n))
  }
}
function extra(r) {
  return display.value[r.name] || {}
}
function customerOf(r) {
  return extra(r).customer_name || r.lead_name || ''
}
function phoneOf(r) {
  return extra(r).mobile_no || r.mobile_no || ''
}
function deviceOf(r) {
  return extra(r).device || ''
}
function repairTypeOf(r) {
  return extra(r).repair_type || ''
}
// Repair-order status hue: delivered/cancelled read as done, waiting states amber,
// in-shop states blue. Keeps the column scannable without a legend.
const REPAIR_CHIP = {
  Recibido: '#2563eb',
  'En Trabajo': '#2563eb',
  'Esperando Cliente': '#d97706',
  'Esperando Pieza': '#d97706',
  'Listo para Entregar': '#16a34a',
  Entregado: '#6b7280',
  Cancelado: '#dc2626',
}

// ── mobile shell ─────────────────────────────────────────────────────────────
// Phone search panel (ui/SearchPanel) and the deals opened lately on this device.
const searchOpen = ref(false)
const recentDeals = useRecentPicks('muelle:deals-recent')
// What the shop reads aloud under the name: the stage, then the equipo or
// the phone (never the deal's id, never the title twice).
function phoneLine(r) {
  const title = cardTitle(r)
  const reach = [deviceOf(r), phoneOf(r) && formatPhone(phoneOf(r))].find(
    (part) => part && part !== title,
  )
  return [r.status && stageLabel(r.status), reach].filter(Boolean).join(' · ')
}
// The table's second line: the customer when the deal has its own title,
// else how to reach them.
function secondLine(r) {
  const title = cardTitle(r)
  const customer = customerOf(r)
  if (customer && customer !== title) return customer
  const phone = phoneOf(r) && formatPhone(phoneOf(r))
  return phone && phone !== title ? phone : deviceOf(r) || ''
}
// The row's figure: the deal's amount, nothing when it has none.
function amountOf(r) {
  const value = displayValue(r, getDealStatus(r.status))
  return Number(value) ? formatMXN(value, r.currency) : ''
}
// A stage's colour as a dot beside its name (the statuses store holds an ink
// class, `!text-green-700`, not a hex: dotBinding paints either).
function stageDot(status) {
  return dotBinding(getDealStatus(status)?.color || 'text-ink-gray-5')
}
// The phone row's trailing words: the next step when there is one (red when
// late), else how long since the deal last changed, as Prospectos does.
function followUpOverdue(r) {
  return Boolean(
    r.next_activity_at &&
      String(r.next_activity_at).slice(0, 10) < siteToday.value,
  )
}
function followUpWords(r) {
  if (r.next_activity_at) return relativeDay(r.next_activity_at)
  if (r.next_activity_task) return __('Sin fecha')
  return relativeTime(r.modified)
}
// «Hoy», «Mañana», «Ayer», «hace 3 días», «en 3 días» for a due date.
function relativeDay(value) {
  const day = String(value).slice(0, 10)
  const days = dayjs(day).diff(dayjs(siteToday.value), 'day')
  if (days === 0) return __('Hoy')
  if (days === 1) return __('Mañana')
  if (days === -1) return __('Ayer')
  return days < 0 ? __('hace {0} días', [-days]) : __('en {0} días', [days])
}
// The phone's «⋯» beside the search pill: the layouts, then the rest.
const mobileMenu = computed(() => [
  ...views.map((v) => ({
    label: v.key === view.value ? `${v.label} ✓` : v.label,
    onClick: () => selectView(v),
  })),
  ...viewMenu.value,
  { label: __('Exportar a Excel'), onClick: exportDeals },
])
const followUpOptions = computed(() =>
  followUpQueues.map((q) => ({
    value: q.key,
    label: __(q.label),
    count: q.key !== 'all' ? queueCounts.value[q.key] : null,
    title: __(q.description),
  })),
)
const pipelineOptions = computed(() =>
  (pipelines.data || []).map((pipeline) => ({
    value: pipeline.name,
    label:
      pipelineLabel(pipeline) +
      (pipeline.archived ? ' · ' + __('Archived') : ''),
  })),
)
const drillSections = computed(() =>
  [
    {
      key: 'status',
      label: __('Stage'),
      options: stageOptions.value,
      ref_: statusF,
    },
    {
      key: 'source',
      label: __('Source'),
      options: sourceOptions.value,
      ref_: sourceF,
    },
    {
      key: 'owner',
      label: __('Owner'),
      options: ownerOptions.value,
      ref_: ownerF,
    },
  ].map(({ ref_, ...sec }) => ({
    ...sec,
    selected: ref_.value,
    toggle: (v) => {
      ref_.value = ref_.value.includes(v)
        ? ref_.value.filter((x) => x !== v)
        : [...ref_.value, v]
    },
  })),
)
// Closed panel: what narrows the list, each with its own ×.
const activeChips = computed(() => [
  ...(followUp.value !== 'all'
    ? [
        {
          key: 'follow-up',
          label: followUpOptions.value.find((q) => q.value === followUp.value)
            ?.label,
          remove: () => selectFollowUp('all'),
        },
      ]
    : []),
  ...(pipelineF.value
    ? [
        {
          key: 'pipeline',
          label:
            pipelineOptions.value.find((o) => o.value === pipelineF.value)
              ?.label || pipelineF.value,
          remove: () => (pipelineF.value = ''),
        },
      ]
    : []),
  ...chips.value.map((c) => ({ ...c, remove: () => removeChip(c) })),
])
// The title's count: the server's total under these filters; until it
// arrives, what is loaded («50+»), never «0» while it reads.
const count = computed(() => {
  if (countsLoaded.value)
    return String(
      Object.values(groupCounts.value).reduce(
        (n, stage) => n + Number(stage.count || 0),
        0,
      ),
    )
  if (!deals.data) return ''
  return `${deals.data.length}${deals.hasNextPage ? '+' : ''}`
})
// The desktop header: the queues as the tab row, each with its count; the
// layouts beside them; what the open queue holds under the title.
const queueTabs = computed(() =>
  followUpQueues.map((q) => ({
    value: q.key,
    label: __(q.label),
    count: q.key !== 'all' ? queueCounts.value[q.key] : undefined,
  })),
)
const layoutTabs = computed(() =>
  views.map((v) => ({ value: v.key, label: v.label })),
)
const queueDescription = computed(() =>
  __(followUpQueues.find((q) => q.key === followUp.value)?.description || ''),
)
// The header's controls: one island of icons, one filled button (Compras).
const ISLAND_ICON =
  'press flex size-9 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-3 hover:text-ink-gray-9'
const BTN_FILLED =
  'inline-flex h-10 items-center gap-2 rounded-full bg-surface-gray-10 px-4 text-sm font-medium text-ink-base hover:bg-surface-gray-9 disabled:opacity-50'

const SEARCH_FIELDS = [
  'deal_name',
  'organization',
  'lead_name',
  'email',
  'mobile_no',
]
// Today in the SITE's timezone. The queues and the inline follow-up cut the day
// on the same boundary the server does, never on the browser's.
function siteDay() {
  const timezone =
    getConfig('systemTimezone') ||
    Intl.DateTimeFormat().resolvedOptions().timeZone
  return dayjs().tz(timezone).format('YYYY-MM-DD')
}
const siteToday = ref(siteDay())
function closedStatuses() {
  return (statusStore.dealStatuses.data || [])
    .filter((s) => ['Won', 'Lost'].includes(s.type))
    .map((s) => s.name)
}
function buildFilters(queue = followUp.value) {
  siteToday.value = siteDay()
  const today = siteToday.value
  const f = followUpFilters(queue, today, closedStatuses())
  if (createdFrom.value) f.push(['creation', '>=', createdFrom.value])
  if (createdTo.value)
    f.push([
      'creation',
      '<',
      dayjs(createdTo.value).add(1, 'day').format('YYYY-MM-DD'),
    ])
  if (pipelineF.value) f.push(['pipeline', '=', pipelineF.value])
  if (statusF.value.length) f.push(['status', 'in', statusF.value])
  if (sourceF.value.length) f.push(['source', 'in', sourceF.value])
  if (ownerF.value.length) f.push(['deal_owner', 'in', ownerF.value])
  if (dealsF.value.length) f.push(['name', 'in', dealsF.value])
  return f
}
function searchOrFilters() {
  const q = search.value.trim()
  if (!q) return {}
  const pat = `%${q}%`
  const orf = {}
  for (const fld of SEARCH_FIELDS) orf[fld] = ['LIKE', pat]
  return orf
}
// The filter watcher fires several times while a page opens (remembered state,
// the pipeline reset, the stage store arriving) with the same query: one load.
let appliedQuery = null
function applyFilters({ force = false } = {}) {
  const filters = buildFilters()
  const orFilters = searchOrFilters()
  // see `rows`: next-activity order is finished client-side, the server only has
  // to hand us the scheduled ones first
  const orderBy =
    sort.value.field === 'next_activity_at' &&
    !['overdue', 'today'].includes(followUp.value)
      ? 'next_activity_at desc'
      : `${sort.value.field} ${sort.value.dir}`
  const query = JSON.stringify([filters, orFilters, orderBy])
  if (!force && query === appliedQuery && !deals.error) return
  appliedQuery = query
  deals.filters = filters
  deals.orFilters = orFilters
  deals.orderBy = orderBy
  deals.reload()
  loadCounts()
}

// Totals cover all matching records, using each deal's value, probability and FX.
const metricsCurrency = ref(null)
// metric contract v2: base currency and the tenant's outlier threshold
const metricsContract = ref(null)
const metricsError = ref(false)
async function loadCounts() {
  const request = ++countsRequest
  countsLoaded.value = false
  metricsError.value = false
  try {
    const data = await frappeCall('crm.api.doc.aggregate_deal_metrics', {
      filters: buildFilters(),
      or_filters: searchOrFilters(),
    })
    if (request !== countsRequest) return
    groupCounts.value = Object.fromEntries(
      (data.stages || []).map((entry) => [entry.status || '', entry]),
    )
    metricsCurrency.value = data.currency
    metricsContract.value = data.contract || null
    countsLoaded.value = true
    loadQueueCounts()
  } catch {
    if (request !== countsRequest) return
    groupCounts.value = {}
    metricsError.value = true
  }
}
// How many deals each follow-up queue holds under the current filters: one
// call, the same filters the rows use, so «Sin seguimiento 37» is what opens.
const queueCounts = ref({})
let queueRequest = 0
async function loadQueueCounts() {
  const request = ++queueRequest
  const today = siteToday.value
  const queues = Object.fromEntries(
    followUpQueues
      .filter((q) => q.key !== 'all')
      .map((q) => [q.key, followUpFilters(q.key, today, closedStatuses())]),
  )
  try {
    const counts = await frappeCall('crm.api.next_step.queue_counts', {
      base: buildFilters('all'),
      queues,
      or_filters: searchOrFilters(),
    })
    if (request === queueRequest) queueCounts.value = counts || {}
  } catch {
    if (request === queueRequest) queueCounts.value = {}
  }
}

function columnValue(stage) {
  return stageValue(groupCounts.value[stage.value])
}
function columnWeighted(stage) {
  return weightedTotal(groupCounts.value, [stage])
}

function selectView(v) {
  if (v.to) {
    router.push(v.to)
    return
  }
  view.value = v.key
  if (v.key === 'board' && deals.pageLength < 200) {
    deals.pageLength = 200
    deals.reload()
  }
  if (v.key !== 'list') loadCounts()
}

// Board drop = stage change with the same rules as Deal 360 (S1.4): a Lost
// stage asks for its reason first, a guarded stage (auto-WhatsApp) asks to
// confirm, and the server's pipeline rules (allowed stages, required fields)
// answer in the toast.
const lostDrop = ref(null) // { row, status } while a Lost drop waits for its reason
const lostSaving = ref(false)
const lostError = ref('')
function onBoardChange(row, status) {
  const move = stageMove(boardColumns.value, status)
  if (move === 'lost') {
    lostError.value = ''
    lostDrop.value = { row, status }
    return
  }
  guardStatusChange(status, () => moveDeal(row, { status })).catch(() => {})
}
async function moveDeal(row, values) {
  try {
    await frappeCall('frappe.client.set_value', {
      doctype: 'CRM Deal',
      name: row.name,
      fieldname: values,
    })
  } catch (e) {
    const message = errorText(e, __('No se pudo cambiar la etapa'))
    toast.error(message)
    throw new Error(message, { cause: e })
  }
  Object.assign(row, values)
  toast.success(__('Etapa actualizada'))
  loadCounts()
  // S2.2: an open deal always gets its next dated step (skipped for Won/Lost).
  if (stageMove(boardColumns.value, values.status) === 'flow')
    requestNextStep({ deal: row.name, reason: 'stage' })
}
async function confirmLostDrop(reason, notes) {
  const pending = lostDrop.value
  if (!pending) return
  lostSaving.value = true
  try {
    await moveDeal(pending.row, {
      status: pending.status,
      lost_reason: reason,
      lost_notes: notes || '',
    })
    lostDrop.value = null
  } catch (e) {
    lostError.value = errorText(e, __('No se pudo cambiar la etapa'))
  } finally {
    lostSaving.value = false
  }
}

function exportDeals() {
  const fields = JSON.stringify([
    'name',
    'organization',
    'lead_name',
    'status',
    'source',
    'deal_owner',
    'deal_value',
    'mobile_no',
    'creation',
    // repair columns exist only where taller is installed — asking for them on a
    // retail tenant would fail the whole export
    ...(hasTaller.value ? ['repair_device', 'repair_type'] : []),
  ])
  const filters = JSON.stringify(buildFilters())
  const orFilters = JSON.stringify(searchOrFilters())
  const order_by = `${sort.value.field} ${sort.value.dir}`
  const url =
    `/api/method/frappe.desk.reportview.export_query?file_format_type=Excel&title=CRM Deal&doctype=CRM Deal` +
    `&fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&or_filters=${encodeURIComponent(orFilters)}` +
    `&order_by=${encodeURIComponent(order_by)}&page_length=100000&start=0&view=Report&with_comment_count=0`
  window.location.href = url
}

// ── saved views ───────────────────────────────────────────────────────────────
// Shared views are "CRM View Settings" rows owned by SavedViewPicker. The views
// this list used to keep in localStorage stay readable there so nobody loses a
// filter set; nothing new is written to them.
const VIEWS_KEY = userScopedKey('doco_deals_saved_views')
const savedViews = ref(loadViews())
function loadViews() {
  try {
    return JSON.parse(window.localStorage.getItem(VIEWS_KEY) || '[]')
  } catch {
    return []
  }
}
// Restores a stored context. What a context does not carry (a browser view has
// no list/board mode or grouping) keeps whatever the worker is looking at.
function applyViewContext(context = {}) {
  const state = dealListState({
    view: view.value,
    groupBy: groupBy.value,
    ...context,
  })
  followUp.value = state.followUp
  pipelineF.value = state.pipeline || ''
  createdFrom.value = state.createdFrom || ''
  createdTo.value = state.createdTo || ''
  statusF.value = [...state.status]
  sourceF.value = [...state.source]
  ownerF.value = [...state.owner]
  dealsF.value = [...state.deals]
  search.value = state.search
  sort.value = { ...state.sort }
  view.value = state.view
  groupBy.value = state.groupBy
  const cols = (context.columns || []).filter((k) => k in COL_WIDTH)
  viewCols.value = cols.length ? cols : null
  applyFilters()
}
function applyView(v) {
  viewName.value = ''
  applyViewContext(v)
}
function deleteView(label) {
  savedViews.value = savedViews.value.filter((v) => v.label !== label)
  window.localStorage.setItem(VIEWS_KEY, JSON.stringify(savedViews.value))
  toast.success(__('Vista eliminada'))
}
// The worker's default view opens the list on a fresh session only: coming back
// from a deal must land on the context they left.
function onDefaultView({ name, context }) {
  if (hadRemembered || viewName.value) return
  viewName.value = name
  // ?layout=board asked for the board: the view's filters apply on it.
  applyViewContext(linkLayout ? { ...context, view: linkLayout } : context)
  if (linkLayout === 'board' && deals.pageLength < 200) {
    deals.pageLength = 200
    deals.reload()
  }
}
watch(viewName, (name) => {
  if (!name) viewCols.value = null
})
const viewMenu = computed(() => [
  {
    label: __('Ver en la agenda'),
    onClick: () => router.push('/agenda'),
  },
  {
    label: __('Vista clásica (todos los filtros)'),
    onClick: () =>
      router.push({ path: '/deals/view', query: { classic: '1' } }),
  },
])

// ── group by ──────────────────────────────────────────────────────────────────
// Only the stage groups carry the server's filtered count; the others are
// counted off the loaded rows, and the header says so (DealGroupHeader).
const grouped = computed(
  () => view.value === 'list' && !isMobile.value && isGroupBy(groupBy.value),
)
const GROUP_EMPTY = {
  status: 'Sin etapa',
  deal_owner: 'Sin responsable',
  repair_status: 'Sin reparación',
}
const groupEmptyLabel = computed(
  () => GROUP_EMPTY[groupBy.value] || 'Sin valor',
)
const groupByMenu = computed(() =>
  DEAL_GROUP_BYS.filter(
    (g) => g.key !== 'repair_status' || hasTaller.value,
  ).map((g) => ({
    label: (g.key === groupBy.value ? '✓ ' : '') + __(g.label),
    onClick: () => (groupBy.value = g.key),
  })),
)
const renderGroups = computed(() => {
  if (!grouped.value)
    return [
      {
        key: '',
        label: '',
        count: rows.value.length,
        exact: true,
        rows: rows.value,
      },
    ]
  return groupRows(rows.value, groupBy.value, {
    order: stageOptions.value.map((s) => s.value),
    counts:
      groupBy.value === 'status' && countsLoaded.value
        ? groupCounts.value
        : null,
    complete: !deals.hasNextPage,
    groupValue: (r) =>
      groupBy.value === 'repair_status'
        ? extra(r).repair_status || ''
        : r[groupBy.value] || '',
    labelOf: (value) =>
      groupBy.value === 'deal_owner'
        ? ownerName(value)
        : groupBy.value === 'status'
          ? stageLabel(value)
          : value,
  })
})
function groupColor(key) {
  if (!key) return ''
  if (groupBy.value === 'status') return getDealStatus(key)?.color || ''
  if (groupBy.value === 'repair_status') return REPAIR_CHIP[key] || ''
  return ''
}
function toggleGroup(key) {
  collapsed.value = { ...collapsed.value, [key]: !collapsed.value[key] }
}
watch(groupBy, () => (collapsed.value = {}))

// A follow-up written from the row: the crm/pipeline hooks derived these fields
// from the task, so the row takes them as they came back instead of reloading,
// and the filtered totals and the work queue are asked again.
function onFollowUpSaved(row, activity) {
  Object.assign(row, activity)
  loadCounts()
  reloadQueue()
}

// n · p · r · h on the focused row act on that deal's next step; the row takes
// the saved step in place, so the seller keeps their position in the queue.
registerPageShortcuts(null, NEXT_STEP_SHORTCUTS)
function onRowKey(event, row) {
  // Rows, Enter and selection answer through the shell's list keys (useListKeys);
  // the next-step keys are this list's own. n with several selected schedules them all.
  if (event.target !== event.currentTarget) return
  const action = nextStepAction(event)
  if (!action) return
  event.preventDefault()
  if (action === 'schedule' && selectedRows.value.length > 1) bulkSchedule()
  else runNextStep(action, row.name)
}
function bulkSchedule() {
  if (!selectedRows.value.length) return
  openBulkNextStep([...selectedRows.value], {
    onDone: () => {
      selectedRows.value = []
      loadQueueCounts()
    },
  })
}
watch(nextStepChanged, (change) => {
  const row = (deals.data || []).find((r) => r.name === change?.deal)
  if (row) onFollowUpSaved(row, rowNextStep(change.state))
})

let _t = null
function onSearch(v) {
  search.value = v
  clearTimeout(_t)
  _t = setTimeout(applyFilters, 300)
}
function selectFollowUp(key) {
  if (['overdue', 'today'].includes(key))
    sort.value = { field: 'next_activity_at', dir: 'asc' }
  followUp.value = key
}
function sortBy(field) {
  const dir =
    sort.value.field === field && sort.value.dir === 'desc' ? 'asc' : 'desc'
  sort.value = { field, dir }
  applyFilters()
}
function sortArrow(field) {
  if (sort.value.field !== field) return ''
  return sort.value.dir === 'desc' ? ' ↓' : ' ↑'
}
applyFilters()

// ── filter options ────────────────────────────────────────────────────────────
// Stages come from the shared store's VISIBLE list: the taxonomy is seeded in two
// languages and the inactive twin is marked hidden, so a board built from the raw
// table would show every stage twice.
const stageOptions = computed(() =>
  scopedStages.value.map((s) => ({
    value: s.name,
    label: stageLabel(s.name),
    color: getDealStatus(s.name)?.color || s.color,
    probability: s.probability,
    type: s.type,
  })),
)
const boardColumns = computed(() =>
  boardStages(
    stageOptions.value,
    pipelines.data,
    pipelineF.value,
    groupCounts.value,
  ),
)
watch(pipelineF, () => {
  statusF.value = []
})
const sources = createListResource({
  doctype: 'CRM Lead Source',
  fields: ['name'],
  pageLength: 50,
  auto: true,
})
const sourceOptions = computed(() =>
  (sources.data || []).map((s) => ({ value: s.name, label: __(s.name) })),
)
const ownerOptions = computed(() =>
  (usersList.data?.crmUsers || [])
    .filter((u) => u.enabled)
    .map((u) => ({ value: u.name, label: u.full_name?.trim() || u.name })),
)

// ── chips ──────────────────────────────────────────────────────────────────────
const chips = computed(() => {
  const out = []
  if (createdFrom.value || createdTo.value)
    out.push({
      key: 'creation-period',
      type: 'period',
      label: `${__('Created')}: ${createdFrom.value || '…'} → ${createdTo.value || '…'}`,
    })
  for (const v of statusF.value)
    out.push({ key: `st:${v}`, type: 'status', value: v, label: stageLabel(v) })
  for (const v of sourceF.value)
    out.push({ key: `sr:${v}`, type: 'source', value: v, label: __(v) })
  for (const v of ownerF.value)
    out.push({ key: `ow:${v}`, type: 'owner', value: v, label: ownerName(v) })
  if (dealsF.value.length)
    out.push({
      key: 'avisos-deals',
      type: 'deals',
      label: __('{0} deals named by an aviso', [dealsF.value.length]),
    })
  return out
})
function removeChip(c) {
  if (c.type === 'period') {
    createdFrom.value = ''
    createdTo.value = ''
    return
  }
  if (c.type === 'deals') {
    dealsF.value = []
    return
  }
  const ref_ = { status: statusF, source: sourceF, owner: ownerF }[c.type]
  ref_.value = ref_.value.filter((x) => x !== c.value)
}
// «Limpiar» clears everything that narrows the list, the pipeline included
// (its chip used to stay behind); the search stays, it has its own ×.
function clearAll() {
  pipelineF.value = ''
  createdFrom.value = ''
  createdTo.value = ''
  followUp.value = 'all'
  statusF.value = []
  sourceF.value = []
  ownerF.value = []
  dealsF.value = []
}
watch(
  [
    pipelineF,
    statusF,
    sourceF,
    ownerF,
    dealsF,
    followUp,
    createdFrom,
    createdTo,
    () => statusStore.dealStatuses.data,
  ],
  applyFilters,
  { deep: true },
)

// ── view helpers ────────────────────────────────────────────────────────────────
const views = [
  { key: 'list', label: __('Lista') },
  { key: 'board', label: __('Tablero') },
  { key: 'funnel', label: __('Embudo') },
]
function ownerName(email) {
  return getUser(email)?.full_name || email
}
function formatMXN(v, currency = metricsCurrency.value) {
  if (v == null || v === '') return '—'
  const n = Number(v) || 0
  if (!n) return '—'
  return money(n, currency || metricsCurrency.value)
}
// «jue 15 de oct», as the other queues write a day (never the browser's
// locale: the shell page is lang="en").
function formatDate(v) {
  return v ? formatDay(v) : ''
}
// Card headline: the deal's own title when the tenant has one, else the customer,
// else whatever identifies the row. RO-generated deals have no title, which is why
// the upstream kanban reads "No Title".
// A card is named for the customer or the deal, never its ID («CRM-DEAL-…»).
function cardTitle(r) {
  const name =
    r.deal_name || customerOf(r) || r.organization || r.lead_name || r.name
  if (name && !looksLikeId(name)) return name
  return (
    deviceOf(r) ||
    (phoneOf(r) && formatPhone(phoneOf(r))) ||
    __('Trato sin cliente')
  )
}
// Local on purpose: importing utils/display adds a chunk to /crm/deals, which
// sits at its 60-file budget.
const looksLikeId = (text) => /^[A-Z]{2,}(-[A-Z]+)*-\d/.test(String(text || ''))
// «hace 3 h», «hace 2 días» from a server datetime.
function relativeTime(value) {
  const then = new Date(String(value || '').replace(' ', 'T')).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (minutes < 60)
    return minutes <= 1 ? __('hace 1 min') : __('hace {0} min', [minutes])
  const hours = Math.round(minutes / 60)
  if (hours < 24) return __('hace {0} h', [hours])
  const days = Math.round(hours / 24)
  return days === 1 ? __('hace 1 día') : __('hace {0} días', [days])
}
// «Listo para Entregar» → «Listo para entregar» (sentence case).
function sentenceCase(text) {
  const value = String(text || '')
  return value.charAt(0) + value.slice(1).toLowerCase()
}
function probabilityOf(r) {
  const policy = (pipelines.data || []).find(
    (pipeline) => pipeline.name === r.pipeline,
  )
  const stage = policy?.stages?.find((stage) => stage.name === r.status)
  return dealProbability(r, stage || getDealStatus(r.status))
}
// "_user_tags" arrives as ",uno,dos" — two is all a 260px card can carry.
function tagsOf(r) {
  return String(r._user_tags || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 2)
}

// ── selection + rows ─────────────────────────────────────────────────────────────
const allSelected = computed(
  () =>
    rows.value.length > 0 && selectedRows.value.length === rows.value.length,
)
function toggleAll() {
  selectedRows.value = allSelected.value ? [] : rows.value.map((r) => r.name)
}
function toggleRow(name) {
  selectedRows.value = selectedRows.value.includes(name)
    ? selectedRows.value.filter((n) => n !== name)
    : [...selectedRows.value, name]
}
// The way back keeps the seller's place: the row they opened, how far the
// list was scrolled and how many pages were loaded (filters live in QUEUE_KEY).
function openDeal(name) {
  const row = rows.value.find((r) => r.name === name)
  if (row)
    recentDeals.touch({ name, doctype: 'CRM Deal', label: cardTitle(row) })
  searchOpen.value = false
  lastOpened.value = name
  writeListReturn(sessionStorage, RETURN_KEY, {
    deal: name,
    scrollTop: listScroller.value?.scrollTop || 0,
    loaded: (deals.data || []).length,
  })
  router.push({ name: 'Deal 360', params: { dealId: name } })
}
const pendingReturn = readListReturn(sessionStorage, RETURN_KEY)
// Back from a deal: once its row is rendered, the list scrolls where it was and
// that row has the focus. The rows may already be there when this view mounts
// (the list keeps its data), so this runs right away and after every render.
function restoreReturn() {
  if (!pendingReturn.deal) return
  const scroller = listScroller.value
  if (!scroller) return
  const row = scroller.querySelector(
    `[data-deal="${CSS.escape(pendingReturn.deal)}"]`,
  )
  // Not on the page yet: wait for the load; once it is done, keep the scroll only.
  if (!row && (deals.loading || !deals.data)) return
  scroller.scrollTop = pendingReturn.scrollTop
  row?.focus({ preventScroll: true })
  pendingReturn.deal = ''
  sessionStorage.removeItem(RETURN_KEY)
}
watch(
  () => [deals.data, deals.loading, listScroller.value],
  () => nextTick(restoreReturn),
  { immediate: true, flush: 'post' },
)
function rowMenu(r) {
  return [
    { label: __('Abrir'), onClick: () => openDeal(r.name) },
    { label: __('Eliminar'), onClick: () => deleteDeal(r.name) },
  ]
}
function deleteDeal(name) {
  confirmDialog({
    title: __('Eliminar trato'),
    message: __('¿Eliminar este trato?'),
    confirmLabel: __('Eliminar'),
    onConfirm: async () => {
      await frappeCall('frappe.client.delete', { doctype: 'CRM Deal', name })
      toast.success(__('Trato eliminado'))
      deals.reload()
    },
  })
}
function bulkDelete() {
  confirmDialog({
    title: __('Eliminar tratos'),
    message: __('¿Eliminar {0} tratos?', [selectedRows.value.length]),
    confirmLabel: __('Eliminar'),
    onConfirm: async () => {
      const results = await Promise.allSettled(
        selectedRows.value.map((name) =>
          frappeCall('frappe.client.delete', { doctype: 'CRM Deal', name }),
        ),
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed) toast.error(__('{0} fallaron', [failed]))
      else toast.success(__('Tratos eliminados'))
      selectedRows.value = []
      deals.reload()
    },
  })
}
</script>
