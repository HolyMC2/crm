<template>
  <Teleport to="body">
    <!-- The sheet is the only scroller while open; the backdrop never scrolls
         and the page behind keeps its position. -->
    <div
      class="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/40 sm:items-center"
      data-testid="manual-sheet-backdrop"
      @click.self="emit('close')"
    >
      <section
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        class="flex max-h-[92dvh] w-full flex-col overflow-y-auto overscroll-contain rounded-t-2xl bg-surface-base p-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-xl focus:outline-none sm:max-w-lg sm:rounded-2xl"
        data-testid="manual-sheet"
        @keydown.esc="emit('close')"
      >
        <header class="mb-3 flex items-start gap-3">
          <h2 class="min-w-0 flex-1 text-lg font-semibold text-ink-gray-9">
            {{ title }}
          </h2>
          <Button
            icon="x"
            variant="ghost"
            :aria-label="__('Close', null, 'Manual')"
            class="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
            @click="emit('close')"
          />
        </header>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { Button } from 'frappe-ui'

defineProps({ title: { type: String, required: true } })
const emit = defineEmits(['close'])
const panel = ref(null)
onMounted(() => nextTick(() => panel.value?.focus()))
</script>
