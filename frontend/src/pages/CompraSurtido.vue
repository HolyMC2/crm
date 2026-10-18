<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-5xl px-4 pb-12 pt-4 sm:px-6">
      <nav class="mb-3 flex items-center justify-between gap-2">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="goBack()"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ __('Compras', null, 'Compras') }}
        </button>
        <Button
          v-if="ready"
          icon-left="message-circle"
          class="min-h-11 sm:min-h-8"
          :label="__('Ask Muelle', null, 'Surtido')"
          @click="askMuelle"
        />
      </nav>

      <section v-if="guard" role="alert" class="max-w-xl space-y-4 py-6">
        <h1 class="text-xl font-semibold">{{ guard.title }}</h1>
        <p class="text-base text-ink-gray-7">{{ guard.detail }}</p>
        <Button :label="__('Retry', null, 'Compras')" @click="start" />
      </section>
      <div v-else-if="!ready" role="status" class="py-10 text-sm">
        {{ __('Loading supplier lists…', null, 'Surtido') }}
      </div>

      <template v-else>
        <header class="mb-4">
          <h1 class="text-2xl font-semibold text-ink-gray-9">
            {{ __('Restock from a supplier list', null, 'Surtido') }}
          </h1>
          <p class="mt-1 text-sm text-ink-gray-6">
            {{
              __(
                'The supplier list, a buy plan from your sales and stock that never passes the budget, then the supplier reply.',
                null,
                'Surtido',
              )
            }}
          </p>
        </header>

        <ol
          class="mb-5 grid grid-cols-3 gap-2"
          :aria-label="__('Steps', null, 'Surtido')"
        >
          <li v-for="(s, i) in steps" :key="s.key">
            <button
              type="button"
              class="flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm"
              :class="
                step === s.key
                  ? 'border-outline-gray-4 bg-surface-gray-2 font-semibold text-ink-gray-9'
                  : 'border-outline-gray-2 text-ink-gray-6 hover:bg-surface-gray-1'
              "
              :aria-current="step === s.key ? 'step' : undefined"
              :disabled="s.disabled"
              @click="go(s.key)"
            >
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-gray-3 text-xs tabular-nums"
                >{{ i + 1 }}</span
              >
              <span class="min-w-0 truncate">{{ s.label }}</span>
            </button>
          </li>
        </ol>

        <div
          v-if="problem"
          role="alert"
          class="mb-4 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        </div>

        <!-- 1 · the supplier list ------------------------------------------------ -->
        <section v-if="step === 'lista'" :aria-label="steps[0].label">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h2 class="text-base font-semibold">
              {{ __('Supplier lists', null, 'Surtido') }}
            </h2>
            <Button
              :label="__('Refresh', null, 'Surtido')"
              icon-left="refresh-cw"
              @click="loadBoot"
            />
          </div>
          <p v-if="!boot.catalogs.length" class="text-sm text-ink-gray-6">
            {{
              __(
                'No supplier list yet. Upload the first one below.',
                null,
                'Surtido',
              )
            }}
          </p>
          <ul
            v-else
            class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
          >
            <li
              v-for="c in boot.catalogs"
              :key="c.name"
              class="flex flex-wrap items-center gap-3 p-3"
              :class="catalog === c.name ? 'bg-surface-gray-1' : ''"
            >
              <label
                class="flex min-w-0 flex-1 cursor-pointer items-start gap-3"
              >
                <input
                  v-model="catalog"
                  type="radio"
                  name="catalog"
                  class="mt-1"
                  :value="c.name"
                  :disabled="!c.lines"
                />
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{
                    c.title || c.name
                  }}</span>
                  <span class="block truncate text-sm text-ink-gray-6">
                    {{
                      [
                        c.supplier,
                        c.page_count &&
                          __('{0} pages', [c.page_count], 'Surtido'),
                        __('{0} products', [c.lines || 0], 'Surtido'),
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    }}
                  </span>
                </span>
              </label>
              <Badge
                :theme="catalogTheme(c.status)"
                :label="catalogStatus(c)"
              />
              <Button
                v-if="boot.owner && c.status === 'Esperando archivo'"
                :label="__('Upload link', null, 'Surtido')"
                @click="linkFor(c.name)"
              />
            </li>
          </ul>

          <div
            v-if="uploadUrl"
            class="mt-3 rounded-lg border border-outline-gray-2 bg-surface-gray-1 p-3 text-sm"
          >
            <p class="mb-2">
              {{
                __(
                  'Upload the PDF or spreadsheet on this page (big files welcome; the link lasts one day). The list reads itself in the background.',
                  null,
                  'Surtido',
                )
              }}
            </p>
            <a
              :href="uploadUrl"
              target="_blank"
              rel="noopener"
              class="font-medium text-ink-blue-7 underline"
              >{{ __('Open the upload page', null, 'Surtido') }}</a
            >
          </div>

          <details
            v-if="boot.owner"
            class="mt-4 rounded-lg border border-outline-gray-2 p-3"
          >
            <summary class="cursor-pointer text-sm font-medium">
              {{ __('New supplier list', null, 'Surtido') }}
            </summary>
            <div class="mt-3 flex flex-wrap items-end gap-2">
              <div class="min-w-[14rem] flex-1">
                <ComprasPicker
                  v-model="newSupplier"
                  :display="newSupplierLabel"
                  :label="__('Supplier', null, 'Surtido')"
                  :placeholder="__('Search supplier', null, 'Surtido')"
                  :load="(q) => comprasApi('suppliers', { search: q })"
                  @pick="(o) => (newSupplierLabel = o.label)"
                />
              </div>
              <div class="min-w-[12rem] flex-1">
                <FormControl
                  v-model="newTitle"
                  :label="__('Name of the list', null, 'Surtido')"
                  :placeholder="__('October cases', null, 'Surtido')"
                />
              </div>
              <Button
                variant="solid"
                class="min-h-11 sm:min-h-8"
                :label="__('Create and get the upload link', null, 'Surtido')"
                :loading="busy === 'catalog'"
                :disabled="!newSupplier"
                @click="createCatalog"
              />
            </div>
          </details>

          <div v-if="boot.pedidos.length" class="mt-6">
            <h2 class="mb-2 text-base font-semibold">
              {{ __('Recent orders to suppliers', null, 'Surtido') }}
            </h2>
            <ul
              class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
            >
              <li v-for="p in boot.pedidos" :key="p.name">
                <button
                  type="button"
                  class="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-gray-1"
                  @click="openPedido(p.name)"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium">{{
                      p.supplier
                    }}</span>
                    <span class="block truncate text-sm text-ink-gray-6">
                      {{ p.name }}
                      <template v-if="p.ceiling">
                        ·
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
                  <FeatherIcon name="chevron-right" class="h-4 w-4" />
                </button>
              </li>
            </ul>
          </div>

          <div class="mt-5 flex justify-end">
            <Button
              variant="solid"
              class="min-h-11"
              :label="__('Next: buy plan', null, 'Surtido')"
              :disabled="!catalog"
              @click="go('plan')"
            />
          </div>
        </section>

        <!-- 2 · the buy plan ------------------------------------------------------ -->
        <section v-else-if="step === 'plan'" :aria-label="steps[1].label">
          <form
            class="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-outline-gray-2 p-4 sm:grid-cols-4"
            @submit.prevent="makePlan"
          >
            <FormControl
              v-model="form.budget"
              type="number"
              min="1"
              :label="__('Budget (MXN)', null, 'Surtido')"
              required
            />
            <FormControl
              v-model="form.months"
              type="number"
              min="1"
              max="24"
              :label="__('Months of sales', null, 'Surtido')"
            />
            <FormControl
              v-model="form.cover_days"
              type="number"
              min="1"
              :label="__('Days to cover', null, 'Surtido')"
            />
            <FormControl
              v-model="form.terms"
              :label="__('Product words', null, 'Surtido')"
              :placeholder="__('case, rugged', null, 'Surtido')"
            />
            <FormControl
              v-model="form.model"
              :label="__('Only this model', null, 'Surtido')"
            />
            <FormControl
              v-model="form.colour"
              :label="__('Only this colour', null, 'Surtido')"
            />
            <label class="flex items-center gap-2 text-sm">
              <input v-model="form.low_stock" type="checkbox" />
              {{ __('Only what runs low', null, 'Surtido') }}
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input v-model="form.new_models" type="checkbox" />
              {{ __('Include new models', null, 'Surtido') }}
            </label>
            <div class="col-span-2 flex justify-end sm:col-span-4">
              <Button
                type="submit"
                variant="solid"
                class="min-h-11 sm:min-h-8"
                :label="
                  plan
                    ? __('Make a new plan', null, 'Surtido')
                    : __('Make the plan', null, 'Surtido')
                "
                :loading="busy === 'plan'"
                :disabled="!form.budget || !catalog"
              />
            </div>
          </form>

          <template v-if="plan">
            <div class="mb-4 rounded-xl border border-outline-gray-2 p-4">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <p class="text-base">
                  <strong class="tabular-nums">{{ money(plan.total) }}</strong>
                  {{ __('of {0}', [money(plan.budget)], 'Surtido') }}
                  · {{ __('{0} lines', [plan.lines.length], 'Surtido') }}
                </p>
                <p class="text-sm text-ink-gray-6">
                  {{ __('{0} left', [money(plan.remaining)], 'Surtido') }} ·
                  {{ plan.catalog_title || plan.catalog }}
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
                  class="h-full rounded-full bg-surface-gray-7"
                  :style="{ width: budgetPct + '%' }"
                />
              </div>
              <p class="mt-2 text-xs text-ink-gray-5">
                {{
                  __(
                    'Quantity = sales of {0} months over {1} days of cover, minus stock. The plan never passes the budget.',
                    [plan.months, plan.cover_days],
                    'Surtido',
                  )
                }}
              </p>
              <ul
                v-if="plan.notes?.length || plan.unresolved?.length"
                class="mt-2 space-y-1 text-sm"
              >
                <li v-for="n in plan.notes" :key="n" class="text-ink-gray-7">
                  {{ n }}
                </li>
                <li
                  v-for="u in plan.unresolved"
                  :key="u"
                  class="text-ink-amber-7"
                >
                  {{ __('Not applied: {0}', [u], 'Surtido') }}
                </li>
              </ul>
            </div>

            <div
              v-if="plan.diff"
              class="mb-4 rounded-lg bg-surface-gray-1 p-3 text-sm"
              role="status"
            >
              <p class="font-medium">
                {{
                  __(
                    'Changes: total {0} → {1}',
                    [money(plan.diff.total_from), money(plan.diff.total_to)],
                    'Surtido',
                  )
                }}
              </p>
              <ul class="mt-1 space-y-0.5 text-ink-gray-7">
                <li v-for="c in plan.diff.changed" :key="'c' + c.line">
                  {{
                    __('{0}: {1} → {2} pcs', [c.name, c.from, c.to], 'Surtido')
                  }}
                </li>
                <li v-for="r in plan.diff.removed" :key="'r' + r.line">
                  {{ __('Removed: {0}', [r.name], 'Surtido') }}
                </li>
                <li v-for="a in plan.diff.added" :key="'a' + a.line">
                  {{ __('Added: {0} ({1} pcs)', [a.name, a.qty], 'Surtido') }}
                </li>
              </ul>
            </div>

            <ul
              class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
              :aria-label="__('Plan lines', null, 'Surtido')"
            >
              <li
                v-for="line in plan.lines"
                :key="line.line"
                class="flex flex-wrap items-start gap-3 p-3"
                :class="edits[line.line]?.remove ? 'opacity-50' : ''"
              >
                <div class="min-w-0 flex-1 basis-64">
                  <p class="font-medium">
                    {{ line.name }}
                    <span
                      v-if="line.page"
                      class="ml-1 text-xs font-normal text-ink-gray-5"
                      >{{ __('p. {0}', [line.page], 'Surtido') }}</span
                    >
                  </p>
                  <p class="truncate text-xs text-ink-gray-5">
                    {{
                      [line.code, line.model, line.colour]
                        .filter(Boolean)
                        .join(' · ')
                    }}
                  </p>
                  <p class="mt-1 flex flex-wrap gap-1">
                    <span
                      v-for="r in line.reasons"
                      :key="r"
                      class="rounded bg-surface-gray-2 px-1.5 py-0.5 text-xs text-ink-gray-7"
                      >{{ r }}</span
                    >
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    class="h-9 w-20 rounded border border-outline-gray-2 px-2 text-right tabular-nums"
                    :aria-label="__('Pieces of {0}', [line.name], 'Surtido')"
                    :value="edits[line.line]?.qty ?? line.qty"
                    :disabled="!boot.owner || edits[line.line]?.remove"
                    @change="setEdit(line, 'qty', Number($event.target.value))"
                  />
                  <span class="w-24 text-right text-sm tabular-nums">{{
                    money(line.total)
                  }}</span>
                  <Button
                    v-if="boot.owner"
                    :icon="edits[line.line]?.remove ? 'rotate-ccw' : 'x'"
                    :aria-label="
                      edits[line.line]?.remove
                        ? __('Keep {0}', [line.name], 'Surtido')
                        : __('Remove {0}', [line.name], 'Surtido')
                    "
                    @click="setEdit(line, 'remove', !edits[line.line]?.remove)"
                  />
                  <Button
                    v-if="boot.owner && line.colour"
                    icon="droplet"
                    :aria-label="
                      __('Change colour of {0}', [line.name], 'Surtido')
                    "
                    @click="askColour(line)"
                  />
                </div>
              </li>
            </ul>

            <details
              v-if="plan.left_out?.length"
              class="mt-3 rounded-lg border border-outline-gray-2 p-3"
            >
              <summary class="cursor-pointer text-sm font-medium">
                {{
                  __(
                    'Left out of the plan ({0})',
                    [plan.left_out.length],
                    'Surtido',
                  )
                }}
              </summary>
              <ul class="mt-2 divide-y divide-outline-gray-1">
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
                  <span class="tabular-nums text-ink-gray-6">{{
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

            <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
              <span
                v-if="pendingChanges.length"
                class="text-sm text-ink-gray-6"
              >
                {{
                  __('{0} changes to apply', [pendingChanges.length], 'Surtido')
                }}
              </span>
              <Button
                v-if="boot.owner"
                class="min-h-11 sm:min-h-8"
                :label="__('Apply changes', null, 'Surtido')"
                :loading="busy === 'changes'"
                :disabled="!pendingChanges.length"
                @click="applyChanges"
              />
              <Button
                v-if="boot.owner"
                variant="solid"
                class="min-h-11 sm:min-h-8"
                :label="
                  __('Approve: draft order to the supplier', null, 'Surtido')
                "
                :loading="busy === 'approve'"
                :disabled="!plan.lines.length || pendingChanges.length > 0"
                @click="approve"
              />
            </div>
            <p
              v-if="!boot.owner"
              class="mt-2 text-right text-xs text-ink-gray-5"
            >
              {{ __('Only the owner approves a plan.', null, 'Surtido') }}
            </p>
          </template>
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
            <div class="mb-4 rounded-xl border border-outline-gray-2 p-4">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="min-w-0 flex-1 truncate text-lg font-semibold">
                  {{ pedido.supplier }} · {{ pedido.pedido }}
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
              class="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-surface-gray-1 p-3"
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
              class="mb-4 rounded-lg border border-dashed border-outline-gray-3 p-4"
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
                  class="inline-flex min-h-9 cursor-pointer items-center rounded bg-surface-gray-2 px-3 text-sm hover:bg-surface-gray-3"
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
                class="mt-2 w-full rounded border border-outline-gray-2 p-2 text-sm"
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
                class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
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
                          .join(' · ')
                      }}
                    </p>
                  </div>
                  <span class="text-sm tabular-nums">
                    {{ qty(row.qty) }} × {{ money(row.unit_price) }}
                  </span>
                  <label class="flex items-center gap-1 text-sm">
                    {{ __('Batches', null, 'Surtido') }}
                    <select
                      v-model="rowBatch[row.index]"
                      class="h-8 rounded border border-outline-gray-2 text-sm"
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
                      v-model="rowSerial[row.index]"
                      class="h-8 rounded border border-outline-gray-2 text-sm"
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
                <Button
                  variant="solid"
                  :label="__('Create chosen items', null, 'Surtido')"
                  :disabled="!picked.length || !pickedReady"
                  :loading="busy === 'items'"
                  @click="createItems"
                />
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
                class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
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
                          .join(' · ')
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
                      class="h-9 w-20 rounded border border-outline-gray-2 px-2 text-right tabular-nums"
                      :aria-label="
                        __('Pieces of {0}', [line.name || line.code], 'Surtido')
                      "
                      :value="line.qty"
                      @change="updateQty(line, Number($event.target.value))"
                    />
                    <Button
                      icon="x"
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
                class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
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

            <div
              v-if="pedido.owner && pedido.status === 'Cotizado'"
              class="flex flex-wrap items-center justify-end gap-2 border-t border-outline-gray-2 pt-4"
            >
              <p class="min-w-0 flex-1 text-sm text-ink-gray-6">
                {{
                  __(
                    'Closing makes the supplier quotation and a draft purchase with what the supplier confirmed.',
                    null,
                    'Surtido',
                  )
                }}
              </p>
              <Button
                variant="solid"
                class="min-h-11 sm:min-h-8"
                :label="__('Close the order', null, 'Surtido')"
                :loading="busy === 'close'"
                @click="closePedido"
              />
            </div>
          </template>
        </section>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { loadAssistant } from '@/components/assistant/assistantDoor'
