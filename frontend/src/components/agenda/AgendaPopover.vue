<template>
  <Teleport to="body">
    <div
      ref="card"
      class="ag-pop"
      role="dialog"
      :aria-label="label"
      :style="style"
      tabindex="-1"
      @keydown.esc.stop="emit('close')"
    >
      <slot />
    </div>
  </Teleport>
</template>
<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { placeCard } from '@/components/agenda/agendaGrid'

// A card beside an anchor (the chip or the dragged range), like a calendar's quick view:
// right of it when there is room, else left, else centered; always inside the viewport.
const props = defineProps({
  anchor: { type: Object, default: null },
  width: { type: Number, default: 448 },
  label: { type: String, default: '' },
  // Pointer-downs inside these selectors do not close the card (the grid keeps drafts).
  keepOpenOn: { type: String, default: '' },
})
const emit = defineEmits(['close'])
const card = ref(null)
const style = ref({ visibility: 'hidden' })

async function place() {
  await nextTick()
  const element = card.value
  if (!element) return
  const box = element.getBoundingClientRect()
  const spot = placeCard(
    props.anchor,
    { width: props.width, height: box.height || 320 },
    { width: window.innerWidth, height: window.innerHeight },
  )
  style.value = {
    left: `${spot.left}px`,
    top: `${spot.top}px`,
    width: `${Math.min(props.width, window.innerWidth - 16)}px`,
  }
}
function outside(event) {
  if (card.value?.contains(event.target)) return
  if (props.keepOpenOn && event.target.closest?.(props.keepOpenOn)) return
  emit('close')
}
let observer
onMounted(() => {
  place()
  observer = new ResizeObserver(() => place())
  if (card.value) observer.observe(card.value)
  setTimeout(() => window.addEventListener('pointerdown', outside, true), 0)
  window.addEventListener('resize', place)
  nextTick(() => card.value?.focus({ preventScroll: true }))
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('pointerdown', outside, true)
  window.removeEventListener('resize', place)
})
watch(() => props.anchor, place)
</script>
<style scoped>
.ag-pop {
  position: fixed;
  z-index: 70;
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  border-radius: 16px;
  background: var(--surface-elevation-2, var(--surface-base));
  box-shadow:
    0 24px 48px -12px rgba(0, 0, 0, 0.4),
    0 0 0 1px var(--outline-gray-1);
  outline: none;
}
</style>
