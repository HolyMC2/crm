<template>
  <div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-3xl px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <a
        :href="backHref"
        data-testid="back-to-list"
        class="hidden min-h-11 items-center gap-1 text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9 sm:inline-flex"
        @click="goBack"
        ><span class="lucide-arrow-left size-4" aria-hidden="true" />{{
          __('Back to {0}', [backLabel])
        }}</a
      >
      <div
        v-if="problem && !doc"
        role="alert"
        class="mt-4 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <div class="mt-2 flex flex-wrap gap-2">
          <Button :label="__('Retry', null, CTX)" @click="load" />
          <Button :label="__('Back to {0}', [backLabel])" @click="goBack" />
        </div>
      </div>
      <template v-else-if="head">
        <!-- The header paints from the list row at once; the lines follow. -->
        <header class="mt-2" data-testid="ticket-header">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1
              class="title-face break-words text-2xl font-semibold leading-tight text-ink-gray-9"
            >
              {{ head.title }}
            </h1>
            <StatusChip v-if="head.status" :status="head.status" />
          </div>
          <p class="mt-1 break-words text-sm text-ink-gray-6">
            {{ head.when }}
          </p>
          <p class="num mt-3 text-4xl font-semibold leading-none">
            {{ money(head.total, head.currency) }}
          </p>
          <p
            v-if="head.owed"
            class="num mt-1 text-base font-medium text-ink-red-7"
          >
            {{ __('Owes {0}', [money(head.owed, head.currency)], CTX) }}
          </p>
        </header>
        <div v-if="dealHref || customerHref" class="mt-4 flex flex-wrap gap-2">
          <Button
            v-if="dealHref"
            variant="solid"
            class="press min-h-11"
            :label="__('Open the sale in Ventas')"
            @click="go(dealHref)"
          />
          <Button
            v-if="customerHref"
            class="press min-h-11"
            :label="__('Open the customer')"
            @click="go(customerHref)"
          />
        </div>
        <p
          v-if="doc?.header.is_return"
          class="mt-3 rounded-6 bg-surface-amber-1 p-2 text-sm text-ink-amber-8"
        >
          {{
            __('This is a return of {0}.', [doc.header.return_against || ''])
          }}
        </p>
        <div
          v-if="!doc"
          role="status"
          :aria-label="__('Loading')"
          class="mt-6 space-y-2"
        >
          <div class="skel h-4 w-24 rounded-4" />
          <div class="skel h-40 rounded-7" />
          <div class="skel h-20 rounded-7" />
        </div>
        <div v-else class="detail-in">
          <section
            v-if="doc.items?.length"
            class="mt-6"
            :aria-label="__('Lines', null, CTX)"
          >
            <h2
              class="mb-2 flex items-baseline justify-between text-sm font-semibold text-ink-gray-8"
            >
              {{ __('What was sold', null, CTX) }}
              <span class="num font-normal text-ink-gray-6">{{
                __('{0} items', [lineCount], CTX)
              }}</span>
            </h2>
            <ul
              class="divide-y divide-outline-gray-1 overflow-hidden rounded-7 border border-outline-gray-1 bg-surface-elevation-1"
              data-testid="ticket-lines"
            >
              <li v-for="(item, i) in doc.items" :key="i">
                <UiTag
                  :as="lineTo(item) ? RouterLink : 'div'"
                  :to="lineTo(item) || undefined"
                  class="flex min-h-14 items-start gap-3 px-4 py-3"
                  :class="
                    lineTo(item)
                      ? 'transition-colors hover:bg-surface-gray-1 active:bg-surface-gray-2'
                      : ''
                  "
                  :data-testid="lineTo(item) ? 'ticket-line-link' : undefined"
                >
                  <span class="min-w-0 flex-1">
                    <span
                      class="line-clamp-2 break-words font-medium text-ink-gray-9"
                      >{{
                        item.item_name ||
                        item.item_code ||
                        modeOfPaymentLabel(item.mode_of_payment)
                      }}</span
                    >
                    <span
                      v-if="lineDetail(item)"
                      class="num mt-0.5 block text-sm text-ink-gray-6"
                      >{{ lineDetail(item) }}</span
                    >
                    <span
                      v-for="serial in serials(item)"
                      :key="serial"
                      class="num mt-0.5 block break-all text-sm text-ink-gray-6"
                      >{{ __('IMEI or serial {0}', [serial], CTX) }}</span
                    >
                  </span>
                  <span class="num shrink-0 pt-0.5 font-semibold">{{
                    money(
                      item.amount ?? item.difference ?? 0,
                      doc.header.currency || currency,
                    )
                  }}</span>
                  <span
                    v-if="lineTo(item)"
                    class="lucide-chevron-right mt-1 size-4 shrink-0 text-ink-gray-4"
                    aria-hidden="true"
                  />
                </UiTag>
              </li>
            </ul>
            <p
              v-if="doc.items_total > doc.items.length"
              class="mt-2 text-sm text-ink-gray-6"
            >
              {{ __('Showing the first {0} lines.', [doc.items.length], CTX) }}
            </p>
          </section>
          <section
            v-if="payments.length || totals.length"
            class="mt-6"
            :aria-label="__('Payments')"
          >
            <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
              {{ __('Payments') }}
            </h2>
            <ul
              class="divide-y divide-outline-gray-1 overflow-hidden rounded-7 border border-outline-gray-1 bg-surface-elevation-1"
            >
              <li
                v-for="(p, i) in payments"
                :key="`p${i}`"
                class="flex min-h-12 items-center gap-3 px-4 py-2 text-base"
              >
                <span class="min-w-0 flex-1 truncate">{{
                  modeOfPaymentLabel(p.mode_of_payment)
                }}</span>
                <span class="num">{{
                  money(
                    p.amount ?? p.closing_amount ?? 0,
                    doc.header.currency || currency,
                  )
                }}</span>
              </li>
              <li
                v-for="t in totals"
                :key="t.key"
                class="flex min-h-12 items-center gap-3 px-4 py-2 text-base"
                :class="t.key === 'total' ? 'font-semibold' : 'text-ink-gray-7'"
              >
                <span class="min-w-0 flex-1 truncate">{{ t.label }}</span>
                <span
                  class="num"
                  :class="t.key === 'owed' ? 'text-ink-red-7' : ''"
                  >{{ money(t.amount, doc.header.currency || currency) }}</span
                >
              </li>
            </ul>
          </section>
          <section
            v-if="doc.reconciliation?.length"
            class="mt-6"
            :aria-label="__('Cash count')"
          >
            <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
              {{ __('Cash count') }}
            </h2>
            <ul
              class="divide-y divide-outline-gray-1 overflow-hidden rounded-7 border border-outline-gray-1 bg-surface-elevation-1"
            >
              <li
                v-for="(r, i) in doc.reconciliation"
                :key="i"
                class="grid grid-cols-[1fr_auto] gap-x-3 px-4 py-3 text-base"
              >
                <span class="truncate">{{
                  modeOfPaymentLabel(r.mode_of_payment)
                }}</span>
                <span
                  class="num"
                  :class="r.difference ? 'text-ink-red-7' : ''"
                  >{{ money(r.difference ?? 0, currency) }}</span
                >
                <span class="col-span-2 text-xs text-ink-gray-6">{{
                  __('Expected {0} · counted {1}', [
                    money(r.expected_amount ?? 0, currency),
                    money(r.closing_amount ?? 0, currency),
                  ])
                }}</span>
              </li>
            </ul>
            <p class="mt-2 text-xs text-ink-gray-6">
              {{ __('The supervisor reviews and recounts at the register.') }}
            </p>
          </section>
          <p
            v-if="doctype === 'Sales Invoice'"
            class="mt-6 text-sm text-ink-gray-6"
          >
            {{ __('Reprints and returns are made at the register.') }}
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { StatusChip } from '@/components/ui'
import UiTag from '@/components/ui/UiTag'
import { problemOf } from '@/composables/useCobranza'
import { money } from '@/composables/useCompras'
import { shellBoot } from '@/composables/muelleShell'
import {
  CTX,
  RETURN_LABEL,
  clockText,
  documentFromMemory,
  fetchDocument,
  productHref,
  routerPath,
  rowFromMemory,
  walkInName,
} from '@/composables/useResultados'
import { modeOfPaymentLabel } from '@/utils/modeOfPayment'
import { formatDay } from '@/utils/contactos'
import { formatQty, kindLabel, personName } from '@/utils/display'
import {
  moduleEnabled,
  readReturn,
  withReturn,
} from '@/vendor/muelle-shell/contracts'

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
})
const route = useRoute()
const router = useRouter()
const doc = ref(null)
const problem = ref(null)

