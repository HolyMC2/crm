<template>
  <!-- Surtido: a supplier list → a buy plan within budget → the supplier's
       reply. The page owns its bar (the way back to Compras, «Pregúntale a
       Muelle» beside the title); the three steps sit under it as chips. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="true"
      :back-label="__('Compras', null, 'Compras')"
      :title="__('Restock from a list', null, 'Surtido')"
      :bell="phone"
      @back="onBack"
    >
      <template #actions>
        <button
          v-if="ready"
          type="button"
          class="press flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
          :aria-label="__('Stock levels', null, 'Niveles')"
          :title="__('Stock levels', null, 'Niveles')"
          data-testid="surtido-niveles"
          @click="router.push({ name: 'CompraNiveles' })"
        >
          <span class="lucide-sliders-horizontal size-6" aria-hidden="true" />
        </button>
        <button
          v-if="ready && assistantOn"
          type="button"
          class="press flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
          :aria-label="__('Ask Muelle', null, 'Surtido')"
          :title="__('Ask Muelle', null, 'Surtido')"
          data-testid="surtido-ask"
          @click="askMuelle"
        >
          <span class="lucide-sparkles size-6" aria-hidden="true" />
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
        @action="start"
      />
      <EmptyState
        v-else-if="!ready"
        role="status"
        state="loading"
        :title="__('Loading supplier lists…', null, 'Surtido')"
      />

      <div v-else class="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
        <ol
          v-if="pedido"
          class="mb-4 flex gap-2 overflow-x-auto pb-1"
          :aria-label="__('Steps', null, 'Surtido')"
        >
          <li v-for="(s, i) in steps" :key="s.key" class="flex-none">
            <button
              type="button"
              class="press flex min-h-11 items-center gap-2 rounded-full px-4 text-base disabled:opacity-50"
              :class="
                (step === 'respuesta') === (s.key === 'respuesta')
                  ? 'bg-surface-gray-10 font-medium text-ink-base'
                  : 'bg-surface-gray-2 text-ink-gray-8 [@media(hover:hover)]:hover:bg-surface-gray-3'
              "
              :aria-current="
                (step === 'respuesta') === (s.key === 'respuesta')
                  ? 'step'
                  : undefined
              "
              :disabled="s.disabled"
              @click="go(s.key)"
            >
              <span class="num tabular-nums">{{ i + 1 }}</span>
              <span class="whitespace-nowrap">{{ s.label }}</span>
            </button>
          </li>
        </ol>

        <div
          v-if="problem"
          role="alert"
          class="mb-4 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        </div>

        <!-- 1 · the list and the plan: one screen, the plan follows the request -->
        <section
          v-if="step !== 'respuesta'"
          :aria-label="__('List and plan', null, 'Surtido')"
        >
          <!-- the list: the newest ready one, another from the sheet, or a drop -->
          <div
            v-if="current"
            class="mb-4 border-b border-outline-gray-2 pb-4"
            data-testid="surtido-actual"
          >
            <div class="flex items-start gap-3">
              <span
                class="mt-0.5 flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                aria-hidden="true"
              >
                <span class="lucide-table size-5" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-base font-medium text-ink-gray-9">
                  {{ listName(current) }}
                </p>
                <p class="num truncate text-sm text-ink-gray-6">
                  {{ listLine(current) }}
                </p>
              </div>
              <button
                type="button"
                class="press inline-flex min-h-11 flex-none items-center rounded-full bg-surface-gray-2 px-4 text-base text-ink-gray-8 hover:bg-surface-gray-3 sm:min-h-9 sm:text-sm"
                data-testid="surtido-cambiar"
                @click="openLists"
              >
                {{ __('Change list', null, 'Surtido') }}
              </button>
            </div>
            <div v-if="showsBar(current)" class="mt-3">
              <CatalogProgress :progress="progressOf(current)" compact />
            </div>
            <div
              v-if="stalled(current)"
              class="mt-2 text-sm text-ink-amber-7"
              role="status"
            >
              {{
                __(
                  'The read stopped before the end. Read the pages again to plan with them.',
                  null,
                  'Surtido',
                )
              }}
            </div>
            <div
              v-if="boot.owner && current.status === 'Esperando archivo'"
              class="mt-3 flex flex-wrap items-center gap-2"
            >
              <label
                class="press inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-base hover:bg-surface-gray-3 sm:min-h-9 sm:text-sm"
                :class="upload ? 'pointer-events-none opacity-50' : ''"
              >
                <span class="lucide-upload size-5" aria-hidden="true" />
                {{ __('Choose file', null, 'Surtido') }}
                <input
                  type="file"
                  class="sr-only"
                  multiple
                  :accept="LIST_ACCEPT"
                  :disabled="!!upload"
                  @change="(e) => pickInto(current.name, e)"
                />
              </label>
              <Button
                :label="__('Upload link', null, 'Surtido')"
                @click="linkFor(current.name)"
              />
              <a
                v-if="uploadUrl"
                :href="uploadUrl"
                target="_blank"
                rel="noopener"
                class="text-sm font-medium text-ink-blue-7 underline"
                >{{ __('Open the upload page', null, 'Surtido') }}</a
              >
            </div>
            <div
              v-if="boot.owner && canRead(current)"
              class="mt-3 flex flex-wrap items-center gap-2"
            >
              <button
                type="button"
                :class="['press', BTN.filled]"
                :disabled="busy === 'estimate:' + current.name"
                data-testid="surtido-leer"
                @click="estimateRead(current.name)"
              >
                <span
                  :class="[
                    busy === 'estimate:' + current.name
                      ? 'lucide-loader-circle animate-spin'
                      : 'lucide-list-checks',
                    'size-5',
                  ]"
                  aria-hidden="true"
                />
                {{
                  stalled(current)
                    ? __('Read again', null, 'Surtido')
                    : __('Read the products', null, 'Surtido')
                }}
              </button>
            </div>
            <div
              v-if="readQuote?.catalog === current.name"
              class="mt-3 rounded-6 bg-surface-gray-1 p-3 text-sm"
              role="status"
            >
              <template v-if="readQuote.pages">
                <p>
                  {{
                    __(
                      'Reading {0} pages of products uses {1} units of your plan. The plan appears here when they are read.',
                      [readQuote.pages, readQuote.units],
                      'Surtido',
                    )
                  }}
                </p>
                <div class="mt-2 flex flex-wrap justify-end gap-2">
                  <Button
                    :label="__('Not now', null, 'Surtido')"
                    @click="readQuote = null"
                  />
                  <button
                    type="button"
                    :class="['press', BTN.filled]"
                    :disabled="busy === 'read'"
                    @click="readProducts"
                  >
                    <span
                      :class="[
                        busy === 'read'
                          ? 'lucide-loader-circle animate-spin'
                          : 'lucide-check',
                        'size-5',
                      ]"
                      aria-hidden="true"
                    />
                    {{ __('Read them', null, 'Surtido') }}
                  </button>
                </div>
              </template>
              <p v-else>
                {{
                  __(
                    'This list has no product pages to read. Send it as a PDF with prices or a spreadsheet.',
                    null,
                    'Surtido',
                  )
                }}
              </p>
            </div>
          </div>

          <!-- no list yet, or the owner is adding one: the drop is the first thing -->
          <div
            v-if="!current && boot.owner"
            class="mb-4 rounded-7 border border-dashed border-outline-gray-3 p-5 text-center"
            :class="dropping ? 'bg-surface-gray-2' : ''"
            data-testid="surtido-drop"
            @dragover.prevent="dropping = true"
            @dragleave="dropping = false"
            @drop.prevent="dropCatalog"
          >
            <span
              class="lucide-upload mx-auto block size-7 text-ink-gray-6"
              aria-hidden="true"
            />
            <p class="mt-2 text-base font-medium">
              {{ __("Drop the supplier's list", null, 'Surtido') }}
            </p>
            <p class="mt-1 text-sm text-ink-gray-6">
              {{
                __(
                  'Pictures of the list, a PDF or a spreadsheet. The pictures you send together are one list.',
                  null,
                  'Surtido',
                )
              }}
            </p>
            <label
              :class="[
                'press mt-3 cursor-pointer',
                BTN.filled,
                upload ? 'pointer-events-none opacity-50' : '',
              ]"
            >
              <span class="lucide-upload size-5" aria-hidden="true" />
              {{ __('Choose files', null, 'Surtido') }}
              <input
                type="file"
                class="sr-only"
                multiple
                :accept="LIST_ACCEPT"
                :disabled="!!upload"
                data-testid="surtido-file"
                @change="pickCatalog"
              />
            </label>
            <p v-if="boot.catalogs.length" class="mt-3">
              <button
                type="button"
                class="press text-sm font-medium text-ink-gray-8 underline"
                @click="openLists"
              >
                {{ __('Or pick a saved list', null, 'Surtido') }}
              </button>
            </p>
          </div>
          <p
            v-else-if="!current"
            class="mb-4 text-sm text-ink-gray-6"
            role="status"
          >
            {{
              __(
                'No supplier list yet. The owner uploads them.',
                null,
                'Surtido',
              )
            }}
          </p>
          <div v-if="upload" class="mb-4" role="status">
            <p class="truncate text-sm">
              {{
                batch
                  ? __(
                      'Uploading {0}… {1}%, file {2} of {3}',
                      [upload.name, upload.pct, batch.at, batch.of],
                      'Surtido',
                    )
                  : __(
                      'Uploading {0}… {1}%',
                      [upload.name, upload.pct],
                      'Surtido',
                    )
              }}
            </p>
            <div
              class="mt-1 h-2 overflow-hidden rounded-full bg-surface-gray-2"
            >
              <div
                class="h-full rounded-full bg-surface-gray-7"
                :style="{ width: upload.pct + '%' }"
              />
            </div>
          </div>

          <!-- the request, in the list's own words -->
          <form
            v-if="current?.lines"
            class="mb-4 space-y-4"
            data-testid="surtido-pedir"
            @submit.prevent="makePlan"
          >
            <label class="block sm:max-w-sm">
              <span class="mb-1 block text-sm text-ink-gray-7">{{
                __('Budget', null, 'Surtido')
              }}</span>
              <span
                class="flex h-14 items-center gap-1 rounded-6 bg-surface-gray-2 px-4 focus-within:ring-2 focus-within:ring-outline-gray-4"
              >
                <span class="num text-2xl text-ink-gray-5" aria-hidden="true"
                  >$</span
                >
                <input
                  ref="budgetInput"
                  v-model="ask.budget"
                  type="number"
                  min="1"
                  step="any"
                  inputmode="decimal"
                  enterkeyhint="done"
                  class="num w-full border-0 bg-transparent p-0 text-2xl font-semibold text-ink-gray-9 focus:ring-0"
                  :placeholder="__('41,300', null, 'Surtido')"
                  data-testid="surtido-presupuesto"
                />
              </span>
            </label>

            <ChipGroup
              v-if="facets.sections.length > 1"
              :label="__('Section of the list', null, 'Surtido')"
              :options="sectionOptions"
              :model-value="ask.section"
              :max="6"
              testid="surtido-seccion"
              @update:model-value="(v) => (ask.section = v || '')"
            />
            <ChipGroup
              v-if="facets.marks.length"
              :label="__('Only lines marked', null, 'Surtido')"
              :options="markOptions"
              :model-value="ask.marks"
              multiple
              :max="8"
              testid="surtido-marca"
              @update:model-value="(v) => (ask.marks = v || [])"
            />
            <ChipGroup
              v-if="facets.groups.length"
              :label="__('Count my sales and stock of', null, 'Surtido')"
              :options="groupOptions"
              :model-value="ask.item_group"
              :max="5"
              testid="surtido-grupo"
              @update:model-value="(v) => (ask.item_group = v || '')"
            />
            <FormControl
              v-model="ask.focus"
              :label="__('These models first', null, 'Surtido')"
              :placeholder="__('A16 2, A27 1', null, 'Surtido')"
              :description="
                __(
                  'A number after the model is the pieces you want.',
                  null,
                  'Surtido',
                )
              "
            />

            <details class="group" data-testid="surtido-ajustes">
              <summary
                class="fold-summary press flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink-gray-8"
              >
                <span
                  class="lucide-chevron-right size-4 transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                {{
                  changedSettings
                    ? __('More settings ({0})', [changedSettings], 'Surtido')
                    : __('More settings', null, 'Surtido')
                }}
              </summary>
              <div class="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <FormControl
                  v-model="ask.months"
                  type="number"
                  min="1"
                  max="24"
                  :label="__('Months of sales', null, 'Surtido')"
                />
                <FormControl
                  v-model="ask.cover_days"
                  type="number"
                  min="1"
                  :label="__('Days to cover', null, 'Surtido')"
                />
                <FormControl
                  v-model="ask.terms"
                  :label="__('Product words', null, 'Surtido')"
                  :placeholder="__('case, rugged', null, 'Surtido')"
                />
                <FormControl
                  v-model="ask.model"
                  :label="__('Only this model', null, 'Surtido')"
                />
                <FormControl
                  v-model="ask.colour"
                  :label="__('Only this colour', null, 'Surtido')"
                />
                <label
                  class="col-span-2 flex min-h-11 items-center gap-2 text-sm"
                >
                  <input v-model="ask.low_stock" type="checkbox" />
                  {{ __('Only what runs low', null, 'Surtido') }}
                </label>
                <label
                  class="col-span-2 flex min-h-11 items-center gap-2 text-sm"
                >
                  <input v-model="ask.new_models" type="checkbox" />
                  {{ __('Include new models', null, 'Surtido') }}
                </label>
                <label
                  class="col-span-2 flex min-h-11 items-center gap-2 text-sm"
                >
                  <input v-model="ask.missing" type="checkbox" />
                  {{
                    __('Also what I have none of, even unsold', null, 'Surtido')
                  }}
                </label>
              </div>
            </details>
          </form>

          <p
            v-if="current?.lines && !plan && !planBusy"
            class="text-sm text-ink-gray-6"
            role="status"
          >
            {{
              __(
                'Write the budget: the plan appears here and follows every change.',
                null,
                'Surtido',
              )
            }}
          </p>

          <div
            v-if="plan"
            class="transition-opacity duration-150"
            :class="planBusy ? 'opacity-60' : ''"
            :aria-busy="planBusy"
            data-testid="surtido-plan"
          >
            <div class="mb-4 border-t border-outline-gray-2 pt-4">
              <div
                class="flex flex-wrap items-baseline justify-between gap-x-4"
              >
                <p class="text-base">
                  <strong class="num text-xl">{{ money(plan.total) }}</strong>
                  {{ __('of {0}', [money(plan.budget)], 'Surtido') }}
                </p>
                <p class="num text-sm text-ink-gray-7">
                  {{
                    __(
                      '{0} lines, {1} pieces, {2} left',
                      [plan.lines.length, pieces, money(plan.remaining)],
                      'Surtido',
                    )
                  }}
                </p>
              </div>
              <div
                class="mt-2 h-2 overflow-hidden rounded-full bg-surface-gray-2"
                role="meter"
                :aria-valuenow="plan.total"
                aria-valuemin="0"
                :aria-valuemax="plan.budget"
                :aria-label="__('Budget used', null, 'Surtido')"
              >
                <div
                  class="h-full rounded-full bg-surface-gray-7 transition-[width] duration-200"
                  :style="{ width: budgetPct + '%' }"
                />
              </div>
              <ul
                v-if="
                  plan.minimums?.length ||
                  plan.focus_missing?.length ||
                  unresolvedShown.length
                "
                class="mt-3 space-y-1 text-sm text-ink-amber-7"
                data-testid="surtido-avisos"
              >
                <li v-for="m in plan.minimums" :key="'min' + m">
                  {{
                    __(
                      '{0}. Confirm with the supplier whether it counts per model or per order.',
                      [m],
                      'Surtido',
                    )
                  }}
                </li>
                <li v-if="plan.focus_missing?.length">
                  {{
                    __(
                      'This list does not carry: {0}',
                      [plan.focus_missing.join(', ')],
                      'Surtido',
                    )
                  }}
                </li>
                <li v-for="u in unresolvedShown" :key="u">
                  {{ __('Not applied: {0}', [u], 'Surtido') }}
                </li>
              </ul>
              <details
                v-if="plan.notes?.length || skipped.length || hasLevels"
                class="mt-2 text-sm"
              >
                <summary
                  class="fold-summary press flex min-h-11 cursor-pointer list-none items-center gap-2 text-ink-gray-7"
                >
                  <span
                    class="lucide-chevron-right size-4 transition-transform"
                    aria-hidden="true"
                  />
                  {{ __('How it was made', null, 'Surtido') }}
                </summary>
                <ul class="mt-1 space-y-1 text-ink-gray-7">
                  <li>
                    {{
                      __(
                        'Quantity = sales of {0} months over {1} days of cover, minus stock. The plan never passes the budget.',
                        [plan.months, plan.cover_days],
                        'Surtido',
                      )
                    }}
                  </li>
                  <li v-if="skipped.length" data-testid="surtido-skipped">
                    {{
                      __('Not proposed: {0}', [skipped.join(', ')], 'Surtido')
                    }}
                  </li>
                  <li v-for="n in plan.notes" :key="n">{{ n }}</li>
                </ul>
                <div
                  v-if="hasLevels"
                  class="mt-3 border-t border-outline-gray-1 pt-3"
                  data-testid="surtido-levels"
                >
                  <p class="font-medium">
                    {{
                      __(
                        'Stock levels of {0}: a model with a level buys what fills it',
                        [plan.level_group],
                        'Surtido',
                      )
                    }}
                  </p>
                  <ul class="mt-1 space-y-0.5 text-ink-gray-7">
                    <li v-for="l in plan.levels" :key="'lv' + l.model">
                      {{
                        l.need
                          ? __(
                              '{0}: {1} of {2}, {3} short',
                              [l.model, l.have, l.target, l.need],
                              'Surtido',
                            )
                          : levelState(l) === 'full'
                            ? __(
                                '{0}: {1} of {2}, full',
                                [l.model, l.have, l.target],
                                'Surtido',
                              )
                            : __(
                                '{0}: {1} of {2}, orders below {3}',
                                [l.model, l.have, l.target, l.min],
                                'Surtido',
                              )
                      }}<template v-if="buyText(l)"
                        >, {{ buyText(l) }}</template
                      >
                    </li>
                    <li
                      v-for="t in plan.tones_missing"
                      :key="'tm' + t.model + t.tone"
                      class="text-ink-amber-7"
                    >
                      {{
                        __(
                          'This list has no {0} for {1} ({2} short)',
                          [t.tone, t.model, t.qty],
                          'Surtido',
                        )
                      }}
                    </li>
                    <li
                      v-for="u in plan.levels_uncovered"
                      :key="'lu' + u.model"
                      class="text-ink-amber-7"
                    >
                      {{
                        __(
                          '{0} is below its level and not in this list ({1} short)',
                          [u.model, u.need],
                          'Surtido',
                        )
                      }}
                    </li>
                  </ul>
                </div>
              </details>
            </div>

            <div
              v-if="!plan.lines.length"
              class="rounded-6 border border-dashed border-outline-gray-3 p-4 text-sm"
              role="status"
              data-testid="surtido-plan-empty"
            >
              <p class="font-medium text-ink-gray-9">
                {{ __('Nothing to buy with these filters', null, 'Surtido') }}
              </p>
              <p class="mt-1 text-ink-gray-7">
                {{
                  __(
                    'Take off a mark, cover more days in «More settings», or name the models in «These models first».',
                    null,
                    'Surtido',
                  )
                }}
              </p>
            </div>
            <div v-else class="plan-wrap">
              <div class="plan" data-testid="surtido-plan-lines">
                <div
                  class="plan-head hidden border-b border-outline-gray-2 px-1 py-2 text-xs text-ink-gray-5"
                  aria-hidden="true"
                >
                  <span>{{ __('Product', null, 'Surtido') }}</span>
                  <span class="text-right">{{
                    __('Pieces', null, 'Surtido')
                  }}</span>
                  <span class="text-right">{{
                    __('Total', null, 'Surtido')
                  }}</span>
                  <span />
                </div>
                <ul
                  class="plan-rows divide-y divide-outline-gray-1"
                  :aria-label="__('Plan lines', null, 'Surtido')"
                >
                  <li
                    v-for="line in plan.lines"
                    :key="line.line"
                    class="plan-line grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-1 py-3"
                    :class="edits[line.line]?.remove ? 'opacity-50' : ''"
                  >
                    <div class="plan-cell-name col-span-full min-w-0">
                      <p class="font-medium text-ink-gray-9">
                        {{ line.name }}
                        <span
                          v-if="line.page"
                          class="ml-1 text-xs font-normal text-ink-gray-5"
                          >{{ __('p. {0}', [line.page], 'Surtido') }}</span
                        >
                      </p>
                      <p
                        v-if="printedText(line) || lineMeta(line)"
                        class="truncate text-sm text-ink-gray-6"
                      >
                        {{
                          [printedText(line), lineMeta(line)]
                            .filter(Boolean)
                            .join(', ')
                        }}
                      </p>
                      <p
                        v-if="underMinimum(line)"
                        class="text-sm text-ink-amber-7"
                      >
                        {{
                          __(
                            'Its price is from {0} pieces',
                            [line.min_qty],
                            'Surtido',
                          )
                        }}
                      </p>
                      <p
                        v-if="line.reasons?.length"
                        class="mt-1 flex flex-wrap gap-1"
                      >
                        <span
                          v-for="r in line.reasons"
                          :key="r"
                          class="rounded-4 bg-surface-gray-2 px-1.5 py-0.5 text-xs text-ink-gray-7"
                          >{{ r }}</span
                        >
                      </p>
                    </div>
                    <div
                      class="plan-qty flex items-center gap-1"
                      role="group"
                      :aria-label="__('Pieces of {0}', [line.name], 'Surtido')"
                    >
                      <button
                        type="button"
                        class="press flex size-11 items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 disabled:opacity-40 sm:size-8"
                        :aria-label="
                          __('One less of {0}', [line.name], 'Surtido')
                        "
                        :disabled="
                          !boot.owner ||
                          edits[line.line]?.remove ||
                          qtyOf(line) <= 1
                        "
                        @click="bump(line, -1)"
                      >
                        <span class="lucide-minus size-4" aria-hidden="true" />
                      </button>
                      <span
                        class="num w-8 text-center text-base font-semibold tabular-nums"
                        aria-live="polite"
                        >{{ qtyOf(line) }}</span
                      >
                      <button
                        type="button"
                        class="press flex size-11 items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8 disabled:opacity-40 sm:size-8"
                        :aria-label="
                          __('One more of {0}', [line.name], 'Surtido')
                        "
                        :disabled="!boot.owner || edits[line.line]?.remove"
                        @click="bump(line, 1)"
                      >
                        <span class="lucide-plus size-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div
                      class="plan-money flex flex-col items-end justify-self-end leading-tight"
                    >
                      <span
                        class="num whitespace-nowrap text-base font-medium tabular-nums"
                        >{{ money(line.price * qtyOf(line)) }}</span
                      >
                      <span
                        class="num whitespace-nowrap text-xs tabular-nums text-ink-gray-6"
                        >{{
                          __('{0} each', [money(line.price)], 'Surtido')
                        }}</span
                      >
                    </div>
                    <div
                      v-if="boot.owner"
                      class="plan-actions flex justify-end gap-0.5"
                    >
                      <Button
                        v-if="line.colour"
                        variant="ghost"
                        :icon="LucideDroplet"
                        :aria-label="
                          __('Change colour of {0}', [line.name], 'Surtido')
                        "
                        :title="__('Change colour', null, 'Surtido')"
                        @click="askColour(line)"
                      />
                      <Button
                        variant="ghost"
                        :icon="
                          edits[line.line]?.remove ? LucideRotateCcw : LucideX
                        "
                        :aria-label="
                          edits[line.line]?.remove
                            ? __('Keep {0}', [line.name], 'Surtido')
                            : __('Remove {0}', [line.name], 'Surtido')
                        "
                        :title="
                          edits[line.line]?.remove
                            ? __('Keep', null, 'Surtido')
                            : __('Remove', null, 'Surtido')
                        "
                        @click="
                          setEdit(line, 'remove', !edits[line.line]?.remove)
                        "
                      />
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            <details
              v-if="plan.left_out?.length"
              class="mt-3 border-t border-outline-gray-2 pt-1"
            >
              <summary
                class="fold-summary press flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink-gray-8"
              >
                <span
                  class="lucide-chevron-right size-4 transition-transform"
                  aria-hidden="true"
                />
                {{
                  __(
                    'Left out of the plan ({0})',
                    [plan.left_out.length],
                    'Surtido',
                  )
                }}
              </summary>
              <ul class="mt-1 divide-y divide-outline-gray-1">
                <li
                  v-for="line in plan.left_out.slice(0, 60)"
                  :key="'lo' + line.line"
                  class="flex items-center gap-3 py-2 text-sm"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate">{{ line.name }}</span>
                    <span class="block truncate text-xs text-ink-gray-5">{{
                      line.why
                    }}</span>
                  </span>
                  <span class="num tabular-nums text-ink-gray-6">{{
                    money(line.price)
                  }}</span>
                  <Button
                    v-if="boot.owner && line.price"
                    :label="
                      adds[line.line]
                        ? __('Will add', null, 'Surtido')
                        : __('Add', null, 'Surtido')
                    "
                    @click="toggleAdd(line)"
                  />
                </li>
              </ul>
            </details>

            <div v-if="boot.owner && !plan.supplier" class="mt-4 sm:max-w-sm">
              <ComprasPicker
                v-model="planSupplier"
                :label="__('Whose list is this?', null, 'Surtido')"
                :placeholder="__('Search supplier', null, 'Surtido')"
                :hint="
                  planSupplier
                    ? ''
                    : __(
                        'Choose the supplier to create the order. A new one? Ask Muelle: it creates it with the order.',
                        null,
                        'Surtido',
                      )
                "
                :load="(q) => call('suppliers', { search: q })"
              />
            </div>
            <p v-if="!boot.owner" class="mt-3 text-sm text-ink-gray-6">
              {{ __('Only the owner approves a plan.', null, 'Surtido') }}
            </p>
          </div>
        </section>

        <!-- 3 · the supplier reply ------------------------------------------------ -->
        <section v-else :aria-label="steps[2].label">
          <div v-if="!pedido" class="text-sm text-ink-gray-6">
            {{
              __(
                'Approve a plan or open a recent order to see its reply.',
                null,
                'Surtido',
              )
            }}
          </div>
          <template v-else>
            <div class="mb-4 rounded-7 border border-outline-gray-2 p-4">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="min-w-0 flex-1 truncate text-lg font-semibold">
                  {{ pedido.supplier }}
                  <span class="text-sm font-normal text-ink-gray-5">{{
                    pedido.pedido
                  }}</span>
                </h2>
                <Badge
                  :theme="pedidoTheme(pedido.status)"
                  :label="pedidoStatus(pedido.status)"
                />
              </div>
              <p class="mt-1 text-sm text-ink-gray-7">
                {{ __('Total {0}', [money(pedido.total)], 'Surtido') }}
                <template v-if="pedido.ceiling">
                  ·
                  {{
                    __('budget {0}', [money(pedido.ceiling)], 'Surtido')
                  }}</template
                >
              </p>
              <p v-if="pedido.over_ceiling" class="mt-1 text-sm text-ink-red-7">
                {{
                  pedido.warning ||
                  __('This order passes the budget.', null, 'Surtido')
                }}
              </p>
              <p v-if="pedido.purchase_order" class="mt-2 text-sm">
                <RouterLink
                  :to="{
                    name: 'CompraOrden',
                    params: { name: pedido.purchase_order },
                  }"
                  class="font-medium text-ink-blue-7 underline"
                  >{{
                    __('Draft purchase {0}', [pedido.purchase_order], 'Surtido')
                  }}</RouterLink
                >
              </p>
            </div>

            <!-- send to the supplier -->
            <div
              v-if="pedido.owner && pedido.status === 'Borrador'"
              class="mb-4 flex flex-wrap items-center gap-2 rounded-6 bg-surface-gray-1 p-3"
            >
              <p class="min-w-0 flex-1 text-sm">
                {{
                  __(
                    'Make the file for the supplier and send it yourself (WhatsApp, email). Muelle never messages the supplier.',
                    null,
                    'Surtido',
                  )
                }}
              </p>
              <Button
                :label="__('Spreadsheet', null, 'Surtido')"
                :loading="busy === 'xlsx'"
                @click="share('xlsx')"
              />
              <Button
                :label="__('PDF', null, 'Surtido')"
                :loading="busy === 'pdf'"
                @click="share('pdf')"
              />
            </div>
            <p v-if="sharedFile" class="mb-4 text-sm">
              <a
                :href="sharedFile.file_url"
                target="_blank"
                rel="noopener"
                class="font-medium text-ink-blue-7 underline"
                >{{ __('Download {0}', [sharedFile.file_name], 'Surtido') }}</a
              >
            </p>

            <!-- the supplier's reply -->
            <div
              v-if="
                pedido.owner && ['Enviado', 'Cotizado'].includes(pedido.status)
              "
              class="mb-4 rounded-6 border border-dashed border-outline-gray-3 p-4"
              :class="dragging ? 'bg-surface-gray-2' : ''"
              @dragover.prevent="dragging = true"
              @dragleave="dragging = false"
              @drop.prevent="dropReply"
            >
              <p class="text-sm font-medium">
                {{
                  pedido.quote_revision
                    ? __(
                        'A new reply replaces the last one ({0}).',
                        [pedido.quote_revision],
                        'Surtido',
                      )
                    : __('Drop the supplier reply here', null, 'Surtido')
                }}
              </p>
              <p class="text-xs text-ink-gray-5">
                {{
                  __(
                    'PDF, photo or spreadsheet; or paste the text.',
                    null,
                    'Surtido',
                  )
                }}
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <label
                  class="inline-flex min-h-9 cursor-pointer items-center rounded-4 bg-surface-gray-2 px-3 text-sm hover:bg-surface-gray-3"
                >
                  {{ __('Choose file', null, 'Surtido') }}
                  <input
                    type="file"
                    class="sr-only"
                    accept=".pdf,.xlsx,.xls,.csv,image/*"
                    @change="pickReply"
                  />
                </label>
                <span
                  v-if="busy === 'reply'"
                  role="status"
                  class="text-sm text-ink-gray-6"
                >
                  {{ __('Reading the reply…', null, 'Surtido') }}
                </span>
              </div>
              <textarea
                v-model="replyText"
                rows="3"
                class="mt-2 w-full rounded-4 border border-outline-gray-2 p-2 text-sm"
                :aria-label="__('Paste the reply', null, 'Surtido')"
                :placeholder="
                  __('Or paste what the supplier wrote…', null, 'Surtido')
                "
              />
              <div class="flex justify-end">
                <Button
                  :label="__('Read pasted reply', null, 'Surtido')"
                  :disabled="!replyText.trim() || busy === 'reply'"
                  @click="attachReply({ text: replyText })"
                />
              </div>
            </div>

            <!-- new rows of the reply -->
            <section v-if="pedido.pending_rows?.length" class="mb-5">
              <h3 class="mb-1 text-base font-semibold">
                {{
                  __(
                    'New in the reply ({0})',
                    [pedido.pending_rows.length],
                    'Surtido',
                  )
                }}
              </h3>
              <p class="mb-2 text-xs text-ink-gray-5">
                {{
                  __(
                    'The shop does not know these yet. Say if each one uses batches and serial numbers, then create the items; or omit them.',
                    null,
                    'Surtido',
                  )
                }}
              </p>
              <ul
                class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
              >
                <li
                  v-for="row in pedido.pending_rows"
                  :key="row.index"
                  class="flex flex-wrap items-center gap-3 p-3"
                >
                  <input
                    v-model="rowPick[row.index]"
                    type="checkbox"
                    :aria-label="
                      __('Choose {0}', [row.description || row.code], 'Surtido')
                    "
                  />
                  <div class="min-w-0 flex-1 basis-56">
                    <p class="truncate font-medium">
                      {{ row.description || row.code }}
                    </p>
                    <p class="truncate text-xs text-ink-gray-5">
                      {{
                        [
                          row.code,
                          row.model,
                          row.colour,
                          row.new ? '' : __('ambiguous match', null, 'Surtido'),
                        ]
                          .filter(Boolean)
                          .join(', ')
                      }}
                    </p>
                  </div>
                  <span class="text-sm tabular-nums">
                    {{ qty(row.qty) }} × {{ money(row.unit_price) }}
                  </span>
                  <label class="flex items-center gap-1 text-sm">
                    {{ __('Batches', null, 'Surtido') }}
                    <select
                      :value="rowBatch[row.index] ?? ''"
                      class="h-8 rounded-4 border border-outline-gray-2 text-sm"
                      @change="
                        rowBatch = {
                          ...rowBatch,
                          [row.index]: $event.target.value,
                        }
                      "
                    >
                      <option value="">—</option>
                      <option value="1">
                        {{ __('Yes', null, 'Surtido') }}
                      </option>
                      <option value="0">{{ __('No', null, 'Surtido') }}</option>
                    </select>
                  </label>
                  <label class="flex items-center gap-1 text-sm">
                    {{ __('Serials', null, 'Surtido') }}
                    <select
                      :value="rowSerial[row.index] ?? ''"
                      class="h-8 rounded-4 border border-outline-gray-2 text-sm"
                      @change="
                        rowSerial = {
                          ...rowSerial,
                          [row.index]: $event.target.value,
                        }
                      "
                    >
                      <option value="">—</option>
                      <option value="1">
                        {{ __('Yes', null, 'Surtido') }}
                      </option>
                      <option value="0">{{ __('No', null, 'Surtido') }}</option>
                    </select>
                  </label>
                </li>
              </ul>
              <div
                v-if="pedido.owner"
                class="mt-2 flex flex-wrap justify-end gap-2"
              >
                <Button
                  :label="__('Omit chosen', null, 'Surtido')"
                  :disabled="!picked.length || pedido.status !== 'Cotizado'"
                  :loading="busy === 'omit'"
                  @click="omit"
                />
                <button
                  type="button"
                  :class="['press', BTN.filled]"
                  :disabled="!picked.length || !pickedReady || busy === 'items'"
                  @click="createItems"
                >
                  <span
                    :class="[
                      busy === 'items'
                        ? 'lucide-loader-circle animate-spin'
                        : 'lucide-package',
                      'size-5',
                    ]"
                    aria-hidden="true"
                  />
                  {{ __('Create chosen items', null, 'Surtido') }}
                </button>
              </div>
              <p
                v-if="picked.length && !pickedReady"
                class="mt-1 text-right text-xs text-ink-amber-7"
              >
                {{
                  __(
                    'Say batches and serials for every chosen row.',
                    null,
                    'Surtido',
                  )
                }}
              </p>
            </section>

            <!-- the order lines -->
            <section class="mb-5">
              <h3 class="mb-2 text-base font-semibold">
                {{ __('Order lines ({0})', [pedido.lines.length], 'Surtido') }}
              </h3>
              <ul
                class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
              >
                <li
                  v-for="line in pedido.lines"
                  :key="line.line"
                  class="flex flex-wrap items-center gap-3 p-3"
                >
                  <div class="min-w-0 flex-1 basis-56">
                    <p class="truncate font-medium">
                      {{ line.name || line.code }}
                    </p>
                    <p class="truncate text-xs text-ink-gray-5">
                      {{
                        [line.code, line.model, line.colour, line.item]
                          .filter(Boolean)
                          .join(', ')
                      }}
                    </p>
                    <p v-if="line.note" class="text-xs text-ink-gray-6">
                      {{ line.note }}
                    </p>
                  </div>
                  <Badge
                    :theme="lineTheme(line.status)"
                    :label="lineStatus(line.status)"
                  />
                  <template v-if="pedido.owner && pedido.status === 'Borrador'">
                    <input
                      type="number"
                      min="1"
                      class="h-9 w-20 rounded-4 border border-outline-gray-2 px-2 text-right tabular-nums"
                      :aria-label="
                        __('Pieces of {0}', [line.name || line.code], 'Surtido')
                      "
                      :value="line.qty"
                      @change="updateQty(line, Number($event.target.value))"
                    />
                    <Button
                      :icon="LucideX"
                      :aria-label="
                        __('Remove {0}', [line.name || line.code], 'Surtido')
                      "
                      @click="removeLine(line)"
                    />
                  </template>
                  <span v-else class="text-sm tabular-nums">
                    {{
                      line.quoted_qty
                        ? __(
                            '{0} of {1} at {2}',
                            [
                              qty(line.quoted_qty),
                              qty(line.qty),
                              money(line.quoted_price),
                            ],
                            'Surtido',
                          )
                        : qty(line.qty)
                    }}
                  </span>
                </li>
              </ul>
            </section>

            <!-- missing → Material Request -->
            <section v-if="pedido.missing?.length" class="mb-5">
              <h3 class="mb-1 text-base font-semibold">
                {{
                  __(
                    'The supplier did not send ({0})',
                    [pedido.missing.length],
                    'Surtido',
                  )
                }}
              </h3>
              <ul
                class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
              >
                <li
                  v-for="m in pedido.missing"
                  :key="m.line"
                  class="flex items-center gap-3 p-3 text-sm"
                >
                  <input
                    v-model="missingPick[m.line]"
                    type="checkbox"
                    :disabled="!m.item"
                    :aria-label="__('Choose {0}', [m.name], 'Surtido')"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate">{{ m.name }}</span>
                    <span
                      v-if="!m.item"
                      class="block text-xs text-ink-amber-7"
                      >{{
                        __('Create or link the item first', null, 'Surtido')
                      }}</span
                    >
                  </span>
                  <span class="tabular-nums">{{ qty(m.qty) }}</span>
                </li>
              </ul>
              <div v-if="pedido.owner" class="mt-2 flex justify-end">
                <Button
                  :label="
                    __('Send to a material request (draft)', null, 'Surtido')
                  "
                  :disabled="!missingPicked.length"
                  :loading="busy === 'mr'"
                  @click="materialRequest"
                />
              </div>
              <p v-if="lastRequest" class="mt-1 text-right text-sm">
                {{ __('Draft material request {0}', [lastRequest], 'Surtido') }}
              </p>
            </section>

            <!-- the Items the close creates, from the price list's lines -->
            <section
              v-if="
                pedido.owner &&
                pedido.status === 'Cotizado' &&
                pedido.new_items?.length
              "
              class="mb-5"
              data-testid="surtido-new-items"
            >
              <h3 class="mb-1 text-base font-semibold">
                {{
                  __(
                    'Items the close creates ({0})',
                    [pedido.new_items.length],
                    'Surtido',
                  )
                }}
              </h3>
              <p class="mb-2 text-xs text-ink-gray-5">
                {{
                  __(
                    'Each one takes its name from the list and the product type of its section. Serial numbers follow the section unless you say otherwise.',
                    null,
                    'Surtido',
                  )
                }}
              </p>
              <ul
                class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
              >
                <li
                  v-for="row in pedido.new_items"
                  :key="row.catalogo_linea"
                  class="flex flex-wrap items-center gap-3 p-3"
                >
                  <div class="min-w-0 flex-1 basis-56">
                    <p class="truncate font-medium">{{ row.name }}</p>
                    <p
                      v-if="row.group_missing"
                      class="truncate text-xs text-ink-amber-9"
                    >
                      {{
                        __(
                          'Section «{0}» has no product type; set it in Compras › Settings, sections of the list.',
                          [row.section],
                          'Surtido',
                        )
                      }}
                    </p>
                    <p v-else class="truncate text-xs text-ink-gray-5">
                      {{
                        [row.section, row.item_group].filter(Boolean).join(', ')
                      }}
                    </p>
                  </div>
                  <label class="flex items-center gap-1 text-sm">
                    {{ __('Batches', null, 'Surtido') }}
                    <select
                      :value="newBatch[row.catalogo_linea] ?? '0'"
                      class="h-8 rounded-4 border border-outline-gray-2 text-sm"
                      @change="
                        newBatch = {
                          ...newBatch,
                          [row.catalogo_linea]: $event.target.value,
                        }
                      "
                    >
                      <option value="1">
                        {{ __('Yes', null, 'Surtido') }}
                      </option>
                      <option value="0">{{ __('No', null, 'Surtido') }}</option>
                    </select>
                  </label>
                  <label class="flex items-center gap-1 text-sm">
                    {{ __('Serials', null, 'Surtido') }}
                    <select
                      :value="
                        newSerial[row.catalogo_linea] ??
                        (row.has_serial_default ? '1' : '0')
                      "
                      class="h-8 rounded-4 border border-outline-gray-2 text-sm"
                      @change="
                        newSerial = {
                          ...newSerial,
                          [row.catalogo_linea]: $event.target.value,
                        }
                      "
                    >
                      <option value="1">
                        {{ __('Yes', null, 'Surtido') }}
                      </option>
                      <option value="0">{{ __('No', null, 'Surtido') }}</option>
                    </select>
                  </label>
                </li>
              </ul>
            </section>

            <div
              v-if="pedido.owner && pedido.status === 'Cotizado'"
              class="flex flex-wrap items-center justify-end gap-2 border-t border-outline-gray-2 pt-4"
            >
              <p class="min-w-0 flex-1 text-sm text-ink-gray-6">
                {{
                  firstMissing
                    ? __(
                        'Give section «{0}» a product type in Compras › Settings before closing.',
                        [firstMissing],
                        'Surtido',
                      )
                    : __(
                        'Closing makes the supplier quotation and a draft purchase with what the supplier confirmed.',
                        null,
                        'Surtido',
                      )
                }}
              </p>
              <button
                type="button"
                :class="['press', BTN.filled]"
                :disabled="busy === 'close' || Boolean(firstMissing)"
                @click="closePedido"
              >
                <span
                  :class="[
                    busy === 'close'
                      ? 'lucide-loader-circle animate-spin'
                      : 'lucide-check',
                    'size-5',
                  ]"
                  aria-hidden="true"
                />
                {{ __('Close the order', null, 'Surtido') }}
              </button>
            </div>
          </template>
        </section>
      </div>
    </div>
    <!-- the plan's total and the one action, in thumb reach -->
    <div
      v-if="ready && step !== 'respuesta' && plan && boot.owner"
      class="flex-none border-t border-outline-gray-2 bg-surface-base px-4 py-3 sm:px-6"
      data-testid="surtido-dock"
    >
      <div class="mx-auto flex w-full max-w-5xl items-center gap-3">
        <div class="min-w-0 flex-1">
          <p class="num truncate text-base font-semibold text-ink-gray-9">
            {{ money(dockTotal) }}
            <span
              class="hidden font-normal text-ink-gray-6 min-[360px]:inline"
              >{{ __('of {0}', [money(plan.budget)], 'Surtido') }}</span
            >
          </p>
          <p class="truncate text-sm text-ink-gray-6">
            {{ dockNote }}
          </p>
        </div>
        <button
          type="button"
          :class="['press flex-none', BTN.filled]"
          :disabled="!canApprove"
          data-testid="surtido-crear"
          @click="approve"
        >
          <span
            :class="[
              busy === 'approve' || planBusy
                ? 'lucide-loader-circle animate-spin'
                : 'lucide-check',
              'size-5',
            ]"
            aria-hidden="true"
          />
          {{ __('Create the order', null, 'Surtido') }}
        </button>
      </div>
    </div>

    <BottomSheet
      v-if="listsMounted"
      v-model:open="listsOpen"
      :title="__('Supplier lists', null, 'Surtido')"
      flush
    >
      <ul class="divide-y divide-outline-gray-1" data-testid="surtido-listas">
        <li v-for="c in boot.catalogs" :key="c.name" class="flex items-center">
          <button
            type="button"
            class="press flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left hover:bg-surface-gray-1"
            :aria-current="catalog === c.name ? 'true' : undefined"
            data-testid="surtido-lista"
            @click="pickList(c.name)"
          >
            <span
              class="flex size-5 flex-none items-center justify-center"
              aria-hidden="true"
            >
              <span
                v-if="catalog === c.name"
                class="lucide-check size-5 text-ink-gray-9"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ listName(c) }}</span>
              <span class="num block truncate text-sm text-ink-gray-6">{{
                listLine(c)
              }}</span>
            </span>
          </button>
          <RouterLink
            :to="{ name: 'CompraLista', params: { name: c.name } }"
            class="press mr-2 inline-flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
            :aria-label="__('Open the list {0}', [listName(c)], 'Surtido')"
            :title="__('Open the list', null, 'Surtido')"
            data-testid="surtido-abrir-lista"
          >
            <span class="lucide-table size-5" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
      <div v-if="boot.owner" class="space-y-3 px-4 py-4">
        <label
          class="press flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-6 border border-dashed border-outline-gray-3 text-base text-ink-gray-8 hover:bg-surface-gray-1"
          :class="upload ? 'pointer-events-none opacity-50' : ''"
        >
          <span class="lucide-upload size-5" aria-hidden="true" />
          {{ __('Add a list', null, 'Surtido') }}
          <input
            type="file"
            class="sr-only"
            multiple
            :accept="LIST_ACCEPT"
            :disabled="!!upload"
            @change="pickCatalogFromSheet"
          />
        </label>
        <details>
          <summary
            class="fold-summary press flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink-gray-8"
          >
            <span
              class="lucide-chevron-right size-4 transition-transform"
              aria-hidden="true"
            />
            {{ __('Upload from another device', null, 'Surtido') }}
          </summary>
          <p class="mt-1 text-sm text-ink-gray-6">
            {{
              __(
                'A link for your phone or the supplier, with the supplier chosen above if any. It lasts one day.',
                null,
                'Surtido',
              )
            }}
          </p>
          <div class="mt-3 space-y-3">
            <ComprasPicker
              v-model="newSupplier"
              :display="newSupplierLabel"
              :label="__('Supplier (optional)', null, 'Surtido')"
              :placeholder="__('Search supplier', null, 'Surtido')"
              :load="(q) => call('suppliers', { search: q })"
              @pick="(o) => (newSupplierLabel = o.label)"
            />
            <FormControl
              v-model="newTitle"
              :label="__('Name of the list', null, 'Surtido')"
              :placeholder="__('October cases', null, 'Surtido')"
            />
            <button
              type="button"
              :class="['press', BTN.filled]"
              :disabled="
                !(newSupplier || newTitle.trim()) || busy === 'catalog'
              "
              @click="createCatalog"
            >
              <span
                :class="[
                  busy === 'catalog'
                    ? 'lucide-loader-circle animate-spin'
                    : 'lucide-upload',
                  'size-5',
                ]"
                aria-hidden="true"
              />
              {{ __('Create and get the upload link', null, 'Surtido') }}
            </button>
            <p v-if="uploadUrl" class="text-sm">
              <a
                :href="uploadUrl"
                target="_blank"
                rel="noopener"
                class="font-medium text-ink-blue-7 underline"
                >{{ __('Open the upload page', null, 'Surtido') }}</a
              >
            </p>
          </div>
        </details>
      </div>
      <div
        v-if="boot.pedidos.length"
        class="border-t border-outline-gray-2 pt-2"
      >
        <p class="px-4 py-2 text-sm font-medium text-ink-gray-7">
          {{ __('Recent orders to suppliers', null, 'Surtido') }}
        </p>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="p in boot.pedidos" :key="p.name">
            <button
              type="button"
              class="press flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-gray-1"
              @click="openPedidoFromSheet(p.name)"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ p.supplier }}</span>
                <span class="num block truncate text-sm text-ink-gray-6">
                  {{ p.name
                  }}<template v-if="p.ceiling"
                    >,
                    {{
                      __('budget {0}', [money(p.ceiling)], 'Surtido')
                    }}</template
                  >
                </span>
              </span>
              <Badge
                :theme="pedidoTheme(p.status)"
                :label="pedidoStatus(p.status)"
              />
            </button>
          </li>
        </ul>
      </div>
    </BottomSheet>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FormControl, toast } from 'frappe-ui'
