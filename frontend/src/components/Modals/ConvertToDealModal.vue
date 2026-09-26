<template>
  <Dialog v-model:open="dialogOpen" :size="'xl'">
    <template #body-header>
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h3 class="text-3xl-semibold leading-6 text-ink-gray-9">
            {{ __('Convert to Deal') }}
          </h3>
        </div>
        <div class="flex items-center gap-1">
          <Button
            v-if="isManager() && !isMobileView"
            variant="ghost"
            :tooltip="__('Edit deal\'s mandatory fields layout')"
            :icon="EditIcon"
            @click="openQuickEntryModal"
          />
          <Button
            icon="lucide-x"
            variant="ghost"
            :disabled="busy || !!pending"
            @click="show = false"
          />
        </div>
      </div>
    </template>
    <template #default>
      <p v-if="loading" role="status">{{ __('Loading conversion review…') }}</p>
      <p v-if="reviewError" role="alert">{{ reviewError }}</p>
      <Button
        v-if="reviewError"
        :label="__('Retry review')"
        @click="loadReview"
      />
      <div v-if="convertedDeal" class="space-y-3" role="status">
        <p>
          {{
            __(
              'Lead converted to {0}. Existing history and open tasks remain linked.',
              [convertedDeal],
            )
          }}
        </p>
        <Button :label="__('Open deal')" @click="openDeal" />
        <Button :label="__('Schedule next step')" @click="scheduleNextStep" />
        <Button :label="__('Return to queue')" @click="returnToQueue" />
      </div>
      <fieldset
        v-else
        :disabled="busy || !!pending || loading || !!reviewError"
        class="min-w-0"
      >
        <p v-if="review" class="mb-4 text-sm text-ink-gray-6">
          {{
            __(
              'Review the person and organization before converting. A shared email or phone does not prove identity.',
            )
          }}
        </p>
        <div v-if="review?.contacts?.length" class="mb-4 space-y-2">
          <p>{{ __('Possible contacts') }}</p>
          <button
            v-for="contact in review.contacts"
            :key="contact.name"
            type="button"
            class="block min-h-11 rounded border border-outline-gray-2 px-3"
            @click="
              existingContactChecked = true
              existingContact = contact.name
            "
          >
            {{ contact.full_name || contact.name }}
          </button>
        </div>
        <div v-if="review?.organizations?.length" class="mb-4 space-y-2">
          <p>{{ __('Possible organizations') }}</p>
          <button
            v-for="organization in review.organizations"
            :key="organization.name"
            type="button"
            class="block min-h-11 rounded border border-outline-gray-2 px-3"
            @click="
              existingOrganizationChecked = true
              existingOrganization = organization.name
            "
          >
            {{ organization.organization_name || organization.name }}
          </button>
        </div>
        <div class="mb-4 flex items-center gap-2 text-ink-gray-5">
          <OrganizationsIcon class="h-4 w-4" />
          <label class="block text-base">{{ __('Organization') }}</label>
        </div>
        <div class="ml-6 text-ink-gray-9">
          <div class="flex items-center justify-between text-base">
            <div>{{ __('Choose Existing') }}</div>
            <Switch v-model="existingOrganizationChecked" />
          </div>
          <Link
            v-if="existingOrganizationChecked"
            class="form-control mt-2.5"
            size="md"
            :value="existingOrganization"
            doctype="CRM Organization"
            @change="(data) => (existingOrganization = data)"
          />
          <div v-else class="mt-2.5 text-base">
            {{
              __(
                'An organization is created only when the lead has organization details.',
              )
            }}
          </div>
        </div>

        <div class="mb-4 mt-6 flex items-center gap-2 text-ink-gray-5">
          <ContactsIcon class="h-4 w-4" />
          <label class="block text-base">{{ __('Contact') }}</label>
        </div>
        <div class="ml-6 text-ink-gray-9">
          <div class="flex items-center justify-between text-base">
            <div>{{ __('Choose Existing') }}</div>
            <Switch v-model="existingContactChecked" />
          </div>
          <Link
            v-if="existingContactChecked"
            class="form-control mt-2.5"
            size="md"
            :value="existingContact"
            doctype="Contact"
            @change="(data) => (existingContact = data)"
          />
          <div v-else class="mt-2.5 text-base">
            {{
              __(
                'A new person will be created; existing contacts will not be merged',
              )
            }}
          </div>
        </div>

        <div v-if="dealTabs.data?.length" class="h-px w-full border-t my-6" />

        <PipelineSelector
          v-if="review"
          :doc="deal.doc"
          :select-default="true"
          :disabled="busy || !!pending"
          @change="(values) => Object.assign(deal.doc, values)"
          @stages="pipelineStages = $event"
        />
        <FieldLayout
          v-if="dealTabs.data?.length"
          :tabs="dealTabs.data"
          :data="deal.doc"
          doctype="CRM Deal"
        />
      </fieldset>
      <p v-if="pending" role="status" class="mt-3 text-sm">
        {{
          __(
            'The result is not confirmed. Check the same conversion before leaving; your choices are preserved.',
          )
        }}
      </p>
      <ErrorMessage class="mt-4" :message="error" />
    </template>
    <template #actions>
      <div v-if="!convertedDeal" class="flex justify-end">
        <Button
          :label="pending ? __('Check conversion') : __('Convert')"
          :loading="busy"
          :disabled="busy || loading || !review || !!reviewError"
          variant="solid"
          class="min-h-11"
          @click="convertToDeal"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import OrganizationsIcon from '@/components/Icons/OrganizationsIcon.vue'
