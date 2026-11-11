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
            <div class="flex items-center gap-3">
              <button
                v-if="facets.pages.length"
                type="button"
                class="press relative size-14 flex-none overflow-hidden rounded-6 bg-surface-gray-2"
                :aria-label="__('See the list', null, 'Surtido')"
                :title="__('See the list', null, 'Surtido')"
                data-testid="surtido-ver-lista"
                @click="openPages(0)"
              >
                <img
                  :src="facets.pages[0].thumb"
                  alt=""
                  class="size-full object-cover object-top"
                  loading="lazy"
                />
                <span
                  v-if="facets.pages.length > 1"
                  class="num absolute bottom-1 right-1 rounded-full bg-surface-gray-9/80 px-1.5 text-xs text-ink-gray-1"
                  aria-hidden="true"
                  >{{ facets.pages.length }}</span
                >
              </button>
              <span
                v-else
                class="flex size-14 flex-none items-center justify-center rounded-6 bg-surface-gray-2 text-ink-gray-7"
                aria-hidden="true"
              >
                <span class="lucide-table size-6" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-base font-medium text-ink-gray-9">
                  {{ currentName }}
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

          <!-- the list as a shop: browse, search, add to the cart -->
          <SurtidoTienda
            v-if="current?.lines"
            v-model:filters="shop"
            :all="catalogRows"
            :pictures="catalogPictures"
            :loading="busy === 'catalogo'"
            :cart="cart"
            :marks-list="facets.marks"
            :groups="facets.groups"
            @pieces="setCart"
            @photo="openRowPhoto"
            @open="openProduct"
            @page="(n) => openPages(pageIndex(n))"
          />
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
    <!-- the cart, in thumb reach: what it holds and the way to the order -->
    <div
      v-if="ready && step !== 'respuesta' && cartRows.length"
      class="flex-none border-t border-outline-gray-2 bg-surface-base px-4 py-3 sm:px-6"
      data-testid="surtido-dock"
    >
      <div class="mx-auto flex w-full max-w-5xl items-center gap-3">
        <span
          class="relative flex size-11 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-8"
          aria-hidden="true"
        >
          <span class="lucide-shopping-cart size-5" />
          <span
            class="num absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--muelle-accent)] px-1 text-center text-xs leading-5 text-[var(--muelle-accent-ink)]"
            >{{ cartSum.lines }}</span
          >
        </span>
        <div class="min-w-0 flex-1">
          <p class="num truncate text-base font-semibold text-ink-gray-9">
            {{ money(cartSum.total) }}
            <span
              v-if="cartBudget"
              class="hidden font-normal text-ink-gray-6 min-[360px]:inline"
              >{{ __('of {0}', [money(cartBudget)], 'Surtido') }}</span
            >
          </p>
          <p class="truncate text-sm text-ink-gray-6">
            {{
              __(
                '{0} products, {1} pieces',
                [cartSum.lines, cartSum.pieces],
                'Surtido',
              )
            }}
          </p>
        </div>
        <button
          type="button"
          :class="['press flex-none', BTN.filled]"
          data-testid="surtido-ver-carrito"
          @click="openCart"
        >
          <span class="lucide-shopping-cart size-5" aria-hidden="true" />
          {{ __('See the order', null, 'Surtido') }}
        </button>
      </div>
    </div>

    <MediaViewer
      v-if="viewerMounted"
      v-model:open="viewer.open"
      v-model:index="viewer.index"
      :items="viewer.items"
      :title="viewer.title"
    >
      <template v-if="viewer.caption" #caption>{{ viewer.caption }}</template>
    </MediaViewer>

    <SurtidoProducto
      v-if="productMounted"
      v-model:open="productOpen"
      :row="productRow"
      :qty="productRow ? Number(cart[productRow.line]) || 0 : 0"
      :owner="boot.owner"
      @pieces="setCart"
      @photo="openRowPhoto"
      @page="(n) => openPages(pageIndex(n))"
      @similar="similarFrom"
      @linked="onLinked"
    />

    <BottomSheet
      v-if="cartMounted"
      v-model:open="cartOpen"
      :title="
        cartSupplier
          ? __('Your order to {0}', [cartSupplier], 'Surtido')
          : __('Your order', null, 'Surtido')
      "
      :subtitle="
        __(
          '{0} products, {1} pieces, {2}',
          [cartSum.lines, cartSum.pieces, money(cartSum.total)],
          'Surtido',
        )
      "
      :fullscreen="cartFull"
      @update:fullscreen="(v) => (cartFull = v)"
    >
      <div class="space-y-4" data-testid="surtido-carrito">
        <ul
          v-if="cartRows.length"
          class="divide-y divide-outline-gray-1"
          :aria-label="__('Products in the order', null, 'Surtido')"
        >
          <li
            v-for="line in cartRows"
            :key="line.line"
            class="flex items-center gap-3 py-3"
          >
            <img
              v-if="line.thumb || line.photo"
              :src="line.thumb || line.photo"
              alt=""
              class="size-12 flex-none rounded-6 bg-surface-gray-1 object-cover"
              loading="lazy"
            />
            <span
              v-else
              class="flex size-12 flex-none items-center justify-center rounded-6 bg-surface-gray-1 text-ink-gray-6"
              aria-hidden="true"
            >
              <span class="lucide-package size-5" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-ink-gray-9">
                {{ line.name }}
              </p>
              <p class="truncate text-sm text-ink-gray-6">
                {{ (line.printed || []).slice(0, 3).join(', ') }}
              </p>
              <p class="num text-sm font-medium text-ink-gray-9">
                {{ money(line.price * line.qty) }}
              </p>
              <p class="num text-xs text-ink-gray-5">
                {{ __('{0} each', [money(line.price)], 'Surtido') }}
              </p>
            </div>
            <div
              class="flex flex-none items-center rounded-full ring-1 ring-outline-gray-3"
              role="group"
              :aria-label="__('Pieces of {0}', [line.name], 'Surtido')"
            >
              <button
                type="button"
                class="press flex size-10 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
                :aria-label="__('One less of {0}', [line.name], 'Surtido')"
                @click="setCart(line.line, line.qty - 1)"
              >
                <span
                  :class="[
                    line.qty > 1 ? 'lucide-minus' : 'lucide-trash-2',
                    'size-4',
                  ]"
                  aria-hidden="true"
                />
              </button>
              <span class="num w-7 text-center font-semibold">{{
                line.qty
              }}</span>
              <button
                type="button"
                class="press flex size-10 items-center justify-center rounded-full text-ink-gray-8 hover:bg-surface-gray-2"
                :aria-label="__('One more of {0}', [line.name], 'Surtido')"
                @click="setCart(line.line, line.qty + 1)"
              >
                <span class="lucide-plus size-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-ink-gray-6">
          {{
            __(
              'The cart is empty: add products from the list.',
              null,
              'Surtido',
            )
          }}
        </p>

        <ul
          v-if="cartShort.length"
          class="space-y-1 text-sm text-ink-amber-7"
          data-testid="surtido-minimos"
        >
          <li v-for="g in cartShort" :key="g.category + g.need">
            {{
              __(
                '{0}: the price is from {1} pieces and the order has {2}. Confirm with the supplier whether it counts per model or per order.',
                [g.category || thisList, g.need, g.pieces],
                'Surtido',
              )
            }}
          </li>
        </ul>

        <div class="border-t border-outline-gray-2 pt-4">
          <p class="text-sm font-medium text-ink-gray-8">
            {{ __('Suggest with my budget', null, 'Surtido') }}
          </p>
          <p class="mt-0.5 text-sm text-ink-gray-6">
            {{
              __(
                'Fills the cart from your sales and stock, with the categories and marks you chose, never passing the budget.',
                null,
                'Surtido',
              )
            }}
          </p>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm text-ink-gray-7">{{
                __('Budget', null, 'Surtido')
              }}</span>
              <span
                class="flex h-12 items-center gap-1 rounded-6 bg-surface-gray-2 px-3 focus-within:ring-2 focus-within:ring-outline-gray-4"
              >
                <span class="num text-lg text-ink-gray-5" aria-hidden="true"
                  >$</span
                >
                <input
                  v-model="cartBudget"
                  type="number"
                  min="1"
                  step="any"
                  inputmode="decimal"
                  class="num w-full border-0 bg-transparent p-0 text-lg font-semibold focus:ring-0"
                  data-testid="surtido-presupuesto"
                />
              </span>
            </label>
            <FormControl
              v-model="ask.focus"
              :label="__('These models first', null, 'Surtido')"
              :placeholder="__('A16 2, A27 1', null, 'Surtido')"
            />
          </div>
          <div
            v-if="cartBudget"
            class="mt-3 h-2 overflow-hidden rounded-full bg-surface-gray-2"
            role="meter"
            :aria-valuenow="cartSum.total"
            aria-valuemin="0"
            :aria-valuemax="cartBudget"
            :aria-label="__('Budget used', null, 'Surtido')"
          >
            <div
              class="h-full rounded-full transition-[width] duration-200"
              :class="
                cartSum.total > cartBudget
                  ? 'bg-surface-red-5'
                  : 'bg-surface-gray-7'
              "
              :style="{
                width: Math.min(100, (100 * cartSum.total) / cartBudget) + '%',
              }"
            />
          </div>
          <p
            v-if="cartBudget && cartSum.total > cartBudget"
            class="mt-1 text-sm text-ink-red-7"
          >
            {{
              __(
                '{0} over the budget',
                [money(cartSum.total - cartBudget)],
                'Surtido',
              )
            }}
          </p>
          <button
            type="button"
            class="press mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3 disabled:opacity-50"
            :disabled="!(Number(cartBudget) > 0) || busy === 'plan'"
            data-testid="surtido-sugerir"
            @click="suggestCart"
          >
            <span
              :class="[
                busy === 'plan'
                  ? 'lucide-loader-circle animate-spin'
                  : 'lucide-sparkles',
                'size-4',
              ]"
              aria-hidden="true"
            />
            {{
              cartRows.length
                ? __('Replace the cart with a suggestion', null, 'Surtido')
                : __('Fill the cart', null, 'Surtido')
            }}
          </button>
          <ul
            v-if="suggestNotes.length"
            class="mt-2 space-y-0.5 text-sm text-ink-gray-6"
          >
            <li v-for="n in suggestNotes" :key="n">{{ n }}</li>
          </ul>
        </div>

        <div
          v-if="boot.owner && !current?.supplier"
          class="border-t border-outline-gray-2 pt-4 sm:max-w-sm"
        >
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
        <p v-if="!boot.owner" class="text-sm text-ink-gray-6">
          {{ __('Only the owner creates the order.', null, 'Surtido') }}
        </p>
      </div>
      <template #actions>
        <Button
          :label="__('Keep shopping', null, 'Surtido')"
          @click="cartOpen = false"
        />
        <button
          v-if="boot.owner"
          type="button"
          :class="['press', BTN.filled]"
          :disabled="!canOrder"
          data-testid="surtido-crear"
          @click="orderCart"
        >
          <span
            :class="[
              busy === 'pedido'
                ? 'lucide-loader-circle animate-spin'
                : 'lucide-check',
              'size-5',
            ]"
            aria-hidden="true"
          />
          {{ __('Create the order', null, 'Surtido') }}
        </button>
      </template>
    </BottomSheet>

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
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FormControl, toast } from 'frappe-ui'
import { AppBar, BottomSheet, EmptyState } from '@/components/ui'
import { isMobile } from '@/composables/breakpoint'
import { BTN } from '@/documentos/tools'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import CatalogProgress from '@/components/compras/CatalogProgress.vue'
import SurtidoTienda from '@/components/compras/SurtidoTienda.vue'
const SurtidoProducto = defineAsyncComponent(
  () => import('@/components/compras/SurtidoProducto.vue'),
)
import { BUSY, progressOf } from '@/utils/catalogProgress'
import {
  assistantOn,
  loadAssistant,
} from '@/components/assistant/assistantDoor'
import { comprasApi, money, problemOf, qty } from '@/composables/useCompras'
import { lineTone, pedidoTone, closeSpecs, readyRows } from '@/utils/surtido'
import { sendEach, uploadCatalog, uploadPictures } from '@/utils/catalogUpload'
import { LIST_ACCEPT, dropFiles } from '@/utils/listaPrecios'
import { DEFAULT_ASK, planArgs as askArgs } from '@/utils/surtidoAsk'
import {
  cartFromPlan,
  cartLines,
  cartMinimums,
  cartTotals,
  saveCart,
  savedCart,
  setPieces,
} from '@/utils/surtidoShop'
import LucideX from '~icons/lucide/x'

