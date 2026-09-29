<template>
  <section
    class="min-w-0 rounded-lg border border-outline-gray-2 bg-surface-base p-4"
    :aria-label="title"
    :aria-busy="loading"
  >
    <h2 class="text-base font-semibold text-ink-gray-9">{{ title }}</h2>
    <p v-if="description" class="mt-1 text-sm leading-relaxed text-ink-gray-6">
      {{ description }}
    </p>
    <div v-if="loading" role="status" class="mt-4 space-y-3">
      <span class="sr-only">{{ __('Loading report…') }}</span>
      <div
        v-for="width in ['w-3/4', 'w-full', 'w-1/2']"
        :key="width"
        class="h-8 rounded bg-surface-gray-2 motion-safe:animate-pulse"
        :class="width"
      />
    </div>
    <div
      v-else-if="error"
      role="alert"
      class="mt-4 space-y-2 text-sm text-ink-gray-7"
    >
      <p>{{ error }}</p>
      <button
        class="min-h-11 rounded border border-outline-gray-2 px-3 hover:bg-surface-gray-2"
        @click="$emit('retry')"
      >
        {{ __('Retry report') }}
      </button>
    </div>
    <p v-else-if="empty" class="py-8 text-sm text-ink-gray-6">
      {{
        emptyMessage ||
        __('No records match this period. Try another period or fewer filters.')
      }}
    </p>
    <div v-else class="mt-4 min-w-0"><slot /></div>
  </section>
</template>
<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  loading: Boolean,
  error: { type: String, default: '' },
  empty: Boolean,
  emptyMessage: { type: String, default: '' },
})
defineEmits(['retry'])
</script>