const currency = computed(() => shellBoot.value?.currency || '')
const caller = computed(() =>
  readReturn(new URLSearchParams(route.query), {
    allowedPrefixes: ['/crm/'],
    acceptLegacy: false,
  }),
)
const backHref = computed(() => caller.value?.to || '/crm/resultados')
const backLabel = computed(() => caller.value?.label || RETURN_LABEL)
const payments = computed(() => doc.value?.payments || [])
const here = computed(() => `/crm${route.fullPath}`)
// Until the ticket arrives, the row it was opened from names it.
const seed = computed(() => rowFromMemory(props.doctype, props.name))
const head = computed(() => {
  const h = doc.value?.header
  const row = seed.value
  if (!h && !row) return null
  const owner = doc.value?.owner || row?.owner
  const day = h?.posting_date || row?.posting_date
  const time = clockText(h?.posting_time) || row?.posting_time || ''
  const owed = Number(h ? h.outstanding_amount : row?.outstanding) || 0
  return {
    title:
      walkInName(h?.customer_name || row?.title) ||
      h?.pos_profile ||
      kindLabel(props.doctype),
    status: h?.status || row?.status || '',
    when: [
      [day ? formatDay(day) : '', time].filter(Boolean).join(', '),
      owner ? __('Rung up by {0}', [personName(owner)], CTX) : '',
      h?.pos_profile ? h.pos_profile : '',
    ]
      .filter(Boolean)
      .join(' · '),
    total: h ? h.grand_total ?? h.total ?? 0 : row?.amount || 0,
    owed: owed > 0.005 ? owed : 0,
    currency: h?.currency || currency.value,
  }
})
// «Volver a vianey…»: the way back names the customer, never the folio.
const backName = computed(() => head.value?.title || RETURN_LABEL)
const lineCount = computed(
  () => doc.value?.items_total || doc.value?.items?.length || 0,
)
// What the customer paid against the total: change given, what is still owed.
const totals = computed(() => {
  const h = doc.value?.header
  if (!h || props.doctype !== 'Sales Invoice') return []
  const out = []
  const change = Number(h.change_amount) || 0
  const owed = Number(h.outstanding_amount) || 0
  if (change > 0.005)
    out.push({
      key: 'change',
      label: __('Change given', null, CTX),
      amount: change,
    })
  out.push({
    key: 'total',
    label: __('Total', null, CTX),
    amount: h.rounded_total || h.grand_total || 0,
  })
  if (owed > 0.005)
    out.push({ key: 'owed', label: __('Still owed', null, CTX), amount: owed })
  return out
})
const canOpenProducts = computed(() =>
  moduleEnabled(shellBoot.value, 'productos'),
)
function lineTo(item) {
  if (
    !canOpenProducts.value ||
    !item.item_code ||
    props.doctype !== 'Sales Invoice'
  )
    return null
  return routerPath(productHref(item.item_code, here.value, backName.value))
}
function lineDetail(item) {
  if (item.qty === undefined) return ''
  const qty = formatQty(item.qty, item.uom || item.stock_uom)
  return item.rate !== undefined
    ? `${qty} × ${money(item.rate, doc.value?.header?.currency || currency.value)}`
    : qty
}
function serials(item) {
  return String(item.serial_no || '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5)
}
const dealHref = computed(() =>
  doc.value?.deal
    ? withReturn(`/crm/ventas/deal/${encodeURIComponent(doc.value.deal)}`, {
        to: here.value,
        label: backName.value,
      })
    : null,
)
const customerHref = computed(() =>
  doc.value?.header?.customer
    ? withReturn(
        `/crm/contactos/customer/${encodeURIComponent(doc.value.header.customer)}`,
        {
          to: here.value,
          label: backName.value,
        },
      )
    : null,
)

function go(href) {
  const local = routerPath(href)
  if (local) router.push(local)
  else window.location.assign(href)
}
function goBack(event) {
  const local = routerPath(backHref.value)
  if (!local) return
  event?.preventDefault?.()
  router.push(local)
}
async function load() {
  const { doctype, name } = props
  // A ticket read before shows at once and refreshes quietly.
  doc.value = documentFromMemory(doctype, name)
  problem.value = null
  try {
    const out = await fetchDocument(doctype, name)
    if (doctype === props.doctype && name === props.name) doc.value = out
  } catch (error) {
    if (doctype !== props.doctype || name !== props.name) return
    if (!doc.value) problem.value = problemOf(error)
  }
}
watch(() => [props.doctype, props.name], load, { immediate: true })
</script>
<style scoped>
/* The lines and payments rise in under the header that was already there. */
@keyframes detail-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
.detail-in {
  animation: detail-in 0.22s cubic-bezier(0.21, 1.02, 0.73, 1);
}
@media (prefers-reduced-motion: reduce) {
  .detail-in {
    animation: none;
  }
}
</style>