const MediaViewer = defineAsyncComponent(
  () => import('@/components/ui/MediaViewer.vue'),
)

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
const plan = ref(null)
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
// the shop: every line of the list, the cart ({line: pieces}) and the shop's filters
const EMPTY_SHOP = Object.freeze({
  query: '',
  category: '',
  marks: [],
  history: '',
  similarTo: null,
  item_group: '',
})
const catalogRows = ref([])
const catalogPictures = ref(0)
const cart = ref({})
const shop = ref({ ...EMPTY_SHOP })
const cartOpen = ref(false)
const cartMounted = ref(false)
const cartFull = ref(false)
const cartBudget = ref('')
const suggestNotes = ref([])
const cartRows = computed(() => cartLines(cart.value, catalogRows.value))
const cartSum = computed(() => cartTotals(cartRows.value))
const thisList = __('This list', null, 'Surtido')
const cartShort = computed(() => cartMinimums(cartRows.value))
const cartSupplier = computed(
  () => current.value?.supplier || planSupplier.value || '',
)
const canOrder = computed(
  () =>
    cartRows.value.length > 0 &&
    Boolean(current.value?.supplier || planSupplier.value) &&
    busy.value !== 'pedido',
)

// the list's pages and the plan's photos open in the kit's viewer
const viewerMounted = ref(false)
const viewer = reactive({
  open: false,
  index: 0,
  items: [],
  title: '',
  caption: '',
})
function openViewer(items, index, title, caption = '') {
  if (!items.length) return
  Object.assign(viewer, { items, index, title, caption, open: true })
  viewerMounted.value = true
}
const pageIndex = (n) => facets.value.pages.findIndex((p) => p.n === n)
function openPages(index) {
  openViewer(
    facets.value.pages.map((p) => ({
      url: p.url,
      thumb: p.thumb,
      kind: 'image',
      key: 'p' + p.n,
      alt: __('Page {0} of the list', [p.n], 'Surtido'),
    })),
    Math.max(0, index),
    currentName.value,
  )
}
// the list by its supplier, or the one its name says, else its name without the extension
const currentName = computed(() => {
  const c = current.value
  if (!c) return ''
  if (!c.supplier && facets.value.supplier_guess)
    return listName({ ...c, supplier: facets.value.supplier_guess })
  return listName(c)
})
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
  if (!c?.supplier) return title
  // a file named after the supplier («perfeccel2-lista-1») says nothing more
  const flat = (t) => t.toLowerCase().replace(/[^a-z0-9]+/gu, '')
  return flat(title).includes(flat(c.supplier))
    ? c.supplier
    : `${c.supplier}, ${title}`
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

