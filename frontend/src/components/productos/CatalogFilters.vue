<template>
  <!-- In a phone search panel (`touch`): each filter is a row of chips. -->
  <div v-if="touch" class="space-y-3" :aria-busy="loading || undefined">
    <ChipGroup
      v-if="sections.includes('stock') && facets?.stock !== null"
      :label="__('Stock', null, 'Productos')"
      :options="chipOptions(stockOptions)"
      :model-value="state.stock"
      testid="catalog-stock"
      @update:model-value="(value) => emit('update', { existencias: value })"
    />
    <ChipGroup
      v-if="sections.includes('photo')"
      :label="__('Photo', null, 'Productos')"
      :options="chipOptions(photoOptions)"
      :model-value="state.photo"
      testid="catalog-photo"
      @update:model-value="(value) => emit('update', { foto: value })"
    />
    <section v-if="sections.includes('group') && groups.length">
      <input
        v-if="groups.length > SHOWN"
        v-model="groupSearch"
        type="search"
        class="mb-1.5 h-11 w-full rounded-full border-0 bg-surface-gray-2 px-4 text-sm text-ink-gray-8 placeholder:text-ink-gray-5 focus:ring-1 focus:ring-outline-gray-3"
        :placeholder="__('Search group')"
        :aria-label="__('Search group')"
      />
      <ChipGroup
        :label="__('Group', null, 'Productos')"
        :options="
          matching.map((g) => ({
            value: g.value,
            label: g.value,
            count: g.count.toLocaleString(),
          }))
        "
        :model-value="state.group"
        :max="groupSearch ? 40 : SHOWN"
        testid="catalog-group"
        @update:model-value="(value) => emit('update', { grupo: value })"
      />
      <p
        v-if="groupSearch && !matching.length"
        class="py-1 text-sm text-ink-gray-6"
      >
        {{ __('No group matches «{0}».', [groupSearch]) }}
      </p>
    </section>
  </div>
  <div v-else class="space-y-5" :aria-busy="loading || undefined">
    <!-- In the «Filtros» sheet the sheet has the title and «Borrar filtros». -->
    <div v-if="!touch" class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-ink-gray-9">
        {{ __('Filters', null, 'Productos') }}
      </h2>
      <button
        v-if="active"
        type="button"
        class="rounded-4 px-1.5 text-xs text-ink-gray-6 hover:text-ink-gray-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
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
      <legend class="mb-1 text-sm text-ink-gray-6">
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
      <legend class="mb-1 text-sm text-ink-gray-6">
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
        <Icon
          :icon="option.icon"
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
        class="mb-1 flex w-full items-center justify-between text-sm text-ink-gray-6"
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
        class="mb-1 w-full rounded-5 border border-outline-gray-2 bg-surface-base px-2 text-sm text-ink-gray-8 placeholder:text-ink-gray-4 focus:border-outline-gray-4 focus:ring-0"
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
        class="mt-1 w-full rounded-5 px-2 text-left text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2"
        :class="touch ? 'min-h-11' : 'min-h-8'"
        @click="showAll = true"
      >
        {{ __('See all · {0} more', [hiddenCount]) }}
      </button>
      <button
        v-else-if="showAll && !groupSearch && groups.length > SHOWN"
        type="button"
        class="mt-1 w-full rounded-5 px-2 text-left text-sm text-ink-gray-6 hover:bg-surface-gray-2"
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
import { groupFacets } from '@/composables/useProductos'
import Icon from '@/components/Icon.vue'
import ChipGroup from '@/components/ui/ChipGroup.vue'
import { matchTokens } from '@/vendor/muelle-shell/contracts/search'

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
// ERPNext's root group is not one to pick: «Todos los grupos» counts it.
const facetGroups = computed(() => props.facets?.groups || [])
const groups = computed(() => groupFacets(facetGroups.value))
const allGroups = computed(() =>
  facetGroups.value.length
    ? facetGroups.value.reduce((sum, g) => sum + g.count, 0).toLocaleString()
    : '',
)
// The shell's search rule: any word order, accent-blind (contracts/search).
const matching = computed(() =>
  groupSearch.value.trim()
    ? groups.value.filter((g) => matchTokens(groupSearch.value, g.value))
    : groups.value,
)
// Chips leave out «All»: tapping the picked chip again clears it.
const chipOptions = (options) =>
  options
    .filter((o) => o.value)
    .map((o) => ({ value: o.value, label: o.label, count: o.count || null }))
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
    'flex w-full items-center gap-2 rounded-5 px-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link',
    props.touch ? 'min-h-11' : 'min-h-8',
    on
      ? 'bg-surface-gray-3 font-medium text-ink-gray-9'
      : 'text-ink-gray-7 hover:bg-surface-gray-2',
  ]
}
</script>
