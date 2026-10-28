<template>
  <!-- Phone: the module's own app bar (route meta.ownPhoneHeader). A thin
       wrapper over the shared AppBar (S1.1): the title reads «Módulo · Lista»
       and opens the lists sheet; search, select and the bell come with the
       bar; what matters stays in sight under it while the list scrolls. The
       data-power-* hooks are the pages' contract (their tests read them). -->
  <AppBar
    data-power-appbar
    :title="title || heading"
    :count="count"
    :loading="loading"
    :searchable="searchable"
    :search="search"
    :search-open="searchOpen"
    :search-label="searchLabel"
    :search-input-attrs="{ 'data-power-search': '' }"
    :selectable="selectable"
    :select-label="selectLabel"
    :selecting="selecting"
    :selected-count="selectedCount"
    @update:search="(value) => emit('update:search', value)"
    @update:search-open="(value) => emit('update:searchOpen', value)"
    @start-select="emit('start-select')"
    @select-all="emit('select-all')"
    @clear-selection="emit('clear-selection')"
  >
    <template #title>
      <button
        type="button"
        class="flex min-h-12 min-w-0 flex-1 items-center gap-1 rounded-6 px-3 text-left"
        :aria-label="__('Choose a list')"
        :aria-expanded="listSheet"
        data-power-title
        @click="listSheet = true"
      >
        <!-- The module in one small line, the list as the page's heading. -->
        <span class="flex min-w-0 flex-col">
          <span
            v-if="moduleName && title"
            class="truncate text-sm leading-tight text-ink-gray-6"
            >{{ moduleName }}</span
          >
          <span
            class="title-face line-clamp-2 min-w-0 break-words text-3xl font-semibold leading-tight [text-wrap:balance] max-[359px]:text-2xl"
            >{{ title || moduleName
            }}<span
              v-if="count !== undefined && count !== null && count !== ''"
              class="num ml-1.5 text-xl font-normal text-ink-gray-6"
              >{{ count }}</span
            ></span
          >
        </span>
        <LucideChevronDown class="h-5 w-5 shrink-0 text-ink-gray-6" />
      </button>
    </template>
    <template #actions>
      <slot name="actions" />
    </template>
    <template v-if="$slots.summary" #summary>
      <div data-power-summary class="contents">
        <slot name="summary" />
      </div>
    </template>
  </AppBar>

  <!-- The lists, in a sheet from the app bar's title. -->
  <BottomSheet
    :open="listSheet"
    :title="''"
    :aria-label="__('Choose a list')"
    @update:open="(value) => (listSheet = value)"
  >
    <nav class="px-3 pb-6" :aria-label="__('Choose a list')">
      <button
        v-for="entry in entries"
        :key="entry.value"
        type="button"
        class="flex min-h-14 w-full items-center gap-3 rounded-7 px-4 text-left text-base"
        :class="
          active === entry.value
            ? 'bg-surface-gray-2 font-semibold'
            : 'hover:bg-surface-gray-1'
        "
        :aria-current="active === entry.value ? 'page' : undefined"
        @click="choose(entry.value)"
      >
        <Icon
          v-if="entry.icon"
          :icon="entry.icon"
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
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { BottomSheet } from 'frappe-ui'
import { AppBar } from '@/components/ui'
import Icon from '@/components/Icon.vue'
import LucideChevronDown from '~icons/lucide/chevron-down'

const props = defineProps({
  title: { type: String, default: '' },
  /** The module's name above the list: «Cobranza». Defaults to the page's route title. */
  context: { type: String, default: '' },
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
const route = useRoute()
const listSheet = ref(false)

// «Cobranza · Vencido»: the module, then the list the worker is on.
const moduleName = computed(() => props.context || route?.meta?.title || '')
const heading = computed(() =>
  [moduleName.value, props.title].filter(Boolean).join(' · '),
)

function choose(value) {
  listSheet.value = false
  emit('select', value)
}
</script>
