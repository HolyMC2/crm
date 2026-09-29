<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <button
      v-for="t in templates"
      :key="t.key"
      class="group flex flex-col gap-3 rounded-xl border border-outline-gray-2 bg-surface-base p-4 text-left transition-colors hover:border-outline-gray-4 hover:bg-surface-gray-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-4"
      @click="$emit('pick', t.key)"
    >
      <div class="flex items-center gap-2.5">
        <span
          class="flex size-8 items-center justify-center rounded-lg bg-surface-gray-2 text-ink-gray-7"
        >
          <Icon :icon="t.icon" class="size-4" />
        </span>
        <span class="text-base font-semibold text-ink-gray-9">{{
          t.label
        }}</span>
      </div>
      <p class="text-p-sm text-ink-gray-6">{{ t.summary }}</p>
      <!-- a sketch of the questions, so the choice is about content -->
      <div class="flex flex-col gap-1.5 rounded-lg bg-surface-gray-1 p-2.5">
        <div
          v-for="label in t.fields.slice(0, 4)"
          :key="label"
          class="flex items-center gap-2"
        >
          <span class="w-24 shrink-0 truncate text-xs text-ink-gray-6">{{
            label
          }}</span>
          <span class="h-2.5 flex-1 rounded-sm bg-surface-gray-3" />
        </div>
      </div>
    </button>
    <button
      class="flex flex-col justify-center gap-2 rounded-xl border border-dashed border-outline-gray-3 p-4 text-left transition-colors hover:bg-surface-gray-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-outline-gray-4"
      @click="$emit('pick', '')"
    >
      <span class="text-base font-semibold text-ink-gray-9">{{
        __('Blank form')
      }}</span>
      <span class="text-p-sm text-ink-gray-6">{{
        __('Start with name, email and phone, and build from there.')
      }}</span>
    </button>
  </div>
</template>

<script setup>
import Icon from '@/components/Icon.vue'

defineProps({ templates: { type: Array, default: () => [] } })
defineEmits(['pick'])
</script>
