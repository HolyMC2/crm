<template>
  <!-- One container for every Cobranza form: a bottom sheet on a phone (big
       tap targets, the actions at the thumb), a dialog on wider screens. -->
  <BottomSheet
    v-if="phone"
    :open="modelValue"
    :title="''"
    @update:open="(value) => $emit('update:modelValue', value)"
  >
    <div class="flex min-h-full flex-col px-5 pb-6" :data-cobranza-sheet="kind">
      <h2 class="pb-1 text-xl font-semibold text-ink-gray-9">{{ title }}</h2>
      <p v-if="subtitle" class="pb-3 text-sm text-ink-gray-6">
        {{ subtitle }}
      </p>
      <div class="flex-1 space-y-3 text-base">
        <slot />
      </div>
      <div
        class="sticky bottom-0 -mx-5 mt-4 flex flex-col-reverse gap-2 border-t border-outline-gray-1 bg-surface-base px-5 pt-3 [&_button]:min-h-12 [&_button]:w-full"
      >
        <slot name="actions" />
      </div>
    </div>
  </BottomSheet>
  <Dialog
    v-else
    :model-value="modelValue"
    :options="{ title, size }"
    @update:model-value="(value) => $emit('update:modelValue', value)"
  >
    <template #body-content>
      <div class="space-y-3 text-base" :data-cobranza-sheet="kind">
        <p v-if="subtitle" class="text-sm text-ink-gray-6">{{ subtitle }}</p>
        <slot />
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <slot name="actions" />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { BottomSheet, Dialog } from 'frappe-ui'
import { isMobile } from '@/composables/breakpoint'

defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  size: { type: String, default: 'md' },
  kind: { type: String, default: '' },
})
defineEmits(['update:modelValue'])
const phone = isMobile
</script>
