<template>
  <!-- One pendiente, Google Tasks style: a round check that completes in one
       tap, the title, then only what matters (late, time, repeat, who handed
       it over), the subtasks and the linked record as chips, and a star.
       Long-press (phone) or the grip (desk) drags it to a new place. -->
  <article
    data-key-row
    :data-reorder-key="reorderable ? key : undefined"
    class="pd-row group relative flex items-start gap-3 border-b border-outline-gray-1 px-4 py-2.5 sm:px-6"
    :class="[
      selected ? 'bg-surface-gray-2' : fresh ? 'bg-surface-blue-1' : '',
      row.pending ? 'opacity-70' : '',
      completing ? 'pd-completing' : '',
    ]"
  >
    <span
      v-if="reorderable"
      data-drag-handle
      class="absolute left-0 top-3 hidden h-6 w-4 cursor-grab items-center justify-center text-ink-gray-4 opacity-0 transition-opacity group-hover:opacity-100 sm:left-1 [@media(hover:hover)]:flex"
      :title="__('Drag to reorder')"
      aria-hidden="true"
    >
      <Icon icon="grip-vertical" class="size-4" />
    </span>
    <button
      v-if="actionable"
      type="button"
      role="checkbox"
      :aria-checked="String(checked)"
      :aria-label="__('Mark done: {0}', [row.description])"
      class="pd-check -m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
      :disabled="busy || row.pending"
      data-row-complete
      @click="$emit('complete', row)"
    >
      <span
        class="pd-ring flex h-5 w-5 items-center justify-center rounded-full border-2"
        :class="
          checked
            ? 'border-transparent bg-surface-gray-9 text-ink-white'
            : 'border-outline-gray-4 [@media(hover:hover)]:group-hover:border-outline-gray-5'
        "
      >
        <svg
          v-if="checked"
          viewBox="0 0 24 24"
          class="pd-tick size-3.5"
          fill="none"
          stroke="currentColor"
          stroke-width="3.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength="1" />
        </svg>
      </span>
    </button>
    <!-- Someone else's work: their initials where the check would be. -->
    <span
      v-else-if="showAssignee && assignee"
      class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-gray-3 text-[10px] font-semibold text-ink-gray-8"
      aria-hidden="true"
      >{{ initials }}</span
    >
    <span v-else class="h-6 w-6 shrink-0" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <component
        :is="row.pending ? 'div' : RouterLink"
        :to="row.pending ? undefined : to"
        :aria-current="selected ? 'true' : undefined"
        data-row-link
        data-row-focus
        class="-my-2.5 block rounded-6 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
      >
        <p
          class="pd-title line-clamp-2 text-base text-ink-gray-9 [overflow-wrap:anywhere]"
          :class="checked ? 'text-ink-gray-5 line-through' : ''"
        >
          {{ row.description }}
        </p>
        <p
          v-if="metaShown"
          class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-gray-6"
        >
          <span
            v-if="due"
            :class="
              late
                ? 'rounded-4 bg-surface-red-1 px-1.5 font-medium text-ink-red-7'
                : dueToday
                  ? 'font-medium text-ink-gray-8'
                  : ''
            "
            ><span class="num">{{ due }}</span></span
          >
          <span v-if="row.repeat" role="img" :aria-label="__('Repeats')"
            ><Icon icon="repeat" class="size-3.5" aria-hidden="true"
          /></span>
          <span
            v-if="stateChip(row)"
            class="rounded-4 px-1.5 text-xs font-medium"
            :class="
              stateChip(row).tone === 'red'
                ? 'bg-surface-red-1 text-ink-red-7'
                : 'bg-surface-blue-1 text-ink-blue-7'
            "
            >{{ stateChip(row).label }}</span
          >
          <!-- The source only matters where sources mix (not in the team list). -->
          <span
            v-if="row.doctype === 'CRM Task' && !showAssignee"
            class="rounded-4 bg-surface-gray-2 px-1.5 text-xs text-ink-gray-7"
            >{{ sourceLabel(row) }}</span
          >
          <span v-if="row.from_name" class="truncate">{{
            __('From {0}', [row.from_name], 'Pendiente handed by')
          }}</span>
          <span v-if="showAssignee && !row.mine && assignee" class="truncate">
            {{ __('Assigned to {0}', [assignee]) }}</span
          >
        </p>
      </component>
      <!-- Subtasks and the linked record: chips that act without opening the row. -->
      <div
        v-if="steps.length || reference"
        class="mt-1.5 flex flex-wrap items-center gap-1.5"
      >
        <button
          v-if="steps.length"
          type="button"
          class="press inline-flex min-h-8 items-center gap-1 rounded-full bg-surface-gray-2 px-2.5 text-sm text-ink-gray-7"
          :aria-expanded="String(stepsOpen)"
          :aria-label="__('Subtasks {0}', [stepsText])"
          @click="stepsOpen = !stepsOpen"
        >
          <Icon icon="list-checks" class="size-3.5" aria-hidden="true" />
          <span class="num">{{ stepsText }}</span>
          <Icon
            icon="chevron-down"
            class="size-3.5 transition-transform duration-150"
            :class="stepsOpen ? 'rotate-180' : ''"
            aria-hidden="true"
          />
        </button>
        <component
          :is="reference.to ? RouterLink : 'a'"
          v-if="reference"
          :to="reference.to"
          :href="reference.href"
          class="press inline-flex min-h-8 max-w-full items-center gap-1 rounded-full bg-surface-gray-2 px-2.5 text-sm text-ink-gray-8"
          :title="__('Open {0}', [referenceText])"
          data-row-reference
        >
          <Icon icon="link" class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="truncate">{{ referenceText }}</span>
        </component>
      </div>
      <ExpandTransition>
        <ul v-if="stepsOpen && steps.length" class="mt-1 pb-1">
          <li v-for="step in steps" :key="step.index">
            <button
              type="button"
              role="checkbox"
              :aria-checked="String(step.checked)"
              class="flex min-h-10 w-full items-center gap-2.5 text-left text-sm disabled:cursor-default"
              :disabled="!actionable || busy || checked"
              @click="$emit('step', row, step)"
            >
              <span
                class="flex size-4 shrink-0 items-center justify-center rounded-full border-2"
                :class="
                  step.checked
                    ? 'border-transparent bg-surface-gray-7 text-ink-white'
                    : 'border-outline-gray-4'
                "
              >
                <svg
                  v-if="step.checked"
                  viewBox="0 0 24 24"
                  class="size-2.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3.5"
                  aria-hidden="true"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <span
                :class="
                  step.checked
                    ? 'text-ink-gray-5 line-through'
                    : 'text-ink-gray-8'
                "
                >{{ step.text }}</span
              >
            </button>
          </li>
        </ul>
      </ExpandTransition>
    </div>
    <!-- The star is «priority: high» (Google Tasks): on a starred row always,
         on others where a pointer hovers; the phone stars from the menu. -->
    <button
      v-if="actionable && !checked && (starred || hoverable)"
      type="button"
      class="press -my-1.5 flex size-9 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
      :class="
        starred
          ? 'text-ink-amber-6'
          : 'text-ink-gray-4 opacity-0 focus-visible:opacity-100 group-hover:opacity-100'
      "
      :aria-pressed="String(starred)"
      :aria-label="starred ? __('Remove star') : __('Star')"
      :title="starred ? __('Remove star') : __('Star')"
      :disabled="busy || row.pending"
      @click="$emit('star', row)"
    >
      <svg
        viewBox="0 0 24 24"
        class="size-5"
        :fill="starred ? 'currentColor' : 'none'"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
        />
      </svg>
    </button>
    <div
      v-if="actionable && row.status === 'Open' && !row.pending"
      class="-my-2 -mr-2 flex shrink-0 sm:-my-1 sm:mr-0"
    >
      <Dropdown :options="menu" align="end">
        <Button
          variant="ghost"
          class="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
          :icon="LucideEllipsis"
          :aria-label="__('More actions for {0}', [row.description])"
        />
      </Dropdown>
    </div>
  </article>
