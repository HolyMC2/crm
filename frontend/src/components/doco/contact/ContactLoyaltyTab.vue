<!--
  Contact 360 · Puntos y saldo — what the shop owes this person, per linked
  customer: points (a promise), monedero (pesos already paid in) and the gift
  cards they paid with (bearer value). Three figures, never added together.

  Every action goes to its owner: «Inscribir» and «Ajustar puntos» to Doco's
  Clientes frecuentes endpoints (native records), «Vender en caja» and «Abonar
  al monedero» to the register, which re-authorizes the customer and brings the
  worker back to this tab.
-->
<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base">
    <SectionAvailability
      :availability="data?.availability"
      @retry="resource.reload()"
    />
    <div v-if="resource.loading && !data" class="p-6 text-sm text-ink-gray-6">
      {{ __('Loading points and balance…') }}
    </div>
    <div v-else-if="resource.error && !data" class="p-6 text-sm text-ink-red-7">
      {{ __('Points and balance could not be loaded.') }}
      <button class="ml-1 font-semibold underline" @click="resource.reload()">
        {{ __('Retry') }}
      </button>
    </div>
    <div
      v-else-if="data && data.availability?.available !== false"
      class="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-3 md:p-6"
    >
      <p
        v-if="!data.customers?.length"
        class="rounded-xl border border-outline-gray-2 p-6 text-center text-sm text-ink-gray-6"
      >
        {{
          __(
            'This contact is not linked to a customer yet. Points and monedero belong to a customer: sell to them once at the register, or link a customer from «Conexiones».',
          )
        }}
      </p>

      <a
        v-if="data.winback"
        href="/crm/reports?tab=marketing&segment=inactive_members"
        class="inline-flex text-sm font-semibold text-ink-gray-8 underline"
        data-testid="loyalty-winback"
        >{{ __('Members without buying: prepare messages') }}</a
      >

      <article
        v-for="row in data.customers"
        :key="row.customer"
        class="space-y-4"
        :data-testid="`loyalty-${row.state}`"
      >
        <header class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="text-base font-semibold text-ink-gray-9">
            {{ row.customer_name }}
          </h3>
          <span v-if="row.program" class="text-xs text-ink-gray-6">
            {{ programLine(row) }}
          </span>
        </header>

        <p
          v-if="message[row.customer]"
          role="status"
          class="text-sm text-ink-green-7"
        >
          {{ message[row.customer] }}
        </p>
        <p
          v-if="error[row.customer]"
          role="alert"
          class="text-sm text-ink-red-7"
        >
          {{ error[row.customer] }}
        </p>

        <!-- Blocked: another company's programme. Say whose and where to change it. -->
        <div
          v-if="row.blocked"
          class="space-y-2 rounded-xl border border-outline-amber-2 bg-surface-amber-1 p-3 text-sm text-ink-gray-8"
          data-testid="loyalty-blocked"
        >
          <p>{{ row.blocked.reason }}</p>
          <a
            class="font-semibold underline"
            :href="`/app/customer/${encodeURIComponent(row.customer)}`"
            >{{ __('Open customer') }}</a
          >
        </div>

        <!-- No programme in this company: the refusal names who can create it, and creates it here. -->
        <div
          v-else-if="row.state === 'no_program'"
          class="space-y-3 rounded-xl border border-outline-gray-2 p-3 text-sm"
        >
          <p class="text-ink-gray-8">
            {{ __('There is no points program in {0}.', [row.company]) }}
          </p>
          <template v-if="row.actions?.create_program">
            <Button
              v-if="!setup"
              :label="__('Create program')"
              data-testid="loyalty-create-program"
              @click="openSetup(row)"
            />
            <div v-else class="space-y-2" data-testid="loyalty-program-setup">
              <p class="text-xs text-ink-gray-6">
                {{ defaultsLine(setup.defaults) }}
                {{ __('You can change these on the program afterwards.') }}
              </p>
              <label class="block text-xs font-semibold text-ink-gray-7">
                {{ __('Expense account for redeemed points') }}
                <select
                  v-model="setup.expense_account"
                  class="mt-1 block w-full rounded border border-outline-gray-2 bg-surface-white p-2 text-sm"
                >
                  <option
                    v-for="acc in setup.expense_accounts"
                    :key="acc"
                    :value="acc"
                  >
                    {{ acc }}
                  </option>
                </select>
              </label>
              <div class="flex flex-wrap gap-2">
                <Button
                  variant="solid"
                  :label="__('Create program')"
                  :loading="busy"
                  :disabled="!setup.expense_account"
                  @click="createProgram(row)"
                />
                <Button :label="__('Cancel')" @click="setup = null" />
              </div>
            </div>
          </template>
          <p v-else class="text-ink-gray-6">
            {{
              __(
                'Ask whoever keeps the accounts to create it; then come back here to enroll this customer.',
              )
            }}
          </p>
        </div>

        <!-- Not a member yet. -->
        <div
          v-else-if="row.state === 'not_member'"
          class="flex flex-wrap items-center gap-3 rounded-xl border border-outline-gray-2 p-3 text-sm"
        >
          <span class="text-ink-gray-8">
            {{ __('Not enrolled in {0}.', [row.program?.label]) }}
          </span>
          <Button
            v-if="row.actions?.enroll"
            variant="solid"
            :label="__('Enroll')"
            :loading="busy"
            data-testid="loyalty-enroll"
            @click="enroll(row)"
          />
          <span v-else class="text-ink-gray-6">
            {{ __('Ask a manager to enroll this customer.') }}
          </span>
        </div>

        <div
          v-if="row.state === 'member' || row.monedero"
          class="grid grid-cols-2 gap-2 md:grid-cols-4"
        >
          <Metric
            v-if="row.state === 'member'"
            :label="__('Points')"
            :value="`${row.points} · ${money(row.points_value, row.currency)}`"
            tone="green"
          />
          <Metric
            v-if="row.monedero"
            :label="__('Monedero')"
            :value="money(row.monedero.balance, row.currency)"
          />
          <Metric
            v-if="row.state === 'member'"
            :label="__('Next expiry')"
            :value="
              row.next_expiry
                ? `${row.next_expiry.points} · ${date(row.next_expiry.date)}`
                : '—'
            "
          />
          <Metric
            :label="__('Last purchase')"
            :value="date(row.last_purchase)"
          />
        </div>

        <div class="flex flex-wrap gap-2">
          <a
            v-if="row.actions?.sell"
            :href="saleHref(row, 'sale')"
            class="inline-flex min-h-[36px] items-center rounded bg-surface-gray-7 px-3 text-sm font-semibold text-ink-white"
            data-testid="loyalty-sell"
            >{{ __('Sell at the register') }}</a
          >
          <a
            v-if="row.actions?.deposit"
            :href="saleHref(row, 'deposit')"
            class="inline-flex min-h-[36px] items-center rounded border border-outline-gray-3 px-3 text-sm font-semibold text-ink-gray-8"
            data-testid="loyalty-deposit"
            >{{ __('Add to monedero') }}</a
          >
          <Button
            v-if="row.actions?.adjust && adjusting !== row.customer"
            :label="__('Adjust points')"
            data-testid="loyalty-adjust"
            @click="startAdjust(row)"
          />
        </div>

        <form
          v-if="adjusting === row.customer"
          class="space-y-2 rounded-xl border border-outline-gray-2 p-3"
          data-testid="loyalty-adjust-form"
          @submit.prevent="adjust(row)"
        >
          <label class="block text-xs font-semibold text-ink-gray-7">
            {{ __('Points to add (use a minus sign to take away)') }}
            <input
              v-model.number="adjustForm.points"
              type="number"
              step="1"
              class="mt-1 block w-full rounded border border-outline-gray-2 bg-surface-white p-2 text-sm"
            />
          </label>
          <label class="block text-xs font-semibold text-ink-gray-7">
            {{ __('Reason') }}
            <input
              v-model="adjustForm.reason"
              maxlength="140"
              class="mt-1 block w-full rounded border border-outline-gray-2 bg-surface-white p-2 text-sm"
            />
          </label>
          <div class="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="solid"
              :label="__('Save adjustment')"
              :loading="busy"
              :disabled="!adjustForm.points || !adjustForm.reason.trim()"
            />
            <Button :label="__('Cancel')" @click="adjusting = ''" />
          </div>
        </form>

        <section v-if="row.movements?.length">
          <h4 class="mb-2 text-sm font-semibold text-ink-gray-9">
            {{ __('Movements') }}
          </h4>
          <ul
            class="divide-y divide-outline-gray-1 rounded-xl border border-outline-gray-2"
          >
            <li
              v-for="(move, index) in row.movements"
              :key="`${move.reference_name}:${move.kind}:${index}`"
              class="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span class="min-w-0">
                <span class="block truncate font-medium text-ink-gray-8">{{
                  kindLabel(move.kind)
                }}</span>
                <span class="block truncate text-xs text-ink-gray-5"
                  >{{ date(move.ts || move.posting_date) }} ·
                  {{ move.reference_name || '—' }}</span
                >
              </span>
              <span
                class="shrink-0 font-semibold tabular-nums"
                :class="
                  Number(move.amount) < 0 ? 'text-ink-red-6' : 'text-ink-gray-8'
                "
                >{{
                  move.points != null
                    ? `${move.points} ${__('pts')}`
                    : money(move.amount, row.currency)
                }}</span
              >
            </li>
          </ul>
          <p
            v-if="row.movements_truncated"
            class="mt-1 text-xs text-ink-gray-6"
          >
            {{ __('Showing the {0} most recent.', [row.movements.length]) }}
          </p>
        </section>

        <section v-if="row.gift_cards_used?.length">
          <h4 class="mb-2 text-sm font-semibold text-ink-gray-9">
            {{ __('Gift cards used') }}
          </h4>
          <ul class="space-y-1 text-sm text-ink-gray-7">
            <li
              v-for="card in row.gift_cards_used"
              :key="`${card.invoice}:${card.card}`"
            >
              {{ card.card }} · {{ money(card.amount, row.currency) }} ·
              {{ date(card.date) }} · {{ card.invoice }}
            </li>
          </ul>
        </section>
      </article>
    </div>
  </section>
