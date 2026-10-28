<!-- Vendored from muelle/workspace/packages/ui@0.1.0 (ce74d3b9f43a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
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
          :aria-label="t('Clear selection')"
          @click="$emit('clear-selection')"
        >
          <span class="lucide-x size-6" aria-hidden="true" />
        </button>
        <p class="min-w-0 flex-1 truncate px-1 text-lg font-semibold">
          {{
            selectedCount === 1
              ? t('1 selected')
              : t('{0} selected', [selectedCount])
          }}
        </p>
        <slot name="selection-actions" />
        <button
          type="button"
          :class="ICON_BUTTON"
          :aria-label="t('Select the visible page')"
          @click="$emit('select-all')"
        >
          <span class="lucide-square-check-big size-6" aria-hidden="true" />
        </button>
      </template>
      <template v-else-if="searchOpen && searchable">
        <button
          type="button"
          :class="ICON_BUTTON"
          :aria-label="t('Close search')"
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
          :placeholder="searchLabel || t('Search')"
          :aria-label="searchLabel || t('Search')"
          v-bind="searchInputAttrs"
          data-appbar-search
          @input="$emit('update:search', $event.target.value)"
        />
        <button
          v-if="search"
          type="button"
          :class="ICON_BUTTON"
          :aria-label="t('Clear search')"
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
          :aria-label="backLabel || t('Back')"
          data-appbar-back
          @click="onBack"
        >
          <span class="lucide-arrow-left size-6" aria-hidden="true" />
        </UiTag>
        <div v-if="!stacked" class="flex min-w-0 flex-1">
          <slot name="title">
            <AppBarTitle v-bind="titleProps" @pick="pick" />
          </slot>
        </div>
        <span v-else class="flex-1" />
        <span
          v-if="loading"
          class="lucide-loader-circle size-5 flex-none animate-spin text-ink-gray-6"
          role="status"
          :aria-label="t('Loading')"
        />
        <div ref="icons" class="flex flex-none items-center">
          <slot name="actions" />
          <button
            v-if="searchable"
            type="button"
            :class="ICON_BUTTON"
            :aria-label="searchLabel || t('Search')"
            data-appbar-search-open
            @click="$emit('update:searchOpen', true)"
          >
            <span class="lucide-search size-6" aria-hidden="true" />
          </button>
          <button
            v-if="selectable"
            type="button"
            :class="ICON_BUTTON"
            :aria-label="selectLabel || t('Select')"
            @click="$emit('start-select')"
          >
            <span class="lucide-square-check-big size-6" aria-hidden="true" />
          </button>
          <component :is="Bell" v-if="Bell" :active="bellActive" />
        </div>
      </template>
    </div>
    <!-- Narrow screens: the title gets its own full-width row. -->
    <div
      v-if="stacked && !selecting && !(searchOpen && searchable)"
      class="flex px-1 pb-2"
    >
      <slot name="title">
        <AppBarTitle v-bind="titleProps" @pick="pick" />
      </slot>
    </div>
    <!-- Search open (WhatsApp pattern, Marco 2026-10-28): the page's filters,
         toggles and recent records slide open under the search field, over
         the greyed list; typing lifts the grey so results show live. Closed,
         #active keeps what narrows the list in sight as removable chips. -->
    <Transition name="fade">
      <div
        v-if="panelOpen && !search"
        class="absolute inset-x-0 top-full h-[100dvh] bg-black/30"
        aria-hidden="true"
        data-appbar-scrim
        @click="closeSearch"
      />
    </Transition>
    <ExpandTransition>
      <div
        v-if="panelOpen"
        class="max-h-[64dvh] space-y-3 overflow-y-auto overscroll-contain px-4 pb-3 pt-1"
        data-appbar-search-panel
      >
        <slot name="search-panel" :close="closeSearch" />
      </div>
    </ExpandTransition>
    <ExpandTransition>
      <div
        v-if="$slots.active && !(searchOpen && searchable) && !selecting"
        class="px-4 pb-2 empty:hidden"
        data-appbar-active
      >
        <slot name="active" />
      </div>
    </ExpandTransition>
    <!-- What matters in this list, in sight while it scrolls. -->
    <div
      v-if="$slots.summary && !panelOpen"
      class="flex flex-wrap gap-x-6 gap-y-1 border-t border-outline-gray-1 px-4 pb-2.5 pt-2 text-xs text-ink-gray-6"
      data-appbar-summary
    >
      <slot name="summary" />
    </div>
    <!-- The title's scope sheet: the lists (or views) this screen can show. -->
    <BottomSheet
      v-if="scopes.length && sheetUsed"
      v-model:open="scopeSheet"
      :title="scopeTitle || t('Choose a list')"
      flush
    >
      <nav class="px-2 pb-3" :aria-label="scopeTitle || t('Choose a list')">
        <button
          v-for="entry in scopes"
          :key="entry.value"
          type="button"
          class="flex min-h-12 w-full items-center gap-3 rounded-7 px-4 text-left text-base"
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
import { t } from './host'
import {
  computed,
  defineAsyncComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useSlots,
  watch,
} from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import ExpandTransition from './ExpandTransition.vue'
import { canReturnToReferrer, uiBell } from './host'
import UiTag from './UiTag'

// The scope sheet loads on its first open: the shell header renders this bar
// on every page, and the sheet (reka Dialog) would otherwise sit in the entry
// chunk (budget 180 KB gzip).
const BottomSheet = defineAsyncComponent(() => import('./BottomSheet.vue'))

// The hover fill is for a pointer only: a tap leaves :hover on the button it landed on,
// and the next page's arrow would show as pressed. A finger sees the fill while it presses.
const ICON_BUTTON =
  'flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2'

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
  /** The title opens the page's own sheet instead (emits `pick`): a list's «Vistas». */
  picker: { type: Boolean, default: false },
  pickerOpen: { type: Boolean, default: false },
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
  /** The bell's «you are here» state, on the Avisos page itself. */
  bellActive: { type: Boolean, default: false },
  /** false: the title stays beside the back arrow and truncates (a drill-down
   *  record keeps arrow and name on one line, M3 small bar) until the icons
   *  leave it less than TITLE_MIN; then it takes its own row like any title. */
  stack: { type: Boolean, default: true },
  /** Extra attributes for the search field (a page's own hook, e.g. data-power-search). */
  searchInputAttrs: { type: Object, default: () => ({}) },
})
const emit = defineEmits([
  'back',
  'update:scope',
  'pick',
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
const sheetUsed = ref(false)
watch(scopeSheet, (open) => {
  if (open) sheetUsed.value = true
})
const stacked = ref(false)

const Bell = computed(() => (props.bell ? uiBell() : null))
const backTarget = computed(() =>
  props.back && props.back !== true ? props.back : null,
)
const pickable = computed(() => props.picker || props.scopes.length > 0)
function pick() {
  if (props.picker) emit('pick')
  else scopeSheet.value = true
}
const titleProps = computed(() => ({
  title: props.title,
  context: props.context,
  count: props.count,
  pickable: pickable.value,
  open: props.picker ? props.pickerOpen : scopeSheet.value,
  pickLabel: props.scopeTitle || t('Choose a list'),
  // A top-level bar is the page's heading: its title takes display size.
  large: !props.back,
}))

function onBack(event) {
  emit('back', event)
  if (backTarget.value || event.defaultPrevented) return
  if (window.history.state?.back) router.back()
  else if (returnsToReferrer()) window.history.back()
  else router.push('/')
}
// A page opened from another page of this origin (the Desk, another app) has no router entry
// behind it, so the arrow would send it home. Its previous browser entry is that page.
function returnsToReferrer() {
  return canReturnToReferrer({
    referrer: document.referrer,
    origin: window.location.origin,
    historyLength: window.history.length,
  })
}
function choose(value) {
  scopeSheet.value = false
  emit('update:scope', value)
}
const slots = useSlots()
const panelOpen = computed(
  () =>
    props.searchOpen &&
    props.searchable &&
    !props.selecting &&
    Boolean(slots['search-panel']),
)
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

// The title gets its own row (M3 medium bar) when it would not fit in two
// lines beside the icons, or when the icons leave it too little room: 6rem
// for a title beside a back arrow, 9.5rem for a large one (at 22px a narrower
// slot breaks «Por comprar» one word per line).
const titleMin = () => (props.back ? 96 : 152)
// Average glyph width, Archivo semibold at the title width (92 %): 22px for a
// top-level (large) title, 17px beside a back arrow.
const charPx = () => (props.back ? 9 : 11.5)
let observer = null
function measure() {
  const width = bar.value?.clientWidth || 0
  if (!width || !icons.value) return
  const used =
    icons.value.offsetWidth +
    (props.back ? 48 : 0) +
    (props.loading ? 24 : 0) +
    40 // the row's padding and gaps, and the title's own padding
  const room = width - used
  const text = `${props.title} ${props.count ?? ''}`.trim()
  const needed = text.length * charPx() + (pickable.value ? 24 : 0)
  stacked.value = room < titleMin() || (props.stack && needed > room * 2 * 0.9)
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
watch(
  () => [props.loading, props.back, props.title, props.count, props.stack],
  measure,
  {
    flush: 'post',
  },
)
onMounted(measure)
onBeforeUnmount(() => observer?.disconnect())

// The title: plain, or a button that opens the scope sheet.
const AppBarTitle = (attrs, { emit: emitTitle }) => {
  const count =
    attrs.count !== undefined && attrs.count !== null && attrs.count !== ''
      ? h(
          'span',
          { class: 'num ml-1 font-normal text-ink-gray-6' },
          `(${attrs.count})`,
        )
      : null
  const heading = h(
    'span',
    {
      class: [
        'title-face line-clamp-2 break-words font-semibold leading-tight [text-wrap:balance]',
        attrs.large ? 'text-3xl max-[359px]:text-2xl' : 'text-xl',
      ],
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
        'flex min-h-12 min-w-0 items-center gap-1 rounded-7 px-3 text-left hover:bg-surface-gray-1',
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
  'large',
]
AppBarTitle.emits = ['pick']
</script>