import { AppBar, BottomSheet, ChipGroup, EmptyState } from '@/components/ui'
import { isMobile } from '@/composables/breakpoint'
import { BTN } from '@/documentos/tools'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import CatalogProgress from '@/components/compras/CatalogProgress.vue'
import { BUSY, progressOf } from '@/utils/catalogProgress'
import {
  assistantOn,
  loadAssistant,
} from '@/components/assistant/assistantDoor'
import { comprasApi, money, problemOf, qty } from '@/composables/useCompras'
import {
  buildChanges,
  budgetShare,
  lineTone,
  pedidoTone,
  closeSpecs,
  lineMeta,
  readyRows,
  skippedText,
} from '@/utils/surtido'
import { sendEach, uploadCatalog, uploadPictures } from '@/utils/catalogUpload'
import { LIST_ACCEPT, dropFiles } from '@/utils/listaPrecios'
import { buyText, levelState } from '@/utils/niveles'
import {
  DEFAULT_ASK,
  canPlan,
  planArgs as askArgs,
  printedText,
  saveAsk,
  savedAsk,
  settingsChanged,
  underMinimum,
} from '@/utils/surtidoAsk'
import LucideRotateCcw from '~icons/lucide/rotate-ccw'
import LucideX from '~icons/lucide/x'
import LucideDroplet from '~icons/lucide/droplet'

