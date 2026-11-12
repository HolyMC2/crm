<template>
  <!-- Facturación: the invoices to pay first, each with its own «Pagar» (or the
       same payment to continue) and, when Boat keeps it shut, why and the way
       on; then the paid ones with their CFDI, the saved cards, and the wallet
       with its ledger last (the long list). Where Boat offers them: payment
       receipts on paid rows, Datos fiscales after the invoices, and «Agregar
       tarjeta». Rows and rules. -->
  <div class="space-y-8">
    <section aria-labelledby="cuenta-facturas">
      <h2
        id="cuenta-facturas"
        class="title-face pb-1 text-xl font-semibold text-ink-gray-9"
      >
        {{ __('Invoices', null, 'Cuenta') }}
      </h2>
      <p
        v-if="!groups.due.length && !groups.done.length"
        class="py-3 text-base text-ink-gray-7"
      >
        {{ __('No invoices yet.', null, 'Cuenta') }}
      </p>
      <ul
        v-if="groups.due.length"
        class="divide-y divide-outline-gray-1"
        data-testid="cuenta-por-pagar"
      >
        <li v-for="inv in groups.due" :key="inv.name" class="py-3">
          <div class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-base font-medium text-ink-gray-9">
                {{ inv.title }}
              </p>
              <p
                class="text-sm"
                :class="inv.overdue ? 'text-ink-red-7' : 'text-ink-gray-6'"
              >
                {{ inv.line }}
              </p>
            </div>
            <span
              class="num shrink-0 text-base font-semibold"
              :class="inv.overdue ? 'text-ink-red-7' : 'text-ink-gray-9'"
              >{{ inv.amount }}</span
            >
          </div>
          <!-- One filled «Pagar»: the oldest invoice that can be paid now. -->
          <Button
            :variant="inv.name === firstToPay ? 'solid' : 'subtle'"
            class="mt-2 min-h-11 w-full sm:w-auto"
            :label="payLabel(inv)"
            :disabled="door.invoiceBlocked(inv)"
            :aria-describedby="`cuenta-pago-${inv.name}`"
            data-testid="factura-pagar"
            @click="door.payInvoice(inv)"
          />
          <div
            v-if="
              door.invoiceBlocked(inv) || door.invoiceErrors.value[inv.name]
            "
            :id="`cuenta-pago-${inv.name}`"
            role="status"
            class="mt-2 space-y-2"
          >
            <p class="text-sm text-ink-gray-7">
              {{ door.invoicePaymentReason(inv) }}
            </p>
            <div class="flex flex-wrap gap-2">
              <Button
                class="min-h-11"
                :label="__('Check status', null, 'Cuenta')"
                :loading="door.loading.value"
                @click="door.load()"
              />
              <Button
                class="min-h-11"
                :label="__('Check the payment with support', null, 'Cuenta')"
                @click="askSupport('invoices')"
              />
            </div>
          </div>
        </li>
      </ul>
      <ul
        v-if="groups.done.length"
        class="divide-y divide-outline-gray-1"
        :class="groups.due.length ? 'border-t border-outline-gray-1' : ''"
        data-testid="cuenta-facturas-pagadas"
      >
        <li v-for="inv in groups.done" :key="inv.name" class="py-3">
          <div class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-base font-medium text-ink-gray-9">
                {{ inv.title }}
              </p>
              <p class="text-sm text-ink-gray-6">{{ inv.line }}</p>
            </div>
            <span class="num shrink-0 text-base text-ink-gray-9">{{
              inv.amount
            }}</span>
          </div>
          <p
            v-if="!inv.cfdi.length && inv.fiscalPending"
            class="mt-1 text-sm text-ink-gray-6"
          >
            {{ __('Fiscal invoice pending', null, 'Cuenta') }}
          </p>
          <!-- The CFDI and the payment receipt: one row of quiet actions under
               the figures, wrapping on a narrow phone. -->
          <div
            v-if="inv.cfdi.length || (caps.receipts && inv.receipt === true)"
            class="mt-1 flex flex-wrap items-start gap-x-3"
          >
            <FacturaFiscal
              v-if="inv.cfdi.length"
              :kinds="inv.cfdi"
              :what="inv.title"
              :busy="busyKind(inv.name)"
              :disabled="Boolean(downloading)"
              @download="(kind) => download('invoice', inv.name, kind)"
            />
            <!-- The payment receipt (not a CFDI), where Boat serves it. -->
            <button
              v-if="caps.receipts && inv.receipt === true"
              type="button"
              class="press -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-ink-gray-7 active:bg-surface-gray-2 disabled:opacity-50 [@media(hover:hover)]:hover:bg-surface-gray-2"
              :aria-label="
                __('Download the payment receipt of {0}', [inv.title], 'Cuenta')
              "
              :disabled="Boolean(downloading)"
              data-testid="factura-comprobante"
              @click="receipt('invoice', inv.name)"
            >
              <span
                :class="
                  downloading === `${inv.name}:receipt`
                    ? 'lucide-loader-circle animate-spin'
                    : 'lucide-receipt'
                "
                class="size-4"
                aria-hidden="true"
              />
              {{ __('Receipt (PDF)', null, 'Cuenta') }}
            </button>
          </div>
          <!-- A failed receipt says so under the row that was tapped. -->
          <div
            v-if="receiptFailed('invoice', inv.name)"
            role="alert"
            class="mt-1 space-y-2"
            data-testid="comprobante-error"
          >
            <p class="text-sm text-ink-red-7">{{ receiptError.text }}</p>
            <Button
              class="min-h-11"
              :label="__('Ask support for help', null, 'Cuenta')"
              @click="askSupport('invoices')"
            />
          </div>
        </li>
      </ul>
      <div v-if="downloadError" role="alert" class="mt-2 space-y-2">
        <p class="text-sm text-ink-red-7">{{ downloadError }}</p>
        <Button
          class="min-h-11"
          :label="__('Check the CFDI with support', null, 'Cuenta')"
          @click="askSupport('invoices')"
        />
      </div>
      <p
        v-if="door.supportError.value && supportAt === 'invoices'"
        class="pt-2 text-sm text-ink-red-7"
      >
        {{ door.supportError.value }}
      </p>
      <p class="pt-2 text-sm text-ink-gray-6">
        {{
          __(
            'The charge happens on the payment processor’s secure page. Muelle keeps no card data.',
            null,
            'Cuenta',
          )
        }}
      </p>
    </section>

    <!-- Datos fiscales where Boat takes them from the panel (capability «billing_profile»). -->
    <DatosFiscales v-if="caps.billingProfile" :door="door" />

    <section aria-labelledby="cuenta-tarjetas" data-testid="cuenta-tarjetas">
      <h2
        id="cuenta-tarjetas"
        class="title-face pb-1 text-xl font-semibold text-ink-gray-9"
      >
        {{ __('Saved cards', null, 'Cuenta') }}
      </h2>
      <ul v-if="cards.length" class="divide-y divide-outline-gray-1">
        <li
          v-for="card in cards"
          :key="card.id"
          class="flex items-center gap-3 py-2"
        >
          <span
            class="lucide-credit-card size-5 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <p class="num text-base text-ink-gray-9">{{ card.title }}</p>
            <p v-if="card.expires" class="text-sm text-ink-gray-6">
              {{ card.expires }}
            </p>
          </div>
          <!-- A small delete is two taps in place: the bin, then «Borrar». -->
          <button
            v-if="arming !== card.id"
            type="button"
            class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2 disabled:opacity-50"
            :aria-label="__('Remove the card {0}', [card.title], 'Cuenta')"
            :title="__('Remove the card {0}', [card.title], 'Cuenta')"
            :disabled="door.paymentActionsBlocked()"
            data-testid="tarjeta-borrar"
            @click="arm(card.id)"
          >
            <span class="lucide-trash-2 size-5" aria-hidden="true" />
          </button>
          <button
            v-else
            :ref="(el) => (confirmButton = el)"
            type="button"
            class="press min-h-11 flex-none rounded-full bg-surface-red-7 px-4 text-base font-medium text-white disabled:opacity-50"
            :disabled="door.busy.value === 'card'"
            data-testid="tarjeta-borrar-si"
            @click="remove(card)"
            @blur="disarm"
          >
            {{
              door.busy.value === 'card'
                ? __('Removing…', null, 'Cuenta')
                : __('Delete', null, 'Cuenta')
            }}
          </button>
        </li>
      </ul>
      <p v-else-if="cardsRead" class="py-2 text-base text-ink-gray-7">
        {{
          __(
            'No saved cards. Every payment happens on the processor’s secure page.',
            null,
            'Cuenta',
          )
        }}
      </p>
      <p
        v-if="door.cardError.value"
        role="alert"
        class="py-1 text-sm text-ink-red-7"
      >
        {{ door.cardError.value }}
      </p>
      <!-- With Boat's card setup (capability «card_setup»), the card goes in
           Stripe's own field in a sheet. Without it Boat has no card capture
           wired in the panel (start_card_setup hands back a rail handshake
           only), and a hosted payment does not keep the card: adding one goes
           through support. -->
      <template v-if="caps.cardSetup">
        <Button
          variant="subtle"
          class="mt-2 min-h-11"
          :label="__('Add a card', null, 'Cuenta')"
          :disabled="door.paymentActionsBlocked()"
          data-testid="tarjeta-agregar"
          @click="addCard"
        >
          <template #prefix>
            <span class="lucide-plus size-4" aria-hidden="true" />
          </template>
        </Button>
        <p
          v-if="door.paymentActionsBlocked() && !door.loading.value"
          class="pt-1 text-sm text-ink-gray-6"
          role="status"
        >
          {{ door.paymentActionReason.value }}
        </p>
      </template>
      <template v-else>
        <p class="pt-2 text-sm text-ink-gray-6" data-testid="tarjeta-agregar">
          {{
            __(
              'Adding or replacing a card is not done here yet: support does it for you.',
              null,
              'Cuenta',
            )
          }}
        </p>
        <Button
          class="mt-2 min-h-11"
          :label="__('Ask support about my card', null, 'Cuenta')"
          @click="askSupport('cards')"
        />
      </template>
      <p
        v-if="door.supportError.value && supportAt === 'cards'"
        class="pt-2 text-sm text-ink-red-7"
      >
        {{ door.supportError.value }}
      </p>
      <TarjetaSheet
        v-if="cardMounted"
        :open="addingCard && !door.loading.value"
        @close="addingCard = false"
        @act="cardAct"
        @saved="cardSaved"
      />
    </section>
    <section
      v-if="wallet"
      aria-labelledby="cuenta-saldo"
      data-testid="cuenta-saldo"
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 pb-1">
        <h2
          id="cuenta-saldo"
          class="title-face min-w-0 flex-1 text-xl font-semibold text-ink-gray-9"
        >
          {{ __('Wallet', null, 'Cuenta') }}
        </h2>
        <span
          class="num text-xl font-semibold text-ink-gray-9"
          data-testid="saldo-monto"
          >{{ wallet.text }}</span
        >
        <Button
          variant="subtle"
          class="min-h-11"
          :label="__('Top up', null, 'Cuenta')"
          :disabled="door.paymentActionsBlocked()"
          @click="$emit('act', 'topup')"
        />
      </div>
      <p v-if="wallet.pace" class="text-sm text-ink-gray-6">
        {{ wallet.pace }}
      </p>
      <h3 class="pb-1 pt-4 text-sm font-semibold text-ink-gray-7">
        {{ __('Movements', null, 'Cuenta') }}
      </h3>
      <ul
        v-if="movements.length"
        class="divide-y divide-outline-gray-1"
        data-testid="cuenta-movimientos"
      >
        <li v-for="row in movements" :key="row.key" class="py-2.5">
          <div class="flex items-baseline gap-3">
            <span class="min-w-0 flex-1 text-base text-ink-gray-8">{{
              row.label
            }}</span>
            <span
              class="num shrink-0 text-base"
              :class="row.credit ? 'text-ink-green-8' : 'text-ink-gray-9'"
              >{{ row.amount }}</span
            >
          </div>
          <p class="text-sm text-ink-gray-6">{{ row.when }}</p>
          <p
            v-if="!row.receipts.length && row.receiptPending"
            class="text-sm text-ink-gray-6"
          >
            {{ __('Fiscal invoice pending', null, 'Cuenta') }}
          </p>
          <div
            v-if="row.receipts.length || (caps.receipts && row.paidTopup)"
            class="flex flex-wrap items-start gap-x-3"
          >
            <FacturaFiscal
              v-if="row.receipts.length"
              :kinds="row.receipts"
              :what="__('the top-up', null, 'Cuenta')"
              :busy="busyKind(row.name)"
              :disabled="Boolean(downloading)"
              @download="(kind) => download('topup', row.name, kind)"
            />
            <button
              v-if="caps.receipts && row.paidTopup"
              type="button"
              class="press -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-ink-gray-7 active:bg-surface-gray-2 disabled:opacity-50 [@media(hover:hover)]:hover:bg-surface-gray-2"
              :aria-label="
                __(
                  'Download the payment receipt of {0}',
                  [__('the top-up', null, 'Cuenta')],
                  'Cuenta',
                )
              "
              :disabled="Boolean(downloading)"
              data-testid="recarga-comprobante"
              @click="receipt('topup', row.name)"
            >
              <span
                :class="
                  downloading === `${row.name}:receipt`
                    ? 'lucide-loader-circle animate-spin'
                    : 'lucide-receipt'
                "
                class="size-4"
                aria-hidden="true"
              />
              {{ __('Receipt (PDF)', null, 'Cuenta') }}
            </button>
          </div>
          <!-- A failed receipt says so under the row that was tapped. -->
          <div
            v-if="receiptFailed('topup', row.name)"
            role="alert"
            class="mt-1 space-y-2"
            data-testid="comprobante-error"
          >
            <p class="text-sm text-ink-red-7">{{ receiptError.text }}</p>
            <Button
              class="min-h-11"
              :label="__('Ask support for help', null, 'Cuenta')"
              @click="askSupport('wallet')"
            />
          </div>
        </li>
      </ul>
      <p
        v-else-if="door.txnsLoaded.value"
        class="py-2 text-base text-ink-gray-7"
      >
        {{ __('No movements yet.', null, 'Cuenta') }}
      </p>
      <p
        v-if="door.supportError.value && supportAt === 'wallet'"
        class="pt-2 text-sm text-ink-red-7"
      >
        {{ door.supportError.value }}
      </p>
      <div v-if="door.txnsError.value" role="alert" class="space-y-2 py-2">
        <p class="text-sm text-ink-red-7">{{ door.txnsError.value }}</p>
        <Button
          class="min-h-11"
          :label="__('Try again', null, 'Cuenta')"
          @click="door.loadTxns()"
        />
      </div>
      <Button
        v-if="!door.txnsDone.value && movements.length"
        variant="ghost"
        class="mt-2 min-h-11 w-full"
        :loading="door.txnsBusy.value"
        :label="__('Load more', null, 'Cuenta')"
        @click="door.loadTxns()"
      />
    </section>
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, ref } from 'vue'
import { Button, toast } from 'frappe-ui'
import { capable } from './autoservicio'
import { walletView } from './cuenta'
import FacturaFiscal from './FacturaFiscal.vue'
import {
  cardRows,
  downloadCfdi,
  downloadReceipt,
  invoiceGroups,
  serviceNames,
  txnRows,
} from './facturacion'
import { safeContinuation } from './pagos'

