<!--
  «Cliente» beside a deal or a prospect (Ventas): who this person is to the
  shop, without leaving the conversation. Every deal and prospect of theirs
  with how each ended, the customer group, and what the register holds for
  them: customer card and points, monedero, coupons, referral code.

  One read (doco_marketing contact360.get_contact_client). Every action goes to
  its owner: the group is the Customer's own field (Frappe checks the write),
  «Activar tarjeta» is Doco's Clientes frecuentes enrolment, and selling,
  topping up or spending points, coupons and gift cards happen at the
  register, which brings the seller back here. The whole record stays in
  Contactos («Ficha completa»).
-->
<template>
  <section
    class="flex-none border-b border-outline-gray-1 p-3.5"
    :aria-label="__('Client')"
    data-testid="cliente-panel"
  >
    <header class="mb-2 flex items-center gap-2">
      <h3 class="flex-1 text-sm font-semibold text-ink-gray-9">
        {{ __('Client') }}
      </h3>
      <RouterLink
        v-if="data?.contact"
        :to="sourceRoute('Contact', data.contact.name)"
        class="press inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-2"
        data-testid="cliente-ficha"
      >
        {{ __('Full record') }}
        <span class="lucide-chevron-right size-4" aria-hidden="true" />
      </RouterLink>
    </header>

    <p v-if="loading && !data" class="text-sm text-ink-gray-6" role="status">
      {{ __('Loading the client…') }}
    </p>
    <p v-else-if="failed && !data" class="text-sm text-ink-red-7">
      {{ __('The client could not be loaded.') }}
      <button type="button" class="ml-1 font-semibold underline" @click="load">
        {{ __('Retry') }}
      </button>
    </p>
    <p
      v-else-if="data && !data.contact"
      class="text-sm text-ink-gray-6"
      data-testid="cliente-sin-ficha"
    >
      {{
        __(
          'This prospect has no contact record yet. Its history, points and coupons show here once it becomes a deal or is linked to a contact.',
        )
      }}
    </p>

    <template v-else-if="data">
      <p
        v-if="data.contact.first_seen"
        class="mb-3 text-sm text-ink-gray-6"
        data-testid="cliente-desde"
      >
        {{ __('Client since {0}', [day(data.contact.first_seen)]) }}
      </p>

      <!-- How it has gone with them: won (and what it came to), open, lost. -->
      <dl
        class="mb-3 grid grid-cols-3 gap-px overflow-hidden rounded-6 bg-outline-gray-1"
        data-testid="cliente-tratos"
      >
        <div
          v-for="tile in tiles"
          :key="tile.key"
          class="bg-surface-gray-1 px-2.5 py-2"
        >
          <dt class="text-xs text-ink-gray-6">{{ tile.label }}</dt>
          <dd
            class="num text-lg font-semibold leading-tight"
            :class="tile.tone"
          >
            {{ tile.value }}
          </dd>
          <dd v-if="tile.note" class="num truncate text-xs text-ink-gray-6">
            {{ tile.note }}
          </dd>
        </div>
      </dl>

      <!-- Per customer: the group, then what the register holds for them. -->
      <p
        v-if="!data.customers.length"
        class="mb-3 text-sm text-ink-gray-6"
        data-testid="cliente-sin-cliente"
      >
        {{
          __(
            'Not a customer yet: the group, points and coupons belong to a customer. The first sale at the register creates it.',
          )
        }}
      </p>
      <div
        v-for="row in data.customers"
        :key="row.name"
        class="mb-3 space-y-1"
        :data-cliente-customer="row.name"
      >
        <p
          v-if="data.customers.length > 1"
          class="pt-1 text-sm font-medium text-ink-gray-8"
        >
          {{ row.customer_name }}
        </p>
        <div class="flex min-h-9 items-center gap-2.5 text-sm">
          <span :class="ICON" aria-hidden="true"
            ><span class="lucide-users size-4"
          /></span>
          <span class="flex-1 truncate text-ink-gray-6">{{ __('Group') }}</span>
          <span
            class="truncate font-medium text-ink-gray-9"
            data-testid="cliente-grupo"
            >{{ row.customer_group || '—' }}</span
          >
          <button
            v-if="row.can_change_group"
            type="button"
            :class="SMALL"
            :aria-label="__('Change group of {0}', [row.customer_name])"
            data-testid="cliente-cambiar-grupo"
            @click="openGroups(row)"
          >
            {{ __('Change') }}
          </button>
        </div>

        <template v-if="row.loyalty">
          <!-- Customer card: points and tier, or how to get one. -->
          <div
            v-if="row.loyalty.state === 'member'"
            class="flex min-h-9 items-center gap-2.5 text-sm"
            data-testid="cliente-puntos"
          >
            <span :class="ICON" aria-hidden="true"
              ><span class="lucide-coins size-4"
            /></span>
            <span class="flex-1 truncate text-ink-gray-6">{{
              __('Points')
            }}</span>
            <StatusChip
              v-if="row.loyalty.tier"
              :label="row.loyalty.tier"
              tone="info"
            />
            <span class="num font-semibold text-ink-gray-9">{{
              row.loyalty.points
            }}</span>
            <span v-if="row.loyalty.points_value" class="num text-ink-gray-6">{{
              __('worth {0}', [
                money(row.loyalty.points_value, row.loyalty.currency),
              ])
            }}</span>
          </div>
          <p
            v-if="row.loyalty.state === 'member' && row.loyalty.next_expiry"
            class="pl-[38px] text-xs text-ink-amber-9"
          >
            {{
              __('{0} points expire on {1}', [
                row.loyalty.next_expiry.points,
                day(row.loyalty.next_expiry.date),
              ])
            }}
          </p>
          <div
            v-else-if="row.loyalty.state !== 'member'"
            class="flex min-h-9 items-center gap-2.5 text-sm"
            data-testid="cliente-tarjeta"
          >
            <span :class="ICON" aria-hidden="true"
              ><span class="lucide-id-card size-4"
            /></span>
            <span class="min-w-0 flex-1 text-ink-gray-6">{{
              cardLine(row.loyalty)
            }}</span>
            <button
              v-if="row.loyalty.actions?.enroll"
              type="button"
              :class="SMALL"
              :disabled="busy"
              data-testid="cliente-activar-tarjeta"
              @click="enroll(row)"
            >
              {{ __('Activate card') }}
            </button>
          </div>

          <div
            v-if="row.loyalty.monedero"
            class="flex min-h-9 items-center gap-2.5 text-sm"
            data-testid="cliente-monedero"
          >
            <span :class="ICON" aria-hidden="true"
              ><span class="lucide-wallet size-4"
            /></span>
            <span class="flex-1 truncate text-ink-gray-6">{{
              __('Monedero')
            }}</span>
            <span class="num font-semibold text-ink-gray-9">{{
              money(row.loyalty.monedero.balance, row.loyalty.currency)
            }}</span>
            <a
              v-if="row.loyalty.actions?.deposit"
              :href="saleHref(row, 'deposit')"
              :class="SMALL"
              :aria-label="
                __('Top up monedero of {0} at the register', [
                  row.customer_name,
                ])
              "
              data-testid="cliente-abonar"
              >{{ __('Top up') }}</a
            >
          </div>

          <div
            v-if="row.loyalty.gift_cards_used"
            class="flex min-h-9 items-center gap-2.5 text-sm"
          >
            <span :class="ICON" aria-hidden="true"
              ><span class="lucide-credit-card size-4"
            /></span>
            <span class="flex-1 truncate text-ink-gray-6">{{
              __('Gift cards they paid with')
            }}</span>
            <span class="num font-semibold text-ink-gray-9">{{
              row.loyalty.gift_cards_used
            }}</span>
          </div>
        </template>

        <!-- Coupons and the referral code: codes they say at the counter. -->
        <div
          v-for="coupon in row.coupons"
          :key="coupon.code"
          class="flex min-h-9 items-center gap-2.5 text-sm"
          data-testid="cliente-cupon"
        >
          <span :class="ICON" aria-hidden="true"
            ><span class="lucide-ticket size-4"
          /></span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-ink-gray-9">{{
              coupon.label
            }}</span>
            <span
              v-if="coupon.valid_upto"
              class="block text-xs text-ink-gray-6"
              >{{ __('Valid until {0}', [day(coupon.valid_upto)]) }}</span
            >
          </span>
          <button
            type="button"
            :class="SMALL"
            :aria-label="__('Copy code {0}', [coupon.code])"
            @click="copy(coupon.code)"
          >
            <span class="font-mono">{{ coupon.code }}</span>
            <span class="lucide-copy size-3.5" aria-hidden="true" />
          </button>
        </div>
        <div
          v-if="row.referral"
          class="flex min-h-9 items-center gap-2.5 text-sm"
          data-testid="cliente-referido"
        >
          <span :class="ICON" aria-hidden="true"
            ><span class="lucide-user-plus size-4"
          /></span>
          <span class="flex-1 truncate text-ink-gray-6">{{
            __('Referral code')
          }}</span>
          <button
            type="button"
            :class="SMALL"
            :aria-label="__('Copy code {0}', [row.referral.code])"
            @click="copy(row.referral.code)"
          >
            <span class="font-mono">{{ row.referral.code }}</span>
            <span class="lucide-copy size-3.5" aria-hidden="true" />
          </button>
        </div>

        <p
          v-if="message[row.name]"
          class="text-sm text-ink-green-7"
          role="status"
        >
          {{ message[row.name] }}
        </p>
        <p v-if="error[row.name]" class="text-sm text-ink-red-7" role="alert">
          {{ error[row.name] }}
        </p>

        <a
          v-if="row.loyalty?.actions?.sell"
          :href="saleHref(row, 'sale')"
          class="press mt-1 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-full bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3"
          :title="
            __(
              'Points, monedero, coupons and gift cards are spent at the register.',
            )
          "
          data-testid="cliente-vender"
        >
          <span class="lucide-shopping-cart size-4" aria-hidden="true" />
          {{ __('Sell at the register') }}
        </a>
      </div>

      <!-- Their history: every deal and prospect, this one marked. -->
      <h4
        v-if="history.length"
        class="mb-1 mt-1 flex items-center gap-2 text-sm font-semibold text-ink-gray-9"
      >
        <span
          class="lucide-history size-4 text-ink-gray-6"
          aria-hidden="true"
        />
        {{ __('History') }}
      </h4>
      <p
        v-else
        class="text-sm text-ink-gray-6"
        data-testid="cliente-sin-historial"
      >
        {{ __('No other deals or prospects with this person yet.') }}
      </p>
      <ul class="-mx-1.5" data-testid="cliente-historial">
        <li v-for="item in shownHistory" :key="`${item.doctype}:${item.name}`">
          <RouterLink
            :to="item.to"
            class="flex min-h-11 items-center gap-2.5 rounded-6 px-1.5 py-1 hover:bg-surface-gray-2"
            :aria-current="item.current ? 'page' : undefined"
            :data-cliente-item="item.name"
          >
            <span
              :class="[
                item.doctype === 'CRM Deal'
                  ? 'lucide-briefcase'
                  : 'lucide-user-round',
                'size-4 flex-none text-ink-gray-5',
              ]"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm text-ink-gray-9"
                >{{ item.title
                }}<span
                  v-if="item.current"
                  class="ml-1.5 text-xs text-ink-gray-6"
                  >{{ __('this one') }}</span
                ></span
              >
              <span class="num block text-xs text-ink-gray-6">{{
                [
                  item.doctype === 'CRM Deal' ? __('Deal') : __('Prospect'),
                  item.value ? money(item.value, item.currency) : '',
                  item.date ? day(item.date) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
              }}</span>
            </span>
            <StatusChip
              :label="item.status_label || KIND_LABEL[item.kind]"
              :tone="KIND_TONE[item.kind] || 'neutral'"
            />
          </RouterLink>
        </li>
      </ul>
      <button
        v-if="history.length > SHOWN"
        type="button"
        class="press mt-1 min-h-9 w-full rounded-full text-sm font-medium text-ink-gray-7 hover:bg-surface-gray-2"
        :aria-expanded="all"
        data-testid="cliente-ver-todo"
        @click="all = !all"
      >
        {{ all ? __('Show fewer') : __('Show all {0}', [historyTotal]) }}
      </button>
    </template>

    <BottomSheet
      :open="Boolean(grouping)"
      :title="__('Customer group')"
      :subtitle="grouping?.customer_name"
      @update:open="(open) => open || (grouping = null)"
    >
      <p class="px-4 pb-2 text-sm text-ink-gray-6">
        {{
          __(
            'The group decides the prices, offers and promotions this customer gets at the register and on documents.',
          )
        }}
      </p>
      <p v-if="groups.loading" class="px-4 py-3 text-sm text-ink-gray-6">
        {{ __('Loading groups…') }}
      </p>
      <ul v-else class="px-2 pb-2" data-testid="cliente-grupos">
        <li v-for="group in groups.rows" :key="group">
          <button
            type="button"
            class="press flex min-h-11 w-full items-center gap-3 rounded-6 px-2 text-left text-base hover:bg-surface-gray-2"
            :aria-pressed="picked === group"
            @click="picked = group"
          >
            <span
              :class="[
                picked === group ? 'lucide-check' : '',
                'size-4 flex-none',
              ]"
              aria-hidden="true"
            />
            <span class="flex-1 truncate">{{ group }}</span>
          </button>
        </li>
      </ul>
      <template #actions>
        <button
          type="button"
          :class="['press', BTN.filled, 'w-full']"
          :disabled="busy || !picked || picked === grouping?.customer_group"
          data-testid="cliente-guardar-grupo"
          @click="saveGroup"
        >
          {{ __('Save group') }}
        </button>
      </template>
    </BottomSheet>
  </section>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { call, toast } from 'frappe-ui'
