<template>
  <!-- A warranty or return case (Shell look, record-header): the bar names
       the customer with the case's state, kind and number; the island
       reaches them, the bolt holds the next steps and «⋯» every tool. The
       hero says what they report and offers the one filled step (repair it,
       link the return, resolve…) with the others tonal. Then the proof of
       purchase, the warranty, the outcome and the supplier; who is on it,
       its pendientes and Actividad sit beside them on a desk. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      :back="true"
      :back-label="backLabel"
      :title="claim?.customer_name || ''"
      :bell="isPhone"
      @back="onBack"
    >
      <template v-if="claim" #title>
        <div class="flex min-h-12 min-w-0 flex-col justify-center px-3">
          <span
            class="title-face line-clamp-2 break-words text-xl font-semibold leading-tight [text-wrap:balance]"
            data-appbar-title
            >{{ claim.customer_name }}</span
          >
          <span class="flex min-w-0 items-center gap-2 pt-0.5">
            <StatusChip
              :label="stateLabel(claim.state)"
              :tone="chipTone"
              data-testid="garantia-status"
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              [kindLabel(claim.kind), claim.name].filter(Boolean).join(' · ')
            }}</span>
          </span>
        </div>
      </template>
      <template #actions>
        <RecordIsland
          v-if="claim"
          :reach="kit.record.value?.header?.reach || {}"
          :who="claim.customer_name || ''"
          :mail="kit.record.value?.actions?.email || null"
          :groups="boltGroups"
          :phone="isPhone"
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
        :action="__('Retry', null, 'Garantías')"
        @action="load"
      />
      <EmptyState
        v-else-if="!claim"
        role="status"
        state="loading"
        :title="__('Loading case…')"
      />

      <div
        v-else
        class="mx-auto grid w-full max-w-6xl gap-x-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div class="flex min-w-0 flex-col gap-5 pt-4">
          <div
            v-if="notice"
            role="status"
            class="mx-4 rounded-6 bg-surface-green-1 p-3 text-base text-ink-green-8"
          >
            {{ notice }}
          </div>
          <div
            v-if="problem"
            role="alert"
            class="mx-4 space-y-2 rounded-6 bg-surface-red-1 p-3 text-base text-ink-red-7"
          >
            <p>
              <strong>{{ problem.title }}.</strong> {{ problem.detail }}
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-if="problem.kind === 'conflict'"
                type="button"
                :class="['press', BTN.tonal]"
                @click="load"
              >
                <span class="lucide-refresh-cw size-5" aria-hidden="true" />
                {{ __('Refresh', null, 'Garantías') }}
              </button>
              <button
                v-if="problem.kind === 'permission' && claim.can_write"
                type="button"
                :class="['press', BTN.tonal]"
                @click="assigning = true"
              >
                <span class="lucide-user-plus size-5" aria-hidden="true" />
                {{ __('Assign to someone who can') }}
              </button>
            </div>
          </div>

          <!-- The hero: what the customer reports, about what, and the one
               next step with everything else this worker may do. -->
          <section
            class="flex flex-col gap-2 px-4"
            :aria-label="__('Next step', null, 'Compras')"
            data-testid="garantia-hero"
          >
            <p
              class="whitespace-pre-line break-words text-lg leading-snug text-ink-gray-9"
              data-testid="garantia-complaint"
            >
              {{ claim.complaint }}
            </p>
            <p class="break-words text-base text-ink-gray-7">
              {{
                [
                  claim.item_name || claim.item_code,
                  claim.serial_no,
                  claim.company,
                  formatDay(claim.complaint_date),
                ]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </p>
            <p
              v-if="(claim.remedy || claim.sla?.due) && !closed"
              class="flex flex-wrap items-center gap-2"
            >
              <StatusChip
                v-if="claim.remedy"
                :label="remedyLabel(claim.remedy)"
                tone="info"
              />
              <StatusChip
                v-if="claim.sla?.due"
                :label="dueLabel(claim.sla.due)"
                :tone="TONE[dueTheme(claim.sla.due)]"
              />
            </p>
            <div
              v-if="nextSteps.length"
              class="flex flex-wrap items-start gap-2 pt-2"
              data-testid="garantia-next"
            >
              <div
                v-for="step in shownSteps"
                :key="step.key"
                class="flex max-w-full flex-col gap-1"
              >
                <button
                  type="button"
                  :class="['press', step.filled ? BTN.filled : BTN.tonal]"
                  :disabled="busy && step.busy"
                  :aria-describedby="step.detail?.id"
                  :data-step="step.key"
                  @click="step.run()"
                >
                  <span
                    :class="[
                      busy && step.busy
                        ? 'lucide-loader-circle animate-spin'
                        : step.icon,
                      'size-5',
                    ]"
                    aria-hidden="true"
                  />
                  {{ step.label }}
                </button>
                <p
                  v-if="step.detail"
                  :id="step.detail.id"
                  class="break-words px-2 text-sm text-ink-gray-6"
                >
                  {{ step.detail.text }}
                </p>
              </div>
              <button
                v-if="hiddenSteps"
                type="button"
                :class="['press', BTN.text]"
                :aria-expanded="allSteps"
                data-testid="garantia-more"
                @click="allSteps = !allSteps"
              >
                <span
                  :class="[
                    allSteps ? 'lucide-chevron-up' : 'lucide-chevron-down',
                    'size-5',
                  ]"
                  aria-hidden="true"
                />
                {{ allSteps ? __('Fewer actions') : __('More actions') }}
              </button>
            </div>
            <div
              v-if="claim.can_write && !closed && (hints.length || laterLinks)"
              class="space-y-1 text-base text-ink-gray-7"
            >
              <p v-for="hint in hints" :key="hint">{{ hint }}</p>
              <p v-if="laterLinks" class="flex flex-wrap gap-2">
                <a
                  v-if="claim.repair?.intake"
                  :class="['press', BTN.text]"
                  :href="tallerIntakeUrl(claim.name)"
                  ><span class="lucide-wrench size-5" aria-hidden="true" />
                  {{ __('Receive it in Taller') }}</a
                >
                <button
                  v-if="linkable"
                  type="button"
                  :class="['press', BTN.text]"
                  @click="outcomeLinking = true"
                >
                  <span class="lucide-link size-5" aria-hidden="true" />
                  {{ __('Link outcome') }}
                </button>
                <button
                  v-if="
                    claim.repair?.pick_source && primary?.kind !== 'pick_source'
                  "
                  type="button"
                  :class="['press', BTN.text]"
                  @click="picking = true"
                >
                  <span class="lucide-shopping-bag size-5" aria-hidden="true" />
                  {{ __('Choose purchase') }}
                </button>
              </p>
            </div>
          </section>

          <!-- What it is about: the sale or order, its coverage, its outcome. -->
          <section class="px-4" aria-labelledby="garantia-compra">
            <h2
              id="garantia-compra"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Proof of purchase') }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li class="flex min-h-14 items-start gap-3 py-2">
                <span :class="ICON_TILE" aria-hidden="true">
                  <span class="lucide-receipt size-5" />
                </span>
                <div class="min-w-0 flex-1">
                  <template v-if="claim.against">
                    <p class="break-words text-base text-ink-gray-9">
                      {{ __(claim.against.doctype) }} {{ claim.against.name }}
                    </p>
                    <p
                      v-if="claim.against.readable"
                      class="break-words text-sm text-ink-gray-6"
                    >
                      {{
                        [
                          claim.against.title,
                          formatDay(claim.against.date),
                          claim.against.status,
                          claim.against.total !== undefined &&
                            money(claim.against.total, claim.against.currency),
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      }}
                    </p>
                    <p v-else class="text-sm text-ink-gray-6">
                      {{ __('You cannot open this document.') }}
                    </p>
                    <a
                      v-if="
                        claim.against.doctype === 'Repair Order' &&
                        claim.against.readable
                      "
                      :class="['press -ml-4 mt-1', BTN.text]"
                      :href="tallerOrderUrl(claim.against.name, claim.name)"
                      ><span
                        class="lucide-external-link size-5"
                        aria-hidden="true"
                      />
                      {{ __('Open in Taller') }}</a
                    >
                  </template>
                  <p v-else class="text-base text-ink-gray-6">
                    {{ __('No sale or repair order linked.') }}
                  </p>
                  <div
                    v-if="claim.return_review"
                    class="mt-2 space-y-1 text-sm text-ink-gray-7"
                  >
                    <p>
                      {{
                        __('Return review from register {0}: {1}', [
                          claim.return_review.pos_profile,
                          claim.return_review.reason,
                        ])
                      }}
                    </p>
                    <p>
                      {{
                        __('{0} line(s) requested', [claim.return_review.lines])
                      }}
                    </p>
                    <StatusChip
                      v-if="claim.return_review.needs_fiscal_review"
                      :label="__('Needs fiscal review')"
                      tone="warning"
                    />
                  </div>
                </div>
              </li>
              <li class="flex min-h-14 items-center gap-3 py-2">
                <span :class="ICON_TILE" aria-hidden="true">
                  <span class="lucide-shield size-5" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-ink-gray-6">
                    {{ __('Warranty', null, 'Garantías') }}
                  </p>
                  <p
                    v-if="claim.policy?.expires_on"
                    class="text-base"
                    :class="
                      claim.policy.within ? 'text-ink-gray-9' : 'text-ink-red-7'
                    "
                  >
                    {{
                      claim.policy.within
                        ? __('Covered until {0}', [claim.policy.expires_on])
                        : __('Expired on {0}', [claim.policy.expires_on])
                    }}
                  </p>
                  <p v-else class="text-base text-ink-gray-6">
                    {{
                      __(
                        'No warranty date on record. Check the sale or the order.',
                      )
                    }}
                  </p>
                </div>
              </li>
              <li
                v-if="claim.outcome || claim.resolution_details"
                class="flex min-h-14 items-start gap-3 py-2"
              >
                <span :class="ICON_TILE" aria-hidden="true">
                  <span class="lucide-circle-check size-5" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-ink-gray-6">
                    {{ __('Outcome', null, 'Garantías') }}
                  </p>
                  <p
                    v-if="claim.outcome"
                    class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-ink-gray-9"
                  >
                    <span class="break-words"
                      >{{ __(claim.outcome.doctype) }}
                      {{ claim.outcome.name }}</span
                    >
                    <span
                      v-if="claim.outcome.status"
                      class="text-sm text-ink-gray-6"
                      >{{ claim.outcome.status }}</span
                    >
                    <span
                      v-if="claim.outcome.technical_outcome"
                      class="text-sm text-ink-gray-6"
                      >{{ claim.outcome.technical_outcome }}</span
                    >
                    <StatusChip
                      v-if="claim.outcome.is_return"
                      :label="__('Return', null, 'Garantías')"
                      tone="neutral"
                    />
                    <StatusChip
                      v-if="claim.outcome.void"
                      :label="__('Cancelled, does not count')"
                      tone="danger"
                    />
                  </p>
                  <p
                    v-if="claim.resolution_details"
                    class="whitespace-pre-line break-words text-base text-ink-gray-8"
                  >
                    {{ claim.resolution_details }}
                  </p>
                  <p v-if="claim.resolved_by" class="text-sm text-ink-gray-6">
                    {{ __('Resolved by {0}', [claim.resolved_by]) }}
                  </p>
                </div>
              </li>
            </ul>
          </section>

          <!-- With the supplier: the RMA parts, the move and the credit. -->
          <section
            v-if="showSupplier"
            class="px-4"
            aria-labelledby="garantia-proveedor"
          >
            <h2
              id="garantia-proveedor"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Supplier', null, 'Garantías') }}
            </h2>
            <div class="space-y-2">
              <p
                v-if="claim.supplier.supplier"
                class="flex min-h-11 items-center gap-3 text-base text-ink-gray-9"
              >
                <span :class="ICON_TILE" aria-hidden="true">
                  <span class="lucide-truck size-5" />
                </span>
                {{ claim.supplier.supplier }}
              </p>
              <ul
                v-if="claim.supplier.rma_parts.length"
                class="divide-y divide-outline-gray-1"
              >
                <li
                  v-for="part in claim.supplier.rma_parts"
                  :key="part.stock_entry || part.item_name"
                  class="flex min-h-12 items-center gap-3 py-2 text-base"
                >
                  <span :class="ICON_TILE" aria-hidden="true">
                    <span class="lucide-package size-5" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block break-words text-ink-gray-9"
                      >{{ part.item_name }} × {{ part.qty }}</span
                    >
                    <span class="block break-words text-sm text-ink-gray-6"
                      >{{ __('in {0}', [part.warehouse]) }} ·
                      {{ part.repair_order }}</span
                    >
                  </span>
                </li>
              </ul>
              <p v-if="claim.supplier.hint" class="text-base text-ink-gray-7">
                {{ claim.supplier.hint }}
              </p>
              <a
                v-if="claim.supplier.rma_report"
                :class="['press -ml-4', BTN.text]"
                :href="`/app/query-report/${encodeURIComponent(claim.supplier.rma_report)}`"
                ><span class="lucide-file-text size-5" aria-hidden="true" />
                {{ __('Parts in RMA report') }}</a
              >
              <template v-if="claim.remedies?.rma">
                <p
                  v-if="claim.remedies.rma.moved"
                  class="text-base text-ink-gray-8"
                >
                  {{
                    __('In the RMA warehouse {0} ({1}).', [
                      claim.remedies.rma.warehouse,
                      claim.remedies.rma.moved,
                    ])
                  }}
                </p>
                <div
                  v-else-if="claim.remedies.rma.available"
                  class="flex flex-wrap items-center gap-2"
                >
                  <button
                    type="button"
                    :class="['press', BTN.tonal]"
                    :disabled="busy"
                    @click="moveToRma"
                  >
                    <span class="lucide-truck size-5" aria-hidden="true" />
                    {{ __('Move to RMA') }}
                  </button>
                  <span class="text-sm text-ink-gray-6">{{
                    __('From {0} to {1}', [
                      claim.remedies.rma.from,
                      claim.remedies.rma.to,
                    ])
                  }}</span>
                </div>
                <p v-else class="text-base text-ink-gray-7">
                  {{ claim.remedies.rma.reason }}
                  <a
                    v-if="claim.remedies.rma.next"
                    class="inline-block min-h-11 py-2 text-ink-blue-link underline"
                    :href="claim.remedies.rma.next.url"
                    >{{ claim.remedies.rma.next.label }}</a
                  >
                </p>
              </template>
              <template v-if="claim.remedies?.supplier_return">
                <p
                  v-if="claim.remedies.supplier_return.done"
                  class="text-base text-ink-gray-8"
                >
                  {{
                    __('Returned to the supplier: {0}', [
                      claim.remedies.supplier_return.done,
                    ])
                  }}
                </p>
                <p
                  v-if="claim.remedies.supplier_return.debit_note"
                  class="text-base text-ink-gray-8"
                >
                  {{
                    claim.remedies.supplier_return.debit_note.draft
                      ? __(
                          'Draft debit note {0}: accounting reviews and submits it; the case resolves when it is submitted.',
                          [claim.remedies.supplier_return.debit_note.name],
                        )
                      : __('Debit note {0} submitted.', [
                          claim.remedies.supplier_return.debit_note.name,
                        ])
                  }}
                </p>
                <div
                  v-if="claim.remedies.supplier_return.available"
                  class="flex flex-wrap items-end gap-2"
                >
                  <FormControl
                    v-model="purchaseReceipt"
                    type="select"
                    class="min-w-56"
                    :label="__('Purchase it came from')"
                    :placeholder="__('Choose an option')"
                    :options="
                      claim.remedies.supplier_return.purchases.map((p) => ({
                        label: [p.name, p.supplier_name, p.date]
                          .filter(Boolean)
                          .join(' · '),
                        value: p.name,
                      }))
                    "
                  />
                  <button
                    type="button"
                    :class="['press', BTN.tonal]"
                    :disabled="!purchaseReceipt || busy"
                    @click="supplierReturn"
                  >
                    <span class="lucide-check size-5" aria-hidden="true" />
                    {{ __('Supplier credited it') }}
                  </button>
                  <p
                    v-if="selectedPurchase?.debit_against"
                    class="basis-full text-sm text-ink-gray-6"
                  >
                    {{
                      __(
                        'Already invoiced: a draft debit note is prepared on invoice {0} for accounting.',
                        [selectedPurchase.debit_against],
                      )
                    }}
                  </p>
                </div>
                <p
                  v-else-if="claim.remedies.supplier_return.reason"
                  class="text-base text-ink-gray-7"
                >
                  {{ claim.remedies.supplier_return.reason }}
                </p>
              </template>
            </div>
          </section>
        </div>

        <aside class="flex min-w-0 flex-col gap-5 pt-5 lg:pt-4">
          <!-- Who is on it, and the last notice the customer got. -->
          <section class="px-4" aria-labelledby="garantia-asignada">
            <h2
              id="garantia-asignada"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              {{ __('Assigned to', null, 'Garantías') }}
            </h2>
            <button
              type="button"
              class="press flex min-h-14 w-full items-center gap-3 rounded-6 py-2 text-left [@media(hover:hover)]:hover:bg-surface-gray-1"
              :disabled="!claim.can_write"
              @click="assigning = true"
            >
              <span :class="ICON_TILE" aria-hidden="true">
                <span class="lucide-user-plus size-5" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="break-words text-base text-ink-gray-9">{{
                  claim.assignees.map((a) => a.full_name).join(', ') ||
                  __('Nobody yet')
                }}</span>
                <span
                  v-if="claim.last_send"
                  class="break-words text-sm text-ink-gray-6"
                  >{{
                    __('Last WhatsApp notice: {0}', [claim.last_send.label])
                  }}</span
                >
              </span>
              <span
                v-if="claim.can_write"
                class="lucide-chevron-right size-4 flex-none text-ink-gray-5"
                aria-hidden="true"
              />
            </button>
          </section>
          <!-- The claim's pendientes (Shell D8): who follows up, by when. -->
          <RecordPendientes
            class="px-4"
            reference-type="Warranty Claim"
            :reference-name="claim.name"
            :reference-label="`${claim.name} · ${claim.customer_name || ''}`"
            :return-label="__('Warranty', null, 'Garantías')"
          />
          <!-- Shell SPEC §6 DD2: «Creado desde», Conexiones, Actividad and the «⋯» sheets. -->
          <RecordKit
            :kit="kit"
            :title="`${claim.name} · ${claim.customer_name || ''}`"
          />
        </aside>
      </div>
    </div>

    <BottomSheet
      :open="repairing"
      :title="__('Repair in Taller')"
      :subtitle="claim?.customer_name || ''"
      :dismissible="!busy"
      @update:open="(value) => (repairing = value)"
    >
      <div class="space-y-4 pt-1">
        <FormControl
          v-model="repairForm.kind"
          type="select"
          :label="__('Charge', null, 'Garantías')"
          :options="[
            ...(claim?.repair?.warranty_eligible
              ? [
                  {
                    label: __('Under warranty (no charge)'),
                    value: 'Warranty',
                  },
                ]
              : []),
            { label: __('With charge'), value: 'Paid' },
          ]"
        />
        <p v-if="claim?.repair?.note" class="text-sm text-ink-gray-6">
          {{ claim.repair.note }}
        </p>
        <p
          v-if="!claim?.repair?.warranty_eligible"
          class="text-sm text-ink-gray-6"
        >
          {{
            __(
              'The repair warranty expired, so this visit is charged. The original history stays.',
            )
          }}
        </p>
        <FormControl
          v-model="repairForm.reason"
          type="textarea"
          :label="__('What to repair')"
        />
        <p
          v-if="repairProblem"
          role="alert"
          class="rounded-6 bg-surface-red-1 p-3 text-base text-ink-red-7"
        >
          <strong>{{ repairProblem.title }}.</strong>
          {{ repairProblem.detail }}
        </p>
      </div>
      <template #actions>
        <button
          type="button"
          :class="['press w-full', BTN.filled]"
          :disabled="busy"
          @click="repair"
        >
          <span
            :class="[
              busy ? 'lucide-loader-circle animate-spin' : 'lucide-wrench',
              'size-5',
            ]"
            aria-hidden="true"
          />
          {{ __('Receive in Taller') }}
        </button>
      </template>
    </BottomSheet>

    <BottomSheet
      :open="transitioning"
      :title="pending ? actionLabel(pending.action) : ''"
      :subtitle="claim?.customer_name || ''"
      :dismissible="!busy"
      @update:open="(value) => (transitioning = value)"
    >
      <div class="space-y-4 pt-1">
        <p class="text-base text-ink-gray-7">{{ transitionHint }}</p>
        <ComprasPicker
          v-if="pending?.action === 'Enviar a proveedor'"
          v-model="supplier"
          :display="supplierLabel"
          :label="__('Supplier', null, 'Garantías')"
          :placeholder="__('Search supplier')"
          :empty-text="__('No suppliers match')"
          :load="searchSuppliers"
          @pick="(option) => (supplierLabel = option.label)"
        />
        <FormControl v-model="details" type="textarea" :label="detailsLabel" />
        <p
          v-if="transitionProblem"
          role="alert"
          class="rounded-6 bg-surface-red-1 p-3 text-base text-ink-red-7"
        >
          <strong>{{ transitionProblem.title }}.</strong>
          {{ transitionProblem.detail }}
        </p>
      </div>
      <template #actions>
        <button
          type="button"
          :class="['press w-full', BTN.filled]"
          :disabled="busy || (needsDetails && !details.trim())"
          data-testid="garantia-transition-confirm"
          @click="applyTransition"
        >
          <span
            :class="[
              busy
                ? 'lucide-loader-circle animate-spin'
                : actionIcon(pending?.action),
              'size-5',
            ]"
            aria-hidden="true"
          />
          {{ pending ? actionLabel(pending.action) : '' }}
        </button>
      </template>
    </BottomSheet>

    <BottomSheet
      :open="outcomeLinking"
      :title="__('Link outcome')"
      :subtitle="claim?.customer_name || ''"
      :dismissible="!busy"
      @update:open="(value) => (outcomeLinking = value)"
    >
      <div class="space-y-4 pt-1">
        <p class="text-base text-ink-gray-7">
          {{
            __(
              'The Taller order, return or stock entry that solved this case, so the case closes with it.',
            )
          }}
        </p>
        <FormControl
          v-model="outcomeForm.doctype"
          type="select"
          :label="__('Kind of document')"
          :options="[
            { label: __('Repair Order'), value: 'Repair Order' },
            { label: __('Sales Invoice'), value: 'Sales Invoice' },
            { label: __('POS Invoice'), value: 'POS Invoice' },
            { label: __('Stock Entry'), value: 'Stock Entry' },
          ]"
        />
        <FormControl
          v-model="outcomeForm.name"
          :label="__('Document number')"
        />
        <p
          v-if="outcomeProblem"
          role="alert"
          class="rounded-6 bg-surface-red-1 p-3 text-base text-ink-red-7"
        >
          <strong>{{ outcomeProblem.title }}.</strong>
          {{ outcomeProblem.detail }}
        </p>
      </div>
      <template #actions>
        <button
          type="button"
          :class="['press w-full', BTN.filled]"
          :disabled="busy || !outcomeForm.name.trim()"
          @click="linkOutcome(outcomeForm.doctype, outcomeForm.name.trim())"
        >
          <span
            :class="[
              busy ? 'lucide-loader-circle animate-spin' : 'lucide-link',
              'size-5',
            ]"
            aria-hidden="true"
          />
          {{ __('Link', null, 'Garantías') }}
        </button>
      </template>
    </BottomSheet>

    <SourceDialog
      v-if="claim"
      v-model="picking"
      :claim="claim"
      @changed="(view) => (claim = view)"
    />
    <AssignDialog
      v-if="claim"
      v-model="assigning"
      :claim="claim.name"
      :assignees="claim.assignees"
      @changed="(view) => (claim = view)"
    />
    <NoticeDialog
      v-if="claim"
      v-model="notifying"
      :claim="claim.name"
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
import { useRoute, useRouter } from 'vue-router'
import { FormControl, call, toast } from 'frappe-ui'
import { AppBar, BottomSheet, EmptyState, StatusChip } from '@/components/ui'
import RecordIsland from '@/components/documentos/RecordIsland.vue'
import RecordKit from '@/components/documentos/compras/RecordKit.vue'
import { useRecordKit } from '@/components/documentos/compras/recordKit'
import { recordActionsFor } from '@/documentos/acciones'
import { BTN } from '@/documentos/tools'
import AssignDialog from '@/components/garantias/AssignDialog.vue'
import NoticeDialog from '@/components/garantias/NoticeDialog.vue'
import SourceDialog from '@/components/garantias/SourceDialog.vue'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { money } from '@/composables/useCompras'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { formatDay } from '@/utils/contactos'
import { offerUndo, runUndo } from '@/composables/powerUndo'
import { appleKeys, registerPageShortcuts } from '@/composables/shellKeyboard'
import { hoyLive } from '@/composables/useHoy'
import { isTypingTarget } from '@/vendor/muelle-shell/contracts'
import { useLiveWatch } from '@/vendor/muelle-shell/live-sync/vue'
import RecordPendientes from '@/components/pendientes/RecordPendientes.vue'
import { keyAction } from '@/utils/powerList'
import {
  LIVE_DOCTYPES,
  RECORD_KEYS,
  actionLabel,
  dueLabel,
  dueTheme,
  garantiasApi,
  garantiasBoot,
  kindLabel,
  liveOutcome,
  loadGarantiasBoot,
  outcomeUnknown,
  primaryAction,
  problemOf,
  recordShortcuts,
  remedyLabel,
  requestId,
  safeReturn,
  stateLabel,
  stateTheme,
  tallerIntakeUrl,
  tallerOrderUrl,
} from '@/composables/useGarantias'

