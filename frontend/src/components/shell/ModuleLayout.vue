<template>
  <div class="flex h-full min-h-0 min-w-0 flex-1">
    <aside
      class="hidden w-[204px] shrink-0 overflow-y-auto border-r border-outline-gray-2 bg-surface-gray-1 px-3 py-5 sm:block"
      :aria-label="`Listas de ${title}`"
    >
      <div class="px-3 pb-4 text-base font-semibold">{{ title }}</div>
      <nav class="flex flex-col gap-1" :aria-label="title">
        <button
          v-for="entry in entries"
          :key="entry.value"
          class="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          :class="
            activeKey === entry.value
              ? 'bg-surface-gray-2 font-semibold text-ink-gray-9'
              : 'text-ink-gray-7'
          "
          :aria-current="activeKey === entry.value ? 'page' : undefined"
          @click="$emit('select', entry.value)"
        >
          <FeatherIcon
            :name="entry.icon || 'list'"
            class="h-4 w-4 shrink-0"
          /><span class="truncate">{{ entry.label }}</span>
        </button>
      </nav>
      <template v-if="savedEntries.length">
        <div class="px-3 pb-3 pt-7 text-xs text-ink-gray-6">
          {{ savedLabel }}
        </div>
        <nav class="flex flex-col gap-1" :aria-label="savedLabel">
          <button
            v-for="entry in savedEntries"
            :key="entry.value"
            class="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
            :class="
              activeKey === entry.value
                ? 'bg-surface-gray-2 font-semibold text-ink-gray-9'
                : 'text-ink-gray-7'
            "
            :aria-current="activeKey === entry.value ? 'page' : undefined"
            @click="$emit('select', entry.value)"
          >
            <FeatherIcon
              :name="entry.icon || 'bookmark'"
              class="h-4 w-4 shrink-0"
            /><span class="truncate">{{ entry.label }}</span>
          </button>
        </nav>
      </template>
      <slot name="sidebar" />
    </aside>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
      <slot />
    </div>
  </div>
</template>
<script setup>
import { FeatherIcon } from 'frappe-ui'
defineProps({
  title: { type: String, required: true },
  entries: { type: Array, default: () => [] },
  activeKey: { type: String, default: '' },
  savedEntries: { type: Array, default: () => [] },
  savedLabel: { type: String, default: 'Guardados' },
})
defineEmits(['select'])
</script>
