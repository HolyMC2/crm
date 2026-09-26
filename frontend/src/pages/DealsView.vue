<!--
  Deals list — doco redesign, mirror of LeadsView for CRM Deal. Dense table +
  Status/Source/Owner filters + live search + List/Board/Funnel (inline, 1-click)
  + bulk select + New Deal modal. "Vista clásica" jumps to the upstream
  /deals/view (full filters on every field / group-by). New page; upstream
  Deals.vue untouched for rebase-cleanliness. Data via createListResource.
-->
<template>
  <div class="flex min-h-0 w-full flex-1 flex-col bg-surface-base">
    <!-- ── mobile toolbar ──────────────────────────────────────────────────
         The desktop bar wrapped into three rows at 390px and pushed Export /
         New Deal off-screen. Phone shape: title + overflow menu, a full-width
         search, then ONE scrollable pill row (vistas + Filtros). Creating a
         deal moves to the FAB, where a thumb reaches it. -->
    <div v-if="isMobile" class="flex-none border-b border-outline-gray-1">
      <div class="flex items-center gap-2 px-3.5 pb-1.5 pt-2.5">
        <span class="text-[16px] font-bold text-ink-gray-9">{{
          __('Tratos')
        }}</span>
        <span
          class="rounded-full bg-surface-gray-2 px-2 py-0.5 text-[11px] font-semibold text-ink-gray-6"
          >{{ count }}</span
        >
        <div class="flex-1" />
        <Dropdown :options="mobileMenu">
          <button
            class="press flex h-9 w-9 items-center justify-center rounded-full text-[16px] text-ink-gray-5"
            :aria-label="__('Más opciones')"
          >
            ⋯
          </button>
        </Dropdown>
      </div>
      <div class="px-3.5 pb-2">
        <div
          class="flex h-10 items-center gap-2 rounded-[10px] border border-outline-gray-2 px-3 focus-within:border-outline-gray-4"
        >
          <LucideSearch class="h-4 w-4 flex-none text-ink-gray-4" />
          <input
            :value="search"
            :aria-label="__('Buscar tratos')"
            :placeholder="__('Buscar cliente, equipo…')"
            class="w-full border-0 bg-transparent text-[14px] text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
            @input="onSearch($event.target.value)"
          />
          <button
            v-if="search"
            class="press flex-none text-[13px] text-ink-gray-4"
            :aria-label="__('Limpiar')"
            @click="onSearch('')"
          >
            ✕
          </button>
        </div>
      </div>
      <div class="scb flex gap-1.5 overflow-x-auto px-3.5 pb-2">
        <button
          v-for="v in views"
          :key="v.key"
          class="press flex-none whitespace-nowrap rounded-full px-3 py-[6px] text-[12px] font-semibold"
          :class="
            v.key === view
              ? 'bg-surface-gray-7 text-white'
              : 'bg-surface-gray-2 text-ink-gray-7'
          "
          :aria-pressed="v.key === view"
          @click="selectView(v)"
        >
          {{ v.label }}
        </button>
        <span class="my-1 w-px flex-none bg-outline-gray-2" />
        <button
          class="press flex-none whitespace-nowrap rounded-full px-3 py-[6px] text-[12px] font-semibold"
          :class="
            chips.length
              ? 'bg-surface-green-2 text-ink-green-8'
              : 'bg-surface-gray-2 text-ink-gray-7'
          "
          @click="showFilterSheet = true"
        >
          {{ __('Filtros')
          }}<span v-if="chips.length"> · {{ chips.length }}</span>
        </button>
      </div>
    </div>

    <div
      class="flex flex-wrap items-center gap-2 border-b border-outline-gray-1 px-4 py-2"
    >
      <label for="deal-pipeline" class="text-sm text-ink-gray-6">{{
        __('Sales pipeline')
      }}</label>
      <select
        id="deal-pipeline"
        v-model="pipelineF"
        class="min-h-11 max-w-full rounded border border-outline-gray-2 bg-surface-base px-3 text-sm"
      >
        <option value="">{{ __('All pipelines') }}</option>
        <option
          v-for="pipeline in pipelines.data || []"
          :key="pipeline.name"
          :value="pipeline.name"
        >
          {{ pipeline.pipeline_name
          }}{{ pipeline.archived ? ' · ' + __('Archived') : '' }}
        </option>
      </select>
      <span
        v-if="pipelines.error"
        role="alert"
        class="text-sm text-ink-red-5"
        >{{ __('Pipelines could not load') }}</span
      >
    </div>
    <!-- toolbar -->
    <div
      v-if="!isMobile"
      class="flex min-h-[52px] flex-none flex-wrap items-center justify-between gap-y-1.5 border-b border-outline-gray-1 px-5 py-1.5"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-[15px] font-bold text-ink-gray-9">{{
          __('Tratos')
        }}</span>
        <span
          class="rounded-full px-[9px] py-0.5 text-[11.5px] font-semibold text-ink-gray-6"
          style="background: #f1f2f4"
        >
          {{ count }}
        </span>
        <div class="mx-1 h-[18px] w-px" style="background: #e4e7ec" />
        <div
          class="flex overflow-hidden rounded-lg border border-outline-gray-2"
        >
          <button
            v-for="(v, i) in views"
            :key="v.key"
            class="inline-flex items-center gap-1 px-[11px] py-[5px] text-[12px]"
            :class="i ? 'border-l border-outline-gray-2' : ''"
            :style="
              v.key === view
                ? 'background:#1c2230;color:#fff;font-weight:600'
                : 'background:#fff;color:#5b6472'
            "
            :aria-pressed="v.key === view"
            @click="selectView(v)"
          >
            {{ v.label }}
          </button>
        </div>
        <div class="mx-1 h-[18px] w-px" style="background: #e4e7ec" />
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
      </div>
      <div class="flex items-center gap-2">
        <div
          class="flex items-center gap-1.5 rounded-lg border border-outline-gray-2 px-2.5 py-1.5 focus-within:border-outline-gray-4 focus-within:ring-1 focus-within:ring-outline-gray-3"
        >
          <LucideSearch class="h-3.5 w-3.5 text-ink-gray-4" />
          <input
            :value="search"
            :aria-label="__('Buscar tratos')"
            :placeholder="__('Buscar tratos…')"
            class="w-[140px] border-0 bg-transparent text-[12px] text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
            @input="onSearch($event.target.value)"
          />
        </div>
        <Dropdown v-if="view === 'list'" :options="groupByMenu">
          <button
            class="rounded-lg border px-3 py-[7px] text-[12px] font-medium"
            :class="
              grouped
                ? 'border-outline-green-3 bg-surface-green-2 text-ink-green-8'
                : 'border-outline-gray-2 text-ink-gray-7'
            "
          >
            {{ __('Agrupar')
            }}<span v-if="grouped"> · {{ __(groupByLabel(groupBy)) }}</span> ⌄
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
        <ColumnPicker
          v-if="view === 'list'"
          :columns="availableColumns"
          :selected="activeCols"
          @update:selected="setCols"
          @reset="resetCols"
        />
        <button
          class="rounded-lg border border-outline-gray-2 px-3 py-[7px] text-[12px] font-medium text-ink-gray-7"
          :title="__('Exportar a Excel')"
          @click="exportDeals"
        >
          ⭳ {{ __('Export') }}
        </button>
        <button
          class="rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold text-white"
          style="background: var(--brand)"
          @click="showDealModal = true"
        >
          + {{ __('New Deal') }}
        </button>
        <Dropdown :options="viewMenu">
          <button
            class="rounded-lg border border-outline-gray-2 px-2 py-[7px] text-[12px] text-ink-gray-6"
            :aria-label="__('Más opciones')"
          >
            ⋯
          </button>
        </Dropdown>
      </div>
    </div>

    <section
      class="flex-none border-b border-outline-gray-1 px-3.5 py-2 sm:px-5"
      aria-label="Colas de seguimiento"
    >
      <div class="flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="q in followUpQueues"
          :key="q.key"
          :aria-pressed="followUp === q.key"
          class="flex-none whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium"
          :class="
            followUp === q.key
              ? 'border-outline-green-3 bg-surface-green-2 text-ink-green-9'
              : 'border-outline-gray-2 text-ink-gray-6 hover:bg-surface-gray-2'
          "
          @click="selectFollowUp(q.key)"
        >
          {{ __(q.label) }}
        </button>
      </div>
      <p class="mt-1 text-xs text-ink-gray-5">
        {{ __(followUpQueues.find((q) => q.key === followUp).description) }}
      </p>
    </section>

    <!-- active filter chips -->
    <div
      v-if="chips.length && !isMobile"
      class="flex flex-none flex-wrap items-center gap-2 border-b border-outline-gray-1 px-5 py-2"
    >
      <span
        v-for="c in chips"
        :key="c.key"
        class="inline-flex items-center gap-1.5 rounded-[7px] border px-2 py-1 text-[11.5px] font-medium"
        style="
          color: var(--brand);
          background: var(--brand-soft);
          border-color: #c7ecd5;
        "
      >
        {{ c.label }}
        <button
          class="text-[13px] leading-none"
          :aria-label="__('Quitar filtro') + ' ' + c.label"
          @click="removeChip(c)"
        >
          ×
        </button>
      </span>
      <button class="text-[11.5px] text-ink-gray-5" @click="clearAll">
        {{ __('Limpiar todo') }}
      </button>
    </div>

    <div
      v-if="deals.error"
      role="alert"
      class="flex flex-none items-center gap-3 border-b border-outline-gray-1 px-5 py-3 text-sm text-ink-red-8"
    >
      {{
        __('No se pudieron cargar los tratos. Tus filtros siguen guardados.')
      }}
      <button class="font-semibold underline" @click="applyFilters">
        {{ __('Reintentar') }}
      </button>
    </div>
    <!-- bulk bar -->
    <div
      v-if="selectedRows.length"
      class="flex flex-none items-center gap-3 border-b border-outline-gray-1 bg-surface-gray-1 px-5 py-2"
    >
      <span class="text-[12.5px] font-semibold text-ink-gray-8"
        >{{ selectedRows.length }} {{ __('seleccionados') }}</span
      >
      <button
        class="rounded-md px-2.5 py-1 text-[12px] font-medium text-ink-red-8 hover:bg-surface-red-1"
        @click="bulkDelete"
      >
        {{ __('Eliminar') }}
      </button>
      <button class="text-[12px] text-ink-gray-5" @click="selectedRows = []">
        {{ __('Deseleccionar') }}
      </button>
    </div>

    <!-- list view. Header + rows share ONE scroller so the wider column set (cliente,
         teléfono, equipo, RO…) side-scrolls with its header attached instead of
         squeezing every cell to nothing on a narrow laptop. -->
    <!-- ── mobile list: cards, not a squeezed table ──────────────────────── -->
    <div
      v-if="view === 'list' && isMobile"
      class="scb min-h-0 flex-1 overflow-y-auto"
    >
      <div
        v-if="deals.loading && !rows.length"
        class="py-10 text-center text-xs text-ink-gray-4"
      >
        {{ __('Cargando…') }}
      </div>
      <div
        v-else-if="!rows.length && !deals.error"
        class="py-10 text-center text-xs text-ink-gray-4"
      >
        {{ __('Sin tratos') }}
      </div>
      <MobileRecordCard
        v-for="r in rows"
        :key="r.name"
        :title="cardTitle(r)"
        :subtitle="mobileSubtitle(r)"
        :time="timeAgo(r.modified)"
        :menu="rowMenu(r)"
        @open="openDeal(r.name)"
      >
        <template #chips>
          <span
            v-if="r.status"
            class="rounded-md px-1.5 py-[2px] text-[11px] font-semibold"
            :style="statusChip(r.status)"
          >
            {{ r.status }}
          </span>
          <span
            v-if="extra(r).repair_status"
            class="rounded-md px-1.5 py-[2px] text-[11px] font-semibold"
            :style="repairChip(extra(r).repair_status)"
          >
            🔧 {{ extra(r).repair_status }}
          </span>
          <span
            v-if="deviceOf(r)"
            class="truncate text-[11px] text-ink-gray-6"
            >{{ deviceOf(r) }}</span
          >
          <span
            v-if="displayValue(r, getDealStatus(r.status))"
            class="ml-auto flex-none text-[12px] font-semibold text-ink-gray-8"
          >
            {{
              formatMXN(displayValue(r, getDealStatus(r.status)), r.currency)
            }}
          </span>
          <!-- own line: the due label plus the task title needs the full width -->
          <div v-if="r.next_activity_task" class="w-full">
            <NextActivityChip
              :at="r.next_activity_at"
              :title="r.next_activity_title"
              :type="r.next_activity_type"
              :empty-label="__('Pendiente sin fecha')"
            />
          </div>
        </template>
      </MobileRecordCard>
      <div v-if="deals.hasNextPage" class="px-3.5 py-3">
        <button
          class="press h-11 w-full rounded-[10px] border border-outline-gray-2 text-[13px] font-medium text-ink-gray-7"
          @click="deals.next()"
        >
          {{ __('Cargar más') }}
        </button>
      </div>
      <div class="h-16" aria-hidden="true" />
    </div>

    <template v-if="view === 'list' && !isMobile">
      <div class="scb min-h-0 flex-1 overflow-auto">
        <div :style="isMobile ? '' : `min-width:${MIN_W}px`">
          <!-- table header -->
          <div
            class="sticky top-0 z-[5] grid items-center border-b border-outline-gray-1 bg-surface-gray-1 px-5 text-[10.5px] font-semibold uppercase tracking-[.07em] text-ink-gray-4"
            :style="`grid-template-columns:${GRID};height:34px`"
          >
            <input
              v-if="!isMobile"
              type="checkbox"
              class="cb-token"
              :checked="allSelected"
              :aria-label="__('Seleccionar todo')"
              @change="toggleAll"
            />
            <button class="text-left uppercase" @click="sortBy('deal_name')">
              {{ __('Trato') }}{{ sortArrow('deal_name') }}
            </button>
            <div v-if="col('customer')">{{ __('Cliente') }}</div>
            <button
              v-if="col('phone')"
              class="text-left uppercase"
              @click="sortBy('mobile_no')"
            >
              {{ __('Teléfono') }}{{ sortArrow('mobile_no') }}
            </button>
            <div v-if="col('device')">{{ __('Equipo') }}</div>
            <div v-if="col('repair_type')">{{ __('Reparación') }}</div>
            <div v-if="col('ro')">{{ __('RO') }}</div>
            <button
              v-if="col('value')"
              class="text-left uppercase"
              @click="sortBy('deal_value')"
            >
              {{ __('Valor') }}{{ sortArrow('deal_value') }}
            </button>
            <button
              v-if="col('expected_value')"
              class="text-left uppercase"
              @click="sortBy('expected_deal_value')"
            >
              {{ __('Valor esperado') }}{{ sortArrow('expected_deal_value') }}
            </button>
            <button
              v-if="col('close_date')"
              class="text-left uppercase"
              @click="sortBy('expected_closure_date')"
            >
              {{ __('Cierre') }}{{ sortArrow('expected_closure_date') }}
            </button>
            <button
              v-if="col('next_activity')"
              class="text-left uppercase"
              @click="sortBy('next_activity_at')"
            >
              {{ __('Próximo paso') }}{{ sortArrow('next_activity_at') }}
            </button>
            <div v-if="col('stage')">{{ __('Stage') }}</div>
            <div v-if="col('source')">{{ __('Source') }}</div>
            <button
              v-if="col('modified')"
              class="text-left uppercase"
              @click="sortBy('modified')"
            >
              {{ __('Última act.') }}{{ sortArrow('modified') }}
            </button>
            <div v-if="col('owner')">{{ __('Owner') }}</div>
            <div />
          </div>

          <!-- rows -->
          <div
            v-if="deals.loading && !rows.length"
            class="py-10 text-center text-xs text-ink-gray-4"
          >
            {{ __('Cargando…') }}
          </div>
          <div
            v-else-if="!rows.length && !deals.error"
            class="py-10 text-center text-xs text-ink-gray-4"
          >
            {{ __('Sin tratos') }}
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
              class="grid cursor-pointer items-center border-b border-outline-gray-1 px-5 hover:bg-surface-gray-1"
              :style="`grid-template-columns:${GRID};min-height:50px`"
              @click="openDeal(r.name)"
              @keydown.enter="openDeal(r.name)"
            >
              <input
                v-if="!isMobile"
                type="checkbox"
                class="cb-token"
                :checked="selectedRows.includes(r.name)"
                :aria-label="__('Seleccionar') + ' ' + label(r)"
                @click.stop="toggleRow(r.name)"
              />
              <div class="flex items-center gap-2">
                <span
                  class="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold"
                  :style="`background:${avatarColor(label(r))[0]};color:${avatarColor(label(r))[1]}`"
                >
                  {{ initials(label(r)) }}
                </span>
                <div class="min-w-0">
                  <div
                    class="truncate text-[13px] font-semibold text-ink-gray-9"
                  >
                    {{ label(r) }}
                  </div>
                  <!-- second line = the customer, so the identity is visible even with the
                 Cliente column hidden (and on phones, where only 2 columns fit) -->
                  <div class="truncate text-[11px] text-ink-gray-4">
                    {{ customerOf(r) || formatPhone(phoneOf(r)) }}
                  </div>
                </div>
              </div>
              <div
                v-if="col('customer')"
                class="truncate text-[12.5px] text-ink-gray-8"
              >
                {{ customerOf(r) || '—' }}
              </div>
              <div
                v-if="col('phone')"
                class="truncate text-[12px] text-ink-gray-6"
              >
                {{ formatPhone(phoneOf(r)) }}
              </div>
              <div
                v-if="col('device')"
                class="truncate text-[12px] text-ink-gray-6"
                :title="deviceOf(r) || ''"
              >
                {{ deviceOf(r) || '—' }}
              </div>
              <div
                v-if="col('repair_type')"
                class="truncate text-[12px] text-ink-gray-6"
                :title="repairTypeOf(r) || ''"
              >
                {{ repairTypeOf(r) || '—' }}
              </div>
              <div v-if="col('ro')" class="min-w-0">
                <div
                  v-if="extra(r).repair_order"
                  class="flex items-center gap-1.5"
                >
                  <span
                    class="truncate text-[11.5px] font-medium text-ink-gray-7"
                    >{{ extra(r).repair_order }}</span
                  >
                  <span
                    v-if="extra(r).repair_status"
                    class="flex-none rounded px-1.5 py-px text-[10.5px] font-semibold"
                    :style="repairChip(extra(r).repair_status)"
                  >
                    {{ extra(r).repair_status }}
                  </span>
                  <span
                    v-if="extra(r).repair_count > 1"
                    class="flex-none text-[10px] text-ink-gray-4"
                    >+{{ extra(r).repair_count - 1 }}</span
                  >
                </div>
                <span v-else class="text-[12px] text-ink-gray-4">—</span>
              </div>
              <div
                v-if="col('value')"
                class="text-[12.5px] font-semibold text-ink-gray-8"
              >
                {{ formatMXN(r.deal_value, r.currency) }}
              </div>
              <div
                v-if="col('expected_value')"
                class="text-[12.5px] text-ink-gray-7"
              >
                {{ formatMXN(r.expected_deal_value, r.currency) }}
              </div>
              <div v-if="col('close_date')" class="text-[12px] text-ink-gray-6">
                {{ formatDate(r.expected_closure_date) }}
              </div>
              <FollowUpCell
                v-if="col('next_activity')"
                :row="r"
                :today="siteToday"
                @saved="onFollowUpSaved(r, $event)"
              />
              <div v-if="col('stage')">
                <span
                  v-if="r.status"
                  class="rounded-md px-2 py-[3px] text-[11.5px] font-semibold"
                  :style="statusChip(r.status)"
                >
                  {{ r.status }}
                </span>
              </div>
              <div
                v-if="col('source')"
                class="flex items-center gap-1.5 text-[12px] text-ink-gray-6"
              >
                <span
                  v-if="r.source"
                  class="h-[7px] w-[7px] flex-none rounded-full"
                  :style="`background:${sourceDot(r.source)}`"
                />
                <span class="truncate">{{ r.source || '—' }}</span>
              </div>
              <div v-if="col('modified')" class="text-[12px] text-ink-gray-5">
                {{ timeAgo(r.modified) }}
              </div>
              <div v-if="col('owner')">
                <span
                  v-if="r.deal_owner"
                  class="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[10px] font-semibold"
                  :style="`background:${avatarColor(r.deal_owner)[0]};color:${avatarColor(r.deal_owner)[1]}`"
                  :title="r.deal_owner"
                >
                  {{ initials(ownerName(r.deal_owner)) }}
                </span>
              </div>
              <Dropdown :options="rowMenu(r)" @click.stop>
                <button
                  class="text-[14px] text-ink-gray-4"
                  :aria-label="__('Más acciones')"
                  @click.stop
                >
                  ···
                </button>
              </Dropdown>
            </div>
          </template>

          <div v-if="deals.hasNextPage" class="py-3 text-center">
            <button
              class="rounded-lg border border-outline-gray-2 px-4 py-1.5 text-[12px] font-medium text-ink-gray-7"
              @click="deals.next()"
            >
              {{ __('Cargar más') }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- board view -->
    <BoardView
      v-else-if="view === 'board'"
      :rows="rows"
      :groups="stageOptions"
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
            class="text-[10px] text-ink-red-6"
            @click="loadCounts"
          >
            {{ __('Totals unavailable · Retry') }}
          </button>
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
            class="text-[10px] text-ink-gray-4"
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
            <span class="flex-none text-[11px] font-semibold text-ink-gray-7">{{
              formatMXN(
                displayValue(row, getDealStatus(row.status)),
                row.currency,
              )
            }}</span>
          </div>
          <div class="mt-0.5 flex items-center justify-between gap-2">
            <span class="min-w-0 flex-1 truncate text-[11px] text-ink-gray-4">
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
              class="max-w-[110px] truncate rounded px-1 py-px text-[10px] font-medium text-ink-gray-6"
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
              compact
            />
            <div class="ml-auto flex flex-none items-center gap-1.5">
              <span
                v-if="row.deal_owner"
                class="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-semibold"
                :style="`background:${avatarColor(row.deal_owner)[0]};color:${avatarColor(row.deal_owner)[1]}`"
                :title="ownerName(row.deal_owner)"
              >
                {{ initials(ownerName(row.deal_owner)) }}
              </span>
              <span
                class="text-[10px] text-ink-gray-4"
                :title="__('Antigüedad')"
                >{{ timeAgo(row.creation) }}</span
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

    <!-- mobile: create sits under the thumb, clear of the tab bar -->
    <button
      v-if="isMobile"
      class="press fixed right-4 z-[200] flex h-14 w-14 items-center justify-center rounded-full text-[26px] font-light text-white"
      style="
        background: var(--brand);
        bottom: calc(env(safe-area-inset-bottom) + 68px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
      "
      :aria-label="__('New Deal')"
      @click="showDealModal = true"
    >
      +
    </button>

    <MobileFilterSheet
      v-if="isMobile"
      v-model="showFilterSheet"
      :groups="mobileFilterGroups"
      :count="count"
      @change="onSheetChange"
      @clear="clearAll"
    />

    <DealModal
      v-if="showDealModal"
      v-model="showDealModal"
      :defaults="pipelineF ? { pipeline: pipelineF } : {}"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
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
import LucideSearch from '~icons/lucide/search'
import { statusesStore } from '@/stores/statuses'
import { usersStore } from '@/stores/users'
import DealModal from '@/components/Modals/DealModal.vue'
import FilterPopover from '@/components/doco/leads/FilterPopover.vue'
import { userScopedKey } from '@/utils/storageKeys'
import ColumnPicker from '@/components/doco/ColumnPicker.vue'
import BoardView from '@/components/doco/BoardView.vue'
import FunnelView from '@/components/doco/FunnelView.vue'
import MobileRecordCard from '@/components/doco/MobileRecordCard.vue'
import MobileFilterSheet from '@/components/doco/MobileFilterSheet.vue'
import NextActivityChip from '@/components/doco/NextActivityChip.vue'
import FollowUpCell from '@/components/doco/deals/FollowUpCell.vue'
import DealGroupHeader from '@/components/doco/deals/DealGroupHeader.vue'
import SavedViewPicker from '@/components/doco/deals/SavedViewPicker.vue'
import { isMobile } from '@/composables/breakpoint'
import { hasTaller, reloadQueue } from '@/composables/inbox'
import {
  avatarColor,
  initials,
  timeAgo,
  formatPhone,
  CHANNEL_META,
} from '@/composables/crmFormat'
import { money } from '@/utils/numberFormat'
import {
  displayValue,
  dealProbability,
  stageValue,
  weightedTotal,
} from '@/utils/pipelineMath'

import { followUpFilters, FOLLOW_UP_QUEUES } from '@/utils/dealFollowUp'
import {
  DEAL_GROUP_BYS,
  groupByLabel,
  groupRows,
  isGroupBy,
} from '@/utils/dealGroups'
import { dealListState } from '@/utils/dealListState'
const router = useRouter()
const route = useRoute()
const QUEUE_KEY = userScopedKey('crm_deal_list_context')
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
  { key: 'ro', label: __('RO') },
  { key: 'value', label: __('Valor') },
  { key: 'expected_value', label: __('Valor esperado') },
  { key: 'close_date', label: __('Cierre') },
  { key: 'next_activity', label: __('Próximo paso') },
  { key: 'stage', label: __('Stage') },
  { key: 'source', label: __('Source') },
  { key: 'modified', label: __('Última act.') },
  { key: 'owner', label: __('Owner') },
]
const COL_ORDER = [
  'customer',
  'phone',
  'device',
  'repair_type',
  'ro',
  'value',
  'expected_value',
  'close_date',
  'next_activity',
  'stage',
  'source',
  'modified',
  'owner',
]
const COL_WIDTH = {
  customer: '150px',
  phone: '130px',
  device: '140px',
  repair_type: '130px',
  ro: '150px',
  value: '110px',
  expected_value: '120px',
  close_date: '100px',
  next_activity: '170px',
  stage: '125px',
  source: '110px',
  modified: '100px',
  owner: '50px',
}
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
function col(key) {
  // phone: contact + stage only — full column set side-scrolled (07-25)
  if (isMobile.value) return key === 'contact' || key === 'stage'
  if (!hasTaller.value && REPAIR_COLS.includes(key)) return false
  return key === 'contact' || activeCols.value.includes(key)
}
// Width the grid needs before it starts squeezing cells — drives the side-scroll.
const MIN_W = computed(() => {
  let w = 28 + 180 + 26 // checkbox + contact min + row menu
  for (const key of COL_ORDER) if (col(key)) w += parseInt(COL_WIDTH[key], 10)
  return w + 40 // px-5 gutters
})
const GRID = computed(() => {
  if (isMobile.value) return '1fr 112px 26px' // contact + stage + menu
  const parts = ['28px', 'minmax(180px,1fr)'] // checkbox + contact (always)
  for (const key of COL_ORDER) if (col(key)) parts.push(COL_WIDTH[key])
  parts.push('26px') // row menu
  return parts.join(' ')
})
// NOTE: read the visible-stage list THROUGH the store (`statusStore.visible…`).
// Destructuring a pinia computed unwraps it into a one-shot value and the board
// would keep the stage set it saw on first render.
const statusStore = statusesStore()
const { getDealStatus } = statusStore
const { getUser, users: usersList } = usersStore()

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
const search = ref(remembered.search)
const sort = ref(remembered.sort)
const selectedRows = ref([])
const view = ref(remembered.view)
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
  pageLength: remembered.view === 'board' ? 200 : 50,
  onSuccess: () => loadDisplay(),
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
async function loadDisplay() {
  const names = (deals.data || [])
    .map((d) => d.name)
    .filter((n) => !(n in display.value))
  if (!names.length) return
  try {
    const data = await frappeCall('doco_marketing.api.deals.get_deal_display', {
      names: JSON.stringify(names),
    })
    display.value = { ...display.value, ...(data || {}) }
  } catch (e) {
    /* enrichment is additive — a failure leaves the base columns intact */
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
function repairChip(status) {
  const c = REPAIR_CHIP[status] || '#5b6472'
  return `color:${c};background:${c}1a`
}

// ── mobile shell ─────────────────────────────────────────────────────────────
const showFilterSheet = ref(false)
// Folio + phone under the customer's name: the two things a shop reads aloud.
// When there's no customer the card title IS the folio, so don't repeat it.
function mobileSubtitle(r) {
  const parts = []
  if (customerOf(r)) parts.push(r.name)
  const ph = phoneOf(r)
  if (ph) parts.push(formatPhone(ph))
  return parts.join(' · ')
}
// Toolbar actions a phone can't fit inline. Column picking is desktop-only (the
// card layout has no columns to pick).
const mobileMenu = computed(() => [
  ...viewMenu.value,
  { label: '⭳ ' + __('Export'), onClick: exportDeals },
])
const mobileFilterGroups = computed(() => [
  {
    key: 'status',
    label: __('Stage'),
    options: stageOptions.value,
    selected: statusF.value,
  },
  {
    key: 'source',
    label: __('Source'),
    options: sourceOptions.value,
    selected: sourceF.value,
  },
  {
    key: 'owner',
    label: __('Owner'),
    options: ownerOptions.value,
    selected: ownerF.value,
  },
])
function onSheetChange({ key, values }) {
  ;({ status: statusF, source: sourceF, owner: ownerF })[key].value = values
}
const count = computed(() =>
  countsLoaded.value
    ? String(
        Object.values(groupCounts.value).reduce(
          (n, stage) => n + Number(stage.count || 0),
          0,
        ),
      )
    : `${deals.data?.length ?? 0}${deals.hasNextPage ? '+' : ''} ${__('cargados')}`,
)

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
function buildFilters() {
  siteToday.value = siteDay()
  const today = siteToday.value
  const closed = (statusStore.dealStatuses.data || [])
    .filter((s) => ['Won', 'Lost'].includes(s.type))
    .map((s) => s.name)
  const f = followUpFilters(followUp.value, today, closed)
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
function applyFilters() {
  deals.filters = buildFilters()
  deals.orFilters = searchOrFilters()
  // see `rows`: next-activity order is finished client-side, the server only has
  // to hand us the scheduled ones first
  deals.orderBy =
    sort.value.field === 'next_activity_at' &&
    !['overdue', 'today'].includes(followUp.value)
      ? 'next_activity_at desc'
      : `${sort.value.field} ${sort.value.dir}`
  deals.reload()
  loadCounts()
}

// Totals cover all matching records, using each deal's value, probability and FX.
const metricsCurrency = ref(null)
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
    countsLoaded.value = true
  } catch {
    if (request !== countsRequest) return
    groupCounts.value = {}
    metricsError.value = true
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

async function onBoardChange(row, status) {
  try {
    await frappeCall('frappe.client.set_value', {
      doctype: 'CRM Deal',
      name: row.name,
      fieldname: 'status',
      value: status,
    })
    row.status = status
    toast.success(__('Stage actualizado'))
    loadCounts()
  } catch (e) {
    toast.error(e.messages?.[0] || __('No se pudo cambiar el stage'))
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
  applyViewContext(context)
}
watch(viewName, (name) => {
  if (!name) viewCols.value = null
})
const viewMenu = computed(() => [
  {
    label: '↗ ' + __('Vista clásica (todos los filtros)'),
    onClick: () => router.push('/deals/view'),
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
      groupBy.value === 'deal_owner' ? ownerName(value) : value,
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
    label: s.name,
    color: getDealStatus(s.name)?.color || s.color,
    probability: s.probability,
    type: s.type,
  })),
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
  (sources.data || []).map((s) => ({ value: s.name, label: s.name })),
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
    out.push({ key: `st:${v}`, type: 'status', value: v, label: v })
  for (const v of sourceF.value)
    out.push({ key: `sr:${v}`, type: 'source', value: v, label: v })
  for (const v of ownerF.value)
    out.push({ key: `ow:${v}`, type: 'owner', value: v, label: ownerName(v) })
  return out
})
function removeChip(c) {
  if (c.type === 'period') {
    createdFrom.value = ''
    createdTo.value = ''
    return
  }
  const ref_ = { status: statusF, source: sourceF, owner: ownerF }[c.type]
  ref_.value = ref_.value.filter((x) => x !== c.value)
}
function clearAll() {
  createdFrom.value = ''
  createdTo.value = ''
  followUp.value = 'all'
  statusF.value = []
  sourceF.value = []
  ownerF.value = []
}
watch(
  [
    pipelineF,
    statusF,
    sourceF,
    ownerF,
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
  { key: 'cal', label: __('Calendario'), to: '/calendar' },
]
function label(r) {
  return r.deal_name || r.organization || r.lead_name || r.name
}
function statusChip(status) {
  const c = getDealStatus(status)?.color || '#5b6472'
  return `color:${c};background:${c}1a`
}
function sourceDot(source) {
  const key = String(source || '').toLowerCase()
  for (const k of Object.keys(CHANNEL_META))
    if (key.includes(k) || key.includes(CHANNEL_META[k][0].toLowerCase()))
      return CHANNEL_META[k][1]
  return '#9aa2ae'
}
function ownerName(email) {
  return getUser(email)?.full_name || email
}
function formatMXN(v, currency = metricsCurrency.value) {
  if (v == null || v === '') return '—'
  const n = Number(v) || 0
  if (!n) return '—'
  return money(n, currency || metricsCurrency.value)
}
function formatDate(v) {
  if (!v) return '—'
  const d = new Date(String(v).replace(' ', 'T'))
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}
// Card headline: the deal's own title when the tenant has one, else the customer,
// else whatever identifies the row. RO-generated deals have no title, which is why
// the upstream kanban reads "No Title".
function cardTitle(r) {
  return r.deal_name || customerOf(r) || label(r)
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
function openDeal(name) {
  router.push(`/deal/${name}`)
}
function rowMenu(r) {
  return [
    { label: __('Abrir'), onClick: () => openDeal(r.name) },
    {
      label: __('Vista clásica'),
      onClick: () => router.push(`/deals/${r.name}`),
    },
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
