<!--
  CalendarGrid — the Social calendar view (W6 B0 extract, B1 juiced). Renders one of:
  · agenda LIST (calView 'list' or mobile) — days with posts,
  · WEEK row (7 cells) or MONTH grid (42 cells) — same markup, `days` length differs.
  Tiles are colored by PILLAR (post_kind); each channel shows a status-colored dot;
  evergreen posts get ♻, recycled get ↺; season ribbons band the grid cells. Drag state
  is self-contained and past days are not droppable. Emits open-new(day) / open-edit(post)
  and reschedule({ post, dayKey }) up to the page; the page owns the resources + filters.
-->
<template>
  <!-- agenda / list (also the mobile default): the 7-col grid is unreadable at 390px -->
  <div v-if="isList" class="p-3">
    <div v-if="!agendaDays.length" class="py-10 text-center text-[12px] text-ink-gray-4">
      {{ __('Sin publicaciones — toca + para crear una') }}
    </div>
    <div v-for="day in agendaDays" :key="day.key" class="mb-2 rounded-lg border border-outline-gray-2 bg-surface-base p-2">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-[11.5px] font-bold" :class="day.isToday ? 'text-ink-green-7' : 'text-ink-gray-6'">
          {{ day.label }}<span v-if="day.isToday"> · {{ __('hoy') }}</span>
        </span>
        <button class="press px-1 text-[13px] text-ink-gray-5" :aria-label="__('Nueva publicación este día')" @click="emit('open-new', day)">+</button>
      </div>
      <button
        v-for="p in postsByDay[day.key] || []"
        :key="p.name"
        class="press mb-0.5 block w-full truncate rounded px-2 py-1 text-left text-[11.5px] font-medium"
        :class="[pillarChip(p.post_kind), p.status === 'Cancelado' ? 'line-through opacity-60' : '']"
        @click="emit('open-edit', p)"
      >
        <span class="mr-0.5 inline-flex items-center gap-px align-middle">
          <span v-if="p.evergreen" :title="__('Evergreen (rotable)')">♻</span>
          <span v-if="p.recycled_from" class="opacity-60" :title="__('Reciclado')">↺</span>
          <span v-for="cb in channelBadges(p.channels)" :key="cb.channel" class="inline-flex items-center" :title="cb.channel + ' · ' + cb.status">
            <span>{{ cb.emoji }}</span>
            <span class="ml-px inline-block size-1.5 shrink-0 rounded-full" :class="cb.dot" />
          </span>
        </span>{{ p.title || p.name }}
      </button>
    </div>
  </div>

  <div v-else class="p-4">
    <!-- weekday header -->
    <div class="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">
      <div v-for="d in WEEKDAYS" :key="d">{{ d }}</div>
    </div>
    <!-- month (42) or week (7) grid — same cells, driven by `days` length -->
    <div class="mt-1 grid grid-cols-7 gap-1">
      <div
        v-for="day in days"
        :key="day.key"
        class="min-h-[92px] rounded-lg border p-1 text-left"
        :class="[
          isBlackout(day)
            ? 'border-outline-gray-2 bg-surface-gray-3 opacity-60'
            : day.inMonth ? 'border-outline-gray-2 bg-surface-base' : 'border-transparent bg-surface-gray-1/50',
          dragOver === day.key ? 'ring-2 ring-green-400 dark:ring-green-500' : '',
          day.key < todayKey ? 'opacity-70' : '',
        ]"
        :title="isBlackout(day) ? __('Día bloqueado') : undefined"
        :data-testid="isBlackout(day) ? `cal-blackout-${day.key}` : `cal-day-${day.key}`"
        @click="emit('open-new', day)"
        @dragover.prevent="onDragOver(day)"
        @dragleave="dragOver = (dragOver === day.key ? '' : dragOver)"
        @drop="onDrop(day)"
      >
        <!-- season ribbons: label on the span's first visible day, emoji elsewhere -->
        <div
          v-for="rib in seasonByDay[day.key] || []" :key="rib.name"
          class="mb-0.5 truncate rounded-sm bg-surface-amber-1 px-1 text-[8.5px] font-semibold leading-tight text-ink-amber-7 dark:bg-amber-300/15 dark:text-amber-200"
          :title="rib.label"
        >{{ rib.isStart ? rib.label : rib.emoji }}</div>
        <div class="mb-0.5 text-[11px]" :class="day.isToday ? 'font-bold text-ink-green-7' : 'text-ink-gray-6'">
          <span v-if="isBlackout(day)" class="mr-0.5" :title="__('Día bloqueado')">🚫</span>{{ day.n }}
        </div>
        <div class="flex flex-col gap-0.5">
          <button
            v-for="p in (postsByDay[day.key] || [])"
            :key="p.name"
            draggable="true"
            class="truncate rounded px-1 py-0.5 text-left text-[10.5px] font-medium"
            :class="[pillarChip(p.post_kind), p.status === 'Cancelado' ? 'line-through opacity-60' : '']"
            :title="p.title + ' · ' + p.status + ' · ' + __('arrastra para reprogramar')"
            @click.stop="emit('open-edit', p)"
            @dragstart="dragged = p"
            @dragend="dragged = null"
          >
            <span class="mr-0.5 inline-flex items-center gap-px align-middle">
              <span v-if="p.evergreen" :title="__('Evergreen (rotable)')">♻</span>
              <span v-if="p.recycled_from" class="opacity-60" :title="__('Reciclado')">↺</span>
              <span v-for="cb in channelBadges(p.channels)" :key="cb.channel" class="inline-flex items-center" :title="cb.channel + ' · ' + cb.status">
                <span>{{ cb.emoji }}</span>
                <span class="ml-px inline-block size-1.5 shrink-0 rounded-full" :class="cb.dot" />
              </span>
            </span>{{ p.title || p.name }}
          </button>
        </div>
      </div>
    </div>

    <!-- pillar legend -->
    <div class="mt-3 flex flex-wrap items-center gap-1.5 text-[10.5px]">
      <span class="font-semibold text-ink-gray-5">{{ __('Tipo') }}:</span>
      <span v-for="pl in PILLARS" :key="pl.kind" class="rounded px-1.5 py-0.5 font-medium" :class="pl.chip">{{ pl.emoji }} {{ pl.kind }}</span>
    </div>
    <!-- channel status-dot legend -->
    <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[10.5px] text-ink-gray-6">
      <span class="font-semibold text-ink-gray-5">{{ __('Canal') }}:</span>
      <span v-for="sd in DOT_LEGEND" :key="sd.status" class="inline-flex items-center gap-1">
        <span class="inline-block size-1.5 rounded-full" :class="sd.dot" />{{ sd.label }}
      </span>
    </div>

    <!-- unscheduled drafts tray -->
    <div v-if="drafts.length" class="mt-4">
      <div class="mb-1 text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">{{ __('Borradores sin programar') }}</div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="p in drafts" :key="p.name"
          draggable="true"
          class="rounded-md px-2 py-1 text-[11.5px] font-medium"
          :class="[pillarChip(p.post_kind), p.status === 'Cancelado' ? 'line-through opacity-60' : '']"
          :title="__('arrastra a un día para fecharlo')"
          @click="emit('open-edit', p)"
          @dragstart="dragged = p"
          @dragend="dragged = null"
        >
          <span class="mr-0.5 inline-flex items-center gap-px align-middle">
            <span v-if="p.evergreen" :title="__('Evergreen (rotable)')">♻</span>
            <span v-if="p.recycled_from" class="opacity-60" :title="__('Reciclado')">↺</span>
            <span v-for="cb in channelBadges(p.channels)" :key="cb.channel" class="inline-flex items-center" :title="cb.channel + ' · ' + cb.status">
              <span>{{ cb.emoji }}</span>
              <span class="ml-px inline-block size-1.5 shrink-0 rounded-full" :class="cb.dot" />
            </span>
          </span>{{ p.title || p.name }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { createResource } from 'frappe-ui'
import { isMobile } from '@/composables/breakpoint'
import { WEEKDAYS, PILLARS, pillarChip, channelBadges, statusDot } from '@/composables/socialCalendar'

const props = defineProps({
  days: { type: Array, default: () => [] },
  postsByDay: { type: Object, default: () => ({}) },
  agendaDays: { type: Array, default: () => [] },
  drafts: { type: Array, default: () => [] },
  calView: { type: String, default: 'month' },
  seasonByDay: { type: Object, default: () => ({}) },
  todayKey: { type: String, default: '' },
})
const emit = defineEmits(['open-new', 'open-edit', 'reschedule'])

// list view (explicit) OR mobile (the grid is unreadable at phone widths)
const isList = computed(() => props.calView === 'list' || isMobile.value)

// ── blackout days (store-wide "no posting" days) — non-droppable + muted (B4) ──
// The composable is frozen, so the grid owns this resource; it fetches over its own
// visible range (props.days) and refetches when the shell shifts month/week.
const blackoutsRes = createResource({
  url: 'doco_marketing.api.social.get_blackouts',
  makeParams: () => ({ start: props.days[0]?.key, end: props.days[props.days.length - 1]?.key }),
  auto: true,
})
const blackoutSet = computed(() => new Set(blackoutsRes.data || []))
const isBlackout = (day) => blackoutSet.value.has(day.key)
watch(
  () => `${props.days[0]?.key}|${props.days[props.days.length - 1]?.key}`,
  () => blackoutsRes.reload(),
)

const DOT_LEGEND = [
  { status: 'Published', label: __('Publicada'), dot: statusDot('Published') },
  { status: 'Scheduled', label: __('Programada'), dot: statusDot('Scheduled') },
  { status: 'Failed', label: __('Falló'), dot: statusDot('Failed') },
  { status: 'Skipped', label: __('Omitido'), dot: statusDot('Skipped') },
]

// ── drag-reschedule (past AND blackout days are not droppable) ───────────────
const dragged = ref(null)
const dragOver = ref('')
function onDragOver(day) {
  if (day.key >= props.todayKey && !isBlackout(day)) dragOver.value = day.key
}
function onDrop(day) {
  dragOver.value = ''
  const p = dragged.value
  dragged.value = null
  if (!p || day.key < props.todayKey || isBlackout(day)) return
  emit('reschedule', { post: p, dayKey: day.key })
}
</script>