import { BottomSheet, StatusChip } from '@/components/ui'
import { BTN, copyText } from '@/documentos/tools'
import { posSaleHref } from '@/utils/posHandoff'
import { sourceRoute } from '@/utils/shellRoutes'
import { formatDate, formatMoney } from '@/utils/display'

const props = defineProps({
  /** The Contact, when the deal or conversation has one. */
  contact: { type: String, default: '' },
  /** A prospect without a Contact: the server finds the one it already has. */
  lead: { type: String, default: '' },
  /** The deal open beside this panel, marked «this one» in the history. */
  deal: { type: String, default: '' },
  /** Where the register brings the seller back (a /crm/ path). */
  returnTo: { type: String, default: '' },
  returnLabel: { type: String, default: '' },
})

const ICON =
  'flex size-7 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7'
const SMALL =
  'press inline-flex min-h-8 flex-none items-center gap-1.5 rounded-full bg-surface-gray-2 px-3 text-sm font-medium text-ink-gray-9 hover:bg-surface-gray-3 disabled:opacity-50'
const SHOWN = 4
const KIND_TONE = {
  won: 'success',
  lost: 'danger',
  open: 'info',
  converted: 'neutral',
}
const KIND_LABEL = {
  won: __('Won'),
  lost: __('Lost'),
  open: __('Open'),
  converted: __('Converted'),
}

