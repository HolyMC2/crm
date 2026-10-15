<template>
  <div class="space-y-5" :aria-busy="loading || undefined">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-ink-gray-9">
        {{ __('Filters', null, 'Productos') }}
      </h2>
      <button
        v-if="active"
        type="button"
        class="rounded px-1.5 text-xs text-ink-gray-6 hover:text-ink-gray-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
        :class="touch ? 'min-h-11' : 'min-h-7'"
        @click="emit('update', { grupo: '', existencias: '', foto: '' })"
      >
        {{ __('Clear filters') }}
      </button>
    </div>

    <fieldset
      v-if="sections.includes('stock') && facets?.stock !== null"
      class="min-w-0"
    >
      <legend
        class="mb-1 text-xs font-medium uppercase tracking-wide text-ink-gray-5"
      >
        {{ __('Stock', null, 'Productos') }}
      </legend>
      <button
        v-for="option in stockOptions"
        :key="option.value"
        type="button"
        :class="optionClass(state.stock === option.value)"
        :aria-pressed="state.stock === option.value"
        @click="emit('update', { existencias: option.value })"
      >
        <span
          class="h-2 w-2 shrink-0 rounded-full"
          :class="option.dot"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
        <span class="shrink-0 text-xs tabular-nums text-ink-gray-5">{{
          option.count
        }}</span>
      </button>
    </fieldset>

    <fieldset v-if="sections.includes('photo')" class="min-w-0">
      <legend
        class="mb-1 text-xs font-medium uppercase tracking-wide text-ink-gray-5"
      >
        {{ __('Photo', null, 'Productos') }}
      </legend>
      <button
        v-for="option in photoOptions"
        :key="option.value"
        type="button"
        :class="optionClass(state.photo === option.value)"
        :aria-pressed="state.photo === option.value"
        @click="emit('update', { foto: option.value })"
      >
        <FeatherIcon
          :name="option.icon"
          class="h-4 w-4 shrink-0 text-ink-gray-5"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
        <span class="shrink-0 text-xs tabular-nums text-ink-gray-5">{{
          option.count
        }}</span>
      </button>
    </fieldset>

    <fieldset class="min-w-0">
      <legend
        class="mb-1 flex w-full items-center justify-between text-xs font-medium uppercase tracking-wide text-ink-gray-5"
      >
        <span>{{ __('Group', null, 'Productos') }}</span>
        <span v-if="groups.length" class="tabular-nums normal-case">{{
          groups.length.toLocaleString()
        }}</span>
      </legend>
      <input
        v-if="groups.length > SHOWN"
        v-model="groupSearch"
        type="search"
        class="mb-1 w-full rounded-md border border-outline-gray-2 bg-surface-white px-2 text-sm text-ink-gray-8 placeholder:text-ink-gray-4 focus:border-outline-gray-4 focus:ring-0"
        :class="touch ? 'h-11' : 'h-8'"
        :placeholder="__('Search group')"
        :aria-label="__('Search group')"
      />
      <button
        type="button"
        :class="optionClass(!state.group)"
        :aria-pressed="!state.group"
        @click="emit('update', { grupo: '' })"
      >
        <span class="min-w-0 flex-1 truncate">{{ __('All groups') }}</span>
        <span class="shrink-0 text-xs tabular-nums text-ink-gray-5">{{
          allGroups
        }}</span>
      </button>
      <button
        v-for="group in visibleGroups"
        :key="group.value"
        type="button"
        :class="optionClass(state.group === group.value)"
        :aria-pressed="state.group === group.value"
        :title="group.value"
        @click="emit('update', { grupo: group.value })"
      >
        <span
          class="line-clamp-2 min-w-0 flex-1 break-words py-1 leading-snug"
          >{{ group.value }}</span
        >
        <span class="shrink-0 text-xs tabular-nums text-ink-gray-5">{{
          group.count.toLocaleString()
        }}</span>
      </button>
      <p
        v-if="groupSearch && !visibleGroups.length"
        class="px-2 py-1 text-sm text-ink-gray-6"
      >
        {{ __('No group matches «{0}».', [groupSearch]) }}
      </p>
      <button
        v-if="hiddenCount > 0"
        type="button"
        class="mt-1 w-full rounded-md px-2 text-left text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2"
        :class="touch ? 'min-h-11' : 'min-h-8'"
        @click="showAll = true"
      >
        {{ __('See all · {0} more', [hiddenCount]) }}
      </button>
      <button
        v-else-if="showAll && !groupSearch && groups.length > SHOWN"
        type="button"
        class="mt-1 w-full rounded-md px-2 text-left text-sm text-ink-gray-6 hover:bg-surface-gray-2"
        :class="touch ? 'min-h-11' : 'min-h-8'"
        @click="showAll = false"
      >
        {{ __('See fewer') }}
      </button>
    </fieldset>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { FeatherIcon } from 'frappe-ui'