</template>

<script setup>
import { formatMoney, requestId } from '@/utils/contactos'
import { posSaleHref } from '@/utils/posHandoff'
import SectionAvailability from '@/components/doco/contact/SectionAvailability.vue'
import { computed, defineComponent, h, reactive, ref } from 'vue'
import { Button, call, createResource } from 'frappe-ui'

const props = defineProps({
  docname: { type: String, required: true },
  selectedCustomer: { type: String, default: '' },
})
const resource = createResource({
  url: 'doco_marketing.api.contact360.get_contact_loyalty',
  params: { contact: props.docname, customer: props.selectedCustomer || null },
  // No persistent cache: balances must never render for another account or
  // user before the server re-authorizes them.
  auto: true,
})
const data = computed(() => resource.data || null)
const busy = ref(false)
const message = reactive({})
const error = reactive({})
const adjusting = ref('')
const adjustForm = reactive({ points: null, reason: '', requestId: '' })
const setup = ref(null)

const KIND_LABELS = {
  deposit: __('Deposit'),
  redemption: __('Paid with monedero'),
  cashback: __('Points earned'),
  cashback_spent: __('Points redeemed'),
  credit_note: __('Refund to monedero'),
  adjustment: __('Points adjusted'),
}
function kindLabel(kind) {
  return KIND_LABELS[kind] || kind || '—'
}
function money(value, currency) {
  return formatMoney(value, currency)
}
function date(value) {
  return value
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(
        new Date(String(value).length === 10 ? `${value}T12:00:00` : value),
      )
    : '—'
}
function percent(program) {
  return program?.collection_factor
    ? Math.round(
        (program.conversion_factor / program.collection_factor) * 10000,
      ) / 100
    : 0
}
function programLine(row) {
  const program = row.program
  const parts = [program.label, __('{0} % back', [percent(program)])]
  if (row.tier) parts.push(row.tier)
  return parts.join(' · ')
}
function defaultsLine(defaults) {
  return __(
    '1 point for every {0} spent, each point worth {1}, points last {2} days.',
    [
      money(defaults.collection_factor),
      money(defaults.conversion_factor),
      defaults.expiry_duration,
    ],
  )
}
function returnTo() {
  return `/crm/contactos/${encodeURIComponent(props.docname)}?tab=contact_loyalty`
}
function saleHref(row, intent) {
  return posSaleHref(row.customer, {
    intent,
    returnTo: returnTo(),
    returnLabel: __('Contactos'),
  })
}
function clear(row) {
  delete message[row.customer]
  delete error[row.customer]
}
async function run(row, fn, done) {
  clear(row)
  busy.value = true
  try {
    await fn()
    message[row.customer] = done
    await resource.reload()
  } catch (e) {
    // The server's own reason, verbatim: it names what to do next.
    error[row.customer] =
      e?.messages?.[0] ||
      e?.message ||
      __('That did not go through. Try again.')
  } finally {
    busy.value = false
  }
}
function enroll(row) {
  return run(
    row,
    () =>
      call('doco.clientes_frecuentes.api.enroll_customer', {
        customer: row.customer,
        company: row.company,
      }),
    __('Enrolled. Their next purchase earns points.'),
  )
}
function startAdjust(row) {
  adjusting.value = row.customer
  Object.assign(adjustForm, {
    points: null,
    reason: '',
    requestId: requestId(),
  })
}
function adjust(row) {
  return run(
    row,
    async () => {
      await call('doco.clientes_frecuentes.api.adjust_points', {
        customer: row.customer,
        company: row.company,
        points: adjustForm.points,
        reason: adjustForm.reason,
        request_id: adjustForm.requestId,
      })
      adjusting.value = ''
    },
    __('Points adjusted.'),
  )
}
async function openSetup(row) {
  clear(row)
  try {
    const out = await call('doco.clientes_frecuentes.api.get_program_setup', {
      company: row.company,
    })
    setup.value = { ...out, expense_account: out.expense_accounts?.[0] || '' }
  } catch (e) {
    error[row.customer] = e?.messages?.[0] || e?.message
  }
}
function createProgram(row) {
  return run(
    row,
    async () => {
      await call('doco.clientes_frecuentes.api.create_program', {
        company: row.company,
        expense_account: setup.value.expense_account,
        cost_center: setup.value.cost_center,
      })
      setup.value = null
    },
    __('Program created. You can enroll customers now.'),
  )
}

const Metric = defineComponent({
  props: {
    label: String,
    value: [String, Number],
    tone: { type: String, default: 'gray' },
  },
  setup(p) {
    const tones = {
      gray: 'rounded-xl bg-surface-gray-1 p-3 text-ink-gray-9',
      green: 'rounded-xl bg-surface-green-2 p-3 text-ink-green-8',
    }
    return () =>
      h('div', { class: tones[p.tone] || tones.gray }, [
        h(
          'div',
          { class: 'text-xs font-bold uppercase tracking-wide' },
          p.label,
        ),
        h(
          'div',
          { class: 'mt-1 truncate text-lg font-bold tabular-nums' },
          String(p.value ?? '—'),
        ),
      ])
  },
})
</script>