const API = 'doco.workspaces.sourcing.'
const call = (method, args = {}) => comprasApi(API + method, args)

const route = useRoute()
const router = useRouter()
const phone = isMobile
const ready = ref(false)
const guard = ref(null)
const problem = ref(null)
const busy = ref('')
const boot = ref({ catalogs: [], pedidos: [], owner: false })
const step = ref('lista')
const catalog = ref('')
const uploadUrl = ref('')
const newSupplier = ref('')
const newSupplierLabel = ref('')
const newTitle = ref('')
const planSupplier = ref('')
const upload = ref(null)
// Several files dropped at once upload one after the other: {at, of}.
const batch = ref(null)
const dropping = ref(false)
const readQuote = ref(null)
// the catalog the owner just dropped or asked to read: picked once it has lines
const awaited = ref('')
// the owner's request in the list's own words (utils/surtidoAsk); the plan follows it
const ask = reactive({ ...DEFAULT_ASK, marks: [] })
const facets = ref({
  sections: [],
  marks: [],
  groups: [],
  supplier_guess: null,
})
const listsOpen = ref(false)
const listsMounted = ref(false)
const budgetInput = ref(null)
const plan = ref(null)
const edits = ref({})
const adds = ref({})
const pedido = ref(null)
const sharedFile = ref(null)
const replyText = ref('')
const dragging = ref(false)
const rowPick = ref({})
const rowBatch = ref({})
const rowSerial = ref({})
const newBatch = ref({})
const newSerial = ref({})
const missingPick = ref({})
const lastRequest = ref('')

