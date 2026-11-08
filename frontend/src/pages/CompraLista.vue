<template>
  <!-- The price-list workbench: one supplier list read from its pictures or
       its file, its lines by section with the tier prices, what changed since
       the previous list, what another supplier prints, what the shop paid, has
       and keeps as its level; the owner's quantities build the order to the
       supplier in place (doco.workspaces.lista_precios). Drop or paste more
       pictures of the list anywhere on the page. -->
  <div
    class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden"
    data-lista
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
    @paste="onPaste"
  >
    <AppBar
      :back="{ name: 'CompraSurtido' }"
      :back-label="__('Restock', null, 'Lista')"
      :context="context"
      :title="title"
      :count="data ? lineCount : undefined"
      :bell="phone"
      :loading="loading && !!data"
      :searchable="phone"
      :search="search"
      :search-open="searchOpen"
      :search-label="searchLabel"
      @update:search="(value) => (search = value)"
      @update:search-open="(value) => (searchOpen = value)"
    >
      <template #actions>
        <ListaPresencia v-if="data" :people="people" :bot="botActive" />
        <AccionesMenu
          v-if="data"
          :phone="phone"
          :groups="actionGroups"
          :subtitle="title"
          @pick="onAction"
        />
      </template>
      <template v-if="data" #search-panel>
        <ChipGroup
          v-model="filter"
          :label="__('Show', null, 'Lista')"
          :options="filterOptions"
          clear-value=""
          testid="lista-filtro"
        />
        <ChipGroup
          v-if="sectionOptions.length > 1"
          v-model="section"
          :label="__('Section', null, 'Lista')"
          :options="sectionOptions"
          clear-value=""
          :max="12"
          testid="lista-seccion"
        />
      </template>
      <template v-if="activeChips.length" #active>
        <div class="flex flex-wrap gap-1.5" data-lista-activos>
          <button
            v-for="chip in activeChips"
            :key="chip.key"
            type="button"
            :class="chipClass(true)"
            :aria-label="__('Remove filter {0}', [chip.label], 'Lista')"
            @click="chip.remove()"
          >
            {{ chip.label }}
            <span class="lucide-x size-3 flex-none" aria-hidden="true" />
          </button>
        </div>
      </template>
    </AppBar>

    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-12">
      <EmptyState
        v-if="guard"
        role="alert"
        state="error"
        :title="guard.title"
        :message="guard.detail"
        :action="__('Retry', null, 'Compras')"
        @action="load()"
      />
      <EmptyState
        v-else-if="!data"
        role="status"
        state="loading"
        :title="__('Opening the list…', null, 'Lista')"
      />

      <template v-else>
        <div
          v-if="problem"
          role="alert"
          class="mx-4 mt-3 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <button type="button" class="ml-2 underline" @click="problem = null">
            {{ __('Close', null, 'Lista') }}
          </button>
        </div>

        <!-- the list's state: reading, waiting, broken, or without a supplier -->
        <div
          v-if="strip"
          role="status"
          class="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-6 p-3 text-sm sm:mx-6"
          :class="STRIP_TONE[strip.tone]"
          data-lista-estado
        >
          <span :class="[strip.icon, 'size-5 flex-none']" aria-hidden="true" />
          <p class="min-w-0 flex-1 basis-48">{{ strip.text }}</p>
          <div
            v-if="strip.pct !== undefined"
            class="h-2 basis-full overflow-hidden rounded-full bg-surface-gray-2"
          >
            <div
              class="h-full rounded-full bg-surface-gray-7"
              :style="{ width: strip.pct + '%' }"
            />
          </div>
          <button
            v-if="strip.action"
            type="button"
            :class="['press', BTN.tonal, 'min-h-10 px-4 text-sm']"
            :disabled="busy === strip.action.key"
            @click="strip.action.run()"
          >
            <span
              :class="[
                busy === strip.action.key
                  ? 'lucide-loader-circle animate-spin'
                  : strip.action.icon,
                'size-4',
              ]"
              aria-hidden="true"
            />
            {{ strip.action.label }}
          </button>
        </div>
        <div
          v-if="readQuote"
          class="mx-4 mt-2 rounded-6 bg-surface-gray-1 p-3 text-sm sm:mx-6"
          role="status"
        >
          <template v-if="readQuote.pages">
            <p>
              {{
                __(
                  'Reading {0} pages of products uses {1} units of your plan. The lines appear here as they are read.',
                  [readQuote.pages, readQuote.units],
                  'Lista',
                )
              }}
            </p>
            <div class="mt-2 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                :class="['press', BTN.text, 'min-h-10 px-3 text-sm']"
                @click="readQuote = null"
              >
                {{ __('Not now', null, 'Lista') }}
              </button>
              <button
                type="button"
                :class="['press', BTN.filled, 'min-h-10 px-4 text-sm']"
                :disabled="busy === 'read'"
                @click="readProducts"
              >
                <span
                  :class="[
                    busy === 'read'
                      ? 'lucide-loader-circle animate-spin'
                      : 'lucide-check',
                    'size-4',
                  ]"
                  aria-hidden="true"
                />
                {{ __('Read them', null, 'Lista') }}
              </button>
            </div>
          </template>
          <p v-else>
            {{
              __(
                'This list has no product pages left to read. Add clearer pictures or the file with prices.',
                null,
                'Lista',
              )
            }}
          </p>
        </div>

        <!-- the supplier's lists: one open order adds them up -->
        <nav
          v-if="catalog.supplier && supplierTabs.length"
          class="mx-4 mt-3 flex items-stretch gap-1.5 overflow-x-auto pb-1 sm:mx-6"
          :aria-label="__('Lists of {0}', [catalog.supplier_name], 'Lista')"
          data-lista-listas
        >
          <RouterLink
            v-for="list in supplierTabs"
            :key="list.name"
            :to="{ name: 'CompraLista', params: { name: list.name } }"
            :aria-current="list.current ? 'page' : undefined"
            :title="list.title"
            class="press flex min-h-11 w-36 flex-none flex-col justify-center rounded-6 border px-3 py-1.5 text-left"
            :class="
              list.current
                ? 'border-outline-gray-4 bg-surface-gray-2'
                : 'border-outline-gray-2 hover:bg-surface-gray-1'
            "
            :data-lista-lista="list.name"
          >
            <span class="truncate text-sm font-medium text-ink-gray-9">{{
              listLabel(list) || __('No type', null, 'Lista')
            }}</span>
            <span
              class="num truncate text-xs tabular-nums"
              :class="list.lines ? 'text-ink-gray-8' : 'text-ink-gray-5'"
              >{{
                list.lines
                  ? __(
                      '{0} pcs, {1}',
                      [list.pieces, money(list.amount, currency)],
                      'Lista',
                    )
                  : tabState(list)
              }}</span
            >
          </RouterLink>
          <button
            v-if="data.owner"
            type="button"
            class="press flex min-h-11 flex-none items-center gap-1.5 rounded-6 px-3 text-sm text-ink-gray-7 hover:bg-surface-gray-1"
            :title="__('Product type of this list', null, 'Lista')"
            :aria-label="__('Product type of this list', null, 'Lista')"
            data-lista-tipo-abrir
            @click="openTipo"
          >
            <span class="lucide-tag size-4 flex-none" aria-hidden="true" />
            <span v-if="!phone">{{
              catalog.item_group
                ? __('Change the type', null, 'Lista')
                : __('Set the type', null, 'Lista')
            }}</span>
          </button>
        </nav>

        <!-- desktop toolbar: the search and the filters inline -->
        <div
          v-if="!phone && lineCount"
          class="mx-6 mt-4 flex flex-wrap items-center gap-3"
          data-lista-toolbar
        >
          <div v-if="canOrder" class="flex-none" data-lista-vista>
            <Segmented
              :model-value="orderView ? 'pedido' : 'lista'"
              :options="viewOptions"
              :label="__('Show', null, 'Lista')"
              fit="content"
              @update:model-value="pickView"
            />
          </div>
          <label class="relative min-w-[16rem] flex-1 basis-64">
            <span
              class="lucide-search pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-gray-5"
              aria-hidden="true"
            />
            <input
              v-model="search"
              type="search"
              class="h-10 w-full rounded-full border-0 bg-surface-gray-2 pl-9 pr-4 text-sm text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-3 [&::-webkit-search-cancel-button]:hidden"
              :placeholder="searchLabel"
              :aria-label="searchLabel"
              data-lista-buscar
            />
          </label>
          <div
            class="flex flex-wrap gap-1.5"
            role="group"
            :aria-label="__('Show', null, 'Lista')"
          >
            <button
              v-for="o in filterOptions"
              :key="o.value"
              type="button"
              :class="[chipClass(filter === o.value), 'min-h-9']"
              :aria-pressed="filter === o.value"
              :data-testid="`lista-filtro-${o.value}`"
              @click="filter = filter === o.value ? '' : o.value"
            >
              {{ o.label }}
              <span class="num text-[10px] opacity-70">{{ o.count }}</span>
            </button>
          </div>
        </div>

        <!-- phone: models the list no longer carries, one line above the list -->
        <button
          v-if="phone && retireCount"
          type="button"
          class="press mx-4 mt-3 flex min-h-11 w-[calc(100%-2rem)] items-center gap-2 rounded-6 border border-outline-gray-2 px-3 text-left text-sm"
          data-lista-retiro
          @click="openRetiro"
        >
          <span
            class="lucide-archive size-4 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate">{{
            __('{0} models the list no longer carries', [retireCount], 'Lista')
          }}</span>
          <span class="text-xs text-ink-gray-6">{{
            __('Review', null, 'Lista')
          }}</span>
        </button>

        <!-- phone: the order or the whole list -->
        <div
          v-if="phone && canOrder && lineCount"
          class="mx-4 mt-3"
          data-lista-vista
        >
          <Segmented
            :model-value="orderView ? 'pedido' : 'lista'"
            :options="viewOptions"
            :label="__('Show', null, 'Lista')"
            @update:model-value="pickView"
          />
        </div>

        <!-- phone: the sections as chips -->
        <div
          v-if="phone && sectionOptions.length > 1 && !orderView"
          class="mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1"
          role="group"
          :aria-label="__('Section', null, 'Lista')"
        >
          <button
            v-for="o in [
              { value: '', label: __('All', null, 'Lista'), count: lineCount },
              ...sectionOptions,
            ]"
            :key="o.value"
            type="button"
            :class="chipClass(section === o.value)"
            :aria-pressed="section === o.value"
            @click="section = o.value"
          >
            {{ o.label }}
            <span class="num text-[10px] opacity-70">{{ o.count }}</span>
          </button>
        </div>

        <EmptyState
          v-if="!lineCount && !strip"
          :title="__('The list has no products yet', null, 'Lista')"
          :message="
            data.owner
              ? __(
                  'Drop the pictures of the list here, or its PDF or spreadsheet, and it reads itself.',
                  null,
                  'Lista',
                )
              : __('The owner adds the pictures of the list.', null, 'Lista')
          "
          :action="data.owner ? __('Add pictures', null, 'Lista') : ''"
          @action="fileInput?.click()"
        />
        <EmptyState
          v-else-if="lineCount && !visible.length && !orderView"
          :title="__('Nothing matches', null, 'Lista')"
          :message="
            __('Change the words, or clear the filters.', null, 'Lista')
          "
          :action="__('Clear filters', null, 'Lista')"
          @action="clearFilters"
        />

        <div
          v-else-if="lineCount"
          class="mt-3 lg:mx-6 lg:grid lg:items-start lg:gap-6"
          :class="
            orderView
              ? 'lg:grid-cols-[minmax(0,1fr)_19rem]'
              : 'lg:grid-cols-[11rem_minmax(0,1fr)_19rem]'
          "
        >
          <!-- desktop rail: the sections -->
          <nav
            v-if="!phone && !orderView"
            class="hidden lg:sticky lg:top-4 lg:block"
            :aria-label="__('Section', null, 'Lista')"
          >
            <ul class="space-y-0.5 text-sm">
              <li
                v-for="o in [
                  {
                    value: '',
                    label: __('All', null, 'Lista'),
                    count: lineCount,
                  },
                  ...sectionOptions,
                ]"
                :key="o.value"
              >
                <button
                  type="button"
                  class="press flex min-h-9 w-full items-center gap-2 rounded-6 px-2 text-left"
                  :class="
                    section === o.value
                      ? 'bg-surface-gray-2 font-medium text-ink-gray-9'
                      : 'text-ink-gray-7 hover:bg-surface-gray-1'
                  "
                  :aria-current="section === o.value ? 'true' : undefined"
                  @click="section = o.value"
                >
                  <span class="min-w-0 flex-1 truncate">{{ o.label }}</span>
                  <span class="num text-xs tabular-nums text-ink-gray-5">{{
                    o.count
                  }}</span>
                </button>
              </li>
            </ul>
            <p class="mt-4 px-2 text-xs text-ink-gray-5">
              {{
                __('{0} of {1} lines shown', [shownCount, lineCount], 'Lista')
              }}
            </p>
          </nav>

          <!-- the lines -->
          <div class="min-w-0 overflow-x-auto">
            <!-- the order view before anything is in it: where to start -->
            <div
              v-if="orderView && !visible.length"
              class="mx-4 rounded-8 border border-outline-gray-2 p-4 lg:mx-0"
              data-lista-vacio
            >
              <p class="text-sm font-medium text-ink-gray-9">
                {{
                  __('Nothing from this list in the order yet', null, 'Lista')
                }}
              </p>
              <p class="mt-0.5 text-sm text-ink-gray-6">
                {{
                  __(
                    'Search a model to add it, or start from these lines.',
                    null,
                    'Lista',
                  )
                }}
              </p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <button
                  v-if="phone"
                  type="button"
                  :class="[chipClass(false), 'min-h-9']"
                  @click="searchOpen = true"
                >
                  <span class="lucide-search size-3.5" aria-hidden="true" />
                  {{ __('Search the list', null, 'Lista') }}
                </button>
                <button
                  v-for="o in startOptions"
                  :key="o.value"
                  type="button"
                  :class="[chipClass(false), 'min-h-9']"
                  :data-lista-empezar="o.value"
                  @click="filter = o.value"
                >
                  {{ o.label }}
                  <span class="num text-[10px] opacity-70">{{ o.count }}</span>
                </button>
                <button
                  type="button"
                  :class="[chipClass(false), 'min-h-9']"
                  data-lista-empezar="lista"
                  @click="pickView('lista')"
                >
                  {{ __('Whole list', null, 'Lista') }}
                  <span class="num text-[10px] opacity-70">{{
                    lineCount
                  }}</span>
                </button>
              </div>
            </div>

            <!-- desktop: one dense table, a heading row per section -->
            <table
              v-else-if="!phone"
              class="w-full border-separate border-spacing-0 text-sm"
              data-lista-tabla
            >
              <thead class="text-xs text-ink-gray-6">
                <tr>
                  <th scope="col" class="py-1.5 pl-2 text-left font-medium">
                    {{ __('Product', null, 'Lista') }}
                  </th>
                  <th scope="col" class="py-1.5 pr-3 text-right font-medium">
                    {{ __('Price', null, 'Lista') }}
                  </th>
                  <th scope="col" class="py-1.5 pr-3 text-right font-medium">
                    {{ __('Compare', null, 'Lista') }}
                  </th>
                  <th scope="col" class="py-1.5 pr-3 text-right font-medium">
                    {{ __('Stock', null, 'Lista') }}
                  </th>
                  <th scope="col" class="py-1.5 text-center font-medium">
                    {{ __('Qty', null, 'Lista') }}
                  </th>
                  <th scope="col" class="py-1.5 pr-2 text-right font-medium">
                    {{ __('Total', null, 'Lista') }}
                  </th>
                </tr>
              </thead>
              <tbody v-for="s in rendered" :key="s.name || '—'">
                <tr>
                  <th
                    :id="sectionId(s.name)"
                    scope="colgroup"
                    colspan="6"
                    class="title-face pb-1 pl-2 pt-5 text-left text-base font-semibold text-ink-gray-9"
                  >
                    {{ s.name || __('No section', null, 'Lista') }}
                    <span
                      class="num ml-1 text-xs font-normal text-ink-gray-5"
                      >{{ s.total ?? s.lines.length }}</span
                    >
                  </th>
                </tr>
                <tr
                  v-for="line in s.lines"
                  :key="line.name"
                  class="transition-colors duration-700"
                  :class="
                    flash[line.name]
                      ? 'bg-surface-amber-1'
                      : qtyOf(line)
                        ? 'bg-surface-gray-1'
                        : ''
                  "
                  :data-lista-linea="line.name"
                  :data-lista-cambio="flash[line.name] ? '' : undefined"
                >
                  <!-- max-w-0 lets the product column give way, so the table fits the desk -->
                  <td
                    class="w-full max-w-0 border-t border-outline-gray-1 py-1.5 pl-2"
                  >
                    <button
                      type="button"
                      class="press flex w-full items-center gap-2 text-left"
                      @click="openLine(line)"
                    >
                      <span
                        class="flex size-11 flex-none items-center justify-center overflow-hidden rounded-6 bg-surface-gray-2"
                      >
                        <img
                          v-if="line.photo"
                          :src="line.photo"
                          alt=""
                          class="size-full object-cover"
                          loading="lazy"
                        />
                        <span
                          v-else
                          class="lucide-smartphone size-4 text-ink-gray-4"
                          aria-hidden="true"
                        />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="flex items-start gap-1.5">
                          <span
                            class="line-clamp-2 break-words font-medium leading-snug text-ink-gray-9"
                            :title="lineTitle(line)"
                            >{{ lineTitle(line) }}</span
                          >
                          <span
                            v-if="line.promo"
                            class="lucide-gift mt-0.5 size-3.5 flex-none text-ink-gray-6"
                            :title="line.promo.text"
                            aria-hidden="true"
                          />
                          <span
                            v-if="line.edited"
                            class="lucide-pencil mt-0.5 size-3.5 flex-none text-ink-gray-5"
                            :title="__('Read corrected', null, 'Lista')"
                            aria-hidden="true"
                          />
                        </span>
                        <span
                          v-if="line.item_name"
                          class="flex items-center gap-1 truncate text-xs text-ink-gray-8"
                          :title="
                            __('In the shop: {0}', [line.item_name], 'Lista')
                          "
                          data-lista-tienda
                        >
                          <span
                            class="lucide-store size-3 flex-none text-ink-gray-5"
                            aria-hidden="true"
                          />
                          <span class="truncate">{{ line.item_name }}</span>
                        </span>
                        <span
                          class="flex items-center gap-1.5 text-xs text-ink-gray-6"
                        >
                          <span
                            v-if="flash[line.name]"
                            class="inline-flex flex-none items-center gap-1 rounded-full bg-surface-amber-2 px-1.5 text-[11px] font-medium text-ink-amber-8"
                            data-lista-quien
                          >
                            <span
                              v-if="flash[line.name].bot"
                              class="lucide-sparkles size-3"
                              aria-hidden="true"
                            />
                            {{ flashLabel(flash[line.name]) }}
                          </span>
                          <span class="truncate">{{ codeAndSpecs(line) }}</span>
                        </span>
                      </span>
                    </button>
                  </td>
                  <td
                    class="num border-t border-outline-gray-1 py-1.5 pr-3 text-right tabular-nums"
                  >
                    <span
                      v-for="t in tierCells(line, qtyOf(line))"
                      :key="t.min_qty"
                      class="block leading-tight"
                      :class="
                        t.active
                          ? 'font-semibold text-ink-gray-9'
                          : t.min_qty > 1
                            ? 'text-xs text-ink-gray-6'
                            : 'text-ink-gray-8'
                      "
                    >
                      <span v-if="t.min_qty > 1" class="text-ink-gray-5"
                        >{{ t.min_qty }}+</span
                      >
                      {{ money(t.price, line.currency) }}
                    </span>
                  </td>
                  <td
                    class="border-t border-outline-gray-1 py-1.5 pr-3 text-right"
                    data-lista-comparar
                  >
                    <span class="flex items-center justify-end gap-2">
                      <span
                        class="num flex min-w-0 flex-col items-end gap-0.5 text-xs leading-tight tabular-nums"
                      >
                        <ChangeCell :line="line" />
                        <span
                          v-if="line.other"
                          class="max-w-[10rem] truncate"
                          :class="
                            otherGap(line) > 0
                              ? 'font-medium text-ink-gray-9'
                              : 'text-ink-gray-6'
                          "
                          :title="
                            __(
                              '{0} lists it at {1} ({2})',
                              [
                                line.other.supplier_name,
                                money(line.other.price, line.other.currency),
                                formatDate(line.other.date, {
                                  relative: false,
                                }),
                              ],
                              'Lista',
                            )
                          "
                          >{{
                            __(
                              '{0} at {1}',
                              [
                                line.other.supplier_name,
                                money(line.other.price, line.other.currency),
                              ],
                              'Lista',
                            )
                          }}</span
                        >
                        <span
                          v-if="data.cost_visible && line.paid"
                          class="text-ink-gray-6"
                          >{{
                            __(
                              'Paid {0}, {1}',
                              [
                                money(line.paid.rate, line.currency),
                                formatDate(line.paid.date, { relative: false }),
                              ],
                              'Lista',
                            )
                          }}</span
                        >
                      </span>
                      <ListaHistoriaMini
                        v-if="stories[line.name]?.length > 1"
                        :points="stories[line.name]"
                        :currency="line.currency || currency"
                      />
                    </span>
                  </td>
                  <td
                    class="num border-t border-outline-gray-1 py-1.5 pr-3 text-right text-xs tabular-nums"
                  >
                    <StockCell :line="line" />
                  </td>
                  <td class="border-t border-outline-gray-1 py-1.5 text-center">
                    <ListaStepper
                      :qty="qtyOf(line)"
                      :disabled="!canOrder"
                      :label="__('Quantity of {0}', [lineTitle(line)], 'Lista')"
                      @step="(d) => step(line.name, d)"
                      @set="(v) => setQty(line.name, v)"
                    />
                  </td>
                  <td
                    class="num border-t border-outline-gray-1 py-1.5 pr-2 text-right tabular-nums"
                    :class="
                      qtyOf(line)
                        ? 'font-semibold text-ink-gray-9'
                        : 'text-ink-gray-4'
                    "
                  >
                    {{
                      qtyOf(line)
                        ? money(rowTotal(rows[line.name], line), line.currency)
                        : '—'
                    }}
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- phone: rows with the stepper beside each -->
            <template v-else>
              <section
                v-for="s in rendered"
                :key="s.name || '—'"
                :aria-labelledby="sectionId(s.name)"
              >
                <h2
                  :id="sectionId(s.name)"
                  class="title-face sticky top-0 z-[1] flex items-baseline gap-2 bg-surface-base px-4 pb-1 pt-4 text-base font-semibold text-ink-gray-9"
                >
                  {{ s.name || __('No section', null, 'Lista') }}
                  <span class="num text-xs font-normal text-ink-gray-5">{{
                    s.total ?? s.lines.length
                  }}</span>
                </h2>
                <ul class="divide-y divide-outline-gray-1">
                  <li
                    v-for="line in s.lines"
                    :key="line.name"
                    class="flex items-center gap-2 py-2 pl-4 pr-3 transition-colors duration-700"
                    :class="
                      flash[line.name]
                        ? 'bg-surface-amber-1'
                        : qtyOf(line)
                          ? 'bg-surface-gray-1'
                          : ''
                    "
                    :data-lista-linea="line.name"
                    :data-lista-cambio="flash[line.name] ? '' : undefined"
                  >
                    <button
                      type="button"
                      class="press flex min-w-0 flex-1 items-center gap-3 text-left"
                      @click="openLine(line)"
                    >
                      <span
                        class="flex size-11 flex-none items-center justify-center overflow-hidden rounded-6 bg-surface-gray-2 max-[359px]:hidden"
                      >
                        <img
                          v-if="line.photo"
                          :src="line.photo"
                          alt=""
                          class="size-full object-cover"
                          loading="lazy"
                        />
                        <span
                          v-else
                          class="lucide-smartphone size-5 text-ink-gray-4"
                          aria-hidden="true"
                        />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="flex items-start gap-1.5">
                          <span
                            class="line-clamp-2 break-words font-medium leading-snug text-ink-gray-9"
                            :title="lineTitle(line)"
                            >{{ lineTitle(line) }}</span
                          >
                          <span
                            v-if="line.promo"
                            class="lucide-gift mt-0.5 size-3.5 flex-none text-ink-gray-6"
                            aria-hidden="true"
                          />
                        </span>
                        <span
                          v-if="flash[line.name]"
                          class="mt-0.5 inline-flex items-center gap-1 rounded-full bg-surface-amber-2 px-1.5 text-[11px] font-medium text-ink-amber-8"
                          data-lista-quien
                        >
                          <span
                            v-if="flash[line.name].bot"
                            class="lucide-sparkles size-3"
                            aria-hidden="true"
                          />
                          {{ flashLabel(flash[line.name]) }}
                        </span>
                        <span
                          v-if="line.item_name"
                          class="block truncate text-xs text-ink-gray-8"
                          data-lista-tienda
                          >{{
                            __('In the shop: {0}', [line.item_name], 'Lista')
                          }}</span
                        >
                        <span class="block truncate text-xs text-ink-gray-6">{{
                          codeAndSpecs(line)
                        }}</span>
                        <span
                          class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs"
                        >
                          <span class="num font-semibold text-ink-gray-9">{{
                            money(unitPrice(line, qtyOf(line)), line.currency)
                          }}</span>
                          <ChangeCell :line="line" compact />
                          <span
                            v-if="nextTier(line, qtyOf(line))"
                            class="num text-ink-gray-5"
                          >
                            {{
                              __(
                                '{0}+ at {1}',
                                [
                                  nextTier(line, qtyOf(line)).missing +
                                    qtyOf(line),
                                  money(
                                    nextTier(line, qtyOf(line)).price,
                                    line.currency,
                                  ),
                                ],
                                'Lista',
                              )
                            }}
                          </span>
                          <StockCell :line="line" compact />
                        </span>
                        <span
                          v-if="line.other || (data.cost_visible && line.paid)"
                          class="num mt-0.5 block truncate text-xs text-ink-gray-6"
                          data-lista-comparar
                          >{{
                            [
                              line.other
                                ? __(
                                    '{0} at {1}',
                                    [
                                      line.other.supplier_name,
                                      money(
                                        line.other.price,
                                        line.other.currency,
                                      ),
                                    ],
                                    'Lista',
                                  )
                                : '',
                              data.cost_visible && line.paid
                                ? __(
                                    'Paid {0}, {1}',
                                    [
                                      money(line.paid.rate, line.currency),
                                      formatDate(line.paid.date, {
                                        relative: false,
                                      }),
                                    ],
                                    'Lista',
                                  )
                                : '',
                            ]
                              .filter(Boolean)
                              .join(', ')
                          }}</span
                        >
                      </span>
                    </button>
                    <span class="flex flex-none flex-col items-end gap-0.5">
                      <ListaStepper
                        :qty="qtyOf(line)"
                        :disabled="!canOrder"
                        large
                        :label="
                          __('Quantity of {0}', [lineTitle(line)], 'Lista')
                        "
                        @step="(d) => step(line.name, d)"
                        @set="(v) => setQty(line.name, v)"
                      />
                      <span
                        v-if="qtyOf(line)"
                        class="num text-xs font-semibold tabular-nums text-ink-gray-9"
                      >
                        {{
                          money(rowTotal(rows[line.name], line), line.currency)
                        }}
                      </span>
                    </span>
                  </li>
                </ul>
              </section>
            </template>

            <!-- a long list draws more rows as the buyer nears its end -->
            <div
              v-if="moreToShow"
              ref="moreRows"
              class="flex items-center justify-between gap-3 px-4 py-4 text-xs text-ink-gray-6 lg:px-2"
              data-lista-mas
            >
              <span class="num tabular-nums">{{
                __(
                  '{0} of {1} lines shown',
                  [renderedCount, shownCount],
                  'Lista',
                )
              }}</span>
              <button
                type="button"
                :class="[chipClass(false), 'min-h-9']"
                @click="showMore"
              >
                {{ __('Show more', null, 'Lista') }}
              </button>
            </div>
          </div>

          <!-- desktop: the order at a glance -->
          <aside
            v-if="!phone"
            class="hidden lg:sticky lg:top-4 lg:block"
            :aria-label="__('Order to the supplier', null, 'Lista')"
            data-lista-resumen
          >
            <div class="rounded-8 border border-outline-gray-2 p-4">
              <p class="title-face text-base font-semibold text-ink-gray-9">
                {{ __('Order to the supplier', null, 'Lista') }}
              </p>
              <p class="mt-0.5 text-xs text-ink-gray-6">
                {{
                  catalog.supplier_name ||
                  __('No supplier named', null, 'Lista')
                }}
              </p>
              <template v-if="draft.lines">
                <dl
                  class="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm"
                >
                  <dt class="text-ink-gray-6">
                    {{
                      __(
                        '{0} pieces · {1} models',
                        [draft.pieces, draft.lines],
                        'Lista',
                      )
                    }}
                  </dt>
                  <dd class="num text-right tabular-nums">
                    {{ money(totals.base_total, currency) }}
                  </dd>
                  <template v-if="totals.savings > 0">
                    <dt class="text-ink-gray-6">
                      {{ __('Tier prices save', null, 'Lista') }}
                    </dt>
                    <dd class="num text-right tabular-nums text-ink-green-7">
                      −{{ money(totals.savings, currency) }}
                    </dd>
                  </template>
                  <template v-if="totals.discounts > 0">
                    <dt class="text-ink-gray-6">
                      {{ __('Promo discounts', null, 'Lista') }}
                    </dt>
                    <dd class="num text-right tabular-nums text-ink-green-7">
                      −{{ money(totals.discounts, currency) }}
                    </dd>
                  </template>
                  <dt class="pt-1 text-base font-semibold text-ink-gray-9">
                    {{
                      sharedOrder
                        ? __('This list', null, 'Lista')
                        : __('Total', null, 'Lista')
                    }}
                  </dt>
                  <dd
                    class="num pt-1 text-right text-base font-semibold tabular-nums text-ink-gray-9"
                  >
                    {{ money(shownTotal, currency) }}
                  </dd>
                </dl>
                <dl
                  v-if="sharedOrder"
                  class="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-outline-gray-1 pt-3 text-sm"
                  data-lista-pedido-completo
                >
                  <template v-for="list in others" :key="list.name">
                    <dt class="truncate text-ink-gray-6">
                      <RouterLink
                        :to="{
                          name: 'CompraLista',
                          params: { name: list.name },
                        }"
                        class="underline-offset-2 hover:underline"
                        >{{ listLabel(list) }}</RouterLink
                      >
                    </dt>
                    <dd class="num text-right tabular-nums">
                      {{ money(list.amount, currency) }}
                    </dd>
                  </template>
                  <dt class="pt-1 font-semibold text-ink-gray-9">
                    {{ __('Whole order, {0} pieces', [wholePieces], 'Lista') }}
                  </dt>
                  <dd
                    class="num pt-1 text-right font-semibold tabular-nums text-ink-gray-9"
                  >
                    {{ money(wholeTotal, currency) }}
                  </dd>
                </dl>
                <p
                  v-if="totals.over_ceiling"
                  class="mt-1 text-xs text-ink-amber-9"
                >
                  {{
                    __(
                      'Over the budget of {0}',
                      [money(totals.ceiling, currency)],
                      'Lista',
                    )
                  }}
                </p>
                <ul v-if="promoSentences.length" class="mt-3 space-y-1 text-xs">
                  <li
                    v-for="(p, i) in promoSentences.slice(0, 3)"
                    :key="i"
                    class="flex items-start gap-1.5"
                    :class="p.reached ? 'text-ink-gray-9' : 'text-ink-gray-6'"
                  >
                    <span
                      :class="[
                        p.reached ? 'lucide-check' : 'lucide-gift',
                        'mt-0.5 size-3.5 flex-none',
                      ]"
                      aria-hidden="true"
                    />
                    {{ p.text }}
                  </li>
                </ul>
                <button
                  type="button"
                  :class="['press mt-4 w-full', BTN.filled]"
                  @click="openPedido"
                >
                  <span class="lucide-send size-5" aria-hidden="true" />
                  {{ __('Send the order', null, 'Lista') }}
                </button>
                <div
                  class="mt-2 flex items-center justify-center gap-1 rounded-full bg-surface-gray-1 p-1"
                  role="group"
                  :aria-label="__('The order as a file', null, 'Lista')"
                >
                  <a
                    v-for="link in fileLinks"
                    :key="link.key"
                    :href="link.href"
                    target="_blank"
                    rel="noopener"
                    class="press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-xs text-ink-gray-8 hover:bg-surface-gray-2"
                    :title="link.label"
                  >
                    <span :class="[link.icon, 'size-4']" aria-hidden="true" />
                    {{ link.label }}
                  </a>
                </div>
              </template>
              <p v-else-if="!data.owner" class="mt-3 text-sm text-ink-gray-6">
                {{ __('Only the owner builds orders.', null, 'Lista') }}
              </p>
              <p v-else-if="!canOrder" class="mt-3 text-sm text-ink-gray-6">
                {{
                  __(
                    'Name the supplier of this list in Restock before ordering from it.',
                    null,
                    'Lista',
                  )
                }}
              </p>
              <p v-else class="mt-3 text-sm text-ink-gray-6">
                {{
                  sharedOrder
                    ? __(
                        'The order to {0} already has {1} from its other lists; what you set here adds to it.',
                        [catalog.supplier_name, money(wholeTotal, currency)],
                        'Lista',
                      )
                    : __(
                        'Set quantities on the lines and the order builds itself here.',
                        null,
                        'Lista',
                      )
                }}
              </p>
            </div>
            <section
              v-if="showTypes"
              class="mt-4 rounded-8 border border-outline-gray-2 p-4"
              :aria-label="__('By product type', null, 'Lista')"
              data-lista-por-tipo
            >
              <p class="title-face text-base font-semibold text-ink-gray-9">
                {{ __('By product type', null, 'Lista') }}
              </p>
              <p class="mt-0.5 text-xs text-ink-gray-6">
                {{
                  __(
                    "The whole order against this month's budget, and what you bought before",
                    null,
                    'Lista',
                  )
                }}
              </p>
              <ListaTipos
                class="mt-2"
                :groups="orderTypes"
                :currency="currency"
                :supplier-name="catalog.supplier_name"
              />
            </section>
            <dl
              class="mt-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-1 text-xs text-ink-gray-6"
            >
              <template v-if="catalog.pictures">
                <dt>{{ __('Pictures', null, 'Lista') }}</dt>
                <dd class="num text-right">{{ catalog.pictures }}</dd>
              </template>
              <template v-else-if="catalog.page_count">
                <dt>{{ __('Pages', null, 'Lista') }}</dt>
                <dd class="num text-right">{{ catalog.page_count }}</dd>
              </template>
              <dt>{{ __('Promos', null, 'Lista') }}</dt>
              <dd class="text-right">
                <button
                  type="button"
                  class="num underline-offset-2 hover:underline"
                  @click="openPromos"
                >
                  {{ activePromos.length }}
                </button>
              </dd>
              <template v-if="catalog.previous">
                <dt>{{ __('Previous list', null, 'Lista') }}</dt>
                <dd class="text-right">
                  <RouterLink
                    :to="{
                      name: 'CompraLista',
                      params: { name: catalog.previous.name },
                    }"
                    class="underline-offset-2 hover:underline"
                  >
                    {{
                      formatDate(catalog.previous.date, { relative: false }) ||
                      catalog.previous.title
                    }}
                  </RouterLink>
                </dd>
              </template>
            </dl>
            <!-- after a receipt: the supplier's models the list dropped -->
            <button
              v-if="retireCount"
              type="button"
              class="press mt-3 flex min-h-11 w-full items-center gap-2 rounded-6 border border-outline-gray-2 px-3 text-left text-sm hover:bg-surface-gray-1"
              data-lista-retiro
              @click="openRetiro"
            >
              <span
                class="lucide-archive size-4 flex-none text-ink-gray-6"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-ink-gray-9">{{
                  __('Models the list no longer carries', null, 'Lista')
                }}</span>
                <span class="block text-xs text-ink-gray-6">{{
                  __(
                    '{0} waiting to archive, delete or keep',
                    [retireCount],
                    'Lista',
                  )
                }}</span>
              </span>
              <span class="num text-base font-semibold tabular-nums">{{
                retireCount
              }}</span>
            </button>
          </aside>
        </div>

        <!-- phone: the sum, at the thumb -->
        <div
          v-if="phone && (draft.lines || sharedOrder)"
          class="sticky bottom-0 z-10 mt-4 flex items-center gap-3 border-t border-outline-gray-1 bg-surface-base px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
          data-lista-suma
        >
          <p class="min-w-0 flex-1 text-sm">
            <span class="block text-ink-gray-7">{{
              __(
                '{0} pieces · {1} models',
                [draft.pieces, draft.lines],
                'Lista',
              )
            }}</span>
            <span
              class="num block text-base font-semibold tabular-nums text-ink-gray-9"
              >{{ money(shownTotal, currency) }}</span
            >
            <span
              v-if="sharedOrder"
              class="num block text-xs tabular-nums text-ink-gray-6"
              data-lista-suma-completa
              >{{
                __('Whole order, {0}', [money(wholeTotal, currency)], 'Lista')
              }}</span
            >
            <span
              v-if="totals.over_ceiling"
              class="block text-xs text-ink-amber-9"
              >{{
                __(
                  'Over the budget of {0}',
                  [money(totals.ceiling, currency)],
                  'Lista',
                )
              }}</span
            >
          </p>
          <button
            type="button"
            :class="['press', BTN.filled]"
            @click="openPedido"
          >
            <span class="lucide-shopping-cart size-5" aria-hidden="true" />
            {{ __('See the order', null, 'Lista') }}
          </button>
        </div>
      </template>
    </div>

    <!-- a drop over the page -->
    <div
      v-if="dragging && data?.owner"
      class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-surface-base/80 p-6"
      aria-hidden="true"
    >
      <p
        class="rounded-8 border-2 border-dashed border-outline-gray-4 px-6 py-4 text-center text-base font-medium text-ink-gray-9"
      >
        {{
          __(
            'Drop the pictures of the list, or its PDF or spreadsheet',
            null,
            'Lista',
          )
        }}
      </p>
    </div>
    <input
      ref="fileInput"
      type="file"
      class="sr-only"
      multiple
      :accept="LIST_ACCEPT"
      tabindex="-1"
      data-lista-archivos
      @change="pickFiles"
    />

    <!-- sheets: each mounts on its first open -->
    <ListaLinea
      v-if="used.linea && data"
      v-model:open="lineOpen"
      :line="currentLine"
      :row="currentLine ? rows[currentLine.name] : null"
      :owner="data.owner"
      :cost-visible="data.cost_visible"
      :currency="currentLine?.currency || currency"
      :supplier="catalog.supplier"
      :photo-busy="busy === 'photo'"
      :linking="busy === 'link'"
      @step="(line, d) => step(line.name, d)"
      @set="(line, v) => setQty(line.name, v)"
      @edit="openForm"
      @link="linkItem"
      @photo="setPhoto"
    />
    <ListaForma
      v-if="used.forma && data"
      v-model:open="formOpen"
      :line="formLine"
      :sections="sectionOptions.map((o) => o.value).filter(Boolean)"
      :brands="brands"
      :busy="busy === 'form'"
      :problem="formProblem"
      @save="saveForm"
    />
    <ListaPromos
      v-if="used.promos && data"
      v-model:open="promosOpen"
      :promos="data.promos"
      :owner="data.owner"
      :busy="busy === 'promo'"
      @add="addPromo"
      @update="updatePromo"
      @remove="removePromo"
    />
    <ListaPedido
      v-if="used.pedido && data"
      v-model:open="pedidoOpen"
      :catalog="props.name"
      :pedido="pedido"
      :totals="wholeTotals"
      :rows="rows"
      :others="others"
      :groups="orderTypes"
      :order-lines="orderLineCount"
      :lines="linesByName"
      :currency="currency"
      :owner="data.owner"
      :can-order="canOrder"
      :supplier-name="catalog.supplier_name"
      @step="step"
      @set="setQty"
      @ceiling="setCeiling"
      @line="(name) => openLine(linesByName[name])"
      @list="openList"
      @sent="onSent"
    />
    <ListaRetiro
      v-if="used.retiro && data"
      v-model:open="retiroOpen"
      :rows="data.retire?.rows || []"
      :owner="data.owner"
      :busy="busy === 'retiro'"
      :problem="retiroProblem"
      @act="retireAct"
      @refresh="retireRefresh"
    />
    <ListaTipo
      v-if="used.tipo && data"
      v-model:open="tipoOpen"
      :title="catalog.title"
      :value="catalog.item_group || ''"
      :options="data.type_options || []"
      :busy="busy === 'tipo'"
      :problem="tipoProblem"
      @save="saveTipo"
    />
  </div>