// Only where Boat offers them: Datos fiscales, and the card sheet on its first open.
const DatosFiscales = defineAsyncComponent(() => import('./DatosFiscales.vue'))
const TarjetaSheet = defineAsyncComponent(() => import('./TarjetaSheet.vue'))

const props = defineProps({
  /** The page's payment door (pagos.js createPagos). */
  door: { type: Object, required: true },
  /** Saves a downloaded file; the browser's download when left out. */
  saveFile: { type: Function, default: null },
})
defineEmits(['act'])

const data = computed(() => props.door.boot.value)
const groups = computed(() => invoiceGroups(data.value))
const wallet = computed(() => walletView(data.value))
const names = computed(() => serviceNames(data.value))
const movements = computed(() => txnRows(props.door.txns.value, names.value))
const cards = computed(() => cardRows(props.door.cards.value))
const cardsRead = ref(false)
const arming = ref('')
const confirmButton = ref(null)
const downloading = ref('')
const downloadError = ref('')
// The receipt that failed ({type, name}) and why: said under its own row.
const receiptError = ref({ type: '', name: '', text: '' })
// Where the last support ask came from: its error shows there.
const supportAt = ref('invoices')
const cardMounted = ref(false)
const addingCard = ref(false)
// What Boat has on for this site (bootstrap.capabilities); none on an older Boat.
const caps = computed(() => ({
  billingProfile: capable(data.value, 'billing_profile'),
  cardSetup: capable(data.value, 'card_setup'),
  receipts: capable(data.value, 'receipts'),
}))
// The oldest invoice due that nothing holds: its «Pagar» is the filled one.
const firstToPay = computed(
  () =>
    groups.value.due.find((inv) => !props.door.invoiceBlocked(inv))?.name || '',
)

