<!--
  CalendarGrid — the Social calendar view (W6 B0 extract from SocialCalendar.vue).
  Mobile agenda (list of days with posts) OR the 7-col month grid + status legend +
  the unscheduled-drafts tray. Drag state is self-contained: month days are drop
  targets, tiles and tray chips are drag sources. Emits open-new(day) / open-edit(post)
  and reschedule({ post, dayKey }) up to the page; the page owns the resources.
-->
<template>
  <!-- mobile agenda: the 7-col month grid is unreadable at 390px — list the
       month's days that have posts (+ hoy), tap day = nueva, tap post = editar -->
  <div v-if="isMobile" class="p-3">
    <div v-if="!agendaDays.length" class="py-10 text-center text-[12px] text-ink-gray-4">
      {{ __('Sin publicaciones este mes — toca + para crear una') }}
    </div>
    <div v-for="day in agendaDays" :key="day.key" class="mb-2 rounded-lg border border-outline-gray-2 bg-surface-white p-2">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-[11.5px] font-bold" :class="day.isToday ? 'text-ink-green-3' : 'text-ink-gray-6'">
          {{ day.label }}<span v-if="day.isToday"> · {{ __('hoy') }}</span>
        </span>
        <button class="press px-1 text-[13px] text-ink-gray-5" :aria-label="__('Nueva publicación este día')" @click="emit('open-new', day)">+</button>
      </div>
      <button
        v-for="p in postsByDay[day.key] || []"
        :key="p.name"
        class="press mb-0.5 block w-full truncate rounded px-2 py-1 text-left text-[11.5px] font-medium"
        :class="chip(p.status)"
        @click="emit('open-edit', p)"
      >
        {{ chanIcons(p.channels) }} {{ p.title || p.name }}
      </button>
    </div>
  </div>

  <div v-else class="p-4">
    <!-- weekday header -->
    <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">
      <div v-for="d in WEEKDAYS" :key="d">{{ d }}</div>
    </div>
    <!-- month grid -->
    <div class="mt-1 grid grid-cols-7 gap-1">
      <div
        v-for="day in days"
        :key="day.key"
        class="min-h-[92px] rounded-lg border p-1 text-left"
        :class="[
          day.inMonth ? 'border-outline-gray-2 bg-surface-white' : 'border-transparent bg-surface-gray-1/50',
          dragOver === day.key ? 'ring-2 ring-green-400' : '',
        ]"
        @click="emit('open-new', day)"
        @dragover.prevent="dragOver = day.key"
        @dragleave="dragOver = (dragOver === day.key ? '' : dragOver)"
        @drop="onDrop(day)"
      >
        <div class="mb-0.5 text-[11px]" :class="day.isToday ? 'font-bold text-ink-green-3' : 'text-ink-gray-4'">{{ day.n }}</div>
        <div class="flex flex-col gap-0.5">
          <button
            v-for="p in (postsByDay[day.key] || [])"
            :key="p.name"
            draggable="true"
            class="truncate rounded px-1 py-0.5 text-left text-[10.5px] font-medium"
            :class="chip(p.status)"
            :title="p.title + ' · ' + p.status + ' · ' + __('arrastra para reprogramar')"
            @click.stop="emit('open-edit', p)"
            @dragstart="dragged = p"
            @dragend="dragged = null"
          >{{ chanIcons(p.channels) }} {{ p.title || p.name }}</button>
        </div>
      </div>
    </div>

    <!-- status legend -->
    <div class="mt-3 flex flex-wrap items-center gap-1.5 text-[10.5px]">
      <span v-for="st in LEGEND" :key="st.status" class="rounded px-1.5 py-0.5 font-medium" :class="chip(st.status)">{{ st.label }}</span>
    </div>

    <!-- unscheduled drafts tray -->
    <div v-if="drafts.length" class="mt-4">
      <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">{{ __('Borradores sin programar') }}</div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="p in drafts" :key="p.name"
          draggable="true"
          class="rounded-md px-2 py-1 text-[11.5px] font-medium" :class="chip(p.status)"
          :title="__('arrastra a un día para fecharlo')"
          @click="emit('open-edit', p)"
          @dragstart="dragged = p"
          @dragend="dragged = null"
        >{{ chanIcons(p.channels) }} {{ p.title || p.name }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { isMobile } from '@/composables/breakpoint'
import { WEEKDAYS, chip, chanIcons } from '@/composables/socialCalendar'

defineProps({
  days: { type: Array, default: () => [] },
  postsByDay: { type: Object, default: () => ({}) },
  agendaDays: { type: Array, default: () => [] },
  drafts: { type: Array, default: () => [] },
})
const emit = defineEmits(['open-new', 'open-edit', 'reschedule'])

const LEGEND = [
  { status: 'Draft', label: __('Borrador') },
  { status: 'Pending Approval', label: __('Por aprobar') },
  { status: 'Scheduled', label: __('Programada') },
  { status: 'Published', label: __('Publicada') },
  { status: 'Failed', label: __('Falló') },
]

// ── drag-reschedule ──────────────────────────────────────────────────────
const dragged = ref(null)
const dragOver = ref('')
function onDrop(day) {
  dragOver.value = ''
  const p = dragged.value
  dragged.value = null
  if (!p) return
  emit('reschedule', { post: p, dayKey: day.key })
}
</script>
