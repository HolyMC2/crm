<template>
  <!-- The bolt in a list's bar: every list-wide action behind one icon
       (documentos/acciones.js). A sheet on the phone, a menu grown from the
       bolt on wider screens. -->
  <div v-if="!phone" ref="wrap" class="relative flex-none">
    <button
      ref="bolt"
      type="button"
      :class="[BOLT, openState ? 'bg-surface-gray-2' : '']"
      aria-label="Acciones"
      title="Acciones"
      aria-haspopup="true"
      :aria-expanded="String(openState)"
      data-testid="documentos-acciones"
      @click="openState = !openState"
    >
      <span class="lucide-zap size-6" aria-hidden="true" />
    </button>
    <Transition name="acciones-pop">
      <div
        v-if="openState"
        ref="pop"
        role="dialog"
        aria-label="Acciones"
        class="absolute right-0 top-full z-50 mt-1 max-h-[min(70dvh,34rem)] w-80 origin-top-right overflow-y-auto rounded-8 border border-outline-gray-1 bg-surface-base pt-1 text-ink-gray-9 shadow-xl"
        @keydown.esc.stop="close(true)"
      >
        <AccionesPanel :groups="groups" @pick="pick" />
      </div>
    </Transition>
  </div>
  <template v-else>
    <button
      type="button"
      :class="BOLT"
      aria-label="Acciones"
      aria-haspopup="dialog"
      :aria-expanded="String(openState)"
      data-testid="documentos-acciones"
      @click="openState = true"
    >
      <span class="lucide-zap size-6" aria-hidden="true" />
    </button>
    <BottomSheet
      v-if="sheetUsed"
      v-model:open="openState"
      title="Acciones"
      :subtitle="subtitle"
      flush
    >
      <AccionesPanel :groups="groups" @pick="pick" />
    </BottomSheet>
  </template>
</template>
<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { BottomSheet } from '@/components/ui'
import AccionesPanel from './AccionesPanel.vue'

const props = defineProps({
  // listActionsFor(profile, ctx) groups
  groups: { type: Array, default: () => [] },
  phone: { type: Boolean, default: false },
  // The list's name under the sheet's title.
  subtitle: { type: String, default: '' },
})
const emit = defineEmits(['pick'])

const BOLT =
  'press flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2'

const openState = ref(false)
// The sheet mounts on its first open.
const sheetUsed = ref(false)
const wrap = ref(null)
const bolt = ref(null)
const pop = ref(null)

// Desktop menu: a tap outside or Esc closes it; it opens with focus on its
// first action and gives focus back to the bolt on Esc.
function outside(event) {
  if (!wrap.value?.contains(event.target)) close()
}
function close(refocus = false) {
  openState.value = false
  if (refocus) bolt.value?.focus()
}
watch(openState, async (on) => {
  if (on) sheetUsed.value = true
  if (props.phone) return
  if (on) {
    document.addEventListener('pointerdown', outside, true)
    await nextTick()
    pop.value?.querySelector('a, button')?.focus({ preventScroll: true })
  } else document.removeEventListener('pointerdown', outside, true)
})
onBeforeUnmount(() =>
  document.removeEventListener('pointerdown', outside, true),
)

function pick(action) {
  openState.value = false
  emit('pick', action)
}
</script>
<style>
/* Grows from the bolt (feel.md «Space»): no overshoot on a menu. */
.acciones-pop-enter-active {
  transition:
    opacity 160ms cubic-bezier(0.2, 0, 0, 1),
    transform 160ms cubic-bezier(0.2, 0, 0, 1);
}
.acciones-pop-leave-active {
  transition: opacity 100ms ease-in;
}
.acciones-pop-enter-from {
  opacity: 0;
  transform: scale(0.96);
}
.acciones-pop-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .acciones-pop-enter-from {
    transform: none;
  }
}
</style>
