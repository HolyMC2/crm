<template>
  <!-- A ticket or a cash closing opened from Resultados (record-header). The
       bar names the customer with the sale's state and folio; on a ticket the
       island reaches them, the bolt holds the next steps (cobrar, imprimir,
       facturar, devolver, la reparación) and «⋯» every tool. The hero is the
       amount, how it was paid and, for whom sees cost, the profit. Then the
       repair it charged, what was sold, the payment and the profit; the
       customer, the details and Actividad sit beside them on a desk. -->
  <div class="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
    <AppBar
      island
      :back="true"
      :back-label="__('Back to {0}', [backLabel])"
      :title="head?.title || ''"
      :bell="isPhone"
      @back="onBack"
    >
      <template v-if="head" #title>
        <div class="flex min-h-12 min-w-0 flex-col justify-center px-3">
          <span
            class="title-face line-clamp-2 break-words text-xl font-semibold leading-tight [text-wrap:balance]"
            data-appbar-title
            >{{ head.title }}</span
          >
          <span class="flex min-w-0 items-center gap-2 pt-0.5">
            <StatusChip v-if="head.status" :status="head.status" />
            <span class="num truncate text-sm leading-tight text-ink-gray-6">{{
              name
            }}</span>
          </span>
        </div>
      </template>
      <template #actions>
        <RecordIsland
          v-if="kit && head"
          :reach="kit.record.value?.header?.reach || {}"
          :who="head.title"
          :mail="kit.record.value?.actions?.email || null"
          :composer="composerOn"
          :groups="boltGroups"
          :phone="isPhone"
          :subtitle="kit.scopeTitle.value"
          @message="whatsapp.open"
          @mail="mail"
          @pick="onBolt"
          @tools="kit.openTools()"
        />
      </template>
    </AppBar>

    <div class="ticket-scroll min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <div
        v-if="problem && !doc"
        role="alert"
        class="mx-4 mt-4 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <div class="mt-2 flex flex-wrap gap-2">
          <button type="button" :class="BTN.tonal" @click="load">
            {{ __('Retry', null, CTX) }}
          </button>
          <button type="button" :class="BTN.text" @click="goBack">
            {{ __('Back to {0}', [backLabel]) }}
          </button>
        </div>
      </div>
      <div
        v-else-if="head"
        class="ticket-grid mx-auto grid w-full max-w-6xl gap-x-8 px-4 sm:px-6"
      >
        <div class="min-w-0">
          <!-- The header paints from the list row at once; the rest follows. -->
          <header class="pt-4" data-testid="ticket-header">
            <p class="num text-4xl font-semibold leading-none text-ink-gray-9">
              {{ money(head.total, head.currency) }}
            </p>
            <p
              v-if="head.owed"
              class="num mt-1.5 text-base font-medium text-ink-red-7"
            >
              {{ __('Owes {0}', [money(head.owed, head.currency)], CTX) }}
            </p>
            <p class="mt-2 break-words text-sm text-ink-gray-6">
              {{ head.when }}
            </p>
            <ul
              v-if="chips.length"
              class="mt-3 flex flex-wrap gap-1.5"
              data-testid="ticket-chips"
            >
              <li
                v-for="chip in chips"
                :key="chip.key"
                class="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface-gray-2 px-3 text-sm text-ink-gray-8"
                :data-chip="chip.key"
              >
                <span
                  :class="[chip.icon, 'size-4 text-ink-gray-6']"
                  aria-hidden="true"
                />
                {{ chip.label }}
              </li>
            </ul>
            <p
              v-if="profit"
              class="num mt-3 text-base font-medium"
              :class="profit.loss ? 'text-ink-red-7' : 'text-ink-gray-8'"
              data-testid="ticket-profit-headline"
            >
              {{ profit.headline }}
            </p>
            <div v-if="primary" class="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                :class="[BTN.filled, 'press']"
                data-testid="ticket-next-step"
                @click="runStep(primary)"
              >
                <span :class="[primary.icon, 'size-5']" aria-hidden="true" />
                {{ primary.label }}
              </button>
            </div>
          </header>
          <p
            v-if="doc?.header.is_return"
            class="mt-4 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
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
              v-if="repair"
              class="mt-6"
              :aria-label="__('Repair', null, CTX)"
              data-testid="ticket-repair"
            >
              <h2
                class="mb-2 flex items-baseline justify-between text-sm font-semibold text-ink-gray-8"
              >
                {{ __('Repair', null, CTX) }}
                <span class="num font-normal text-ink-gray-6">{{
                  repair.name
                }}</span>
              </h2>
              <div
                class="overflow-hidden rounded-7 border border-outline-gray-1 bg-surface-elevation-1"
              >
                <a
                  :href="repairHref"
                  class="flex min-h-14 items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-gray-1 active:bg-surface-gray-2"
                  data-testid="ticket-repair-open"
                  @click="openRepair"
                >
                  <span
                    class="flex size-11 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                    aria-hidden="true"
                  >
                    <span class="lucide-smartphone size-5" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span
                      class="block break-words font-medium text-ink-gray-9"
                      >{{ repair.device }}</span
                    >
                    <span
                      v-for="id in repair.identifiers"
                      :key="id"
                      class="num block break-all text-sm text-ink-gray-6"
                      >{{ id }}</span
                    >
                    <span
                      v-if="repair.status"
                      class="block text-sm text-ink-gray-6"
                      >{{ repair.status }}</span
                    >
                  </span>
                  <span
                    class="lucide-chevron-right mt-1 size-4 shrink-0 text-ink-gray-4"
                    aria-hidden="true"
                  />
                </a>
                <dl
                  v-if="repair.facts.length"
                  class="space-y-2 border-t border-outline-gray-1 px-4 py-3"
                >
                  <div v-for="fact in repair.facts" :key="fact.key">
                    <dt class="text-sm text-ink-gray-6">{{ fact.label }}</dt>
                    <dd
                      class="whitespace-pre-line break-words text-base text-ink-gray-9"
                    >
                      {{ fact.value }}
                    </dd>
                  </div>
                </dl>
                <div
                  v-if="
                    repair.people ||
                    repair.dates ||
                    repair.warranty ||
                    repair.claim
                  "
                  class="space-y-1 border-t border-outline-gray-1 px-4 py-3 text-sm text-ink-gray-7"
                >
                  <p v-if="repair.people">{{ repair.people }}</p>
                  <p v-if="repair.dates">{{ repair.dates }}</p>
                  <p
                    v-if="repair.warranty"
                    class="flex items-center gap-1.5"
                    data-testid="ticket-warranty"
                  >
                    <span
                      class="size-4 flex-none"
                      :class="
                        repair.warrantyOn
                          ? 'lucide-shield-check text-ink-gray-8'
                          : 'lucide-shield text-ink-gray-5'
                      "
                      aria-hidden="true"
                    />
                    {{ repair.warranty }}
                  </p>
                  <p v-if="repair.claim">{{ repair.claim }}</p>
                </div>
                <ul
                  v-if="repair.parts.length"
                  class="border-t border-outline-gray-1 px-4 py-3 text-sm"
                  :aria-label="__('Parts used', null, CTX)"
                >
                  <li class="mb-1 flex justify-between text-ink-gray-6">
                    <span>{{ __('Parts used', null, CTX) }}</span>
                    <span class="num">{{ repair.partsCost }}</span>
                  </li>
                  <li
                    v-for="(part, i) in repair.parts"
                    :key="i"
                    class="flex justify-between gap-3 text-ink-gray-8"
                  >
                    <span class="min-w-0 break-words">{{ part.name }}</span>
                    <span class="num shrink-0">{{ part.cost }}</span>
                  </li>
                </ul>
              </div>
            </section>

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
                  itemCount(lineCount)
                }}</span>
              </h2>
              <ul
                class="divide-y divide-outline-gray-1 overflow-hidden rounded-7 border border-outline-gray-1 bg-surface-elevation-1"
                data-testid="ticket-lines"
              >
                <li v-for="(line, i) in lines" :key="i">
                  <UiTag
                    :as="line.to ? RouterLink : 'div'"
                    :to="line.to || undefined"
                    class="flex min-h-14 items-start gap-3 px-4 py-3"
                    :class="
                      line.to
                        ? 'transition-colors hover:bg-surface-gray-1 active:bg-surface-gray-2'
                        : ''
                    "
                    :data-testid="line.to ? 'ticket-line-link' : undefined"
                  >
                    <img
                      v-if="line.image && !brokenImages[i]"
                      :src="line.image"
                      alt=""
                      loading="lazy"
                      class="size-11 flex-none rounded-5 bg-surface-gray-2 object-cover"
                      @error="brokenImages[i] = true"
                    />
                    <span
                      v-else
                      class="flex size-11 flex-none items-center justify-center rounded-5 bg-surface-gray-2 text-ink-gray-5"
                      aria-hidden="true"
                    >
                      <span class="lucide-package size-5" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span
                        class="line-clamp-2 break-words font-medium text-ink-gray-9"
                        >{{ line.title }}</span
                      >
                      <span
                        v-if="line.detail"
                        class="num mt-0.5 block text-sm text-ink-gray-6"
                        >{{ line.detail }}</span
                      >
                      <span
                        v-if="line.discount"
                        class="num mt-0.5 block text-sm text-ink-gray-6"
                        >{{ line.discount }}</span
                      >
                      <span
                        v-for="serial in line.serials"
                        :key="serial"
                        class="num mt-0.5 block break-all text-sm text-ink-gray-6"
                        >{{ __('IMEI or serial {0}', [serial], CTX) }}</span
                      >
                      <span
                        v-if="line.cost"
                        class="num mt-0.5 block text-sm"
                        :class="
                          line.loss ? 'text-ink-red-7' : 'text-ink-gray-6'
                        "
                        data-testid="ticket-line-cost"
                        >{{ line.cost }}</span
                      >
                    </span>
                    <span class="num shrink-0 pt-0.5 font-semibold">{{
                      line.amount
                    }}</span>
                    <span
                      v-if="line.to"
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
                {{
                  __('Showing the first {0} lines.', [doc.items.length], CTX)
                }}
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
                data-testid="ticket-payments"
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
                    money(p.amount ?? p.closing_amount ?? 0, docCurrency)
                  }}</span>
                </li>
                <li
                  v-for="row in totals"
                  :key="row.key"
                  class="flex items-center gap-3 px-4 text-base"
                  :class="[
                    row.quiet
                      ? 'min-h-10 py-1.5 text-sm text-ink-gray-6'
                      : 'min-h-12 py-2',
                    row.key === 'total' ? 'font-semibold' : '',
                  ]"
                  :data-total="row.key"
                >
                  <span class="min-w-0 flex-1 truncate">{{ row.label }}</span>
                  <span
                    class="num"
                    :class="row.key === 'owed' ? 'text-ink-red-7' : ''"
                    >{{ money(row.amount, docCurrency) }}</span
                  >
                </li>
              </ul>
            </section>

            <section
              v-if="profit && profit.rows.length"
              class="mt-6"
              :aria-label="__('Profit', null, CTX)"
              data-testid="ticket-profit"
            >
              <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
                {{ __('Profit', null, CTX) }}
              </h2>
              <ul
                class="divide-y divide-outline-gray-1 overflow-hidden rounded-7 border border-outline-gray-1 bg-surface-elevation-1"
              >
                <li
                  v-for="row in profit.rows"
                  :key="row.key"
                  class="flex min-h-12 items-center gap-3 px-4 py-2 text-base"
                  :class="row.strong ? 'font-semibold' : ''"
                >
                  <span class="min-w-0 flex-1 truncate">{{ row.label }}</span>
                  <span
                    class="num"
                    :class="row.strong && profit.loss ? 'text-ink-red-7' : ''"
                    >{{ money(row.amount, docCurrency) }}</span
                  >
                </li>
              </ul>
              <p
                v-for="note in profit.notes"
                :key="note"
                class="mt-2 text-sm text-ink-gray-6"
              >
                {{ note }}
              </p>
            </section>
            <section
              v-else-if="profit"
              class="mt-6 text-sm text-ink-gray-6"
              data-testid="ticket-profit"
            >
              <p v-for="note in profit.notes" :key="note">{{ note }}</p>
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
          </div>
        </div>

        <aside v-if="doc" class="detail-in min-w-0">
          <section
            v-if="customer"
            class="mt-6"
            :aria-label="__('Customer', null, CTX)"
            data-testid="ticket-customer"
          >
            <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
              {{ __('Customer', null, CTX) }}
            </h2>
            <div
              class="overflow-hidden rounded-7 border border-outline-gray-1 bg-surface-elevation-1"
            >
              <a
                :href="customerHref || undefined"
                class="flex min-h-14 items-start gap-3 px-4 py-3"
                :class="
                  customerHref
                    ? 'transition-colors hover:bg-surface-gray-1 active:bg-surface-gray-2'
                    : ''
                "
                data-testid="ticket-customer-open"
                @click="openCustomer"
              >
                <span
                  class="flex size-11 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-base font-semibold text-ink-gray-7"
                  aria-hidden="true"
                  >{{ initials(customer.name) }}</span
                >
                <span class="min-w-0 flex-1">
                  <span class="block break-words font-medium text-ink-gray-9">{{
                    customer.name
                  }}</span>
                  <span
                    v-for="fact in customer.facts"
                    :key="fact"
                    class="num block text-sm text-ink-gray-6"
                    >{{ fact }}</span
                  >
                  <span
                    v-if="customer.owed"
                    class="num block text-sm font-medium text-ink-red-7"
                    >{{ customer.owed }}</span
                  >
                </span>
                <span
                  v-if="customerHref"
                  class="lucide-chevron-right mt-1 size-4 shrink-0 text-ink-gray-4"
                  aria-hidden="true"
                />
              </a>
              <a
                v-if="dealHref"
                :href="dealHref"
                class="flex min-h-12 items-center gap-3 border-t border-outline-gray-1 px-4 py-2 text-base text-ink-gray-8 transition-colors hover:bg-surface-gray-1 active:bg-surface-gray-2"
                data-testid="ticket-deal-open"
                @click.prevent="go(dealHref)"
              >
                <span
                  class="lucide-briefcase size-5 text-ink-gray-6"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">{{
                  __('Open the sale in Ventas')
                }}</span>
                <span
                  class="lucide-chevron-right size-4 shrink-0 text-ink-gray-4"
                  aria-hidden="true"
                />
              </a>
            </div>
          </section>
          <p v-else-if="isTicket && dealHref" class="mt-6">
            <button type="button" :class="BTN.tonal" @click="go(dealHref)">
              {{ __('Open the sale in Ventas') }}
            </button>
          </p>

          <section
            v-if="details.length"
            class="mt-6"
            :aria-label="__('Details', null, CTX)"
            data-testid="ticket-details"
          >
            <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
              {{ __('Details', null, CTX) }}
            </h2>
            <dl
              class="divide-y divide-outline-gray-1 overflow-hidden rounded-7 border border-outline-gray-1 bg-surface-elevation-1"
            >
              <div
                v-for="row in details"
                :key="row.key"
                class="flex min-h-12 items-center gap-3 px-4 py-2"
              >
                <dt class="w-28 flex-none text-sm text-ink-gray-6">
                  {{ row.label }}
                </dt>
                <dd
                  class="num min-w-0 flex-1 break-words text-base text-ink-gray-9"
                >
                  {{ row.value }}
                </dd>
                <button
                  v-if="row.copy"
                  type="button"
                  class="press flex size-10 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
                  :aria-label="__('Copy the folio', null, CTX)"
                  :title="__('Copy the folio', null, CTX)"
                  @click="copyFolio"
                >
                  <span class="lucide-copy size-4" aria-hidden="true" />
                </button>
              </div>
            </dl>
          </section>

          <!-- «Creado desde», Conexiones, Actividad y comentarios and the «⋯» sheets. -->
          <RecordKit
            v-if="kit"
            class="-mx-4 mt-4"
            :kit="kit"
            :title="head.title"
          />
        </aside>
      </div>
    </div>

    <template v-if="kit">
      <ChannelComposer
        v-if="whatsapp.composerOpen.value"
        v-model="whatsapp.composerOpen.value"
        doctype="Sales Invoice"
        :docname="name"
        :phone="kit.record.value?.header?.reach?.phone || ''"
        :contact-name="head?.title || ''"
      />
      <DocumentSendSheet
        v-if="whatsapp.sendSheet.value"
        v-model="whatsapp.sendOpen.value"
        doctype="Sales Invoice"
        :name="name"
        :title="__('Send the ticket by WhatsApp', null, CTX)"
        :subtitle="[name, head?.title].filter(Boolean).join(' · ')"
      />
    </template>
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { AppBar, StatusChip } from '@/components/ui'
import UiTag from '@/components/ui/UiTag'
import RecordIsland from '@/components/documentos/RecordIsland.vue'
import RecordKit from '@/components/documentos/compras/RecordKit.vue'
import { useRecordKit } from '@/components/documentos/compras/recordKit'
import { problemOf } from '@/composables/useCobranza'
import { money } from '@/composables/useCompras'
import { shellBoot } from '@/composables/muelleShell'
import { isMobile } from '@/composables/breakpoint'
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
import {
  itemCount,
  ticketChips,
  ticketCustomer,
  ticketDetails,
  ticketLine,
  ticketProfit,
  ticketRepair,
  ticketSteps,
  ticketTotals,
} from '@/composables/resultadosTicket'
import { recordActionsFor } from '@/documentos/acciones'
import { useRecordWhatsapp } from '@/documentos/recordWhatsapp'
import { BTN, copyText, shareLink } from '@/documentos/tools'
import { modeOfPaymentLabel } from '@/utils/modeOfPayment'
import { formatDay } from '@/utils/contactos'
import { kindLabel, personName } from '@/utils/display'
import {
  moduleEnabled,
  readReturn,
  withReturn,
} from '@/vendor/muelle-shell/contracts'