</template>

<script setup>
import {
  computed,
  defineAsyncComponent,
  getCurrentInstance,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import {
  AppBar,
  ChipGroup,
  EmptyState,
  Segmented,
  chipClass,
} from '@/components/ui'
import AccionesMenu from '@/components/documentos/AccionesMenu.vue'
import ListaStepper from '@/components/compras/lista/ListaStepper.vue'
import ListaTipos from '@/components/compras/lista/ListaTipos.vue'
import ListaHistoriaMini from '@/components/compras/lista/ListaHistoriaMini.vue'
import ListaPresencia from '@/components/compras/lista/ListaPresencia.vue'
import { liveHub } from '@/composables/liveHub'
import { sessionStore } from '@/stores/session'
import { usersStore } from '@/stores/users'
import { useLiveWatch } from '@/vendor/muelle-shell/live-sync/vue'
import { isMobile as phone } from '@/composables/breakpoint'
import { comprasApi, money, problemOf } from '@/composables/useCompras'
import { BTN } from '@/documentos/tools'
import { formatDate } from '@/utils/display'
import { progressOf, progressView } from '@/utils/catalogProgress'
import {
  addPictures as addPicturesTo,
  postPicture,
  uploadCatalog,
  uploadPictures,
} from '@/utils/catalogUpload'
import {
  belowLevel,
  canReadMore,
  changeOf,
  draftCounts,
  dropFiles,
  filterCounts,
  firstLines,
  mergeLines,
  FILTERS,
  LIST_ACCEPT,
  nextTier,
  otherGap,
  pastedPictures,
  rowTotal,
  specParts,
  stepQty,
  tierCells,
  toTarget,
  unitPrice,
  visibleSections,
} from '@/utils/listaPrecios'
import {
  listLabel,
  otherLists,
  supplierLists,
  typeRows,
} from '@/utils/hojaPedido'
import {
  BOT_PRESENT_MS,
  FLASH_MS,
  LIVE_EVENT,
  ORDER_DOCTYPE,
  changedLines,
  concerns,
  editorOf,
  othersIn,
  storiesToAsk,
  viewerName,
} from '@/utils/listaVivo'

const ListaLinea = defineAsyncComponent(
  () => import('@/components/compras/lista/ListaLinea.vue'),
)
const ListaForma = defineAsyncComponent(
  () => import('@/components/compras/lista/ListaForma.vue'),
)
const ListaPromos = defineAsyncComponent(
  () => import('@/components/compras/lista/ListaPromos.vue'),
)
const ListaPedido = defineAsyncComponent(
  () => import('@/components/compras/lista/ListaPedido.vue'),
)
const ListaRetiro = defineAsyncComponent(
  () => import('@/components/compras/lista/ListaRetiro.vue'),
)
const ListaTipo = defineAsyncComponent(
  () => import('@/components/compras/lista/ListaTipo.vue'),
)

const props = defineProps({
  /** The Catalogo Proveedor. */
  name: { type: String, required: true },
})

const API = 'doco.workspaces.lista_precios.'
const SOURCING = 'doco.workspaces.sourcing.'
const EXPORT = '/api/method/doco.workspaces.lista_precios.export'
const call = (method, args = {}) => comprasApi(API + method, args)
const router = useRouter()

// Page-local tones (no shared status module: Deals' chunk stays where it is).
const STRIP_TONE = {
  neutral: 'bg-surface-gray-1 text-ink-gray-8',
  warning: 'bg-surface-amber-1 text-ink-amber-9',
  danger: 'bg-surface-red-1 text-ink-red-7',
}
const SETTLING = ['Recibido', 'Indexando', 'En cola']
const POLL_MS = 5000
const QTY_WAIT_MS = 400

const data = ref(null)
const rows = ref({})
const totals = ref({})
const orderTotals = ref({})
const orderParts = ref({ lists: {}, groups: [] })
const pedido = ref(null)
const guard = ref(null)
const problem = ref(null)
const loading = ref(false)
const busy = ref('')
const scroller = ref(null)
const fileInput = ref(null)

const search = ref('')
const query = ref('')
const searchOpen = ref(false)
const filter = ref('')
const section = ref('')
let searchTimer = null
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => (query.value = value.trim()), 250)
})

