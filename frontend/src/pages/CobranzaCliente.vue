<template>
  <div
    ref="scroller"
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-cobranza-record
  >
    <!-- Phone: the record's own app bar (route meta.ownPhoneHeader): back to
         the same place in the list, who this is, the next customer. -->
    <!-- The shared AppBar (S1): back to the same place in the list, the
         customer's name on up to two lines with what they owe, the next
         customer, and the bell. -->
    <AppBar
      v-if="phone"
      data-cobranza-appbar
      back
      :back-label="backLabel"
      @back="
        (event) => {
          event?.preventDefault?.()
          goBack()
        }
      "
    >
      <template #title>
        <div class="min-w-0 flex-1 px-1">
          <p
            class="line-clamp-2 break-words text-lg font-semibold leading-snug"
          >
            {{ data?.customer_name || __('Cobranza', null, CTX) }}
          </p>
          <p
            v-if="data"
            class="truncate text-xs tabular-nums"
            :class="
              data.overdue_amount > 0 ? 'text-ink-red-7' : 'text-ink-gray-6'
            "
          >
            <!-- One figure when all of it is overdue, not «$1,000 · $1,000
                 vencido». -->
            <template
              v-if="
                !(data.overdue_amount > 0) ||
                data.overdue_amount < data.outstanding
              "
              >{{ money(data.outstanding, data.currency) }}</template
            >
            <template v-if="data.overdue_amount > 0">
              <template v-if="data.overdue_amount < data.outstanding">
                ·
              </template>
              {{
                __('{0} overdue', [money(data.overdue_amount, data.currency)])
              }}
            </template>
          </p>
        </div>
      </template>
      <template #actions>
        <button
          v-if="data && !returnTo"
          type="button"
          class="flex size-12 shrink-0 items-center justify-center rounded-full text-ink-gray-7"
          :aria-label="__('Next customer')"
          :disabled="findingNext"
          @click="goNext"
        >
          <span class="lucide-chevron-right size-6" aria-hidden="true" />
        </button>
      </template>
    </AppBar>

    <div class="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <nav v-if="!phone" class="mb-3 flex items-center gap-2">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          :aria-keyshortcuts="'Escape'"
          @click="goBack"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ backLabel }}
        </button>
        <span class="flex-1" />
        <Button
          v-if="data && !returnTo"
          variant="ghost"
          :label="__('Next customer')"
          :loading="findingNext"
          :aria-keyshortcuts="'N'"
          @click="goNext"
        >
          <template #suffix
            ><FeatherIcon name="arrow-right" class="h-4 w-4"
          /></template>
        </Button>
      </nav>

      <section
        v-if="guard"
        role="alert"
        class="mx-auto max-w-xl space-y-4 py-6"
      >
        <h1 class="text-xl font-semibold">{{ guard.title }}</h1>
        <p class="text-base text-ink-gray-7">{{ guard.detail }}</p>
        <div class="flex flex-wrap gap-2">
          <Button :label="__('Retry', null, CTX)" @click="start" />
          <Button
            :label="__('Copy access request')"
            @click="copy(requestText)"
          />
          <Button :label="__('Back to Cobranza')" @click="goBack" />
        </div>
        <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
          {{ copied }}
        </p>
      </section>

      <div v-else-if="!data" role="status" class="py-10 text-sm">
        {{ __('Loading the customer’s balance…') }}
      </div>

      <template v-else>
        <div
          v-if="doneNotice"
          role="status"
          class="mb-4 space-y-2 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8"
        >
          <p>{{ doneNotice }}</p>
          <div v-if="data.outstanding <= 0" class="flex flex-wrap gap-2">
            <Button
              variant="solid"
              class="min-h-11 sm:min-h-8"
              :label="__('Next customer')"
              :loading="findingNext"
              @click="goNext"
            />
            <Button
              class="min-h-11 sm:min-h-8"
              :label="__('Back to Cobranza')"
              @click="goBack"
            />
          </div>
        </div>

        <header class="mb-4 flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <h1
              class="text-xl font-semibold text-ink-gray-9"
              :class="phone ? 'sr-only' : ''"
            >
              {{ data.customer_name }}
            </h1>
            <p class="text-sm text-ink-gray-6">
              {{ data.company }}
              <template v-if="data.phones.length">
                ·
                <a
                  v-for="(p, index) in data.phones"
                  :key="p.display"
                  class="text-ink-blue-link underline"
                  :href="`tel:${p.display.replace(/[^\d+]/g, '')}`"
                  >{{ p.display
                  }}<template v-if="index < data.phones.length - 1"
                    >,
                  </template></a
                ></template
              >
              <template v-else> · {{ __('No mobile number') }}</template>
            </p>
            <div class="mt-1 flex flex-wrap gap-1">
              <Badge
                v-if="data.suppressed"
                theme="red"
                :label="__('Does not accept messages')"
              />
              <Badge
                v-if="autoChip(data.auto, data.today)"
                :theme="autoChip(data.auto, data.today).theme"
                :label="autoChip(data.auto, data.today).label"
                data-auto-chip
              />
              <Badge
                v-if="followupChip(data.followup, data.today)"
                :theme="followupChip(data.followup, data.today).theme"
                :label="followupChip(data.followup, data.today).label"
                data-followup-chip
              />
            </div>
          </div>
          <div class="text-right" :class="phone ? 'hidden' : ''">
            <p class="text-2xl font-semibold tabular-nums text-ink-gray-9">
              {{ money(data.outstanding, data.currency) }}
            </p>
            <p
              v-if="
                isForeign(data.currency, data.company_currency) &&
                data.base_outstanding !== undefined
              "
              class="text-sm tabular-nums text-ink-gray-6"
            >
              {{ approxMoney(data.base_outstanding, data.company_currency) }}
            </p>
            <p
              v-if="data.overdue_amount > 0"
              class="text-sm tabular-nums text-ink-red-7"
            >
              {{
                __('{0} overdue', [money(data.overdue_amount, data.currency)])
              }}
            </p>
          </div>
          <!-- ERPNext sets and checks credit limits in the company currency. -->
          <p
            v-if="data.credit.limit || data.credit.store_credit"
            class="w-full text-xs text-ink-gray-6 sm:w-auto"
          >
            <template v-if="data.credit.limit">{{
              __('Credit limit {0}', [
                money(
                  data.credit.limit,
                  data.company_currency || data.currency,
                ),
              ])
            }}</template>
            <template v-if="data.credit.limit && data.credit.store_credit">
              ·
            </template>
            <template v-if="data.credit.store_credit">{{
              __('Store credit {0}', [
                money(data.credit.store_credit, data.currency),
              ])
            }}</template>
          </p>
        </header>

        <!-- Phone: the customer's actions as equal tiles with the label under
             the icon (Contacto's row). Payment is not here: it sits in the
             thumb bar with the focused invoice. -->
        <div
          v-if="phone"
          class="mb-4 grid auto-cols-fr grid-flow-col gap-2"
          data-record-actions
        >
          <a
            v-if="data.phones.length"
            class="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-surface-gray-2 px-1 text-center text-xs font-medium text-ink-gray-8"
            :href="`tel:${data.phones[0].display.replace(/[^\d+]/g, '')}`"
          >
            <!-- «Llamar» dials; the thumb bar's «Llamada» logs one. -->
            <FeatherIcon name="phone-outgoing" class="h-5 w-5" />
            {{ __('Make a Call') }}
          </a>
          <button
            v-if="caps.assign"
            type="button"
            class="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-surface-gray-2 px-1 text-center text-xs font-medium text-ink-gray-8"
            @click="openFollowup('followup')"
          >
            <FeatherIcon name="user-check" class="h-5 w-5" />
            {{ __('Follow-up', null, CTX) }}
          </button>
          <button
            v-if="caps.statement"
            type="button"
            class="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-surface-gray-2 px-1 text-center text-xs font-medium text-ink-gray-8"
            @click="statementOpen = true"
          >
            <FeatherIcon name="file-text" class="h-5 w-5" />
            {{ __('Statement', null, CTX) }}
          </button>
        </div>
        <!-- The customer's next steps: payment for any invoices, collector, follow-up. -->
        <div v-else class="mb-4 flex flex-wrap gap-2" data-record-actions>
          <Button
            v-if="caps.pay && invoices.length"
            class="min-h-11 sm:min-h-8"
            :label="__('Register payment')"
            :aria-keyshortcuts="'$'"
            @click="openPayment('')"
          >
            <template #prefix
              ><FeatherIcon name="dollar-sign" class="h-4 w-4"
            /></template>
          </Button>
          <Button
            v-if="caps.assign"
            class="min-h-11 sm:min-h-8"
            :label="
              data.followup ? __('Change follow-up') : __('Schedule follow-up')
            "
            :aria-keyshortcuts="'S'"
            @click="openFollowup('followup')"
          >
            <template #prefix
              ><FeatherIcon name="user-check" class="h-4 w-4"
            /></template>
          </Button>
          <Button
            v-if="caps.statement"
            class="min-h-11 sm:min-h-8"
            :label="__('Statement of account')"
            @click="statementOpen = true"
          >
            <template #prefix
              ><FeatherIcon name="file-text" class="h-4 w-4"
            /></template>
          </Button>
        </div>

        <!-- Recordatorios automáticos: what happens next, and the way to resume. -->
        <div
          v-if="autoLine(data.auto, data.today)"
          class="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-surface-gray-1 p-3 text-sm text-ink-gray-8"
          data-auto-line
        >
          <FeatherIcon name="send" class="h-4 w-4 shrink-0 text-ink-gray-6" />
          <p class="min-w-0 flex-1">{{ autoLine(data.auto, data.today) }}</p>
          <template v-if="data.auto.state === 'replied'">
            <Button
              v-if="data.capabilities.remind"
              class="min-h-11 sm:min-h-8"
              :label="__('Resume reminders')"
              :loading="busy === 'resume'"
              @click="resumeReminders"
            />
            <RouterLink
              class="inline-flex min-h-11 items-center text-ink-blue-link underline sm:min-h-0"
              :to="autoConversationRoute(data.auto)"
              data-auto-conversation
              >{{ __('Open the conversation') }}</RouterLink
            >
          </template>
          <Button
            v-else-if="
              data.auto.manual &&
              data.auto.actions.includes('share') &&
              manualInvoice
            "
            variant="solid"
            class="min-h-11 sm:min-h-8"
            :label="__('Prepare and send')"
            :loading="busy === `${manualInvoice.name}:remind`"
            @click="run(manualInvoice, { key: 'remind' }, true)"
          />
          <Button
            v-else-if="data.auto.manual && manualInvoice"
            class="min-h-11 sm:min-h-8"
            :label="__('Log call')"
            @click="run(manualInvoice, { key: 'call' })"
          />
        </div>

        <FormControl
          v-if="data.companies.length > 1"
          class="mb-3 w-full sm:w-64"
          type="select"
          :aria-label="__('Company')"
          :model-value="data.company"
          :options="data.companies.map((c) => ({ label: c, value: c }))"
          @update:model-value="(value) => switchCompany(value)"
        />

        <div
          v-if="problem"
          role="alert"
          class="mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <Button class="ml-2" :label="__('Retry', null, CTX)" @click="load" />
        </div>

        <p
          v-if="!invoices.length"
          class="rounded-lg bg-surface-gray-1 p-4 text-sm text-ink-gray-7"
        >
          {{ __('This customer owes nothing right now.') }}
        </p>

        <ul class="space-y-3" :aria-label="__('Invoices')">
          <li
            v-for="inv in invoices"
            :key="inv.name"
            class="rounded-lg border p-3"
            :class="
              focusName === inv.name
                ? 'border-outline-gray-4 ring-1 ring-outline-gray-4'
                : 'border-outline-gray-2'
            "
            :data-invoice="inv.name"
            :aria-current="focusName === inv.name ? 'true' : undefined"
            @click="focusInvoice(inv)"
          >
            <div class="flex flex-wrap items-start gap-2">
              <div class="min-w-0 flex-1">
                <!-- Folio and date wrap as two units: the date moves to the next line. -->
                <p
                  class="flex flex-wrap items-baseline gap-x-1 font-medium text-ink-gray-9"
                >
                  <!-- The invoice reads by its date, never its folio; the
                       folio (Desk link) is a desk-only secondary detail. -->
                  <span data-invoice-title>{{ invoiceTitle(inv) }}</span>
                  <a
                    class="hidden text-sm font-normal text-ink-gray-6 underline underline-offset-2 sm:inline"
                    :href="`/app/sales-invoice/${encodeURIComponent(inv.name)}`"
                    >{{ __('Folio {0}', [inv.name], CTX) }}</a
                  >
                </p>
                <p class="text-sm" :class="toneClass(agingTone(inv))">
                  {{ agingLabel(inv, data.today) }}
                </p>
                <div class="mt-1 flex flex-wrap gap-1">
                  <Badge
                    v-if="promiseChip(inv.promise, owedIn(inv))"
                    :theme="promiseChip(inv.promise, owedIn(inv)).theme"
                    :label="promiseChip(inv.promise, owedIn(inv)).label"
                  />
                  <Badge
                    v-if="inv.current_dunning"
                    theme="gray"
                    :label="__('{0} sent', [inv.due_label])"
                  />
                </div>
              </div>
              <div class="text-right">
                <p class="font-semibold tabular-nums">
                  {{ money(inv.outstanding, owedIn(inv)) }}
                </p>
                <p
                  v-if="
                    isForeign(owedIn(inv), data.company_currency) &&
                    inv.base_outstanding !== undefined
                  "
                  class="text-xs tabular-nums text-ink-gray-6"
                >
                  {{ approxMoney(inv.base_outstanding, data.company_currency) }}
                </p>
                <p
                  v-if="inv.outstanding < inv.total"
                  class="text-xs text-ink-gray-6"
                >
                  {{ __('of {0}', [money(inv.total, owedIn(inv))]) }}
                </p>
              </div>
            </div>
            <ul
              v-if="inv.schedule.length > 1"
              class="mt-2 space-y-0.5 text-xs text-ink-gray-6"
            >
              <li v-for="row in inv.schedule" :key="row.due_date">
                {{ __('Due {0}', [formatDay(row.due_date)], CTX) }} ·
                {{ money(row.outstanding, owedIn(inv)) }}
              </li>
            </ul>

            <div
              v-if="actionsOf(inv).primary.blocked"
              class="mt-3 rounded-lg bg-surface-amber-1 p-2 text-sm"
            >
              <p>{{ actionsOf(inv).primary.blocked }}</p>
              <Button
                class="mt-2 min-h-11 sm:min-h-8"
                :label="actionsOf(inv).primary.resolve.label"
                :loading="busy === `${inv.name}:resolve`"
                @click="resolve(inv, actionsOf(inv).primary.resolve)"
              />
            </div>
            <!-- On a phone the focused invoice's actions sit in the thumb bar:
                 the card does not repeat them. -->
            <div v-if="!phone" class="mt-3 flex flex-wrap gap-2">
              <Button
                v-if="!actionsOf(inv).primary.blocked"
                variant="solid"
                class="min-h-11 sm:min-h-8"
                :label="actionsOf(inv).primary.label"
                :loading="busy === `${inv.name}:${actionsOf(inv).primary.key}`"
                @click.stop="run(inv, actionsOf(inv).primary)"
              />
              <Button
                v-for="action in actionsOf(inv).secondary"
                :key="action.key"
                class="min-h-11 sm:min-h-8"
                :label="action.label"
                :loading="busy === `${inv.name}:${action.key}`"
                @click.stop="run(inv, action)"
              />
            </div>
          </li>
        </ul>

        <section v-if="data.timeline.length" class="mt-8">
          <h2 class="mb-2 text-base font-semibold">{{ __('History') }}</h2>
          <ol class="space-y-2 text-sm">
            <li
              v-for="event in data.timeline"
              :key="`${event.doctype}:${event.name}`"
              class="flex gap-2"
            >
              <FeatherIcon
                :name="EVENT_ICONS[event.kind]"
                class="mt-0.5 h-4 w-4 shrink-0 text-ink-gray-5"
              />
              <span class="min-w-0 flex-1">
                <span class="text-ink-gray-9">{{ eventTitle(event) }}</span>
                <Badge
                  v-if="event.automatic"
                  class="ml-1"
                  theme="blue"
                  :label="__('automatic')"
                  data-auto-badge
                />
                <span class="block text-xs text-ink-gray-6">
                  {{ formatDay(event.date) }}
                  <template v-if="event.detail"> · {{ event.detail }}</template>
                </span>
              </span>
            </li>
          </ol>
        </section>

        <ArchivosRegistroPanel
          v-if="archivosEnabled"
          class="mt-4"
          doctype="Customer"
          :name="props.customer"
          :return-to="`/crm${route.fullPath}`"
          :return-label="data.customer_name || props.customer"
        />
      </template>
    </div>

    <!-- Phone: the focused invoice's actions at the thumb. -->
    <div
      v-if="phone && data && focused"
      class="sticky bottom-0 z-20 mt-auto border-t border-outline-gray-2 bg-surface-base px-3 pb-2 pt-2 shadow-lg"
      data-cobranza-actionbar
    >
      <p class="mb-1 truncate text-xs text-ink-gray-6">
        {{ invoiceTitle(focused) }} ·
        {{ money(focused.outstanding, owedIn(focused)) }}
      </p>
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="action in phoneActions"
          :key="action.key"
          type="button"
          class="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-medium"
          :class="
            action.primary
              ? 'bg-surface-gray-10 text-ink-base'
              : 'bg-surface-gray-2 text-ink-gray-8'
          "
          :data-primary="action.primary ? 'true' : undefined"
          @click="run(focused, action)"
        >
          <FeatherIcon :name="action.icon" class="h-5 w-5" />
          <span class="truncate">{{ action.short }}</span>
        </button>
      </div>
    </div>

    <PromiseSheet
      v-model="promiseOpen"
      :invoice="target ? sheetInvoice(target) : null"
      :today="data?.today || ''"
      @saved="(result) => saved(undoer.promiseSaved, result)"
    />
    <CallSheet
      v-model="callOpen"
      :invoice="target ? sheetInvoice(target) : null"
      @saved="(result) => saved(undoer.callSaved, result)"
    />
    <PaymentSheet
      v-model="payOpen"
      :customer="data?.customer || customer"
      :company="data?.company || ''"
      :customer-name="data?.customer_name || ''"
      :invoice="payInvoice"
      :caps="caps"
      @saved="(result) => saved(undoer.paymentSaved, result)"
      @collect="collectInvoice"
    />
    <FollowupSheet
      v-model="followupOpen"
      :customer="data?.customer || customer"
      :customer-name="data?.customer_name || ''"
      :followup="data?.followup || null"
      :today="data?.today || ''"
      :focus="followupFocus"
      @saved="followupSaved"
    />
    <StatementSheet
      v-model="statementOpen"
      :customer="data?.customer || customer"
      :company="data?.company || ''"
      :customer-name="data?.customer_name || ''"
      :today="data?.today || ''"
    />
    <CobranzaSendSheet
      v-model="sendOpen"
      doctype="Dunning"
      :name="sendName"
      :customer-name="data?.customer_name || ''"
      :manual-done="sendManual"
      :confirming="saving"
      @sent="load"
      @manual-sent="confirmManual"
    />
  </div>
</template>
<script setup>
import {
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import { AppBar } from '@/components/ui'
import { ArchivosRegistroPanel } from '@/components/archivos'
import CallSheet from '@/components/cobranza/CallSheet.vue'
import CobranzaSendSheet from '@/components/cobranza/CobranzaSendSheet.vue'
import FollowupSheet from '@/components/cobranza/FollowupSheet.vue'
import PaymentSheet from '@/components/cobranza/PaymentSheet.vue'
import PromiseSheet from '@/components/cobranza/PromiseSheet.vue'
import StatementSheet from '@/components/cobranza/StatementSheet.vue'
import { isMobile } from '@/composables/breakpoint'
import { shellBoot } from '@/composables/muelleShell'
import { appleKeys, registerPageShortcuts } from '@/composables/shellKeyboard'
import { hoyLive } from '@/composables/useHoy'
import {
  AUTO_API,
  CTX,
  RECORD_KEYS,
  agingLabel,
  agingTone,
  approxMoney,
  autoChip,
  autoConversationRoute,
  autoLine,
  cobranzaApi,
  cobranzaBoot,
  cssValue,
  followupChip,
  formatDay,
  invoiceAction,
  isForeign,
  keyAction,
  listHref,
  loadCobranzaBoot,
  money,
  moneyWithBase,
  moveFocus,
  nextCustomer,
  parsePaymentDone,
  problemOf,
  promiseChip,
  queueQuery,
  recordShortcuts,
  secondaryActions,
  withDueSoon,
} from '@/composables/useCobranza'
import { useCobranzaUndo } from '@/composables/useCobranzaActions'
import { posCollectHref } from '@/utils/posHandoff'
import {
  isTypingTarget,
  moduleEnabled,
  safeReturn,
  sanitizeReturnLabel,
} from '@/vendor/muelle-shell/contracts'
import { useLiveWatch } from '@/vendor/muelle-shell/live-sync/vue'

const LIVE_DOCTYPES = [
  'Sales Invoice',
  'Payment Entry',
  'Dunning',
  'ToDo',
  'Comment',
]

const props = defineProps({ customer: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const phone = isMobile
const boot = cobranzaBoot
// Files on this record come from Archivos when the worker has it.
const archivosEnabled = computed(() =>
  moduleEnabled(shellBoot.value, 'archivos'),
)
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
const scroller = ref(null)
const data = ref(null)
const guard = ref(null)
const problem = ref(null)
const busy = ref('')
const saving = ref(false)
const copied = ref('')
const doneNotice = ref('')
const findingNext = ref(false)
const target = ref(null)
const promiseOpen = ref(false)
const callOpen = ref(false)
const payOpen = ref(false)
const payInvoice = ref('')
const followupOpen = ref(false)
const followupFocus = ref('followup')
const statementOpen = ref(false)
const sendOpen = ref(false)
const sendName = ref('')
// The send sheet offers «I sent it» for a reminder sent from the worker's phone.
const sendManual = ref(false)
const undoer = useCobranzaUndo({ reload: () => load() })
const call = undoer.call

const EVENT_ICONS = {
  payment: 'dollar-sign',
  reminder: 'send',
  promise: 'calendar',
  call: 'phone',
  auto_stop: 'pause-circle',
  auto_resume: 'play-circle',
}
const requestText = __(
  'I need access to Cobranza: read permission for Sales Invoice so I can follow what customers owe.',
)

const company = computed(() =>
  typeof route.query.company === 'string' ? route.query.company : '',
)
const caps = computed(() => data.value?.capabilities || {})
const returnTo = computed(() => safeReturn(route.query.return_to))
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        sanitizeReturnLabel(route.query.return_label) || 'Muelle',
      ])
    : __('Cobranza', null, CTX),
)
const invoices = computed(() =>
  withDueSoon(data.value?.invoices || [], data.value?.today || ''),
)
// The invoice the keyboard and the phone's action bar act on (in the URL).
const focusName = computed(() => {
  const name =
    typeof route.query.factura === 'string' ? route.query.factura : ''
  return invoices.value.some((inv) => inv.name === name)
    ? name
    : invoices.value[0]?.name || ''
})
const focused = computed(() =>
  invoices.value.find((inv) => inv.name === focusName.value),
)
// The invoice the automatic reminders left to a person (Recordatorios de hoy).
const manualInvoice = computed(() =>
  data.value?.auto?.manual
    ? invoices.value.find((inv) => inv.name === data.value.auto.invoice)
    : null,
)
const ICONS = {
  collect: 'shopping-bag',
  pay: 'dollar-sign',
  promise: 'calendar',
  call: 'phone',
  remind: 'send',
  resend: 'send',
}
const SHORT = {
  collect: () => __('Register', null, CTX),
  pay: () => __('Payment', null, CTX),
  promise: () => __('Promise', null, CTX),
  call: () => __('Call', null, CTX),
  remind: () => __('Reminder', null, CTX),
  resend: () => __('Reminder', null, CTX),
}
// Four big buttons: the primary action first, then the others the worker may do.
const phoneActions = computed(() => {
  const inv = focused.value
  if (!inv) return []
  const { primary, secondary } = actionsOf(inv)
  const all = [
    ...(primary.blocked ? [] : [{ ...primary, primary: true }]),
    ...secondary,
  ]
  return all.slice(0, 4).map((action) => ({
    ...action,
    icon: ICONS[action.key] || 'circle',
    short: SHORT[action.key]?.() || action.label,
  }))
})

function actionsOf(inv) {
  const primary = invoiceAction(inv, {
    caps: caps.value,
    ladderReady: data.value?.ladder_ready,
  })
  return { primary, secondary: secondaryActions(inv, primary, caps.value) }
}

function toneClass(tone) {
  return (
    { red: 'text-ink-red-7', orange: 'text-ink-amber-9' }[tone] ||
    'text-ink-gray-6'
  )
}

/** The currency an invoice is owed in (its receivable's); older servers: the record's. */
function owedIn(inv) {
  return inv.currency || data.value?.currency
}

// An invoice reads by its date («Factura del 28 abr»), never its folio.
function invoiceTitle(inv) {
  return inv?.posting_date
    ? __('Invoice of {0}', [formatDay(inv.posting_date)], CTX)
    : __('Invoice', null, CTX)
}

function sheetInvoice(inv) {
  return { name: inv.name, outstanding: inv.outstanding, currency: owedIn(inv) }
}

function eventTitle(event) {
  const amount = moneyWithBase(
    event.amount,
    event.currency || data.value?.currency,
    event.base_amount,
    data.value?.company_currency,
  )
  return (
    {
      payment: __('Payment {0} · {1}', [event.name, amount]),
      reminder: event.automatic
        ? __('Automatic reminder · {0} ({1}) · {2}', [
            event.label,
            event.name,
            event.delivery?.label || '',
          ])
        : event.delivery?.label
          ? __('{0} ({1}) · {2}', [
              event.label,
              event.name,
              event.delivery.label,
            ])
          : __('{0} ({1})', [event.label, event.name]),
      promise:
        event.status === 'Closed'
          ? __('Promise closed · invoice {0}', [event.invoice])
          : __('Promise · invoice {0}', [event.invoice]),
      call: __('Call · invoice {0}', [event.invoice]),
      auto_stop: __('Automatic reminders stopped: the customer replied'),
      auto_resume: __('Automatic reminders resumed'),
    }[event.kind] || event.name
  )
}

let ticket = 0
async function load() {
  const mine = ++ticket
  problem.value = null
  try {
    const record = await cobranzaApi('get_customer', {
      customer: props.customer,
      company: company.value,
    })
    if (mine === ticket) data.value = record
  } catch (error) {
    if (mine !== ticket) return
    const found = problemOf(error)
    if (!data.value && found.kind === 'permission')
      guard.value = {
        title: __('You cannot open this customer'),
        detail: found.detail,
      }
    else problem.value = found
  }
}

function focusInvoice(inv, { reveal = false } = {}) {
  if (!inv) return
  if (route.query.factura !== inv.name)
    router.replace({ query: { ...route.query, factura: inv.name } })
  if (reveal)
    nextTick(() =>
      scroller.value
        ?.querySelector(`[data-invoice="${cssValue(inv.name)}"]`)
        ?.scrollIntoView?.({ block: 'nearest' }),
    )
}

async function run(inv, action, manual = false) {
  if (!inv) return
  focusInvoice(inv)
  target.value = inv
  sendManual.value = manual
  if (action.key === 'promise') {
    promiseOpen.value = true
    return
  }
  if (action.key === 'call') {
    callOpen.value = true
    return
  }
  if (action.key === 'pay') return openPayment(inv.name)
  if (action.key === 'collect') return collectInvoice(inv.name)
  // «Send again» also asks the server: after a payment it prepares a fresh
  // letter with today's balance instead of resending the old amount.
  if (action.key === 'remind' || action.key === 'resend') {
    if (!caps.value.remind) {
      problem.value = {
        title: __('Not allowed', null, CTX),
        detail: __(
          'You need permission to send payment reminders. Ask your manager.',
        ),
      }
      return
    }
    busy.value = `${inv.name}:remind`
    problem.value = null
    try {
      const result = await call(`remind:${inv.name}`, 'send_reminder_prepare', {
        invoice: inv.name,
      })
      sendName.value = result.dunning
      sendOpen.value = true
      load()
    } catch (error) {
      problem.value = problemOf(error)
    } finally {
      busy.value = ''
    }
  }
}

function openPayment(invoice) {
  if (!caps.value.pay && !caps.value.collect) {
    problem.value = {
      title: __('Not allowed', null, CTX),
      detail: __(
        'To register payments you need permission to create and submit payments (Payment Entry). Ask your accountant.',
      ),
    }
    return
  }
  if (!caps.value.pay) return collectInvoice(invoice || focusName.value)
  payInvoice.value = invoice || ''
  payOpen.value = true
}

function openFollowup(focus) {
  followupFocus.value = focus
  followupOpen.value = true
}

/** «Cobrar en caja»: the register comes back here with `done=Payment Entry:<name>`. */
function collectInvoice(invoice) {
  const name = invoice || focusName.value
  if (!name || !data.value) return
  const back = withoutDone(`/crm${route.fullPath}`)
  window.location.assign(
    posCollectHref(
      { name, customer: data.value.customer },
      { returnTo: back, returnLabel: 'Cobranza' },
    ),
  )
}

function saved(after, result) {
  after(result)
  load()
}

function followupSaved(result) {
  const view = result.followup
  undoer.followupSaved(
    result,
    view
      ? __('Follow-up saved: {0}', [view.full_name || view.user])
      : __('Follow-up ended'),
  )
  load()
}

async function resumeReminders() {
  busy.value = 'resume'
  problem.value = null
  try {
    await call(`resume:${props.customer}`, `${AUTO_API}.resume`, {
      customer: props.customer,
      company: data.value.company,
    })
    toast.success(__('Automatic reminders resumed'))
    await load()
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    busy.value = ''
  }
}

async function confirmManual() {
  if (!target.value) return
  saving.value = true
  try {
    await call(`sent:${target.value.name}`, 'log_call', {
      invoice: target.value.name,
      outcome: 'whatsapp',
    })
    sendOpen.value = false
    toast.success(__('Saved: you sent the reminder from your phone'))
    await load()
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    saving.value = false
  }
}

/**
 * Cobranza's list hands over an action: «Log call» (llamar), a promise
 * (promesa), a reminder (recordar), a payment (pagar). The invoice stays
 * focused; only the one-shot action leaves the URL.
 */
function handleAction() {
  const action = route.query.accion
  if (typeof action !== 'string' || !action) return
  const inv = focused.value
  const query = { ...route.query }
  delete query.accion
  router.replace({ query })
  if (!inv) return
  const keys = {
    llamar: 'call',
    promesa: 'promise',
    recordar: inv.current_dunning ? 'resend' : 'remind',
    pagar: 'pay',
  }
  if (keys[action]) run(inv, { key: keys[action] })
}

function withoutDone(path) {
  const url = new URL(path, 'https://muelle.invalid')
  url.searchParams.delete('done')
  return url.pathname + url.search
}

async function resolve(inv, action) {
  if (action.key === 'copy_request')
    return copy(
      __(
        'I need permission to send payment reminders in Cobranza (create and submit Dunning) for invoice {0}.',
        [inv.name],
      ),
    )
  if (action.key === 'copy_folio') return copy(inv.name)
  if (action.key === 'setup') {
    busy.value = `${inv.name}:resolve`
    try {
      await cobranzaApi('setup_ladder', { company: data.value.company })
      toast.success(__('Reminder levels ready'))
      await load()
    } catch (error) {
      problem.value = problemOf(error)
    } finally {
      busy.value = ''
    }
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Copied. Share it with your manager.')
    toast.success(copied.value)
  } catch {
    copied.value = text
  }
}

function listPath() {
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  return list.startsWith('/cobranza') ? list : '/cobranza'
}

/** The list path with another customer focused (going back lands on them). */
function listFocusing(customer) {
  const list = new URL(listPath(), 'https://muelle.invalid')
  const query = Object.fromEntries(list.searchParams.entries())
  return listHref(queueQuery(query, { cliente: customer }))
}

/** Two shell paths with the same path and query (encoding and order aside). */
function samePath(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const parse = (value) => {
    const url = new URL(value, 'https://muelle.invalid')
    return `${url.pathname}?${[...url.searchParams.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('&')}`
  }
  return parse(a) === parse(b)
}

function goBack() {
  if (returnTo.value) return window.location.assign(returnTo.value)
  // Came from that list: a real «back» (forward still works, the list restores its place).
  if (samePath(window.history.state?.back, listPath())) return router.back()
  router.push(listPath())
}

async function goNext() {
  findingNext.value = true
  try {
    const list = new URL(listPath(), 'https://muelle.invalid')
    const page = await cobranzaApi('get_queue', {
      segment: list.searchParams.get('segment') || 'vencidas',
      company: list.searchParams.get('company') || '',
      search: list.searchParams.get('q') || '',
      aging: list.searchParams.get('edad') || '',
      page_length: 5,
    })
    const next = nextCustomer(page.rows, props.customer)
    if (!next) {
      toast.success(__('No more customers in this list'))
      return router.push(listPath())
    }
    router.push({
      name: 'CobranzaCliente',
      params: { customer: next.customer },
      query: { company: next.company, list: listFocusing(next.customer) },
    })
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    findingNext.value = false
  }
}

function handleDone() {
  const done = parsePaymentDone(route.query.done)
  if (!done) return
  doneNotice.value = __(
    'Payment recorded ({0}). The balance below is up to date.',
    [done.name],
  )
  const query = { ...route.query }
  delete query.done
  router.replace({ query })
}

async function start() {
  const retry = Boolean(guard.value)
  guard.value = null
  await loadCobranzaBoot({ refresh: retry })
  if (!boot.value?.enabled) {
    guard.value = {
      title: __('Cobranza is not available'),
      detail:
        boot.value?.reason ||
        __('Ask your manager for permission to read sales invoices.'),
    }
    return
  }
  handleDone()
  await load()
  if (route.query.factura) focusInvoice(focused.value, { reveal: true })
  handleAction()
}

// ── keyboard: never while typing, never under a sheet ───────────────────────
registerPageShortcuts(null, () => recordShortcuts(caps.value))

function onKey(event) {
  if (event.defaultPrevented || guard.value || !data.value) return
  if (document.querySelector('[aria-modal="true"], [role="dialog"]')) return
  const action = keyAction(event, RECORD_KEYS, { apple: appleKeys })
  if (!action || isTypingTarget(event.target)) return
  const inv = focused.value
  const handlers = {
    next: () => moveInvoice(1),
    prev: () => moveInvoice(-1),
    remind: () =>
      inv && run(inv, { key: inv.current_dunning ? 'resend' : 'remind' }),
    promise: () => inv && caps.value.promise && run(inv, { key: 'promise' }),
    call: () => inv && run(inv, { key: 'call' }),
    pay: () => invoices.value.length && openPayment(inv?.name || ''),
    assign: () => caps.value.assign && openFollowup('assign'),
    followup: () => caps.value.assign && openFollowup('followup'),
    next_customer: () => !returnTo.value && goNext(),
    back: () => goBack(),
  }
  const handler = handlers[action]
  if (!handler) return
  event.preventDefault()
  handler()
}

function moveInvoice(delta) {
  const names = invoices.value.map((inv) => inv.name)
  const name = moveFocus(names, focusName.value, delta)
  focusInvoice(
    invoices.value.find((inv) => inv.name === name),
    { reveal: true },
  )
}

// ── live: this customer's invoices, payments, letters, to-dos and notes ──────
const known = computed(() => {
  const names = new Set()
  for (const inv of data.value?.invoices || []) {
    names.add(inv.name)
    if (inv.current_dunning) names.add(inv.current_dunning)
    if (inv.promise?.todo) names.add(inv.promise.todo)
  }
  for (const event of data.value?.timeline || []) names.add(event.name)
  if (data.value?.followup?.todo) names.add(data.value.followup.todo)
  return names
})
useLiveWatch(hoyLive(socket), LIVE_DOCTYPES, (batch) => {
  // Payments and Cobranza's own writes announce the invoice; anything else
  // shows up with the hub's periodic reconciliation.
  if (batch.full || batch.names.some((name) => known.value.has(name)))
    return load()
})

watch(
  () => [props.customer, company.value],
  () => {
    data.value = null
    doneNotice.value = ''
    start()
  },
)
watch(
  () => route.query.accion,
  (action) => action && data.value && handleAction(),
)
function switchCompany(value) {
  const query = { ...route.query, company: value }
  delete query.factura
  router.replace({ query })
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  start()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>