// WhatsApp from the island: the composer, or the ticket's PDF on the official account.
const ChannelComposer = defineAsyncComponent(
  () => import('@/components/doco/channel/ChannelComposer.vue'),
)
const DocumentSendSheet = defineAsyncComponent(
  () => import('@/components/cobranza/CobranzaSendSheet.vue'),
)

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
})
const route = useRoute()
const router = useRouter()
const doc = ref(null)
const problem = ref(null)
const isPhone = isMobile
const isTicket = props.doctype === 'Sales Invoice'

const currency = computed(() => shellBoot.value?.currency || '')
const docCurrency = computed(
  () => doc.value?.header?.currency || currency.value,
)
const caller = computed(() =>
  readReturn(new URLSearchParams(route.query), {
    allowedPrefixes: ['/crm/'],
    acceptLegacy: false,
  }),
)
const backHref = computed(() => caller.value?.to || '/crm/resultados')
const backLabel = computed(() => caller.value?.label || RETURN_LABEL)
const payments = computed(() =>
  (doc.value?.payments || []).filter(
    (p) => Math.abs(Number(p.amount ?? p.closing_amount ?? 0)) > 0.005,
  ),
)
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
const chips = computed(() => (doc.value ? ticketChips(doc.value) : []))
const totals = computed(() => ticketTotals(doc.value))
const profit = computed(() =>
  ticketProfit(doc.value?.margin, docCurrency.value),
)
const repairBlock = computed(() => doc.value?.blocks?.reparacion || null)
const repair = computed(() =>
  ticketRepair(repairBlock.value, docCurrency.value),
)
const customer = computed(() =>
  ticketCustomer(doc.value?.customer, repairBlock.value, docCurrency.value),
)
const details = computed(() =>
  doc.value && isTicket
    ? ticketDetails(doc.value, { personName: (p) => personName(p) })
    : [],
)

