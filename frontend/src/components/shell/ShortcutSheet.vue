<template>
  <!-- The Alt+H cheat sheet, laid out like Desk's (doco desk_shortcuts.css):
       a 224 px section menu beside the rows, two columns from 1000 px; on a
       phone the menu is a scrolling row of tabs above one column. -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center"
    role="dialog"
    aria-modal="true"
    data-shell-layer="shortcuts"
    :aria-labelledby="`${uid}-title`"
    @keydown="onKeydown"
  >
    <div class="absolute inset-0 bg-black/30" @click="close" />
    <div
      class="kbd-card relative flex flex-col overflow-hidden rounded-xl bg-surface-base text-ink-gray-9 shadow-2xl"
    >
      <div
        class="flex items-center gap-2 border-b border-outline-gray-1 py-2 pl-5 pr-2"
      >
        <h2 :id="`${uid}-title`" class="min-w-0 flex-1 text-base font-semibold">
          {{ shellT('Keyboard shortcuts') }}
        </h2>
        <button
          class="flex size-11 flex-none items-center justify-center rounded-lg text-sm text-ink-gray-6 hover:bg-surface-gray-2"
          :aria-label="__('Close')"
          @click="close"
        >
          <span class="lucide-x size-5" aria-hidden="true" />
        </button>
      </div>
      <div class="kbd-layout">
        <div
          class="kbd-menu border-outline-gray-1"
          role="tablist"
          :aria-label="shellT('Keyboard shortcut sections')"
          :aria-orientation="phone ? 'horizontal' : 'vertical'"
        >
          <button
            v-for="(section, index) in sections"
            :id="`${uid}-tab-${section.id}`"
            :key="section.id"
            :ref="(el) => (tabs[index] = el)"
            type="button"
            role="tab"
            class="kbd-tab text-ink-gray-8 hover:bg-surface-gray-2"
            :class="
              index === selected
                ? 'bg-surface-gray-2 font-semibold text-ink-gray-9'
                : ''
            "
            :aria-selected="index === selected"
            :aria-controls="`${uid}-panel-${section.id}`"
            :tabindex="index === selected ? 0 : -1"
            :data-section="section.id"
            @click="select(index)"
            @keydown="onTabKey($event, index)"
          >
            <span class="truncate">{{ section.title }}</span>
            <span class="text-xs font-normal text-ink-gray-6">{{
              section.rows.length
            }}</span>
          </button>
        </div>
        <div ref="content" class="kbd-content" tabindex="-1">
          <section
            v-for="(section, index) in sections"
            :id="`${uid}-panel-${section.id}`"
            :key="section.id"
            role="tabpanel"
            :aria-labelledby="`${uid}-tab-${section.id}`"
            :hidden="index !== selected"
            tabindex="0"
            class="focus-visible:outline-none"
          >
            <h3 class="mb-5 text-lg font-semibold">{{ section.title }}</h3>
            <ul class="kbd-rows">
              <li
                v-for="row in section.rows"
                :key="row.id"
                class="kbd-row border-b border-outline-gray-1"
              >
                <div class="leading-loose">
                  <template v-for="(key, k) in row.keys" :key="key"
                    ><span v-if="k" class="text-ink-gray-5"> / </span
                    ><kbd
                      class="whitespace-nowrap rounded-[5px] border border-outline-gray-2 bg-surface-gray-2 px-[7px] py-[3px] font-sans text-xs text-ink-gray-8"
                      >{{ key }}</kbd
                    ></template
                  >
                </div>
                <div class="break-words text-sm leading-normal">
                  {{ row.description }}
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { shellModules } from '@/composables/muelleShell'
import {
  closeShortcutSheet,
  shellCheatSheet,
  shellT,
  shortcutSheet,
} from '@/composables/shellKeyboard'

const uid = `muelle-kbd-${Math.random().toString(36).slice(2, 8)}`
// Same breakpoint as the stylesheet below (and Desk's sheet).
const phone = useMediaQuery('(max-width: 760px)')
const tabs = ref([])
const content = ref(null)
const selected = ref(0)
// Generated from the keymap the moment the sheet opens: only keys that work
// on this page and for this worker's modules appear.
const sections = computed(() =>
  shellCheatSheet({ modules: shellModules.value }),
)
// Esc returns the focus to the trigger; when the trigger went away with its
// layer (the palette's input), to what that layer gave the focus back to.
const trigger = shortcutSheet.value.trigger?.isConnected
  ? shortcutSheet.value.trigger
  : document.activeElement

function select(index, focus = false) {
  selected.value = index
  if (content.value) content.value.scrollTop = 0
  if (focus) tabs.value[index]?.focus()
  tabs.value[index]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}
function onTabKey(event, index) {
  const count = sections.value.length
  const next = {
    ArrowRight: (index + 1) % count,
    ArrowDown: (index + 1) % count,
    ArrowLeft: (index + count - 1) % count,
    ArrowUp: (index + count - 1) % count,
    Home: 0,
    End: count - 1,
  }[event.key]
  if (next === undefined) return
  event.preventDefault()
  event.stopPropagation()
  select(next, true)
}
function onKeydown(event) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  close()
}
function close() {
  closeShortcutSheet()
}
function focusTab() {
  nextTick(() => tabs.value[selected.value]?.focus())
}
// Alt+H again (or another entry point) while open brings the focus back here.
watch(() => shortcutSheet.value.focus, focusTab)
onMounted(focusTab)
onBeforeUnmount(() => {
  if (trigger?.isConnected) trigger.focus?.()
})
</script>
<style scoped>
.kbd-card {
  width: calc(100% - 48px);
  margin-top: 24px;
  max-height: calc(100dvh - 48px);
}
.kbd-layout {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  height: min(680px, calc(100dvh - 130px));
  min-height: 0;
}
.kbd-menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-right-width: 1px;
  overflow: auto;
}
.kbd-tab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  text-align: left;
  scroll-margin-inline: 12px;
}
.kbd-tab[aria-selected='true'] {
  box-shadow: inset 3px 0 currentColor;
}
.kbd-content {
  min-width: 0;
  min-height: 0;
  padding: 24px;
  overflow: auto;
  overscroll-behavior: contain;
}
.kbd-rows {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0 32px;
}
.kbd-row {
  display: grid;
  grid-template-columns: minmax(96px, auto) minmax(0, 1fr);
  align-items: start;
  gap: 16px;
  padding: 16px 0;
}
@media (min-width: 1000px) {
  .kbd-rows {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .kbd-card {
    width: calc(100% - 24px);
    margin-top: 12px;
    max-height: calc(100dvh - 24px);
  }
  .kbd-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    height: min(680px, calc(100dvh - 90px));
  }
  .kbd-menu {
    flex-direction: row;
    padding: 12px;
    border-right-width: 0;
    border-bottom-width: 1px;
  }
  .kbd-tab {
    flex: 0 0 auto;
    padding: 10px 12px;
    white-space: nowrap;
  }
  .kbd-tab[aria-selected='true'] {
    box-shadow: inset 0 -3px currentColor;
  }
  .kbd-content {
    padding: 20px 16px;
  }
  .kbd-row {
    gap: 12px;
  }
}
</style>