const steps = computed(() => [
  { key: 'plan', label: __('List and plan', null, 'Surtido') },
  {
    key: 'respuesta',
    label: __('Reply', null, 'Surtido'),
    disabled: !pedido.value,
  },
])
const current = computed(
  () => boot.value.catalogs.find((c) => c.name === catalog.value) || null,
)
const planBusy = computed(
  () => busy.value === 'plan' || busy.value === 'changes',
)
const changedSettings = computed(() => settingsChanged(ask))
const hasLevels = computed(
  () =>
    Boolean(plan.value?.levels?.length) ||
    Boolean(plan.value?.tones_missing?.length) ||
    Boolean(plan.value?.levels_uncovered?.length),
)
const chip = (row) => ({ value: row.label, label: row.label, count: row.count })
const sectionOptions = computed(() => facets.value.sections.map(chip))
const markOptions = computed(() => facets.value.marks.map(chip))
const groupOptions = computed(() =>
  facets.value.groups.map((g) => ({ value: g.name, label: g.name })),
)
// a correction the plan could not apply, unless it is about a model the list does not carry
const unresolvedShown = computed(() =>
  (plan.value?.unresolved || []).filter(
    (u) => !(plan.value?.focus_missing || []).some((m) => u.includes(`«${m}»`)),
  ),
)
const qtyOf = (line) => edits.value[line.line]?.qty ?? line.qty
const pieces = computed(() =>
  (plan.value?.lines || []).reduce((n, l) => n + (Number(l.qty) || 0), 0),
)
// what the bar shows while a correction is on its way: the lines as the owner left them
const dockTotal = computed(() =>
  (plan.value?.lines || []).reduce(
    (sum, l) =>
      edits.value[l.line]?.remove ? sum : sum + Number(l.price) * qtyOf(l),
    0,
  ),
)
const canApprove = computed(
  () =>
    Boolean(plan.value?.lines?.length) &&
    !pendingChanges.value.length &&
    !planBusy.value &&
    Boolean(plan.value?.supplier || planSupplier.value) &&
    busy.value !== 'approve',
)
const dockNote = computed(() => {
  if (planBusy.value || pendingChanges.value.length)
    return __('Updating the plan…', null, 'Surtido')
  if (!plan.value?.lines?.length)
    return __('Nothing to order yet', null, 'Surtido')
  if (!plan.value.supplier && !planSupplier.value)
    return __('Choose whose list it is to create the order', null, 'Surtido')
  if (plan.value.minimums?.length)
    return __('Confirm the minimum pieces with the supplier', null, 'Surtido')
  return plan.value.supplier
    ? __(
        '{0} lines, {1} pieces, to {2}',
        [plan.value.lines.length, pieces.value, plan.value.supplier],
        'Surtido',
      )
    : __(
        '{0} lines, {1} pieces',
        [plan.value.lines.length, pieces.value],
        'Surtido',
      )
})
const budgetPct = computed(() => budgetShare(plan.value))
const skipped = computed(() => skippedText(plan.value?.counts))
const pendingChanges = computed(() =>
  buildChanges(plan.value, edits.value, adds.value),
)
const picked = computed(() =>
  (pedido.value?.pending_rows || [])
    .filter((r) => rowPick.value[r.index])
    .map((r) => r.index),
)
const pickedReady = computed(
  () => readyRows(picked.value, rowBatch.value, rowSerial.value).ok,
)
const firstMissing = computed(
  () =>
    (pedido.value?.new_items || []).find((row) => row.group_missing)?.section ||
    '',
)
const missingPicked = computed(() =>
  (pedido.value?.missing || [])
    .filter((m) => m.item && missingPick.value[m.line])
    .map((m) => m.line),
)

