<template>
  <!-- «Más datos» of a draft purchase: what Desk edits beyond the supplier,
       the store and the lines. Folded under one row that says what is set;
       only what the worker changes here is saved (useCompras morePayload). -->
  <section
    class="border-y border-outline-gray-2"
    data-testid="compra-mas-datos"
  >
    <button
      type="button"
      class="press flex min-h-14 w-full items-center gap-3 py-2 text-left"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="text-base font-semibold text-ink-gray-9">{{
          __('More details', null, 'Compras')
        }}</span>
        <span class="break-words text-sm text-ink-gray-6">{{ summary }}</span>
      </span>
      <span
        :class="[
          open ? 'lucide-chevron-up' : 'lucide-chevron-down',
          'size-5 flex-none text-ink-gray-6',
        ]"
        aria-hidden="true"
      />
    </button>
    <ExpandTransition>
      <div
        v-if="open"
        :id="panelId"
        class="compra-mas grid gap-4 border-t border-outline-gray-1 py-3 sm:grid-cols-2"
      >
        <FormControl
          v-model="transactionDate"
          type="date"
          :label="__('Purchase date', null, 'Compras')"
          :placeholder="__('Today', null, 'Compras')"
        />
        <div>
          <ComprasPicker
            v-model="taxes"
            :display="values.taxes_label"
            :label="__('Taxes', null, 'Compras')"
            :placeholder="__('Search tax template')"
            :empty-text="__('No tax template of this company.')"
            :disabled="!company || values.taxes_restricted"
            :load="(q) => comprasApi('tax_templates', { company, search: q })"
            @pick="(o) => set({ taxes_label: o.label })"
          />
          <p
            v-if="values.taxes_restricted"
            class="mt-1 text-sm text-ink-gray-6"
          >
            {{
              __(
                'This purchase uses a tax template you cannot see; it stays as it is.',
              )
            }}
          </p>
          <button
            v-else-if="values.taxes_and_charges"
            type="button"
            class="press mt-1 min-h-11 text-sm text-ink-blue-link underline sm:min-h-0"
            @click="set({ taxes_and_charges: '', taxes_label: '' })"
          >
            {{ __('No taxes', null, 'Compras') }}
          </button>
        </div>

        <div v-if="canShip || values.shipping_rule">
          <ComprasPicker
            v-model="shipping"
            :display="values.shipping_label"
            :label="__('Shipping', null, 'Compras')"
            :placeholder="__('Search shipping rule')"
            :empty-text="__('No shipping rule of this company.')"
            :disabled="!company || !canShip || values.shipping_restricted"
            :load="loadShipping"
            @pick="(o) => set({ shipping_label: o.label })"
          />
          <p class="mt-1 text-sm text-ink-gray-6" data-testid="compra-envio">
            {{ shippingNote }}
          </p>
          <button
            v-if="
              values.shipping_rule && canShip && !values.shipping_restricted
            "
            type="button"
            class="press mt-1 min-h-11 text-sm text-ink-blue-link underline sm:min-h-0"
            @click="set({ shipping_rule: '', shipping_label: '' })"
          >
            {{ __('No shipping charge') }}
          </button>
        </div>

        <div class="flex flex-col gap-2 sm:col-span-2">
          <span class="text-xs text-ink-gray-5">{{
            __('Extra discount on the whole purchase')
          }}</span>
          <div
            class="grid grid-cols-[7rem_1fr] gap-2 sm:grid-cols-[7rem_10rem_1fr]"
          >
            <Segmented
              :model-value="values.discount_kind"
              :options="kindOptions"
              :label="__('Discount in', null, 'Compras')"
              @update:model-value="(v) => set({ discount_kind: v })"
            />
            <FormControl
              v-model="discountValue"
              type="number"
              :aria-label="
                values.discount_kind === 'amount'
                  ? __('Discount amount', null, 'Compras')
                  : __('Discount percentage', null, 'Compras')
              "
              min="0"
              :max="values.discount_kind === 'amount' ? undefined : 100"
              step="any"
            />
            <FormControl
              v-model="discountOn"
              class="col-span-2 sm:col-span-1"
              type="select"
              :aria-label="__('Discount on', null, 'Compras')"
              :options="onOptions"
            />
          </div>
          <p v-if="orderRules.length" class="text-sm text-ink-gray-6">
            {{
              __(
                'The supplier discount «{0}» sets this discount every time the purchase is saved.',
                [orderRules.map((rule) => rule.title).join(', ')],
              )
            }}
          </p>
        </div>

        <div>
          <ComprasPicker
            v-model="paymentTerms"
            :display="values.payment_terms_label"
            :label="__('Payment terms', null, 'Compras')"
            :placeholder="__('Search payment terms')"
            :empty-text="__('No payment terms match.')"
            :disabled="values.payment_terms_restricted"
            :load="(q) => comprasApi('payment_terms', { search: q })"
            @pick="(o) => set({ payment_terms_label: o.label })"
          />
          <button
            v-if="
              values.payment_terms_template && !values.payment_terms_restricted
            "
            type="button"
            class="press mt-1 min-h-11 text-sm text-ink-blue-link underline sm:min-h-0"
            @click="
              set({ payment_terms_template: '', payment_terms_label: '' })
            "
          >
            {{ __('No payment terms', null, 'Compras') }}
          </button>
        </div>

        <!-- Desk's order data: who at the supplier, where it goes and who is
             billed, in what money and list, on what project. -->
        <template v-for="group in groups" :key="group.key">
          <h3
            class="pt-2 text-sm font-semibold text-ink-gray-8 sm:col-span-2"
            :data-mas-grupo="group.key"
          >
            {{ group.title }}
          </h3>
          <template v-if="group.key === 'moneda'">
            <div>
              <ComprasPicker
                :model-value="values.currency"
                :display="values.currency"
                :label="__('Currency')"
                :placeholder="__('Search currency')"
                :empty-text="__('No enabled currency matches.')"
                :load="(q) => options('currency', q)"
                @update:model-value="changeCurrency"
              />
              <p class="mt-1 text-sm text-ink-gray-6">
                {{
                  values.currency
                    ? __('Prices on this purchase are in {0}.', [
                        values.currency,
                      ])
                    : __('The supplier’s currency, when you save.')
                }}
              </p>
            </div>
            <div v-if="foreign">
              <FormControl
                v-model="conversionRate"
                type="number"
                :label="__('Exchange rate')"
                :placeholder="__('The day’s rate, when you save')"
                min="0"
                step="any"
              />
              <p class="mt-1 text-sm text-ink-gray-6">
                {{
                  Number(values.conversion_rate)
                    ? __('1 {0} = {1}', [
                        values.currency,
                        money(values.conversion_rate, values.company_currency),
                      ])
                    : __('Empty: the rate of the purchase date is looked up.')
                }}
              </p>
            </div>
          </template>
          <div
            v-for="pick in group.picks"
            :key="pick.key"
            :data-mas-campo="pick.key"
          >
            <p
              v-if="values.restricted?.includes(pick.key)"
              class="text-base text-ink-gray-7"
            >
              <span class="mb-1.5 block text-xs text-ink-gray-5">{{
                pick.label
              }}</span>
              {{ __('Set to one you cannot see; it stays as it is.') }}
            </p>
            <template v-else>
              <ComprasPicker
                :model-value="values[pick.key]"
                :display="values[`${pick.key}_label`]"
                :label="pick.label"
                :placeholder="pick.placeholder"
                :empty-text="pick.empty"
                :disabled="Boolean(pick.waiting)"
                :codes="false"
                :load="(q) => options(pick.kind, q)"
                @update:model-value="(v) => set({ [pick.key]: v })"
                @pick="(o) => set({ [`${pick.key}_label`]: o.label })"
              />
              <p v-if="pick.waiting" class="mt-1 text-sm text-ink-gray-6">
                {{ pick.waiting }}
              </p>
              <p v-else-if="pick.note" class="mt-1 text-sm text-ink-gray-6">
                {{ pick.note }}
              </p>
              <button
                v-if="values[pick.key] && !pick.waiting"
                type="button"
                class="press mt-1 min-h-11 text-sm text-ink-blue-link underline sm:min-h-0"
                @click="set({ [pick.key]: '', [`${pick.key}_label`]: '' })"
              >
                {{ pick.clear }}
              </button>
            </template>
          </div>
          <!-- Desk asks the place only once there is an incoterm. -->
          <FormControl
            v-if="group.key === 'entrega' && values.incoterm"
            v-model="namedPlace"
            type="text"
            :label="__('Incoterm place')"
            :placeholder="__('Port, city or warehouse')"
            maxlength="140"
          />
        </template>

        <div class="sm:col-span-2">
          <template v-if="values.terms_rich">
            <span class="mb-1.5 block text-xs text-ink-gray-5">{{
              __('Notes for the supplier')
            }}</span>
            <p
              class="whitespace-pre-line break-words rounded-6 bg-surface-gray-1 p-3 text-base text-ink-gray-8"
            >
              {{ values.terms }}
            </p>
            <p class="mt-1 text-sm text-ink-gray-6">
              {{
                __(
                  'These notes have formatting (bold, lists); change them in the full form.',
                )
              }}
            </p>
          </template>
          <FormControl
            v-else
            v-model="terms"
            type="textarea"
            :rows="3"
            :label="__('Notes for the supplier')"
            :placeholder="__('Delivery, packing, who receives…')"
            maxlength="4000"
          />
        </div>

        <div class="sm:col-span-2">
          <FormControl
            v-model="ignoreRules"
            type="checkbox"
            :disabled="!canIgnore"
            :label="__('Do not apply automatic discounts')"
          />
          <p class="mt-1 text-sm text-ink-gray-6">
            {{
              !canIgnore
                ? __(
                    'Only the purchasing manager turns the supplier discounts off on a purchase.',
                  )
                : values.ignore_pricing_rule
                  ? __(
                      'Lines keep the price and discount you type; the supplier discounts are not applied.',
                    )
                  : __(
                      'The supplier discounts apply to the lines they cover every time you save.',
                    )
            }}
          </p>
        </div>
      </div>
    </ExpandTransition>
  </section>
