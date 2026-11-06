<template>
  <!-- Optional field filter for an update event: only these changes are sent. -->
  <label class="flex min-w-0 flex-col gap-0.5">
    <span class="text-xs text-ink-gray-6">{{
      __('Only when these fields change')
    }}</span>
    <input
      type="text"
      class="h-9 w-full min-w-0 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
      :value="value || ''"
      placeholder="status, grand_total"
      autocomplete="off"
      spellcheck="false"
      @change="(event) => emit('change', event.target.value)"
    />
    <span class="text-xs text-ink-gray-5">{{
      __('Field names, separated by commas. Empty: every change.')
    }}</span>
  </label>
</template>
<script setup>
defineProps({
  value: { type: String, default: '' },
})
const emit = defineEmits(['change'])
</script>
