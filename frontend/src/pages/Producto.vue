<template>
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-surface-gray-1"
  >
    <div
      class="mx-auto w-full max-w-7xl px-4 pb-28 pt-3 sm:px-6 sm:pb-10 lg:px-8"
    >
      <nav class="mb-2 flex flex-wrap items-center gap-2">
        <button
          class="flex min-h-11 items-center gap-1 rounded-md pr-2 text-sm text-ink-gray-7 hover:text-ink-gray-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          @click="goBack"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ backLabel }}
        </button>
      </nav>

      <section
        v-if="guard"
        role="alert"
        class="mx-auto max-w-xl space-y-4 rounded-xl border border-outline-gray-2 bg-surface-white p-6"
      >
        <h1 class="text-xl font-semibold">{{ guard.title }}</h1>
        <p class="text-base text-ink-gray-7">{{ guard.detail }}</p>
        <div class="flex flex-wrap gap-2">
          <Button :label="__('Retry', null, 'Productos')" @click="load" />
          <Button :label="__('Back to Productos')" @click="goBack" />
        </div>
      </section>

      <div
        v-else-if="loading && !data"
        role="status"
        :aria-label="__('Loading product…')"
        class="space-y-4"
      >
        <div
          class="flex gap-5 rounded-xl border border-outline-gray-2 bg-surface-white p-5"
        >
          <div class="h-32 w-32 animate-pulse rounded-xl bg-surface-gray-2" />
          <div class="flex-1 space-y-3 pt-2">
            <div class="h-3 w-40 animate-pulse rounded bg-surface-gray-2" />
            <div class="h-6 w-72 animate-pulse rounded bg-surface-gray-2" />
            <div class="h-3 w-56 animate-pulse rounded bg-surface-gray-2" />
          </div>
        </div>
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div class="h-48 animate-pulse rounded-xl bg-surface-gray-2" />
          <div class="h-48 animate-pulse rounded-xl bg-surface-gray-2" />
        </div>
      </div>

      <template v-else-if="data">
        <!-- Hero: photo, where it lives, what it is, what to do next. -->
        <header
          class="grid gap-4 rounded-xl border border-outline-gray-2 bg-surface-white p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-5 sm:p-5 xl:grid-cols-[auto_minmax(0,1fr)_auto]"
        >
          <div class="flex flex-col items-center gap-2 sm:items-start">
            <img
              v-if="product.image && !photoBroken"
              :src="product.image"
              :alt="product.item_name || product.name"
              class="h-36 w-36 rounded-xl object-cover ring-1 ring-outline-gray-2 sm:h-40 sm:w-40"
              @error="photoBroken = true"
            />
            <div
              v-else
              class="flex h-36 w-36 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-outline-gray-3 bg-surface-gray-1 text-center sm:h-40 sm:w-40"
            >
              <FeatherIcon
                name="image"
                class="h-7 w-7 text-ink-gray-4"
                aria-hidden="true"
              />
              <span class="px-2 text-xs text-ink-gray-6">{{
                __('No photo yet')
              }}</span>
            </div>
            <FileUploader
              v-if="data.can_edit"
              file-types="image/*"
              :upload-args="{
                doctype: 'Item',
                docname: product.name,
                private: false,
              }"
              @success="photoUploaded"
              @failure="photoFailed"
            >
              <template #default="{ openFileSelector, uploading, progress }">
                <Button
                  class="min-h-11 sm:min-h-8"
                  :loading="uploading || photoSaving"
                  :label="
                    uploading
                      ? __('Uploading {0}%', [progress])
                      : product.image
                        ? __('Change photo')
                        : __('Add photo')
                  "
                  @click="openFileSelector"
                >
                  <template #prefix>
                    <FeatherIcon
                      name="camera"
                      class="h-4 w-4"
                      aria-hidden="true"
                    />
                  </template>
                </Button>
              </template>
            </FileUploader>
          </div>

          <div class="min-w-0">
            <nav
              v-if="groupPath.length"
              :aria-label="__('Product group')"
              class="flex flex-wrap items-center gap-x-1 text-xs font-medium uppercase tracking-wide text-ink-gray-5"
            >
              <template v-for="(group, index) in groupPath" :key="group">
                <span v-if="index" aria-hidden="true">›</span>
                <RouterLink
                  :to="groupRoute(group)"
                  class="rounded hover:text-ink-gray-8 hover:underline"
                  :title="__('See the products of {0}', [group])"
                  >{{ group }}</RouterLink
                >
              </template>
            </nav>
            <h1
              class="mt-1 break-words text-2xl font-semibold leading-tight text-ink-gray-9"
            >
              {{ product.item_name || product.name }}
            </h1>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                v-if="kind"
                class="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
                :class="
                  kind.kind === 'service'
                    ? 'bg-surface-gray-2 text-ink-gray-8'
                    : 'bg-surface-blue-2 text-ink-blue-8'
                "
              >
                <FeatherIcon
                  :name="kind.kind === 'service' ? 'briefcase' : 'package'"
                  class="h-3.5 w-3.5"
                  aria-hidden="true"
                />
                {{ kind.text }}
              </span>
              <Badge
                v-if="product.disabled"
                theme="red"
                :label="__('Disabled', null, 'Productos')"
              />
              <Badge
                v-if="!product.is_sales_item"
                theme="gray"
                :label="__('Not for sale')"
              />
            </div>
            <p
              class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-gray-6"
            >
              <span class="font-mono text-ink-gray-8">{{ product.name }}</span>
              <span>{{ __('Unit: {0}', [product.stock_uom]) }}</span>
              <span v-if="product.brand">{{
                __('Brand: {0}', [product.brand])
              }}</span>
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <template v-for="entry in heroActions" :key="entry.key">
                <a
                  v-if="entry.href"
                  :href="entry.href"
                  class="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-surface-gray-2 px-3 text-base text-ink-gray-8 hover:bg-surface-gray-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:min-h-8"
                  :title="entry.title || undefined"
                >
                  <FeatherIcon
                    :name="entry.icon"
                    class="h-4 w-4"
                    aria-hidden="true"
                  />{{ entry.label }}</a
                >
                <Button
                  v-else
                  :variant="entry.primary ? 'solid' : 'subtle'"
                  :label="entry.label"
                  :title="entry.reason || undefined"
                  class="min-h-11 sm:min-h-8"
                  @click="run(entry)"
                >
                  <template #prefix>
                    <FeatherIcon
                      :name="entry.icon"
                      class="h-4 w-4"
                      aria-hidden="true"
                    />
                  </template>
                </Button>
              </template>
            </div>
          </div>

          <!-- What a worker opens the product for: price and stock. -->
          <dl
            class="grid grid-cols-2 gap-3 sm:col-span-2 xl:col-span-1 xl:w-64 xl:grid-cols-1"
          >
            <a
              href="#precios"
              class="rounded-lg bg-surface-gray-1 px-4 py-3 ring-1 ring-outline-gray-1 hover:bg-surface-gray-2"
            >
              <dt class="truncate text-xs text-ink-gray-6">
                {{ defaultPrice?.price_list || __('Price', null, 'Productos') }}
              </dt>
              <dd
                class="mt-0.5 text-2xl font-semibold tabular-nums text-ink-gray-9"
                :class="hasRate(defaultPrice) ? '' : 'text-ink-gray-5'"
              >
                {{
                  hasRate(defaultPrice)
                    ? money(defaultPrice.rate, defaultPrice.currency)
                    : __('No price', null, 'Productos')
                }}
              </dd>
              <dd v-if="hasRate(defaultPrice)" class="text-xs text-ink-gray-6">
                {{ __('per {0}', [defaultPrice.uom || product.stock_uom]) }}
                <template v-if="defaultAge.text">
                  · {{ __('updated {0}', [defaultAge.text]) }}</template
                >
              </dd>
            </a>
            <a
              href="#existencias"
              class="rounded-lg bg-surface-gray-1 px-4 py-3 ring-1 ring-outline-gray-1 hover:bg-surface-gray-2"
            >
              <dt class="text-xs text-ink-gray-6">
                {{ __('On hand', null, 'Productos') }}
              </dt>
              <template v-if="data.stock.service">
                <dd class="mt-0.5 text-base font-semibold text-ink-gray-8">
                  {{ __('Service') }}
                </dd>
                <dd class="text-xs text-ink-gray-6">
                  {{ __('Carries no stock') }}
                </dd>
              </template>
              <template v-else-if="data.stock.readable">
                <dd
                  class="mt-0.5 text-2xl font-semibold tabular-nums"
                  :class="
                    data.stock.total > 0 ? 'text-ink-gray-9' : 'text-ink-red-7'
                  "
                >
                  {{ qty(data.stock.total) }}
                  <span class="text-sm font-medium text-ink-gray-6">{{
                    product.stock_uom
                  }}</span>
                </dd>
                <dd class="text-xs text-ink-gray-6">
                  {{
                    data.stock.total > 0
                      ? __('in {0} store(s)', [storesWithStock])
                      : __('Sold out in your stores')
                  }}
                </dd>
              </template>
              <dd v-else class="mt-0.5 text-sm text-ink-gray-6">—</dd>
            </a>
          </dl>
        </header>

        <div
          v-if="unit.mismatch"
          role="status"
          class="mt-4 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-7"
        >
          {{
            __(
              'This link is for the price per {0}. Here prices change per {1} only; the price per {0} is set by whoever maintains prices.',
              [unit.requested, unit.stock],
            )
          }}
          <span class="mt-2 flex flex-wrap gap-2">
            <Button
              v-if="action('price')?.enabled"
              :label="__('Change the price per {0}', [unit.stock])"
              @click="openPrice"
            />
            <Button
              :label="__('Ask for the price per {0}', [unit.requested])"
              @click="askUnitPrice"
            />
          </span>
        </div>
        <div
          v-if="notice"
          role="status"
          class="mt-4 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8"
        >
          {{ notice.text }}
          <RouterLink v-if="notice.to" :to="notice.to" class="ml-1 underline">{{
            notice.link
          }}</RouterLink>
          <Button
            v-if="listBack"
            class="ml-2"
            :label="__('Back to the list')"
            @click="router.push(listBack)"
          />
        </div>
        <div
          v-if="problem"
          role="alert"
          class="mt-4 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <Button
            class="ml-2"
            :label="__('Retry', null, 'Productos')"
            @click="load"
          />
        </div>

        <div
          class="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-5"
        >
          <!-- ── main column ─────────────────────────────────────────── -->
          <div class="min-w-0 space-y-4 lg:space-y-5">
            <section
              id="precios"
              class="scroll-mt-4 rounded-xl border border-outline-gray-2 bg-surface-white"
            >
              <header
                class="flex flex-wrap items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
              >
                <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
                  {{ __('Price lists') }}
                  <span
                    v-if="data.prices.rows.length"
                    class="ml-1 text-sm font-normal text-ink-gray-5"
                    >{{ data.prices.rows.length }}</span
                  >
                </h2>
                <Button
                  v-if="action('price')"
                  class="min-h-11 sm:min-h-7"
                  variant="ghost"
                  :label="action('price').label"
                  @click="run(action('price'))"
                >
                  <template #prefix>
                    <span class="lucide-pencil h-4 w-4" aria-hidden="true" />
                  </template>
                </Button>
              </header>
              <p
                v-if="data.prices.setup"
                class="mx-4 mt-3 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-7"
              >
                {{ data.prices.setup.reason }}
              </p>
              <p
                v-if="!data.prices.readable"
                class="px-4 py-4 text-sm text-ink-gray-6"
              >
                {{ __('You cannot see prices. Ask your manager for access.') }}
              </p>
              <p
                v-else-if="data.prices.reason"
                class="px-4 py-4 text-sm text-ink-gray-6"
              >
                {{ plain(data.prices.reason) }}
              </p>
              <div
                v-else-if="!data.prices.rows.length"
                class="flex flex-wrap items-center gap-3 px-4 py-4 text-sm text-ink-gray-6"
              >
                <FeatherIcon
                  name="tag"
                  class="h-5 w-5 text-ink-gray-4"
                  aria-hidden="true"
                />
                <span class="flex-1">{{
                  __('No price list sells this product yet.')
                }}</span>
              </div>
              <div v-else class="overflow-x-auto">
                <table class="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr
                      class="text-left text-xs font-medium uppercase tracking-wide text-ink-gray-5"
                    >
                      <th class="px-4 py-2 font-medium">
                        {{ __('List', null, 'Productos') }}
                      </th>
                      <th class="px-2 py-2 text-right font-medium">
                        {{ __('Price', null, 'Productos') }}
                      </th>
                      <th class="px-2 py-2 font-medium">{{ __('Valid') }}</th>
                      <th class="px-2 py-2 font-medium">{{ __('Updated') }}</th>
                      <th class="px-4 py-2 font-medium">
                        {{ __('Status', null, 'Productos') }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-outline-gray-1">
                    <tr
                      v-for="row in data.prices.rows"
                      :key="row.price_list"
                      class="align-top"
                    >
                      <td class="px-4 py-2.5">
                        <span class="block font-medium text-ink-gray-9">{{
                          row.price_list
                        }}</span>
                        <span class="block text-xs text-ink-gray-5"
                          >{{ row.currency }} ·
                          {{ row.uom || row.stock_uom }}</span
                        >
                        <span
                          v-if="row.blocked_reason && row.rate !== null"
                          class="mt-0.5 block text-xs text-ink-gray-6"
                          >{{ plain(row.blocked_reason) }}</span
                        >
                        <span
                          v-for="next in row.scheduled || []"
                          :key="next.name"
                          class="mt-0.5 block text-xs text-ink-blue-7"
                          >{{
                            __('From {0}: {1}', [
                              next.valid_from,
                              money(next.rate, row.currency),
                            ])
                          }}</span
                        >
                      </td>
                      <td
                        class="whitespace-nowrap px-2 py-2.5 text-right text-base font-semibold tabular-nums"
                        :class="
                          hasRate(row) ? 'text-ink-gray-9' : 'text-ink-gray-5'
                        "
                      >
                        {{
                          hasRate(row)
                            ? money(row.rate, row.currency)
                            : __('No price', null, 'Productos')
                        }}
                      </td>
                      <td class="whitespace-nowrap px-2 py-2.5 text-ink-gray-7">
                        {{ validity(row) }}
                      </td>
                      <td class="whitespace-nowrap px-2 py-2.5">
                        <span
                          v-if="age(row).text"
                          :class="AGE_CLASS[age(row).tone]"
                          :title="row.updated"
                          >{{ age(row).text }}</span
                        >
                        <span v-else class="text-ink-gray-4">—</span>
                      </td>
                      <td class="px-4 py-2.5">
                        <Badge
                          :theme="priceStatus(row).theme"
                          :label="priceStatus(row).text"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section
              id="existencias"
              class="scroll-mt-4 rounded-xl border border-outline-gray-2 bg-surface-white"
            >
              <header
                class="flex flex-wrap items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
              >
                <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
                  {{ __('Stock by store') }}
                </h2>
                <span
                  v-if="data.stock.readable && !data.stock.service"
                  class="text-sm tabular-nums text-ink-gray-6"
                  >{{
                    __('Total {0} {1}', [
                      qty(data.stock.total),
                      product.stock_uom,
                    ])
                  }}</span
                >
              </header>
              <div
                v-if="data.stock.service"
                class="m-4 flex items-start gap-3 rounded-lg border border-outline-gray-2 bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
              >
                <FeatherIcon
                  name="briefcase"
                  class="mt-0.5 h-5 w-5 shrink-0 text-ink-gray-5"
                  aria-hidden="true"
                />
                <span>{{
                  __(
                    'Service item: it carries no stock. It is sold without counting or filing it.',
                  )
                }}</span>
              </div>
              <p
                v-else-if="!data.stock.readable"
                class="px-4 py-4 text-sm text-ink-gray-6"
              >
                {{ __('You cannot see stock. Ask your manager for access.') }}
              </p>
              <div
                v-else-if="!data.stock.rows.length"
                class="m-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-outline-gray-3 p-3 text-sm text-ink-gray-7"
              >
                <span
                  class="lucide-package-open h-5 w-5 shrink-0 text-ink-gray-5"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">{{
                  __(
                    'None in your stores yet. It appears here when it is received, counted or moved in.',
                  )
                }}</span>
                <Button
                  v-if="action('purchase')?.enabled"
                  class="min-h-11 sm:min-h-7"
                  :label="__('Order it')"
                  @click="run(action('purchase'))"
                />
              </div>
              <ul v-else class="divide-y divide-outline-gray-1">
                <li
                  v-for="row in data.stock.rows"
                  :key="row.warehouse"
                  class="flex flex-wrap items-start gap-3 px-4 py-3"
                >
                  <span
                    class="lucide-store mt-0.5 h-4 w-4 shrink-0 text-ink-gray-5"
                    aria-hidden="true"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block font-medium text-ink-gray-9">{{
                      row.label
                    }}</span>
                    <span class="block text-sm text-ink-gray-6">
                      {{
                        [
                          __('Reserved {0}', [qty(row.reserved_qty)]),
                          __('Projected {0}', [qty(row.projected_qty)]),
                          row.reorder_level !== null &&
                            __('Minimum {0}', [qty(row.reorder_level)]),
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      }}
                    </span>
                    <span
                      v-if="row.cajones.length"
                      class="mt-1 flex flex-wrap gap-1"
                    >
                      <span
                        v-for="cajon in row.cajones"
                        :key="cajon.ubicacion"
                        class="inline-flex h-6 items-center gap-1 rounded-md bg-surface-gray-2 px-2 text-xs text-ink-gray-8"
                        ><span
                          class="lucide-inbox h-3.5 w-3.5"
                          aria-hidden="true"
                        />{{ cajon.label || cajon.ubicacion }}</span
                      >
                    </span>
                    <span
                      v-else-if="data.inventory?.scanner"
                      class="block text-sm text-ink-amber-7"
                      >{{ __('Not filed in a bin here') }}</span
                    >
                    <span
                      class="block text-sm"
                      :class="
                        row.last_counted
                          ? 'text-ink-gray-6'
                          : 'text-ink-amber-7'
                      "
                      >{{
                        lastCountedLabel(row.last_counted, boot?.today)
                      }}</span
                    >
                    <span
                      v-for="pending in row.counts_pending"
                      :key="pending.task"
                      class="block text-sm text-ink-blue-7"
                      >{{
                        pending.assigned_date
                          ? __('Count asked of {0} · {1}', [
                              pending.assigned_to,
                              pending.assigned_date,
                            ])
                          : __('Count asked of {0}', [pending.assigned_to])
                      }}</span
                    >
                    <span
                      v-if="data.inventory?.scanner && row.warehouse"
                      class="mt-2 flex flex-wrap gap-2"
                    >
                      <template v-if="data.inventory.scanner_user">
                        <a
                          :href="countNowUrl(row)"
                          class="inline-flex min-h-11 items-center rounded-md bg-surface-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-3 sm:min-h-7"
                          >{{ __('Count now') }}</a
                        >
                        <a
                          v-if="row.cajones.length"
                          :href="moveUrl(row)"
                          class="inline-flex min-h-11 items-center rounded-md bg-surface-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-3 sm:min-h-7"
                          >{{ __('Move to another bin') }}</a
                        >
                        <a
                          v-else
                          :href="assignUrl(row)"
                          class="inline-flex min-h-11 items-center rounded-md bg-surface-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-3 sm:min-h-7"
                          >{{ __('Assign bin') }}</a
                        >
                      </template>
                      <Button
                        class="min-h-11 sm:min-h-7"
                        :label="
                          row.can_request_count
                            ? __('Ask for a count')
                            : __('Ask the manager for a count')
                        "
                        @click="askCount(row)"
                      />
                    </span>
                    <span
                      v-if="row.negative"
                      role="note"
                      class="mt-2 block space-y-1 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-8"
                    >
                      <span class="block font-medium">{{
                        __(
                          'The system says {0} here: more left than was recorded coming in.',
                          [qty(row.actual_qty)],
                        )
                      }}</span>
                      <span class="block">{{
                        __(
                          'Usually goods arrived without their receipt, or were sold from another store. The latest outgoing movements:',
                        )
                      }}</span>
                      <span
                        v-for="out in row.explain?.outs || []"
                        :key="`${out.voucher_no}:${out.posting_time}`"
                        class="block text-ink-gray-8"
                        >{{
                          __('{0} {1} · {2} · {3} → {4}', [
                            out.voucher_type,
                            out.voucher_no,
                            out.posting_date,
                            qty(out.actual_qty),
                            qty(out.qty_after_transaction),
                          ])
                        }}</span
                      >
                      <span v-if="row.explain?.fix === 'receive'" class="block">
                        {{
                          __(
                            '{0} are on order for this store: receiving them fixes it.',
                            [qty(row.explain.incoming)],
                          )
                        }}
                        <RouterLink
                          :to="{
                            name: 'Compras',
                            query: { segment: 'por-recibir' },
                          }"
                          class="underline"
                          >{{ __('Purchases to receive') }}</RouterLink
                        >
                      </span>
                      <span v-else class="block">{{
                        __(
                          'Fastest fix: count it. The difference is reviewed and adjusted with a stock reconciliation.',
                        )
                      }}</span>
                      <span v-if="data.inventory?.stock_adjust" class="block">
                        {{
                          __(
                            'If it is already counted, you may adjust it in Desk:',
                          )
                        }}
                        <a
                          :href="deskReconciliationUrl()"
                          target="_blank"
                          rel="noopener"
                          class="underline"
                          >{{ __('New stock reconciliation') }}</a
                        >
                      </span>
                      <span v-else class="block text-ink-gray-7">{{
                        __(
                          'Setting the stock directly needs the Stock Reconciliation permission (stock manager); counting it does not.',
                        )
                      }}</span>
                    </span>
                  </span>
                  <span class="flex flex-col items-end gap-1">
                    <span
                      class="text-right text-lg font-semibold tabular-nums"
                      :class="
                        row.actual_qty > 0
                          ? 'text-ink-gray-9'
                          : 'text-ink-red-7'
                      "
                    >
                      {{ qty(row.actual_qty) }}
                      <span class="text-xs font-normal text-ink-gray-6">{{
                        product.stock_uom
                      }}</span>
                    </span>
                    <Badge
                      v-if="row.state === 'faltan'"
                      theme="red"
                      :label="__('Out of stock', null, 'Productos')"
                    />
                    <Badge
                      v-else-if="row.state === 'bajo'"
                      theme="orange"
                      :label="__('Below minimum', null, 'Productos')"
                    />
                  </span>
                </li>
              </ul>
              <p
                v-if="data.stock.hidden"
                class="border-t border-outline-gray-1 px-4 py-2 text-sm text-ink-gray-6"
              >
                {{
                  __(
                    '{0} more store(s) have this product but are outside your access.',
                    [data.stock.hidden],
                  )
                }}
              </p>
              <p
                v-if="
                  !data.stock.service &&
                  data.inventory?.scanner &&
                  !data.inventory.scanner_user
                "
                class="border-t border-outline-gray-1 px-4 py-2 text-sm text-ink-gray-6"
              >
                {{
                  __(
                    'Counting, filing and moving happen in Escáner, which needs the scanner user role. Ask your manager for it.',
                  )
                }}
                <Button
                  class="ml-1"
                  :label="__('Copy access request')"
                  @click="copyScannerRequest"
                />
              </p>
            </section>

            <section
              id="movimientos"
              class="scroll-mt-4 rounded-xl border border-outline-gray-2 bg-surface-white"
            >
              <header
                class="flex items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
              >
                <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
                  {{ __('Recent stock movements') }}
                </h2>
              </header>
              <p
                v-if="!data.ledger.rows.length"
                class="flex items-start gap-3 px-4 py-4 text-sm text-ink-gray-6"
              >
                <FeatherIcon
                  name="repeat"
                  class="mt-0.5 h-4 w-4 shrink-0 text-ink-gray-4"
                  aria-hidden="true"
                />
                {{
                  !data.ledger.readable
                    ? __('You cannot see stock movements.')
                    : data.stock.service
                      ? __('A service has no stock movements.')
                      : __(
                          'No stock movements yet: sales, purchases, transfers and adjustments appear here.',
                        )
                }}
              </p>
              <div v-else class="overflow-x-auto">
                <table class="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr
                      class="text-left text-xs font-medium uppercase tracking-wide text-ink-gray-5"
                    >
                      <th class="px-4 py-2 font-medium">{{ __('Date') }}</th>
                      <th class="px-2 py-2 font-medium">
                        {{ __('Movement') }}
                      </th>
                      <th class="px-2 py-2 font-medium">
                        {{ __('Store', null, 'Productos') }}
                      </th>
                      <th class="px-2 py-2 text-right font-medium">
                        {{ __('Qty') }}
                      </th>
                      <th class="px-4 py-2 text-right font-medium">
                        {{ __('Balance') }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-outline-gray-1">
                    <tr v-for="(row, index) in data.ledger.rows" :key="index">
                      <td class="whitespace-nowrap px-4 py-2 text-ink-gray-7">
                        {{ row.posting_date }}
                      </td>
                      <td class="px-2 py-2">
                        <span class="block text-ink-gray-9">{{
                          __(row.voucher_type)
                        }}</span>
                        <span class="block font-mono text-xs text-ink-gray-5">{{
                          row.voucher_no
                        }}</span>
                      </td>
                      <td
                        class="max-w-[12rem] truncate px-2 py-2 text-ink-gray-7"
                      >
                        {{ storeLabel(row.warehouse) }}
                      </td>
                      <td
                        class="whitespace-nowrap px-2 py-2 text-right font-medium tabular-nums"
                        :class="
                          row.actual_qty < 0
                            ? 'text-ink-red-7'
                            : 'text-ink-green-7'
                        "
                      >
                        {{ row.actual_qty > 0 ? '+' : ''
                        }}{{ qty(row.actual_qty) }}
                      </td>
                      <td
                        class="whitespace-nowrap px-4 py-2 text-right tabular-nums text-ink-gray-7"
                      >
                        {{ qty(row.qty_after_transaction) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section
              id="historial"
              class="scroll-mt-4 rounded-xl border border-outline-gray-2 bg-surface-white"
            >
              <header
                class="flex items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
              >
                <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
                  {{ __('Price changes') }}
                </h2>
              </header>
              <p
                v-if="!history.readable"
                class="px-4 py-4 text-sm text-ink-gray-6"
              >
                {{ __('Price changes are seen by whoever manages prices.') }}
              </p>
              <p
                v-else-if="!history.rows.length"
                class="flex items-start gap-3 px-4 py-4 text-sm text-ink-gray-6"
              >
                <span
                  class="lucide-history mt-0.5 h-4 w-4 shrink-0 text-ink-gray-4"
                  aria-hidden="true"
                />
                {{
                  __(
                    'No price changes recorded. When someone changes a price, it appears here with who and when.',
                  )
                }}
              </p>
              <ul v-else class="divide-y divide-outline-gray-1">
                <li
                  v-for="(row, index) in shownHistory"
                  :key="index"
                  class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block font-medium text-ink-gray-9"
                      >{{ row.price_list }}
                      <Badge
                        v-if="row.buying"
                        class="ml-1"
                        theme="gray"
                        :label="__('Cost')"
                      />
                      <Badge
                        v-if="row.first_price"
                        class="ml-1"
                        theme="blue"
                        :label="__('First price')"
                      />
                    </span>
                    <span class="block text-xs text-ink-gray-6"
                      >{{ row.by }} ·
                      <span :title="row.at">{{
                        relativeAge(row.at, boot?.today).text || row.at
                      }}</span>
                      · {{ String(row.at).slice(0, 16) }}</span
                    >
                  </span>
                  <span class="flex items-baseline gap-2 tabular-nums">
                    <span
                      v-if="row.old_rate !== null && row.old_rate !== undefined"
                      class="text-xs text-ink-gray-5 line-through"
                      >{{ money(row.old_rate, row.currency) }}</span
                    >
                    <span
                      v-if="row.new_rate !== null && row.new_rate !== undefined"
                      class="font-semibold text-ink-gray-9"
                      >{{ money(row.new_rate, row.currency) }}</span
                    >
                    <span v-else class="text-ink-red-7">{{
                      __('Removed')
                    }}</span>
                    <span
                      v-if="change(row)"
                      class="text-xs"
                      :class="
                        change(row) > 0 ? 'text-ink-green-7' : 'text-ink-red-7'
                      "
                      >{{ change(row) > 0 ? '+' : '' }}{{ change(row) }}%</span
                    >
                  </span>
                </li>
              </ul>
              <button
                v-if="history.rows.length > 6"
                type="button"
                class="min-h-11 w-full border-t border-outline-gray-1 px-4 py-2 text-left text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-1 sm:min-h-9"
                @click="historyAll = !historyAll"
              >
                {{
                  historyAll
                    ? __('See fewer')
                    : __('See all {0} changes', [history.rows.length])
                }}
              </button>
            </section>
          </div>

          <!-- ── side panel ─────────────────────────────────────────── -->
          <aside class="min-w-0 space-y-4 lg:space-y-5">
            <section
              v-if="data.cost"
              class="rounded-xl border border-outline-gray-2 bg-surface-white"
              :aria-label="__('Cost and margin')"
            >
              <header
                class="flex items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
              >
                <span
                  class="lucide-lock h-4 w-4 text-ink-gray-5"
                  aria-hidden="true"
                />
                <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
                  {{ __('Cost and margin') }}
                </h2>
                <span class="text-xs text-ink-gray-5">{{
                  __('managers only')
                }}</span>
              </header>
              <dl class="grid grid-cols-2 gap-px bg-surface-gray-2">
                <div
                  v-for="figure in costFigures"
                  :key="figure.label"
                  class="bg-surface-white px-4 py-3"
                >
                  <dt class="text-xs text-ink-gray-6">{{ figure.label }}</dt>
                  <dd
                    class="mt-0.5 text-lg font-semibold tabular-nums"
                    :class="figure.tone || 'text-ink-gray-9'"
                  >
                    {{ figure.value }}
                  </dd>
                </div>
              </dl>
              <p class="px-4 py-2 text-xs text-ink-gray-6">{{ costBasis }}</p>
            </section>

            <section
              class="rounded-xl border border-outline-gray-2 bg-surface-white"
            >
              <header
                class="flex items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
              >
                <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
                  {{ __('Description', null, 'Productos') }}
                </h2>
                <Button
                  v-if="action('edit')"
                  variant="ghost"
                  class="min-h-11 sm:min-h-7"
                  :label="
                    action('edit').enabled ? __('Edit') : action('edit').label
                  "
                  @click="run(action('edit'))"
                />
              </header>
              <p
                v-if="product.description"
                class="whitespace-pre-line break-words px-4 py-3 text-sm leading-relaxed text-ink-gray-8"
              >
                {{ product.description }}
              </p>
              <p v-else class="px-4 py-3 text-sm text-ink-gray-6">
                {{
                  action('edit')?.enabled
                    ? __(
                        'No description yet. Add what the customer asks about: model, compatibility, what it includes.',
                      )
                    : __('No description yet.')
                }}
              </p>
            </section>

            <section
              class="rounded-xl border border-outline-gray-2 bg-surface-white"
            >
              <header
                class="flex items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
              >
                <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
                  {{ __('Barcodes') }}
                  <span
                    v-if="product.barcodes?.length"
                    class="ml-1 text-sm font-normal text-ink-gray-5"
                    >{{ product.barcodes.length }}</span
                  >
                </h2>
                <Button
                  v-if="action('edit')?.enabled"
                  variant="ghost"
                  class="min-h-11 sm:min-h-7"
                  :label="product.barcodes?.length ? __('Edit') : __('Add')"
                  @click="run(action('edit'))"
                />
              </header>
              <ul
                v-if="product.barcodes?.length"
                class="divide-y divide-outline-gray-1"
              >
                <li
                  v-for="code in product.barcodes"
                  :key="code.barcode"
                  class="flex items-center gap-2 px-4 py-2 text-sm"
                >
                  <FeatherIcon
                    name="hash"
                    class="h-4 w-4 text-ink-gray-5"
                    aria-hidden="true"
                  />
                  <span
                    class="min-w-0 flex-1 truncate font-mono text-ink-gray-9"
                    >{{ code.barcode }}</span
                  >
                  <span
                    v-if="code.barcode_type"
                    class="text-xs text-ink-gray-5"
                    >{{ code.barcode_type }}</span
                  >
                </li>
              </ul>
              <p v-else class="px-4 py-3 text-sm text-ink-gray-6">
                {{
                  action('edit')?.enabled
                    ? __(
                        'No barcodes yet. Add one so the scanner and the POS find it.',
                      )
                    : __('No barcodes yet.')
                }}
              </p>
            </section>

            <section
              class="rounded-xl border border-outline-gray-2 bg-surface-white"
            >
              <header class="border-b border-outline-gray-1 px-4 py-3">
                <h2 class="text-base font-semibold text-ink-gray-9">
                  {{ __('Details') }}
                </h2>
              </header>
              <dl class="divide-y divide-outline-gray-1 text-sm">
                <div
                  v-for="fact in facts"
                  :key="fact.label"
                  class="flex gap-3 px-4 py-2"
                >
                  <dt class="w-28 shrink-0 text-ink-gray-6">
                    {{ fact.label }}
                  </dt>
                  <dd class="min-w-0 flex-1 break-words text-ink-gray-9">
                    {{ fact.value }}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              id="compras"
              class="scroll-mt-4 rounded-xl border border-outline-gray-2 bg-surface-white"
            >
              <header
                class="flex items-center gap-2 border-b border-outline-gray-1 px-4 py-3"
              >
                <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
                  {{ __('Open purchases') }}
                </h2>
                <Button
                  v-if="action('purchase')?.enabled"
                  variant="ghost"
                  class="min-h-11 sm:min-h-7"
                  :label="action('purchase').label"
                  @click="run(action('purchase'))"
                />
              </header>
              <p
                v-if="!data.purchases.rows.length"
                class="px-4 py-3 text-sm text-ink-gray-6"
              >
                {{
                  data.purchases.readable
                    ? __('No open purchases of this product.')
                    : __('You cannot see purchases.')
                }}
              </p>
              <ul v-else class="divide-y divide-outline-gray-1">
                <li v-for="row in data.purchases.rows" :key="row.name">
                  <RouterLink
                    :to="purchaseRecord(row)"
                    class="flex min-h-11 flex-wrap items-start gap-3 px-4 py-2 text-sm hover:bg-surface-gray-1"
                  >
                    <span class="min-w-0 flex-1">
                      <span class="block font-medium">{{
                        row.supplier_name ||
                        (row.doctype === 'Material Request'
                          ? __('Purchase request', null, 'Productos')
                          : row.name)
                      }}</span>
                      <span class="block text-ink-gray-6"
                        >{{ row.name }} ·
                        {{
                          row.schedule_date
                            ? __('Delivery {0}', [row.schedule_date])
                            : row.status
                        }}</span
                      >
                    </span>
                    <span
                      v-if="row.per_received !== undefined"
                      class="tabular-nums text-ink-gray-6"
                      >{{ __('{0}% received', [qty(row.per_received)]) }}</span
                    >
                  </RouterLink>
                </li>
              </ul>
            </section>

            <section
              id="ventas"
              class="scroll-mt-4 rounded-xl border border-outline-gray-2 bg-surface-white"
            >
              <header class="border-b border-outline-gray-1 px-4 py-3">
                <h2 class="text-base font-semibold text-ink-gray-9">
                  {{ __('Recent sales') }}
                </h2>
              </header>
              <p
                v-if="!data.sales.rows.length"
                class="px-4 py-3 text-sm text-ink-gray-6"
              >
                {{
                  data.sales.readable
                    ? __('No sales of this product yet.')
                    : __('You cannot see sales invoices.')
                }}
              </p>
              <ul v-else class="divide-y divide-outline-gray-1">
                <li
                  v-for="row in data.sales.rows"
                  :key="row.name"
                  class="flex flex-wrap items-start gap-3 px-4 py-2 text-sm"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block font-medium">{{
                      row.customer_name || row.name
                    }}</span>
                    <span class="block text-ink-gray-6"
                      >{{ row.name }} · {{ row.posting_date
                      }}<template v-if="row.is_return">
                        · {{ __('Return', null, 'Productos') }}</template
                      ></span
                    >
                  </span>
                  <span class="tabular-nums">{{
                    money(row.grand_total, row.currency)
                  }}</span>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </template>
    </div>

    <PriceDialog
      v-if="data"
      v-model="priceOpen"
      :item="product.name"
      :rows="data.prices.rows"
      :focus="focusList"
      :requested-unit="unit.mismatch ? unit.requested : ''"
      @saved="priceSaved"
      @refresh="load"
      @request="(proposal) => askPrice(proposal)"
    />
    <EditDialog
      v-if="data"
      v-model="editOpen"
      :item="product"
      @saved="edited"
      @refresh="load"
      @request="ask('data')"
    />
    <RequestDialog
      v-if="data"
      v-model="request.open"
      :item="product.name"
      :kind="request.kind"
      :reason="request.reason"
      :price-list="request.priceList"
      :proposed-rate="request.proposed"
      :preset-note="request.note"
      @sent="requested"
    />
    <CountDialog
      v-if="data"
      v-model="countOpen"
      :groups="countGroups"
      :store="countStore"
      @sent="counted"
    />
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon, FileUploader, toast } from 'frappe-ui'
import PriceDialog from '@/components/productos/PriceDialog.vue'
import EditDialog from '@/components/productos/EditDialog.vue'
import RequestDialog from '@/components/productos/RequestDialog.vue'
import CountDialog from '@/components/productos/CountDialog.vue'
import {
  AGE_CLASS,
  backTarget,
  deskReconciliationUrl,
  escanerDone,
  groupRoute,
  lastCountedLabel,
  loadProductosBoot,
  money,
  notifyPriceOpener,
  parseDone,
  plain,
  priceStatus,
  priceUnit,
  problemOf,
  productKind,
  productosApi,
  productosBoot,
  purchaseRoute,
  qty,
  relativeAge,
  requestId,
  requestedAction,
  scannerItemUrl,
  scannerMoveUrl,
  shellPath,
  withoutDone,
} from '@/composables/useProductos'