const STATUS = {
  'Esperando archivo': () => __('Waiting for the file', null, 'Surtido'),
  Recibido: () => __('Received', null, 'Surtido'),
  Indexando: () => __('Reading', null, 'Surtido'),
  Indexado: () => __('Read', null, 'Surtido'),
  Listo: () => __('Ready', null, 'Surtido'),
  Cerrado: () => __('Closed', null, 'Surtido'),
  Error: () => __('Error', null, 'Surtido'),
  Borrador: () => __('Draft', null, 'Surtido'),
  Enviado: () => __('Sent', null, 'Surtido'),
  Cotizado: () => __('Replied', null, 'Surtido'),
  Pendiente: () => __('Pending', null, 'Surtido'),
  Confirmada: () => __('Confirmed', null, 'Surtido'),
  'Sin existencia': () => __('Not sent', null, 'Surtido'),
  Descartada: () => __('Dropped', null, 'Surtido'),
}
const label = (status) => (STATUS[status] ? STATUS[status]() : status || '')
// A list on its way (indexing, reading, waiting for the owner, stopped) shows
// its bar and line; a settled one its status.
const BAR_STAGES = [...BUSY, 'confirm', 'failed']
const showsBar = (c) => BAR_STAGES.includes(progressOf(c)?.stage)
// a list reads by its supplier, else its name without the file's extension
function listName(c) {
  const title = String(c?.title || c?.name || '').replace(
    /\.(jpe?g|png|webp|heic|pdf|xlsx?|csv|ods|docx?)$/iu,
    '',
  )
  return c?.supplier ? `${c.supplier}, ${title}` : title
}
function listLine(c) {
  const p = progressOf(c)
  if (p?.stage === 'stalled')
    return __('{0} pages, the read stopped', [c.page_count || 0], 'Surtido')
  if (c.reading || BUSY.includes(p?.stage) || SETTLING.includes(c.status))
    return __('{0} pages, reading…', [c.page_count || 0], 'Surtido')
  return countsText(c)
}
const stalled = (c) => progressOf(c)?.stage === 'stalled'
function openLists() {
  listsMounted.value = true
  listsOpen.value = true
}
function pickList(name) {
  catalog.value = name
  listsOpen.value = false
}
function pickCatalogFromSheet(event) {
  listsOpen.value = false
  pickCatalog(event)
}
function openPedidoFromSheet(name) {
  listsOpen.value = false
  openPedido(name)
}
function countsText(c) {
  return __(
    '{0} pages, {1} products',
    [c.page_count || 0, c.lines || 0],
    'Surtido',
  )
}
const pedidoStatus = label
const lineStatus = label
const pedidoTheme = pedidoTone
const lineTheme = lineTone

