<template>
  <nav
    class="relative flex h-full flex-none flex-col gap-1 border-r border-outline-gray-1 bg-surface-base py-3 transition-[width] duration-150 ease-out motion-reduce:transition-none"
    :class="expanded ? 'items-stretch px-2' : 'items-center'"
    :style="{ width: `${railWidth}px` }"
    :aria-label="__('Apps')"
    :data-rail="expanded ? 'expanded' : 'collapsed'"
    @pointerover="showTip"
    @focusin="showTip"
    @pointerleave="tip = null"
    @focusout="tip = null"
  >
    <div
      class="mb-2 flex flex-none items-center gap-2.5"
      :class="expanded ? 'px-0.5' : 'justify-center'"
    >
      <span
        class="flex size-9 flex-none items-center justify-center rounded-6 bg-[var(--muelle-accent)] text-sm font-bold text-[var(--muelle-accent-ink)]"
        aria-hidden="true"
        >M</span
      >
      <span
        v-if="expanded"
        class="min-w-0 flex-1 truncate text-base font-semibold text-ink-gray-9"
        aria-hidden="true"
        >Muelle</span
      >
    </div>
    <!-- Search first (⌘K / ⌘G): expanded it reads as a field; «Pregúntale a
         Muelle» (E7) is the sparkle beside it (under it when collapsed), only
         once shell_api.status said yes. No bubble (design/ASSISTANT.md). -->
    <div
      class="flex flex-none items-center gap-1"
      :class="expanded ? 'w-full' : 'flex-col'"
    >
      <button
        class="flex flex-none items-center text-ink-gray-6"
        :class="
          expanded
            ? 'h-8 min-w-0 flex-1 gap-2 rounded-full bg-surface-gray-2 pl-2.5 pr-1.5 text-sm hover:bg-surface-gray-3'
            : 'size-10 justify-center rounded-6 hover:bg-surface-gray-2'
        "
        :aria-label="__('Search')"
        :title="expanded ? searchHint : undefined"
        :data-tip="searchHint"
        :aria-keyshortcuts="searchKeys"
        data-testid="rail-search"
        @click="$emit('palette')"
      >
        <span class="lucide-search size-[18px] flex-none" aria-hidden="true" />
        <template v-if="expanded">
          <span class="min-w-0 flex-1 truncate text-left" aria-hidden="true">{{
            __('Search')
          }}</span>
          <kbd
            class="flex-none rounded-4 border border-outline-gray-2 px-1 font-sans text-xs text-ink-gray-5"
            aria-hidden="true"
            >{{ paletteKey }}</kbd
          >
        </template>
      </button>
      <button
        v-if="assistantOn"
        class="flex flex-none items-center justify-center text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8"
        :class="expanded ? 'size-8 rounded-full' : 'size-10 rounded-6'"
        :aria-label="__('Ask Muelle')"
        :title="expanded ? `${__('Ask Muelle')} (${assistantKey})` : undefined"
        :data-tip="`${__('Ask Muelle')} (${assistantKey})`"
        :aria-keyshortcuts="assistantKeys"
        data-testid="rail-assistant"
        @click="$emit('assistant')"
      >
        <span class="lucide-sparkles size-[18px]" aria-hidden="true" />
      </button>
    </div>
    <div
      class="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden [scrollbar-width:none] hover:[scrollbar-width:thin]"
      :class="expanded ? 'items-stretch gap-px' : 'items-center gap-1'"
    >
      <RouterLink
        v-for="module in apps"
        :key="module.key"
        :to="module.to"
        :aria-label="moduleLabel(module)"
        :data-tip="moduleLabel(module)"
        :aria-current="module.key === active ? 'page' : undefined"
        :data-module="module.key"
        class="flex flex-none items-center rounded-6"
        :class="[
          ROW[expanded ? 'wide' : 'icon'],
          module.key === active
            ? 'bg-surface-gray-3 font-medium text-ink-gray-9'
            : 'text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8',
        ]"
        @click="showShell"
      >
        <span class="relative flex-none" aria-hidden="true">
          <span :class="[module.icon, 'block size-[18px]']" />
          <span
            v-if="!expanded && counts[module.key]"
            class="num absolute -right-2.5 -top-2 h-[18px] min-w-[18px] rounded-full px-1 text-center text-[11px] font-semibold leading-[18px] ring-2 ring-[var(--surface-base)]"
            :class="badgeTone(counts[module.key])"
            data-rail-count
            >{{ counts[module.key].text }}</span
          >
        </span>
        <template v-if="expanded">
          <span class="min-w-0 flex-1 truncate" aria-hidden="true">{{
            module.label
          }}</span>
          <span
            v-if="counts[module.key]"
            class="num h-[18px] min-w-[18px] flex-none rounded-full px-1.5 text-center text-[11px] font-semibold leading-[18px]"
            :class="badgeTone(counts[module.key])"
            aria-hidden="true"
            data-rail-count
            >{{ counts[module.key].text }}</span
          >
        </template>
      </RouterLink>
      <!-- A module whose builder failed on the server keeps its place: the
           tile says why, and its page offers the retry. -->
      <RouterLink
        v-for="module in unavailable"
        :key="module.key"
        :to="module.to"
        :aria-label="`${module.label}: ${module.reason}`"
        :data-tip="`${module.label}: ${module.reason}`"
        :aria-current="module.key === active ? 'page' : undefined"
        :data-module="module.key"
        data-state="unavailable"
        class="flex flex-none items-center rounded-6 text-ink-gray-5 hover:bg-surface-gray-2 hover:text-ink-gray-7"
        :class="ROW[expanded ? 'wide' : 'icon']"
        @click="showShell"
      >
        <span class="relative flex-none" aria-hidden="true">
          <span :class="[module.icon, 'block size-[18px]']" />
          <span
            class="lucide-circle-alert absolute -right-1.5 -top-1.5 size-3 text-ink-amber-8"
          />
        </span>
        <template v-if="expanded">
          <span class="min-w-0 flex-1 truncate" aria-hidden="true">{{
            module.label
          }}</span>
          <span class="flex-none text-xs text-ink-amber-8" aria-hidden="true">{{
            __('Not available')
          }}</span>
        </template>
      </RouterLink>
      <!-- What the worker hid, and the door to arrange the rail and the bar. -->
      <RailMore :hidden="hidden" :expanded="expanded" :active="active" />
    </div>
    <!-- The site's other apps, Ferdium-style: round icons that open the app
         inside the shell (it keeps its page while the worker switches), with
         what waits in it on the badge. Pinned below the modules, which scroll.
         Ctrl/middle click still opens a tab; × on an open app closes it. -->
    <div
      v-if="siblings.length"
      class="flex w-full flex-none flex-col gap-1 border-t border-outline-gray-1 pt-2"
      :class="expanded ? '' : 'items-center'"
      role="group"
      :aria-label="__('Other apps')"
      data-testid="rail-apps"
    >
      <div
        v-for="app in siblings"
        :key="app.key"
        class="group relative flex flex-none"
        :class="expanded ? 'w-full' : ''"
      >
        <a
          :href="siblingLinks[app.key]"
          :aria-label="moduleLabel(app)"
          :data-tip="moduleLabel(app)"
          :aria-current="currentApp === app.key ? 'page' : undefined"
          :data-sibling="app.key"
          :data-open="isOpen(app.key) ? '' : undefined"
          class="flex flex-none items-center rounded-6"
          :class="[
            expanded
              ? 'h-9 w-full gap-2.5 px-1.5 text-sm'
              : 'size-10 justify-center',
            currentApp === app.key
              ? 'font-medium text-ink-gray-9'
              : 'text-ink-gray-6 hover:text-ink-gray-8',
            expanded ? 'hover:bg-surface-gray-2' : '',
          ]"
          @click="onSibling(app, $event)"
        >
          <span
            class="relative flex size-8 flex-none items-center justify-center rounded-full"
            :class="
              currentApp === app.key
                ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                : 'bg-surface-gray-2 group-hover:bg-surface-gray-3'
            "
            aria-hidden="true"
          >
            <span :class="[app.icon, 'size-[18px]']" />
            <span
              v-if="counts[app.key]"
              class="num absolute -right-2 -top-1.5 h-[18px] min-w-[18px] rounded-full px-1 text-center text-[11px] font-semibold leading-[18px] ring-2 ring-[var(--surface-base)]"
              :class="badgeTone(counts[app.key])"
              data-rail-count
              >{{ counts[app.key].text }}</span
            >
          </span>
          <span
            v-if="isOpen(app.key)"
            class="absolute left-0 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-ink-gray-7"
            aria-hidden="true"
            data-app-open
          />
          <span
            v-if="expanded"
            class="min-w-0 flex-1 truncate"
            aria-hidden="true"
            >{{ app.label }}</span
          >
        </a>
        <button
          v-if="isOpen(app.key)"
          type="button"
          class="absolute flex size-4 items-center justify-center rounded-full bg-surface-gray-7 text-ink-base opacity-0 focus:opacity-100 group-hover:opacity-100"
          :class="
            expanded ? 'right-2 top-1/2 -translate-y-1/2' : '-left-0.5 -top-0.5'
          "
          :aria-label="`${__('Close')} ${app.label}`"
          :data-close-app="app.key"
          @click="closeApp(app.key)"
        >
          <span class="lucide-x size-3" aria-hidden="true" />
        </button>
      </div>
    </div>
    <button
      class="flex flex-none items-center rounded-6 text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8"
      :class="ROW[expanded ? 'wide' : 'icon']"
      :aria-label="toggleLabel"
      :aria-expanded="expanded"
      :data-tip="`${expanded ? toggleLabel : __('Show app names')} (${sidebarKey})`"
      aria-keyshortcuts="["
      data-testid="rail-toggle"
      @click="toggleRail"
    >
      <span
        :class="[
          expanded ? 'lucide-panel-left-close' : 'lucide-panel-left-open',
          'size-[18px] flex-none',
        ]"
        aria-hidden="true"
      />
      <template v-if="expanded">
        <span class="flex-1 truncate text-left" aria-hidden="true">{{
          __('Icons only')
        }}</span>
        <kbd
          class="rounded-4 border border-outline-gray-2 px-1 font-sans text-xs text-ink-gray-5"
          aria-hidden="true"
          >{{ sidebarKey }}</kbd
        >
      </template>
    </button>
    <!-- Avisos is pinned at the bottom: the bell and its slide-over. -->
    <AvisosBell
      v-if="avisos"
      rail
      :expanded="expanded"
      :ventas="ventas"
      :active="active === 'avisos'"
    />
    <!-- The account and «Ayuda» share one island at the foot: the person,
         then the bug that opens doco's help and problem reports (no floating
         pill, MuelleShell hides it). Collapsed, the bug sits above the face. -->
    <div
      class="flex"
      :class="expanded ? 'items-center gap-1' : 'flex-col-reverse items-center'"
    >
      <UserMenu
        :ventas="ventas"
        :expanded="expanded"
        :class="expanded ? 'min-w-0 flex-1' : ''"
      />
      <button
        v-if="helpOn"
        class="press flex size-10 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8"
        :class="expanded ? 'mt-1' : ''"
        :aria-label="__('Help and report a problem')"
        :data-tip="__('Help and report a problem')"
        data-testid="rail-help"
        @click="openHelp"
      >
        <span class="lucide-bug size-[18px]" aria-hidden="true" />
      </button>
    </div>
    <!-- One label for every icon, beside the rail: the name (and count) a
         collapsed rail leaves out, at once instead of the browser's delay. -->
    <div
      v-if="tip && !expanded"
      class="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-6 bg-surface-gray-9 px-2 py-1 text-sm font-medium text-ink-base shadow-lg"
      :style="{ left: `${railWidth + 6}px`, top: `${tip.top}px` }"
      role="tooltip"
      data-testid="rail-tip"
    >
      {{ tip.text }}
    </div>
  </nav>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'
