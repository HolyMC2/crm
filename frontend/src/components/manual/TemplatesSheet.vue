<template>
  <ManualSheet :title="__('Start with templates')" @close="emit('close')">
    <p class="mb-3 text-sm text-ink-gray-7">
      {{
        __(
          'Each template becomes a draft only you and the managers see. Rewrite it in your words and publish it when it is ready.',
        )
      }}
    </p>
    <!-- Which company the drafts are for (review SCOPE-1). -->
    <FormControl
      v-if="field.options"
      v-model="company"
      type="select"
      class="mb-3"
      :label="__('Company', null, 'Manual')"
      :placeholder="__('Choose a company')"
      :options="field.options"
      data-testid="manual-templates-company"
    />
    <p
      v-else
      class="mb-3 text-sm text-ink-gray-7"
      data-testid="manual-templates-company"
    >
      {{ __('For: {0}', [field.label], 'Manual') }}
    </p>
    <ul class="space-y-2" data-testid="manual-templates-list">
      <li v-for="template in templates" :key="template.key">
        <label
          class="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-outline-gray-2 p-3"
        >
          <input
            v-model="chosen"
            type="checkbox"
            :value="template.key"
            class="mt-1 size-4"
            :data-template="template.key"
          />
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-ink-gray-9">{{
              template.title
            }}</span>
            <span class="block text-sm text-ink-gray-6">{{
              template.summary
            }}</span>
          </span>
        </label>
      </li>
    </ul>
    <p v-if="problem" role="alert" class="mt-3 text-sm text-ink-red-7">
      <strong>{{ problem.title }}.</strong> {{ problem.detail }}
    </p>
    <div class="mt-4 flex flex-wrap gap-2">
      <Button
        variant="solid"
        :label="__('Create {0} drafts', [chosen.length])"
        :disabled="!chosen.length"
        :loading="busy"
        class="min-h-11 sm:min-h-8"
        data-testid="manual-templates-create"
        @click="create"
      />
      <Button
        :label="__('Cancel', null, 'Manual')"
        class="min-h-11 sm:min-h-8"
        @click="emit('close')"
      />
    </div>
    <p v-if="!chosen.length" class="mt-2 text-xs text-ink-gray-6">
      {{ __('Choose at least one template.') }}
    </p>
  </ManualSheet>
</template>
<script setup>
import { computed, ref } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import ManualSheet from '@/components/manual/ManualSheet.vue'
import {
  companyField,
  manualApi,
  newArticleCompany,
  outcomeUnknown,
  problemOf,
  requestId,
} from '@/composables/useManual'

const props = defineProps({
  templates: { type: Array, default: () => [] },
  boot: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['close', 'done'])
const chosen = ref(props.templates.map((template) => template.key))
const company = ref(newArticleCompany(props.boot))
const field = computed(() => companyField(props.boot, company.value))
const busy = ref(false)
const problem = ref(null)
let pending = null

async function create() {
  busy.value = true
  problem.value = null
  // Same id on a retry after an unknown outcome: the drafts are made once.
  pending = pending || requestId()
  try {
    const result = await manualApi('use_templates', {
      request_id: pending,
      keys: chosen.value,
      company: company.value || null,
    })
    pending = null
    emit('done', result)
  } catch (error) {
    if (!outcomeUnknown(error)) pending = null
    problem.value = problemOf(error)
  } finally {
    busy.value = false
  }
}
</script>
