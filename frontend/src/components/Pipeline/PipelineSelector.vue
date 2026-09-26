<template>
  <div class="space-y-2">
    <FormControl
      type="select"
      :label="__('Sales pipeline')"
      :options="options"
      :model-value="doc.pipeline || ''"
      :disabled="disabled || pipelines.loading"
      @update:model-value="selectPipeline"
    />
    <p v-if="selected" class="text-sm text-ink-gray-6">
      {{ selected.sales_company || __('All companies') }} ·
      {{
        selected.probability_policy === 'Stage'
          ? __('Probability follows the stage')
          : __('Deal probability is editable')
      }}
    </p>
    <p v-if="pipelines.error" role="alert" class="text-sm text-ink-red-5">
      {{ __('Pipelines could not load. Retry before choosing a pipeline.') }}
      <button type="button" class="underline" @click="pipelines.reload()">
        {{ __('Retry') }}
      </button>
    </p>
  </div>
</template>
<script setup>
import { computed, watch } from 'vue'
import { createResource, FormControl } from 'frappe-ui'
import { pipelineSelection } from '@/utils/pipelineConfiguration'
import { guardStatusChange } from '@/utils/statusGuard'

const props = defineProps({
  doc: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  selectDefault: { type: Boolean, default: false },
})
const emit = defineEmits(['change', 'stages'])
const pipelines = createResource({
  url: 'crm.pipeline.api.get_pipelines',
  params: { include_archived: true },
  auto: true,
})
const selected = computed(() =>
  (pipelines.data || []).find((p) => p.name === props.doc.pipeline),
)
const options = computed(() => [
  { label: __('Select a pipeline'), value: '' },
  ...(pipelines.data || [])
    .filter((p) => !p.archived || p.name === props.doc.pipeline)
    .map((p) => ({
      label: p.pipeline_name + (p.archived ? ` · ${__('Archived')}` : ''),
      value: p.name,
      disabled: Boolean(p.archived),
    })),
])
function selectPipeline(name) {
  const pipeline = (pipelines.data || []).find((p) => p.name === name)
  if (pipeline && !pipeline.archived) {
    const values = pipelineSelection(pipeline, props.doc.status)
    if (props.doc.currency) delete values.currency
    if (props.doc.name && values.status !== props.doc.status) {
      guardStatusChange(values.status, () => emit('change', values))
    } else {
      emit('change', values)
    }
  }
}
watch(selected, (pipeline) => emit('stages', pipeline?.stages || []), {
  immediate: true,
})
watch(
  [() => pipelines.data, () => props.doc.pipeline],
  ([rows]) => {
    if (!props.selectDefault || (props.doc.pipeline && props.doc.status)) return
    const pipeline = (rows || []).find(
      (p) =>
        !p.archived &&
        (props.doc.pipeline
          ? p.name === props.doc.pipeline
          : p.is_default &&
            (p.sales_company || '') === (props.doc.sales_company || '')),
    )
    if (pipeline) selectPipeline(pipeline.name)
  },
  { immediate: true },
)
</script>