// The state's and the due date's Badge themes, as StatusChip tones.
const TONE = {
  green: 'success',
  blue: 'info',
  orange: 'warning',
  amber: 'warning',
  red: 'danger',
  gray: 'neutral',
}
const ICON_TILE =
  'flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7'
const ACTION_ICONS = {
  Revisar: 'lucide-search',
  Resolver: 'lucide-circle-check',
  'Sin procede': 'lucide-circle-x',
  Cancelar: 'lucide-x',
  Reabrir: 'lucide-refresh-cw',
  'Enviar a proveedor': 'lucide-truck',
  'Respuesta del proveedor': 'lucide-message-square',
}
function actionIcon(action) {
  return ACTION_ICONS[action] || 'lucide-arrow-right'
}

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const claim = ref(null)
const guard = ref(null)
const problem = ref(null)
const notice = ref('')
const busy = ref(false)
const assigning = ref(false)
const notifying = ref(false)
const repairing = ref(false)
const repairProblem = ref(null)
const repairForm = reactive({ kind: 'Paid', reason: '' })
const transitioning = ref(false)
const transitionProblem = ref(null)
const pending = ref(null)
const details = ref('')
const picking = ref(false)
const supplier = ref('')
const supplierLabel = ref('')
const outcomeLinking = ref(false)
const outcomeProblem = ref(null)
const outcomeForm = reactive({ doctype: 'Repair Order', name: '' })
let repairKey = requestId()

