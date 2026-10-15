<template>
  <!-- Phone: the module's own app bar (route meta.ownPhoneHeader), like the
       Agenda's and Cobranza's: the list as its title (tap: choose another),
       search, select; what matters stays in sight under it while the list
       scrolls. -->
  <header
    class="sticky top-0 z-20 border-b border-outline-gray-1 bg-surface-base pt-[env(safe-area-inset-top)]"
    data-power-appbar
  >
    <div class="flex min-h-14 items-center gap-1 px-1">
      <template v-if="selecting">
        <button
          type="button"
          class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
          :aria-label="__('Clear selection')"
          @click="$emit('clear-selection')"
        >
          <FeatherIcon name="x" class="h-6 w-6" />
        </button>
        <p class="min-w-0 flex-1 truncate text-lg font-semibold">
          {{
            selectedCount === 1
              ? __('1 selected')
              : __('{0} selected', [selectedCount])
          }}
        </p>
        <button
          type="button"
          class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
          :aria-label="__('Select the visible page')"
          @click="$emit('select-all')"
        >
          <FeatherIcon name="check-square" class="h-6 w-6" />
        </button>
      </template>
      <template v-else-if="searchOpen && searchable">
        <button
          type="button"
          class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
          :aria-label="__('Close search')"
          @click="closeSearch"
        >
          <FeatherIcon name="arrow-left" class="h-6 w-6" />
        </button>
        <input
          ref="input"
          :value="search"
          type="search"
          enterkeyhint="search"
          class="h-11 min-w-0 flex-1 rounded-lg border-0 bg-surface-gray-2 px-3 text-base"
          :placeholder="searchLabel"
          :aria-label="searchLabel"
          data-power-search
          @input="$emit('update:search', $event.target.value)"
        />
      </template>
      <template v-else>
        <button
          type="button"
          class="flex min-h-12 min-w-0 flex-1 items-center gap-1 rounded-lg px-3 text-left"
          :aria-label="__('Choose a list')"
          :aria-expanded="listSheet"
          data-power-title
          @click="listSheet = true"
        >
          <span class="truncate text-lg font-semibold">{{ title }}</span>
          <span
            v-if="count !== undefined && count !== null && count !== ''"
            class="shrink-0 text-base text-ink-gray-6"
            >({{ count }})</span
          >
          <FeatherIcon
            name="chevron-down"
            class="h-5 w-5 shrink-0 text-ink-gray-6"
          />
        </button>
        <FeatherIcon
          v-if="loading"
          name="loader"
          class="h-5 w-5 shrink-0 animate-spin text-ink-gray-6"
          role="status"
          :aria-label="__('Loading')"
        />
        <slot name="actions" />
        <button
          v-if="searchable"
          type="button"
          class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
          :aria-label="searchLabel"
          @click="$emit('update:searchOpen', true)"
        >
          <FeatherIcon name="search" class="h-6 w-6" />
        </button>
        <button
          v-if="selectable"
          type="button"
          class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
          :aria-label="selectLabel"
          @click="$emit('start-select')"
        >
          <FeatherIcon name="check-square" class="h-6 w-6" />
        </button>
      </template>
    </div>
    <!-- What matters in this list, always in sight while it scrolls. -->
    <div
      v-if="$slots.summary"
      class="flex flex-wrap gap-x-4 border-t border-outline-gray-1 px-4 py-2 text-sm"
      data-power-summary
    >
      <slot name="summary" />
    </div>
  </header>

  <!-- The lists, in a sheet from the app bar's title. -->
  <BottomSheet
    :open="listSheet"
    :title="''"
    @update:open="(value) => (listSheet = value)"
  >
    <nav class="px-3 pb-6" :aria-label="__('Choose a list')">
      <button
        v-for="entry in entries"
        :key="entry.value"
        type="button"
        class="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-base"
        :class="
          active === entry.value
            ? 'bg-surface-gray-2 font-semibold'
            : 'hover:bg-surface-gray-1'
        "
        :aria-current="active === entry.value ? 'page' : undefined"
        @click="choose(entry.value)"
      >
        <FeatherIcon
          v-if="entry.icon"
          :name="entry.icon"
          class="h-5 w-5 text-ink-gray-6"
        />
        <span class="flex-1">{{ entry.title || entry.label }}</span>
        <span class="tabular-nums text-ink-gray-6">{{
          entry.count ?? ''
        }}</span>
      </button>
    </nav>
  </BottomSheet>
</template>
<script setup>
import { nextTick, ref, watch } from 'vue'
import { BottomSheet, FeatherIcon } from 'frappe-ui'

const props = defineProps({
  title: { type: String, default: '' },
  count: { type: [Number, String], default: undefined },
  loading: { type: Boolean, default: false },
  entries: { type: Array, default: () => [] },
  active: { type: String, default: '' },
  search: { type: String, default: '' },
  searchOpen: { type: Boolean, default: false },
  searchable: { type: Boolean, default: true },
  searchLabel: { type: String, default: '' },
  selectable: { type: Boolean, default: false },
  selectLabel: { type: String, default: '' },
  selecting: { type: Boolean, default: false },
  selectedCount: { type: Number, default: 0 },
})
const emit = defineEmits([
  'select',
  'update:search',
  'update:searchOpen',
  'start-select',
  'select-all',
  'clear-selection',
])
const input = ref(null)
const listSheet = ref(false)

function choose(value) {
  listSheet.value = false
  emit('select', value)
}
function closeSearch() {
  emit('update:searchOpen', false)
  if (props.search) emit('update:search', '')
}
watch(
  () => props.searchOpen,
  (open) => {
    if (open) nextTick(() => input.value?.focus())
  },
  { immediate: true },
)
</script>
