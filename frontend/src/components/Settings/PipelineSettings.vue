<template>
  <div class="p-5 space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-2xl-semibold">{{ __('Sales pipelines') }}</h2>
      <Button :label="__('New pipeline')" @click="newPipeline" />
    </div>
    <p class="text-sm text-ink-gray-6">
      {{
        __(
          'Choose stages, probability and access for each sales process. Archive stages to keep historical records readable.',
        )
      }}
    </p>
    <a href="/app/crm-deal-status" class="text-sm underline">{{
      __('Manage stage definitions and outcomes in Desk')
    }}</a>
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="pipeline in pipelines.data || []"
        :key="pipeline.name"
        :label="
          pipeline.pipeline_name +
          (pipeline.archived ? ' · ' + __('Archived') : '')
        "
        :variant="draft?.name === pipeline.name ? 'solid' : 'subtle'"
        @click="load(pipeline.name)"
      />
    </div>
    <p v-if="error" role="alert" class="text-sm text-ink-red-5">{{ error }}</p>
    <div v-if="draft" class="space-y-5">
      <div class="grid gap-4 sm:grid-cols-2">
        <FormControl
          v-model="draft.pipeline_name"
          :label="__('Pipeline name')"
        />
        <FormControl
          v-model="draft.sales_company"
          :label="__('Company scope (optional)')"
        />
        <Link
          v-model="draft.currency"
          doctype="Currency"
          :label="__('Default currency')"
        />
        <FormControl
          v-model="draft.probability_policy"
          type="select"
          :label="__('Probability policy')"
          :options="['Stage', 'Manual', 'Legacy']"
        />
        <FormControl
          v-model="draft.is_default"
          type="checkbox"
          :label="__('Default for this company scope')"
        />
        <FormControl
          v-model="draft.archived"
          type="checkbox"
          :label="__('Archived')"
        />
      </div>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'Stage uses the configured probability. Manual preserves explicit deal probabilities. Legacy preserves historical values and uses stage defaults for new records without a positive probability. Won is 100%; Lost is 0%.',
          )
        }}
      </p>
      <fieldset class="rounded-lg border p-3">
        <legend class="px-1 text-sm font-medium">
          {{ __('Permitted roles — empty allows all CRM sales roles') }}
        </legend>
        <div class="grid gap-2 sm:grid-cols-2">
          <label
            v-for="role in editor.data?.roles || []"
            :key="role"
            class="flex min-h-11 items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              :checked="draft.roles.some((row) => row.role === role)"
              @change="toggleRole(role, $event.target.checked)"
            />{{ role }}
          </label>
        </div>
      </fieldset>
      <div
        v-for="(stage, index) in draft.stages"
        :key="index"
        class="rounded-lg border p-4 space-y-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-medium">
            {{ __('Stage') }} {{ index + 1 }} ·
            {{ stage.outcome || stageType(stage.status) }}
          </h3>
          <div class="flex gap-2">
            <Button
              :label="__('Move up')"
              :disabled="index === 0"
              @click="move(index, -1)"
            />
            <Button
              :label="__('Move down')"
              :disabled="index === draft.stages.length - 1"
              @click="move(index, 1)"
            />
            <Button
              v-if="!stage.persisted"
              :label="__('Remove')"
              @click="draft.stages.splice(index, 1)"
            />
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <FormControl
            v-model="stage.status"
            type="select"
            :label="__('Stage')"
            :disabled="stage.persisted"
            :options="[
              { label: __('Select stage'), value: '' },
              ...(editor.data?.stages || []).map((s) => ({
                label: s.name,
                value: s.name,
              })),
            ]"
          />
          <FormControl
            v-model="stage.probability"
            type="number"
            min="0"
            max="100"
            :label="__('Probability (%)')"
          />
          <FormControl
            v-model="stage.archived"
            type="checkbox"
            :label="__('Archived — keep existing records')"
          />
        </div>
        <details>
          <summary class="cursor-pointer py-2 text-sm font-medium">
            {{ __('Stage requirements and transitions') }}
          </summary>
          <div class="grid gap-4 py-3 sm:grid-cols-2">
            <label class="text-sm"
              >{{ __('Required fields') }}
              <select
                multiple
                class="mt-2 block w-full rounded border bg-surface-white p-2"
                :value="splitFields(stage.required_fields)"
                @change="stage.required_fields = values($event).join(', ')"
              >
                <option
                  v-for="field in editor.data?.fields || []"
                  :key="field.name"
                  :value="field.name"
                >
                  {{ __(field.label) }}
                </option>
              </select>
            </label>
            <label class="text-sm"
              >{{ __('Allowed previous stages (empty allows all)') }}
              <select
                multiple
                class="mt-2 block w-full rounded border bg-surface-white p-2"
                :value="splitLines(stage.allowed_from)"
                @change="stage.allowed_from = values($event).join('\n')"
              >
                <option
                  v-for="other in draft.stages.filter((s) => s.status)"
                  :key="other.status"
                  :value="other.status"
                >
                  {{ other.status }}
                </option>
              </select>
            </label>
            <label class="text-sm"
              >{{
                __('Roles allowed to enter (empty allows all permitted roles)')
              }}
              <select
                multiple
                class="mt-2 block w-full rounded border bg-surface-white p-2"
                :value="splitLines(stage.transition_roles)"
                @change="stage.transition_roles = values($event).join('\n')"
              >
                <option
                  v-for="role in editor.data?.roles || []"
                  :key="role"
                  :value="role"
                >
                  {{ role }}
                </option>
              </select>
            </label>
          </div>
        </details>
      </div>
      <div class="flex flex-wrap gap-3">
        <Button
          :label="__('Add stage')"
          @click="
            draft.stages.push({ status: '', probability: 0, archived: 0 })
          "
        />
        <Button
          variant="solid"
          :label="__('Save pipeline')"
          :loading="saving"
          @click="save"
        />
        <a
          v-if="draft.name"
          class="self-center text-sm underline"
          :href="`/app/crm-pipeline/${encodeURIComponent(draft.name)}`"
          >{{ __('Open in Desk') }}</a
        >
      </div>
    </div>
    <details class="border-t pt-4">
      <summary class="cursor-pointer text-sm">
        {{ __('Compatibility mapping preview') }}
      </summary>
      <Button
        class="mt-3"
        :label="__('Preview existing records')"
        @click="preview.submit()"
      />
      <div v-if="preview.data" class="mt-3 text-sm space-y-1">
        <p
          v-for="(count, doctype) in preview.data.records_to_map"
          :key="doctype"
        >
          {{ __(doctype) }}: {{ count }} {{ __('records without a pipeline') }}
        </p>
        <p>
          {{ __('Missing historical stages') }}:
          {{ preview.data.unmapped_statuses.length }}
        </p>
        <p>
          {{
            __(
              'Mapping preserves stages, repair links, activity history and existing values.',
            )
          }}
        </p>
      </div>
    </details>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { Button, FormControl, createResource, call, toast } from 'frappe-ui'