const catalog = computed(() => data.value?.catalog || {})
const canOrder = computed(() => Boolean(data.value?.can_order))
const currency = computed(() => {
  for (const s of data.value?.sections || [])
    for (const l of s.lines) if (l.currency) return l.currency
  return 'MXN'
})
const title = computed(
  () =>
    catalog.value.supplier_name ||
    catalog.value.title ||
    __('Price list', null, 'Lista'),
)
const context = computed(() =>
  catalog.value.list_date
    ? __(
        'List of {0}',
        [formatDate(catalog.value.list_date, { relative: false })],
        'Lista',
      )
    : __('Price list', null, 'Lista'),
)

const linesByName = computed(() => {
  const map = {}
  for (const s of data.value?.sections || [])
    for (const line of s.lines) map[line.name] = line
  return map
})
const lineCount = computed(() => Object.keys(linesByName.value).length)
const activePromos = computed(() =>
  (data.value?.promos || []).filter((p) => p.active !== false),
)
// A long list opens on what the order holds: searching, a filter or a section
// browse the whole list to add from it. A line taken back to 0 stays in the
// order view until the page opens again, so a slip is one tap to undo.
const view = ref('pedido')
const kept = reactive(new Set())
watch(
  rows,
  (next) => {
    for (const [name, row] of Object.entries(next || {}))
      if (Number(row?.qty) > 0) kept.add(name)
  },
  { deep: true, immediate: true },
)
const browsing = computed(() =>
  Boolean(query.value || filter.value || section.value),
)
const orderView = computed(
  () => canOrder.value && view.value === 'pedido' && !browsing.value,
)
const viewOptions = computed(() => [
  {
    value: 'pedido',
    label: __('In the order', null, 'Lista'),
    count: draft.value.lines,
  },
  {
    value: 'lista',
    label: __('Whole list', null, 'Lista'),
    count: lineCount.value,
  },
])
function pickView(value) {
  if (value === 'pedido') clearFilters()
  view.value = value
  scroller.value?.scrollTo?.({ top: 0 })
}
const searchLabel = computed(() =>
  orderView.value
    ? __('Search the list to add', null, 'Lista')
    : __('Search brand, model or code', null, 'Lista'),
)
const visible = computed(() =>
  data.value
    ? visibleSections(data.value.sections, {
        search: query.value,
        filter: filter.value,
        section: section.value,
        rows: rows.value,
        promos: data.value.promos,
        only: orderView.value ? kept : null,
      })
    : [],
)
// Where an empty order view sends the buyer first: the lines the shop runs
// short of, then what is new, on promo or cheaper.
const START_FILTERS = ['bajo', 'nuevos', 'promo', 'bajaron']
const startOptions = computed(() =>
  START_FILTERS.map((f) => ({
    value: f,
    label: FILTER_LABELS[f](),
    count: counts.value[f] || 0,
  })).filter((o) => o.count),
)
const shownCount = computed(() =>
  visible.value.reduce((n, s) => n + s.lines.length, 0),
)
// A long list draws its rows a step at a time as the buyer nears the end (and
// from «Mostrar más»): ten thousand rows drawn at once take seconds, and every
// tap or keystroke draws them again.
const moreRows = ref(null)
const shownLimit = ref(0)
const rowsStep = () => (phone.value ? 60 : 150)
const rendered = computed(() =>
  firstLines(visible.value, shownLimit.value || rowsStep()),
)
const renderedCount = computed(() =>
  rendered.value.reduce((n, s) => n + s.lines.length, 0),
)
const moreToShow = computed(() => shownCount.value > renderedCount.value)
function showMore() {
  shownLimit.value = (shownLimit.value || rowsStep()) + rowsStep()
}
watch([query, filter, section, view, () => props.name], () => {
  shownLimit.value = 0
})
watch(moreRows, (el, _, onCleanup) => {
  if (!el || typeof IntersectionObserver === 'undefined') return
  const near = new IntersectionObserver(
    async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      showMore()
      await nextTick()
      // short rows can leave the end in reach after a step: look again
      near.unobserve(el)
      near.observe(el)
    },
    { root: scroller.value, rootMargin: '0px 0px 1200px 0px' },
  )
  near.observe(el)
  onCleanup(() => near.disconnect())
})
const counts = computed(() =>
  data.value
    ? filterCounts(data.value.sections, rows.value, data.value.promos)
    : {},
)
const FILTER_LABELS = {
  nuevos: () => __('New', null, 'Lista'),
  subieron: () => __('Went up', null, 'Lista'),
  bajaron: () => __('Went down', null, 'Lista'),
  promo: () => __('With promo', null, 'Lista'),
  pedido: () => __('In the order', null, 'Lista'),
  bajo: () => __('Below level', null, 'Lista'),
}
// «In the order» is the view switch now, not a filter chip.
const filterOptions = computed(() =>
  FILTERS.filter((f) => f !== 'pedido').map((f) => ({
    value: f,
    label: FILTER_LABELS[f](),
    count: counts.value[f] || 0,
  })),
)
const sectionOptions = computed(() =>
  (data.value?.sections || []).map((s) => ({
    value: s.name,
    label: s.name || __('No section', null, 'Lista'),
    count: s.lines.length,
  })),
)
const brands = computed(() =>
  [
    ...new Set(
      Object.values(linesByName.value)
        .map((l) => l.brand)
        .filter(Boolean),
    ),
  ].sort(),
)
const activeChips = computed(() => {
  const chips = []
  if (filter.value)
    chips.push({
      key: 'filter',
      label: FILTER_LABELS[filter.value](),
      remove: () => (filter.value = ''),
    })
  if (section.value)
    chips.push({
      key: 'section',
      label: section.value,
      remove: () => (section.value = ''),
    })
  return chips
})
function clearFilters() {
  filter.value = ''
  section.value = ''
  search.value = ''
  query.value = ''
}
const sectionId = (name) =>
  `lista-seccion-${String(name || 'sin').replace(/[^\w-]+/g, '-')}`
