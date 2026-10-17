<template>
  <!-- The one phone top app bar (Shell SPEC §2.2.1), grown from PowerAppBar:
       up/back · title (optionally a scope picker) · ≤3 icon actions · bell.
       The title wraps to two lines and never collapses to a letter: when the
       icons leave it too little room it moves to its own row (M3 medium bar). -->
  <header
    ref="bar"
    class="sticky top-0 z-20 border-b border-outline-gray-1 bg-surface-base pt-[env(safe-area-inset-top)]"
    data-appbar
  >
    <div class="flex min-h-14 items-center gap-1 px-1">
      <template v-if="selecting">
        <button
          type="button"
          :class="ICON_BUTTON"
          :aria-label="__('Clear selection')"
          @click="$emit('clear-selection')"
        >
          <span class="lucide-x size-6" aria-hidden="true" />
        </button>
        <p class="min-w-0 flex-1 truncate px-1 text-lg font-semibold">
          {{
            selectedCount === 1
              ? __('1 selected')
              : __('{0} selected', [selectedCount])
          }}
        </p>
        <slot name="selection-actions" />
        <button
          type="button"
          :class="ICON_BUTTON"
          :aria-label="__('Select the visible page')"
          @click="$emit('select-all')"
        >
          <span class="lucide-square-check-big size-6" aria-hidden="true" />
        </button>
      </template>
      <template v-else-if="searchOpen && searchable">
        <button
          type="button"
          :class="ICON_BUTTON"
          :aria-label="__('Close search')"
          @click="closeSearch"
        >
          <span class="lucide-arrow-left size-6" aria-hidden="true" />
        </button>
        <input
          ref="input"
          :value="search"
          type="search"
          enterkeyhint="search"
          class="h-11 min-w-0 flex-1 rounded-full border-0 bg-surface-gray-2 px-4 text-base [&::-webkit-search-cancel-button]:hidden"
          :placeholder="searchLabel || __('Search')"
          :aria-label="searchLabel || __('Search')"
          data-appbar-search
          @input="$emit('update:search', $event.target.value)"
        />
        <button
          v-if="search"
          type="button"
          :class="ICON_BUTTON"
          :aria-label="__('Clear search')"
          @click="clearSearch"
        >
          <span class="lucide-x size-6" aria-hidden="true" />
        </button>
      </template>
      <template v-else>
        <UiTag
          v-if="back"
          :as="backTarget ? RouterLink : 'button'"
          :to="backTarget || undefined"
          :type="backTarget ? undefined : 'button'"
          :class="ICON_BUTTON"
          :aria-label="backLabel || __('Back')"
          data-appbar-back
          @click="onBack"
        >
          <span class="lucide-arrow-left size-6" aria-hidden="true" />
        </UiTag>
        <div v-if="!stacked" class="flex min-w-0 flex-1">
          <slot name="title">
            <AppBarTitle v-bind="titleProps" @pick="scopeSheet = true" />
          </slot>
        </div>
        <span v-else class="flex-1" />
        <span
          v-if="loading"
          class="lucide-loader-circle size-5 flex-none animate-spin text-ink-gray-6"
          role="status"
          :aria-label="__('Loading')"
        />
        <div ref="icons" class="flex flex-none items-center">
          <slot name="actions" />
          <button
            v-if="searchable"
            type="button"
            :class="ICON_BUTTON"
            :aria-label="searchLabel || __('Search')"
            data-appbar-search-open
            @click="$emit('update:searchOpen', true)"
          >
            <span class="lucide-search size-6" aria-hidden="true" />
          </button>
          <button
            v-if="selectable"
            type="button"
            :class="ICON_BUTTON"
            :aria-label="selectLabel || __('Select')"
            @click="$emit('start-select')"
          >
            <span class="lucide-square-check-big size-6" aria-hidden="true" />
          </button>
          <AvisosBell v-if="showBell" />
        </div>
      </template>
    </div>
    <!-- Narrow screens: the title gets its own full-width row. -->
    <div
      v-if="stacked && !selecting && !(searchOpen && searchable)"
      class="flex px-1 pb-2"
    >
      <slot name="title">
        <AppBarTitle v-bind="titleProps" @pick="scopeSheet = true" />
      </slot>
    </div>
    <!-- What matters in this list, in sight while it scrolls. -->
    <div
      v-if="$slots.summary"
      class="flex flex-wrap gap-x-4 gap-y-1 border-t border-outline-gray-1 px-4 py-2 text-sm"
      data-appbar-summary
    >
      <slot name="summary" />
    </div>
    <!-- The title's scope sheet: the lists (or views) this screen can show. -->
    <BottomSheet
      v-if="scopes.length"
      v-model:open="scopeSheet"
      :title="scopeTitle || __('Choose a list')"
      flush
    >
      <nav class="px-2 pb-3" :aria-label="scopeTitle || __('Choose a list')">
        <button
          v-for="entry in scopes"
          :key="entry.value"
          type="button"
          class="flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-base"
          :class="
            scope === entry.value
              ? 'bg-surface-gray-2 font-semibold'
              : 'hover:bg-surface-gray-1'
          "
          :aria-current="scope === entry.value ? 'true' : undefined"
          @click="choose(entry.value)"
        >
          <span
            v-if="entry.icon"
            :class="[entry.icon, 'size-5 flex-none text-ink-gray-6']"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 break-words">{{ entry.label }}</span>
          <span
            v-if="entry.count !== undefined && entry.count !== null"
            class="tabular-nums text-ink-gray-6"
            >{{ entry.count }}</span
          >
        </button>
      </nav>
    </BottomSheet>
  </header>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