import Link from '@/components/Controls/Link.vue'
const draft = ref(null)
const error = ref('')
const saving = ref(false)
const pipelines = createResource({
  url: 'crm.pipeline.api.get_pipelines',
  params: { include_archived: true },
  auto: true,
  onError: (e) => {
    error.value = e.message
  },
})
const editor = createResource({
  url: 'crm.pipeline.api.get_pipeline_editor_options',
  auto: true,
  onError: (e) => {
    error.value = e.message
  },
})
const preview = createResource({
  url: 'crm.pipeline.api.preview_pipeline_mapping',
  onError: (e) => {
    error.value = e.message
  },
})
function newPipeline() {
  error.value = ''
  draft.value = {
    pipeline_name: '',
    sales_company: '',
    currency: '',
    probability_policy: 'Stage',
    is_default: 0,
    archived: 0,
    roles: [],
    stages: [{ status: '', probability: 0, archived: 0 }],
  }
}
async function load(name) {
  try {
    draft.value = await call('crm.pipeline.api.get_pipeline_settings', { name })
    draft.value.stages.forEach((stage) => {
      stage.persisted = true
    })
    error.value = ''
  } catch (e) {
    error.value = e.message
  }
}
async function save() {
  saving.value = true
  error.value = ''
  try {
    const result = await call('crm.pipeline.api.save_pipeline', {
      data: draft.value,
    })
    await load(result.name)
    await pipelines.reload()
    toast.success(__('Pipeline saved'))
  } catch (e) {
    error.value = e.messages?.join(' ') || e.message
  } finally {
    saving.value = false
  }
}
function toggleRole(role, checked) {
  draft.value.roles = draft.value.roles.filter((r) => r.role !== role)
  if (checked) draft.value.roles.push({ role })
}
function move(index, offset) {
  const rows = draft.value.stages
  ;[rows[index], rows[index + offset]] = [rows[index + offset], rows[index]]
}
function stageType(name) {
  return editor.data?.stages?.find((s) => s.name === name)?.type || ''
}
function values(event) {
  return Array.from(event.target.selectedOptions, (option) => option.value)
}
function splitFields(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
function splitLines(value) {
  return (value || '').split('\n').filter(Boolean)
}
</script>
