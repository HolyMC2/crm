<template>
  <Dialog v-model="open" :options="{ title }"
    ><template #body-content
      ><div class="c-sheet" data-sheet="extra-field">
        <ExtraFieldForm
          :initial-mode="mode"
          :record="record"
          :reason-text="reasonText"
          @mode="current = $event"
          @defined="finish('defined', $event)"
          @requested="finish('requested', $event)"
          @use-field="finish('use-field', $event)"
          @open-section="finish('open-section', $event)"
          @open-fields="finish('open-fields')"
          @cancel="open = false"
        /></div></template
  ></Dialog>
</template>
<script setup>
import { computed, ref } from 'vue'
import ExtraFieldForm from './ExtraFieldForm.vue'

// «Añadir campo»: a dialog on wide screens, a bottom sheet on phones (contactos.css).
const props = defineProps({
  modelValue: Boolean,
  mode: { type: String, default: 'define' },
  record: { type: Object, default: null },
  reasonText: { type: String, default: '' },
})
const emit = defineEmits([
  'update:modelValue',
  'defined',
  'requested',
  'use-field',
  'open-section',
  'open-fields',
])
const open = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})
const current = ref(props.mode)
const title = computed(() =>
  current.value === 'request'
    ? __('Ask the owner for a field')
    : __('Add field'),
)
function finish(event, value) {
  emit(event, value)
  open.value = false
}
</script>