function fail(error) {
  problem.value = problemOf(error)
}

async function run(key, fn) {
  busy.value = key
  problem.value = null
  try {
    return await fn()
  } catch (error) {
    fail(error)
    return null
  } finally {
    busy.value = ''
  }
}

const SETTLING = ['Recibido', 'Indexando']

function setBoot(out) {
  boot.value = { catalogs: [], pedidos: [], ...out }
  const done = boot.value.catalogs.find((c) => c.name === awaited.value)
  if (!done || done.reading || SETTLING.includes(done.status)) return
  awaited.value = ''
  if (done.lines) {
    catalog.value = done.name
    toast.success(
      __(
        '{0} is ready: {1} products',
        [done.title || done.name, done.lines],
        'Surtido',
      ),
    )
  } else if (canRead(done)) estimateRead(done.name)
}

async function loadBoot() {
  const out = await run('boot', () => call('bootstrap'))
  if (out) setBoot(out)
  return out
}

// A list still uploading, indexing or being read refreshes itself; a quiet
// refresh keeps the problem on screen (run() clears it).
const POLL_MS = 3000
let poll = null
async function refresh() {
  try {
    const out = await call('bootstrap')
    if (out?.enabled) setBoot(out)
  } catch {
    // the next tick, or Refresh, tries again
  }
}
const settling = computed(() =>
  boot.value.catalogs.some(
    (c) =>
      c.reading ||
      SETTLING.includes(c.status) ||
      BUSY.includes(progressOf(c)?.stage),
  ),
)
function schedulePoll() {
  clearTimeout(poll)
  poll = null
  if (!settling.value) return
  poll = setTimeout(async () => {
    await refresh()
    schedulePoll()
  }, POLL_MS)
}
watch(settling, schedulePoll)