onMounted(async () => {
  // Mi plan's openTab('facturacion'): the cards, and the ledger once.
  if (wallet.value && !props.door.txnsLoaded.value)
    props.door.loadTxns({ reset: true })
  await props.door.loadCards()
  cardsRead.value = true
})

function payLabel(inv) {
  if (props.door.busy.value === 'pay:' + inv.name)
    return __('Opening…', null, 'Cuenta')
  return safeContinuation(props.door.invoiceState(inv))
    ? __('Continue the secure payment', null, 'Cuenta')
    : __('Pay {0}', [inv.amount], 'Cuenta')
}

function busyKind(name) {
  const at = downloading.value.lastIndexOf(':')
  return at > 0 && downloading.value.slice(0, at) === name
    ? downloading.value.slice(at + 1)
    : ''
}

async function download(type, name, kind) {
  if (downloading.value) return
  downloading.value = `${name}:${kind}`
  downloadError.value = ''
  const options = props.saveFile ? { save: props.saveFile } : {}
  downloadError.value = await downloadCfdi({ type, name, kind }, options)
  downloading.value = ''
}

async function receipt(type, name) {
  if (downloading.value) return
  downloading.value = `${name}:receipt`
  receiptError.value = { type: '', name: '', text: '' }
  const options = props.saveFile ? { save: props.saveFile } : {}
  const text = await downloadReceipt({ type, name }, options)
  receiptError.value = { type, name, text }
  downloading.value = ''
}
function receiptFailed(type, name) {
  const failed = receiptError.value
  return Boolean(failed.text) && failed.type === type && failed.name === name
}

function askSupport(where, description = '') {
  supportAt.value = where
  props.door.contactSupport(description)
}

function addCard() {
  if (props.door.paymentActionsBlocked()) return
  cardMounted.value = true
  addingCard.value = true
}
// The card sheet's next step (support) once the sheet is closed: support's
// own dialog never opens under the modal sheet.
async function cardAct(key) {
  addingCard.value = false
  await nextTick()
  if (key === 'support') askSupport('cards')
}
async function cardSaved() {
  addingCard.value = false
  toast.success(__('Card saved', null, 'Cuenta'))
  await props.door.loadCards()
}

async function arm(id) {
  arming.value = id
  await nextTick()
  confirmButton.value?.focus?.()
}
function disarm() {
  if (props.door.busy.value !== 'card') arming.value = ''
}
async function remove(card) {
  const done = await props.door.removeCard(card)
  arming.value = ''
  if (done) toast.success(__('Card removed', null, 'Cuenta'))
}
</script>