// «Todos» as a catalogue: what is on hand, what has a photo and which group,
// each choice with how many products it leaves (the other filters applied).
const props = defineProps({
  facets: { type: Object, default: null },
  state: { type: Object, required: true },
  loading: { type: Boolean, default: false },
  touch: { type: Boolean, default: false },
  sections: { type: Array, default: () => ['stock', 'photo', 'group'] },
})
const emit = defineEmits(['update'])
const SHOWN = 10
const groupSearch = ref('')
const showAll = ref(false)

const count = (value) =>
  value === undefined || value === null ? '' : Number(value).toLocaleString()
const active = computed(
  () => props.state.group || props.state.stock || props.state.photo,
)
const stockOptions = computed(() => [
  {
    value: '',
    label: __('All', null, 'Productos'),
    dot: 'bg-surface-gray-4',
    count: '',
  },
  {
    value: 'con',
    label: __('With stock'),
    dot: 'bg-surface-green-3',
    count: count(props.facets?.stock?.con),
  },
  {
    value: 'sin',
    label: __('Sold out'),
    dot: 'bg-surface-red-7',
    count: count(props.facets?.stock?.sin),
  },
])
const photoOptions = computed(() => [
  {
    value: '',
    label: __('All', null, 'Productos'),
    icon: 'layers',
    count: '',
  },
  {
    value: 'con',
    label: __('With photo'),
    icon: 'image',
    count: count(props.facets?.photo?.con),
  },
  {
    value: 'sin',
    label: __('Without photo'),
    icon: 'camera-off',
    count: count(props.facets?.photo?.sin),
  },
])
const groups = computed(() => props.facets?.groups || [])
const allGroups = computed(() =>
  groups.value.length
    ? groups.value.reduce((sum, g) => sum + g.count, 0).toLocaleString()
    : '',
)
const matching = computed(() => {
  const needle = groupSearch.value.trim().toLocaleLowerCase()
  return needle
    ? groups.value.filter((g) => g.value.toLocaleLowerCase().includes(needle))
    : groups.value
})
const visibleGroups = computed(() => {
  if (groupSearch.value || showAll.value) return matching.value
  const top = matching.value.slice(0, SHOWN)
  // The chosen group always stays in sight.
  const chosen = groups.value.find((g) => g.value === props.state.group)
  return chosen && !top.includes(chosen) ? [chosen, ...top] : top
})
const hiddenCount = computed(() =>
  groupSearch.value || showAll.value
    ? 0
    : Math.max(0, matching.value.length - visibleGroups.value.length),
)
function optionClass(on) {
  return [
    'flex w-full items-center gap-2 rounded-md px-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link',
    props.touch ? 'min-h-11' : 'min-h-8',
    on
      ? 'bg-surface-gray-3 font-medium text-ink-gray-9'
      : 'text-ink-gray-7 hover:bg-surface-gray-2',
  ]
}
</script>