import { comprasApi, money, problemOf, qty } from '@/composables/useCompras'
import {
  buildChanges,
  budgetShare,
  catalogTone,
  lineTone,
  pedidoTone,
  readyRows,
} from '@/utils/surtido'

const API = 'doco.workspaces.sourcing.'
const call = (method, args = {}) => comprasApi(API + method, args)

const route = useRoute()
const router = useRouter()
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
const form = reactive({
  budget: '',
  months: 12,
  cover_days: 60,
  terms: '',
  model: '',
  colour: '',
  low_stock: true,
  new_models: true,
})
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
const missingPick = ref({})
const lastRequest = ref('')

const steps = computed(() => [
  { key: 'lista', label: __('Supplier list', null, 'Surtido') },
  { key: 'plan', label: __('Plan', null, 'Surtido'), disabled: !catalog.value },
  {
    key: 'respuesta',
    label: __('Reply', null, 'Surtido'),
    disabled: !pedido.value,
  },
])
const budgetPct = computed(() => budgetShare(plan.value))
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
function catalogStatus(c) {
  const base = label(c.status)
  return c.status === 'Indexando' && c.index_progress
    ? `${base} ${c.index_progress}%`
    : base
}
const pedidoStatus = label
const lineStatus = label
const catalogTheme = catalogTone
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

