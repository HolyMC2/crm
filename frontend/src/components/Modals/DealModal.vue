<template>
  <Dialog v-model:open="show" :size="'3xl'">
    <template #body>
      <div class="bg-surface-elevation-2 px-4 pb-6 pt-5 sm:px-6">
        <div class="mb-5 flex items-center justify-between">
          <div>
            <h3 class="text-3xl-semibold leading-6 text-ink-gray-9">
              {{ __('Create Deal') }}
            </h3>
          </div>
          <div class="flex items-center gap-1">
            <Button
              v-if="isManager() && !isMobileView"
              variant="ghost"
              class="w-7"
              :tooltip="__('Edit Fields Layout')"
              :icon="EditIcon"
              @click="openQuickEntryModal"
            />
            <Button
              variant="ghost"
              class="w-7"
              icon="lucide-x"
              @click="show = false"
            />
          </div>
        </div>
        <div>
          <div
            v-if="hasOrganizationSections || hasContactSections"
            class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <div
              v-if="hasOrganizationSections"
              class="flex items-center gap-3 text-sm text-ink-gray-5"
            >
              <div>{{ __('Choose Existing Organization') }}</div>
              <Switch v-model="chooseExistingOrganization" />
            </div>
            <div
              v-if="hasContactSections"
              class="flex items-center gap-3 text-sm text-ink-gray-5"
            >
              <div>{{ __('Choose Existing Contact') }}</div>
              <Switch v-model="chooseExistingContact" />
            </div>
          </div>
          <div
            v-if="hasOrganizationSections || hasContactSections"
            class="h-px w-full border-t my-5"
          />
          <FieldLayout
            v-if="tabs.data?.length"
            :tabs="tabs.data"
            :data="deal.doc"
            doctype="CRM Deal"
          />

          <!-- Doco: mark whether the customer's phone is on WhatsApp, so the inbox
               knows up front (drives the conversation banner). Defaults to on. -->
          <label class="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-gray-7">
            <input
              v-model="deal.doc.mobile_is_whatsapp"
              type="checkbox"
              :true-value="1"
              :false-value="0"
              class="h-4 w-4 rounded border-outline-gray-3 text-green-600 focus:ring-0"
            />
            {{ __('El teléfono tiene WhatsApp') }}
          </label>

          <!--
            Doco customization: inline Repair Order creation.
            All form fields, IMEI creation, and item-group filtering live in
            RepairOrderInlineForm so this file stays easy to rebase upstream.
            `newRepairOrder` is read in createDeal() to call the doco API.
          -->
          <div class="mt-5 border-t pt-5">
            <p class="mb-3 text-sm font-semibold text-ink-gray-8">
              {{ __('New Repair Order') }}
              <span class="ml-1 text-xs font-normal text-ink-gray-5">
                {{ __('(optional)') }}
              </span>
            </p>
            <RepairOrderInlineForm v-model="newRepairOrder" />
          </div>

          <!--
            Doco customization: customer details for ERPNext sync.
            Pre-filled from company defaults; submitted after deal creation
            to sync_deal_contacts_to_erpnext with user-provided address data.
          -->
          <div class="mt-5 border-t pt-5">
            <p class="mb-3 text-sm font-semibold text-ink-gray-8">
              {{ __('Customer Details') }}
              <span class="ml-1 text-xs font-normal text-ink-gray-5">
                {{ __('(for ERPNext sync)') }}
              </span>
            </p>
            <div class="grid grid-cols-2 gap-4">
              <FormControl
                type="text"
                v-model="customerDetails.tax_id"
                :label="__('RFC / Tax ID')"
                placeholder="XAXX010101000"
                class="uppercase"
              />
              <FormControl
                type="date"
                v-model="customerDetails.birthday"
                :label="__('Birthday')"
              />
              <FormControl
                type="text"
                v-model="customerDetails.address_line1"
                :label="__('Address Line 1')"
                :placeholder="__('Street address')"
              />
              <FormControl
                type="text"
                v-model="customerDetails.city"
                :label="__('City')"
                :placeholder="__('City')"
              />
              <Link
                doctype="Territory"
                v-model="customerDetails.territory"
                :label="__('Territory')"
                :placeholder="__('Select territory')"
              />
              <Link
                doctype="Customer Group"
                v-model="customerDetails.customer_group"
                :label="__('Customer Group')"
                :placeholder="__('Select group')"
              />
            </div>
          </div>

          <ErrorMessage v-if="error" class="mt-4" :message="__(error)" />
        </div>
      </div>
      <div class="px-4 pb-7 pt-4 sm:px-6">
        <div class="flex flex-row-reverse gap-2">
          <Button
            variant="solid"
            :label="__('Create')"
            :loading="isDealCreating"
            @click="createDeal"
          />
          <Button
            :label="__('Enrich')"
            :loading="isEnriching"
            :disabled="!deal.doc.website"
            :tooltip="__('Fill fields from the company website')"
            iconLeft="zap"
            @click="enrichFromWebsite"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import EditIcon from '@/components/Icons/EditIcon.vue'
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
// Doco customization: repair order form extracted into its own component.
import RepairOrderInlineForm from '@/components/Modals/RepairOrderInlineForm.vue'
import Link from '@/components/Controls/Link.vue'
import { usersStore } from '@/stores/users'
import { statusesStore } from '@/stores/statuses'
import { isMobileView } from '@/composables/settings'
import { showQuickEntryModal, quickEntryProps } from '@/composables/modals'
import { useDocument } from '@/data/document'
import { useTelemetry } from 'frappe-ui/frappe'
import { Switch, FormControl, createResource, call, toast } from 'frappe-ui'
import { computed, ref, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  defaults: { type: Object, default: () => ({}) },
  // where to land after create; default = upstream Deal page. The redesign inbox
  // passes { name: 'Deal 360' } to land on /deal/:dealId instead.
  redirect: { type: Object, default: () => ({ name: 'Deal' }) },
})

