<!-- Vendored from muelle/workspace/packages/ui@0.1.0 (c0d7e059548a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<!-- A phone list's top bar (WhatsApp pattern, Marco 2026-10-28): only the
     search pill shows. Focusing it slides open the panel under it (channel or
     view toggles, filters, recent records: the default slot) over the greyed
     list. Typing folds the panel so the results show live (Marco 2026-11-06);
     the filters button beside the pill unfolds it over them, and an empty
     pill shows it again. The keyboard going away or the list scrolling
     (host.js watchSoftKeyboard, watchListScroll) folds it too, the query
     staying in the pill behind the filters button; with nothing typed they
     close it, as «Listo», Esc or a tap on the grey do. Folded or closed,
     `#active` shows what narrows the list as removable chips; closed,
     `#trailing` sits beside the pill (⋯). -->
<template>
  <div ref="rootEl" class="relative z-20 bg-surface-base px-3.5 pb-2.5 pt-2">
    <Transition name="fade">
      <div
        v-if="open && !query"
        class="absolute inset-x-0 top-full h-[100dvh] bg-black/30"
        aria-hidden="true"
        data-testid="search-panel-scrim"
        @click="close"
      />
    </Transition>
    <div class="flex items-center gap-1">
      <div
        class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-surface-gray-2 px-4 focus-within:ring-1 focus-within:ring-outline-gray-3"
      >
        <span
          class="lucide-search size-4 flex-none text-ink-gray-5"
          aria-hidden="true"
        />
        <input
          ref="inputEl"
          data-list-search
          type="search"
          enterkeyhint="search"
          :value="query"
          :aria-label="label || placeholder"
          :placeholder="placeholder"
          class="w-full border-0 bg-transparent p-0 text-[15px] text-ink-gray-9 placeholder:text-ink-gray-5 focus:outline-none focus:ring-0 [&::-webkit-search-cancel-button]:hidden"
          @focus="open = true"
          @input="query = $event.target.value"
          @keydown.esc="onEsc"
        />
        <button
          v-if="query"
          type="button"
          class="-my-2 -mr-3 flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-5 hover:text-ink-gray-8"
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
          class="flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-8"
          :aria-label="t('Filters')"
          :aria-pressed="String(!folded)"
          data-testid="search-panel-toggle"
          @click="togglePanel"
        >
          <span class="lucide-sliders-horizontal size-5" aria-hidden="true" />
        </button>
        <button
          v-else-if="open"
          key="done"
          type="button"
          class="flex min-h-11 flex-none items-center px-2 text-sm font-medium text-ink-gray-8"
          data-testid="search-panel-done"
          @click="close"
        >
          {{ t('Listo') }}
        </button>
        <div v-else-if="$slots.trailing" class="flex flex-none items-center">
          <slot name="trailing" />
        </div>
      </Transition>
    </div>
    <ExpandTransition>
      <div v-if="(!open || folded) && $slots.active" class="pt-2">
        <slot name="active" />
      </div>
    </ExpandTransition>
    <ExpandTransition>
      <div
        v-if="open && !folded"
        class="-mx-3.5 max-h-[64dvh] space-y-3 overflow-y-auto overscroll-contain px-3.5 pb-1 pt-3"
        data-testid="search-panel"
      >
        <slot :close="close" />
      </div>
    </ExpandTransition>
  </div>
</template>

<script setup>
import { t, watchListScroll, watchSoftKeyboard } from './host'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ExpandTransition from './ExpandTransition.vue'

defineProps({
  placeholder: { type: String, default: '' },
  label: { type: String, default: '' },
})
const open = defineModel('open', { type: Boolean, default: false })
const query = defineModel('query', { type: String, default: '' })
const inputEl = ref(null)
const rootEl = ref(null)
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
let unwatchKeyboard = null
watch(
  inputEl,
  (el) => {
    unwatchKeyboard?.()
    unwatchKeyboard = el
      ? watchSoftKeyboard({ input: el, within: rootEl.value, onHide: fold })
      : null
  },
  { flush: 'post' },
)
const shown = () => open.value && !folded.value
let listScroll = null
onMounted(() => {
  listScroll = watchListScroll({ within: rootEl.value, onScroll: fold })
  if (shown()) listScroll.arm()
})
watch(shown, (on) => (on ? listScroll?.arm() : listScroll?.disarm()))
onBeforeUnmount(() => {
  unwatchKeyboard?.()
  listScroll?.stop()
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
