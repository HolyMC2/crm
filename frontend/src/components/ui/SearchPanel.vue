<!-- Vendored from muelle/workspace/packages/ui@0.4.0 (f299ad1b2cf1). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<!-- A phone list's search (WhatsApp pattern, Marco 2026-10-28): only the
     search pill shows. Focusing it slides open the panel (channel or view
     toggles, filters, recent records: the default slot) over the greyed list.
     Typing folds the panel so the results show live (Marco 2026-11-06); the
     filters button beside the pill unfolds it over them, and an empty pill
     shows it again. The keyboard going away or the list scrolling
     (host.js watchSoftKeyboard, watchListScroll) folds it too, the query
     staying in the pill behind the filters button; with nothing typed they
     close it, as «Listo», Esc or a tap on the grey do. Folded or closed,
     `#active` shows what narrows the list as removable chips; closed,
     `#trailing` sits beside the pill (⋯). The pill is 48 px on
     container-highest.
     With the phone shell's command bar on screen (toolDock searchDock) the
     pill is the bar's search, at the thumb (Marco 2026-11-23): the panel
     rises above the bar, a row over the bar takes the same words to the
     app's search across everything; `#active` stays at the top of the list
     and `#trailing` joins the shell's top bar (#shell-header-actions). -->
<template>
  <div
    ref="rootEl"
    v-bind="$attrs"
    class="relative z-20 bg-surface-base px-3.5"
    :class="docked ? 'empty:hidden [&:has(>*)]:pb-2.5' : 'pb-2.5 pt-2'"
    :data-search-panel-docked="docked ? '' : undefined"
  >
    <Transition name="fade">
      <div
        v-if="!docked && open && !query"
        class="ui-scrim absolute inset-x-0 top-full h-[100dvh]"
        aria-hidden="true"
        data-testid="search-panel-scrim"
        @click="close"
      />
    </Transition>
    <!-- Docked, the list's own menu (⋯) joins the shell's top bar beside
         the bell (#shell-header-actions); without one it keeps a row here. -->
    <Teleport
      v-if="docked && $slots.trailing"
      to="#shell-header-actions"
      :disabled="!headerActions"
      defer
    >
      <div
        class="flex items-center"
        :class="headerActions ? '' : 'justify-end pt-1'"
        data-search-panel-trailing
      >
        <slot name="trailing" />
      </div>
    </Teleport>
    <Teleport to="#shell-page-tools" :disabled="!docked" defer>
      <div
        class="flex items-center gap-1"
        :class="docked ? 'min-w-0 flex-1' : ''"
      >
        <div
          :class="
            docked
              ? 'dock-pill'
              : 'ui-focus flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-gray-4 px-4 text-[var(--muelle-on-surface-variant)]'
          "
        >
          <span class="lucide-search size-5 flex-none" aria-hidden="true" />
          <input
            ref="inputEl"
            data-list-search
            type="search"
            enterkeyhint="search"
            :value="query"
            :aria-label="label || placeholder"
            :placeholder="placeholder"
            class="w-full border-0 bg-transparent p-0 text-[15px] text-ink-gray-9 placeholder:text-[var(--muelle-on-surface-variant)] focus:outline-none focus:ring-0 [&::-webkit-search-cancel-button]:hidden"
            @focus="open = true"
            @input="query = $event.target.value"
            @keydown.esc="onEsc"
          />
          <button
            v-if="query"
            type="button"
            class="press -mr-3 flex size-11 flex-none items-center justify-center rounded-full"
            :aria-label="t('Limpiar búsqueda')"
            @click="clearQuery"
          >
            <span class="lucide-x size-4" aria-hidden="true" />
          </button>
        </div>
        <Transition name="slide-x" mode="out-in">
          <button
            v-if="open && query"
            key="filters"
            type="button"
            :class="
              docked
                ? 'dock-icon'
                : 'press flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-8'
            "
            :aria-label="t('Filters')"
            :title="t('Filters')"
            :aria-pressed="String(!folded)"
            data-testid="search-panel-toggle"
            @click="togglePanel"
          >
            <span
              class="lucide-sliders-horizontal"
              :class="docked ? 'size-6' : 'size-5'"
              aria-hidden="true"
            />
          </button>
          <button
            v-else-if="open"
            key="done"
            type="button"
            class="press flex min-h-11 flex-none items-center rounded-full px-3 text-sm font-medium text-ink-gray-8"
            data-testid="search-panel-done"
            @click="close"
          >
            {{ t('Listo') }}
          </button>
          <div
            v-else-if="!docked && $slots.trailing"
            class="flex flex-none items-center"
          >
            <slot name="trailing" />
          </div>
        </Transition>
      </div>
    </Teleport>
    <ExpandTransition>
      <div
        v-if="(!open || folded || docked) && $slots.active"
        :class="docked ? 'pt-1' : 'pt-2'"
      >
        <slot name="active" />
      </div>
    </ExpandTransition>
    <ExpandTransition>
      <div
        v-if="!docked && open && !folded"
        class="-mx-3.5 max-h-[64dvh] space-y-3 overflow-y-auto overscroll-contain px-3.5 pb-1 pt-3"
        data-testid="search-panel"
      >
        <slot :close="close" />
      </div>
    </ExpandTransition>
  </div>
  <Teleport v-if="docked" to="#shell-page-panel" defer>
    <div ref="dockPanel" data-search-panel-dock>
      <Transition name="tool-scrim">
        <div
          v-if="open && !query"
          class="tool-dock-scrim"
          aria-hidden="true"
          data-testid="search-panel-scrim"
          @click="close"
        />
      </Transition>
      <ExpandTransition>
        <div
          v-if="open && !folded && $slots.default"
          class="tool-dock-panel !block space-y-3"
          data-testid="search-panel"
        >
          <slot :close="close" />
        </div>
      </ExpandTransition>
      <button
        v-if="searchAll && open"
        type="button"
        class="state-layer relative flex min-h-11 w-full items-center gap-3 bg-[var(--muelle-surface-container)] px-5 text-left text-[15px] text-[var(--muelle-on-surface-variant)]"
        data-testid="search-panel-everywhere"
        @pointerdown.prevent
        @click="goWide"
      >
        <span class="lucide-search size-5 flex-none" aria-hidden="true" />
        <span class="min-w-0 truncate">{{
          query
            ? t('Search «{0}» everywhere', [query])
            : t('Search everywhere')
        }}</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import {
  t,
  uiSearchAll,
  watchListScroll,
  watchSoftKeyboard,
} from './host'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ExpandTransition from './ExpandTransition.vue'
import { pageToolsDocked, searchDock } from './toolDock'

// Docked, the panel renders beside the root (a Teleport), so the page's
// attributes go on the root itself.
defineOptions({ inheritAttrs: false })
const props = defineProps({
  placeholder: { type: String, default: '' },
  label: { type: String, default: '' },
  /** false keeps the pill over the list even where the shell docks searches
   *  (a search inside a sheet, a second list beside the first). */
  dock: { type: Boolean, default: true },
})
const open = defineModel('open', { type: Boolean, default: false })
const query = defineModel('query', { type: String, default: '' })
const inputEl = ref(null)
const rootEl = ref(null)
const dockPanel = ref(null)
// The pill docks into the phone command bar while the shell offers it.
const docked = computed(() => props.dock && searchDock.value)
watch(
  docked,
  (now, before) => {
    if (now && !before) pageToolsDocked.value += 1
    else if (!now && before) pageToolsDocked.value -= 1
  },
  { immediate: true },
)
const searchAll = computed(() => uiSearchAll())
// The shell's top bar takes a docked list's menu when it offers the slot.
const headerActions = ref(false)
onMounted(() => {
  headerActions.value = Boolean(
    typeof document !== 'undefined' &&
      document.getElementById('shell-header-actions'),
  )
})
// The panel folded away: typing folds it so the results show live, the
// filters button unfolds it over them, an empty pill shows it again.
const folded = ref(Boolean(query.value))
watch(query, (value) => {
  folded.value = Boolean(value)
})
function togglePanel() {
  folded.value = !folded.value
  if (folded.value) inputEl.value?.focus()
  else inputEl.value?.blur()
}

function close() {
  open.value = false
  inputEl.value?.blur()
}
// The same words, across everything the app reaches (the shell's palette).
function goWide() {
  const run = searchAll.value
  if (!run) return
  inputEl.value?.blur()
  run(query.value)
}
// The worker moved on (the keyboard went, the list scrolled): a query stays
// in the pill behind the filters button, panel folded; nothing typed closes.
function fold() {
  if (!query.value) {
    close()
    return
  }
  folded.value = true
  inputEl.value?.blur()
}
// Docked, the pill and its panel live in the shell's bar: taps and scrolls
// there are the search's own, not the worker moving on.
function searchArea() {
  const bar = docked.value
    ? inputEl.value?.closest('#shell-page-tools')?.parentElement
    : null
  return {
    contains: (el) =>
      Boolean(
        el &&
          (rootEl.value?.contains(el) ||
            bar?.contains(el) ||
            dockPanel.value?.contains(el)),
      ),
    addEventListener: (...args) =>
      (bar || rootEl.value)?.addEventListener(...args),
    removeEventListener: (...args) =>
      (bar || rootEl.value)?.removeEventListener(...args),
  }
}
let unwatchKeyboard = null
watch(
  inputEl,
  (el) => {
    unwatchKeyboard?.()
    unwatchKeyboard = el
      ? watchSoftKeyboard({ input: el, within: searchArea(), onHide: fold })
      : null
  },
  { flush: 'post' },
)
const shown = () => open.value && !folded.value
let listScroll = null
onMounted(() => {
  listScroll = watchListScroll({
    within: { contains: (el) => searchArea().contains(el) },
    onScroll: fold,
  })
  if (shown()) listScroll.arm()
})
watch(shown, (on) => (on ? listScroll?.arm() : listScroll?.disarm()))
onBeforeUnmount(() => {
  unwatchKeyboard?.()
  listScroll?.stop()
  if (docked.value) pageToolsDocked.value -= 1
})
function clearQuery() {
  query.value = ''
  inputEl.value?.focus()
}
function onEsc() {
  if (query.value) query.value = ''
  else close()
}
defineExpose({ close, focus: () => inputEl.value?.focus() })
</script>