</template>
<script setup>
import { computed, ref, useId } from 'vue'
import { FormControl } from 'frappe-ui'
import { ExpandTransition, Segmented } from '@/components/ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { comprasApi, money } from '@/composables/useCompras'
import { pickHint } from '@/composables/useEnvios'
import { formatDay } from '@/utils/contactos'

const props = defineProps({
  // The form's «Más datos» (useCompras moreFrom); each change comes back as
  // a patch for the form, so two changes in one tick never undo each other.
  values: { type: Object, required: true },
  company: { type: String, default: '' },
  currency: { type: String, default: 'MXN' },
  // Whole-order supplier discounts the last save applied.
  orderRules: { type: Array, default: () => [] },
  // «No aplicar descuentos automáticos» is the purchasing manager's (level 1).
  canIgnore: { type: Boolean, default: false },
  // Buyers pick a shipping rule with «select» on it (bootstrap `shipping`).
  canShip: { type: Boolean, default: false },
  // The supplier the contact and its address belong to.
  supplier: { type: String, default: '' },
  // The supplier changed in this edit: its contact and address come on save.
  supplierChanged: { type: Boolean, default: false },
})
const emit = defineEmits(['patch'])
const open = ref(false)
const panelId = useId()

function set(patch) {
  emit('patch', patch)
}
const field = (key) =>
  computed({
    get: () => props.values[key],
    set: (value) => set({ [key]: value }),
  })
