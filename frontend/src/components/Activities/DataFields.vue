<template>
  <div
    class="my-3 flex items-center justify-between text-lg-medium sm:mb-4 sm:mt-8"
  >
    <div class="flex h-8 items-center text-2xl-semibold text-ink-gray-8">
      {{ __('Data') }}
      <Badge
        v-if="document.isDirty"
        class="ml-3"
        :label="__('Not Saved')"
        theme="orange"
      />
    </div>
    <div class="flex gap-1">
      <Button
        v-if="isManager() && !isMobileView"
        :tooltip="__('Edit Fields Layout')"
        :icon="EditIcon"
        @click="showDataFieldsModal = true"
      />
      <Button
        label="Save"
        :disabled="!document.isDirty"
        variant="solid"
        :loading="document.save.loading"
        @click="saveChanges"
      />
    </div>
  </div>
  <div
    v-if="document.get.loading"
    class="flex flex-1 flex-col items-center justify-center gap-3 text-2xl-medium text-ink-gray-6"
  >
    <LoadingIndicator class="h-6 w-6" />
    <span>{{ __('Loading...') }}</span>
  </div>
  <div v-else class="pb-8">
    <VerticalSlot v-if="doctype === 'CRM Deal'" slot="data_tab" :docname="docname" />
    <FieldLayout
      v-if="tabs.data"
      :tabs="tabs.data"
      :data="document.doc"
      :doctype="doctype"
    />
  </div>
  <DataFieldsModal
    v-if="showDataFieldsModal"
    v-model="showDataFieldsModal"
    :doctype="doctype"
    @reload="
      () => {
        tabs.reload()
        document.reload()
      }
    "
  />
</template>

<script setup>
import EditIcon from '@/components/Icons/EditIcon.vue'
import DataFieldsModal from '@/components/Modals/DataFieldsModal.vue'
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import VerticalSlot from '@/components/doco/VerticalSlot.vue'
import { Badge, createResource } from 'frappe-ui'
import LoadingIndicator from '@/components/Icons/LoadingIndicator.vue'
import { usersStore } from '@/stores/users'
import { useDocument } from '@/data/document'
import { isMobileView } from '@/composables/settings'
import { ref, watch, getCurrentInstance } from 'vue'

const props = defineProps({
  doctype: { type: String, required: true },
  docname: { type: String, required: true },
})

const emit = defineEmits(['beforeSave', 'afterSave'])

const { isManager } = usersStore()

const instance = getCurrentInstance()
const attrs = instance?.vnode?.props ?? {}

const showDataFieldsModal = ref(false)

const { document } = useDocument(props.doctype, props.docname)

// Doco customization: org-less workflow. Repair-shop tenants don't model
// customers as organizations, so hide every B2B field from the Data tab.
// Sections that end up empty after the field strip are dropped too so the
// layout doesn't leave hollow headers behind.
const HIDDEN_DEAL_FIELDS = new Set([
  'organization',
  'organization_name',
  'no_of_employees',
  'industry',
  'website',
  'annual_revenue',
])

const tabs = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['DataFields', props.doctype],
  params: { doctype: props.doctype, type: 'Data Fields' },
  auto: true,
  transform: (_tabs) => {
    if (props.doctype !== 'CRM Deal') return _tabs
    _tabs.forEach((tab) => {
      tab.sections = (tab.sections || []).filter((section) => {
        section.columns = (section.columns || []).map((column) => ({
          ...column,
          fields: (column.fields || []).filter(
            (field) => !HIDDEN_DEAL_FIELDS.has(field.fieldname),
          ),
        }))
        return section.columns.some((c) => c.fields.length > 0)
      })
    })
    return _tabs
  },
})

function saveChanges() {
  if (!document.isDirty) return

  const updatedDoc = { ...document.doc }
  const oldDoc = { ...document.originalDoc }

  const changes = Object.keys(updatedDoc).reduce((acc, key) => {
    if (JSON.stringify(updatedDoc[key]) !== JSON.stringify(oldDoc[key])) {
      acc[key] = updatedDoc[key]
    }
    return acc
  }, {})

  const hasListener = attrs['onBeforeSave'] !== undefined

  if (hasListener) {
    emit('beforeSave', changes)
  } else {
    document.save.submit(null, {
      onSuccess: () => emit('afterSave', changes),
    })
  }
}

watch(
  () => document.doc,
  (newValue, oldValue) => {
    if (!oldValue) return
    if (newValue && oldValue) {
      const isDirty =
        JSON.stringify(newValue) !== JSON.stringify(document.originalDoc)
      document.isDirty = isDirty
      if (isDirty) {
        document.save.loading = false
      }
    }
  },
  { deep: true },
)
</script>
