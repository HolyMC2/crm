// Desktop drag-to-reschedule over the vendored calendar without changing it: events carry
// data-event-id, slots data-mc-slot-index, week columns data-date (day view uses the page
// date). Touch keeps native scrolling; phones reschedule from the event panel instead.
import { onBeforeUnmount, onMounted } from 'vue'
import { rescheduleTimes } from '@/composables/useAgenda'

const THRESHOLD = 6

export function dropSlot(elements, fallbackDate) {
  const slot = elements.find((el) => el.matches?.('[data-mc-slot-index]'))
  if (!slot) return null
  const column = slot.closest('[data-mc-selection-column]')
  const date = column?.dataset?.date || fallbackDate
  const index = Number(slot.dataset.mcSlotIndex)
  return date && Number.isInteger(index) ? { date, index, slot } : null
}

export function useAgendaDrag(rootRef, { find, options, onDrop }) {
  let drag = null
  let hovered = null

  const clearHover = () => {
    hovered?.classList.remove('agenda-drop-target')
    hovered = null
  }
  const finish = () => {
    if (drag?.button) {
      drag.button.classList.remove('agenda-dragging')
      drag.button.style.pointerEvents = ''
    }
    clearHover()
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', escape)
    drag = null
  }
  const down = (event) => {
    if (event.button !== 0 || event.pointerType === 'touch') return
    const button = event.target.closest?.('.mc-calendar [data-event-id]')
    if (!button || !rootRef.value?.contains(button)) return
    const calendarEvent = find(
      button.dataset.eventId,
      button.dataset.eventSource,
    )
    if (!calendarEvent?.draggable) return
    drag = {
      button,
      event: calendarEvent,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', escape)
  }
  const move = (event) => {
    if (!drag) return
    if (!drag.moved) {
      if (
        Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < THRESHOLD
      )
        return
      drag.moved = true
      drag.button.classList.add('agenda-dragging')
      // Let hit-testing see the slot underneath the dragged chip.
      drag.button.style.pointerEvents = 'none'
    }
    const target = dropSlot(
      document.elementsFromPoint(event.clientX, event.clientY),
      options().date,
    )
    if (target?.slot !== hovered) {
      clearHover()
      hovered = target?.slot || null
      hovered?.classList.add('agenda-drop-target')
    }
  }
  const up = (event) => {
    if (!drag) return
    const current = drag
    const target = current.moved
      ? dropSlot(
          document.elementsFromPoint(event.clientX, event.clientY),
          options().date,
        )
      : null
    finish()
    if (!current.moved) return
    // The release also fires a click on the chip; it must not open the panel.
    const swallow = (click) => {
      click.stopPropagation()
      click.preventDefault()
    }
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(
      () => window.removeEventListener('click', swallow, { capture: true }),
      0,
    )
    if (!target) return
    const times = rescheduleTimes(
      current.event,
      target.date,
      target.index,
      options(),
    )
    if (times && times.start !== current.event.start)
      onDrop(current.event, times)
  }
  const cancel = () => finish()
  const escape = (event) => {
    if (event.key === 'Escape') finish()
  }
  onMounted(() => rootRef.value?.addEventListener('pointerdown', down))
  onBeforeUnmount(() => {
    rootRef.value?.removeEventListener('pointerdown', down)
    finish()
  })
}
