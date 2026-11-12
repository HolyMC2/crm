<template>
  <!-- One invoice in detail (capability «invoice_detail»): what it charges,
       line by line in Boat's words; credits, the partner discount and refunds
       as their own rows; the total with «IVA incluido: $X» under it; the
       period, how and when it was paid, the CFDI and the receipt. Rows and
       rules; «Pagar» is the one filled action, only on an invoice to pay. -->
  <BottomSheet
    :open="open"
    :title="view?.title || invoice?.title || ''"
    :subtitle="view?.status || ''"
    @update:open="(value) => !value && $emit('close')"
  >
    <div class="space-y-5 pb-2" data-testid="factura-detalle">
      <p
        v-if="busy && !view"
        class="py-4 text-base text-ink-gray-6"
        role="status"
      >
        {{ __('Loading the invoice…', null, 'Cuenta') }}
      </p>
      <div v-else-if="error && !view" role="alert" class="space-y-3 py-2">
        <p class="text-base text-ink-gray-8">{{ error }}</p>
        <Button
          class="min-h-11"
          :label="__('Try again', null, 'Cuenta')"
          :loading="busy"
          @click="load"
        />
      </div>
      <template v-else-if="view">
        <div>
          <p
            class="num title-face text-3xl font-semibold"
            :class="view.overdue ? 'text-ink-red-7' : 'text-ink-gray-9'"
            data-testid="detalle-total"
          >
            {{ view.total }}
          </p>
          <p
            v-if="view.iva"
            class="text-sm text-ink-gray-6"
            data-testid="detalle-iva"
          >
            {{ view.iva }}
          </p>
          <p v-if="view.period" class="pt-1 text-sm text-ink-gray-7">
            {{ __('Covers {0}.', [view.period], 'Cuenta') }}
          </p>
        </div>

        <section :aria-label="__('What you pay for', null, 'Cuenta')">
          <h3 class="pb-1 text-sm font-semibold text-ink-gray-7">
            {{ __('What you pay for', null, 'Cuenta') }}
          </h3>
          <ul
            class="divide-y divide-outline-gray-1"
            data-testid="detalle-lineas"
          >
            <li
              v-for="line in view.lines"
              :key="line.key"
              class="flex items-baseline gap-3 py-2"
            >
              <div class="min-w-0 flex-1">
                <p class="text-base text-ink-gray-8 [text-wrap:pretty]">
                  {{ line.label }}
                </p>
                <p v-if="line.detail" class="num text-sm text-ink-gray-6">
                  {{ line.detail }}
                </p>
              </div>
              <span class="num shrink-0 text-base text-ink-gray-9">{{
                line.amount
              }}</span>
            </li>
            <li
              v-if="view.subtotal"
              class="flex items-baseline gap-3 py-2 text-ink-gray-7"
            >
              <span class="min-w-0 flex-1 text-base">{{
                __('Subtotal', null, 'Cuenta')
              }}</span>
              <span class="num shrink-0 text-base">{{ view.subtotal }}</span>
            </li>
            <li
              v-for="line in view.credits"
              :key="line.key"
              class="flex items-baseline gap-3 py-2"
              data-testid="detalle-credito"
            >
              <span
                class="min-w-0 flex-1 text-base text-ink-gray-8 [text-wrap:pretty]"
                >{{ line.label }}</span
              >
              <span class="num shrink-0 text-base text-ink-green-8">{{
                line.amount
              }}</span>
            </li>
            <li class="flex items-baseline gap-3 py-2">
              <span
                class="min-w-0 flex-1 text-base font-semibold text-ink-gray-9"
                >{{ __('Total', null, 'Cuenta') }}</span
              >
              <span
                class="num shrink-0 text-base font-semibold text-ink-gray-9"
                >{{ view.total }}</span
              >
            </li>
          </ul>
        </section>

        <section
          v-if="view.refunds.length"
          :aria-label="__('Refunds', null, 'Cuenta')"
          data-testid="detalle-reembolsos"
        >
          <h3 class="pb-1 text-sm font-semibold text-ink-gray-7">
            {{ __('Refunds', null, 'Cuenta') }}
          </h3>
          <ul class="divide-y divide-outline-gray-1">
            <li
              v-for="row in view.refunds"
              :key="row.key"
              class="flex items-baseline gap-3 py-2"
            >
              <span class="min-w-0 flex-1 text-base text-ink-gray-8">{{
                row.label
              }}</span>
              <span class="num shrink-0 text-base text-ink-gray-9">{{
                row.amount
              }}</span>
            </li>
          </ul>
        </section>

        <!-- The CFDI and the payment receipt, as on the invoice's row. -->
        <section
          v-if="view.cfdi.length || view.cfdiNote || showReceipt"
          :aria-label="__('Documents', null, 'Cuenta')"
        >
          <p v-if="view.cfdiNote" class="text-sm text-ink-gray-6">
            {{ view.cfdiNote }}
          </p>
          <div class="flex flex-wrap items-start gap-x-3">
            <FacturaFiscal
              v-if="view.cfdi.length"
              :kinds="view.cfdi"
              :what="view.title"
              :busy="busyKind"
              :disabled="Boolean(downloading)"
              @download="download"
            />
            <button
              v-if="showReceipt"
              type="button"
              class="press -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-ink-gray-7 active:bg-surface-gray-2 disabled:opacity-50 [@media(hover:hover)]:hover:bg-surface-gray-2"
              :aria-label="
                __(
                  'Download the payment receipt of {0}',
                  [view.title],
                  'Cuenta',
                )
              "
              :disabled="Boolean(downloading)"
              data-testid="detalle-comprobante"
              @click="receipt"
            >
              <span
                :class="
                  downloading === 'receipt'
                    ? 'lucide-loader-circle animate-spin'
                    : 'lucide-receipt'
                "
                class="size-4"
                aria-hidden="true"
              />
              {{ __('Receipt (PDF)', null, 'Cuenta') }}
            </button>
          </div>
          <p v-if="fileError" role="alert" class="pt-1 text-sm text-ink-red-7">
            {{ fileError }}
          </p>
        </section>
      </template>
    </div>
    <template v-if="view && payLabel" #actions>
      <Button
        variant="solid"
        class="min-h-11 w-full"
        :label="payLabel"
        data-testid="detalle-pagar"
        @click="$emit('pay')"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { seam } from './api'