const data = ref(null)
const loading = ref(false)
const failed = ref(false)
const busy = ref(false)
const all = ref(false)
const message = reactive({})
const error = reactive({})

// The inbox moves from person to person quickly: only the newest answer lands.
let asked = 0
async function load() {
  if (!props.contact && !props.lead) {
    data.value = null
    return
  }
  const ticket = ++asked
  loading.value = true
  failed.value = false
  try {
    const out = await call('doco_marketing.api.contact360.get_contact_client', {
      contact: props.contact || null,
      lead: props.contact ? null : props.lead || null,
      deal: props.deal || null,
    })
    if (ticket === asked) data.value = out
  } catch {
    if (ticket === asked) failed.value = true
  } finally {
    if (ticket === asked) loading.value = false
  }
}
watch(
  () => [props.contact, props.lead],
  () => {
    data.value = null
    all.value = false
    load()
  },
  { immediate: true },
)
// Another deal of the same person: only «this one» moves.
watch(
  () => props.deal,
  (deal) => {
    for (const row of data.value?.deals?.rows || [])
      row.current = row.name === deal
  },
)

const money = (value, currency) => formatMoney(value, currency || undefined)
const day = (value) => formatDate(value, { relative: false })

const tiles = computed(() => {
  const deals = data.value?.deals || {}
  const won = deals.won_value || []
  return [
    {
      key: 'won',
      label: __('Won'),
      value: deals.won || 0,
      note: won.length === 1 ? money(won[0].amount, won[0].currency) : '',
      tone: deals.won ? 'text-ink-green-7' : 'text-ink-gray-9',
    },
    {
      key: 'open',
      label: __('Open'),
      value: (deals.open || 0) + (data.value?.leads?.open || 0),
      tone: 'text-ink-gray-9',
    },
    {
      key: 'lost',
      label: __('Lost'),
      value: deals.lost || 0,
      tone: 'text-ink-gray-9',
    },
  ]
})

