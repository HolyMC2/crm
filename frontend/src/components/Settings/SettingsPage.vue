<template>
  <div class="flex h-full flex-col gap-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 flex-1 flex flex-col gap-1">
        <div class="flex gap-1 items-center">
          <Button
            v-if="back"
            variant="ghost"
            icon-left="lucide-chevron-left"
            :label="title || __(doctype)"
            size="md"
            class="cursor-pointer -ml-4 hover:bg-transparent focus:bg-transparent focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:none active:bg-transparent active:outline-none active:ring-0 active:ring-offset-0 active:text-ink-gray-5 text-2xl-semibold hover:opacity-70 !pr-0 !max-w-96 !justify-start"
            @click="back"
          />
          <h2
            v-else
            class="flex gap-2 text-2xl-semibold leading-none h-5 text-ink-gray-8"
          >
            {{ title || __(doctype) }}
          </h2>
          <Badge
            v-if="data.isDirty"
            :label="__('Not Saved')"
            variant="subtle"
            theme="orange"
          />
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button
          :loading="data.save.loading"
          :disabled="!canWrite || !!loadError || loading"
          class="min-h-11"
          :label="__('Update')"
          variant="solid"
          @click="data.save.submit()"
        />
      </div>
    </div>
    <div
      v-if="loadError"
      role="alert"
      class="rounded border border-outline-gray-2 p-4"
    >
      <p>{{ settingsErrorMessage(loadError) }}</p>
      <Button
        :label="__('Retry')"
        class="mt-3 min-h-11"
        :loading="loading"
        @click="load"
      />
    </div>
    <div
      v-else-if="loading"
      class="flex flex-1 items-center justify-center"
      role="status"
    >
      <LoadingIndicator class="size-8" />
      <span class="sr-only">{{ __('Loading settings') }}</span>
    </div>
    <div v-else class="min-w-0 flex-1 overflow-y-auto">
      <p v-if="!canWrite" class="mb-4 text-sm">
        {{
          __(
            'You can view these settings. Saving requires additional permission.',
          )
        }}
      </p>
      <fieldset :disabled="!canWrite || data.save.loading">
        <FieldLayout
          v-if="data?.doc && tabs"
          :tabs="tabs"
          :data="data.doc"
          :doctype="doctype"
        />
      </fieldset>
    </div>
    <ErrorMessage :message="data.save.error" />
  </div>
</template>
<script setup>
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import {
  call,
  Button,
  createResource,
  LoadingIndicator,
  Badge,
  toast,
  ErrorMessage,
} from 'frappe-ui'
import { getRandom } from '@/utils'
import { computed, ref } from 'vue'
import {
  settingsDocumentResource,
  discardSettingsDocument,
  useSettingsDraft,
  settingsErrorMessage,
} from '@/composables/settingsSession'

const props = defineProps({
  doctype: { type: String, required: true },
  title: { type: String, default: '' },
  successMessage: { type: String, default: 'Updated successfully' },
  back: { type: Function, default: null },
})

const fields = createResource({
  url: 'crm.api.doc.get_fields',
  cache: ['fields', props.doctype],
  params: {
    doctype: props.doctype,
    allow_all_fieldtypes: true,
  },
  auto: false,
})

const data = settingsDocumentResource({
  doctype: props.doctype,
  name: props.doctype,
  fields: ['*'],
  auto: false,
  setValue: {
    onSuccess: () => {
      toast.success(__(props.successMessage))
    },
    onError: (err) => {
      toast.error(
        err.messages?.[0] || err.message || __('Settings could not be saved.'),
      )
    },
  },
})

const loading = ref(false)
const loadError = ref(null)
const canWrite = ref(false)
async function load() {
  if (loading.value) return
  loading.value = true
  loadError.value = null
  try {
    const read = await call('frappe.client.has_permission', {
      doctype: props.doctype,
      perm_type: 'read',
    })
    if (!read?.has_permission) throw { exc_type: 'PermissionError' }
    const write = await call('frappe.client.has_permission', {
      doctype: props.doctype,
      perm_type: 'write',
    })
    canWrite.value = !!write?.has_permission
    await fields.fetch()
    // A failed metadata retry must not replace an already loaded local draft.
    if (!data.doc) await data.get.fetch()
  } catch (error) {
    loadError.value = error
  } finally {
    loading.value = false
  }
}
useSettingsDraft({
  dirty: () => data.isDirty,
  pending: () => data.save.loading,
  discard: () => discardSettingsDocument(data),
})
load()

const tabs = computed(() => {
  if (!fields.data?.length) return []
  let _tabs = []
  let fieldsData = fields.data

  if (fieldsData[0].type != 'Tab Break') {
    let _sections = []
    if (fieldsData[0].type != 'Section Break') {
      _sections.push({
        name: 'first_section',
        columns: [{ name: 'first_column', fields: [] }],
      })
    }
    _tabs.push({ name: 'first_tab', sections: _sections })
  }

  fieldsData.forEach((field) => {
    let last_tab = _tabs[_tabs.length - 1]
    let _sections = _tabs.length ? last_tab.sections : []
    if (field.fieldtype === 'Tab Break') {
      _tabs.push({
        label: field.label,
        name: field.fieldname,
        sections: [
          {
            name: 'section_' + getRandom(),
            columns: [{ name: 'column_' + getRandom(), fields: [] }],
          },
        ],
      })
    } else if (field.fieldtype === 'Section Break') {
      _sections.push({
        label: field.label,
        name: field.fieldname,
        hideBorder: field.hide_border,
        columns: [{ name: 'column_' + getRandom(), fields: [] }],
      })
    } else if (field.fieldtype === 'Column Break') {
      _sections[_sections.length - 1].columns.push({
        name: field.fieldname,
        fields: [],
      })
    } else {
      let last_section = _sections[_sections.length - 1]
      let last_column = last_section.columns[last_section.columns.length - 1]
      last_column.fields.push(field)
    }
  })

  return _tabs
})
</script>
