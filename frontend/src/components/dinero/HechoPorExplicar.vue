<template>
  <!-- What a tap did, in the place where the worker tapped: what was booked, how
       the account stands now, and its undo. -->
  <div
    role="status"
    class="flex items-start gap-3 py-4"
    data-por-explicar-recibo
    :data-por-explicar-hecho="item.title"
  >
    <span
      class="lucide-check-circle-2 mt-0.5 size-5 flex-none text-ink-green-7"
      aria-hidden="true"
    />
    <div class="min-w-0 flex-1">
      <p class="break-words text-base font-medium text-ink-gray-9">
        {{ item.title }}
      </p>
      <p
        v-for="(line, i) in item.lines"
        :key="i"
        class="mt-0.5 text-sm text-ink-gray-8"
      >
        {{ line }}
      </p>
      <p v-if="item.problem" role="alert" class="mt-1 text-sm text-ink-red-7">
        {{ item.problem }}
      </p>
    </div>
    <Button
      v-if="item.canUndo"
      class="min-h-11 flex-none"
      variant="subtle"
      label="Deshacer"
      :loading="item.busy"
      data-por-explicar-deshacer
      @click="emit('undo')"
    />
  </div>
</template>

<script setup>
import { Button } from 'frappe-ui'

defineProps({
  /** {title, lines[], canUndo, busy, problem} */
  item: { type: Object, required: true },
})
const emit = defineEmits(['undo'])
</script>