import { failureText, refusalView } from './autoservicio'
import { detailView } from './facturaDetalle'
import { downloadCfdi, downloadReceipt } from './facturacion'
import FacturaFiscal from './FacturaFiscal.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The invoice row tapped (facturacion.invoiceGroups): its name and title. */
  invoice: { type: Object, default: null },
  /** Whether Boat serves payment receipts here (capability «receipts»). */
  receipts: { type: Boolean, default: false },
  /** «Pagar $499.00» when the invoice can be paid now; '' otherwise. */
  payLabel: { type: String, default: '' },
  /** Saves a downloaded file; the browser's download when left out. */
  saveFile: { type: Function, default: null },
})
defineEmits(['close', 'pay'])

const answer = ref(null)
const busy = ref(false)
const error = ref('')
const downloading = ref('')
const fileError = ref('')
let seq = 0

const view = computed(() => detailView(answer.value))
const showReceipt = computed(
  () => props.receipts && Boolean(view.value?.receipt),
)
const busyKind = computed(() =>
  downloading.value && downloading.value !== 'receipt' ? downloading.value : '',
)

async function load() {
  const name = props.invoice?.name
  if (!name) return
  const mine = ++seq
  busy.value = true
  error.value = ''
  try {
    const out = await seam('invoice_detail', { invoice: name })
    if (mine !== seq) return
    if (out?.ok === true && out.invoice) answer.value = out
    else error.value = refusalView(out).text
  } catch (err) {
    if (mine === seq) error.value = failureText(err)
  } finally {
    if (mine === seq) busy.value = false
  }
}

// Each opening reads the invoice again: its payment or CFDI may have moved.
watch(
  () => [props.open, props.invoice?.name],
  ([open]) => {
    if (!open) return
    answer.value = null
    fileError.value = ''
    load()
  },
  { immediate: true },
)

async function download(kind) {
  if (downloading.value || !props.invoice?.name) return
  downloading.value = kind
  fileError.value = ''
  const options = props.saveFile ? { save: props.saveFile } : {}
  fileError.value = await downloadCfdi(
    { type: 'invoice', name: props.invoice.name, kind },
    options,
  )
  downloading.value = ''
}

async function receipt() {
  if (downloading.value || !props.invoice?.name) return
  downloading.value = 'receipt'
  fileError.value = ''
  const options = props.saveFile ? { save: props.saveFile } : {}
  fileError.value = await downloadReceipt(
    { type: 'invoice', name: props.invoice.name },
    options,
  )
  downloading.value = ''
}
</script>
