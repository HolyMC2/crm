<template>
  <!-- The rail's last row: what the worker hid (it still opens from here and
       the palette) and the door to arrange the rail and the phone bar. -->
  <div class="flex flex-none" :class="expanded ? 'w-full' : ''">
    <button
      ref="trigger"
      type="button"
      class="flex flex-none items-center rounded-6 text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8"
      :class="
        expanded ? 'h-8 w-full gap-3 px-2.5 text-sm' : 'size-10 justify-center'
      "
      :aria-label="__('More')"
      :data-tip="tipText"
      :aria-expanded="open"
      aria-haspopup="menu"
      data-testid="rail-more"
      @click="toggle"
    >
      <span class="lucide-ellipsis size-[18px] flex-none" aria-hidden="true" />
      <template v-if="expanded">
        <span class="min-w-0 flex-1 truncate text-left" aria-hidden="true">{{
          __('More')
        }}</span>
        <span
          v-if="hidden.length"
          class="num flex-none text-xs text-ink-gray-5"
          aria-hidden="true"
          >{{ hidden.length }}</span
        >
      </template>
    </button>
    <template v-if="open">
      <div class="fixed inset-0 z-40" @click="open = false" />
      <div
        ref="menu"
        role="menu"
        class="fixed z-50 max-h-[80dvh] w-60 overflow-y-auto rounded-7 border border-outline-gray-2 bg-surface-base py-1.5 shadow-xl"
        :style="{ left: `${railWidth + 4}px`, top: `${top}px` }"
        data-testid="rail-more-menu"
      >
        <template v-if="hidden.length">
          <div class="px-3.5 pb-1 pt-1.5 text-xs text-ink-gray-6">
            {{ __('Hidden places') }}
          </div>
          <component
            :is="place.app ? 'a' : RouterLink"
            v-for="place in hidden"
            :key="place.key"
            role="menuitem"
            v-bind="place.app ? { href: hrefs[place.key] } : { to: place.to }"
            :aria-current="place.key === active ? 'page' : undefined"
            :data-module="place.app ? undefined : place.key"
            :data-sibling="place.app ? place.key : undefined"
            :class="ITEM"
            @click="go(place, $event)"
          >
            <span
              :class="[place.icon, 'size-4 text-ink-gray-6']"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate">{{ place.label }}</span>
          </component>
          <div class="my-1 border-t border-outline-gray-1" />
        </template>
        <button
          type="button"
          role="menuitem"
          :class="ITEM"
          data-testid="rail-customize"
          @click="customize('mine')"
        >
          <span
            class="lucide-layout-list size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          {{ __('Customize') }}
        </button>
        <button
          v-if="arrangesTeam"
          type="button"
          role="menuitem"
          :class="ITEM"
          data-testid="rail-team-layout"
          @click="customize('team')"
        >
          <span
            class="lucide-users size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          {{ __('Bar by puesto') }}
        </button>
      </div>
    </template>
  </div>
</template>
<script setup>
import { computed, nextTick, ref, resolveComponent } from 'vue'
import { useRoute } from 'vue-router'
import { openLayoutSheet, shellBoot } from '@/composables/muelleShell'
import { railWidth, siblingHref } from '@/composables/shellRail'
import { openApp, showShell } from '@/composables/appStrip'
import { tabbables, useShellLayer } from '@/composables/shellKeyboard'

const props = defineProps({
  hidden: { type: Array, default: () => [] },
  expanded: Boolean,
  active: { type: String, default: '' },
})
const RouterLink = resolveComponent('RouterLink')
const route = useRoute()
const open = ref(false)
const top = ref(0)
const trigger = ref(null)
const menu = ref(null)
const arrangesTeam = computed(() => !!shellBoot.value?.user?.arranges_team)
const tipText = computed(() =>
  props.hidden.length
    ? __('More: {0} hidden', [props.hidden.length])
    : __('More'),
)
const hrefs = computed(() =>
  Object.fromEntries(
    props.hidden
      .filter((place) => place.app)
      .map((app) => [app.key, siblingHref(app, route.fullPath)]),
  ),
)

// Beside the row, kept on screen: a rail near the bottom opens it upwards.
function toggle() {
  if (open.value) return close()
  open.value = true
  const box = trigger.value.getBoundingClientRect()
  top.value = box.top
  nextTick(() => {
    const height = menu.value?.offsetHeight || 0
    top.value = Math.max(8, Math.min(box.top, window.innerHeight - height - 8))
    tabbables(menu.value)[0]?.focus()
  })
}
function close() {
  open.value = false
  trigger.value?.focus()
}
useShellLayer(menu, {
  open: () => open.value,
  onKeydown(event) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    close()
  },
})
// A hidden app opens inside the shell like the strip's (Ctrl/middle: a tab).
function go(place, event) {
  open.value = false
  if (!place.app) return showShell()
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey) return
  event.preventDefault()
  openApp(place, hrefs.value[place.key])
}
function customize(mode) {
  open.value = false
  openLayoutSheet(mode)
}

const ITEM =
  'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-surface-gray-2'
</script>