const { getUser, isManager } = usersStore()
const { getDealStatus, statusOptions } = statusesStore()

const show = defineModel({ type: Boolean })
const router = useRouter()
const error = ref(null)

const { document: deal, triggerOnBeforeCreate } = useDocument('CRM Deal')

const hasOrganizationSections = ref(true)
const hasContactSections = ref(true)

const isDealCreating = ref(false)
const isEnriching = ref(false)
const chooseExistingContact = ref(false)
const chooseExistingOrganization = ref(false)

// Doco customization: form state for the optional inline Repair Order.
// RepairOrderInlineForm binds to this via v-model; createDeal() reads it
// after the deal is saved to optionally call create_and_link_repair_order.
const newRepairOrder = ref({
  device_model: null,
  repair_to_be_done: null,
  falla_reportada: '',
  general_status: '',
  client: null,
  technician: null,
  imei: null,
  has_sim_tray: false,
  is_wet: false,
  turns_on: false,
  broken_screen: false,
  has_phone_case: false,
  unlock_method: 'none',
  phone_pin: '',
  phone_pattern: '',
  quote_amount: 0,
  advance_amount: 0,
})

// Doco customization: customer details for ERPNext sync.
// Pre-filled from company defaults; passed to sync_deal_contacts_to_erpnext
// after deal creation so every contact gets an Individual Customer + address.
// tax_id + birthday mirror the Intake (mostrador) SPA "Más datos del cliente"
// section so the FCRM operator can capture the same identity data without
// switching apps.
const customerDetails = ref({
  address_line1: '',
  city: '',
  territory: '',
  customer_group: '',
  tax_id: '',
  birthday: '',
})

createResource({
  url: 'doco.docoutils.customers.get_company_address_defaults',
  auto: true,
  onSuccess(defaults) {
    customerDetails.value.address_line1 = defaults.address_line1 || ''
    customerDetails.value.city = defaults.city || ''
    customerDetails.value.territory = defaults.territory || ''
    customerDetails.value.customer_group = defaults.customer_group || ''
  },
})

const { capture } = useTelemetry()