const transactionDate = field('transaction_date')
const taxes = field('taxes_and_charges')
const shipping = field('shipping_rule')
const discountValue = field('discount_value')
const discountOn = field('apply_discount_on')
const paymentTerms = field('payment_terms_template')
const terms = field('terms')
const ignoreRules = field('ignore_pricing_rule')
const namedPlace = field('named_place')
const conversionRate = field('conversion_rate')

// A currency other than the company's has its rate; a new currency clears the
// old one so the day's rate is looked up unless the worker types another.
const foreign = computed(
  () =>
    Boolean(props.values.currency) &&
    Boolean(props.values.company_currency) &&
    props.values.currency !== props.values.company_currency,
)
function changeCurrency(value) {
  if (value === props.values.currency) return
  set({ currency: value, conversion_rate: '' })
}

function options(kind, search) {
  return comprasApi('more_options', {
    kind,
    company: props.company,
    supplier: props.supplier,
    search,
  })
}
// Desk's order data in four groups, each picker with what it waits for.
const groups = computed(() => {
  const noSupplier = !props.supplier
    ? __('Choose the supplier first.')
    : props.supplierChanged
      ? __('The new supplier’s contact and address come when you save.')
      : ''
  const noCompany = !props.company ? __('Choose the company first.') : ''
  return [
    {
      key: 'proveedor',
      title: __('With the supplier'),
      picks: [
        {
          key: 'contact_person',
          kind: 'contact',
          label: __('Supplier contact'),
          placeholder: __('Search contact'),
          empty: __('This supplier has no contact you can use.'),
          clear: __('No contact'),
          waiting: noSupplier,
        },
        {
          key: 'supplier_address',
          kind: 'supplier_address',
          label: __('Supplier address'),
          placeholder: __('Search address'),
          empty: __('This supplier has no address you can use.'),
          clear: __('No address'),
          waiting: noSupplier,
        },
      ],
    },
    {
      key: 'entrega',
      title: __('Delivery and billing'),
      picks: [
        {
          key: 'shipping_address',
          kind: 'company_address',
          label: __('Deliver to'),
          placeholder: __('Search address'),
          empty: __('The company has no address you can use.'),
          clear: __('No address'),
          waiting: noCompany,
        },
        {
          key: 'billing_address',
          kind: 'company_address',
          label: __('Bill to'),
          placeholder: __('Search address'),
          empty: __('The company has no address you can use.'),
          clear: __('No address'),
          waiting: noCompany,
        },
        {
          key: 'incoterm',
          kind: 'incoterm',
          label: __('Incoterm'),
          placeholder: __('Search incoterm'),
          empty: __('No incoterm matches.'),
          clear: __('No incoterm'),
        },
      ],
    },
    {
      key: 'moneda',
      title: __('Currency and prices'),
      picks: [
        {
          key: 'buying_price_list',
          kind: 'price_list',
          label: __('Price list'),
          placeholder: __('Search price list'),
          empty: __('No buying price list matches.'),
          clear: __('No price list'),
          note: __('A new list prices the lines it has when you save.'),
        },
      ],
    },
    {
      key: 'cuentas',
      title: __('Accounting'),
      picks: [
        {
          key: 'project',
          kind: 'project',
          label: __('Project'),
          placeholder: __('Search project'),
          empty: __('No open project of this company matches.'),
          clear: __('No project'),
          waiting: noCompany,
        },
        {
          key: 'cost_center',
          kind: 'cost_center',
          label: __('Cost center'),
          placeholder: __('Search cost center'),
          empty: __('No cost center of this company matches.'),
          clear: __('No cost center'),
          waiting: noCompany,
          note: __('Lines without their own follow it.'),
        },
      ],
    },
  ]
})