// the list's own words for the request: its sections, marks and the shop's groups
async function loadFacets(name) {
  facets.value = {
    sections: [],
    marks: [],
    groups: [],
    pages: [],
    supplier_guess: null,
  }
  if (!name) return
  try {
    const out = await call('facets', { catalog: name })
    if (name === catalog.value)
      facets.value = {
        sections: out?.sections || [],
        marks: out?.marks || [],
        groups: out?.groups || [],
        pages: out?.pages || [],
        supplier_guess: out?.supplier_guess || null,
      }
    // the shop counts its own sales with the group whose products cost what the list's do
    if (
      name === catalog.value &&
      out?.suggested_group &&
      !shop.value.item_group
    )
      shop.value = { ...shop.value, item_group: out.suggested_group }
    // a list that came without its supplier: the one its name says, kept unless changed
    if (name === catalog.value && out?.supplier_guess && !planSupplier.value)
      planSupplier.value = out.supplier_guess
  } catch {
    // the request still works without its chips
  }
}
watch(
  () => [catalog.value, current.value?.lines || 0],
  ([name, lines], [before, linesBefore] = []) => {
    if (name !== before) {
      cart.value = savedCart(name)
      shop.value = { ...EMPTY_SHOP }
      suggestNotes.value = []
      catalogRows.value = []
      planSupplier.value = ''
    }
    if (lines && (name !== before || !linesBefore)) {
      loadFacets(name)
      loadCatalog(name)
    }
  },
)
// the group the shop counts its own sales with changes what each product says
watch(
  () => shop.value.item_group,
  (group, before) => {
    if (group !== before && current.value?.lines) loadCatalog(catalog.value)
  },
)

