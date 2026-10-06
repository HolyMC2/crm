import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Interval } from '../core'

interface Selection { group: string; anchor: number; focus: number; mode: 'pointer' | 'keyboard'; pointerId?: number }

/** One resource/date at a time; endpoints always come from actual, valid slots. */
export function useSlotSelection(options: {
  slots: (group: string) => readonly Interval[]
  disabled: () => boolean
  commit: (group: string, range: Interval) => void
}) {
  const state = ref<Selection | null>(null)
  let target: HTMLElement | null = null
  let cancelledPointer: number | null = null
  let suppressClick = false
  let clickTimer: ReturnType<typeof setTimeout> | undefined
  const range = computed(() => {
    const current = state.value
    if (!current) return null
    const slots = options.slots(current.group)
    const first = slots[Math.min(current.anchor, current.focus)]
    const last = slots[Math.max(current.anchor, current.focus)]
    return first && last ? { start: first.start, end: last.end } : null
  })
  const suppress = () => {
    suppressClick = true
    clearTimeout(clickTimer)
    clickTimer = setTimeout(() => { suppressClick = false }, 0)
  }
  const release = (pointerId?: number) => {
    try { if (pointerId !== undefined && target?.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId) } catch { /* The source may have unmounted. */ }
    target = null
  }
  const cancel = () => {
    if (state.value?.mode === 'pointer') cancelledPointer = state.value.pointerId ?? 1
    state.value = null
  }
  const commit = () => {
    const current = state.value
    const selected = range.value
    state.value = null
    release(current?.pointerId)
    if (current && selected && !options.disabled()) options.commit(current.group, selected)
  }
  const pointerDown = (event: PointerEvent, group: string, index: number) => {
    // Native touch movement must remain scrolling; a touch tap uses click below.
    if (options.disabled() || event.pointerType === 'touch' || event.button !== 0 || !options.slots(group)[index]) return
    event.preventDefault()
    release(state.value?.pointerId)
    cancelledPointer = null
    target = event.currentTarget as HTMLElement
    target.focus({ preventScroll: true })
    const pointerId = event.pointerId ?? 1
    state.value = { group, anchor: index, focus: index, mode: 'pointer', pointerId }
    try { target.setPointerCapture?.(pointerId) } catch { /* Window listeners also handle uncaptured pointers. */ }
  }
  const pointerMove = (event: PointerEvent) => {
    const current = state.value
    if (current?.mode !== 'pointer' || current.pointerId !== (event.pointerId ?? 1) || options.disabled()) return
    const column = target?.closest('[data-mc-selection-column]')
    const buttons = column?.querySelectorAll<HTMLElement>('[data-mc-slot-index]')
    if (!buttons?.length) return
    let nearest = current.focus
    let distance = Infinity
    for (const button of Array.from(buttons)) {
      const box = button.getBoundingClientRect()
      const nextDistance = event.clientY < box.top ? box.top - event.clientY : event.clientY > box.bottom ? event.clientY - box.bottom : 0
      if (nextDistance < distance) { nearest = Number(button.dataset.mcSlotIndex); distance = nextDistance }
    }
    if (Number.isInteger(nearest) && options.slots(current.group)[nearest]) current.focus = nearest
  }
  const pointerUp = (event: PointerEvent) => {
    const pointerId = event.pointerId ?? 1
    if (cancelledPointer === pointerId) {
      cancelledPointer = null; suppress(); release(pointerId); return
    }
    if (state.value?.mode !== 'pointer' || state.value.pointerId !== pointerId) return
    pointerMove(event)
    suppress()
    commit()
  }
  const pointerCancel = (event: PointerEvent) => {
    const pointerId = event.pointerId ?? 1
    if (state.value?.pointerId !== pointerId && cancelledPointer !== pointerId) return
    state.value = null; cancelledPointer = null; suppress(); release(pointerId)
  }
  const click = (group: string, index: number) => {
    if (suppressClick || options.disabled()) return
    const slot = options.slots(group)[index]
    state.value = null
    if (slot) options.commit(group, { start: slot.start, end: slot.end })
  }
  const keyDown = (event: KeyboardEvent, group: string, index: number) => {
    if (event.key === 'Escape' && state.value) { event.preventDefault(); cancel(); return }
    if (options.disabled() || state.value?.mode === 'pointer') return
    if (event.shiftKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      const previous = state.value?.mode === 'keyboard' && state.value.group === group ? state.value : { group, anchor: index, focus: index, mode: 'keyboard' as const }
      const focus = Math.max(0, Math.min(options.slots(group).length - 1, previous.focus + (event.key === 'ArrowDown' ? 1 : -1)))
      state.value = { ...previous, focus }
    } else if ((event.key === 'Enter' || event.key === ' ') && state.value?.mode === 'keyboard' && state.value.group === group) {
      event.preventDefault(); suppress(); commit()
    }
  }
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && state.value) { event.preventDefault(); cancel() } }
  onMounted(() => {
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', pointerCancel)
    window.addEventListener('keydown', escape)
    window.addEventListener('blur', cancel)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', pointerMove)
    window.removeEventListener('pointerup', pointerUp)
    window.removeEventListener('pointercancel', pointerCancel)
    window.removeEventListener('keydown', escape)
    window.removeEventListener('blur', cancel)
    clearTimeout(clickTimer)
    release(state.value?.pointerId ?? cancelledPointer ?? undefined)
  })
  return { state, range, pointerDown, click, keyDown, cancel }
}
