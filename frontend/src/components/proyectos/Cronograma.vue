<template>
  <!-- Cronograma (Shell SPEC §7 DE7): one bar per dated pendiente, from its
       start day to its due day, over the project's weeks. Plain CSS grid, no
       chart library: the left column stays put while the days scroll. -->
  <div
    ref="scroller"
    class="overflow-x-auto rounded-7 border border-outline-gray-1"
    data-cronograma
  >
    <div
      v-if="model.days.length"
      class="grid"
      :style="{
        gridTemplateColumns: `${labelWidth} ${model.width}px`,
        width: 'max-content',
        minWidth: '100%',
      }"
    >
      <div
        class="sticky left-0 z-10 border-b border-outline-gray-1 bg-surface-base px-3 pb-1 pt-2 text-xs text-ink-gray-6"
      >
        {{ __('Pendiente') }}
      </div>
      <div class="border-b border-outline-gray-1">
        <div class="flex">
          <div
            v-for="month in model.months"
            :key="month.key"
            class="overflow-clip whitespace-nowrap border-l border-outline-gray-1 pt-1 text-xs text-ink-gray-6"
            :style="{ width: `${month.days * dayWidth}px` }"
          >
            <!-- The month name follows the scroll within its own days, so a
                 strip opened on today still says which month this is. -->
            <span
              class="sticky inline-block px-1.5"
              :style="{ left: labelWidth }"
              >{{ month.label }}</span
            >
          </div>
        </div>
        <div class="flex">
          <div
            v-for="entry in model.days"
            :key="entry.day"
            class="num pb-1 text-center text-[11px]"
            :class="[
              entry.weekend ? 'bg-surface-gray-1' : '',
              entry.today ? 'font-semibold text-ink-gray-9' : 'text-ink-gray-5',
            ]"
            :style="{ width: `${dayWidth}px` }"
          >
            {{ entry.label }}
          </div>
        </div>
      </div>
      <template v-if="model.project">
        <div
          class="sticky left-0 z-10 flex min-h-10 items-center truncate bg-surface-base px-3 text-sm font-semibold text-ink-gray-9"
        >
          {{ project?.project_name }}
        </div>
        <div class="relative min-h-10" data-cronograma-project>
          <span
            v-if="model.todayOffset !== null"
            class="absolute inset-y-0 w-px bg-surface-red-5"
            :style="{ left: `${model.todayOffset + dayWidth / 2}px` }"
            aria-hidden="true"
          />
          <span
            class="absolute top-3 h-4 rounded-full bg-surface-gray-3"
            :style="{
              left: `${model.project.left}px`,
              width: `${model.project.width}px`,
            }"
            aria-hidden="true"
          />
        </div>
      </template>
      <template v-for="bar in model.bars" :key="bar.key">
        <RouterLink
          :to="pendienteRoute(bar.row, query)"
          class="sticky left-0 z-10 flex min-h-11 items-center bg-surface-base px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          :class="
            bar.tone === 'done'
              ? 'text-ink-gray-5 line-through'
              : 'text-ink-gray-9'
          "
          :title="bar.row.description"
          :data-cronograma-row="bar.key"
        >
          <span class="truncate">{{ bar.row.description }}</span>
        </RouterLink>
        <div class="relative min-h-11">
          <span
            v-if="model.todayOffset !== null"
            class="absolute inset-y-0 w-px bg-surface-red-5"
            :style="{ left: `${model.todayOffset + dayWidth / 2}px` }"
            aria-hidden="true"
          />
          <span
            class="absolute top-3 h-5 rounded-full"
            :class="TONES[bar.tone]"
            :style="{ left: `${bar.left}px`, width: `${bar.width}px` }"
            :title="bar.label"
            :data-cronograma-bar="bar.tone"
          >
            <span class="sr-only">{{ bar.label }}</span>
          </span>
        </div>
      </template>
    </div>
    <p
      v-if="model.undated.length"
      class="px-3 py-2 text-sm text-ink-gray-6"
      data-cronograma-undated
    >
      {{
        __('{0} without a date; give them a day to see them here.', [
          model.undated.length,
        ])
      }}
    </p>
  </div>
</template>
<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { isMobile as phone } from '@/composables/breakpoint'
import { pendienteRoute } from '@/composables/usePendientes'
import { DAY_WIDTH, ganttModel, ganttScroll } from '@/composables/useProyectos'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  project: { type: Object, default: null },
  today: { type: String, default: '' },
  query: { type: Object, default: () => ({}) },
  dayWidth: { type: Number, default: DAY_WIDTH },
})
// Colour means state: the late bar is the one red thing, done bars go quiet.
const TONES = {
  open: 'bg-[var(--muelle-accent)]',
  late: 'border border-outline-red-3 bg-surface-red-2',
  done: 'bg-surface-gray-3',
}
const labelWidth = computed(() => (phone.value ? '9rem' : '14rem'))
const model = computed(() =>
  ganttModel(props.rows, props.project, props.today, {
    dayWidth: props.dayWidth,
  }),
)
// The strip opens on today, not on the earliest day: a project planned months
// ago would otherwise show empty rows until the worker scrolls. It settles
// again only when the window itself changes, never on a row edit.
const scroller = ref(null)
function settle() {
  if (scroller.value)
    scroller.value.scrollLeft = ganttScroll(model.value, props.dayWidth)
}
onMounted(settle)
watch(
  () => [model.value.from, model.value.to],
  () => nextTick(settle),
)
</script>