// The engine's «⋯» tools, «Creado desde», Conexiones and Actividad.
const kit = useRecordKit('Warranty Claim', {
  name: () => props.name,
  title: () => claim.value?.customer_name || '',
  modified: () => claim.value?.modified,
  changed: () => load(),
})

const hints = computed(() => {
  const c = claim.value
  if (!c) return []
  return [
    !c.repair?.available && !c.repair?.hidden ? c.repair?.reason : null,
    c.actions_note,
  ].filter(Boolean)
})
// A case about a purchase, open and without an outcome: link the order, return or stock entry that solved it.
const linkable = computed(() =>
  Boolean(claim.value?.can_pick_source && claim.value?.against),
)
const showSupplier = computed(
  () =>
    claim.value &&
    (claim.value.state === 'Con proveedor' ||
      claim.value.supplier?.supplier ||
      claim.value.supplier?.rma_parts?.length ||
      claim.value.remedies?.rma?.moved),
)
const detailsLabel = computed(() => {
  switch (pending.value?.action) {
    case 'Enviar a proveedor':
      return __('What goes to the supplier and why')
    case 'Respuesta del proveedor':
      return __('What the supplier answered')
    default:
      return needsDetails.value
        ? __('Why (the customer sees this on the case sheet)')
        : __('Note (optional)')
  }
})