import {
  ariaKeys,
  keyLabel,
  searchEntryHint,
} from '@/composables/shellKeyboard'
import { assistantOn } from '@/components/assistant/assistantDoor'
import {
  moduleCount,
  railCounts,
  railExpanded,
  railWidth,
  refreshRailCounts,
  siblingHref,
  toggleRail,
} from '@/composables/shellRail'
import {
  closeApp,
  currentApp,
  openApp,
  openApps,
  showShell,
} from '@/composables/appStrip'
import UserMenu from './UserMenu.vue'
import RailMore from './RailMore.vue'
import { installLinkPrefetch } from '@/utils/speculate'

const props = defineProps({
  // The worker's places in their order (shellLayout): modules, then the
  // site's other apps ({app: true}); Avisos is the bell at the foot.
  modules: { type: Array, default: () => [] },
  hidden: { type: Array, default: () => [] },
  unavailable: { type: Array, default: () => [] },
  active: { type: String, default: '' },
  ventas: Boolean,
})
defineEmits(['palette', 'assistant'])

// One row shape per width: an icon tile, or a full-width row with the name
// (32 px rows keep every module and the other apps on a 900 px screen).
const ROW = Object.freeze({
  icon: 'size-10 justify-center',
  wide: 'h-8 w-full gap-3 px-2.5 text-sm',
})
// «Buscar o ir a… (Ctrl+K) · Buscar registros (Ctrl+G)», ⌘ on Apple.
const { label: searchHint, aria: searchKeys } = searchEntryHint()
const paletteKey = keyLabel('mod+k')
const assistantKey = keyLabel('mod+j')
const assistantKeys = ariaKeys('mod+j')
const sidebarKey = keyLabel('[')
const AvisosBell = defineAsyncComponent(
  () => import('@/components/avisos/AvisosBell.vue'),
)
const route = useRoute()
const expanded = railExpanded
// doco's support script (injected in <head>) runs before this bundle.
const helpOn = typeof window.docoSupport?.openHelp === 'function'
const openHelp = () => window.docoSupport.openHelp()
const toggleLabel = computed(() =>
  expanded.value ? __('Collapse sidebar') : __('Expand sidebar'),
)
const apps = computed(() =>
  props.modules.filter((module) => !module.app && module.key !== 'avisos'),
)
const avisos = computed(() =>
  props.modules.some((module) => module.key === 'avisos'),
)
// What waits in each module, read again when the worker comes back to the
// window, moves to another page, or every two minutes while it is in view.
const counts = computed(() =>
  Object.fromEntries(
    [...props.modules, ...props.hidden].map((module) => [
      module.key,
      moduleCount(module, railCounts.value),
    ]),
  ),
)
const badgeTone = (found) =>
  found.urgent
    ? 'bg-surface-red-7 text-white'
    : 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
