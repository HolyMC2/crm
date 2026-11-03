<template>
  <div
    class="flex h-full min-w-0 flex-col gap-4 px-3 py-6 text-ink-gray-8 sm:px-6 sm:py-8"
  >
    <header class="flex flex-wrap items-start justify-between gap-3 px-2">
      <div class="min-w-0 flex-1 basis-60">
        <h2 class="title-face text-2xl-semibold leading-tight">
          {{ __('Customer inbox') }}
        </h2>
        <p class="mt-1 text-p-base text-ink-gray-6">
          {{
            __(
              'How the team answers customers: office hours, who receives new conversations, reply goals, ratings, labels and macros.',
            )
          }}
        </p>
      </div>
      <div v-if="settings.isDirty" class="flex items-center gap-2">
        <span class="text-p-sm text-ink-gray-6">{{
          __('Unsaved changes')
        }}</span>
        <Button
          class="press"
          variant="solid"
          :label="__('Save')"
          :loading="settings.save.loading"
          @click="save"
        />
      </div>
    </header>
    <div class="px-2">
      <Segmented
        v-model="view"
        :options="views"
        fit="content"
        :label="__('Section')"
      />
    </div>
    <div v-if="loadError" role="alert" class="flex flex-col gap-2 px-2">
      <p class="text-p-sm">{{ loadError }}</p>
      <Button
        class="press self-start"
        variant="subtle"
        :label="__('Try again')"
        @click="settings.reload()"
      />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
      <p v-if="!settings.doc && !loadError" class="text-p-sm text-ink-gray-5">
        {{ __('Loading…') }}
      </p>
      <template v-else-if="settings.doc">
        <InboxService v-if="view === 'service'" v-model:doc="settings.doc" />
        <InboxPeople v-else-if="view === 'people'" v-model:doc="settings.doc" />
      </template>
      <div v-if="view === 'labels'" class="flex flex-col gap-6">
        <InboxLabels @changed="(list) => (labels = list)" />
        <InboxMacros :labels="labels" />
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { Button, toast } from 'frappe-ui'
import Segmented from '@/components/ui/Segmented.vue'
import {
  discardSettingsDocument,
  settingsDocumentResource,
  settingsErrorMessage,
  useSettingsDraft,
} from '@/composables/settingsSession'
import InboxService from './InboxService.vue'
import InboxPeople from './InboxPeople.vue'
import InboxLabels from './InboxLabels.vue'
import InboxMacros from './InboxMacros.vue'

const DOCTYPE = 'CRM Inbox Settings'
const views = [
  { value: 'service', label: __('Service') },
  { value: 'people', label: __('People') },
  { value: 'labels', label: __('Labels and macros') },
]
const view = ref('service')
const labels = ref([])
const failure = ref(null)
const settings = settingsDocumentResource({
  doctype: DOCTYPE,
  name: DOCTYPE,
  onError: (error) => (failure.value = error),
  onSuccess: () => (failure.value = null),
})
const loadError = computed(() =>
  failure.value && !settings.doc ? settingsErrorMessage(failure.value) : '',
)

function save() {
  settings.save.submit(null, {
    onSuccess: () => toast.success(__('Settings updated successfully')),
    onError: (error) =>
      toast.error(
        error?.messages?.[0]
          ? String(error.messages[0]).replace(/<[^>]+>/g, '')
          : __('Failed to save settings'),
      ),
  })
}

useSettingsDraft({
  dirty: () => settings.isDirty,
  pending: () => settings.save.loading,
  discard: () => discardSettingsDocument(settings),
})
</script>
