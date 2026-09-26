<template>
  <Dialog :open="show" :size="'3xl'" @update:open="setShow">
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
              @click="setShow(false)"
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
          <PipelineSelector
            :doc="deal.doc"
            select-default
            class="mb-4"
            @change="Object.assign(deal.doc, $event)"
            @stages="pipelineStages = $event"
          />
          <FieldLayout
            v-if="tabs.data?.length"
            :tabs="tabs.data"
            :data="deal.doc"
            doctype="CRM Deal"
          />

          <!-- Doco: mark whether the customer's phone is on WhatsApp, so the inbox
               knows up front (drives the conversation banner). Defaults to on. -->
          <label
            v-if="hasWhatsAppField"
            class="mt-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-ink-gray-7"
          >
            <input
              v-model="deal.doc.mobile_is_whatsapp"
              type="checkbox"
              :true-value="1"
              :false-value="0"
              class="h-4 w-4 rounded border-outline-gray-3 text-green-600 focus:ring-0"
            />
            {{ __('El teléfono tiene WhatsApp') }}
          </label>

          <label
            v-if="repairAvailable"
            class="mt-5 flex items-start gap-2 border-t pt-5 text-sm text-ink-gray-7"
          >
            <input
              v-model="continueRepair"
              type="checkbox"
              :disabled="isDealCreating"
              class="mt-0.5 rounded"
            />
            <span
              >{{
                __('Continuar a la recepción de reparación después de guardar')
              }}<small class="mt-1 block text-ink-gray-5">{{
                __(
                  'Primero guardamos el trato y su contacto. Después revisas el laboratorio y los datos del equipo antes de crear la reparación.',
                )
              }}</small></span
            >
          </label>

          <!--
            Doco customization: customer details for ERPNext sync.
            Pre-filled from company defaults; submitted after deal creation
            to sync_deal_contacts_to_erpnext with user-provided address data.
          -->
          <div v-if="erpSyncAvailable" class="mt-5 border-t pt-5">
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
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import PipelineSelector from '@/components/Pipeline/PipelineSelector.vue'
import EditIcon from '@/components/Icons/EditIcon.vue'
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import { repairIntakeDestination } from '@/utils/repairOrders'
import Link from '@/components/Controls/Link.vue'
import { usersStore } from '@/stores/users'
import { getMeta } from '@/stores/meta'
import { hasApp } from '@/utils/crmCapabilities'
import { statusesStore } from '@/stores/statuses'
import { isMobileView } from '@/composables/settings'
import { showQuickEntryModal, quickEntryProps } from '@/composables/modals'
import { useDocument } from '@/data/document'
import { useTelemetry } from 'frappe-ui/frappe'
import { Switch, FormControl, createResource, toast } from 'frappe-ui'
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

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
Object.assign(deal.doc, props.defaults)
const { doctypeMeta } = getMeta('CRM Deal')
const erpSyncAvailable = computed(() => hasApp('doco') && hasApp('erpnext'))
const repairAvailable = computed(
  () => erpSyncAvailable.value && hasApp('taller'),
)
const hasWhatsAppField = computed(() =>
  doctypeMeta.value?.fields?.some(
    (field) => field.fieldname === 'mobile_is_whatsapp',
  ),
)

const hasOrganizationSections = ref(true)
const hasContactSections = ref(true)

const isDealCreating = ref(false)
const chooseExistingContact = ref(false)
const chooseExistingOrganization = ref(false)

const continueRepair = ref(false)
const intakeHandoffPending = ref(false)
function canLeaveIntakeHandoff() {
  if (!intakeHandoffPending.value) return true
  error.value = __(
    'El trato y su contacto siguen guardándose. Espera el resultado para continuar a la recepción.',
  )
  return false
}
function setShow(value) {
  if (!value && !canLeaveIntakeHandoff()) return
  show.value = value
}
function beforeUnload(event) {
  if (!intakeHandoffPending.value) return
  event.preventDefault()
  event.returnValue = ''
}
onBeforeRouteLeave(canLeaveIntakeHandoff)
onBeforeRouteUpdate(canLeaveIntakeHandoff)
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

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

