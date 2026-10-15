<template>
  <section
    class="min-w-0 space-y-4"
    :aria-busy="loading"
    :aria-label="__('Fiscal invoice')"
  >
    <div v-if="loading && !data" class="space-y-3" aria-hidden="true">
      <div class="h-24 animate-pulse rounded-lg bg-surface-gray-2" />
      <div class="h-16 animate-pulse rounded bg-surface-gray-2" />
      <div class="h-32 animate-pulse rounded bg-surface-gray-2" />
    </div>
    <ArchivoGuard
      v-else-if="loadProblem"
      :state="loadProblem"
      @action="onLoadGuard"
    />

    <!-- Not a readable CFDI: the host keeps its usual preview. -->
    <p
      v-else-if="data && data.available === false"
      class="text-sm text-ink-gray-6"
    >
      {{ data.reason || __('This file does not read as a CFDI.') }}
    </p>

    <!-- PDF of a CFDI: what its text says, until the XML arrives. -->
    <div
      v-else-if="data && data.source === 'pdf'"
      class="space-y-2 rounded-lg border border-outline-gray-2 p-4"
    >
      <h3 class="text-base font-semibold text-ink-gray-9">
        {{ __('PDF of a fiscal invoice') }}
      </h3>
      <div v-if="pdfHints.uuid" class="flex flex-wrap items-center gap-2">
        <span class="break-all text-sm text-ink-gray-8">{{
          __('Fiscal folio {0}', [pdfHints.uuid])
        }}</span>
        <Button
          variant="ghost"
          class="min-h-11 sm:min-h-0"
          icon="lucide-copy"
          :aria-label="__('Copy fiscal folio')"
          @click="copyFolio(pdfHints.uuid)"
        />
      </div>
      <p v-if="pdfHints.rfcs.length" class="text-sm text-ink-gray-7">
        {{ __('RFC in the text: {0}', [pdfHints.rfcs.join(', ')]) }}
      </p>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'When the XML of this fiscal folio arrives it joins this PDF, and the full invoice shows here.',
          )
        }}
      </p>
      <div v-if="data.sat?.estado" class="flex flex-wrap gap-2">
        <Badge v-bind="satBadge" />
      </div>
    </div>

    <!-- CFDI XML: the human card -->
    <template v-else-if="card">
      <header class="space-y-2 rounded-lg border border-outline-gray-2 p-4">
        <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
          <div class="min-w-0 flex-1">
            <h3 class="text-base font-semibold text-ink-gray-9">
              {{ card.tipo_label || __('Fiscal invoice') }}
              <span v-if="serieFolio(card)" class="text-ink-gray-7">
                {{ serieFolio(card) }}</span
              >
            </h3>
            <p v-if="card.date" class="text-sm text-ink-gray-6">
              {{ fiscalDate(card.date) }}
            </p>
          </div>
          <div class="text-right">
            <p
              class="text-2xl font-semibold tabular-nums text-ink-gray-9"
              :aria-label="__('Total {0}', [money(card.total, card.moneda)])"
            >
              {{ money(card.total, card.moneda) }}
            </p>
            <p v-if="foreign" class="text-sm text-ink-gray-6">
              {{
                __('{0} at an exchange rate of {1}', [
                  card.moneda,
                  rate(card.tipo_cambio),
                ])
              }}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <Badge
            :theme="card.stamped ? 'green' : 'orange'"
            :label="card.stamped ? __('Stamped') : __('Not stamped')"
          />
          <Badge v-if="data.sat?.estado" v-bind="satBadge" />
          <Badge
            v-if="data.sat?.efos"
            theme="red"
            :label="__('Issuer on the SAT 69-B list: {0}', [data.sat.efos])"
          />
        </div>
      </header>

      <!-- Who -->
      <section class="space-y-2" :aria-labelledby="ids.who">
        <h4 :id="ids.who" class="text-sm font-medium text-ink-gray-8">
          {{ __('Who') }}
        </h4>
        <div class="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div class="rounded border border-outline-gray-1 p-3">
            <p class="text-xs text-ink-gray-6">{{ __('Issuer') }}</p>
            <p class="break-words text-base text-ink-gray-9">
              {{ card.emisor?.nombre || card.emisor?.rfc }}
            </p>
            <p class="text-sm text-ink-gray-7">
              {{ __('RFC {0}', [card.emisor?.rfc || '—']) }}
            </p>
            <p
              v-if="card.emisor?.regimen_fiscal_label"
              class="text-sm text-ink-gray-6"
            >
              {{ __('Tax regime: {0}', [card.emisor.regimen_fiscal_label]) }}
            </p>
          </div>
          <FeatherIcon
            name="arrow-right"
            class="mx-auto hidden h-4 w-4 text-ink-gray-5 sm:block"
            aria-hidden="true"
          />
          <div class="rounded border border-outline-gray-1 p-3">
            <p class="text-xs text-ink-gray-6">{{ __('Receiver') }}</p>
            <p class="break-words text-base text-ink-gray-9">
              {{ card.receptor?.nombre || card.receptor?.rfc }}
            </p>
            <p class="text-sm text-ink-gray-7">
              {{ __('RFC {0}', [card.receptor?.rfc || '—']) }}
            </p>
            <p
              v-if="card.receptor?.uso_cfdi_label"
              class="text-sm text-ink-gray-6"
            >
              {{ __('CFDI use: {0}', [card.receptor.uso_cfdi_label]) }}
            </p>
          </div>
        </div>
        <a
          v-if="data.party"
          :href="recordHref(data.party.doctype, data.party.name)"
          class="inline-flex min-h-11 items-center gap-2 text-sm text-ink-gray-8 underline sm:min-h-0"
          ><FeatherIcon name="user" class="h-4 w-4" aria-hidden="true" />{{
            data.party.doctype === 'Customer'
              ? __('Customer: {0}', [data.party.title || data.party.name])
              : __('Supplier: {0}', [data.party.title || data.party.name])
          }}</a
        >
        <div
          v-else-if="data.party_missing"
          class="space-y-2 rounded bg-surface-gray-1 p-3"
        >
          <p class="text-sm text-ink-gray-8">
            {{ __('You do not have this supplier yet') }}
            <span class="text-ink-gray-6"
              >· {{ data.party_missing.nombre }}
              {{ __('RFC {0}', [data.party_missing.rfc]) }}</span
            >
          </p>
          <Button
            v-if="data.party_missing.can_create"
            class="min-h-11 sm:min-h-0"
            :label="__('Add supplier')"
            :loading="busy === 'supplier'"
            @click="createSupplier()"
          />
          <ArchivoGuard
            v-else
            :state="supplierAccessGuard(data.party_missing)"
            :copy-text="supplierAccessText(data.party_missing)"
          />
        </div>
        <ArchivoGuard
          v-if="supplierProblem"
          :state="supplierProblem"
          @action="onActionGuard"
        />
      </section>

      <!-- What -->
      <section
        v-if="card.conceptos?.length"
        class="space-y-2"
        :aria-labelledby="ids.what"
      >
        <h4 :id="ids.what" class="text-sm font-medium text-ink-gray-8">
          {{ __('What') }}
        </h4>
        <table class="w-full text-sm">
          <thead class="sr-only">
            <tr>
              <th scope="col">{{ __('Description') }}</th>
              <th scope="col">{{ __('Amount') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-outline-gray-1">
            <tr
              v-for="(line, index) in shownConceptos"
              :key="index"
              class="align-top"
            >
              <td class="py-2 pr-3">
                <span class="block break-words text-ink-gray-9">{{
                  line.descripcion
                }}</span>
                <span class="block text-ink-gray-6"
                  >{{ quantity(line.cantidad) }} ×
                  {{ money(line.valor_unitario, card.moneda)
                  }}<template v-if="line.no_identificacion">
                    · {{ line.no_identificacion }}</template
                  ></span
                >
              </td>
              <td class="whitespace-nowrap py-2 text-right tabular-nums">
                {{ money(line.importe, card.moneda) }}
              </td>
            </tr>
          </tbody>
        </table>
        <Button
          v-if="card.conceptos.length > CONCEPTOS_SHOWN"
          variant="ghost"
          class="min-h-11 sm:min-h-0"
          :aria-expanded="showAll ? 'true' : 'false'"
          :label="
            showAll
              ? __('Show fewer items')
              : __('See all {0} items', [card.conceptos.length])
          "
          @click="showAll = !showAll"
        />
        <p
          v-if="(card.conceptos_count || 0) > card.conceptos.length"
          class="text-sm text-ink-gray-6"
        >
          {{
            __('Showing {0} of {1} items; the XML has all of them.', [
              card.conceptos.length,
              card.conceptos_count,
            ])
          }}
        </p>
      </section>

      <!-- How much -->
      <section class="space-y-2" :aria-labelledby="ids.howMuch">
        <h4 :id="ids.howMuch" class="text-sm font-medium text-ink-gray-8">
          {{ __('How much') }}
        </h4>
        <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt class="text-ink-gray-7">{{ __('Subtotal') }}</dt>
          <dd class="text-right tabular-nums text-ink-gray-9">
            {{ money(card.subtotal, card.moneda) }}
          </dd>
          <template v-if="Number(card.descuento) > 0">
            <dt class="text-ink-gray-7">{{ __('Discount') }}</dt>
            <dd class="text-right tabular-nums text-ink-gray-9">
              − {{ money(card.descuento, card.moneda) }}
            </dd>
          </template>
          <template
            v-for="(tax, index) in card.impuestos?.traslados || []"
            :key="'t' + index"
          >
            <dt class="text-ink-gray-7">
              {{ __('Tax transferred: {0}', [taxName(tax)]) }}
            </dt>
            <dd class="text-right tabular-nums text-ink-gray-9">
              {{ money(tax.importe, card.moneda) }}
            </dd>
          </template>
          <template
            v-for="(tax, index) in card.impuestos?.retenciones || []"
            :key="'r' + index"
          >
            <dt class="text-ink-gray-7">
              {{ __('Tax withheld: {0}', [taxName(tax)]) }}
            </dt>
            <dd class="text-right tabular-nums text-ink-gray-9">
              − {{ money(tax.importe, card.moneda) }}
            </dd>
          </template>
          <dt class="font-medium text-ink-gray-9">{{ __('Total') }}</dt>
          <dd class="text-right font-medium tabular-nums text-ink-gray-9">
            {{ money(card.total, card.moneda) }}
          </dd>
        </dl>
        <p v-if="paymentTerms" class="text-sm text-ink-gray-7">
          {{ paymentTerms }}
        </p>
      </section>

      <!-- Payment complement (tipo P) -->
      <section
        v-if="card.pagos?.pagos?.length"
        class="space-y-2"
        :aria-labelledby="ids.payments"
      >
        <h4 :id="ids.payments" class="text-sm font-medium text-ink-gray-8">
          {{ __('Payments in this receipt') }}
        </h4>
        <div
          v-for="(pago, index) in card.pagos.pagos"
          :key="index"
          class="space-y-2 rounded border border-outline-gray-1 p-3 text-sm"
        >
          <p class="text-ink-gray-9">
            <strong class="tabular-nums">{{
              money(pago.monto, pago.moneda)
            }}</strong>
            · {{ fiscalDate(pago.fecha_pago) }}
            <template v-if="pago.forma_pago_label">
              · {{ pago.forma_pago_label }}</template
            >
            <template v-if="pago.num_operacion">
              · {{ __('Operation {0}', [pago.num_operacion]) }}</template
            >
          </p>
          <ul class="space-y-1">
            <li
              v-for="related in pago.documentos || []"
              :key="related.uuid + related.num_parcialidad"
              class="rounded bg-surface-gray-1 px-2 py-1"
            >
              <span class="block break-all text-ink-gray-8">{{
                __('Fiscal folio {0}', [related.uuid])
              }}</span>
              <span class="block text-ink-gray-6">{{
                [
                  related.num_parcialidad &&
                    __('Installment {0}', [related.num_parcialidad]),
                  __('Paid {0}', [
                    money(related.pagado, related.moneda || pago.moneda),
                  ]),
                  __('Balance left {0}', [
                    money(
                      related.saldo_insoluto,
                      related.moneda || pago.moneda,
                    ),
                  ]),
                ]
                  .filter(Boolean)
                  .join(' · ')
              }}</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- Related CFDI -->
      <section
        v-if="card.relaciones?.length"
        class="space-y-1"
        :aria-labelledby="ids.related"
      >
        <h4 :id="ids.related" class="text-sm font-medium text-ink-gray-8">
          {{ __('Related CFDI') }}
        </h4>
        <div
          v-for="(group, index) in card.relaciones"
          :key="index"
          class="text-sm"
        >
          <p class="text-ink-gray-7">{{ group.label }}</p>
          <ul>
            <li
              v-for="uuid in group.uuids"
              :key="uuid"
              class="break-all text-ink-gray-9"
            >
              {{ uuid }}
            </li>
          </ul>
        </div>
      </section>

      <!-- Fiscal folio and SAT check -->
      <section class="space-y-1" :aria-labelledby="ids.folio">
        <h4 :id="ids.folio" class="text-sm font-medium text-ink-gray-8">
          {{ __('Fiscal folio') }}
        </h4>
        <div v-if="card.uuid" class="flex flex-wrap items-center gap-2">
          <code class="break-all text-sm text-ink-gray-9">{{ card.uuid }}</code>
          <Button
            variant="ghost"
            class="min-h-11 sm:min-h-0"
            icon="lucide-copy"
            :aria-label="__('Copy fiscal folio')"
            @click="copyFolio(card.uuid)"
          />
        </div>
        <p v-else class="text-sm text-ink-gray-6">
          {{ __('Not stamped: the SAT has not given it a fiscal folio.') }}
        </p>
        <p v-if="card.timbre?.fecha_timbrado" class="text-sm text-ink-gray-6">
          {{
            __('Stamped on {0}', [
              fiscalDate(card.timbre.fecha_timbrado, { time: true }),
            ])
          }}
        </p>
        <a
          v-if="card.verify_url"
          :href="card.verify_url"
          target="_blank"
          rel="noopener"
          class="inline-flex min-h-11 items-center gap-2 text-sm text-ink-gray-8 underline sm:min-h-0"
          ><FeatherIcon
            name="external-link"
            class="h-4 w-4"
            aria-hidden="true"
          />{{ __('Verify at the SAT') }}</a
        >
      </section>

      <ul
        v-if="card.warnings?.length"
        role="status"
        class="space-y-1 rounded border border-outline-amber-3 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
      >
        <li v-for="(warning, index) in card.warnings" :key="index">
          {{ warning }}
        </li>
      </ul>
    </template>

    <template v-if="data && data.available !== false">
      <p v-if="copyNote" role="status" class="text-sm text-ink-gray-7">
        {{ copyNote }}
      </p>

      <!-- Paired PDF -->
      <a
        v-if="data.rendition?.file_url"
        :href="data.rendition.file_url"
        target="_blank"
        rel="noopener"
        class="inline-flex min-h-11 items-center gap-2 text-sm text-ink-gray-8 underline sm:min-h-0"
        ><FeatherIcon name="file" class="h-4 w-4" aria-hidden="true" />{{
          __('PDF: {0}', [data.rendition.file_name || __('printed version')])
        }}</a
      >

      <!-- Records with this fiscal folio -->
      <section
        v-if="data.records?.length"
        class="space-y-1"
        :aria-labelledby="ids.records"
      >
        <h4 :id="ids.records" class="text-sm font-medium text-ink-gray-8">
          {{ __('Records with this fiscal folio') }}
        </h4>
        <ul class="space-y-1">
          <li
            v-for="row in data.records"
            :key="row.doctype + row.name"
            class="flex flex-wrap items-center gap-2 rounded border border-outline-gray-1 px-3 py-2"
          >
            <a
              :href="recordLink(row.doctype, row.name)"
              class="min-w-0 flex-1 text-base text-ink-gray-9 underline-offset-2 hover:underline"
            >
              <span class="block truncate"
                >{{ doctypeLabel(row.doctype) }}
                {{ row.title || row.name }}</span
              >
              <span class="block truncate text-sm text-ink-gray-6">{{
                [row.reason, row.subtitle].filter(Boolean).join(' · ')
              }}</span>
            </a>
            <span
              v-if="row.linked && row.auto"
              class="flex flex-wrap items-center gap-1 text-sm text-ink-gray-6"
              >{{ __('Linked automatically') }}
              <Button
                v-if="row.can_undo"
                variant="ghost"
                class="min-h-11 sm:min-h-0"
                :label="__('Undo')"
                :loading="busy === 'undo:' + row.doctype + row.name"
                @click="undoLink(row)"
            /></span>
            <Badge v-else-if="row.linked" theme="green" :label="__('Linked')" />
          </li>
        </ul>
        <ArchivoGuard
          v-if="undoProblem"
          :state="undoProblem"
          @action="onActionGuard"
        />
      </section>

      <!-- Purchase hand-off to Compras -->
      <section
        v-if="showPurchase"
        class="space-y-2 rounded-lg border border-outline-gray-2 p-4"
        :aria-labelledby="ids.purchase"
      >
        <h4 :id="ids.purchase" class="text-sm font-medium text-ink-gray-8">
          {{ __('Purchase') }}
        </h4>
        <a
          v-if="data.purchase.existing"
          :href="purchaseHref(data.purchase.existing)"
          class="inline-flex min-h-11 items-center rounded bg-surface-gray-10 px-4 text-base font-medium text-ink-base sm:min-h-8"
          >{{ __('Open purchase {0}', [data.purchase.existing]) }}</a
        >
        <template v-else>
          <Button
            variant="solid"
            class="min-h-11 sm:min-h-0"
            :label="__('Create purchase from this CFDI')"
            :disabled="!data.purchase.allowed"
            :loading="busy === 'purchase'"
            @click="createPurchase"
          />
          <p
            v-if="!data.purchase.allowed && data.purchase.reason"
            class="text-sm text-ink-gray-7"
          >
            {{ data.purchase.reason }}
          </p>
        </template>

        <!-- The supplier is new: add them, then the purchase continues -->
        <div
          v-if="step?.status === 'needs_supplier'"
          class="space-y-2 rounded bg-surface-gray-1 p-3"
          role="status"
        >
          <p class="text-sm text-ink-gray-8">
            {{
              __(
                '{0} is not one of your suppliers yet. Add them to continue.',
                [step.emisor?.nombre || step.emisor?.rfc || ''],
              )
            }}
          </p>
          <Button
            v-if="step.can_create_supplier"
            variant="solid"
            class="min-h-11 sm:min-h-0"
            :label="__('Add supplier')"
            :loading="busy === 'supplier'"
            @click="createSupplier({ thenPurchase: true })"
          />
          <ArchivoGuard
            v-else
            :state="supplierAccessGuard(step.emisor || {})"
            :copy-text="supplierAccessText(step.emisor || {})"
          />
        </div>

        <!-- Lines without an item: say which item each one is -->
        <div
          v-if="step?.status === 'needs_items'"
          class="space-y-3 rounded bg-surface-gray-1 p-3"
          role="status"
        >
          <p class="text-sm text-ink-gray-8">
            {{
              __(
                'Some lines are not in your products yet. Say which product each one is; Muelle remembers it for this supplier.',
              )
            }}
          </p>
          <div
            v-for="line in step.to_create || []"
            :key="line.line"
            class="space-y-1 rounded border border-outline-gray-2 bg-surface-base p-3"
          >
            <p class="break-words text-sm font-medium text-ink-gray-9">
              {{ line.descripcion }}
            </p>
            <p class="text-sm text-ink-gray-6">
              {{ quantity(line.cantidad) }} × {{ money(line.rate, card?.moneda)
              }}<template v-if="line.no_identificacion">
                · {{ __('Supplier code {0}', [line.no_identificacion]) }}
              </template>
            </p>
            <ul v-if="line.candidates?.length" class="space-y-1">
              <li
                v-for="candidate in line.candidates"
                :key="candidate.item_code"
                class="flex flex-wrap items-center gap-2"
              >
                <span class="min-w-0 flex-1 text-sm text-ink-gray-8"
                  >{{ candidate.item_name || candidate.item_code }}
                  <span
                    v-if="
                      candidate.item_name &&
                      candidate.item_name !== candidate.item_code
                    "
                    class="text-ink-gray-6"
                    >· {{ candidate.item_code }}</span
                  ></span
                >
                <Button
                  class="min-h-11 sm:min-h-0"
                  :label="__('This is the product')"
                  :loading="busy === 'learn:' + line.line + candidate.item_code"
                  @click="learn(line, candidate)"
                />
              </li>
            </ul>
            <p v-else class="text-sm text-ink-gray-6">
              {{ __('No similar product found.') }}
            </p>
          </div>
          <a
            v-if="itemsUrl"
            :href="itemsUrl"
            class="inline-flex min-h-11 items-center gap-2 text-sm text-ink-gray-8 underline sm:min-h-0"
            >{{ __('Add them in Inventario') }}</a
          >
        </div>
        <ArchivoGuard
          v-if="purchaseProblem"
          :state="purchaseProblem"
          @action="onActionGuard"
        />
      </section>

      <!-- The raw XML stays one tap away -->
      <div v-if="rawText">
        <Button
          variant="ghost"
          class="min-h-11 sm:min-h-0"
          icon-left="lucide-code"
          :aria-expanded="xmlOpen ? 'true' : 'false'"
          :label="xmlOpen ? __('Hide XML') : __('View XML')"
          @click="xmlOpen = !xmlOpen"
        />
        <pre
          v-if="xmlOpen"
          class="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded border border-outline-gray-2 bg-surface-gray-1 p-3 text-xs text-ink-gray-8"
          v-text="rawText"
        />
      </div>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, useId, watch } from 'vue'
import { Badge, Button, FeatherIcon } from 'frappe-ui'
import ArchivoGuard from './ArchivoGuard.vue'
import {
  archivosApi,
  archivosHref,
  doctypeLabel,
  problem,
  recordHref,
  safeReturn,
} from '@/composables/useArchivos'
import {
  fiscalDate,
  money,
  quantity,
  rate,
  serieFolio,
  taxRate,
} from './fiscalFormat'

// The human reading of a CFDI (who, what, how much, taxes, fiscal folio, SAT
// status) and its continuations: the records with the same folio, undo of an
// automatic link, and «Crear compra desde este CFDI», which Compras finishes.
const FISCAL = 'doco.docoutils.documents.fiscal'
const LEARN = 'doco.docoutils.cfdi_purchase_import.learn_cfdi_line'
const CONCEPTOS_SHOWN = 10

const props = defineProps({
  name: { type: String, required: true },
  returnTo: { type: String, default: '' },
  rawText: { type: String, default: '' },
})
const emit = defineEmits(['changed'])

const data = ref(null),
  loading = ref(false),
  loadProblem = ref(null),
  busy = ref(''),
  showAll = ref(false),
  xmlOpen = ref(false),
  copyNote = ref(''),
  step = ref(null),
  purchaseProblem = ref(null),
  supplierProblem = ref(null),
  undoProblem = ref(null)
// Retry from a guard repeats the action that failed.
let lastAction = null

// Section headings label their sections; ids stay unique per card.
const prefix = `cfdi${useId()}`
const ids = Object.fromEntries(
  [
    'who',
    'what',
    'howMuch',
    'payments',
    'related',
    'folio',
    'records',
    'purchase',
  ].map((k) => [k, `${prefix}-${k}`]),
)

const card = computed(() => data.value?.card || null)
const foreign = computed(
  () => card.value && String(card.value.moneda || 'MXN') !== 'MXN',
)
const shownConceptos = computed(() => {
  const all = card.value?.conceptos || []
  return showAll.value ? all : all.slice(0, CONCEPTOS_SHOWN)
})
const pdfHints = computed(() => {
  const d = data.value || {}
  const hints = d.pdf_hints || d.hints || {}
  return {
    uuid: hints.uuid || d.uuid || '',
    rfcs: hints.rfcs || d.rfcs || [],
  }
})
const satBadge = computed(() => {
  const estado = data.value?.sat?.estado
  if (estado === 'Cancelado')
    return { theme: 'red', label: __('Cancelled at the SAT') }
  if (estado === 'Vigente')
    return { theme: 'green', label: __('Valid at the SAT') }
  return { theme: 'gray', label: estado || '' }
})
const paymentTerms = computed(() => {
  const c = card.value || {}
  return [
    c.metodo_pago_label && __('Payment method: {0}', [c.metodo_pago_label]),
    c.forma_pago_label && __('Payment form: {0}', [c.forma_pago_label]),
    c.condiciones_pago && __('Terms: {0}', [c.condiciones_pago]),
  ]
    .filter(Boolean)
    .join(' · ')
})
// Sales CFDI are never purchases; a received one shows the action or why not.
const showPurchase = computed(
  () =>
    Boolean(data.value?.purchase) &&
    data.value?.source !== 'pdf' &&
    data.value?.direction !== 'issued',
)
const itemsUrl = computed(() => safeReturn(step.value?.items_url || ''))

function taxName(tax) {
  const label = tax.impuesto_label || tax.impuesto || ''
  if (tax.tipo_factor === 'Exento') return `${label} ${__('exempt')}`
  return `${label} ${taxRate(tax)}`.trim()
}
function here() {
  return archivosHref({ document: props.name, returnTo: props.returnTo })
}
function purchaseHref(name) {
  const params = new URLSearchParams({
    return_to: here(),
    return_label: 'Archivos',
  })
  return `/crm/gastos/factura/${encodeURIComponent(name)}?${params.toString()}`
}
function recordLink(doctype, name) {
  return doctype === 'Purchase Invoice'
    ? purchaseHref(name)
    : recordHref(doctype, name)
}
function supplierAccessGuard(emisor) {
  return {
    code: 'permission',
    message: __('Ask your manager to add {0} as a supplier.', [
      emisor.nombre || emisor.rfc || '',
    ]),
    actions: [{ label: __('Copy request'), kind: 'copy' }],
  }
}
function supplierAccessText(emisor) {
  return __(
    'Please add the supplier {0} (RFC {1}) in Muelle so I can register its invoice.',
    [emisor.nombre || '', emisor.rfc || ''],
  )
}

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  loadProblem.value = null
  try {
    const result = await archivosApi(`${FISCAL}.card`, { name: props.name })
    if (mine !== seq) return
    data.value = result || { available: false }
  } catch (error) {
    if (mine === seq) loadProblem.value = problem(error)
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch(
  () => props.name,
  () => {
    data.value = null
    step.value = null
    showAll.value = false
    xmlOpen.value = false
    purchaseProblem.value = supplierProblem.value = undoProblem.value = null
    load()
  },
  { immediate: true },
)

async function copyFolio(uuid) {
  try {
    await navigator.clipboard.writeText(uuid)
    copyNote.value = __('Fiscal folio copied.')
  } catch {
    copyNote.value = uuid
  }
}

async function createSupplier({ thenPurchase = false } = {}) {
  lastAction = () => createSupplier({ thenPurchase })
  busy.value = 'supplier'
  supplierProblem.value = null
  purchaseProblem.value = null
  try {
    await archivosApi(`${FISCAL}.create_supplier`, { name: props.name })
    await load()
    if (thenPurchase) await createPurchase()
  } catch (error) {
    ;(thenPurchase ? purchaseProblem : supplierProblem).value = problem(error)
  } finally {
    if (busy.value === 'supplier') busy.value = ''
  }
}

async function createPurchase() {
  if (!data.value) return
  lastAction = createPurchase
  busy.value = 'purchase'
  purchaseProblem.value = null
  try {
    const result = await archivosApi(`${FISCAL}.create_purchase`, {
      name: props.name,
      expected_modified: data.value.modified,
    })
    onPurchase(result || {})
  } catch (error) {
    purchaseProblem.value = problem(error)
  } finally {
    if (busy.value === 'purchase') busy.value = ''
  }
}
function onPurchase(result) {
  if (result.status === 'created' || result.status === 'duplicate') {
    step.value = null
    if (result.detail) emit('changed', result.detail)
    // Compras opens the purchase and brings the worker back here.
    const open =
      safeReturn(result.open_url || '') ||
      (result.purchase_invoice ? purchaseHref(result.purchase_invoice) : '')
    if (open) window.location.assign(open)
    else load()
    return
  }
  if (result.status === 'needs_supplier' || result.status === 'needs_items') {
    step.value = result
    return
  }
  step.value = null
  purchaseProblem.value = {
    code: 'error',
    message: __('We could not create the purchase. Try again in a moment.'),
    actions: [{ label: __('Try again'), kind: 'retry' }],
  }
}

async function learn(line, candidate) {
  lastAction = () => learn(line, candidate)
  busy.value = `learn:${line.line}${candidate.item_code}`
  purchaseProblem.value = null
  try {
    await archivosApi(LEARN, {
      supplier: step.value?.supplier,
      item_code: candidate.item_code,
      no_identificacion: line.no_identificacion || '',
      descripcion: line.descripcion || '',
    })
  } catch (error) {
    purchaseProblem.value = problem(error)
    busy.value = ''
    return
  }
  busy.value = ''
  await createPurchase()
}

async function undoLink(row) {
  lastAction = () => undoLink(row)
  busy.value = `undo:${row.doctype}${row.name}`
  undoProblem.value = null
  try {
    const detail = await archivosApi(`${FISCAL}.undo_link`, {
      name: props.name,
      reference_doctype: row.doctype,
      reference_name: row.name,
      expected_modified: data.value?.modified,
    })
    emit('changed', detail)
    await load()
  } catch (error) {
    const state = problem(error)
    if (state.code === 'conflict') {
      // Someone changed the document: show the current state, then undo again.
      await load()
      undoProblem.value = {
        ...state,
        message: __(
          'This document changed while you were looking at it. Check it and undo again.',
        ),
        actions: [],
      }
    } else undoProblem.value = state
  } finally {
    busy.value = ''
  }
}

function onLoadGuard(action) {
  if (action.kind === 'retry') load()
}
function onActionGuard(action) {
  if (action.kind === 'retry') {
    if (lastAction) lastAction()
    else load()
  }
}
</script>
