<template>
  <!-- One list of an arrangement (Personalizar, Barra por puesto, a module's
       sections): drag a row (long-press on the phone, the grip on desktop,
       or the grip and the arrow keys). A hidden row keeps its place, dimmed
       with the eye crossed, so showing it again puts it back where it was.
       The parent runs useReorder over the scroller that holds the lists. -->
  <ul ref="root" class="space-y-1" :data-reorder-list="list">
    <li
      v-for="(key, index) in keys"
      :key="key"
      :class="ROW"
      :data-reorder-key="key"
      :data-layout-row="key"
      :data-hidden="isHidden(key) ? '' : undefined"
      @pointerenter="$emit('lit', key)"
      @pointerleave="$emit('lit', '')"
      @focusin="$emit('lit', key)"
      @focusout="$emit('lit', '')"
    >
      <button
        type="button"
        data-drag-handle
        :class="GRIP"
        :aria-label="__('Move {0}', [labelOf(key)])"
        :title="__('Drag, or use the arrow keys, to reorder')"
        @keydown="nudge(index, $event)"
      >
        <span class="lucide-grip-vertical size-4" aria-hidden="true" />
      </button>
      <span
        v-if="typeof iconOf(key) === 'string'"
        :class="[iconOf(key), ICON, isHidden(key) && 'opacity-40']"
        aria-hidden="true"
      />
      <component
        :is="iconOf(key)"
        v-else-if="iconOf(key)"
        :class="[ICON, isHidden(key) && 'opacity-40']"
        aria-hidden="true"
      />
      <span
        class="min-w-0 flex-1 truncate"
        :class="isHidden(key) ? 'text-ink-gray-5' : ''"
        >{{ labelOf(key) }}</span
      >
      <button
        v-if="move"
        type="button"
        :class="ACTION"
        :aria-label="move.label(labelOf(key))"
        :title="move.title"
        :data-action="move.action"
        @click="$emit('move', key)"
      >
        <span :class="[move.icon, 'size-4']" aria-hidden="true" />
      </button>
      <button
        v-if="hideable"
        type="button"
        :class="ACTION"
        :aria-label="
          isHidden(key)
            ? __('Show {0}', [labelOf(key)])
            : __('Hide {0}', [labelOf(key)])
        "
        :aria-pressed="isHidden(key)"
        :title="isHidden(key) ? __('Show') : __('Hide')"
        :data-action="isHidden(key) ? 'show' : 'hide'"
        @click="$emit('toggle', key)"
      >
        <span
          :class="[isHidden(key) ? 'lucide-eye-off' : 'lucide-eye', 'size-4']"
          aria-hidden="true"
        />
      </button>
    </li>
  </ul>
</template>
<script setup>
import { ref } from 'vue'
import { moved } from '@/composables/useReorder'

const props = defineProps({
  /** The list's name for useReorder's drop ({ list, keys }). */
  list: { type: String, required: true },
  keys: { type: Array, default: () => [] },
  /** key → { label, icon } (icon: a lucide-* class or a component). */
  itemOf: { type: Function, required: true },
  /** Keys flagged hidden (a Set); they stay in place, dimmed. */
  hidden: { type: Set, default: () => new Set() },
  /** The eye on each row. */
  hideable: { type: Boolean, default: false },
  /** The row's move to the other part: { icon, title, action, label(name) }. */
  move: { type: Object, default: null },
})
const emit = defineEmits(['update:keys', 'move', 'toggle', 'lit'])

const labelOf = (key) => props.itemOf(key)?.label || key
const iconOf = (key) => props.itemOf(key)?.icon || ''
const isHidden = (key) => props.hidden.has(key)

const root = ref(null)
function nudge(index, event) {
  const step = { ArrowUp: -1, ArrowDown: 1 }[event.key]
  if (!step || index + step < 0 || index + step >= props.keys.length) return
  event.preventDefault()
  const key = props.keys[index]
  emit('update:keys', moved(props.keys, index, index + step))
  // The grip keeps the focus on its row at the new place.
  requestAnimationFrame(() =>
    [...(root.value?.children || [])]
      .find((row) => row.dataset.layoutRow === key)
      ?.querySelector('[data-drag-handle]')
      ?.focus(),
  )
}

const ROW =
  'flex min-h-12 items-center gap-2 rounded-6 bg-surface-gray-1 pr-1 text-base'
const GRIP =
  'flex h-11 w-8 flex-none cursor-grab items-center justify-center rounded-6 text-ink-gray-5 touch-none'
const ICON = 'size-5 flex-none'
const ACTION =
  'press flex size-11 flex-none items-center justify-center rounded-6 text-ink-gray-7 hover:bg-surface-gray-3'
</script>