const companyDefaults = createResource({
  url: 'doco.docoutils.customers.get_company_address_defaults',
  auto: false,
  onSuccess(defaults) {
    customerDetails.value.address_line1 = defaults.address_line1 || ''
    customerDetails.value.city = defaults.city || ''
    customerDetails.value.territory = defaults.territory || ''
    customerDetails.value.customer_group = defaults.customer_group || ''
  },
})
watch(erpSyncAvailable, (available) => available && companyDefaults.fetch(), {
  immediate: true,
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
const HIDDEN_DEAL_SECTIONS = [
  'organization_section',
  'organization_details_section',
]

const tabs = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['QuickEntry', 'CRM Deal'],
  params: { doctype: 'CRM Deal', type: 'Quick Entry' },
  auto: true,
  transform: (_tabs) => {
    hasOrganizationSections.value = false
    _tabs.forEach((tab) => {
      tab.sections = tab.sections.filter(
        (section) =>
          !repairAvailable.value ||
          !HIDDEN_DEAL_SECTIONS.includes(section.name),
      )
      tab.sections.forEach((section) => {
        if (
          ['organization_section', 'organization_details_section'].includes(
            section.name,
          )
        ) {
          hasOrganizationSections.value = true
        }
        section.columns.forEach((column) => {
          if (
            ['contact_section', 'contact_details_section'].includes(
              section.name,
            )
          ) {
            hasContactSections.value = true
          }
          column.fields = column.fields.filter(
            (field) =>
              !repairAvailable.value ||
              !HIDDEN_DEAL_FIELDS.includes(field.fieldname),
          )
          column.fields.forEach((field) => {
            if (field.fieldname == 'status') {
              field.fieldtype = 'Select'
              field.options = dealStatuses.value
              field.prefix = getDealStatus(deal.doc.status)?.color
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

const pipelineStages = ref([])
const dealStatuses = computed(() =>
  deal.doc.pipeline
    ? pipelineStages.value
        .filter((stage) => !stage.archived)
        .map((stage) => ({ label: stage.name, value: stage.name }))
    : statusOptions('deal'),
)
watch(dealStatuses, (options) => {
  for (const tab of tabs.data || [])
    for (const section of tab.sections)
      for (const column of section.columns)
        for (const field of column.fields) {
          if (field.fieldname === 'status') field.options = options
        }
})

async function createDeal() {
  if (isDealCreating.value) return
  if (deal.doc.website && !deal.doc.website.startsWith('http')) {
    deal.doc.website = 'https://' + deal.doc.website
  }
  if (chooseExistingContact.value) {
    deal.doc['first_name'] = null
    deal.doc['last_name'] = null
    deal.doc['email'] = null
    deal.doc['mobile_no'] = null
  } else deal.doc['contact'] = null

  const repairRequested = repairAvailable.value && continueRepair.value

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
      intakeHandoffPending.value = repairRequested
    },
    onSuccess(name) {
      capture('deal_created')
      const finish = () => {
        intakeHandoffPending.value = false
        isDealCreating.value = false
        show.value = false
        router.push(
          repairIntakeDestination(name, props.redirect, repairRequested),
        )
      }
      // Keep the existing immediate route when intake was not requested.
      if (!repairRequested) finish()
      if (!erpSyncAvailable.value) {
        if (repairRequested) finish()
        return
      }

      // The existing contact sync settles before opening explicit repair intake.
      // No Repair Order is created in this background callback.
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
        onSuccess() {
          if (repairRequested) finish()
        },
        onError(err) {
          toast.error(
            __('Deal created but customer sync failed: {0}', [
              err.messages?.join('\n') || err.message,
            ]),
          )
          if (repairRequested) finish()
        },
      })
    },
    onError(err) {
      intakeHandoffPending.value = false
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
  if (!canLeaveIntakeHandoff()) return
  showQuickEntryModal.value = true
  quickEntryProps.value = { doctype: 'CRM Deal' }
  nextTick(() => (show.value = false))
}

onMounted(() => {
  deal.doc.no_of_employees = '1-10'
  if (hasWhatsAppField.value && deal.doc.mobile_is_whatsapp == null)
    deal.doc.mobile_is_whatsapp = 1

  if (!deal.doc.deal_owner) {
    deal.doc.deal_owner = getUser().name
  }
  if (!deal.doc.status && dealStatuses.value[0]?.value) {
    deal.doc.status = dealStatuses.value[0]?.value
  }
})
</script>