const props = defineProps({ item: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const boot = productosBoot
const data = ref(null)
const loading = ref(false)
const problem = ref(null)
const guard = ref(null)
const notice = ref(null)
const priceOpen = ref(false)
const editOpen = ref(false)
const countOpen = ref(false)
const countStore = ref('')
const focusList = ref('')
const request = reactive({
  open: false,
  kind: 'data',
  reason: '',
  priceList: '',
  proposed: '',
  note: '',
})

const product = computed(() => data.value?.item || {})
// A link from a line in another unit (`uom=Caja`) never opens the stock-unit
// price by itself: the worker chooses it, or asks for the other unit's price.
const unit = computed(() => priceUnit(route.query, data.value?.item))
const back = computed(() => backTarget(route.query))
const backLabel = computed(() =>
  back.value.href
    ? __('Back to {0}', [
        String(route.query.return_label || 'Inventario').slice(0, 40),
      ])
    : __('Productos', null, 'Productos'),
)
// Opened from «Sin precio» or «Precio por revisar»: after the price, the list.
const listBack = computed(() => {
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  return notice.value?.priced &&
    /^\/productos\?(?:.*&)?vista=(sin-precio|precio-revisar)/.test(list)
    ? list
    : ''
})
const orderedActions = computed(() =>
  [...(data.value?.actions || [])].sort(
    (a, b) => Number(b.primary) - Number(a.primary),
  ),
)
// «Pedir conteo»: one product, any of its readable stores.
const countGroups = computed(() =>
  (data.value?.stock?.rows || []).map((row) => ({
    warehouse: row.warehouse,
    label: row.label || row.warehouse,
    items: [
      {
        name: product.value.name,
        title: product.value.item_name || product.value.name,
      },
    ],
  })),
)
// Escáner comes back to this product (and its list), never to a stale `done`.
const recordBack = computed(() => {
  const url = new URL(shellPath(route.fullPath), 'https://muelle.invalid')
  url.searchParams.delete('done')
  url.searchParams.delete('accion')
  return { to: `${url.pathname}${url.search}`, label: 'Productos' }
})
function countNowUrl(row) {
  return scannerItemUrl(product.value.name, {
    back: recordBack.value,
    warehouse: row.warehouse,
    action: 'contar',
  })
}
function assignUrl(row) {
  return scannerItemUrl(product.value.name, {
    back: recordBack.value,
    warehouse: row.warehouse,
    action: 'asignar',
  })
}
function moveUrl(row) {
  return scannerMoveUrl(
    {
      item: product.value.name,
      from: row.cajones[0]?.ubicacion,
      warehouse: row.warehouse,
    },
    recordBack.value,
  )
}
function askCount(row) {
  countStore.value = row.warehouse
  countOpen.value = true
}
async function copyScannerRequest() {
  const text = __(
    'I need the scanner user role to count, file and move products in Escáner.',
  )
  try {
    await navigator.clipboard.writeText(text)
    notice.value = { text: __('Request copied. Share it with your manager.') }
  } catch {
    notice.value = { text }
  }
}
const photoBroken = ref(false)
const photoSaving = ref(false)
const kind = computed(() => productKind(product.value))
const groupPath = computed(() =>
  product.value.item_group_path?.length
    ? product.value.item_group_path
    : [product.value.item_group].filter(Boolean),
)
const hasRate = (row) => row && row.rate !== null && row.rate !== undefined
const defaultPrice = computed(() => {
  const prices = data.value?.prices
  if (!prices?.rows?.length) return null
  return (
    prices.rows.find((row) => row.price_list === prices.default_price_list) ||
    prices.rows.find(hasRate) ||
    prices.rows[0]
  )
})
const age = (row) => relativeAge(row?.updated, boot.value?.today)
const defaultAge = computed(() => age(defaultPrice.value))
const storesWithStock = computed(
  () =>
    (data.value?.stock?.rows || []).filter((row) => row.actual_qty > 0).length,
)
const history = computed(
  () => data.value?.price_history || { readable: true, rows: [] },
)
const historyAll = ref(false)
const shownHistory = computed(() =>
  historyAll.value ? history.value.rows : history.value.rows.slice(0, 6),
)
const ACTION_ICONS = {
  price: 'tag',
  edit: 'edit-2',
  purchase: 'shopping-cart',
  count: 'clipboard',
  scanner: 'maximize',
  labels: 'printer',
}
// The record's actions, primary first, and «Imprimir etiqueta» in Mercado.
const heroActions = computed(() => {
  const list = orderedActions.value.map((entry) => ({
    ...entry,
    icon: ACTION_ICONS[entry.key] || 'circle',
  }))
  const labels = data.value?.links?.labels
  if (labels)
    list.push({
      key: 'labels',
      label: __('Print label'),
      href: labels,
      icon: ACTION_ICONS.labels,
      title: __('Opens Etiquetas in Mercado with this product'),
    })
  return list
})
function validity(row) {
  if (!hasRate(row)) return '—'
  if (!row.valid_from && !row.valid_upto) return __('No end date')
  if (!row.valid_upto) return __('Since {0}', [row.valid_from])
  return `${row.valid_from || '…'} → ${row.valid_upto}`
}
function change(row) {
  if (!row.old_rate || row.new_rate === null || row.new_rate === undefined)
    return 0
  return Math.round(((row.new_rate - row.old_rate) / row.old_rate) * 1000) / 10
}
const storeNames = computed(
  () =>
    new Map(
      (data.value?.stock?.rows || []).map((row) => [row.warehouse, row.label]),
    ),
)
function storeLabel(warehouse) {
  return storeNames.value.get(warehouse) || warehouse
}
const costFigures = computed(() => {
  const cost = data.value?.cost
  if (!cost) return []
  const currency = cost.currency || defaultPrice.value?.currency
  const show = (value) =>
    value === null || value === undefined ? '—' : money(value, currency)
  const negative = cost.margin !== null && cost.margin < 0
  return [
    { label: __('Last cost'), value: show(cost.last_cost) },
    { label: __('Valuation'), value: show(cost.valuation_rate) },
    {
      label: __('Margin %'),
      value:
        cost.margin_pct === null || cost.margin_pct === undefined
          ? '—'
          : `${cost.margin_pct.toFixed(1)}%`,
      tone: negative ? 'text-ink-red-7' : 'text-ink-gray-9',
    },
    {
      label: __('Margin $'),
      value: show(cost.margin),
      tone: negative ? 'text-ink-red-7' : 'text-ink-gray-9',
    },
  ]
})
const costBasis = computed(() => {
  const cost = data.value?.cost
  if (!cost) return ''
  if (cost.margin === null || cost.margin === undefined)
    return cost.basis_price_list
      ? __('No margin: the cost is missing.')
      : __('No margin: the cost or the price is missing.')
  return cost.basis_cost === 'last_cost'
    ? __('Margin over {0}, against the last purchase cost.', [
        cost.basis_price_list,
      ])
    : __('Margin over {0}, against the valuation.', [cost.basis_price_list])
})
const facts = computed(() => {
  const item = product.value
  const yes = __('Yes')
  const no = __('No')
  return [
    { label: __('Code'), value: item.name },
    { label: __('Kind'), value: kind.value?.text || '' },
    { label: __('Unit'), value: item.stock_uom },
    {
      label: __('Group', null, 'Productos'),
      value: groupPath.value.join(' › '),
    },
    item.brand && { label: __('Brand', null, 'Productos'), value: item.brand },
    { label: __('For sale'), value: item.is_sales_item ? yes : no },
    { label: __('Bought'), value: item.is_purchase_item ? yes : no },
    item.modified && {
      label: __('Changed'),
      value:
        relativeAge(item.modified, boot.value?.today).text ||
        String(item.modified).slice(0, 10),
    },
  ].filter(Boolean)
})
async function photoUploaded(file) {
  photoSaving.value = true
  try {
    await productosApi('set_photo', {
      request_id: requestId(),
      item: product.value.name,
      file_url: file?.file_url,
    })
    photoBroken.value = false
    toast.success(__('Photo saved'))
    await load()
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    photoSaving.value = false
  }
}
function photoFailed(error) {
  problem.value = {
    ...problemOf(error),
    title: __('The photo was not uploaded'),
  }
}

async function load() {
  loading.value = true
  problem.value = null
  try {
    data.value = await productosApi('record', { item: props.item })
    guard.value = null
  } catch (error) {
    const p = problemOf(error)
    if (!data.value)
      guard.value = {
        title:
          p.kind === 'permission'
            ? __('You cannot open this product')
            : __('We could not open this product'),
        detail: p.detail,
      }
    else problem.value = p
  } finally {
    loading.value = false
  }
}

function action(key) {
  return (data.value?.actions || []).find((a) => a.key === key)
}
function run(entry) {
  if (!entry.enabled && entry.resolve?.kind === 'request')
    return ask(entry.resolve.request, entry.reason)
  if (!entry.enabled) {
    problem.value = {
      kind: 'permission',
      title: __('Not available'),
      detail: entry.reason || '',
    }
    return
  }
  if (entry.key === 'price') {
    focusList.value = ''
    priceOpen.value = true
  } else if (entry.key === 'edit') editOpen.value = true
  else if (entry.key === 'purchase')
    router.push(
      purchaseRoute(product.value.name, {
        warehouse: entry.warehouse,
        qty: entry.qty,
      }),
    )
  else if (entry.key === 'count') {
    countStore.value = ''
    countOpen.value = true
  } else if (entry.key === 'scanner')
    window.location.assign(
      scannerItemUrl(product.value.name, { back: recordBack.value }),
    )
}
function ask(kind, reason = '', proposal = {}) {
  const fallback = action(kind === 'data' ? 'edit' : 'price')
  Object.assign(request, {
    open: true,
    kind,
    reason: reason || fallback?.reason || '',
    priceList:
      proposal.price_list ||
      (kind === 'price' ? data.value?.prices?.default_price_list || '' : ''),
    proposed: proposal.proposed_rate || '',
    note: proposal.note || '',
  })
}
function openPrice() {
  focusList.value =
    typeof route.query.lista === 'string' ? route.query.lista : ''
  priceOpen.value = true
}
function askUnitPrice() {
  const list = typeof route.query.lista === 'string' ? route.query.lista : ''
  ask('price', action('price')?.reason, {
    price_list: list,
    note: __('Price per {0}, please.', [unit.value.requested]),
  })
}
function askPrice(proposal) {
  priceOpen.value = false
  ask('price', action('price')?.reason, proposal)
}

async function priceSaved(result) {
  toast.success(__('Price saved'))
  notice.value = {
    priced: true,
    text: __('New price saved in {0}.', [result.price_lists.join(', ')]),
  }
  notifyPriceOpener(route.query, boot.value?.user, product.value.name)
  await load()
}
async function edited() {
  toast.success(__('Product saved'))
  await load()
}
function requested(result) {
  notice.value = {
    text: __('Asked of {0}.', [result.assigned.join(', ')]),
  }
}
async function counted(result) {
  notice.value = {
    text:
      result.kind === 'ask'
        ? __('Asked of {0}.', [result.assigned.join(', ')])
        : __('Count asked of {0}. The stock changes after the review.', [
            result.assigned_to_name,
          ]),
  }
  await load()
}
function purchaseRecord(row) {
  return row.doctype === 'Material Request'
    ? { name: 'CompraSolicitud', params: { name: row.name } }
    : { name: 'CompraOrden', params: { name: row.name } }
}

function goBack() {
  if (back.value.href) return window.location.assign(back.value.href)
  router.push(back.value.to)
}

/** Arrived with `accion=` (a link from Desk, Mercado or a refusal): open it. */
function openRequested() {
  const wanted = requestedAction(route.query)
  if (!wanted || !data.value) return
  const key = { precio: 'price', editar: 'edit', conteo: 'count' }[wanted]
  const entry = action(key)
  if (entry) {
    if (key === 'price')
      focusList.value =
        typeof route.query.lista === 'string' ? route.query.lista : ''
    if (key === 'price' && unit.value.mismatch) {
      // The banner above offers the stock-unit price or a request.
      if (!entry.enabled) askUnitPrice()
    } else if (entry.enabled && key === 'price') priceOpen.value = true
    else if (!entry.enabled && entry.resolve?.request === 'price')
      ask('price', entry.reason, { price_list: focusList.value })
    else run(entry)
  }
  const query = { ...route.query }
  delete query.accion
  router.replace({ query })
}
function handleDone() {
  const done = parseDone(route.query.done)
  const scanned = done ? null : escanerDone(route.query.done)
  if (scanned) {
    // Back from Escáner: say what changed; the record reloads right after.
    toast.success(scanned.text)
    notice.value = { text: scanned.text }
    router.replace(withoutDone(route.fullPath))
    return
  }
  if (!done) {
    if (route.query.done) router.replace(withoutDone(route.fullPath))
    return
  }
  notice.value = {
    text:
      done.doctype === 'Purchase Order'
        ? __('Purchase {0} saved.', [done.name])
        : __('{0} saved.', [done.name]),
    to:
      done.doctype === 'Purchase Order'
        ? { name: 'CompraOrden', params: { name: done.name } }
        : { name: 'CompraSolicitud', params: { name: done.name } },
    link: __('Open in Compras'),
  }
  router.replace(withoutDone(route.fullPath))
}

watch(
  () => props.item,
  async () => {
    data.value = null
    notice.value = null
    photoBroken.value = false
    await load()
  },
)
onMounted(async () => {
  await loadProductosBoot()
  if (!boot.value?.enabled) {
    guard.value = {
      title: __('Productos is not available'),
      detail:
        boot.value?.reason ||
        __('Ask your manager for permission to read items, then retry.'),
    }
    return
  }
  handleDone()
  await load()
  openRequested()
})
</script>