async function loadShipping(search) {
  const rows = await comprasApi('shipping_rules', {
    company: props.company,
    search,
  })
  return rows.map((row) => ({ ...row, hint: pickHint(row) }))
}
// Under the picker: what the saved purchase pays, or when it is worked out.
const shippingNote = computed(() => {
  const m = props.values
  if (m.shipping_restricted)
    return __(
      'This purchase uses a shipping rule you cannot see; it stays as it is.',
    )
  if (!m.shipping_rule)
    return __(
      'A shipping rule adds the delivery to the purchase’s taxes and charges.',
    )
  if (m.shipping_rule === m.shipping_saved)
    return m.shipping_charge
      ? __('It charges {0} on this purchase.', [
          money(m.shipping_charge, props.currency),
        ])
      : __('It charges nothing on this purchase as it is.')
  return __('The charge is worked out when you save.')
})

const kindOptions = computed(() => [
  { value: 'percent', label: '%' },
  { value: 'amount', label: '$' },
])
const onOptions = computed(() => [
  { value: 'Grand Total', label: __('on the total with taxes') },
  { value: 'Net Total', label: __('on the subtotal before taxes') },
])

// What is set, in one line, while the section is folded.
const summary = computed(() => {
  const m = props.values
  const parts = []
  parts.push(
    m.transaction_date
      ? __('Purchase date {0}', [formatDay(m.transaction_date)])
      : __('Purchase date today'),
  )
  if (m.taxes_label || m.taxes_and_charges)
    parts.push(m.taxes_label || m.taxes_and_charges)
  if (m.shipping_label || m.shipping_rule)
    parts.push(__('shipping {0}', [m.shipping_label || m.shipping_rule]))
  const value = Number(m.discount_value) || 0
  if (value)
    parts.push(
      m.discount_kind === 'amount'
        ? __('{0} off', [money(value, props.currency)])
        : __('{0} % off', [value]),
    )
  if (m.payment_terms_label || m.payment_terms_template)
    parts.push(m.payment_terms_label || m.payment_terms_template)
  if (String(m.terms || '').trim())
    parts.push(__('with notes', null, 'Compras'))
  if (m.ignore_pricing_rule) parts.push(__('no automatic discounts'))
  if (m.contact_person_label) parts.push(m.contact_person_label)
  if (foreign.value) parts.push(m.currency)
  if (m.buying_price_list_label) parts.push(m.buying_price_list_label)
  if (m.project_label) parts.push(m.project_label)
  if (m.cost_center_label) parts.push(m.cost_center_label)
  return parts.join(', ')
})
</script>
<style scoped>
/* 44 px fields on a phone, like the pickers beside them. */
@media (max-width: 639px) {
  .compra-mas :deep(select),
  .compra-mas :deep(input:not([type='checkbox'])),
  .compra-mas :deep(textarea) {
    min-height: 44px;
    font-size: 1rem;
  }
}
</style>