</template>
<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Button, Dropdown } from 'frappe-ui'
import Icon from '@/components/Icon.vue'
import ExpandTransition from '@/components/ui/ExpandTransition.vue'
import { kindLabel, personName } from '@/utils/display'
import {
  checklistText,
  datePresets,
  dueText,
  lateText,
  pendienteRoute,
  referenceTarget,
  sourceLabel,
  stateChip,
} from '@/composables/usePendientes'
import LucideCircleCheckBig from '~icons/lucide/circle-check-big'
import LucideCalendar from '~icons/lucide/calendar'
import LucideEllipsis from '~icons/lucide/ellipsis'
import LucideStar from '~icons/lucide/star'

const props = defineProps({
  row: { type: Object, required: true },
  today: { type: String, default: '' },
  query: { type: Object, default: () => ({}) },
  showAssignee: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  /** Desktop list + detail: the row opens beside the list, not on its own page. */
  link: { type: [Object, String], default: null },
  selected: { type: Boolean, default: false },
  /** Just arrived from a teammate (live list): a short highlight. */
  fresh: { type: Boolean, default: false },
  /** Ticked a moment ago: checked and struck through until it slides away. */
  completing: { type: Boolean, default: false },
  /** The worker may drag it (their own open work in an ordered list). */
  reorderable: { type: Boolean, default: false },
})
const emit = defineEmits([
  'complete',
  'completeNext',
  'reschedule',
  'star',
  'step',
])
const key = computed(() => `${props.row.doctype}:${props.row.name}`)
const to = computed(() => props.link || pendienteRoute(props.row, props.query))
const checked = computed(
  () => props.completing || props.row.status === 'Closed',
)
const starred = computed(() => props.row.priority === 'High')
// A pointer that hovers (desk) sees the star on every row; a finger uses the menu.
const hoverable =
  typeof globalThis.matchMedia === 'function' &&
  globalThis.matchMedia('(hover: hover)').matches