const lineTitle = (line) =>
  [line.brand, line.model].filter(Boolean).join(' ') ||
  line.name1 ||
  line.code ||
  ''
const qtyOf = (line) => Number(rows.value[line.name]?.qty || 0)

// The draft: pieces, the total while a tap settles, the promo sentences.
const draft = computed(() => draftCounts(rows.value))
const pendingQty = reactive({})
const localTotal = computed(() =>
  Object.values(rows.value).reduce(
    (sum, r) => sum + rowTotal(r, linesByName.value[r.catalogo_linea]),
    0,
  ),
)
const shownTotal = computed(() =>
  Object.keys(pendingQty).length
    ? localTotal.value
    : Number(totals.value.total || 0),
)
const who = (p) =>
  [p.brand, p.model].filter(Boolean).join(' ') || __('pieces', null, 'Lista')
const promoSentences = computed(() => {
  const out = []
  for (const p of totals.value.promos_reached || [])
    out.push({
      reached: true,
      text:
        p.kind === 'Descuento'
          ? __(
              '{0} off with {1} {2}',
              [money(p.amount, currency.value), p.pieces, who(p)],
              'Lista',
            )
          : __(
              '{0} × {1} with {2} {3}',
              [p.times, p.gift || p.text, p.pieces, who(p)],
              'Lista',
            ),
    })
  for (const p of totals.value.promos_short || [])
    out.push({
      reached: false,
      text:
        p.kind === 'Descuento'
          ? __('{0} more {1} reach the discount', [p.missing, who(p)], 'Lista')
          : __(
              'Take {0} more {1} for the {2}',
              [p.missing, who(p), p.gift || p.text],
              'Lista',
            ),
    })
  return out
})
// The supplier's lists and its one open order (doco.workspaces.hoja_pedido):
// this list's rows are the page's, the others' show as their sums.
const sheet = computed(() => data.value?.sheet || null)
const supplierTabs = computed(() =>
  supplierLists(sheet.value?.lists, orderParts.value.lists, props.name),
)
const others = computed(() => otherLists(supplierTabs.value, props.name))
const sharedOrder = computed(() => others.value.length > 0)
const wholeTotals = computed(() =>
  orderTotals.value.total !== undefined ? orderTotals.value : totals.value,
)
const wholeTotal = computed(
  () =>
    Number(wholeTotals.value.total || 0) -
    Number(totals.value.total || 0) +
    shownTotal.value,
)
const wholePieces = computed(() =>
  others.value.reduce((n, l) => n + l.pieces, draft.value.pieces || 0),
)
const orderLineCount = computed(() =>
  Object.values(orderParts.value.lists || {}).reduce(
    (n, l) => n + Number(l.lines || 0),
    0,
  ),
)
const orderTypes = computed(() =>
  typeRows(orderParts.value.groups, sheet.value?.history),
)
const showTypes = computed(() =>
  orderTypes.value.some(
    (g) => g.item_group || g.budget || (g.history && g.history.length),
  ),
)
const tabState = (list) =>
  SETTLING.includes(list.status)
    ? __('Reading', null, 'Lista')
    : formatDate(list.date, { relative: false }) || ''
