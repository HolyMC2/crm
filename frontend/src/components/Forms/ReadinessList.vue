<template>
  <ul class="flex flex-col gap-2">
    <li v-for="item in items" :key="item.key" class="flex items-start gap-2">
      <LucideCircleCheck
        v-if="item.ok && !item.info"
        class="mt-0.5 size-4 shrink-0 text-ink-green-5"
        :aria-label="__('Done')"
      />
      <LucideInfo
        v-else-if="item.info"
        class="mt-0.5 size-4 shrink-0 text-ink-gray-5"
      />
      <LucideCircle
        v-else-if="item.blocking"
        class="mt-0.5 size-4 shrink-0 text-ink-gray-4"
        :aria-label="__('To do')"
      />
      <LucideTriangleAlert
        v-else
        class="mt-0.5 size-4 shrink-0 text-ink-amber-6"
        :aria-label="__('Recommended')"
      />
      <div class="min-w-0">
        <div
          class="text-p-sm"
          :class="item.ok && !item.info ? 'text-ink-gray-6' : 'text-ink-gray-9'"
        >
          {{ item.label }}
        </div>
        <div v-if="item.hint && !item.ok" class="text-p-xs text-ink-gray-5">
          {{ item.hint }}
        </div>
      </div>
    </li>
  </ul>
</template>

<script setup>
import LucideCircleCheck from '~icons/lucide/circle-check'
import LucideCircle from '~icons/lucide/circle'
import LucideInfo from '~icons/lucide/info'
import LucideTriangleAlert from '~icons/lucide/triangle-alert'

defineProps({ items: { type: Array, default: () => [] } })
</script>