import ContactsIcon from '@/components/Icons/ContactsIcon.vue'
import EditIcon from '@/components/Icons/EditIcon.vue'
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import PipelineSelector from '@/components/Pipeline/PipelineSelector.vue'
import { conversionQueueReturn } from '@/utils/salesQueueContext'
import { useDoctypeModal } from '@/composables/doctypeModal'
import Link from '@/components/Controls/Link.vue'
import { useDocument } from '@/data/document'
import { usersStore } from '@/stores/users'
import { sessionStore } from '@/stores/session'
import { statusesStore } from '@/stores/statuses'
import { getMeta } from '@/stores/meta'
import { showQuickEntryModal, quickEntryProps } from '@/composables/modals'
import { isMobileView } from '@/composables/settings'
import { useOnboarding, useTelemetry } from 'frappe-ui/frappe'
import { Switch, Dialog, createResource, call } from 'frappe-ui'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'

const props = defineProps({
  lead: { type: Object, required: true },
})

const show = defineModel({ type: Boolean })

const router = useRouter(),
  route = useRoute()
const emit = defineEmits(['converted', 'failed', 'pending'])
const { showModal } = useDoctypeModal()
const review = ref(null),
  loading = ref(false),
  reviewError = ref('')
const busy = ref(false),
  pending = ref(null),
  convertedDeal = ref('')