function openList(name) {
  pedidoOpen.value = false
  router.push({ name: 'CompraLista', params: { name } })
}

const exportUrl = (format) =>
  `${EXPORT}?catalogo=${encodeURIComponent(props.name)}&format=${format}`
const printUrl = computed(() =>
  pedido.value
    ? `/printview?doctype=Pedido%20Catalogo&name=${encodeURIComponent(pedido.value.pedido)}&format=Pedido%20a%20proveedor`
    : '',
)
const fileLinks = computed(() =>
  pedido.value
    ? [
        {
          key: 'xlsx',
          label: 'Excel',
          icon: 'lucide-file-spreadsheet',
          href: exportUrl('xlsx'),
        },
        {
          key: 'pdf',
          label: 'PDF',
          icon: 'lucide-file-text',
          href: exportUrl('pdf'),
        },
        {
          key: 'print',
          label: __('Print', null, 'Lista'),
          icon: 'lucide-printer',
          href: printUrl.value,
        },
      ]
    : [],
)

// Cells shared by the table and the phone rows: the change against the
// previous list, and the stock against the level.
const ChangeCell = {
  props: { line: { type: Object, required: true }, compact: Boolean },
  setup(p) {
    return () => {
      const change = changeOf(p.line)
      if (!change) return null
      if (change.kind === 'new')
        return h(
          'span',
          {
            class:
              'rounded-full bg-surface-blue-1 px-1.5 py-0.5 text-[11px] font-medium text-ink-blue-9',
          },
          __('Newly listed', null, 'Lista'),
        )
      if (change.kind === 'up' || change.kind === 'down') {
        const up = change.kind === 'up'
        const pct = change.pct === null ? '' : `${up ? '+' : ''}${change.pct} %`
        return h(
          'span',
          {
            class:
              'num inline-flex flex-col items-end leading-tight tabular-nums',
          },
          [
            h(
              'span',
              {
                class: [
                  'inline-flex items-center gap-0.5 text-xs font-medium',
                  up ? 'text-ink-red-7' : 'text-ink-green-7',
                ],
              },
              [
                h('span', {
                  class: [
                    up ? 'lucide-arrow-up-right' : 'lucide-arrow-down-right',
                    'size-3.5',
                  ],
                  'aria-hidden': 'true',
                }),
                pct,
              ],
            ),
            p.compact
              ? null
              : h(
                  'span',
                  { class: 'text-[11px] text-ink-gray-5' },
                  __(
                    'was {0}',
                    [money(change.oldPrice, p.line.currency)],
                    'Lista',
                  ),
                ),
          ],
        )
      }
      return p.compact
        ? null
        : h(
            'span',
            { class: 'text-xs text-ink-gray-4' },
            __('same', null, 'Lista'),
          )
    }
  },
}
const StockCell = {
  props: { line: { type: Object, required: true }, compact: Boolean },
  setup(p) {
    return () => {
      const line = p.line
      if (!line.item)
        return p.compact
          ? null
          : h(
              'span',
              { class: 'text-ink-gray-4' },
              __('not in the shop', null, 'Lista'),
            )
      const have = Number(line.stock?.have || 0)
      const ordered = Number(line.stock?.ordered || 0)
      const low = belowLevel(line)
      const missing = toTarget(line)
      const first = h(
        'span',
        {
          class: [
            'block',
            low ? 'font-medium text-ink-amber-9' : 'text-ink-gray-8',
          ],
        },
        ordered
          ? __('{0} in stock +{1} coming', [have, ordered], 'Lista')
          : __('{0} in stock', [have], 'Lista'),
      )
      if (p.compact) return first
      return h(
        'span',
        { class: 'inline-flex flex-col items-end leading-tight' },
        [
          first,
          line.level
            ? h(
                'span',
                { class: 'text-ink-gray-5' },
                missing
                  ? __(
                      'level {0} · {1} short',
                      [line.level.target, missing],
                      'Lista',
                    )
                  : __('level {0}', [line.level.target], 'Lista'),
              )
            : null,
        ],
      )
    }
  },
}