// ── the shop: the list's lines, the cart, the suggestion, the order ─────────
let catalogSeq = 0
async function loadCatalog(name) {
  if (!name) return
  const seq = ++catalogSeq
  const out = await run('catalogo', () =>
    call('catalog_lines', {
      catalog: name,
      item_group: shop.value.item_group || '',
    }),
  )
  if (!out || seq !== catalogSeq || name !== catalog.value) return
  catalogRows.value = out.lines || []
  catalogPictures.value = Number(out.pictures) || 0
}

// one product with everything the shop knows of it
const productOpen = ref(false)
const productMounted = ref(false)
const productKey = ref('')
const productRow = computed(
  () => catalogRows.value.find((r) => r.line === productKey.value) || null,
)
function openProduct(row) {
  productKey.value = row.line
  productMounted.value = true
  productOpen.value = true
}
function similarFrom(row) {
  productOpen.value = false
  shop.value = { ...shop.value, similarTo: row }
}
// a line linked to the shop's product (or untied) reads as such at once
function onLinked(line, item, itemName) {
  catalogRows.value = catalogRows.value.map((r) =>
    r.line === line
      ? {
          ...r,
          item: item || '',
          item_name: item ? itemName || r.suggest?.item_name || '' : '',
          suggest: null,
        }
      : r,
  )
}