const returnTo = computed(() => safeReturn(route.query.return_to))
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        typeof route.query.return_label === 'string'
          ? route.query.return_label.slice(0, 40)
          : __('previous screen'),
      ])
    : __('Back to Garantías'),
)
const closed = computed(() =>
  ['Resuelta', 'Cancelada'].includes(claim.value?.state),
)
const primary = computed(() => primaryAction(claim.value))
// Overdue reads on the chip too; else the state's own colour.
const chipTone = computed(() => {
  const c = claim.value
  if (c?.sla?.due && !closed.value && dueTheme(c.sla.due) === 'red')
    return 'danger'
  return TONE[stateTheme(c?.state)] || 'neutral'
})
const laterLinks = computed(
  () =>
    !!(
      claim.value?.repair?.intake ||
      linkable.value ||
      (claim.value?.repair?.pick_source &&
        primary.value?.kind !== 'pick_source')
    ),
)

// ── the hero's steps: the primary filled, then every other move ──────────
const nextSteps = computed(() => {
  const c = claim.value
  if (!c) return []
  const p = primary.value
  const out = []
  if (p?.kind === 'repair')
    out.push({
      key: 'repair',
      label: __('Repair in Taller'),
      icon: 'lucide-wrench',
      filled: true,
      run: openRepair,
    })
  else if (p?.kind === 'open_repair')
    out.push({
      key: 'open-repair',
      label: __('Open repair order'),
      icon: 'lucide-external-link',
      filled: true,
      detail: {
        id: `garantia-repair-${c.repair.open}`,
        text: __('Repair order {0}', [c.repair.open]),
      },
      run: () => openTaller(c.repair.open),
    })
  else if (p?.kind === 'pick_source')
    out.push({
      key: 'pick-source',
      label: __('Choose purchase'),
      icon: 'lucide-shopping-bag',
      filled: true,
      run: () => (picking.value = true),
    })
  // Sales shape: a refund already made is linked, else the POS «Devolver venta» does it.
  for (const ret of c.remedies?.refund?.returns || [])
    out.push({
      key: `return:${ret.name}`,
      label: __('Link return'),
      icon: 'lucide-link',
      filled: p?.kind === 'link_return',
      busy: true,
      detail: {
        id: `garantia-return-${ret.name}`,
        text: [
          __('Return {0}', [ret.name]),
          ret.total !== undefined &&
            money(Math.abs(Number(ret.total)), ret.currency),
        ]
          .filter(Boolean)
          .join(' · '),
      },
      run: () => linkOutcome(ret.doctype, ret.name),
    })
  if (c.remedies?.refund?.available && !c.remedies.refund.returns.length)
    out.push({
      key: 'refund',
      label: __('Refund at the register'),
      icon: 'lucide-banknote',
      busy: true,
      run: startRefund,
    })
  for (const t of transitionButtons.value)
    out.push({
      key: `transition:${t.action}`,
      label: actionLabel(t.action),
      icon: actionIcon(t.action),
      filled: p?.action === t.action,
      run: () => startTransition(t),
    })
  if (c.can_write)
    out.push({
      key: 'assign',
      label: __('Assign', null, 'Garantías'),
      icon: 'lucide-user-plus',
      run: () => (assigning.value = true),
    })
  out.push({
    key: 'notify',
    label: __('Notify the customer'),
    icon: 'lucide-message-circle',
    run: () => (notifying.value = true),
  })
  if (kit.record.value?.actions?.print?.allowed)
    out.push({
      key: 'print',
      label: __('Print', null, 'Compras'),
      icon: 'lucide-printer',
      run: () => kit.onTool('print'),
    })
  // The filled step leads; the rest keep the server's order.
  return out.sort((x, y) => Number(!!y.filled) - Number(!!x.filled))
})

