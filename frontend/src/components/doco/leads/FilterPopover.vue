<!-- Generic checkbox filter popover for the redesigned list toolbars (handoff §5.2). -->
<template>
  <div class="relative inline-block">
    <button
      type="button"
      class="press inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm"
      :class="
        selected.length
          ? 'bg-surface-green-2 text-ink-green-8'
          : 'bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3'
      "
      :aria-expanded="open"
      @click="open = !open"
    >
      {{ label }}
      <span v-if="selected.length" class="num font-semibold">{{
        selected.length
      }}</span>
      <span class="lucide-chevron-down size-4" aria-hidden="true" />
    </button>

    <template v-if="open">
      <div class="fixed inset-0 z-[90]" @click="open = false" />
      <div
        class="absolute left-0 z-[100] mt-1 min-w-[180px] overflow-hidden rounded-[10px] border border-outline-gray-2 bg-surface-base"
        style="box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12)"
      >
        <div
          class="border-b border-outline-gray-1 px-3 py-2 text-sm font-medium text-ink-gray-7"
        >
          {{ label }}
        </div>
        <div class="max-h-[260px] overflow-y-auto py-1">
          <label
            v-for="o in options"
            :key="o.value"
            class="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] text-ink-gray-8 hover:bg-surface-gray-2"
          >
            <input
              type="checkbox"
              :checked="selected.includes(o.value)"
              style="accent-color: var(--brand)"
              @change="toggle(o.value)"
            />
            <!-- a stage's colour is an ink class, a score's a hex -->
            <span v-if="o.color" v-bind="dotBinding(o.color)" />
            {{ o.label }}
          </label>
        </div>
        <div
          class="flex justify-between border-t border-outline-gray-1 px-3 py-2"
        >
          <button class="text-[12px] text-ink-gray-5" @click="clear">
            {{ __('Limpiar') }}
          </button>
          <!-- each tick filters at once: this only closes the list -->
          <button
            class="text-[12px] font-semibold text-ink-gray-9"
            @click="open = false"
          >
            {{ __('Listo') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { dotBinding } from '@/components/ui/chipClass'

const props = defineProps({
  label: { type: String, required: true },
  options: { type: Array, default: () => [] },
  selected: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:selected'])
const open = ref(false)

function toggle(v) {
  const next = props.selected.includes(v)
    ? props.selected.filter((x) => x !== v)
    : [...props.selected, v]
  emit('update:selected', next)
}
function clear() {
  emit('update:selected', [])
}
</script>