function setCart(line, qty) {
  cart.value = setPieces(cart.value, line, qty)
  saveCart(catalog.value, cart.value)
}

function openCart() {
  cartMounted.value = true
  cartOpen.value = true
}

function openRowPhoto(row) {
  const shown = catalogRows.value.filter((r) => r.photo)
  openViewer(
    shown.map((r) => ({
      url: r.photo,
      thumb: r.thumb,
      kind: 'image',
      key: r.line,
      alt: r.name,
    })),
    Math.max(
      0,
      shown.findIndex((r) => r.line === row.line),
    ),
    currentName.value,
  )
}

// «Sugerir»: the plan within the budget, with the shop's chosen category and marks,
// fills the cart; the owner shops on from there
async function suggestCart() {
  const sections = new Set(facets.value.sections.map((x) => x.label))
  const args = askArgs(
    {
      ...ask,
      budget: cartBudget.value,
      marks: shop.value.marks || [],
      section: sections.has(shop.value.category) ? shop.value.category : '',
      item_group: shop.value.item_group || '',
    },
    catalog.value,
  )
  const out = await run('plan', () => call('plan', args))
  if (!out) return
  setCartAll(cartFromPlan(out))
  suggestNotes.value = [
    ...(out.focus_missing?.length
      ? [
          __(
            'This list does not carry: {0}',
            [out.focus_missing.join(', ')],
            'Surtido',
          ),
        ]
      : []),
    ...(out.minimums || []),
  ]
  toast.success(
    __(
      '{0} products in the cart, {1}',
      [out.lines.length, money(out.total)],
      'Surtido',
    ),
  )
}
function setCartAll(next) {
  cart.value = next
  saveCart(catalog.value, next)
}

async function orderCart() {
  const lines = Object.entries(cart.value).map(([line, qty]) => ({ line, qty }))
  const out = await run('pedido', () =>
    call('cart_order', {
      catalog: catalog.value,
      lines: JSON.stringify(lines),
      supplier: current.value?.supplier ? '' : planSupplier.value,
      budget: Number(cartBudget.value) > 0 ? Number(cartBudget.value) : '',
    }),
  )
  if (!out) return
  setCartAll({})
  cartOpen.value = false
  toast.success(
    __('Draft order {0} for {1}', [out.pedido, out.supplier], 'Surtido'),
  )
  showPedido(out)
  loadBoot()
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