// Prefill the form from the company website (Domain Enrichment) — synchronous,
// no document is created until the user clicks Create.
async function enrichFromWebsite() {
  const website = (deal.doc.website || '').trim()
  if (!website) {
    toast.warning(__('Enter a Website first.'))
    return
  }
  capture('enrichment_quick_triggered', {
    doctype: 'CRM Deal',
    source: 'create_modal',
  })
  isEnriching.value = true
  try {
    const { fields, notes } = await call(
      'crm.domain_enrichment.api.enrich_preview',
      { website, doctype: 'CRM Deal' },
    )
    // Fill-empty semantics: never clobber values the user already typed in the
    // modal — only set fields that are currently empty on deal.doc.
    const filled = Object.keys(fields || {}).filter((key) => {
      const current = deal.doc[key]
      if (current === undefined || current === null || current === '') {
        deal.doc[key] = fields[key]
        return true
      }
      return false
    })
    if (filled.length) {
      toast.success(
        __('Filled {0} field(s) from the website.', [filled.length]),
      )
    } else {
      toast.info(
        notes?.[0] || __('Nothing could be extracted from this website.'),
      )
    }
  } catch (e) {
    toast.error(e.messages?.[0] || __('Could not enrich from the website.'))
  } finally {
    isEnriching.value = false
  }
}

watch(
  [chooseExistingOrganization, chooseExistingContact],
  ([organization, contact]) => {
    tabs.data.forEach((tab) => {
      tab.sections.forEach((section) => {
        if (section.name === 'organization_section') {
          section.hidden = !organization
        } else if (section.name === 'organization_details_section') {
          section.hidden = organization
        } else if (section.name === 'contact_section') {
          section.hidden = !contact
        } else if (section.name === 'contact_details_section') {
          section.hidden = contact
        }
      })
    })
  },
)

// Doco customization: org-less workflow. Hide every organization-related
// field + section so the Deal quick view stays focused on contact +
// repair-order capture.
const HIDDEN_DEAL_FIELDS = [
  'website',
  'annual_revenue',
  'organization',
  'organization_name',
  'no_of_employees',
  'industry',
]
const HIDDEN_DEAL_SECTIONS = ['organization_section', 'organization_details_section']

const tabs = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['QuickEntry', 'CRM Deal'],
  params: { doctype: 'CRM Deal', type: 'Quick Entry' },
  auto: true,
  transform: (_tabs) => {
    hasOrganizationSections.value = false
    _tabs.forEach((tab) => {
      tab.sections = tab.sections.filter(
        (section) => !HIDDEN_DEAL_SECTIONS.includes(section.name),
      )
      tab.sections.forEach((section) => {
        section.columns.forEach((column) => {
          if (
            ['contact_section', 'contact_details_section'].includes(section.name)
          ) {
            hasContactSections.value = true
          }
          column.fields = column.fields.filter(
            (field) => !HIDDEN_DEAL_FIELDS.includes(field.fieldname),
          )
          column.fields.forEach((field) => {
            if (field.fieldname == 'status') {
              field.fieldtype = 'Select'
              field.options = dealStatuses.value
              field.prefix = getDealStatus(deal.doc.status).color
            }

            if (field.fieldtype === 'Table') {
              deal.doc[field.fieldname] = []
            }
          })
        })
      })
    })
    return _tabs
  },
})

const dealStatuses = computed(() => statusOptions('deal'))