// The person, never the login («jeydici01@gmail.com»).
const assignee = computed(
  () => props.row.assigned_to_name || personName(props.row.assigned_to),
)
const initials = computed(() =>
  assignee.value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join(''),
)
// Team rows open read-only; the owner completes them.
const actionable = computed(() => props.row.mine && !props.row.cancelled)
// Red only while it is still late: a ticked row is done, not overdue.
const late = computed(() => props.row.group === 'overdue' && !checked.value)
const dueToday = computed(() => props.row.group === 'today')
// «Sin fecha» says nothing on a row; a dateless row shows no due at all.
const due = computed(() => {
  if (!props.row.date && !checked.value) return ''
  if (late.value) return lateText(props.row, props.today)
  return dueText(
    props.completing ? { ...props.row, status: 'Closed' } : props.row,
    props.today,
  )
})
const metaShown = computed(
  () =>
    Boolean(due.value) ||
    Boolean(props.row.repeat) ||
    Boolean(stateChip(props.row)) ||
    Boolean(props.row.from_name) ||
    (props.row.doctype === 'CRM Task' && !props.showAssignee) ||
    (props.showAssignee && !props.row.mine && Boolean(assignee.value)),
)
const steps = computed(() => props.row.steps || [])
const stepsText = computed(() => checklistText(steps.value))
const stepsOpen = ref(false)
const reference = computed(() =>
  props.row.reference_name ? referenceTarget(props.row) : null,
)
// «Trato · Ana López»: what the record is, then its name.
const referenceText = computed(() => {
  const name = props.row.reference_label || props.row.reference_name || ''
  const kind = kindLabel(props.row.reference_type)
  return kind && kind !== name ? `${kind} · ${name}` : name
})
const menu = computed(() => [
  {
    label: __('Done and schedule next'),
    icon: LucideCircleCheckBig,
    onClick: () => emit('completeNext', props.row),
  },
  {
    label: starred.value ? __('Remove star') : __('Star'),
    icon: LucideStar,
    onClick: () => emit('star', props.row),
  },
  ...datePresets(props.today)
    .filter((preset) => preset.value !== props.row.date)
    .map((preset) => ({
      label: __('Reschedule: {0}', [preset.label]),
      icon: LucideCalendar,
      onClick: () => emit('reschedule', props.row, preset.value),
    })),
])
</script>
<style scoped>
/* One tap, one answer: the ring fills and the tick draws itself (180 ms),
   then the list slides the row into «Completadas». */
.pd-completing .pd-ring {
  animation: pd-pop 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.pd-completing .pd-tick path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: pd-draw 160ms 60ms ease-out forwards;
}
@keyframes pd-pop {
  0% {
    transform: scale(0.7);
  }
  60% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes pd-draw {
  to {
    stroke-dashoffset: 0;
  }
}
.pd-check:active .pd-ring {
  transform: scale(0.88);
  transition: transform 100ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .pd-completing .pd-ring,
  .pd-completing .pd-tick path {
    animation: none;
    stroke-dashoffset: 0;
  }
}
</style>
