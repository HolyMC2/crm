<!--
  💰 Documentos — the deal's money documents (ERP_INTEGRATION_SPEC P1).
  Neutral: fed by doco_marketing.api.sales_docs (doco crm_deal joins), so it
  works with or without taller and on storefront-only deals. Mounted in
  DealContextPanel → covers Inbox AND Deal 360°. Flag-gated by the caller
  (salesDocsEnabled). "Ver" renders the print HTML in-app (sandboxed iframe,
  taller DocumentViewer pattern) — operators never need Desk to answer
  «¿ya pagó?».
-->
<template>
  <div class="flex-none border-b border-outline-gray-1 p-3.5">
    <div class="mb-2 flex items-center justify-between">
      <span class="text-[11px] font-bold uppercase tracking-[.08em] text-ink-gray-4">💰 {{ __('Documentos') }}</span>
      <button
        class="text-[11px] text-ink-gray-5 hover:text-ink-gray-8"
        :title="__('Actualizar')"
        :aria-label="__('Actualizar documentos')"
        @click="reloadSalesSummary(deal)"
      >↻</button>
    </div>

    <div v-if="salesSummary.loading && !salesSummary.data" class="py-2 text-[12px] text-ink-gray-5">
      {{ __('Cargando…') }}
    </div>
    <div v-else-if="salesSummary.error && !salesSummary.data" class="py-2 text-[12px] text-ink-red-3">
      {{ __('No se pudieron cargar los documentos.') }}
      <button class="ml-1 font-semibold underline" @click="reloadSalesSummary(deal)">{{ __('Reintentar') }}</button>
    </div>

    <template v-else-if="summary">
      <!-- rollup: the numbers that answer «¿ya pagó?» -->
      <div v-if="rollup && rollup.invoiced" class="mb-2.5">
        <div class="grid grid-cols-3 gap-1.5 text-center">
          <div class="rounded-lg bg-surface-gray-2 px-1.5 py-1.5">
            <div class="text-[9.5px] font-bold uppercase tracking-wide text-ink-gray-5">{{ __('Facturado') }}</div>
            <div class="text-[12.5px] font-bold tabular-nums text-ink-gray-9">{{ money(rollup.invoiced) }}</div>
          </div>
          <div class="rounded-lg bg-surface-green-2 px-1.5 py-1.5">
            <div class="text-[9.5px] font-bold uppercase tracking-wide text-ink-green-3">{{ __('Pagado') }}</div>
            <div class="text-[12.5px] font-bold tabular-nums text-ink-green-3">{{ money(rollup.paid) }}</div>
          </div>
          <div class="rounded-lg px-1.5 py-1.5" :class="rollup.outstanding > 0 ? 'bg-surface-red-1' : 'bg-surface-gray-2'">
            <div class="text-[9.5px] font-bold uppercase tracking-wide" :class="rollup.outstanding > 0 ? 'text-ink-red-4' : 'text-ink-gray-5'">{{ __('Saldo') }}</div>
            <div class="text-[12.5px] font-bold tabular-nums" :class="rollup.outstanding > 0 ? 'text-ink-red-4' : 'text-ink-gray-7'">{{ money(rollup.outstanding) }}</div>
          </div>
        </div>
        <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-gray-3" :title="__('Pagado vs facturado')">
          <div class="h-full rounded-full bg-surface-green-3" :style="`width:${paidPct}%`" />
        </div>
      </div>

      <div v-if="!hasAny" class="py-1 text-[12px] text-ink-gray-5">
        {{ __('Sin documentos de venta todavía.') }}
        <span class="text-ink-gray-4">{{ __('Cotiza desde 📦 Catálogo → «Cotizar».') }}</span>
      </div>

      <div v-else class="flex flex-col gap-2.5">
        <div v-for="g in groups" :key="g.label">
          <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5">{{ g.label }} · {{ g.docs.length }}</div>
          <div class="divide-y divide-outline-gray-1 overflow-hidden rounded-lg border border-outline-gray-1">
            <div
              v-for="d in g.docs"
              :key="d.doctype + d.name"
              class="flex items-center justify-between gap-2 px-2 py-1.5 text-[11.5px] hover:bg-surface-gray-1"
            >
              <button
                class="min-w-0 flex-1 text-left"
                :title="__('Ver documento')"
                @click="view(d.doctype || g.doctype, d.name)"
              >
                <div class="flex items-center gap-1.5">
                  <span class="truncate font-medium text-ink-blue-link">{{ d.name }}</span>
                  <span v-if="d.doctype === 'POS Invoice'" class="rounded bg-surface-gray-2 px-1 py-px text-[9.5px] text-ink-gray-5">POS</span>
                </div>
                <div class="mt-0.5 flex items-center gap-1.5">
                  <Badge :label="statusLabel(d)" :theme="statusTheme(d)" size="sm" />
                  <span class="text-[10px] text-ink-gray-5">{{ d.transaction_date || d.posting_date }}</span>
                </div>
              </button>
              <button
                v-if="g.doctype === 'Quotation'"
                class="flex-none rounded px-1 text-[13px] hover:bg-surface-gray-2"
                :title="d.docstatus === 0 ? __('Editar / enviar cotización') : __('Enviar / convertir cotización')"
                :aria-label="__('Editar cotización')"
                @click.stop="editingQuote = d.name"
              >✏️</button>
              <!-- 💳 cobrar en el chat (spec 4.1): MP link → editable composer draft -->
              <button
                v-if="g.doctype === 'Sales Invoice' && d.docstatus === 1 && Number(d.outstanding_amount) > 0"
                class="press flex-none rounded px-1 text-[13px] hover:bg-surface-gray-2 disabled:opacity-50"
                :disabled="cobrando === d.name"
                :title="__('Crear enlace de pago MercadoPago y ponerlo en el mensaje')"
                :aria-label="__('Cobrar')"
                @click.stop="cobrar(d)"
              >{{ cobrando === d.name ? '…' : '💳' }}</button>
              <div class="flex flex-none flex-col items-end gap-0.5">
                <span class="font-semibold tabular-nums text-ink-gray-8">{{ money(d.grand_total, d.currency) }}</span>
                <span v-if="d.doctype && d.docstatus === 1 && Number(d.outstanding_amount) > 0" class="text-[10px] font-semibold tabular-nums text-ink-red-4">
                  {{ __('debe') }} {{ money(d.outstanding_amount, d.currency) }}
                </span>
              </div>
            </div>
          </div>
          <QuoteEditor
            v-if="g.doctype === 'Quotation' && editingQuote"
            class="mt-1.5"
            :deal="deal"
            :quotation="editingQuote"
            @close="editingQuote = null"
            @changed="reloadSalesSummary(deal)"
          />
        </div>

        <!-- payments: display detail (the rollup's authority is the invoices) -->
        <div v-if="payments.length">
          <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-gray-5">{{ __('Pagos') }} · {{ payments.length }}</div>
          <div class="divide-y divide-outline-gray-1 overflow-hidden rounded-lg border border-outline-gray-1">
            <div v-for="p in payments" :key="p.name" class="flex items-center justify-between gap-2 px-2 py-1.5 text-[11.5px]">
              <div class="min-w-0">
                <div class="truncate font-medium text-ink-gray-8">{{ p.name }}</div>
                <div class="mt-0.5 text-[10px] text-ink-gray-5">
                  {{ p.posting_date }}<template v-if="p.mode_of_payment"> · {{ p.mode_of_payment }}</template>
                  <template v-if="p.payment_type !== 'Receive'"> · {{ __('egreso') }}</template>
                </div>
              </div>
              <span class="flex-none font-semibold tabular-nums text-ink-green-3">{{ money(p.allocated_amount) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- in-app document viewer (sandboxed print fragment; no scripts) -->
    <Dialog v-model="viewerOpen" :options="{ size: '4xl' }">
      <template #body>
        <div class="flex items-center justify-between border-b border-outline-gray-1 px-4 py-3">
          <h3 class="text-[14px] font-bold text-ink-gray-9">{{ viewer.name }}</h3>
          <div class="flex items-center gap-2">
            <button
              v-if="viewer.html"
              class="rounded-lg border border-outline-gray-2 bg-surface-gray-2 px-2.5 py-1 text-[12px] font-semibold text-ink-gray-8 hover:bg-surface-gray-3"
              @click="printDoc"
            >{{ __('Imprimir') }}</button>
            <a
              :href="`/app/${slug(viewer.doctype)}/${encodeURIComponent(viewer.name || '')}`"
              target="_blank"
              class="rounded-lg border border-outline-gray-2 px-2.5 py-1 text-[12px] text-ink-gray-6 hover:bg-surface-gray-2"
            >Desk ↗</a>
            <button class="text-ink-gray-5 hover:text-ink-gray-9" :aria-label="__('Cerrar')" @click="viewerOpen = false">✕</button>
          </div>
        </div>
        <div class="h-[70vh] bg-surface-gray-1">
          <div v-if="viewer.loading" class="py-10 text-center text-[12px] text-ink-gray-4">{{ __('Cargando…') }}</div>
          <div v-else-if="viewer.error" class="py-10 text-center text-[12px] text-ink-red-3">{{ viewer.error }}</div>
          <iframe
            v-else-if="viewer.html"
            ref="frame"
            :srcdoc="viewer.html"
            sandbox="allow-same-origin allow-modals allow-popups"
            class="h-full w-full border-0 bg-white"
          />
        </div>
      </template>
    </Dialog>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import { Badge, Dialog, call, toast } from 'frappe-ui'
import { globalStore } from '@/stores/global'
import { formatMoney } from '@/composables/crmFormat'
import { salesDocsEnabled, setComposerDraft } from '@/composables/inbox'
import { salesSummary, salesRollup, ensureSalesSummary, reloadSalesSummary } from '@/composables/salesDocs'
import QuoteEditor from '@/components/doco/inbox/QuoteEditor.vue'

const editingQuote = ref(null)

// 💳 cobrar en el chat (spec 4.1)
const cobrando = ref(null)
async function cobrar(d) {
  cobrando.value = d.name
  try {
    const out = await call('doco_marketing.api.inbox.create_payment_link', {
      deal: props.deal,
      invoice: d.name,
    })
    setComposerDraft({
      text:
        `Hola 👋 puede realizar su pago seguro en este enlace:\n${out.url}\n\n` +
        `*${d.name}* · ${formatMoney(out.amount, d.currency)}`,
      canned: 'cobro',
    })
    toast.success(__('Enlace de pago listo — edítalo y envíalo'))
  } catch (e) {
    toast.error(e.messages?.[0] || __('No se pudo crear el enlace de pago'))
  } finally {
    cobrando.value = null
  }
}

const props = defineProps({
  deal: { type: String, required: true },
})

const { $socket } = globalStore()

const summary = computed(() => salesSummary.data || null)
const rollup = salesRollup
const payments = computed(() => summary.value?.payments || [])
const hasAny = computed(
  () =>
    (summary.value?.quotations || []).length ||
    (summary.value?.sales_orders || []).length ||
    (summary.value?.invoices || []).length,
)
const paidPct = computed(() => {
  const r = rollup.value
  if (!r || !r.invoiced) return 0
  return Math.max(0, Math.min(100, Math.round((r.paid / r.invoiced) * 100)))
})

const groups = computed(() => [
  { label: __('Cotizaciones'), doctype: 'Quotation', docs: summary.value?.quotations || [] },
  { label: __('Órdenes de venta'), doctype: 'Sales Order', docs: summary.value?.sales_orders || [] },
  { label: __('Facturas'), doctype: 'Sales Invoice', docs: summary.value?.invoices || [] },
].filter((g) => g.docs.length))

// flag can resolve after mount (features loads async) — watch both
watch(
  [() => props.deal, salesDocsEnabled],
  ([deal], [prevDeal] = []) => {
    if (deal !== prevDeal) editingQuote.value = null
    ensureSalesSummary(props.deal)
  },
  { immediate: true },
)

// money events (SI/POS/PE submit) ping thread_update with channel "erp"
function onErp(payload) {
  if (payload?.channel === 'erp' && payload?.deal === props.deal) reloadSalesSummary()
}
onMounted(() => $socket?.on('doco_marketing:thread_update', onErp))
onUnmounted(() => $socket?.off('doco_marketing:thread_update', onErp))

function money(v, currency) {
  return formatMoney(v, currency || rollup.value?.currency)
}
function slug(doctype) {
  return String(doctype || '').toLowerCase().replace(/ /g, '-')
}

const STATUS_ES = {
  Draft: 'Borrador', Open: 'Abierta', Ordered: 'Pedida', Lost: 'Perdida',
  Cancelled: 'Cancelada', Expired: 'Expirada', Completed: 'Completada',
  Closed: 'Cerrada', 'To Deliver and Bill': 'Por entregar y facturar',
  'To Bill': 'Por facturar', 'To Deliver': 'Por entregar', 'On Hold': 'En espera',
  Paid: 'Pagada', Unpaid: 'Por pagar', 'Partly Paid': 'Pago parcial',
  Overdue: 'Vencida', Return: 'Devolución', Consolidated: 'Consolidada',
  Submitted: 'Emitida', 'Credit Note Issued': 'Nota de crédito',
}
function statusLabel(d) {
  if (d.docstatus === 0) return STATUS_ES.Draft
  return STATUS_ES[d.status] || __(d.status)
}
function statusTheme(d) {
  if (d.docstatus === 0) return 'gray'
  return {
    Paid: 'green', Completed: 'green', Ordered: 'green', Consolidated: 'green',
    Submitted: 'green', Open: 'blue', 'To Deliver and Bill': 'blue',
    'To Bill': 'blue', 'To Deliver': 'blue', Unpaid: 'orange',
    'Partly Paid': 'orange', Expired: 'orange', Overdue: 'red', Lost: 'red',
    Cancelled: 'red',
  }[d.status] || 'gray'
}

// ── in-app viewer ────────────────────────────────────────────────────────────
const viewerOpen = ref(false)
const frame = ref(null)
const viewer = reactive({ doctype: '', name: '', html: '', loading: false, error: '' })

async function view(doctype, name) {
  viewer.doctype = doctype
  viewer.name = name
  viewer.html = ''
  viewer.error = ''
  viewer.loading = true
  viewerOpen.value = true
  try {
    const out = await call('doco_marketing.api.sales_docs.render_sales_doc', {
      deal: props.deal, doctype, name,
    })
    viewer.html = out?.html || ''
    if (!viewer.html) viewer.error = __('El documento no se pudo renderizar.')
  } catch (e) {
    viewer.error = e?.messages?.[0] || __('El documento no se pudo renderizar.')
  } finally {
    viewer.loading = false
  }
}
function printDoc() {
  try {
    frame.value?.contentWindow?.print()
  } catch {
    /* sandboxed print denied — Desk link remains */
  }
}
</script>
