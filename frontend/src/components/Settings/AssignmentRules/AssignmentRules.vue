<template>
  <div class="flex h-full flex-col gap-6 p-4 sm:p-6 text-ink-gray-8">
    <!-- Header -->
    <div class="flex flex-wrap justify-between gap-3 px-2 pt-2">
      <div class="flex flex-col gap-1 min-w-0 flex-1">
        <h2 class="flex gap-2 text-2xl-semibold leading-none h-5">
          {{ __('Assignment Rules') }}
        </h2>
        <p class="text-p-base text-ink-gray-6">
          {{
            __(
              'Auto-assign leads/deals to the right sales user based on predefined conditions',
            )
          }}
        </p>
      </div>
      <div class="flex item-center space-x-2 shrink-0 justify-end">
        <Button
          :label="__('New')"
          :disabled="
            !access.data?.can_create ||
            !access.data?.document_types?.length ||
            !!loadError
          "
          class="min-h-11"
          icon-left="lucide-plus"
          variant="solid"
          @click="goToNew()"
        />
      </div>
    </div>

    <div
      v-if="loadError"
      role="alert"
      class="rounded border border-outline-gray-2 p-3"
    >
      <p>{{ settingsErrorMessage(loadError) }}</p>
      <button
        type="button"
        class="mt-3 min-h-11 rounded border px-3 focus-visible:ring-2"
        :disabled="assignmentRulesListData.loading || access.loading"
        @click="retry"
      >
        {{ __('Retry') }}
      </button>
    </div>
    <p v-else-if="access.data && !access.data.can_create" class="text-sm">
      {{ __('Creating an assignment rule requires additional permission.') }}
    </p>
    <!-- Assignment rules list -->
    <div class="flex h-full overflow-y-auto">
      <AssignmentRulesList v-if="!loadError" />
    </div>
  </div>
</template>

<script setup>
import AssignmentRulesList from './AssignmentRulesList.vue'
import { Button, createResource } from 'frappe-ui'
import { computed, inject, provide } from 'vue'

import { settingsErrorMessage } from '@/composables/settingsSession'

const updateStep = inject('updateStep')

const assignmentRulesListData = createResource({
  url: 'crm.api.assignment_rule.get_assignment_rules_list',
  cache: ['assignmentRules', 'get_assignment_rules_list'],
  auto: true,
})

const access = createResource({
  url: 'crm.api.assignment_rule.get_assignment_rule_access',
  auto: true,
})
const loadError = computed(() => assignmentRulesListData.error || access.error)
function retry() {
  assignmentRulesListData.reload().catch(() => {})
  access.reload().catch(() => {})
}

provide('assignmentRulesList', assignmentRulesListData)

const goToNew = () => {
  updateStep('view', null)
}
</script>