function moduleLabel(module) {
  const found = counts.value[module.key]
  return found ? `${module.label} · ${found.text}` : module.label
}
const COUNTS_EVERY_MS = 120000
let countsTimer = 0
const onFocus = () => refreshRailCounts()
onMounted(() => {
  refreshRailCounts({ force: true })
  window.addEventListener('focus', onFocus)
  countsTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') refreshRailCounts()
  }, COUNTS_EVERY_MS)
})
onBeforeUnmount(() => {
  window.removeEventListener('focus', onFocus)
  window.clearInterval(countsTimer)
})
watch(
  () => route.path,
  () => refreshRailCounts(),
)

// The label beside a hovered or focused icon (collapsed rail only).
const tip = ref(null)
function showTip(event) {
  const target = event.target?.closest?.('[data-tip]')
  if (!target || expanded.value) return (tip.value = null)
  const box = target.getBoundingClientRect()
  tip.value = { text: target.dataset.tip, top: box.top + box.height / 2 }
}

// Sibling SPAs (Escáner, POS, Taller…) open with the way back to this page:
// «Volver a Productos» in Escáner returns to the record the worker left.
const siblings = computed(() => props.modules.filter((module) => module.app))
// Hovering a sibling app (data-sibling) fetches its page before the click.
installLinkPrefetch()
const siblingLinks = computed(() => {
  const label = props.modules.find(
    (module) => module.key === props.active,
  )?.label
  return Object.fromEntries(
    siblings.value.map((app) => [
      app.key,
      siblingHref(app, route.fullPath, label),
    ]),
  )
})

// A plain click opens the app inside the shell (appStrip); with Ctrl/⌘,
// Shift or the middle button the browser opens it in a tab or window.
const isOpen = (key) => openApps.value.some((open) => open.key === key)
function onSibling(app, event) {
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey) return
  event.preventDefault()
  openApp(app, siblingLinks.value[app.key])
}
</script>