const pipelineStages = ref([])
const dialogOpen = computed({
  get: () => show.value,
  set: (value) => {
    if (!busy.value && !pending.value) show.value = value
  },
})
let epoch = 0
async function loadReview() {
  if (busy.value || pending.value) return
  const stamp = ++epoch
  loading.value = true
  reviewError.value = ''
  try {
    const result = await call('crm.lead.conversion.get_conversion_context', {
      lead: props.lead.name,
    })
    if (stamp !== epoch) return
    if (!result?.lead?.name || !result.modified)
      throw new Error('Unconfirmed review')
    const firstReview = !review.value
    review.value = result
    if (firstReview) resetDealDoc(dealTabs.data)
    convertedDeal.value = result.existing_deal || ''
    if (convertedDeal.value) emit('converted', convertedDeal.value)
    if (!deal.doc.pipeline) deal.doc.pipeline = result.lead.pipeline
    if (!deal.doc.sales_company)
      deal.doc.sales_company = result.lead.sales_company
  } catch (e) {
    if (stamp === epoch)
      reviewError.value =
        e?.messages?.[0] ||
        __('Could not load conversion review. Retry before converting.')
  } finally {
    if (stamp === epoch) loading.value = false
  }
}
function openDeal() {
  show.value = false
  router.push({
    name: 'Deal',
    params: { dealId: convertedDeal.value },
    query: { returnTo: conversionQueueReturn(route) },
  })
}
function returnToQueue() {
  show.value = false
  const target = conversionQueueReturn(route)
  if (target !== route.fullPath) router.push(target)
}
function scheduleNextStep() {
  showModal({
    doctype: 'CRM Task',
    title: __('Next step'),
    defaults: {
      reference_doctype: 'CRM Deal',
      reference_docname: convertedDeal.value,
      assigned_to: deal.doc.deal_owner || review.value?.lead?.lead_owner,
      status: 'Todo',
      activity_type: 'Task',
    },
  })
}
function beforeUnload(event) {
  if (pending.value || busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => {
  loadReview()
  window.addEventListener('beforeunload', beforeUnload)
})
onUnmounted(() => {
  epoch++
  window.removeEventListener('beforeunload', beforeUnload)
  emit('pending', false)
})
onBeforeRouteLeave(() => !busy.value && !pending.value)
watch(
  () => !!pending.value || busy.value,
  (value) => emit('pending', value),
  { flush: 'sync' },
)

const { statusOptions, getDealStatus } = statusesStore()
const { isManager } = usersStore()
const { user } = sessionStore()
const { updateOnboardingStep } = useOnboarding('frappecrm')
const { doctypeMeta: leadMeta } = getMeta('CRM Lead')

const existingContactChecked = ref(false)
const existingOrganizationChecked = ref(false)

const existingContact = ref('')
const existingOrganization = ref('')
const error = ref('')
const { capture } = useTelemetry()

const { triggerConvertToDeal } = useDocument('CRM Lead', props.lead.name)
const { document: deal } = useDocument('CRM Deal')

async function convertToDeal() {
  if (
    busy.value ||
    loading.value ||
    !review.value ||
    reviewError.value ||
    convertedDeal.value
  )
    return
  error.value = ''
  if (!pending.value) {
    if (existingContactChecked.value && !existingContact.value) {
      error.value = __('Please select an existing contact')
      return
    }
    if (existingOrganizationChecked.value && !existingOrganization.value) {
      error.value = __('Please select an existing organization')
      return
    }
    busy.value = true
    try {
      await triggerConvertToDeal?.(review.value.lead, deal.doc, () => {})
      pending.value = Object.freeze({
        lead: props.lead.name,
        deal: JSON.parse(JSON.stringify(deal.doc)),
        existing_contact: existingContactChecked.value
          ? existingContact.value
          : '',
        existing_organization: existingOrganizationChecked.value
          ? existingOrganization.value
          : '',
        create_new_contact: !existingContactChecked.value,
        expected_modified: review.value.modified,
        request_id: crypto.randomUUID(),
      })
    } catch (err) {
      error.value =
        err?.messages?.[0] ||
        err?.message ||
        __('Review the required deal fields.')
      busy.value = false
      emit('failed', error.value)
      return
    }
  }
  busy.value = true
  const stamp = epoch
  try {
    const result = await call(
      'crm.fcrm.doctype.crm_lead.crm_lead.convert_to_deal',
      pending.value,
    )
    if (stamp !== epoch) return
    if (typeof result !== 'string' || !result)
      throw new Error('Unconfirmed conversion')
    convertedDeal.value = result
    pending.value = null
    emit('converted', result)
    updateOnboardingStep('convert_lead_to_deal', true, false, () =>
      localStorage.setItem('firstDeal' + user, result),
    )
    capture('convert_lead_to_deal')
  } catch (err) {
    if (stamp !== epoch) return
    const type = err?.exc_type || err?.responseJSON?.exc_type
    if (
      [
        'ValidationError',
        'MandatoryError',
        'PermissionError',
        'AuthenticationError',
        'TimestampMismatchError',
        'LinkValidationError',
      ].includes(type)
    ) {
      pending.value = null
      error.value =
        err?.messages?.[0] ||
        __(
          'Conversion was refused. Review the lead, identities and permissions.',
        )
      emit('failed', error.value)
      if (type === 'TimestampMismatchError')
        reviewError.value = __(
          'The lead changed. Retry the review; your draft is preserved.',
        )
    } else
      error.value = __(
        'The conversion response did not arrive. Check the same request before continuing.',
      )
  } finally {
    if (stamp === epoch) busy.value = false
  }
}

const dealStatuses = computed(() =>
  pipelineStages.value.length
    ? pipelineStages.value
        .filter((stage) => !stage.archived)
        .map((stage) => ({ label: stage.name, value: stage.name }))
    : statusOptions('deal'),
)

const dealTabs = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['RequiredFields', 'CRM Deal'],
  params: { doctype: 'CRM Deal', type: 'Required Fields' },
  auto: true,
  transform: (_tabs) => {
    let hasFields = false
    _tabs?.forEach((tab) => {
      tab.sections?.forEach((section) => {
        section.columns?.forEach((column) => {
          column.fields?.forEach((field) => {
            hasFields = true
            if (field.fieldname == 'status') {
              field.fieldtype = 'Select'
              field.options = dealStatuses.value
              field.prefix = getDealStatus(deal.doc.status).color
            }
          })
        })
      })
    })
    return hasFields ? _tabs : []
  },
})

