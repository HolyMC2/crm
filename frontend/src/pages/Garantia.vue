<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <nav class="mb-3">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="goBack"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ backLabel }}
        </button>
      </nav>

      <section
        v-if="guard"
        role="alert"
        class="mx-auto max-w-xl space-y-4 py-6"
      >
        <h1 class="text-xl font-semibold">{{ guard.title }}</h1>
        <p class="text-base text-ink-gray-7">{{ guard.detail }}</p>
        <div class="flex flex-wrap gap-2">
          <Button :label="__('Retry', null, 'Garantías')" @click="load" />
          <Button :label="__('Back to Garantías')" @click="goBack" />
        </div>
      </section>

      <div v-else-if="!claim" role="status" class="py-10 text-sm">
        {{ __('Loading case…') }}
      </div>

      <template v-else>
        <header class="mb-4 flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <p
              class="flex flex-wrap items-center gap-1 text-sm text-ink-gray-6"
            >
              {{ claim.name }}
              <Badge
                :theme="stateTheme(claim.state)"
                :label="stateLabel(claim.state)"
              />
              <Badge theme="gray" :label="kindLabel(claim.kind)" />
              <Badge
                v-if="claim.remedy && !closed"
                theme="blue"
                :label="remedyLabel(claim.remedy)"
              />
              <Badge
                v-if="claim.sla?.due && !closed"
                :theme="dueTheme(claim.sla.due)"
                :label="dueLabel(claim.sla.due)"
              />
            </p>
            <h1 class="truncate text-2xl font-semibold text-ink-gray-9">
              {{ claim.customer_name }}
            </h1>
            <p class="mt-1 text-sm text-ink-gray-6">
              {{
                [
                  claim.item_name || claim.item_code,
                  claim.serial_no,
                  claim.company,
                  claim.complaint_date,
                ]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </p>
          </div>
        </header>

        <div
          v-if="notice"
          role="status"
          class="mb-4 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8"
        >
          {{ notice }}
        </div>
        <div
          v-if="problem"
          role="alert"
          class="mb-4 space-y-2 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <p>
            <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="problem.kind === 'conflict'"
              :label="__('Refresh', null, 'Garantías')"
              @click="load"
            />
            <Button
              v-if="problem.kind === 'permission' && claim.can_write"
              :label="__('Assign to someone who can')"
              @click="assigning = true"
            />
          </div>
        </div>

        <!-- The one next step, then everything else this worker may do. -->
        <div class="mb-6 flex flex-wrap gap-2">
          <Button
            v-if="primary?.kind === 'repair'"
            variant="solid"
            icon-left="tool"
            :label="__('Repair in Taller')"
            class="min-h-11 sm:min-h-8"
            @click="openRepair"
          />
          <Button
            v-else-if="primary?.kind === 'open_repair'"
            variant="solid"
            icon-left="external-link"
            :label="__('Open repair order {0}', [claim.repair.open])"
            class="min-h-11 sm:min-h-8"
            @click="openTaller(claim.repair.open)"
          />
          <Button
            v-else-if="primary?.kind === 'pick_source'"
            variant="solid"
            icon-left="shopping-bag"
            :label="__('Choose purchase')"
            class="min-h-11 sm:min-h-8"
            @click="picking = true"
          />
          <!-- Sales shape: a refund already made is linked, else the POS «Devolver venta» does it. -->
          <Button
            v-for="ret in claim.remedies?.refund?.returns || []"
            :key="ret.name"
            :variant="primary?.kind === 'link_return' ? 'solid' : 'subtle'"
            icon-left="link"
            :label="__('Link return {0}', [ret.name])"
            class="min-h-11 sm:min-h-8"
            :loading="busy"
            @click="linkOutcome(ret.doctype, ret.name)"
          />
          <Button
            v-if="
              claim.remedies?.refund?.available &&
              !claim.remedies.refund.returns.length
            "
            icon-left="corner-up-left"
            :label="__('Refund at the register')"
            class="min-h-11 sm:min-h-8"
            :loading="busy"
            @click="startRefund"
          />
          <Button
            v-for="t in transitionButtons"
            :key="t.action + t.next_state"
            :variant="primary?.action === t.action ? 'solid' : 'subtle'"
            :label="actionLabel(t.action)"
            class="min-h-11 sm:min-h-8"
            @click="startTransition(t)"
          />
          <Button
            v-if="claim.can_write"
            icon-left="user-plus"
            :label="__('Assign', null, 'Garantías')"
            class="min-h-11 sm:min-h-8"
            @click="assigning = true"
          />
          <Button
            icon-left="message-circle"
            :label="__('Notify the customer')"
            class="min-h-11 sm:min-h-8"
            @click="notifying = true"
          />
        </div>
        <div
          v-if="claim.can_write && !closed && (hints.length || linkable)"
          class="-mt-4 mb-6 space-y-1 text-sm text-ink-gray-6"
        >
          <p v-for="hint in hints" :key="hint">{{ hint }}</p>
          <p
            v-if="claim.repair?.intake || claim.repair?.pick_source || linkable"
            class="flex flex-wrap gap-3"
          >
            <a
              v-if="claim.repair?.intake"
              class="text-ink-blue-link underline"
              :href="tallerIntakeUrl(claim.name)"
              >{{ __('Receive it in Taller') }}</a
            >
            <button
              v-if="linkable"
              class="text-ink-blue-link underline"
              @click="outcomeLinking = true"
            >
              {{ __('Link outcome') }}
            </button>
            <button
              v-if="
                claim.repair?.pick_source && primary?.kind !== 'pick_source'
              "
              class="text-ink-blue-link underline"
              @click="picking = true"
            >
              {{ __('Choose purchase') }}
            </button>
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <section
            class="rounded-lg border border-outline-gray-2 p-4 sm:col-span-2"
          >
            <h2 class="mb-1 text-sm font-semibold text-ink-gray-8">
              {{ __('What the customer reports') }}
            </h2>
            <p class="whitespace-pre-line text-base text-ink-gray-9">
              {{ claim.complaint }}
            </p>
          </section>

          <section class="rounded-lg border border-outline-gray-2 p-4">
            <h2 class="mb-1 text-sm font-semibold text-ink-gray-8">
              {{ __('Proof of purchase') }}
            </h2>
            <template v-if="claim.against">
              <p class="text-base text-ink-gray-9">
                {{ __(claim.against.doctype) }} {{ claim.against.name }}
              </p>
              <p v-if="claim.against.readable" class="text-sm text-ink-gray-6">
                {{
                  [
                    claim.against.title,
                    claim.against.date,
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
                class="mt-1 inline-block min-h-11 py-2 text-sm text-ink-blue-link underline"
                :href="tallerOrderUrl(claim.against.name, claim.name)"
                >{{ __('Open in Taller') }}</a
              >
            </template>
            <p v-else class="text-sm text-ink-gray-6">
              {{ __('No sale or repair order linked.') }}
            </p>
            <div
              v-if="claim.return_review"
              class="mt-2 border-t border-outline-gray-1 pt-2 text-sm text-ink-gray-7"
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
                {{ __('{0} line(s) requested', [claim.return_review.lines]) }}
              </p>
              <Badge
                v-if="claim.return_review.needs_fiscal_review"
                theme="orange"
                :label="__('Needs fiscal review')"
              />
            </div>
          </section>

          <section class="rounded-lg border border-outline-gray-2 p-4">
            <h2 class="mb-1 text-sm font-semibold text-ink-gray-8">
              {{ __('Warranty', null, 'Garantías') }}
            </h2>
            <p
              v-if="claim.policy?.expires_on"
              class="text-base text-ink-gray-9"
            >
              {{
                claim.policy.within
                  ? __('Covered until {0}', [claim.policy.expires_on])
                  : __('Expired on {0}', [claim.policy.expires_on])
              }}
            </p>
            <p v-else class="text-sm text-ink-gray-6">
              {{
                __('No warranty date on record. Check the sale or the order.')
              }}
            </p>
          </section>

          <section
            v-if="claim.outcome || claim.resolution_details"
            class="rounded-lg border border-outline-gray-2 p-4"
          >
            <h2 class="mb-1 text-sm font-semibold text-ink-gray-8">
              {{ __('Outcome', null, 'Garantías') }}
            </h2>
            <p v-if="claim.outcome" class="text-base text-ink-gray-9">
              {{ __(claim.outcome.doctype) }} {{ claim.outcome.name }}
              <span v-if="claim.outcome.status" class="text-sm text-ink-gray-6">
                · {{ claim.outcome.status }}</span
              >
              <span
                v-if="claim.outcome.technical_outcome"
                class="text-sm text-ink-gray-6"
              >
                · {{ claim.outcome.technical_outcome }}</span
              >
              <Badge
                v-if="claim.outcome.is_return"
                theme="gray"
                :label="__('Return', null, 'Garantías')"
              />
              <Badge
                v-if="claim.outcome.void"
                theme="red"
                :label="__('Cancelled, does not count')"
              />
            </p>
            <p
              v-if="claim.resolution_details"
              class="whitespace-pre-line text-sm text-ink-gray-8"
            >
              {{ claim.resolution_details }}
            </p>
            <p v-if="claim.resolved_by" class="text-sm text-ink-gray-6">
              {{ __('Resolved by {0}', [claim.resolved_by]) }}
            </p>
          </section>

          <section class="rounded-lg border border-outline-gray-2 p-4">
            <h2 class="mb-1 text-sm font-semibold text-ink-gray-8">
              {{ __('Assigned to', null, 'Garantías') }}
            </h2>
            <p class="text-base text-ink-gray-9">
              {{
                claim.assignees.map((a) => a.full_name).join(', ') ||
                __('Nobody yet')
              }}
            </p>
            <p v-if="claim.last_send" class="mt-2 text-sm text-ink-gray-6">
              {{ __('Last WhatsApp notice: {0}', [claim.last_send.label]) }}
            </p>
          </section>

          <section
            v-if="showSupplier"
            class="rounded-lg border border-outline-gray-2 p-4 sm:col-span-2"
          >
            <h2 class="mb-1 text-sm font-semibold text-ink-gray-8">
              {{ __('Supplier', null, 'Garantías') }}
            </h2>
            <p v-if="claim.supplier.supplier" class="text-base text-ink-gray-9">
              {{ claim.supplier.supplier }}
            </p>
            <ul v-if="claim.supplier.rma_parts.length" class="mt-1 text-sm">
              <li
                v-for="part in claim.supplier.rma_parts"
                :key="part.stock_entry || part.item_name"
              >
                {{ part.item_name }} × {{ part.qty }} ·
                {{ __('in {0}', [part.warehouse]) }} · {{ part.repair_order }}
              </li>
            </ul>
            <p v-if="claim.supplier.hint" class="mt-1 text-sm text-ink-gray-6">
              {{ claim.supplier.hint }}
            </p>
            <a
              v-if="claim.supplier.rma_report"
              class="mt-1 inline-block min-h-11 py-2 text-sm text-ink-blue-link underline"
              :href="`/app/query-report/${encodeURIComponent(claim.supplier.rma_report)}`"
              >{{ __('Parts in RMA report') }}</a
            >
            <template v-if="claim.remedies?.rma">
              <p
                v-if="claim.remedies.rma.moved"
                class="mt-2 text-sm text-ink-gray-8"
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
                class="mt-2 flex flex-wrap items-center gap-2"
              >
                <Button
                  icon-left="truck"
                  :label="__('Move to RMA')"
                  :loading="busy"
                  @click="moveToRma"
                />
                <span class="text-sm text-ink-gray-6">{{
                  __('From {0} to {1}', [
                    claim.remedies.rma.from,
                    claim.remedies.rma.to,
                  ])
                }}</span>
              </div>
              <p v-else class="mt-2 text-sm text-ink-gray-6">
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
                class="mt-2 text-sm text-ink-gray-8"
              >
                {{
                  __('Returned to the supplier: {0}', [
                    claim.remedies.supplier_return.done,
                  ])
                }}
              </p>
              <div
                v-else-if="claim.remedies.supplier_return.available"
                class="mt-2 flex flex-wrap items-end gap-2"
              >
                <FormControl
                  v-model="purchaseReceipt"
                  type="select"
                  class="min-w-56"
                  :label="__('Purchase it came from')"
                  :options="
                    claim.remedies.supplier_return.purchases.map((p) => ({
                      label: [p.name, p.supplier_name, p.date]
                        .filter(Boolean)
                        .join(' · '),
                      value: p.name,
                    }))
                  "
                />
                <Button
                  icon-left="check"
                  :label="__('Supplier credited it')"
                  :disabled="!purchaseReceipt"
                  :loading="busy"
                  @click="supplierReturn"
                />
              </div>
              <p v-else class="mt-2 text-sm text-ink-gray-6">
                {{ claim.remedies.supplier_return.reason }}
                <a
                  v-if="claim.remedies.supplier_return.next"
                  class="inline-block min-h-11 py-2 text-ink-blue-link underline"
                  :href="claim.remedies.supplier_return.next.url"
                  >{{ claim.remedies.supplier_return.next.label }}</a
                >
              </p>
              <ul
                v-if="
                  claim.remedies.supplier_return.available &&
                  claim.remedies.supplier_return.billed?.length
                "
                class="mt-2 text-sm text-ink-gray-6"
              >
                <li
                  v-for="row in claim.remedies.supplier_return.billed"
                  :key="row.name"
                >
                  {{ row.reason }}
                  <a
                    v-if="row.next"
                    class="inline-block min-h-11 py-2 text-ink-blue-link underline"
                    :href="row.next.url"
                    >{{ row.next.label }}</a
                  >
                </li>
              </ul>
            </template>
          </section>

          <section
            class="rounded-lg border border-outline-gray-2 p-4 sm:col-span-2"
          >
            <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
              {{ __('History', null, 'Garantías') }}
            </h2>
            <form
              v-if="claim.can_write"
              class="mb-3 flex gap-2"
              @submit.prevent="addNote"
            >
              <FormControl
                v-model="note"
                class="flex-1"
                :placeholder="__('Add a note for the team')"
                :aria-label="__('Add a note for the team')"
              />
              <Button
                :label="__('Save note')"
                :loading="savingNote"
                :disabled="!note.trim()"
                @click="addNote"
              />
            </form>
            <ul class="space-y-2">
              <li
                v-for="(entry, index) in claim.timeline"
                :key="index"
                class="text-sm"
              >
                <span class="text-ink-gray-9">{{ entry.text }}</span>
                <span class="block text-xs text-ink-gray-5"
                  >{{ entry.by }} · {{ entry.at }}</span
                >
              </li>
              <li v-if="!claim.timeline.length" class="text-sm text-ink-gray-6">
                {{ __('No history yet.') }}
              </li>
            </ul>
          </section>
        </div>
      </template>
    </div>

    <Dialog v-model="repairing" :options="{ title: __('Repair in Taller') }">
      <template #body-content>
        <div class="space-y-4">
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
          <p v-if="repairProblem" role="alert" class="text-sm text-ink-red-7">
            <strong>{{ repairProblem.title }}.</strong>
            {{ repairProblem.detail }}
          </p>
        </div>
      </template>
      <template #actions>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            :label="__('Close', null, 'Garantías')"
            @click="repairing = false"
          />
          <Button
            variant="solid"
            :label="__('Receive in Taller')"
            :loading="busy"
            @click="repair"
          />
        </div>
      </template>
    </Dialog>

    <Dialog
      v-model="transitioning"
      :options="{ title: pending ? actionLabel(pending.action) : '' }"
    >
      <template #body-content>
        <div class="space-y-4">
          <p class="text-sm text-ink-gray-7">{{ transitionHint }}</p>
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
          <FormControl
            v-model="details"
            type="textarea"
            :label="detailsLabel"
          />
          <p
            v-if="transitionProblem"
            role="alert"
            class="text-sm text-ink-red-7"
          >
            <strong>{{ transitionProblem.title }}.</strong>
            {{ transitionProblem.detail }}
          </p>
        </div>
      </template>
      <template #actions>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            :label="__('Close', null, 'Garantías')"
            @click="transitioning = false"
          />
          <Button
            variant="solid"
            :label="pending ? actionLabel(pending.action) : ''"
            :loading="busy"
            :disabled="needsDetails && !details.trim()"
            @click="applyTransition"
          />
        </div>
      </template>
    </Dialog>

    <Dialog v-model="outcomeLinking" :options="{ title: __('Link outcome') }">
      <template #body-content>
        <div class="space-y-4">
          <p class="text-sm text-ink-gray-7">
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
          <p v-if="outcomeProblem" role="alert" class="text-sm text-ink-red-7">
            <strong>{{ outcomeProblem.title }}.</strong>
            {{ outcomeProblem.detail }}
          </p>
        </div>
      </template>
      <template #actions>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            :label="__('Close', null, 'Garantías')"
            @click="outcomeLinking = false"
          />
          <Button
            variant="solid"
            :label="__('Link', null, 'Garantías')"
            :disabled="!outcomeForm.name.trim()"
            :loading="busy"
            @click="linkOutcome(outcomeForm.doctype, outcomeForm.name.trim())"
          />
        </div>
      </template>
    </Dialog>

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
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Badge,
  Button,
  Dialog,
  FeatherIcon,
  FormControl,
  call,
  toast,
} from 'frappe-ui'
import AssignDialog from '@/components/garantias/AssignDialog.vue'
import NoticeDialog from '@/components/garantias/NoticeDialog.vue'
import SourceDialog from '@/components/garantias/SourceDialog.vue'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { money } from '@/composables/useCompras'
import {
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
  remedyLabel,
  requestId,
  safeReturn,
  stateLabel,
  stateTheme,
  tallerIntakeUrl,
  tallerOrderUrl,
} from '@/composables/useGarantias'

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
const note = ref('')
const savingNote = ref(false)
const picking = ref(false)
const supplier = ref('')
const supplierLabel = ref('')
const outcomeLinking = ref(false)
const outcomeProblem = ref(null)
const outcomeForm = reactive({ doctype: 'Repair Order', name: '' })
let repairKey = requestId()

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
    toast.success(__('Returned to the supplier: {0}', [out.purchase_return]))
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

async function addNote() {
  const text = note.value.trim()
  if (!text) return
  savingNote.value = true
  try {
    await call('frappe.desk.form.utils.add_comment', {
      reference_doctype: 'Warranty Claim',
      reference_name: claim.value.name,
      content: text,
      comment_email: garantiasBoot.value?.user || '',
      comment_by: '',
    })
    note.value = ''
    await load()
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    savingNote.value = false
  }
}

watch(
  () => props.name,
  () => {
    claim.value = null
    load()
  },
)
onMounted(async () => {
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