const READABLE = ['Indexado', 'Listo']
const canRead = (c) => READABLE.includes(c.status) && !c.lines && !c.reading

function uploadProblem(error) {
  if (error?.uploadFailure === 'network')
    return {
      title: __('The upload stopped', null, 'Surtido'),
      detail: __(
        'The connection dropped. Choose the file again on its list.',
        null,
        'Surtido',
      ),
    }
  if (error?.uploadFailure)
    return {
      title: __('The upload stopped', null, 'Surtido'),
      detail: __(
        'A part of the file was not saved. Choose the file again on its list.',
        null,
        'Surtido',
      ),
    }
  return problemOf(error)
}

async function sendCatalog(link, name, file) {
  upload.value = { name: file.name, pct: 0 }
  problem.value = null
  try {
    await uploadCatalog(link, file, {
      onProgress: (pct) => (upload.value = { name: file.name, pct }),
    })
    awaited.value = name
    catalog.value = name
    toast.success(
      __('{0} uploaded; it reads itself now', [file.name], 'Surtido'),
    )
  } catch (error) {
    problem.value = uploadProblem(error)
  } finally {
    upload.value = null
    await refresh()
    schedulePoll()
  }
}

// Pictures of a list: the first through the session, the rest beside it,
// then the read; the page opens the list so the lines appear as they are read.
async function sendPictures(link, name, files) {
  upload.value = { name: __('{0} pictures', [files.length], 'Surtido'), pct: 0 }
  problem.value = null
  let opened = false
  try {
    await uploadPictures(link, name, files, {
      onProgress: (done, total) =>
        (upload.value = {
          name: __('{0} pictures', [total], 'Surtido'),
          pct: Math.round((100 * done) / total),
        }),
    })
    toast.success(
      __(
        '{0} pictures uploaded; the list reads itself now',
        [files.length],
        'Surtido',
      ),
    )
    opened = true
    catalog.value = name
    awaited.value = name
    await refresh()
    schedulePoll()
  } catch (error) {
    problem.value = uploadProblem(error)
  } finally {
    upload.value = null
    if (!opened) {
      await refresh()
      schedulePoll()
    }
  }
}

async function newFromFile(file) {
  if (!file || upload.value) return
  const out = await run('catalog', () =>
    call('new_catalog', {
      supplier: newSupplier.value || undefined,
      title: file.name,
    }),
  )
  if (out) await sendCatalog(out.upload_url, out.catalog, file)
}

async function newFromPictures(files) {
  if (!files.length || upload.value) return
  const out = await run('catalog', () =>
    call('new_catalog', {
      supplier: newSupplier.value || undefined,
      title: files[0].name,
    }),
  )
  if (out) await sendPictures(out.upload_url, out.catalog, files)
}

/**
 * A drop or a pick: each PDF or sheet becomes its own list (a supplier that
 * sends one list per line of product drops them all at once), then the
 * pictures become one list.
 */
async function newFromFiles(list) {
  const { pictures, documents } = dropFiles(list)
  if (upload.value || batch.value) return
  await sendEach(
    documents,
    async (file) => {
      await newFromFile(file)
      return !problem.value
    },
    (step) => (batch.value = step),
  )
  if (pictures.length && !problem.value) await newFromPictures(pictures)
}

function pickCatalog(event) {
  newFromFiles(event.target.files)
  event.target.value = ''
}

function dropCatalog(event) {
  dropping.value = false
  newFromFiles(event.dataTransfer?.files)
}

async function pickInto(name, event) {
  const { pictures, documents } = dropFiles(event.target.files)
  event.target.value = ''
  if ((!pictures.length && !documents.length) || upload.value) return
  const out = await run('link', () => call('upload_link', { catalog: name }))
  if (!out) return
  if (pictures.length) await sendPictures(out.upload_url, name, pictures)
  else await sendCatalog(out.upload_url, name, documents[0])
}

async function estimateRead(name) {
  readQuote.value = null
  const out = await run('estimate:' + name, () =>
    call('read_estimate', { catalog: name }),
  )
  if (out) readQuote.value = { catalog: name, ...out }
}

async function readProducts() {
  const quote = readQuote.value
  const out = await run('read', () =>
    call('read_products', { catalog: quote.catalog, units: quote.units }),
  )
  if (!out) return
  readQuote.value = null
  awaited.value = quote.catalog
  await refresh()
  schedulePoll()
}

async function start() {
  guard.value = null
  try {
    const out = await call('bootstrap')
    if (!out.enabled) {
      guard.value = {
        title: __('Restocking is not available', null, 'Surtido'),
        detail: out.reason || '',
      }
      return
    }
    boot.value = out
  } catch (error) {
    const p = problemOf(error)
    guard.value = {
      title: __('Could not open restocking', null, 'Surtido'),
      detail: p.detail,
    }
    return
  }
  const q = route.query
  if (typeof q.catalogo === 'string') catalog.value = q.catalogo
  else
    catalog.value =
      boot.value.catalogs.find((c) => READABLE.includes(c.status) && c.lines)
        ?.name ||
      boot.value.catalogs[0]?.name ||
      ''
  step.value = 'plan'
  ready.value = true
  if (typeof q.pedido === 'string' && q.pedido) await openPedido(q.pedido)
}

function go(key) {
  step.value = key
  const query = { ...route.query, paso: key }
  if (key !== 'respuesta') delete query.pedido
  else if (pedido.value) query.pedido = pedido.value.pedido
  router.replace({ query })
}

async function createCatalog() {
  const out = await run('catalog', () =>
    call('new_catalog', { supplier: newSupplier.value, title: newTitle.value }),
  )
  if (!out) return
  uploadUrl.value = out.upload_url
  newTitle.value = ''
  await loadBoot()
}

async function linkFor(name) {
  const out = await run('link', () => call('upload_link', { catalog: name }))
  if (out) uploadUrl.value = out.upload_url
}