const history = computed(() => {
  const deals = (data.value?.deals?.rows || []).map((row) => ({
    ...row,
    doctype: 'CRM Deal',
    to: { name: 'Deal 360', params: { dealId: row.name } },
  }))
  const leads = (data.value?.leads?.rows || []).map((row) => ({
    ...row,
    doctype: 'CRM Lead',
    to: { name: 'Prospecto', params: { leadId: row.name } },
  }))
  // The open one first, then newest first.
  return [...deals, ...leads].sort(
    (a, b) =>
      Number(Boolean(b.current)) - Number(Boolean(a.current)) ||
      String(b.date || '').localeCompare(String(a.date || '')),
  )
})
const historyTotal = computed(
  () => (data.value?.deals?.total || 0) + (data.value?.leads?.total || 0),
)
const shownHistory = computed(() =>
  all.value ? history.value : history.value.slice(0, SHOWN),
)

function cardLine(loyalty) {
  if (loyalty.blocked) return loyalty.blocked.reason
  if (loyalty.state === 'no_program')
    return __('There is no points program yet. Set it up from Contactos.')
  if (loyalty.actions?.enroll_denied)
    return __('No customer card yet. A manager can activate it.')
  return __('No customer card yet.')
}

function saleHref(row, intent) {
  return posSaleHref(row.name, {
    intent,
    returnTo: props.returnTo,
    returnLabel: props.returnLabel,
  })
}