// A phone shows the lead and three more; «Más acciones» unfolds the rest
// (the bolt always lists them all). A step tied to a return always shows.
const STEPS_SHOWN = 4
const allSteps = ref(false)
const shownSteps = computed(() =>
  allSteps.value
    ? nextSteps.value
    : nextSteps.value.filter((step, i) => i < STEPS_SHOWN || step.detail),
)
const hiddenSteps = computed(
  () => nextSteps.value.length - shownSteps.value.length || allSteps.value,
)

// ── the bolt: the hero's steps; «⋯» keeps print, share, mail and the rest ─
const boltGroups = computed(() =>
  recordActionsFor({ steps: nextSteps.value, tools: kit.tools.value }),
)
function onBolt({ key }) {
  if (key.startsWith('paso:')) nextSteps.value[Number(key.slice(5))]?.run()
  else kit.onTool(key)
}
function mail() {
  const action = kit.record.value?.actions?.email
  if (action?.allowed) kit.onTool('correo')
  else toast.error(action?.reason || __('This case cannot be sent by email.'))
}
const transitionButtons = computed(() => {
  // One button per action; the server picks the row for the worker's role.
  const seen = new Set()
  return (claim.value?.transitions || []).filter((t) =>
    seen.has(t.action) ? false : seen.add(t.action),
  )
})
const needsDetails = computed(
  () =>
    pending.value?.action === 'Sin procede' ||
    pending.value?.needs_note ||
    pending.value?.needs_details ||
    (pending.value?.next_state === 'Resuelta' && !liveOutcome(claim.value)),
)
const transitionHint = computed(() => {
  switch (pending.value?.action) {
    case 'Enviar a proveedor':
      return (
        claim.value?.supplier?.hint || __('The case waits for the supplier.')
      )
    case 'Respuesta del proveedor':
      return __(
        'The case goes back to review: then refund it at the register or resolve it.',
      )
    case 'Resolver':
      return liveOutcome(claim.value)
        ? __('The case closes with {0} as its outcome.', [
            claim.value.outcome.name,
          ])
        : __(
            'Nothing is linked as the outcome yet. Write what was done, or repair it in Taller first.',
          )
    case 'Sin procede':
      return __('The case closes without a repair or refund. Say why.')
    case 'Cancelar':
      return __('Use this when the case was opened by mistake.')
    case 'Reabrir':
      return __('The case goes back to review.')
    default:
      return __('The case moves to review.')
  }
})