async function createDeal() {
  if (deal.doc.website && !deal.doc.website.startsWith('http')) {
    deal.doc.website = 'https://' + deal.doc.website
  }
  if (chooseExistingContact.value) {
    deal.doc['first_name'] = null
    deal.doc['last_name'] = null
    deal.doc['email'] = null
    deal.doc['mobile_no'] = null
  } else deal.doc['contact'] = null

  // Doco: Falla reportada required only when the inline RO is being created
  // (device_model set). Block here so the Deal isn't created with a dangling
  // half-filled RO intent.
  if (newRepairOrder.value.device_model
      && !(newRepairOrder.value.falla_reportada || '').trim()) {
    error.value = __('Falla reportada is required when creating a Repair Order.')
    return
  }

  await triggerOnBeforeCreate?.()

  createResource({
    url: 'crm.fcrm.doctype.crm_deal.crm_deal.create_deal',
    params: { doc: deal.doc },
    auto: true,
    validate() {
      error.value = null
      if (deal.doc.annual_revenue) {
        if (typeof deal.doc.annual_revenue === 'string') {
          deal.doc.annual_revenue = deal.doc.annual_revenue.replace(/,/g, '')
        } else if (isNaN(deal.doc.annual_revenue)) {
          error.value = __('Annual Revenue should be a number')
          return error.value
        }
      }
      if (
        deal.doc.mobile_no &&
        isNaN(deal.doc.mobile_no.replace(/[-+() ]/g, ''))
      ) {
        error.value = __('Mobile number should be a number')
        return error.value
      }
      if (deal.doc.email && !deal.doc.email.includes('@')) {
        error.value = __('Invalid email address')
        return error.value
      }
      if (!deal.doc.status) {
        error.value = __('Status is required')
        return error.value
      }
      isDealCreating.value = true
    },
    onSuccess(name) {
      capture('deal_created')
      isDealCreating.value = false

      // Navigate immediately — background work continues after.
      show.value = false
      router.push({ ...props.redirect, params: { dealId: name } })

      // Doco customization: sync contacts first so the Contact → Customer link
      // exists before the Repair Order is created (client field links to Contact).
      const getVal = (v) => (v && typeof v === 'object' ? v.value : v)
      createResource({
        url: 'doco.docoutils.customers.sync_deal_contacts_to_erpnext',
        params: {
          deal_name: name,
          address_line1: customerDetails.value.address_line1 || null,
          city: customerDetails.value.city || null,
          territory: getVal(customerDetails.value.territory) || null,
          customer_group: getVal(customerDetails.value.customer_group) || null,
          tax_id: customerDetails.value.tax_id || null,
          birthday: customerDetails.value.birthday || null,
        },
        auto: true,
        onSuccess(syncResults) {
          const pm = newRepairOrder.value.device_model
          if (!pm) return

          // Use the explicitly selected client, or fall back to the primary
          // contact that was just synced to ERPNext as a Customer.
          const primaryContact =
            getVal(newRepairOrder.value.client) ||
            syncResults?.find((r) => r.is_primary)?.contact ||
            syncResults?.[0]?.contact ||
            null

          const deviceModelVal = getVal(pm)
          const repairTypeVal = getVal(newRepairOrder.value.repair_to_be_done)
          const unlock = newRepairOrder.value.unlock_method
          createResource({
            url: 'taller.repair.repair_orders.create_and_link_repair_order',
            params: {
              deal_name: name,
              device_model: deviceModelVal,
              repair_to_be_done: repairTypeVal || null,
              falla_reportada: (newRepairOrder.value.falla_reportada || '').trim(),
              general_status: newRepairOrder.value.general_status || null,
              client: primaryContact,
              technician: getVal(newRepairOrder.value.technician) || null,
              imei: getVal(newRepairOrder.value.imei) || null,
              has_sim_tray: newRepairOrder.value.has_sim_tray ? 1 : 0,
              is_wet: newRepairOrder.value.is_wet ? 1 : 0,
              turns_on: newRepairOrder.value.turns_on ? 1 : 0,
              broken_screen: newRepairOrder.value.broken_screen ? 1 : 0,
              has_phone_case: newRepairOrder.value.has_phone_case ? 1 : 0,
              phone_pin: unlock === 'pin' ? (newRepairOrder.value.phone_pin || '') : '',
              phone_pattern: unlock === 'pattern' ? (newRepairOrder.value.phone_pattern || '') : '',
              quote_amount: Number(newRepairOrder.value.quote_amount) || 0,
              advance_amount: Number(newRepairOrder.value.advance_amount) || 0,
            },
            auto: true,
            // The deal modal has already closed by the time this resolves —
            // without these callbacks a rejected RO create vanished silently
            // (deal created, no RO, no hint why).
            onSuccess(roName) {
              toast.success(__('Repair Order {0} created', [roName]))
            },
            onError(err) {
              toast.error(
                __('Deal created but the Repair Order failed: {0}', [
                  err.messages?.join('\n') || err.message,
                ]),
              )
            },
          })
        },
      })
    },
    onError(err) {
      isDealCreating.value = false
      if (!err.messages) {
        error.value = err.message
        return
      }
      error.value = err.messages.join('\n')
    },
  })
}

function openQuickEntryModal() {
  showQuickEntryModal.value = true
  quickEntryProps.value = { doctype: 'CRM Deal' }
  nextTick(() => (show.value = false))
}

onMounted(() => {
  deal.doc.no_of_employees = '1-10'
  if (deal.doc.mobile_is_whatsapp == null) deal.doc.mobile_is_whatsapp = 1
  Object.assign(deal.doc, props.defaults)

  if (!deal.doc.deal_owner) {
    deal.doc.deal_owner = getUser().name
  }
  if (!deal.doc.status && dealStatuses.value[0].value) {
    deal.doc.status = dealStatuses.value[0].value
  }
})
</script>