async function act(row, fn, done) {
  delete message[row.name]
  delete error[row.name]
  busy.value = true
  try {
    await fn()
    message[row.name] = done
    await load()
  } catch (e) {
    // The server's own reason, verbatim: it names what to do next.
    error[row.name] =
      e?.messages?.[0] ||
      e?.message ||
      __('That did not go through. Try again.')
  } finally {
    busy.value = false
  }
}
function enroll(row) {
  return act(
    row,
    () =>
      call('doco.clientes_frecuentes.api.enroll_customer', {
        customer: row.name,
        company: row.loyalty?.company || null,
      }),
    __('Card activated: this customer earns points from the next sale.'),
  )
}

async function copy(code) {
  if (await copyText(code)) toast.success(__('Copied: {0}', [code]))
}

// «Cambiar grupo»: the leaf groups, the current one ticked.
const grouping = ref(null)
const picked = ref('')
const groups = reactive({ rows: [], loading: false })
async function openGroups(row) {
  grouping.value = row
  picked.value = row.customer_group || ''
  if (groups.rows.length) return
  groups.loading = true
  try {
    const rows = await call('frappe.client.get_list', {
      doctype: 'Customer Group',
      fields: ['name'],
      filters: { is_group: 0 },
      order_by: 'name asc',
      limit_page_length: 200,
    })
    groups.rows = (rows || []).map((row) => row.name)
  } finally {
    groups.loading = false
  }
}
async function saveGroup() {
  const row = grouping.value
  const group = picked.value
  grouping.value = null
  await act(
    row,
    () =>
      call('frappe.client.set_value', {
        doctype: 'Customer',
        name: row.name,
        fieldname: 'customer_group',
        value: group,
      }),
    __('Group saved: {0}.', [group]),
  )
}
</script>