async function load() {
  problem.value = null
  try {
    claim.value = await garantiasApi('get_claim', { name: props.name })
    guard.value = null
  } catch (error) {
    const found = problemOf(error)
    if (!claim.value)
      guard.value = {
        title:
          found.kind === 'permission'
            ? __('You cannot open this case')
            : __('Could not open the case'),
        detail: found.detail,
      }
    else problem.value = found
  }
}

function onBack(event) {
  event?.preventDefault?.()
  goBack()
}
function goBack() {
  if (returnTo.value) return window.location.assign(returnTo.value)
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  if (list.startsWith('/garantias')) return router.push(list)
  router.push({ name: 'Garantias' })
}
function openTaller(order) {
  window.location.assign(tallerOrderUrl(order, claim.value.name))
}

function openRepair() {
  repairForm.kind = claim.value.repair?.warranty_eligible ? 'Warranty' : 'Paid'
  repairForm.reason = claim.value.complaint.slice(0, 500)
  repairProblem.value = null
  repairKey = requestId()
  repairing.value = true
}
async function repair() {
  busy.value = true
  repairProblem.value = null
  try {
    const out = await garantiasApi('repair', {
      name: claim.value.name,
      kind: repairForm.kind,
      reason: repairForm.reason.trim(),
      client_uuid: repairKey,
    })
    claim.value = out.claim
    repairing.value = false
    toast.success(__('Received in Taller as {0}', [out.repair_order]))
    openTaller(out.repair_order)
  } catch (error) {
    repairProblem.value = problemOf(error)
    if (!outcomeUnknown(error)) repairKey = requestId()
  } finally {
    busy.value = false
  }
}