import { shellBoot } from '@/composables/muelleShell'
import BottomSheet from './BottomSheet.vue'
import UiTag from './UiTag'

const AvisosBell = defineAsyncComponent(
  () => import('@/components/avisos/AvisosBell.vue'),
)

const ICON_BUTTON =
  'flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2'

const props = defineProps({
  title: { type: String, default: '' },
  /** Where the title sits, in one short line above it: the module («Cobranza»). */
  context: { type: String, default: '' },
  count: { type: [Number, String], default: undefined },
  /** Up/back: a route location (up to the parent list), or true for history back. */
  back: { type: [Boolean, String, Object], default: false },
  backLabel: { type: String, default: '' },
  /** With entries, the title opens a sheet to switch list: [{ value, label, count?, icon? }]. */
  scopes: { type: Array, default: () => [] },
  scope: { type: String, default: '' },
  scopeTitle: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  searchable: { type: Boolean, default: false },
  search: { type: String, default: '' },
  searchOpen: { type: Boolean, default: false },
  searchLabel: { type: String, default: '' },
  selectable: { type: Boolean, default: false },
  selectLabel: { type: String, default: '' },
  selecting: { type: Boolean, default: false },
  selectedCount: { type: Number, default: 0 },
  /** The Avisos bell is part of every bar; turn it off only where the bar is inside a sheet. */
  bell: { type: Boolean, default: true },
})
const emit = defineEmits([
  'back',
  'update:scope',
  'update:search',
  'update:searchOpen',
  'start-select',
  'select-all',
  'clear-selection',
])

const router = useRouter()
const input = ref(null)
const bar = ref(null)
const icons = ref(null)
const scopeSheet = ref(false)
const stacked = ref(false)

const showBell = computed(
  () => props.bell && moduleEnabled(shellBoot.value, 'avisos'),
)
const backTarget = computed(() =>
  props.back && props.back !== true ? props.back : null,
)
const titleProps = computed(() => ({
  title: props.title,
  context: props.context,
  count: props.count,
  pickable: props.scopes.length > 0,
  open: scopeSheet.value,
  pickLabel: props.scopeTitle || __('Choose a list'),
}))

function onBack(event) {
  emit('back', event)
  if (backTarget.value || event.defaultPrevented) return
  if (window.history.state?.back) router.back()
  else router.push('/')
}
function choose(value) {
  scopeSheet.value = false
  emit('update:scope', value)
}
function closeSearch() {
  emit('update:searchOpen', false)
  if (props.search) emit('update:search', '')
}
function clearSearch() {
  emit('update:search', '')
  input.value?.focus()
}
watch(
  () => props.searchOpen,
  (open) => {
    if (open) nextTick(() => input.value?.focus())
  },
  { immediate: true },
)

// The title needs about 9rem beside the icons; below that it takes its own row.
const TITLE_MIN = 144
let observer = null
function measure() {
  const width = bar.value?.clientWidth || 0
  if (!width || !icons.value) return
  const used =
    icons.value.offsetWidth +
    (props.back ? 48 : 0) +
    (props.loading ? 24 : 0) +
    16 // the row's padding and gaps
  stacked.value = width - used < TITLE_MIN
}
// The icons mount only in the normal mode (not while selecting or
// searching): observe them whenever they (re)appear.
watch(
  icons,
  (el) => {
    observer?.disconnect()
    if (typeof ResizeObserver !== 'undefined' && bar.value) {
      observer = new ResizeObserver(measure)
      observer.observe(bar.value)
      if (el) observer.observe(el)
    }
    measure()
  },
  { flush: 'post' },
)
watch(() => [props.loading, props.back], measure, { flush: 'post' })
onMounted(measure)
onBeforeUnmount(() => observer?.disconnect())

// The title: plain, or a button that opens the scope sheet.
const AppBarTitle = (attrs, { emit: emitTitle }) => {
  const count =
    attrs.count !== undefined && attrs.count !== null && attrs.count !== ''
      ? h(
          'span',
          { class: 'ml-1 font-normal text-ink-gray-6' },
          `(${attrs.count})`,
        )
      : null
  const heading = h(
    'span',
    {
      class:
        'line-clamp-2 break-words text-lg font-semibold leading-snug [text-wrap:balance]',
      'data-appbar-title': '',
    },
    [attrs.title, count],
  )
  const context = attrs.context
    ? h(
        'span',
        { class: 'truncate text-sm leading-tight text-ink-gray-6' },
        attrs.context,
      )
    : null
  const text = h('span', { class: 'flex min-w-0 flex-col' }, [context, heading])
  if (!attrs.pickable)
    return h('div', { class: 'flex min-h-12 min-w-0 items-center px-3' }, [
      text,
    ])
  return h(
    'button',
    {
      type: 'button',
      class:
        'flex min-h-12 min-w-0 items-center gap-1 rounded-xl px-3 text-left hover:bg-surface-gray-1',
      'aria-haspopup': 'dialog',
      'aria-expanded': String(!!attrs.open),
      title: attrs.pickLabel,
      onClick: () => emitTitle('pick'),
    },
    [
      text,
      h('span', {
        class: 'lucide-chevron-down size-5 flex-none text-ink-gray-6',
        'aria-hidden': 'true',
      }),
    ],
  )
}
AppBarTitle.props = [
  'title',
  'context',
  'count',
  'pickable',
  'open',
  'pickLabel',
]
AppBarTitle.emits = ['pick']
</script>