function resetEdits() {
  edits.value = {}
  adds.value = {}
}

let planSeq = 0
async function makePlan() {
  if (!canPlan(ask, current.value)) return
  const seq = ++planSeq
  const out = await run('plan', () => call('plan', askArgs(ask, catalog.value)))
  // a newer request went out while this one ran: its answer is the one shown
  if (!out || seq !== planSeq) return
  plan.value = out
  resetEdits()
}

// the plan follows the request: a pause in the typing, then the plan
const PLAN_DELAY_MS = 450
let planTimer = 0
watch(
  () => [catalog.value, JSON.stringify(ask), current.value?.lines || 0],
  () => {
    clearTimeout(planTimer)
    saveAsk(catalog.value, { ...ask })
    if (!canPlan(ask, current.value)) return
    planTimer = setTimeout(makePlan, PLAN_DELAY_MS)
  },
)

// a correction (pieces, remove, add) applies itself after a short pause
const EDIT_DELAY_MS = 700
let editTimer = 0
watch(
  () => JSON.stringify(pendingChanges.value),
  () => {
    clearTimeout(editTimer)
    if (!pendingChanges.value.length || !plan.value) return
    editTimer = setTimeout(applyChanges, EDIT_DELAY_MS)
  },
)

function bump(line, delta) {
  const next = Number(qtyOf(line)) + delta
  if (next >= 1) setEdit(line, 'qty', next)
}

// the list's own words for the request: its sections, marks and the shop's groups
async function loadFacets(name) {
  facets.value = { sections: [], marks: [], groups: [], supplier_guess: null }
  if (!name) return
  try {
    const out = await call('facets', { catalog: name })
    if (name === catalog.value)
      facets.value = {
        sections: out?.sections || [],
        marks: out?.marks || [],
        groups: out?.groups || [],
        supplier_guess: out?.supplier_guess || null,
      }
    // a list that came without its supplier: the one its name says, kept unless changed
    if (name === catalog.value && out?.supplier_guess && !planSupplier.value)
      planSupplier.value = out.supplier_guess
  } catch {
    // the request still works without its chips
  }
}
watch(
  () => [catalog.value, current.value?.lines || 0],
  ([name, lines], [before] = []) => {
    if (name !== before) {
      plan.value = null
      resetEdits()
      const saved = savedAsk(name)
      const budget = ask.budget
      Object.assign(ask, { ...DEFAULT_ASK, marks: [], budget }, saved || {})
      planSupplier.value = ''
    }
    if (lines) loadFacets(name)
  },
)

function setEdit(line, key, value) {
  const cur = { ...edits.value[line.line] }
  if (key === 'qty' && (!Number.isInteger(value) || value < 1)) return
  cur[key] = value
  edits.value = { ...edits.value, [line.line]: cur }
}

function askColour(line) {
  const colour = window.prompt(
    __('New colour for {0}', [line.name], 'Surtido'),
    line.colour || '',
  )
  if (colour && colour.trim() && colour.trim() !== line.colour)
    setEdit(line, 'colour', colour.trim())
}

function toggleAdd(line) {
  const next = { ...adds.value }
  if (next[line.line]) delete next[line.line]
  else next[line.line] = Math.max(1, Number(line.suggested || line.qty) || 1)
  adds.value = next
}

async function applyChanges() {
  const changes = pendingChanges.value
  const out = await run('changes', () =>
    call('plan', { plan: plan.value.id, changes: JSON.stringify(changes) }),
  )
  if (!out) return
  plan.value = out
  resetEdits()
}

function resetReply() {
  rowPick.value = {}
  rowBatch.value = {}
  rowSerial.value = {}
  newBatch.value = {}
  newSerial.value = {}
  missingPick.value = {}
}

function showPedido(state) {
  pedido.value = state
  resetReply()
  step.value = 'respuesta'
  router.replace({
    query: { ...route.query, paso: 'respuesta', pedido: state.pedido },
  })
  setContext()
}

async function approve() {
  const out = await run('approve', () =>
    call('approve', {
      plan: plan.value.id,
      supplier: plan.value.supplier ? undefined : planSupplier.value,
    }),
  )
  if (!out) return
  toast.success(
    __('Draft order {0} for {1}', [out.pedido, out.supplier], 'Surtido'),
  )
  showPedido(out)
  loadBoot()
}

async function openPedido(name) {
  sharedFile.value = null
  lastRequest.value = ''
  const out = await run('pedido', () => call('pedido_state', { name }))
  if (out) showPedido(out)
}

const act = (key, method, args, after) =>
  run(key, () => call(method, { pedido: pedido.value.pedido, ...args })).then(
    (out) => {
      if (!out) return null
      pedido.value = out
      after?.(out)
      return out
    },
  )

function updateQty(line, value) {
  if (!Number.isInteger(value) || value < 1 || value === line.qty) return
  act('qty', 'update_qty', { line: line.line, qty: value })
}

function removeLine(line) {
  act('remove', 'remove_line', { line: line.line })
}

function share(format) {
  act(format, 'share_file', { file_format: format }, (out) => {
    sharedFile.value = out.file
    toast.success(__('File ready; the order is marked sent', null, 'Surtido'))
  })
}

async function uploadFile(file) {
  const body = new FormData()
  body.append('file', file, file.name)
  body.append('is_private', '1')
  body.append('folder', 'Home/Attachments')
  body.append('doctype', 'Pedido Catalogo')
  body.append('docname', pedido.value.pedido)
  const headers = { Accept: 'application/json' }
  if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
    headers['X-Frappe-CSRF-Token'] = window.csrf_token
  const response = await fetch('/api/method/upload_file', {
    method: 'POST',
    headers,
    body,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.message?.file_url) {
    const error = new Error(__('The file did not upload', null, 'Surtido'))
    error.status = response.status
    throw error
  }
  return data.message.file_url
}

function attachReply(args) {
  return act('reply', 'attach_reply', args, () => {
    replyText.value = ''
    resetReply()
    toast.success(__('Reply read', null, 'Surtido'))
  })
}

async function replyFromFile(file) {
  if (!file) return
  busy.value = 'reply'
  problem.value = null
  let fileUrl
  try {
    fileUrl = await uploadFile(file)
  } catch (error) {
    busy.value = ''
    fail(error)
    return
  }
  await attachReply({ file_url: fileUrl })
}

function pickReply(event) {
  replyFromFile(event.target.files?.[0])
  event.target.value = ''
}

function dropReply(event) {
  dragging.value = false
  replyFromFile(event.dataTransfer?.files?.[0])
}

function createItems() {
  const { rows } = readyRows(picked.value, rowBatch.value, rowSerial.value)
  act('items', 'create_items', { rows: JSON.stringify(rows) }, (out) => {
    const made = (out.created_now || []).filter((r) => r.created).length
    toast.success(__('Items created: {0}', [made], 'Surtido'))
    resetReply()
  })
}

function omit() {
  act(
    'omit',
    'omit_rows',
    { indexes: JSON.stringify(picked.value) },
    resetReply,
  )
}

function materialRequest() {
  act(
    'mr',
    'material_request',
    { lines: JSON.stringify(missingPicked.value) },
    (out) => {
      lastRequest.value = out.material_request
      missingPick.value = {}
    },
  )
}

function closePedido() {
  const specs = closeSpecs(
    pedido.value?.new_items || [],
    newBatch.value,
    newSerial.value,
  )
  act('close', 'close', { specs: JSON.stringify(specs) }, (out) => {
    toast.success(
      __(
        'Order closed; draft purchase {0}',
        [out.purchase_order || ''],
        'Surtido',
      ),
    )
    loadBoot()
  })
}

// --- «Pregúntale a Muelle»: the bot sees this screen's plan or order --------
let dropContext = null
function setContext() {
  loadAssistant().then((m) => {
    dropContext?.()
    dropContext = m.useAssistantContext(() =>
      pedido.value && step.value === 'respuesta'
        ? {
            doctype: 'Pedido Catalogo',
            name: pedido.value.pedido,
            title: pedido.value.supplier,
          }
        : catalog.value
          ? {
              doctype: 'Catalogo Proveedor',
              name: catalog.value,
              title: plan.value?.id || '',
            }
          : {},
    )
  })
}

async function askMuelle() {
  setContext()
  const m = await loadAssistant()
  let text = ''
  if (step.value === 'plan' && plan.value)
    text = __('In plan {0}, ', [plan.value.id], 'Surtido')
  else if (step.value === 'respuesta' && pedido.value)
    text = __('In order {0}, ', [pedido.value.pedido], 'Surtido')
  m.openAssistant({ text })
}

function onBack(event) {
  event?.preventDefault?.()
  goBack()
}
function goBack() {
  router.push({ name: 'Compras' })
}

onMounted(() => start().then(schedulePoll))
onBeforeUnmount(() => {
  dropContext?.()
  clearTimeout(poll)
})
</script>
<style scoped>
/* The plan lines: on a phone the name over its pieces, total and actions; where
   their own column has room, one table of product, pieces, total and actions. */
.plan-wrap {
  container-type: inline-size;
}
@container (min-width: 40rem) {
  .plan {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(7rem, auto) 4.5rem;
    column-gap: 1rem;
  }
  .plan-head,
  .plan-rows,
  .plan-line {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
  }
  .plan-cell-name {
    grid-column: auto;
  }
}
</style>