// Loading and polling while the list reads itself.
let poll = null
function clearPoll() {
  clearTimeout(poll)
  poll = null
}
const settling = computed(
  () =>
    Boolean(data.value) &&
    (SETTLING.includes(catalog.value.status) || Boolean(catalog.value.reading)),
)
function schedulePoll() {
  clearPoll()
  if (!settling.value) return
  poll = setTimeout(async () => {
    await follow()
    schedulePoll()
  }, POLL_MS)
}
// While a list is indexed and read, only its header and the lines written since
// the last look come back (lista_precios.avance), not the whole list; the whole
// list again when the read ends, when the counts disagree, or from a server
// without the call.
async function follow() {
  const cursor = data.value?.cursor
  if (cursor == null) return load({ quiet: true })
  try {
    const out = await call('avance', { catalogo: props.name, desde: cursor })
    if (!data.value || out?.catalog?.name !== catalog.value.name) return
    data.value.catalog = out.catalog
    if (out.promos) data.value.promos = out.promos
    mergeLines(data.value.sections, out.lines, out.gone)
    data.value.cursor = out.cursor
    if (out.count !== lineCount.value) await load({ quiet: true })
  } catch {
    await load({ quiet: true })
  }
}
watch(settling, (now, was) => {
  schedulePoll()
  if (was && !now) load({ quiet: true })
})

function applyState(out) {
  if (!out) return
  if ('pedido' in out) pedido.value = out.pedido
  if (out.totals) totals.value = out.totals
  if (out.order_totals) orderTotals.value = out.order_totals
  if (out.order) orderParts.value = out.order
  if (out.rows) {
    const next = { ...out.rows }
    for (const [line, qty] of Object.entries(pendingQty)) {
      if (qty > 0) next[line] = { ...(next[line] || blankRow(line)), qty }
      else delete next[line]
    }
    rows.value = next
  }
  if (out.promos && data.value) data.value.promos = out.promos
  if (out.line) mergeLine(out.line)
}
function mergeLine(line) {
  if (!data.value) return
  const sections = data.value.sections
  for (const s of sections) {
    const i = s.lines.findIndex((l) => l.name === line.name)
    if (i >= 0) {
      if (s.name === (line.section || '')) {
        s.lines.splice(i, 1, line)
        return
      }
      s.lines.splice(i, 1)
      break
    }
  }
  const target = sections.find((s) => s.name === (line.section || ''))
  if (target) target.lines.push(line)
  else sections.push({ name: line.section || '', lines: [line] })
}
async function load({ quiet = false } = {}) {
  if (!quiet) loading.value = true
  try {
    const out = await call('workbench', { catalogo: props.name })
    data.value = out
    applyState(out)
    guard.value = null
  } catch (error) {
    if (data.value) problem.value = problemOf(error)
    else guard.value = problemOf(error)
  } finally {
    loading.value = false
  }
}
async function run(key, fn) {
  busy.value = key
  problem.value = null
  try {
    return await fn()
  } catch (error) {
    problem.value = problemOf(error)
    return null
  } finally {
    busy.value = ''
  }
}

// Quantities: the row changes at once; the server hears 400 ms after the last tap.
const timers = new Map()
const seq = new Map()
function blankRow(lineName) {
  const line = linesByName.value[lineName]
  return {
    name: '',
    catalogo_linea: lineName,
    qty: 0,
    catalog_price: unitPrice(line, 0),
    tier_label: '',
    promo_note: '',
    status: 'Pendiente',
  }
}
function setQty(lineName, value) {
  if (!canOrder.value || !linesByName.value[lineName]) return
  const qty = Math.max(0, Math.round(Number(value) || 0))
  const line = linesByName.value[lineName]
  const next = { ...rows.value }
  if (qty > 0)
    next[lineName] = {
      ...(next[lineName] || blankRow(lineName)),
      qty,
      catalog_price: unitPrice(line, qty),
    }
  else delete next[lineName]
  rows.value = next
  pendingQty[lineName] = qty
  clearTimeout(timers.get(lineName))
  timers.set(
    lineName,
    setTimeout(() => flush(lineName), QTY_WAIT_MS),
  )
}
async function flush(lineName) {
  timers.delete(lineName)
  const qty = pendingQty[lineName]
  const n = (seq.get(lineName) || 0) + 1
  seq.set(lineName, n)
  ownWrites.set(lineName, Date.now())
  try {
    const out = await call('set_qty', {
      catalogo: props.name,
      line: lineName,
      qty,
    })
    ownWrites.set(lineName, Date.now())
    if (seq.get(lineName) !== n) return
    if (!timers.has(lineName)) delete pendingQty[lineName]
    applyState(out)
  } catch (error) {
    if (seq.get(lineName) !== n) return
    delete pendingQty[lineName]
    problem.value = problemOf(error)
    load({ quiet: true })
  }
}
const step = (lineName, delta) =>
  setQty(lineName, stepQty(rows.value[lineName]?.qty, delta))
async function setCeiling(value) {
  const out = await run('ceiling', () =>
    call('set_ceiling', { catalogo: props.name, ceiling: value }),
  )
  applyState(out)
}

// ── live: the order as a shared sheet ─────────────────────────────────────
// Another person, the Desk or Muelle changing this supplier's order shows here
// at once: the order part is read again (`estado`), the rows they changed are
// marked with who did it, and whoever has the order open shows beside the bolt.
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
const session = sessionStore()
const users = usersStore()
const OWN_MS = 3000
const ownWrites = new Map()
const flash = reactive({})
const flashTimers = new Map()
const viewers = ref([])
const botActive = ref(false)
let botTimer = null
let lastEditor = null
const people = computed(() =>
  viewers.value.map((user) => ({
    user,
    name:
      viewerName(user, users.getUser(user)?.full_name) ||
      __('Someone', null, 'Lista'),
  })),
)
const recentOwn = (line) => Date.now() - (ownWrites.get(line) || 0) < OWN_MS
const wroteJustNow = () =>
  [...ownWrites.values()].some((at) => Date.now() - at < OWN_MS)

function markChanges(changes) {
  const theirs = changes.filter((c) => !recentOwn(c.line))
  if (!theirs.length) return
  const who =
    lastEditor && Date.now() - lastEditor.at < FLASH_MS ? lastEditor : null
  for (const c of theirs) {
    kept.add(c.line)
    flash[c.line] = {
      bot: Boolean(who?.bot),
      name: who?.name || '',
      was: c.was,
      now: c.now,
    }
    clearTimeout(flashTimers.get(c.line))
    flashTimers.set(
      c.line,
      setTimeout(() => {
        delete flash[c.line]
        flashTimers.delete(c.line)
      }, FLASH_MS),
    )
  }
  const count = theirs.length
  toast.info(
    who?.bot
      ? __('Muelle changed {0} lines of the order', [count], 'Lista')
      : who?.name
        ? __('{0} changed {1} lines of the order', [who.name, count], 'Lista')
        : __('{0} lines of the order changed', [count], 'Lista'),
  )
}

