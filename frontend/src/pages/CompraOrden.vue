<template>
  <!-- A purchase order, read like a chat with the supplier (Shell look,
       record-header): the bar names them with the state and the order under
       it, the ways to reach them, the bolt with the order's steps and «⋯»
       with every tool (print, share, mail…). The amount, the delivery and the
       one next step are the hero; then the lines with what arrived, the
       totals and the order's data. Receipts (Escáner), bills (Gastos),
       follow-ups, Archivos and the engine's Actividad sit beside them on a
       desk and below them on a phone. A new or draft order edits in place. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="true"
      :back-label="backLabel"
      :title="title"
      :bell="phone"
      :loading="loading && loaded"
      @back="onBack"
    >
      <template v-if="loaded && !isNew && doc.name" #title>
        <div class="flex min-h-12 min-w-0 flex-col justify-center px-3">
          <span
            class="title-face line-clamp-2 break-words text-xl font-semibold leading-tight [text-wrap:balance]"
            data-appbar-title
            >{{ title }}</span
          >
          <span class="flex min-w-0 items-center gap-2 pt-0.5">
            <StatusChip
              :label="chip.label"
              :tone="chip.tone"
              data-testid="orden-status"
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              kindLine
            }}</span>
          </span>
        </div>
      </template>
      <template #actions>
        <RecordIsland
          v-if="loaded && !isNew && doc.name"
          :reach="kit.record.value?.header?.reach || {}"
          :who="doc.party || ''"
          :mail="kit.record.value?.actions?.email || null"
          :groups="boltGroups"
          :phone="phone"
          :subtitle="kit.scopeTitle.value"
          @mail="mail"
          @pick="onBolt"
          @tools="kit.openTools()"
        />
      </template>
    </AppBar>

    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <EmptyState
        v-if="guard"
        role="alert"
        state="error"
        :title="guard.title"
        :message="guard.detail"
        :action="__('Retry', null, 'Compras')"
        @action="load"
      />
      <EmptyState
        v-else-if="loading && !loaded"
        role="status"
        state="loading"
        :title="__('Loading purchase…')"
      />

      <div
        v-else-if="loaded"
        class="mx-auto grid w-full max-w-6xl gap-x-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div class="flex min-w-0 flex-col gap-5 pt-4">
          <!-- What was asked of me on this purchase (Pendientes «Por aprobar»).
               Hidden while editing: the save bar owns the phone's bottom edge. -->
          <div v-if="!isNew && doc.name && !editing" class="px-4 empty:hidden">
            <ApprovalAsk
              doctype="Purchase Order"
              :name="doc.name"
              :settle-kinds="['compras.review']"
              :settle-label="__('Reviewed', null, 'Compras')"
              @declined="goBack"
              @settled="reviewed"
            >
              <template #primary>
                <button
                  v-if="primary?.allowed && primary.key === 'confirm'"
                  type="button"
                  :class="['press', BTN.filled]"
                  :disabled="busy"
                  @click="runAction(primary)"
                >
                  {{ primary.label }}
                </button>
              </template>
            </ApprovalAsk>
          </div>

          <!-- What just happened and what needs the worker: Escáner's receipt
               came back, an unsaved draft, a refusal, someone else's change. -->
          <div class="flex flex-col gap-3 px-4 empty:hidden">
            <div
              v-if="doneNotice"
              role="status"
              class="flex flex-wrap items-center gap-2 rounded-6 bg-surface-green-1 p-3 text-base text-ink-green-8"
            >
              <span class="min-w-0 flex-1">{{ doneNotice }}</span>
              <RouterLink
                v-if="doneBill"
                class="min-h-11 py-2 text-ink-blue-link underline"
                :to="billRoute(doneBill, returnHere)"
                >{{ __('Open bill') }}</RouterLink
              >
            </div>
            <div
              v-if="draftNotice"
              role="status"
              class="flex flex-wrap items-center gap-2 rounded-6 bg-surface-amber-1 p-3 text-base text-ink-amber-9"
            >
              <span class="min-w-0 flex-1">{{ draftNotice }}</span>
              <button
                type="button"
                :class="['press', BTN.tonal]"
                @click="recoverDraft"
              >
                {{ __('Recover', null, 'Compras') }}
              </button>
              <button
                type="button"
                :class="['press', BTN.text]"
                @click="discardDraft"
              >
                {{ __('Discard', null, 'Compras') }}
              </button>
            </div>
            <div
              v-if="problem"
              role="alert"
              class="space-y-2 rounded-6 bg-surface-red-1 p-3 text-base text-ink-red-7"
            >
              <p>
                <strong>{{ problem.title }}.</strong> {{ problem.detail }}
              </p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-if="problem.kind === 'offline'"
                  type="button"
                  :class="['press', BTN.tonal]"
                  @click="retryLast"
                >
                  {{ __('Check result') }}
                </button>
                <button
                  v-if="problem.kind === 'conflict'"
                  type="button"
                  :class="['press', BTN.tonal]"
                  @click="compare"
                >
                  {{ __('Refresh and compare') }}
                </button>
                <button
                  v-if="problem.kind === 'permission' && !isNew"
                  type="button"
                  :class="['press', BTN.tonal]"
                  @click="
                    openHandoff('review', __('Ask for a review'), problem.detail)
                  "
                >
                  {{ __('Ask for help') }}
                </button>
              </div>
            </div>

            <!-- Conflict: your version beside the current one; input is kept. -->
            <section
              v-if="conflict"
              class="rounded-6 border border-outline-amber-2 p-3 text-base"
              :aria-label="__('Compare versions')"
            >
              <p class="mb-2 font-semibold">
                {{ __('Someone else changed this purchase') }}
              </p>
              <table class="w-full text-left text-sm">
                <thead>
                  <tr class="text-ink-gray-6">
                    <th class="py-1">{{ __('Field', null, 'Compras') }}</th>
                    <th class="py-1">{{ __('Your version') }}</th>
                    <th class="py-1">{{ __('Current', null, 'Compras') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="diff in conflict.diffs" :key="diff.label">
                    <td class="py-1">{{ diff.label }}</td>
                    <td class="py-1">{{ diff.mine }}</td>
                    <td class="py-1">{{ diff.current }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  :class="['press', BTN.filled]"
                  @click="reapply"
                >
                  {{ __('Reapply my changes') }}
                </button>
                <button
                  type="button"
                  :class="['press', BTN.tonal]"
                  @click="useCurrent"
                >
                  {{ __('Use the current one') }}
                </button>
              </div>
            </section>
          </div>

          <!-- The hero: how much, when it arrives, how much arrived, and the
               one next step (filled) with the order's other doors (tonal). -->
          <section
            v-if="!isNew && !editing"
            class="flex flex-col gap-2 px-4"
            :aria-label="__('Purchase', null, 'Compras')"
            data-testid="orden-hero"
          >
            <p
              class="num text-3xl font-semibold tabular-nums leading-tight text-ink-gray-9"
            >
              {{ money(doc.grand_total, doc.currency) }}
            </p>
            <StageSteps
              v-if="kit.stages.value"
              :stages="kit.stages.value"
              class="py-2"
            />
            <p
              v-if="doc.schedule_date"
              class="text-base text-ink-gray-7"
              :class="lateDays ? 'font-medium text-ink-red-7' : ''"
              data-testid="compra-entrega"
            >
              {{ __('delivery {0}', [formatDay(doc.schedule_date)])
              }}<template v-if="lateDays"> · {{ lateText }}</template>
            </p>
            <p v-if="summaryLine" class="break-words text-base text-ink-gray-8">
              {{ summaryLine }}
            </p>
            <p
              v-if="primary && !primary.allowed && primary.reason"
              class="break-words text-base text-ink-gray-8"
            >
              {{ primary.reason }}
            </p>
            <p
              v-else-if="!primary && Number(doc.docstatus) === 1"
              class="break-words text-base text-ink-gray-8"
            >
              <template v-if="!summaryLine"
                >{{ __('Nothing left to receive on this purchase.') }}
              </template>
              <RouterLink
                class="text-ink-blue-link underline"
                :to="{ name: 'Compras', query: { segment: 'por-recibir' } }"
                >{{ __('Back to the queue') }}</RouterLink
              >
            </p>
            <div class="flex flex-wrap gap-2 pt-2" data-testid="orden-next">
              <button
                v-for="(step, i) in nextSteps"
                :key="step.key"
                type="button"
                :class="['press', i === 0 ? BTN.filled : BTN.tonal]"
                :disabled="busy && step.busy"
                :data-step="step.key"
                :data-testid="step.testid"
                @click="step.run()"
              >
                <span :class="[step.icon, 'size-5']" aria-hidden="true" />
                {{ step.label }}
              </button>
            </div>
          </section>

          <!-- Editor: draft purchases only, never a submitted one. -->
          <section
            v-if="editing"
            class="space-y-4 px-4"
            :aria-label="__('Purchase details', null, 'Compras')"
          >
            <div class="compra-fields grid gap-3 sm:grid-cols-2">
              <ComprasPicker
                v-model="form.supplier"
                :display="form.supplier_label"
                :label="__('Supplier', null, 'Compras')"
                :placeholder="__('Search supplier')"
                :empty-text="__('No supplier you can use matches.')"
                :invalid="showMissing && missing.includes('supplier')"
                :load="(q) => comprasApi('suppliers', { search: q })"
                @pick="(o) => (form.supplier_label = o.label)"
              />
              <FormControl
                v-model="form.company"
                type="select"
                :label="__('Company', null, 'Compras')"
                :options="companyOptions"
              />
              <ComprasPicker
                v-model="form.set_warehouse"
                :display="form.set_warehouse"
                :label="__('Destination warehouse', null, 'Compras')"
                :placeholder="__('Search warehouse')"
                :empty-text="__('No warehouse of this company you can use.')"
                :invalid="showMissing && missing.includes('warehouse')"
                :disabled="!form.company"
                :load="
                  (q) =>
                    comprasApi('warehouses', {
                      company: form.company,
                      search: q,
                    })
                "
              />
              <FormControl
                v-model="form.schedule_date"
                type="date"
                :placeholder="__('Elige la fecha', null, 'Compras')"
                :label="__('Delivery date', null, 'Compras')"
              />
            </div>
            <p
              v-if="missing.length && showMissing"
              role="status"
              class="text-base text-ink-amber-9"
            >
              {{ __('Missing: {0}.', [missingText]) }}
              <RouterLink
                v-if="isNew && missing.includes('supplier')"
                class="ml-1 underline"
                :to="{ name: 'Contactos', query: { return_to: route.fullPath } }"
                >{{ __('Add a supplier in Contactos') }}</RouterLink
              >
              <button
                v-if="!isNew"
                type="button"
                class="ml-1 min-h-11 underline"
                @click="
                  openHandoff(
                    'setup',
                    __('Ask for setup'),
                    __(
                      'Ask someone to add the missing supplier, warehouse or configuration.',
                    ),
                  )
                "
              >
                {{ __('Ask for setup') }}
              </button>
            </p>

            <div>
              <h2 class="pb-1 text-base font-semibold text-ink-gray-9">
                {{ __('Items ({0})', [form.items.length]) }}
              </h2>
              <ul
                class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
              >
                <li
                  v-for="(row, index) in form.items"
                  :key="row.key"
                  class="grid gap-2 p-3 sm:grid-cols-[1fr_6rem_8rem_8rem_auto] sm:items-end"
                >
                  <div class="min-w-0">
                    <p class="break-words font-medium">
                      {{ row.item_label || row.item_code }}
                    </p>
                    <p class="break-words text-sm text-ink-gray-6">
                      {{ row.item_code
                      }}<template v-if="row.material_request">
                        · {{ __('from {0}', [row.material_request]) }}</template
                      ><template
                        v-if="
                          row.warehouse && row.warehouse !== form.set_warehouse
                        "
                      >
                        · {{ __('to {0}', [row.warehouse]) }}
                        <button
                          type="button"
                          class="underline"
                          @click="row.warehouse = form.set_warehouse"
                        >
                          {{ __('use destination') }}
                        </button></template
                      ><template v-if="row.tracked">
                        ·
                        {{ __('serial/batch: reviewed on receipt') }}</template
                      >
                    </p>
                    <p
                      v-if="
                        row.note &&
                        Number(row.qty) === row.note_for?.qty &&
                        row.uom === row.note_for?.uom
                      "
                      class="text-sm text-ink-gray-6"
                    >
                      {{ row.note }}
                    </p>
                  </div>
                  <FormControl
                    v-model="row.qty"
                    type="number"
                    :label="__('Quantity', null, 'Compras')"
                    min="0"
                    step="any"
                  />
                  <FormControl
                    v-model="row.uom"
                    type="select"
                    :label="__('Unit', null, 'Compras')"
                    :options="
                      (row.uoms || []).map((u) => ({
                        label:
                          u.factor && u.factor !== 1
                            ? `${u.uom} (×${u.factor})`
                            : u.uom,
                        value: u.uom,
                      }))
                    "
                  />
                  <FormControl
                    v-model="row.rate"
                    type="number"
                    :label="__('Price (optional)')"
                    min="0"
                    step="any"
                  />
                  <button
                    type="button"
                    class="press flex size-11 items-center justify-center self-end rounded-full text-ink-gray-7 [@media(hover:hover)]:hover:bg-surface-gray-2"
                    :aria-label="
                      __('Remove {0}', [row.item_label || row.item_code])
                    "
                    :title="__('Remove {0}', [row.item_label || row.item_code])"
                    @click="form.items.splice(index, 1)"
                  >
                    <LucideTrash2 class="size-5" aria-hidden="true" />
                  </button>
                </li>
                <li class="p-3">
                  <ComprasPicker
                    model-value=""
                    :label="__('Add item')"
                    :placeholder="__('Search item, code or barcode')"
                    :empty-text="
                      __('Only existing purchasable items appear here.')
                    "
                    clear-on-pick
                    :load="(q) => comprasApi('items', { search: q })"
                    @pick="addItem"
                  />
                </li>
              </ul>
            </div>
            <div
              class="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-outline-gray-2 bg-surface-base p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:border-0 sm:p-0"
            >
              <button
                type="button"
                :class="['press flex-1 sm:flex-none', BTN.filled]"
                :disabled="busy"
                data-testid="compra-guardar"
                @click="save"
              >
                <span
                  :class="[
                    busy ? 'lucide-loader-circle animate-spin' : 'lucide-check',
                    'size-5',
                  ]"
                  aria-hidden="true"
                />
                {{ isNew ? __('Save purchase') : __('Save changes') }}
              </button>
              <button
                v-if="!isNew"
                type="button"
                :class="['press', BTN.tonal]"
                @click="cancelEditing"
              >
                {{ __('Cancel', null, 'Compras') }}
              </button>
            </div>
          </section>

          <!-- Lines of a saved purchase: ordered, received, in a draft
               receipt, missing; then the totals with their taxes. -->
          <section
            v-if="!isNew && !editing"
            class="px-4"
            aria-labelledby="orden-items"
          >
            <h2
              id="orden-items"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Items ({0})', [data.rows_scope?.total || rows.length]) }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="row in shownRows"
                :key="row.name"
                class="flex min-w-0 gap-3 py-3"
              >
                <div class="min-w-0 flex-1">
                  <p class="break-words text-base text-ink-gray-9">
                    {{ row.item_name || row.item_code }}
                  </p>
                  <p class="break-words text-sm text-ink-gray-6">
                    {{
                      [
                        row.item_code,
                        row.warehouse ||
                          (row.warehouse_restricted
                            ? __('restricted warehouse')
                            : ''),
                        row.material_request,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    }}
                  </p>
                  <p
                    v-if="Number(doc.docstatus) === 1"
                    class="pt-0.5 text-sm"
                    :class="
                      row.remaining_qty > 0
                        ? 'text-ink-gray-8'
                        : 'text-ink-green-8'
                    "
                  >
                    {{ rowProgress(row) }}
                  </p>
                  <p v-if="row.tracked" class="pt-0.5 text-sm text-ink-amber-9">
                    {{ __('Needs serial/batch review when it arrives.') }}
                  </p>
                </div>
                <div class="num shrink-0 text-right tabular-nums">
                  <p class="text-base text-ink-gray-9">
                    {{ formatQty(row.qty, row.uom) }}
                  </p>
                  <p
                    v-if="row.uom !== row.stock_uom"
                    class="text-sm text-ink-gray-6"
                  >
                    = {{ formatQty(row.stock_qty, row.stock_uom) }}
                  </p>
                  <p class="text-sm text-ink-gray-6">
                    {{ money(row.amount, doc.currency) }}
                  </p>
                </div>
              </li>
            </ul>
            <button
              v-if="rows.length > shownRows.length"
              type="button"
              :class="['press mt-1', BTN.text]"
              data-testid="orden-items-more"
              @click="allRows = true"
            >
              {{ __('Show {0} more items', [rows.length - shownRows.length]) }}
            </button>
            <button
              v-else-if="data.rows_scope?.has_more"
              type="button"
              :class="['press mt-1', BTN.text]"
              @click="loadMoreRows"
            >
              {{ __('Show more items') }}
            </button>
          </section>
          <DocTotals
            v-if="!isNew && !editing && kit.record.value?.totals"
            :totals="kit.record.value.totals"
            :taxes="kit.record.value.taxes"
            :currency="doc.currency || 'MXN'"
            :docstatus="Number(doc.docstatus)"
          />

          <!-- The order's own data as rows; Datos lists the rest. -->
          <section
            v-if="!isNew && !editing"
            class="px-4"
            aria-labelledby="orden-datos"
          >
            <h2
              id="orden-datos"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Purchase details', null, 'Compras') }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="fact in facts"
                :key="fact.key"
                class="flex min-h-14 min-w-0 items-center gap-3 py-2"
              >
                <span
                  class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                  aria-hidden="true"
                >
                  <span :class="[fact.icon, 'size-5']" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="text-sm text-ink-gray-6">{{ fact.label }}</span>
                  <span class="flex flex-wrap gap-x-3 break-words text-base">
                    <template v-if="fact.links">
                      <RouterLink
                        v-for="link in fact.links"
                        :key="link.name"
                        class="min-h-11 py-2 text-ink-blue-link underline sm:min-h-0 sm:py-0"
                        :to="link.to"
                        >{{ link.name }}</RouterLink
                      >
                    </template>
                    <template v-else>{{ fact.value }}</template>
                  </span>
                </span>
              </li>
            </ul>
          </section>
          <DatosList
            v-if="!isNew && !editing && kit.record.value?.fields?.length"
            :fields="kit.record.value.fields"
            :hide="DATOS_SHOWN"
            :currency="doc.currency || 'MXN'"
            :boot="shellBoot"
          />
        </div>

        <aside
          v-if="!isNew && doc.name"
          class="flex min-w-0 flex-col gap-5 pt-5 lg:pt-4"
        >
          <!-- Escáner's side: the receipts that brought the goods, labels. -->
          <BillAlmacen
            :rows="almacenRows"
            :bill="doc.name"
            doctype="Purchase Order"
          />

          <!-- Gastos' side: the supplier bills of this order. -->
          <section class="px-4" aria-labelledby="orden-facturas">
            <h2
              id="orden-facturas"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Billing', null, 'Compras') }}
            </h2>
            <p class="break-words text-base text-ink-gray-7">
              {{
                doc.billing_pending
                  ? __(
                      'The supplier bill is pending. Bills are registered and paid in Gastos.',
                    )
                  : Number(doc.docstatus) === 1
                    ? __('Billed.', null, 'Compras')
                    : __('Billing starts after the purchase is confirmed.')
              }}
            </p>
            <ul
              v-if="data.bills?.length"
              class="divide-y divide-outline-gray-1"
              data-order-bills
            >
              <li v-for="b in data.bills" :key="b.name">
                <RouterLink
                  class="press flex min-h-14 w-full items-center gap-3 rounded-6 py-2 [@media(hover:hover)]:hover:bg-surface-gray-1"
                  :to="billRoute(b.name, returnHere)"
                >
                  <span
                    class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                    aria-hidden="true"
                  >
                    <span class="lucide-receipt size-5" />
                  </span>
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="break-words text-base text-ink-gray-9">{{
                      b.bill_no || b.name
                    }}</span>
                    <span class="text-sm text-ink-gray-6">{{
                      billState(b)
                    }}</span>
                  </span>
                </RouterLink>
              </li>
            </ul>
            <RouterLink
              v-if="gastosOn && Number(doc.docstatus) === 1"
              class="inline-block min-h-11 py-2 text-base text-ink-blue-link underline"
              :to="orderBillsRoute(doc.name)"
              >{{ __('See this order’s bills in Gastos') }}</RouterLink
            >
          </section>

          <section
            v-if="data.followups?.rows?.length"
            class="px-4"
            aria-labelledby="orden-seguimiento"
          >
            <h2
              id="orden-seguimiento"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Assigned', null, 'Compras') }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="task in data.followups.rows"
                :key="task.name"
                class="flex min-h-14 min-w-0 items-center gap-3 py-2"
              >
                <span
                  class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                  aria-hidden="true"
                >
                  <span class="lucide-list-checks size-5" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="break-words text-base text-ink-gray-9">{{
                    task.description
                  }}</span>
                  <span class="text-sm text-ink-gray-6">{{
                    formatDay(task.date)
                  }}</span>
                </span>
              </li>
            </ul>
          </section>

          <ArchivosRegistroPanel
            v-if="archivosEnabled"
            class="px-4"
            doctype="Purchase Order"
            :name="doc.name"
            :return-to="`/crm${route.fullPath}`"
            :return-label="__('Compras', null, 'Compras')"
          />
          <!-- Shell SPEC §6 DD2: the engine's «Creado desde», Conexiones,
               Actividad and the sheets behind «⋯». -->
          <RecordKit :kit="kit" :title="doc.party || ''" />
        </aside>
      </div>
    </div>

    <!-- «Revisar y confirmar»: what is committed with the supplier. -->
    <ConfirmSheet
      v-model:open="reviewOpen"
      :copy="reviewCopy"
      :busy="busy"
      :error="reviewError"
      @confirm="confirm"
    />

    <HandoffDialog
      v-if="!isNew"
      v-model="handoff.open"
      doctype="Purchase Order"
      :name="doc.name || ''"
      :action="handoff.action"
      :title="handoff.title"
      :reason="handoff.reason"
      @sent="load"
    />
  </div>
</template>
<script setup>
import {
  computed,
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { FormControl, toast } from 'frappe-ui'
import { ArchivosRegistroPanel } from '@/components/archivos'
import { AppBar, EmptyState, StatusChip } from '@/components/ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import HandoffDialog from '@/components/compras/HandoffDialog.vue'
import ApprovalAsk from '@/components/pendientes/ApprovalAsk.vue'
import ConfirmSheet from '@/components/documentos/ConfirmSheet.vue'
import DatosList from '@/components/documentos/DatosList.vue'
import DocTotals from '@/components/documentos/DocTotals.vue'
import RecordIsland from '@/components/documentos/RecordIsland.vue'
import BillAlmacen from '@/components/gastos/BillAlmacen.vue'
import { isMobile } from '@/composables/breakpoint'
import { etiquetasHref } from '@/composables/useEtiquetas'
import { recordActionsFor } from '@/documentos/acciones'
import { BTN } from '@/documentos/tools'
import { shellBoot } from '@/composables/muelleShell'
import { appleKeys, registerPageShortcuts } from '@/composables/shellKeyboard'
import { hoyLive } from '@/composables/useHoy'
import { isTypingTarget, moduleEnabled } from '@/vendor/muelle-shell/contracts'
import { useLiveWatch } from '@/vendor/muelle-shell/live-sync/vue'
import { keyAction } from '@/utils/powerList'
import { orderBillsRoute } from '@/composables/useGastos'
import { can } from '@/vendor/muelle-shell/contracts'
import { formatDay } from '@/utils/contactos'
import { dayDiff, formatQty, parseServerDate } from '@/utils/display'
import StageSteps from '@/components/documentos/StageSteps.vue'
import RecordKit from '@/components/documentos/compras/RecordKit.vue'
import { useRecordKit } from '@/components/documentos/compras/recordKit'
import { documentRoute } from '@/documentos/registry'
import {
  MISSING_LABELS,
  RECORD_KEYS,
  billRoute,
  clearDraft,
  comprasApi,
  comprasBoot,
  createOrder,
  followDestination,
  loadComprasBoot,
  loadDraft,
  loadWholeOrder,
  missingFields,
  money,
  orderPayload,
  outcomeUnknown,
  parseDone,
  pendingSave,
  prefillFromQuery,
  prefillLine,
  problemOf,
  reapplyRows,
  returnWithDone,
  qty,
  recordShortcuts,
  requestId,
  safeReturn,
  saveDraft,
  scannerReceiptUrl,
  statusLabel,
} from '@/composables/useCompras'
import LucideTrash2 from '~icons/lucide/trash-2'

const props = defineProps({ name: { type: String, default: '' } })
const route = useRoute()
const router = useRouter()
const boot = comprasBoot
const phone = isMobile
const isNew = computed(() => !props.name)
// Supplier bills of this order: for bill readers (an employee filing expenses has Gastos too).
const gastosOn = computed(() => can(shellBoot.value, 'gastos', 'read'))
// Files on this record come from Archivos when the worker has it.
const archivosEnabled = computed(() =>
  moduleEnabled(shellBoot.value, 'archivos'),
)
const data = ref({})
const rows = ref([])
const loading = ref(false)
const loaded = ref(false)
const busy = ref(false)
const problem = ref(null)
const guard = ref(null)
const editing = ref(false)
const triedSave = ref(false)
// A new purchase starts empty: no red until the user tries to save.
const showMissing = computed(() => triedSave.value || !isNew.value)
const reviewOpen = ref(false)
const conflict = ref(null)
const doneNotice = ref('')
const draftNotice = ref('')
const companies = ref([])
const handoff = reactive({ open: false, action: '', title: '', reason: '' })
const pending = { save: null, confirm: null, receive: null, bill: null }
let lastCall = null
let rowKey = 0

const blankForm = () => ({
  name: '',
  modified: '',
  supplier:
    typeof route.query.supplier === 'string' ? route.query.supplier : '',
  supplier_label: '',
  company: boot.value?.default_company || '',
  schedule_date: '',
  set_warehouse: prefillFromQuery(route.query).warehouse,
  items: [],
})
const form = reactive(blankForm())
const doc = computed(() => data.value.document || {})
// The engine's shared record parts (Shell SPEC §6 DD2/DD5): loaded after paint.
const kit = useRecordKit('Purchase Order', {
  name: () => props.name,
  title: () => doc.value.party || '',
  modified: () => doc.value.modified,
  changed: () => load(),
})
// A delivery that should have arrived and has not (SPEC §5): red, with the days.
const lateDays = computed(() => {
  const d = doc.value
  if (Number(d.docstatus) !== 1 || Number(d.per_received) >= 100) return 0
  if (['Closed', 'Completed', 'On Hold'].includes(d.status)) return 0
  const date = parseServerDate(d.schedule_date)
  const diff = date ? dayDiff(date) : 0
  return diff < 0 ? -diff : 0
})
const missing = computed(() => missingFields(form))
const missingText = computed(() =>
  missing.value
    .map((key) => __(MISSING_LABELS[key], null, 'Compras'))
    .join(', '),
)
const companyOptions = computed(() => [
  { label: __('Choose a company'), value: '' },
  ...companies.value.map((c) => ({ label: c.label, value: c.value })),
])
const primary = computed(() =>
  (data.value.actions || []).find((action) => action.primary),
)
// The other next steps (registering the bill while goods still arrive).
const secondary = computed(() =>
  (data.value.actions || []).filter(
    (action) =>
      !action.primary &&
      action.key === 'bill' &&
      (action.allowed || action.resolve),
  ),
)
// The queue this order was opened from, kept through Escáner and Gastos.
const listQuery = computed(() =>
  typeof route.query.list === 'string' &&
  (route.query.list.startsWith('/compras') ||
    route.query.list.startsWith('/documentos/'))
    ? route.query.list
    : '',
)
const returnHere = computed(() => {
  const path = `/crm/compras/orden/${encodeURIComponent(props.name)}`
  return listQuery.value
    ? `${path}?${new URLSearchParams({ list: listQuery.value })}`
    : path
})
const doneBill = ref('')

// ── the bar: the supplier, the order's state and its number ──────────────
const title = computed(() => {
  if (isNew.value) return __('New purchase')
  return loaded.value
    ? doc.value.party || __('Supplier not visible')
    : __('Compras', null, 'Compras')
})
const kindLine = computed(() => __('Purchase order {0}', [doc.value.name]))
const chip = computed(() => {
  const label = statusLabel(doc.value)
  const docstatus = Number(doc.value.docstatus)
  if (docstatus === 0) return { label, tone: 'warning' }
  if (docstatus === 2) return { label, tone: 'neutral' }
  if (lateDays.value) return { label, tone: 'danger' }
  if (doc.value.status === 'On Hold') return { label, tone: 'warning' }
  if (['Completed', 'Closed'].includes(doc.value.status))
    return { label, tone: 'success' }
  return { label, tone: 'info' }
})
const lateText = computed(() =>
  lateDays.value === 1
    ? __('1 day late', null, 'Compras')
    : __('{0} days late', [lateDays.value], 'Compras'),
)

// ── the hero's steps: the engine's next step first (filled), then billing,
// receiving without Escáner, editing and printing (tonal) ─────────────────
const STEP_ICONS = {
  confirm: 'lucide-check',
  receive: 'lucide-scan-barcode',
  bill: 'lucide-receipt',
  edit: 'lucide-pencil',
}
const canEdit = computed(
  () => !!doc.value.can_write && Number(doc.value.docstatus) === 0,
)
const canPrint = computed(() => !!kit.record.value?.actions?.print?.allowed)
const nextSteps = computed(() => {
  const out = []
  const p = primary.value
  if (p?.allowed)
    out.push({
      key: p.key,
      label: p.label,
      icon: STEP_ICONS[p.key] || 'lucide-check',
      busy: true,
      run: () => runAction(p),
    })
  else if (p?.resolve)
    out.push({
      key: `resolve-${p.key}`,
      label: p.resolve.label,
      icon: p.resolve.kind === 'edit' ? 'lucide-pencil' : 'lucide-send',
      run: () => resolve(p),
    })
  if (p && !p.allowed && p.resolve?.recheck)
    out.push({
      key: 'recheck',
      label: __('Check again'),
      icon: 'lucide-refresh-cw',
      run: recheck,
    })
  // Escáner is not ready here: the receipt can still be made in Muelle, as
  // a draft from ERPNext's mapper (the engine's «Recibir»).
  if (receiveHere.value)
    out.push({
      key: 'receive-here',
      label: __('Receive without Escáner'),
      icon: 'lucide-truck',
      testid: 'compra-recibir-aqui',
      run: receiveInMuelle,
    })
  for (const action of secondary.value)
    out.push({
      key: action.key,
      label: action.allowed ? action.label : action.resolve?.label,
      icon: STEP_ICONS[action.key] || 'lucide-send',
      busy: true,
      run: () => (action.allowed ? runAction(action) : resolve(action)),
    })
  if (canEdit.value && p?.resolve?.kind !== 'edit')
    out.push({
      key: 'edit',
      label: __('Edit purchase'),
      icon: 'lucide-pencil',
      run: startEditing,
    })
  if (canPrint.value)
    out.push({
      key: 'print',
      label: __('Print', null, 'Compras'),
      icon: 'lucide-printer',
      run: () => kit.onTool('print'),
    })
  return out
})

// ── lines: the first ones, the rest on «Mostrar» ─────────────────────────
const ROWS_SHOWN = 8
const allRows = ref(false)
const shownRows = computed(() =>
  allRows.value || rows.value.length <= ROWS_SHOWN + 1
    ? rows.value
    : rows.value.slice(0, ROWS_SHOWN),
)

// ── the order's data as rows; Datos lists the rest ───────────────────────
const DATOS_SHOWN = [
  'supplier',
  'supplier_name',
  'company',
  'set_warehouse',
  'schedule_date',
  'transaction_date',
  'grand_total',
  'rounded_total',
  'status',
  'per_received',
  'per_billed',
]
const facts = computed(() => {
  const d = doc.value
  const out = []
  if (d.set_warehouse)
    out.push({
      key: 'almacen',
      icon: 'lucide-warehouse',
      label: __('Destination warehouse', null, 'Compras'),
      value: d.set_warehouse,
    })
  if (d.schedule_date)
    out.push({
      key: 'entrega',
      icon: 'lucide-calendar-clock',
      label: __('Delivery date', null, 'Compras'),
      value: formatDay(d.schedule_date),
    })
  if (data.value.requests?.length)
    out.push({
      key: 'solicitudes',
      icon: 'lucide-clipboard-list',
      label: __('From requests'),
      links: data.value.requests.map((mr) => ({
        name: mr.name,
        to: { name: 'CompraSolicitud', params: { name: mr.name } },
      })),
    })
  if (d.company)
    out.push({
      key: 'empresa',
      icon: 'lucide-store',
      label: __('Company', null, 'Compras'),
      value: d.company,
    })
  return out
})
function billState(b) {
  if (Number(b.docstatus) === 0) return __('draft, to register', null, 'Compras')
  if (Number(b.outstanding_amount) > 0)
    return __('{0} to pay', [money(b.outstanding_amount, b.currency)])
  return __('paid', null, 'Compras')
}

// ── Escáner's side: receipts open in Escáner with the way back; labels ───
const labelsOn = computed(() => moduleEnabled(shellBoot.value, 'productos'))
const almacenRows = computed(() => {
  if (isNew.value || !doc.value.name) return []
  const out = (data.value.receipts?.rows || []).map((receipt) => ({
    key: `pr:${receipt.name}`,
    icon: 'lucide-truck',
    title: receipt.name,
    subtitle: [
      Number(receipt.docstatus) === 1
        ? __('confirmed', null, 'Compras')
        : __('draft, not stock yet'),
      formatDay(receipt.posting_date),
    ]
      .filter(Boolean)
      .join(' · '),
    href: scannerReceiptUrl(receipt.name, doc.value.name),
  }))
  if (!out.length && Number(doc.value.docstatus) === 1)
    out.push({
      key: 'sin-recepcion',
      icon: 'lucide-truck',
      title: __('Receipts', null, 'Compras'),
      reason: __('Nothing received yet.'),
    })
  if (labelsOn.value && Number(doc.value.docstatus) === 1)
    out.push({
      key: 'etiquetas',
      icon: 'lucide-tag',
      title: __('Print labels'),
      subtitle: __('One per piece on this order'),
      labels: true,
    })
  return out
})

// ── the bolt: the hero's steps and labels; «⋯» keeps print, share, mail ──
const boltSteps = computed(() => {
  const out = nextSteps.value.filter((step) => step.key !== 'edit')
  if (almacenRows.value.some((row) => row.labels))
    out.push({
      label: __('Print labels'),
      icon: 'lucide-tag',
      run: () =>
        router.push(
          etiquetasHref([], { desde: `Purchase Order:${doc.value.name}` }),
        ),
    })
  return out
})
const boltGroups = computed(() =>
  recordActionsFor({
    steps: boltSteps.value,
    canEdit: canEdit.value,
    tools: kit.tools.value,
  }),
)
function onBolt({ key }) {
  if (key === 'editar') startEditing()
  else if (key.startsWith('paso:')) boltSteps.value[Number(key.slice(5))]?.run()
  else kit.onTool(key)
}
function mail() {
  const action = kit.record.value?.actions?.email
  if (action?.allowed) kit.onTool('correo')
  else
    toast.error(action?.reason || __('This purchase cannot be sent by email.'))
}

// «Revisar y confirmar»: what is committed with the supplier, in one sentence.
const reviewCopy = computed(() => ({
  title: __('Review and confirm'),
  message: [
    __('{0}: {1} for {2} item(s), to {3}, delivery {4}.', [
      doc.value.party || doc.value.name,
      `${money(doc.value.grand_total, doc.value.currency)} (${doc.value.currency || ''})`,
      data.value.rows_scope?.total ?? rows.value.length,
      doc.value.set_warehouse || __('per item'),
      formatDay(doc.value.schedule_date) || '—',
    ]),
    __(
      'Confirming commits this purchase with the supplier. Stock moves only when goods are received.',
    ),
  ].join(' '),
  confirm: __('Confirm purchase'),
  back: __('Back', null, 'Compras'),
}))
// Never confirm from an incomplete review: every line has to be loaded.
const reviewError = computed(() =>
  data.value.rows_scope?.has_more
    ? __('Some items are still loading. Show them all before confirming.')
    : '',
)
const summaryLine = computed(() => {
  const s = data.value.summary
  if (!s || Number(doc.value.docstatus) !== 1) return ''
  if (s.ordered_qty === null || s.ordered_qty === undefined)
    return __('{0}% received · {1} item(s) pending', [
      qty(s.per_received),
      s.rows_pending,
    ])
  const unit = s.uom ? ` ${s.uom}` : ''
  return s.remaining_qty > 0
    ? __('Received {0} of {1}; {2} missing', [
        qty(s.received_qty),
        qty(s.ordered_qty) + unit,
        qty(s.remaining_qty),
      ])
    : __('Received {0} of {1}; nothing missing', [
        qty(s.received_qty),
        qty(s.ordered_qty) + unit,
      ])
})
const returnTo = computed(() => safeReturn(route.query.return_to))
const fromApprovals = computed(() =>
  /^\/crm\/pendientes(\?|$)/.test(returnTo.value || ''),
)
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        String(route.query.return_label || 'Compras').slice(0, 40),
      ])
    : __('Compras', null, 'Compras'),
)
const draftKey = computed(
  () => `${boot.value?.user || ''}:${props.name || 'new'}`,
)

function rowProgress(row) {
  const unit = row.uom ? ` ${row.uom}` : ''
  const parts = [
    __('Received {0} of {1}', [qty(row.received_qty), qty(row.qty) + unit]),
  ]
  if (row.in_receipt_qty)
    parts.push(__('{0} counted in a draft receipt', [qty(row.in_receipt_qty)]))
  parts.push(
    row.remaining_qty > 0
      ? __('{0} missing', [qty(row.remaining_qty)])
      : __('complete', null, 'Compras'),
  )
  return parts.join(' · ')
}

function formFrom(payload) {
  const document = payload.document || {}
  return {
    name: document.name,
    modified: document.modified,
    supplier: document.supplier || '',
    supplier_label: document.party || '',
    company: document.company || '',
    schedule_date: document.schedule_date || '',
    set_warehouse: document.set_warehouse || '',
    row_total: rows.value.length,
    items: rows.value.map((row) => ({
      key: ++rowKey,
      name: row.name,
      item_code: row.item_code,
      item_label: row.item_name,
      qty: row.qty,
      uom: row.uom,
      uoms: [
        { uom: row.uom, factor: row.conversion_factor },
        ...(row.stock_uom !== row.uom
          ? [{ uom: row.stock_uom, factor: 1 }]
          : []),
      ],
      rate: row.rate,
      warehouse: row.warehouse || '',
      material_request: row.material_request,
      tracked: row.tracked,
    })),
  }
}

async function load() {
  if (isNew.value) {
    loaded.value = true
    editing.value = true
    offerDraft()
    return
  }
  loading.value = true
  problem.value = null
  guard.value = null
  try {
    // Never confirm or edit from an incomplete review: every row page is loaded.
    const payload = await loadWholeOrder(comprasApi, props.name)
    data.value = payload
    rows.value = payload.rows
    loaded.value = true
    if (!editing.value) Object.assign(form, formFrom(payload))
    offerDraft()
  } catch (error) {
    const p = problemOf(error)
    if (!loaded.value)
      guard.value = {
        title:
          p.kind === 'permission'
            ? __('You cannot open this purchase')
            : __('Could not open this purchase'),
        detail: p.detail,
      }
    else problem.value = p
  } finally {
    loading.value = false
  }
}
function loadMoreRows() {
  load()
}

function offerDraft() {
  const stored = loadDraft(draftKey.value)
  if (!stored) return
  if (!isNew.value && stored.form.modified !== doc.value.modified) {
    draftNotice.value = __(
      'You have unsaved changes from {0} min ago, made on an older version.',
      [Math.max(1, Math.round((Date.now() - stored.at) / 60000))],
    )
  } else {
    draftNotice.value = __('You have unsaved changes from {0} min ago.', [
      Math.max(1, Math.round((Date.now() - stored.at) / 60000)),
    ])
  }
}
function recoverDraft() {
  const stored = loadDraft(draftKey.value)
  if (stored) Object.assign(form, stored.form)
  draftNotice.value = ''
  editing.value = true
}
function discardDraft() {
  clearDraft(draftKey.value)
  draftNotice.value = ''
}

watch(
  form,
  () => {
    if (editing.value && loaded.value) saveDraft(draftKey.value, form)
  },
  { deep: true },
)
// One destination: rows that followed the previous one follow the new one.
watch(
  () => form.set_warehouse,
  (next, previous) => {
    if (editing.value) followDestination(form.items, previous, next)
  },
)

function startEditing() {
  Object.assign(form, formFrom(data.value))
  editing.value = true
}
function cancelEditing() {
  clearDraft(draftKey.value)
  editing.value = false
  Object.assign(form, formFrom(data.value))
}
function addItem(option) {
  const existing = form.items.find(
    (row) => row.item_code === option.value && !row.name,
  )
  if (existing) {
    existing.qty = Number(existing.qty || 0) + 1
    return
  }
  form.items.push({
    key: ++rowKey,
    name: '',
    item_code: option.value,
    item_label: option.label,
    qty: 1,
    uom: option.uom,
    uoms: option.uoms,
    rate: '',
    warehouse: '',
    tracked: option.tracked,
  })
}

async function call(kind, method, args) {
  // One id per user action; a retry after a lost answer reuses it.
  pending[kind] ||= requestId()
  lastCall = { kind, method, args }
  busy.value = true
  problem.value = null
  try {
    const result = await comprasApi(method, {
      request_id: pending[kind],
      ...args,
    })
    pending[kind] = null
    return result
  } catch (error) {
    // Same id while the outcome is unknown; a definite answer frees it.
    if (!outcomeUnknown(error)) pending[kind] = null
    problem.value = problemOf(error)
    throw error
  } finally {
    busy.value = false
  }
}
function retryLast() {
  if (!lastCall) return load()
  if (lastCall.kind === 'save') return save()
  if (lastCall.kind === 'confirm') return confirm()
  if (lastCall.kind === 'receive') return receive()
  if (lastCall.kind === 'bill') return startBill()
}

async function save() {
  triedSave.value = true
  // A creation already sent is re-asked as sent, whatever the form shows now.
  const resending = isNew.value && Boolean(pendingSave(draftKey.value))
  if (
    !resending &&
    missing.value.some((key) =>
      ['supplier', 'company', 'items', 'qty'].includes(key),
    )
  ) {
    problem.value = {
      kind: 'error',
      title: __('Not saved yet'),
      detail: __('Missing: {0}.', [missingText.value]),
    }
    return
  }
  let result
  try {
    result = isNew.value
      ? await createNew()
      : await call('save', 'save_order', { data: orderPayload(form) })
  } catch {
    return
  }
  clearDraft(draftKey.value)
  editing.value = false
  conflict.value = null
  toast.success(__('Purchase saved'))
  if (result.resent)
    toast.warning(
      __(
        'The purchase was saved as first sent; changes made afterwards were not included. Review it.',
      ),
    )
  if (result.party_refreshed)
    toast.warning(
      __(
        'New supplier: its currency, taxes and address were applied. Review prices before confirming.',
      ),
    )
  if (isNew.value) {
    await router.replace({
      name: 'CompraOrden',
      params: { name: result.name },
      query: route.query,
    })
    return
  }
  await load()
}

/** A new purchase is one stored operation until the server answers, so a lost
 *  answer plus a reload asks about the same purchase instead of making two. */
async function createNew() {
  busy.value = true
  problem.value = null
  lastCall = { kind: 'save' }
  try {
    return await createOrder(comprasApi, draftKey.value, form)
  } catch (error) {
    problem.value = problemOf(error)
    throw error
  } finally {
    busy.value = false
  }
}

async function confirm() {
  if (reviewError.value) return
  try {
    const result = await call('confirm', 'confirm_order', {
      name: doc.value.name,
      modified: doc.value.modified,
    })
    reviewOpen.value = false
    toast.success(
      result.already
        ? __('This purchase was already confirmed')
        : __('Purchase confirmed. It now waits in To receive.'),
    )
    // Opened from Pendientes «Por aprobar»: the decision is taken; back to the list.
    if (fromApprovals.value) return goBack()
    await load()
  } catch {
    reviewOpen.value = false
  }
}

async function receive() {
  try {
    const result = await call('receive', 'start_receipt', {
      name: doc.value.name,
    })
    window.location.assign(
      scannerReceiptUrl(result.receipt, doc.value.name, listQuery.value),
    )
  } catch {
    /* problem shown */
  }
}

/** «Registrar factura del proveedor»: the draft bill in Gastos; registering it comes back here. */
async function startBill() {
  try {
    const result = await call('bill', 'start_bill', { name: doc.value.name })
    router.push(billRoute(result.bill, returnHere.value))
  } catch {
    /* problem shown, with «Ask for help» on a permission refusal */
  }
}

function runAction(action) {
  if (action.key === 'confirm') {
    if (editing.value) return
    reviewOpen.value = true
  } else if (action.key === 'receive') receive()
  else if (action.key === 'bill') startBill()
  else if (action.key === 'edit') startEditing()
}
// Receiving without Escáner: when it is the blocked next step and the worker may
// create receipts (the engine record says so: actions.make_purchase_receipt).
const receiveHere = computed(
  () =>
    primary.value?.key === 'receive' &&
    !primary.value.allowed &&
    kit.record.value?.actions?.make_purchase_receipt?.allowed === true,
)
function receiveInMuelle() {
  const to = documentRoute('Purchase Receipt', 'nuevo')
  if (!to) return
  router.push({
    path: to.path,
    query: {
      origen: 'Purchase Order',
      desde: props.name,
      con: 'purchase_receipt',
    },
  })
}
function resolve(action) {
  const fix = action.resolve
  if (!fix) return
  if (fix.kind === 'edit') return startEditing()
  if (fix.kind === 'handoff') openHandoff(fix.action, fix.label, action.reason)
}
function openHandoff(action, title, reason) {
  Object.assign(handoff, { open: true, action, title, reason })
}
async function recheck() {
  await loadComprasBoot({ refresh: true })
  await load()
}

async function compare() {
  const mine = { ...form, items: form.items.map((row) => ({ ...row })) }
  let current
  try {
    current = await loadWholeOrder(comprasApi, props.name)
  } catch (error) {
    problem.value = problemOf(error)
    return
  }
  const document = current.document || {}
  const diffs = [
    [
      __('Supplier', null, 'Compras'),
      mine.supplier_label || mine.supplier,
      document.party,
    ],
    [__('Company', null, 'Compras'), mine.company, document.company],
    [
      __('Destination warehouse', null, 'Compras'),
      mine.set_warehouse,
      document.set_warehouse,
    ],
    [
      __('Delivery date', null, 'Compras'),
      mine.schedule_date,
      document.schedule_date,
    ],
    [
      __('Items', null, 'Compras'),
      mine.items.length,
      current.rows_scope?.total,
    ],
    [
      __('Quantities', null, 'Compras'),
      mine.items.map((row) => `${row.item_code}×${row.qty}`).join(', '),
      current.rows.map((row) => `${row.item_code}×${row.qty}`).join(', '),
    ],
  ]
    .filter(([, a, b]) => String(a ?? '') !== String(b ?? ''))
    .map(([label, a, b]) => ({ label, mine: a, current: b }))
  conflict.value = { diffs, current, mine }
  problem.value = null
}
function useCurrent() {
  data.value = conflict.value.current
  rows.value = conflict.value.current.rows
  clearDraft(draftKey.value)
  conflict.value = null
  editing.value = false
  Object.assign(form, formFrom(data.value))
}
function reapply() {
  const current = conflict.value.current
  data.value = current
  rows.value = current.rows
  // Rows the other person removed come back as new rows of the same item,
  // except rows of a purchase request: those are listed, never recreated
  // without their link.
  const { items, dropped } = reapplyRows(form.items, current.rows)
  form.items = items
  form.modified = current.document.modified
  form.row_total = current.rows.length
  conflict.value = null
  editing.value = true
  if (dropped.length) {
    problem.value = {
      kind: 'error',
      title: __('Review before saving'),
      detail: __(
        'These request rows were removed by someone else and were not added back: {0}. Prepare them again from their request if they are still needed.',
        [
          dropped
            .map((row) => `${row.item_code} (${row.material_request})`)
            .join(', '),
        ],
      ),
    }
    return
  }
  save()
}

// «Revisada»: the review asked of me is answered without confirming anything;
// who asked hears it. From another list, back there with `done`.
function reviewed() {
  toast.success(__('Review answered. We told who asked.'))
  if (returnTo.value) return goBack()
}

function onBack(event) {
  event?.preventDefault?.()
  goBack()
}
function goBack() {
  // Pendientes is in this SPA: back without reloading the shell.
  if (fromApprovals.value)
    return router.push(
      returnWithDone(returnTo.value, 'Purchase Order', doc.value.name).slice(4),
    )
  if (returnTo.value)
    return window.location.assign(
      returnWithDone(returnTo.value, 'Purchase Order', doc.value.name),
    )
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  if (list.startsWith('/compras') || list.startsWith('/documentos/'))
    return router.push(list)
  router.push({ name: 'Compras' })
}

async function handleDone() {
  const done = parseDone(route.query.done)
  if (!done) return
  doneBill.value = done.doctype === 'Purchase Invoice' ? done.name : ''
  doneNotice.value =
    done.doctype === 'Purchase Receipt'
      ? __(
          'Receipt {0} confirmed. Stock is updated; see what is still missing below.',
          [done.name],
        )
      : done.doctype === 'Purchase Invoice'
        ? __('Bill {0} registered. Pay it from Gastos when it is due.', [
            done.name,
          ])
        : __('{0} saved.', [done.name])
  const query = { ...route.query }
  delete query.done
  router.replace({ query })
}

watch(
  () => props.name,
  () => {
    loaded.value = false
    editing.value = false
    allRows.value = false
    data.value = {}
    rows.value = []
    load()
  },
)
onMounted(async () => {
  await loadComprasBoot()
  if (!boot.value?.enabled) {
    guard.value = {
      title: __('Compras is not available'),
      detail:
        boot.value?.reason ||
        __(
          'Ask your manager for access to purchase orders or purchase requests.',
        ),
    }
    return
  }
  if (isNew.value) Object.assign(form, blankForm())
  if (isNew.value && pendingSave(draftKey.value)) {
    // A creation was sent before this reload and never answered: ask the
    // server about that same operation before allowing another.
    const stored = loadDraft(draftKey.value)
    if (stored) Object.assign(form, stored.form)
    loaded.value = true
    editing.value = true
    await save()
    return
  }
  comprasApi('companies')
    .then((rows) => {
      companies.value = rows
      if (!form.company && rows.length === 1) form.company = rows[0].value
    })
    .catch(() => {})
  // «Pedir» from Productos: start with that product, store and quantity.
  const prefill = prefillFromQuery(route.query)
  if (isNew.value && prefill.item && !form.items.length)
    comprasApi('items', { search: prefill.item })
      .then((options) => {
        const option = options.find((row) => row.value === prefill.item)
        if (!option || form.items.length) return
        addItem(option)
        // Productos sends the stock-unit quantity; the line says both units.
        if (Number(route.query.qty) > 0) {
          const line = prefillLine(option, prefill.qty)
          Object.assign(form.items[0], line, { note_for: line })
        }
      })
      .catch(() => {})
  await handleDone()
  await load()
  await openFromList()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// «Revisar y confirmar» handed over by the list (key O): opened once.
async function openFromList() {
  if (route.query.accion !== 'confirmar') return
  const query = { ...route.query }
  delete query.accion
  // A sheet closes on navigation: the query settles before it opens.
  await router.replace({ query })
  if (primary.value?.key !== 'confirm') return
  if (primary.value.allowed) reviewOpen.value = true
  // Missing data or not this worker's to confirm: its own way out.
  else if (primary.value.resolve) resolve(primary.value)
}

// ── keyboard: the order's next steps, never while typing or under a dialog ─
registerPageShortcuts(null, () =>
  isNew.value ? [] : recordShortcuts(boot.value?.capabilities),
)
function onKey(event) {
  if (event.defaultPrevented || isNew.value || editing.value || !loaded.value)
    return
  if (document.querySelector('[aria-modal="true"], [role="dialog"]')) return
  const action = keyAction(event, RECORD_KEYS, { apple: appleKeys })
  if (!action || isTypingTarget(event.target)) return
  event.preventDefault()
  if (action === 'back') return goBack()
  const step = (data.value.actions || []).find((a) => a.key === action)
  if (!step)
    return toast.success(
      {
        confirm: __('This purchase is already confirmed.'),
        receive: __('Nothing left to receive on this purchase.'),
        bill: __('Nothing to bill on this purchase yet.'),
      }[action],
    )
  if (step.allowed) runAction(step)
  else if (step.resolve) resolve(step)
}
window.addEventListener('keydown', onKey)

// ── live: Escáner counting, a receipt or a bill made elsewhere shows here ──
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
useLiveWatch(
  hoyLive(socket),
  ['Purchase Order', 'Purchase Receipt', 'Purchase Invoice'],
  () => {
    // Never under the worker's hands: the editor and open dialogs keep their input.
    if (isNew.value || editing.value || busy.value || reviewOpen.value) return
    if (handoff.open || conflict.value || problem.value) return
    load()
  },
  { minIntervalMs: 3000 },
)
</script>
<style scoped>
/* 44 px company and date fields on a phone, like the pickers beside them. */
@media (max-width: 639px) {
  .compra-fields :deep(select),
  .compra-fields :deep([role='combobox']),
  .compra-fields :deep(input) {
    min-height: 44px;
    font-size: 1rem;
  }
}
</style>