function startTransition(transition) {
  pending.value = transition
  details.value = ''
  supplier.value = claim.value?.supplier?.supplier || ''
  supplierLabel.value = supplier.value
  transitionProblem.value = null
  transitioning.value = true
}

async function searchSuppliers(text) {
  const rows = await call('frappe.desk.search.search_link', {
    doctype: 'Supplier',
    txt: text || '',
    page_length: 10,
  })
  return (rows || []).map((row) => ({
    value: row.value,
    label: row.label || row.description || row.value,
    hint: row.label ? row.description : '',
  }))
}

/** «Reembolso en caja»: the POS «Devolver venta» moves the money and links its return back here. */
async function startRefund() {
  busy.value = true
  problem.value = null
  try {
    const out = await garantiasApi('doco.garantias.sales.start_refund', {
      name: claim.value.name,
      modified: claim.value.modified,
    })
    claim.value = out.claim
    window.location.assign(out.url)
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    busy.value = false
  }
}

const purchaseReceipt = ref('')
const selectedPurchase = computed(() =>
  claim.value?.remedies?.supplier_return?.purchases?.find(
    (p) => p.name === purchaseReceipt.value,
  ),
)
watch(
  () => claim.value?.remedies?.supplier_return?.purchases,
  (rows) => {
    if (rows?.length && !rows.some((r) => r.name === purchaseReceipt.value))
      purchaseReceipt.value = rows[0].name
  },
)
/** «El proveedor acreditó»: a native purchase return of the RMA unit; the case resolves. */
async function supplierReturn() {
  busy.value = true
  problem.value = null
  try {
    const out = await garantiasApi('doco.garantias.sales.supplier_return', {
      name: claim.value.name,
      purchase_receipt: purchaseReceipt.value,
      modified: claim.value.modified,
    })
    claim.value = out.claim
    toast.success(
      out.debit_note
        ? __('Draft debit note {0} prepared.', [out.debit_note])
        : __('Returned to the supplier: {0}', [out.purchase_return]),
    )
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    busy.value = false
  }
}