let refreshing = null
let refreshAgain = false
function liveRefresh() {
  if (!data.value || !catalog.value.supplier) return null
  if (refreshing) {
    refreshAgain = true
    return refreshing
  }
  refreshing = (async () => {
    try {
      do {
        refreshAgain = false
        const before = rows.value
        const out = await call('estado', { catalogo: props.name })
        applyState(out)
        markChanges(changedLines(before, rows.value, pendingQty))
      } while (refreshAgain)
    } catch {
      // the next announcement or the hub's resync reads it again
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

function onOrderEvent(event) {
  if (!concerns(event, catalog.value.supplier)) return
  const who = editorOf(event, session.user)
  if (!who) return
  lastEditor = {
    ...who,
    name: who.bot ? 'Muelle' : who.name,
    at: Date.now(),
  }
  if (who.bot) {
    botActive.value = true
    clearTimeout(botTimer)
    botTimer = setTimeout(() => (botActive.value = false), BOT_PRESENT_MS)
  }
  liveRefresh()
}

useLiveWatch(
  liveHub(socket),
  ORDER_DOCTYPE,
  (batch) => {
    if (batch.full) return liveRefresh()
    if (wroteJustNow()) return null
    const mine = pedido.value?.pedido
    return mine && batch.names.includes(mine) ? liveRefresh() : null
  },
  { minIntervalMs: 1500 },
)

// presence: Frappe's open-document rooms say who else has the order open
let openDoc = null
function openPresence(name) {
  if (openDoc === (name || null)) return
  if (openDoc) socket?.emit?.('doc_close', ORDER_DOCTYPE, openDoc)
  viewers.value = []
  openDoc = name || null
  if (openDoc) socket?.emit?.('doc_open', ORDER_DOCTYPE, openDoc)
}
function onViewers(event) {
  if (event?.doctype === ORDER_DOCTYPE && event.docname === openDoc)
    viewers.value = othersIn(event.users, session.user)
}
function reopenPresence() {
  if (openDoc) socket?.emit?.('doc_open', ORDER_DOCTYPE, openDoc)
}
watch(() => pedido.value?.pedido, openPresence)
onMounted(() => {
  socket?.on?.(LIVE_EVENT, onOrderEvent)
  socket?.on?.('doc_viewers', onViewers)
  socket?.on?.('connect', reopenPresence)
})

/** «Muelle added it», «Karla, was 3»: who changed a row and from what. */
function flashLabel(f) {
  const who = f.bot
    ? 'Muelle'
    : String(f.name || '').split(/\s+/u)[0] || __('Someone', null, 'Lista')
  if (!f.was) return __('{0} added it', [who], 'Lista')
  if (!f.now) return __('{0} took it out', [who], 'Lista')
  return __('{0}, was {1}', [who, f.was], 'Lista')
}
/** The supplier's code, then what the line says it is. */
function codeAndSpecs(line) {
  return [
    line.code ? __('Code {0}', [line.code], 'Lista') : '',
    ...specParts(line),
    ...(line.tags || []),
  ]
    .filter(Boolean)
    .join(', ')
}

// each drawn row's price story on every supplier's lists (desktop table), asked
// a batch at a time (the server's HISTORY_LINES) as more rows are drawn
const stories = reactive({})
const asking = new Set()
let storyTimer = null
const shownNames = computed(() =>
  phone.value
    ? []
    : rendered.value.flatMap((s) => s.lines.map((line) => line.name)),
)
async function askStories() {
  const catalogo = props.name
  const ask = storiesToAsk(
    shownNames.value.filter((name) => !asking.has(name)),
    stories,
  )
  if (!data.value || !ask.length) return
  for (const name of ask) asking.add(name)
  try {
    const out = await call('historias', { catalogo, lineas: ask })
    if (catalogo !== props.name) return
    for (const name of ask) stories[name] = out?.lines?.[name] || []
  } catch {
    for (const name of ask) stories[name] = []
  } finally {
    for (const name of ask) asking.delete(name)
  }
  askStories()
}
watch(
  shownNames,
  (names) => {
    clearTimeout(storyTimer)
    if (names.length) storyTimer = setTimeout(askStories, 300)
  },
  { immediate: true },
)

// Sheets.
const used = reactive({
  linea: false,
  forma: false,
  promos: false,
  pedido: false,
  retiro: false,
  tipo: false,
})
const lineOpen = ref(false)
const lineName = ref('')
const currentLine = computed(() => linesByName.value[lineName.value] || null)
function openLine(line) {
  if (!line) return
  lineName.value = line.name
  used.linea = true
  lineOpen.value = true
}
const formOpen = ref(false)
const formLine = ref(null)
const formProblem = ref('')
function openForm(line = null) {
  formLine.value = line
  formProblem.value = ''
  used.forma = true
  formOpen.value = true
}
async function saveForm(payload) {
  formProblem.value = ''
  busy.value = 'form'
  try {
    const out = formLine.value
      ? await call('edit_line', { linea: formLine.value.name, fields: payload })
      : await call('add_line_manual', { catalogo: props.name, fields: payload })
    applyState(out)
    formOpen.value = false
    toast.success(
      formLine.value
        ? __('Correction saved', null, 'Lista')
        : __('Line added', null, 'Lista'),
    )
    if (!formLine.value && out?.line) openLine(out.line)
  } catch (error) {
    formProblem.value = problemOf(error).detail
  } finally {
    busy.value = ''
  }
}
async function setPhoto(line, file) {
  const out = await run('photo', () =>
    postPicture(API + 'set_photo', { linea: line.name }, file),
  )
  if (out) {
    applyState(out)
    toast.success(__('Photo saved', null, 'Lista'))
  }
}
async function linkItem(line, item) {
  const out = await run('link', () =>
    call('link_item', { linea: line.name, item }),
  )
  if (out) {
    applyState(out)
    toast.success(
      item
        ? __('Linked to the product', null, 'Lista')
        : __('Unlinked', null, 'Lista'),
    )
  }
}
const promosOpen = ref(false)
function openPromos() {
  used.promos = true
  promosOpen.value = true
}
async function addPromo(text) {
  applyState(
    await run('promo', () =>
      call('add_promo', { catalogo: props.name, fields: { text } }),
    ),
  )
}
async function updatePromo(name, fields) {
  applyState(
    await run('promo', () =>
      call('update_promo', { catalogo: props.name, name, fields }),
    ),
  )
}
async function removePromo(name) {
  applyState(
    await run('promo', () =>
      call('remove_promo', { catalogo: props.name, name }),
    ),
  )
}
const pedidoOpen = ref(false)
function openPedido() {
  used.pedido = true
  pedidoOpen.value = true
}
function onSent() {
  pedidoOpen.value = false
  toast.success(__('Order marked as sent', null, 'Lista'))
  load({ quiet: true })
}

// Models the list no longer carries (after a receipt against this list's order).
const retireCount = computed(() => data.value?.retire?.rows?.length || 0)
const tipoOpen = ref(false)
const tipoProblem = ref('')
function openTipo() {
  tipoProblem.value = ''
  used.tipo = true
  tipoOpen.value = true
}
async function saveTipo(value) {
  tipoProblem.value = ''
  busy.value = 'tipo'
  try {
    const out = await call('set_group', {
      catalogo: props.name,
      item_group: value || '',
    })
    applyState(out)
    tipoOpen.value = false
    toast.success(
      out.item_group
        ? __('Type saved: {0}', [out.item_group], 'Lista')
        : __('The type will be read from the list', null, 'Lista'),
    )
    await load({ quiet: true })
  } catch (error) {
    tipoProblem.value = problemOf(error).detail || ''
  } finally {
    busy.value = ''
  }
}

const retiroOpen = ref(false)
const retiroProblem = ref('')
function openRetiro() {
  retiroProblem.value = ''
  used.retiro = true
  retiroOpen.value = true
}
function showRetire(out) {
  if (!out || !data.value) return
  data.value = {
    ...data.value,
    retire: out.rows?.length ? { pedido: out.pedido, rows: out.rows } : null,
  }
}
async function retireAct(items, mode) {
  const pedidoName = data.value?.retire?.pedido
  if (!pedidoName || !items.length) return
  retiroProblem.value = ''
  busy.value = 'retiro'
  try {
    const out = await call('retire_models', {
      pedido: pedidoName,
      items: JSON.stringify(items),
      mode,
    })
    showRetire(out)
    const done = out.done?.length || items.length
    toast.success(
      mode === 'archive'
        ? __('{0} models archived', [done], 'Lista')
        : mode === 'delete'
          ? __('{0} models deleted', [done], 'Lista')
          : __('{0} models kept', [done], 'Lista'),
    )
    if (!out.rows?.length) retiroOpen.value = false
  } catch (error) {
    retiroProblem.value = problemOf(error).detail || ''
  } finally {
    busy.value = ''
  }
}
async function retireRefresh() {
  const pedidoName = data.value?.retire?.pedido
  if (!pedidoName) return
  retiroProblem.value = ''
  const out = await run('retiro', () =>
    call('retire_candidates', { pedido: pedidoName, refresh: 1 }),
  )
  showRetire(out)
}

// Pictures and files: more pages of this list, or a new list of the supplier.
const dragging = ref(false)
let dragDepth = 0
const upload = ref(null)
function onDragEnter() {
  dragDepth += 1
  dragging.value = true
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}
function onDrop(event) {
  dragDepth = 0
  dragging.value = false
  takeFiles(event.dataTransfer?.files)
}
function onPaste(event) {
  if (
    formOpen.value ||
    promosOpen.value ||
    pedidoOpen.value ||
    retiroOpen.value
  )
    return
  const pictures = pastedPictures(event)
  if (!pictures.length || !data.value?.owner) return
  event.preventDefault()
  // With a line open, the picture is its photo; otherwise, pages of the list.
  if (lineOpen.value && currentLine.value)
    setPhoto(currentLine.value, pictures[0])
  else takeFiles(pictures)
}
function pickFiles(event) {
  takeFiles(event.target.files)
  event.target.value = ''
}
async function takeFiles(list) {
  if (!data.value?.owner || upload.value) return
  const { pictures, documents } = dropFiles(list)
  if (!pictures.length && !documents.length) {
    problem.value = {
      title: __('Nothing to read', null, 'Lista'),
      detail: __(
        'Drop pictures of the list, a PDF or a spreadsheet.',
        null,
        'Lista',
      ),
    }
    return
  }
  if (documents.length) return newListFrom(documents[0])
  if (
    catalog.value.status === 'Esperando archivo' ||
    catalog.value.kind === 'Imagen'
  )
    return addPictures(pictures)
  return newListFromPictures(pictures)
}
async function addPictures(files) {
  upload.value = { done: 0, total: files.length }
  problem.value = null
  try {
    if (catalog.value.status === 'Esperando archivo') {
      // The list has no first picture yet: it goes through its upload session.
      const link = await comprasApi(SOURCING + 'upload_link', {
        catalog: props.name,
      })
      await uploadPictures(link.upload_url, props.name, files, {
        onProgress: (done, total) => (upload.value = { done, total }),
      })
    } else {
      await addPicturesTo(props.name, files, {
        onProgress: (done, total) => (upload.value = { done, total }),
      })
    }
    toast.success(
      files.length === 1
        ? __('Picture added; the list reads it now', null, 'Lista')
        : __(
            '{0} pictures added; the list reads them now',
            [files.length],
            'Lista',
          ),
    )
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    upload.value = null
    await load({ quiet: true })
    schedulePoll()
  }
}
async function newList(title) {
  return run('new', () =>
    comprasApi(SOURCING + 'new_catalog', {
      supplier: catalog.value.supplier || undefined,
      title,
    }),
  )
}
async function newListFrom(file) {
  const out = await newList(file.name)
  if (!out) return
  upload.value = { done: 0, total: 1, name: file.name }
  try {
    await uploadCatalog(out.upload_url, file, {
      onProgress: (pct) =>
        (upload.value = { done: pct / 100, total: 1, name: file.name }),
    })
    toast.success(
      __('{0} uploaded; the new list reads itself now', [file.name], 'Lista'),
    )
    router.push({ name: 'CompraLista', params: { name: out.catalog } })
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    upload.value = null
  }
}
async function newListFromPictures(files) {
  const out = await newList(
    __('List of {0}', [formatDate(new Date(), { relative: false })], 'Lista'),
  )
  if (!out) return
  upload.value = { done: 0, total: files.length }
  try {
    await uploadPictures(out.upload_url, out.catalog, files, {
      onProgress: (done, total) => (upload.value = { done, total }),
    })
    router.push({ name: 'CompraLista', params: { name: out.catalog } })
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    upload.value = null
  }
}

// The paid read of the product pages (sourcing.read_estimate / read_products).
const readQuote = ref(null)
const canRead = computed(
  () =>
    Boolean(data.value?.owner) && canReadMore(catalog.value, lineCount.value),
)
async function estimateRead() {
  readQuote.value = null
  const out = await run('estimate', () =>
    comprasApi(SOURCING + 'read_estimate', { catalog: props.name }),
  )
  if (out) readQuote.value = out
}
async function readProducts() {
  const units = readQuote.value?.units
  const out = await run('read', () =>
    comprasApi(SOURCING + 'read_products', { catalog: props.name, units }),
  )
  if (out !== null) {
    readQuote.value = null
    toast.success(
      __(
        'Reading the products; the lines appear as they are read',
        null,
        'Lista',
      ),
    )
    await load({ quiet: true })
    schedulePoll()
  }
}

const strip = computed(() => {
  if (!data.value) return null
  const c = catalog.value
  const addPhotos = {
    key: 'photos',
    label: __('Add pictures', null, 'Lista'),
    icon: 'lucide-image-plus',
    run: () => fileInput.value?.click(),
  }
  if (upload.value) {
    const u = upload.value
    return {
      tone: 'neutral',
      icon: 'lucide-loader-circle animate-spin',
      text: u.name
        ? __('Uploading {0}… {1}%', [u.name, Math.round(u.done * 100)], 'Lista')
        : __(
            'Uploading picture {0} of {1}…',
            [Math.min(u.total, Math.floor(u.done) + 1), u.total],
            'Lista',
          ),
      pct: Math.round((100 * u.done) / u.total),
    }
  }
  // index_progress counts pages: the bar is pages indexed of the pages, then
  // pages read of the pages picked (books.catalogs.progress)
  const moving = progressView(progressOf(c))
  if (c.reading)
    return {
      tone: 'neutral',
      icon: 'lucide-loader-circle animate-spin',
      ...(c.progress?.stage === 'read'
        ? { text: moving.line, pct: moving.pct }
        : {
            text: __(
              'Reading the products of the list; the lines appear as they are read.',
              null,
              'Lista',
            ),
          }),
    }
  if (c.status === 'Indexando')
    return {
      tone: 'neutral',
      icon: 'lucide-loader-circle animate-spin',
      text: __('Reading the list… {0}%', [moving.pct || 0], 'Lista'),
      pct: moving.pct || 0,
    }
  if (c.status === 'Recibido' || c.status === 'En cola')
    return {
      tone: 'neutral',
      icon: 'lucide-loader-circle animate-spin',
      text: __('List received; it reads itself in a moment.', null, 'Lista'),
    }
  if (c.status === 'Esperando archivo')
    return {
      tone: 'warning',
      icon: 'lucide-images',
      text: __('The list has no pictures or file yet.', null, 'Lista'),
      action: data.value.owner ? addPhotos : null,
    }
  if (c.status === 'Error')
    return {
      tone: 'danger',
      icon: 'lucide-circle-alert',
      text: c.error || __('The list could not be read.', null, 'Lista'),
      action: data.value.owner ? addPhotos : null,
    }
  if (
    c.status === 'Listo' &&
    lineCount.value &&
    c.pages_unread > 0 &&
    !readQuote.value
  )
    return {
      tone: 'warning',
      icon: 'lucide-circle-alert',
      text: c.error
        ? __('A page of the list could not be read: {0}', [c.error], 'Lista')
        : __(
            'Pages of the list are still unread ({0}).',
            [c.pages_unread],
            'Lista',
          ),
      action: data.value.owner
        ? {
            key: 'estimate',
            label: __('Read the rest', null, 'Lista'),
            icon: 'lucide-sparkles',
            run: estimateRead,
          }
        : null,
    }
  if (canRead.value && !readQuote.value)
    return {
      tone: 'neutral',
      icon: 'lucide-sparkles',
      text: __(
        'The free read found no products on these pages. A paid read of the product pages can.',
        null,
        'Lista',
      ),
      action: {
        key: 'estimate',
        label: __('Read the products', null, 'Lista'),
        icon: 'lucide-sparkles',
        run: estimateRead,
      },
    }
  if (data.value.owner && !c.supplier)
    return {
      tone: 'warning',
      icon: 'lucide-triangle-alert',
      text: __(
        'Name the supplier of this list in Restock before ordering from it.',
        null,
        'Lista',
      ),
      action: {
        key: 'surtido',
        label: __('Open Restock', null, 'Lista'),
        icon: 'lucide-list-checks',
        run: () => router.push({ name: 'CompraSurtido' }),
      },
    }
  return null
})

// The bolt.
const actionGroups = computed(() => {
  const owner = Boolean(data.value?.owner)
  const hasDraft = Boolean(pedido.value)
  const ownerOnly = __('Only the owner edits the list.', null, 'Lista')
  const noDraft = __('Set quantities on the lines first.', null, 'Lista')
  const previous = catalog.value.previous
  return [
    {
      key: 'lista',
      title: __('List', null, 'Lista'),
      items: [
        {
          key: 'add',
          label: __('Add a line', null, 'Lista'),
          icon: 'lucide-plus',
          hint: __('A product the read missed', null, 'Lista'),
          allowed: owner,
          reason: ownerOnly,
        },
        {
          key: 'retiro',
          label: __('Models the list no longer carries', null, 'Lista'),
          icon: 'lucide-archive',
          hint: retireCount.value
            ? __('{0} waiting', [retireCount.value], 'Lista')
            : '',
          allowed: retireCount.value > 0,
          reason: __(
            'The last receipt against this order found none.',
            null,
            'Lista',
          ),
        },
        {
          key: 'tipo',
          label: __('Product type', null, 'Lista'),
          icon: 'lucide-tag',
          hint: catalog.value.item_group || __('Not set', null, 'Lista'),
          allowed: owner,
          reason: ownerOnly,
        },
        {
          key: 'promos',
          label: __('Promos', null, 'Lista'),
          icon: 'lucide-gift',
          hint: activePromos.value.length
            ? __('{0} active', [activePromos.value.length], 'Lista')
            : __('None on this list', null, 'Lista'),
          allowed: true,
        },
        {
          key: 'photos',
          label: __('Add pictures', null, 'Lista'),
          icon: 'lucide-image-plus',
          hint: __(
            'More pages of this list, or a PDF or spreadsheet',
            null,
            'Lista',
          ),
          allowed: owner,
          reason: ownerOnly,
        },
        {
          key: 'refresh',
          label: __('Refresh', null, 'Lista'),
          icon: 'lucide-refresh-cw',
          allowed: true,
        },
      ],
    },
    {
      key: 'pedido',
      title: __('Order', null, 'Lista'),
      items: [
        {
          key: 'resumen',
          label: __('Order summary', null, 'Lista'),
          icon: 'lucide-shopping-cart',
          hint: hasDraft
            ? __(
                '{0} pieces · {1}',
                [draft.value.pieces, money(shownTotal.value, currency.value)],
                'Lista',
              )
            : '',
          allowed: hasDraft,
          reason: noDraft,
        },
        {
          key: 'xlsx',
          label: __('Export to Excel', null, 'Lista'),
          icon: 'lucide-file-spreadsheet',
          allowed: hasDraft,
          reason: noDraft,
        },
        {
          key: 'pdf',
          label: __('Export to PDF', null, 'Lista'),
          icon: 'lucide-file-text',
          allowed: hasDraft,
          reason: noDraft,
        },
        {
          key: 'print',
          label: __('Print', null, 'Lista'),
          icon: 'lucide-printer',
          allowed: hasDraft,
          reason: noDraft,
        },
      ],
    },
    {
      key: 'ir',
      title: __('Go to', null, 'Lista'),
      items: [
        {
          key: 'previous',
          label: __('Previous list', null, 'Lista'),
          icon: 'lucide-history',
          hint: previous
            ? formatDate(previous.date, { relative: false }) || previous.title
            : '',
          allowed: Boolean(previous),
          reason: __('This is the first list of this supplier.', null, 'Lista'),
        },
        {
          key: 'surtido',
          label: __('Restock plan', null, 'Lista'),
          icon: 'lucide-list-checks',
          allowed: true,
        },
        {
          key: 'niveles',
          label: __('Stock levels', null, 'Lista'),
          icon: 'lucide-sliders-horizontal',
          allowed: true,
        },
      ],
    },
  ]
})
function onAction({ key }) {
  switch (key) {
    case 'add':
      openForm(null)
      break
    case 'promos':
      openPromos()
      break
    case 'tipo':
      openTipo()
      break
    case 'retiro':
      openRetiro()
      break
    case 'photos':
      fileInput.value?.click()
      break
    case 'refresh':
      load()
      break
    case 'resumen':
      openPedido()
      break
    case 'xlsx':
    case 'pdf':
      window.open(exportUrl(key), '_blank', 'noopener')
      break
    case 'print':
      window.open(printUrl.value, '_blank', 'noopener')
      break
    case 'previous':
      if (catalog.value.previous)
        router.push({
          name: 'CompraLista',
          params: { name: catalog.value.previous.name },
        })
      break
    case 'surtido':
      router.push({ name: 'CompraSurtido' })
      break
    case 'niveles':
      router.push({ name: 'CompraNiveles' })
      break
    default:
      break
  }
}

watch(
  () => props.name,
  () => {
    data.value = null
    rows.value = {}
    totals.value = {}
    orderTotals.value = {}
    orderParts.value = { lists: {}, groups: [] }
    pedido.value = null
    readQuote.value = null
    clearFilters()
    view.value = 'pedido'
    kept.clear()
    for (const key of Object.keys(stories)) delete stories[key]
    for (const key of Object.keys(flash)) delete flash[key]
    load()
  },
)
onMounted(load)
onBeforeUnmount(() => {
  clearPoll()
  clearTimeout(searchTimer)
  clearTimeout(storyTimer)
  clearTimeout(botTimer)
  for (const t of flashTimers.values()) clearTimeout(t)
  openPresence(null)
  socket?.off?.(LIVE_EVENT, onOrderEvent)
  socket?.off?.('doc_viewers', onViewers)
  socket?.off?.('connect', reopenPresence)
  for (const t of timers.values()) clearTimeout(t)
})
</script>
