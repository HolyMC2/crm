<template>
  <section class="mt-6 rounded-lg border p-4">
    <div class="flex items-center justify-between gap-3">
      <span class="text-base-semibold text-ink-gray-8">{{ provider.label }}</span>
      <a :href="route" class="text-sm text-ink-blue-9 hover:underline">
        {{ __('Open workspace') }}
      </a>
    </div>
    <div v-if="modules.length" class="mt-2 flex flex-wrap gap-2 text-sm text-ink-gray-6">
      <span v-for="module in modules" :key="module.id">
        {{ __(module.label) }}<template v-if="module.state === 'demo_only'"> · {{ __('Demonstration') }}</template>
      </span>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  provider: { type: Object, required: true },
  route: { type: String, required: true },
})
const modules = computed(() => (props.provider.modules || []).filter(
  (module) => ['available', 'demo_only'].includes(module.state),
))
</script>