const canOpenProducts = computed(() =>
  moduleEnabled(shellBoot.value, 'productos'),
)
const brokenImages = reactive({})
const lines = computed(() =>
  (doc.value?.items || []).map((item, i) => ({
    ...ticketLine(item, doc.value?.margin?.lines?.[i], docCurrency.value),
    amount: money(item.amount ?? item.difference ?? 0, docCurrency.value),
    serials: serials(item),
    to:
      canOpenProducts.value && item.item_code && isTicket
        ? routerPath(productHref(item.item_code, here.value, backName.value))
        : null,
  })),
)
function serials(item) {
  return String(item.serial_no || '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5)
}
function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

const back = () => ({ to: here.value, label: backName.value })
const dealHref = computed(() =>
  doc.value?.deal
    ? withReturn(
        `/crm/ventas/deal/${encodeURIComponent(doc.value.deal)}`,
        back(),
      )
    : null,
)
const customerHref = computed(() =>
  doc.value?.header?.customer && doc.value?.customer
    ? withReturn(
        `/crm/contactos/customer/${encodeURIComponent(doc.value.header.customer)}`,
        back(),
      )
    : null,
)
const repairHref = computed(() =>
  repairBlock.value?.url ? withReturn(repairBlock.value.url, back()) : null,
)

// ── the record kit: reach, the bolt, «⋯», Conexiones and Actividad ──
const kit = isTicket
  ? useRecordKit('Sales Invoice', {
      name: () => props.name,
      title: () => head.value?.title || '',
    })
  : null
const composerOn = computed(() => moduleEnabled(shellBoot.value, 'ventas'))
const whatsapp = useRecordWhatsapp({
  doctype: () => props.doctype,
  name: () => props.name,
  phone: () => kit?.record.value?.header?.reach?.phone || '',
  title: () => head.value?.title || '',
  returnTo: () => route.fullPath,
  router,
})
const steps = computed(() =>
  doc.value && isTicket
    ? ticketSteps(doc.value, {
        pos: !!doc.value.register?.pos,
        canPrint: !!kit?.record.value?.actions?.print?.allowed,
        returnTo: here.value,
        returnLabel: backName.value,
        repairHref: repairHref.value,
        dealHref: dealHref.value,
      })
    : [],
)
// The hero's one filled button: money still owed is the next thing to do.
const primary = computed(() =>
  steps.value.find((step) => step.key === 'collect'),
)
const boltGroups = computed(() =>
  kit
    ? recordActionsFor({
        steps: steps.value.map(({ label, icon }) => ({ label, icon })),
        tools: kit.tools.value,
      })
    : [],
)
function onBolt({ key }) {
  if (key.startsWith('paso:')) {
    const step = steps.value[Number(key.slice(5))]
    if (step) runStep(step)
  } else kit?.onTool(key)
}
async function runStep(step) {
  if (step.tool) return kit?.onTool(step.tool)
  if (step.share) {
    const result = await shareLink(step.share)
    if (result === 'copied')
      toast.success(__('Link copied: paste it to the customer', null, CTX))
    else if (result === 'failed')
      toast.error(__('Could not share the link', null, CTX))
    return
  }
  if (step.external) return window.open(step.href, '_blank', 'noopener')
  go(step.href)
}
function mail() {
  const action = kit?.record.value?.actions?.email
  if (action?.allowed) kit.onTool('correo')
  else
    toast.error(
      action?.reason || __('This ticket cannot be sent by email.', null, CTX),
    )
}
async function copyFolio() {
  if (await copyText(props.name)) toast.success(__('Folio copied', null, CTX))
  else toast.error(__('Could not copy the folio', null, CTX))
}

function go(href) {
  if (!href) return
  const local = routerPath(href)
  if (local) router.push(local)
  else window.location.assign(href)
}
function openRepair(event) {
  event.preventDefault()
  go(repairHref.value)
}
function openCustomer(event) {
  event.preventDefault()
  go(customerHref.value)
}
function onBack(event) {
  event?.preventDefault?.()
  goBack()
}
function goBack() {
  const local = routerPath(backHref.value)
  if (local) router.push(local)
  else window.location.assign(backHref.value)
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
/* Customer, details and Actividad sit beside the ticket only when the page's
   own column has room for both (the rail and the assistant share the width). */
.ticket-scroll {
  container-type: inline-size;
}
@container (min-width: 54rem) {
  .ticket-grid {
    grid-template-columns: minmax(0, 1fr) 22rem;
  }
}
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
