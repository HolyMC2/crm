<template>
  <ManualSheet :title="__('Start with templates')" @close="emit('close')">
    <p class="mb-3 text-sm text-ink-gray-7">
      {{
        __(
          'Each template becomes a draft only you and the managers see. Rewrite it in your words and publish it when it is ready.',
        )
      }}
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
import { ref } from 'vue'
import { Button } from 'frappe-ui'
import ManualSheet from '@/components/manual/ManualSheet.vue'
import {
  manualApi,
  outcomeUnknown,
  problemOf,
  requestId,
} from '@/composables/useManual'

const props = defineProps({ templates: { type: Array, default: () => [] } })
const emit = defineEmits(['close', 'done'])
const chosen = ref(props.templates.map((template) => template.key))
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