async function loadBoot() {
  const out = await run('boot', () => call('bootstrap'))
  if (out) boot.value = { catalogs: [], pedidos: [], ...out }
  return out
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
      boot.value.catalogs.find((c) => c.status === 'Listo' && c.lines)?.name ||
      ''
  ready.value = true
  if (typeof q.pedido === 'string' && q.pedido) await openPedido(q.pedido)
  else if (q.paso === 'plan' && catalog.value) step.value = 'plan'
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

function planArgs() {
  const terms = form.terms
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  return {
    budget: Number(form.budget),
    catalog: catalog.value,
    months: Number(form.months) || 12,
    cover_days: Number(form.cover_days) || 60,
    terms: terms.length ? JSON.stringify(terms) : '',
    model: form.model.trim(),
    colour: form.colour.trim(),
    low_stock: form.low_stock ? 1 : 0,
    new_models: form.new_models ? 1 : 0,
  }
}

function resetEdits() {
  edits.value = {}
  adds.value = {}
}

async function makePlan() {
  const out = await run('plan', () => call('plan', planArgs()))
  if (!out) return
  plan.value = out
  resetEdits()
}

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
    call('approve', { plan: plan.value.id }),
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
    toast.success(__('{0} items created', [made], 'Surtido'))
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
  act('close', 'close', {}, (out) => {
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

function goBack() {
  router.push({ name: 'Compras' })
}

onMounted(start)
onBeforeUnmount(() => dropContext?.())
</script>
