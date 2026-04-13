<template>
  <Dialog v-model="show" :options="{ size: '3xl' }">
    <template #body>
      <div class="bg-surface-modal px-4 pb-6 pt-5 sm:px-6">
        <div class="mb-5 flex items-center justify-between">
          <div>
            <h3 class="text-2xl font-semibold leading-6 text-ink-gray-9">
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
              icon="x"
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
import { Switch, FormControl, createResource } from 'frappe-ui'
import { computed, ref, onMounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  defaults: { type: Object, default: () => ({}) },
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
const chooseExistingContact = ref(false)
const chooseExistingOrganization = ref(false)

// Doco customization: form state for the optional inline Repair Order.
// RepairOrderInlineForm binds to this via v-model; createDeal() reads it
// after the deal is saved to optionally call create_and_link_repair_order.
const newRepairOrder = ref({
  phone_model: null,
  repair_to_be_done: null,
  general_status: '',
  client: null,
  technician: null,
  imei: null,
  has_sim_tray: false,
  is_wet: false,
  turns_on: false,
  broken_screen: false,
})

// Doco customization: customer details for ERPNext sync.
// Pre-filled from company defaults; passed to sync_deal_contacts_to_erpnext
// after deal creation so every contact gets an Individual Customer + address.
const customerDetails = ref({
  address_line1: '',
  city: '',
  territory: '',
  customer_group: '',
})

createResource({
  url: 'doco.doco.customers.get_company_address_defaults',
  auto: true,
  onSuccess(defaults) {
    customerDetails.value.address_line1 = defaults.address_line1 || ''
    customerDetails.value.city = defaults.city || ''
    customerDetails.value.territory = defaults.territory || ''
    customerDetails.value.customer_group = defaults.customer_group || ''
  },
})

const { capture } = useTelemetry()

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

const tabs = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['QuickEntry', 'CRM Deal'],
  params: { doctype: 'CRM Deal', type: 'Quick Entry' },
  auto: true,
  transform: (_tabs) => {
    hasOrganizationSections.value = false
    return _tabs.forEach((tab) => {
      tab.sections.forEach((section) => {
        section.columns.forEach((column) => {
          if (
            ['organization_section', 'organization_details_section'].includes(
              section.name,
            )
          ) {
            hasOrganizationSections.value = true
          } else if (
            ['contact_section', 'contact_details_section'].includes(
              section.name,
            )
          ) {
            hasContactSections.value = true
          }
          column.fields = column.fields.filter(
            (field) => !['website', 'annual_revenue'].includes(field.fieldname)
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
        error.value = __('Mobile No. should be a number')
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
      router.push({ name: 'Deal', params: { dealId: name } })

      // Doco customization: sync contacts first so the Contact → Customer link
      // exists before the Repair Order is created (client field links to Contact).
      const getVal = (v) => (v && typeof v === 'object' ? v.value : v)
      createResource({
        url: 'doco.doco.customers.sync_deal_contacts_to_erpnext',
        params: {
          deal_name: name,
          address_line1: customerDetails.value.address_line1 || null,
          city: customerDetails.value.city || null,
          territory: getVal(customerDetails.value.territory) || null,
          customer_group: getVal(customerDetails.value.customer_group) || null,
        },
        auto: true,
        onSuccess(syncResults) {
          const pm = newRepairOrder.value.phone_model
          if (!pm) return

          // Use the explicitly selected client, or fall back to the primary
          // contact that was just synced to ERPNext as a Customer.
          const primaryContact =
            getVal(newRepairOrder.value.client) ||
            syncResults?.find((r) => r.is_primary)?.contact ||
            syncResults?.[0]?.contact ||
            null

          const phoneModelVal = getVal(pm)
          const repairTypeVal = getVal(newRepairOrder.value.repair_to_be_done)
          createResource({
            url: 'doco.doco.repair_orders.create_and_link_repair_order',
            params: {
              deal_name: name,
              phone_model: phoneModelVal,
              repair_to_be_done: repairTypeVal || null,
              general_status: newRepairOrder.value.general_status || null,
              client: primaryContact,
              technician: getVal(newRepairOrder.value.technician) || null,
              imei: getVal(newRepairOrder.value.imei) || null,
              has_sim_tray: newRepairOrder.value.has_sim_tray ? 1 : 0,
              is_wet: newRepairOrder.value.is_wet ? 1 : 0,
              turns_on: newRepairOrder.value.turns_on ? 1 : 0,
              broken_screen: newRepairOrder.value.broken_screen ? 1 : 0,
            },
            auto: true,
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
  Object.assign(deal.doc, props.defaults)

  if (!deal.doc.deal_owner) {
    deal.doc.deal_owner = getUser().name
  }
  if (!deal.doc.status && dealStatuses.value[0].value) {
    deal.doc.status = dealStatuses.value[0].value
  }
})
</script>
