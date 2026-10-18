<template>
  <!-- Where the document is in its life (MOBILE_REFERENCES, QuickBooks «Sent ·
       Viewed · Paid»): done stages carry a check, the current one is filled,
       the rest wait in grey. A profile's stages(record) gives the list. -->
  <ol
    class="stage-steps flex items-start"
    :aria-label="`Etapa: ${current?.label || ''}`"
    data-testid="documentos-stages"
  >
    <li
      v-for="(stage, i) in stages"
      :key="stage.label"
      class="stage flex min-w-0 flex-1 flex-col items-center gap-1 text-center"
      :class="{ done: stage.done, now: stage.current }"
      :aria-current="stage.current ? 'step' : undefined"
    >
      <span class="dot flex size-6 items-center justify-center rounded-full">
        <span
          v-if="stage.done"
          class="lucide-check size-4"
          aria-hidden="true"
        />
      </span>
      <span class="text-sm" :class="stage.current ? 'font-medium' : ''">{{
        stage.label
      }}</span>
      <span v-if="i < stages.length - 1" class="bar" aria-hidden="true" />
    </li>
  </ol>
</template>
<script setup>
import { computed } from 'vue'

const props = defineProps({
  // [{ label, done, current }]
  stages: { type: Array, default: () => [] },
})
const current = computed(() => props.stages.find((s) => s.current))
</script>
<style scoped>
.stage-steps {
  max-width: 28rem;
}
.stage {
  position: relative;
  color: var(--ink-gray-5, #999);
}
.stage.done,
.stage.now {
  color: var(--ink-gray-9, currentColor);
}
.dot {
  position: relative;
  z-index: 1;
  border: 2px solid currentColor;
  background: var(--surface-base, transparent);
}
.stage.done .dot {
  background: var(--ink-green-6, #30a66d);
  border-color: var(--ink-green-6, #30a66d);
  color: #fff;
}
.stage.now .dot {
  border-color: var(--ink-green-6, #30a66d);
  box-shadow: inset 0 0 0 4px var(--surface-base, #fff);
  background: var(--ink-green-6, #30a66d);
}
.bar {
  position: absolute;
  top: 0.75rem;
  left: calc(50% + 0.875rem);
  right: calc(-50% + 0.875rem);
  height: 2px;
  background: var(--outline-gray-2, #ddd);
}
.stage.done .bar {
  background: var(--ink-green-6, #30a66d);
}
</style>