watch(dealStatuses, (options) => {
  for (const tab of dealTabs.data || [])
    for (const section of tab.sections || [])
      for (const column of section.columns || [])
        for (const field of column.fields || [])
          if (field.fieldname === 'status') field.options = options
})

const leadDealFieldMap = { deal_owner: 'lead_owner' }
const skipPrefillFields = ['organization', 'status']
const leadFields = computed(() => leadMeta.value?.fields || [])

watch(
  () => dealTabs.data,
  (tabs) => resetDealDoc(tabs),
  { immediate: true },
)

watch([leadFields, review], () => prefillFields(dealTabs.data))

function resetDealDoc(tabs) {
  const source = review.value?.lead || props.lead
  deal.doc = {
    __newDocument: true,
    doctype: 'CRM Deal',
    pipeline: source.pipeline,
    sales_company: source.sales_company,
    deal_owner: source.lead_owner,
  }
  prefillFields(tabs)
}

function prefillFields(tabs) {
  tabs?.forEach((tab) =>
    tab.sections?.forEach((section) =>
      section.columns?.forEach((column) =>
        column.fields?.forEach((field) => prefillField(field)),
      ),
    ),
  )
}

function prefillField(field) {
  if (field.fieldtype === 'Table') {
    deal.doc[field.fieldname] = []
    return
  }
  prefillFromLead(field)
}

function prefillFromLead(field) {
  if (skipPrefillFields.includes(field.fieldname)) return
  if (hasValue(deal.doc[field.fieldname])) return

  const leadFieldname = getLeadFieldname(field)
  if (!leadFieldname) return

  const value = (review.value?.lead || props.lead)[leadFieldname]
  if (value != null && value !== '') {
    deal.doc[field.fieldname] = value
  }
}

function getLeadFieldname(field) {
  const mappedFieldname = leadDealFieldMap[field.fieldname]
  if (mappedFieldname) return mappedFieldname
  if (Object.hasOwn(props.lead, field.fieldname)) return field.fieldname

  return getMatchingCustomLeadField(field)?.fieldname
}

function getMatchingCustomLeadField(field) {
  if (!isCustomField(field)) return

  const matches = leadFields.value.filter((leadField) =>
    isMatchingCustomField(leadField, field),
  )
  return matches.length === 1 ? matches[0] : null
}

function isMatchingCustomField(leadField, dealField) {
  return (
    isCustomField(leadField) &&
    leadField.label === dealField.label &&
    leadField.fieldtype === dealField.fieldtype
  )
}

function isCustomField(field) {
  return Boolean(
    field?.is_custom_field ||
    field?.custom ||
    field?.fieldname?.startsWith('custom_') ||
    field?.name === `${field?.parent}-${field?.fieldname}`,
  )
}

function hasValue(value) {
  return value != null && value !== ''
}

function openQuickEntryModal() {
  if (busy.value || pending.value) return
  showQuickEntryModal.value = true
  quickEntryProps.value = {
    doctype: 'CRM Deal',
    onlyRequired: true,
  }
  show.value = false
}
</script>