async function moveToRma() {
  busy.value = true
  problem.value = null
  try {
    const out = await garantiasApi('doco.garantias.sales.move_to_rma', {
      name: claim.value.name,
      modified: claim.value.modified,
    })
    claim.value = out.claim
    toast.success(__('Moved to RMA: {0}', [out.stock_entry]))
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    busy.value = false
  }
}

async function linkOutcome(doctype, name) {
  busy.value = true
  outcomeProblem.value = null
  problem.value = null
  try {
    claim.value = await garantiasApi('link_outcome', {
      name: claim.value.name,
      outcome_doctype: doctype,
      outcome_name: name,
      modified: claim.value.modified,
    })
    outcomeLinking.value = false
    toast.success(__('{0} linked as the outcome', [name]))
  } catch (error) {
    if (outcomeLinking.value) outcomeProblem.value = problemOf(error)
    else problem.value = problemOf(error)
  } finally {
    busy.value = false
  }
}
async function applyTransition() {
  busy.value = true
  transitionProblem.value = null
  try {
    const view = await garantiasApi('transition', {
      name: claim.value.name,
      action: pending.value.action,
      resolution_details: details.value.trim() || null,
      modified: claim.value.modified,
      supplier:
        pending.value.action === 'Enviar a proveedor'
          ? supplier.value || null
          : null,
    })
    claim.value = view
    transitioning.value = false
    if (['Resuelta', 'Cancelada'].includes(view.state)) {
      toast.success(
        view.state === 'Resuelta'
          ? __('Case {0} resolved', [view.name])
          : __('Case {0} cancelled', [view.name]),
      )
      goBack()
    }
  } catch (error) {
    transitionProblem.value = problemOf(error)
  } finally {
    busy.value = false
  }
}

watch(
  () => props.name,
  () => {
    claim.value = null
    load()
  },
)
// ── keyboard: assign, take, back — never while typing or under a dialog ─────
registerPageShortcuts(null, () => (claim.value ? recordShortcuts() : []))
function onKey(event) {
  if (event.defaultPrevented || !claim.value) return
  if (document.querySelector('[aria-modal="true"], [role="dialog"]')) return
  const action = keyAction(event, RECORD_KEYS, { apple: appleKeys })
  if (!action || isTypingTarget(event.target)) return
  event.preventDefault()
  if (action === 'back') return goBack()
  if (action === 'assign') return (assigning.value = true)
  if (action === 'take') return takeCase()
}

/** «Tomar el caso»: assigned to me, with «Deshacer». */
async function takeCase() {
  const me = garantiasBoot.value?.user
  if (!me || !claim.value) return
  if ((claim.value.assignees || []).some((a) => a.user === me))
    return toast.success(__('This case is already yours.'))
  const name = claim.value.name
  try {
    claim.value = await garantiasApi('assign', { name, user: me })
    offerUndo(__('Case {0} is yours', [name]), () =>
      runUndo(
        async () =>
          (claim.value = await garantiasApi('unassign', { name, user: me })),
        {
          done: __('Case {0} put back', [name]),
          describe: (error) => problemOf(error).detail,
        },
      ),
    )
  } catch (error) {
    problem.value = problemOf(error)
  }
}

// ── live: a colleague moved or assigned this case; it shows here ───────────
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
useLiveWatch(
  hoyLive(socket),
  LIVE_DOCTYPES,
  () => {
    // Never under the worker's hands: open forms keep what is typed.
    const typing =
      assigning.value ||
      notifying.value ||
      repairing.value ||
      transitioning.value ||
      pending.value ||
      picking.value ||
      outcomeLinking.value
    if (!typing && !busy.value && !problem.value && claim.value) load()
  },
  { minIntervalMs: 3000 },
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  await loadGarantiasBoot()
  if (!garantiasBoot.value?.enabled) {
    guard.value = {
      title: __('Garantías is not available'),
      detail:
        garantiasBoot.value?.reason ||
        __('Ask your manager for access to warranty and return cases.'),
    }
    return
  }
  await load()
})
</script>
