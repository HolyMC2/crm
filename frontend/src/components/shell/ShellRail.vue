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
    <button
      class="flex flex-none items-center rounded-6 text-ink-gray-6 hover:bg-surface-gray-2"
      :class="ROW[expanded ? 'wide' : 'icon']"
      :aria-label="__('Search')"
      :title="expanded ? searchHint : undefined"
      :data-tip="searchHint"
      :aria-keyshortcuts="searchKeys"
      data-testid="rail-search"
      @click="$emit('palette')"
    >
      <span class="lucide-search size-[18px] flex-none" aria-hidden="true" />
      <template v-if="expanded">
        <span class="flex-1 truncate text-left" aria-hidden="true">{{
          __('Search')
        }}</span>
        <kbd
          class="rounded-4 border border-outline-gray-2 px-1 font-sans text-xs text-ink-gray-5"
          aria-hidden="true"
          >{{ paletteKey }}</kbd
        >
      </template>
    </button>
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
      <template v-if="siblings.length && expanded">
        <div
          class="flex-none px-2.5 pb-0.5 pt-3 text-xs font-medium text-ink-gray-5"
        >
          {{ __('Other apps') }}
        </div>
        <a
          v-for="app in siblings"
          :key="app.key"
          :href="siblingLinks[app.key]"
          :aria-label="app.label"
          :data-sibling="app.key"
          class="flex flex-none items-center rounded-6 text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8"
          :class="ROW.wide"
        >
          <span
            :class="[app.icon, 'size-[18px] flex-none']"
            aria-hidden="true"
          />
          <span class="flex-1 truncate" aria-hidden="true">{{
            app.label
          }}</span>
          <span
            class="lucide-arrow-up-right size-3.5 flex-none text-ink-gray-4"
            aria-hidden="true"
          />
        </a>
      </template>
    </div>
    <!-- Collapsed, the sibling apps wait behind one button. -->
    <div v-if="siblings.length && !expanded" class="flex-none">
      <button
        ref="appsButton"
        class="flex items-center justify-center rounded-6"
        :class="[
          ROW.icon,
          appsOpen
            ? 'bg-surface-gray-3 text-ink-gray-9'
            : 'text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8',
        ]"
        :aria-label="__('Other apps')"
        :data-tip="__('Other apps')"
        :aria-expanded="appsOpen"
        aria-haspopup="menu"
        data-testid="rail-apps"
        @click="toggleApps"
      >
        <span class="lucide-layout-grid size-[18px]" aria-hidden="true" />
      </button>
      <template v-if="appsOpen">
        <div class="fixed inset-0 z-40" @click="appsOpen = false" />
        <div
          ref="appsMenu"
          role="menu"
          class="fixed z-50 w-56 rounded-7 border border-outline-gray-2 bg-surface-base py-1.5 shadow-xl"
          :style="appsMenuStyle"
        >
          <div class="px-3.5 pb-1 pt-1.5 text-xs font-medium text-ink-gray-5">
            {{ __('Other apps') }}
          </div>
          <a
            v-for="app in siblings"
            :key="app.key"
            role="menuitem"
            :href="siblingLinks[app.key]"
            :data-sibling="app.key"
            class="flex items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-surface-gray-2"
          >
            <span
              :class="[app.icon, 'size-4 text-ink-gray-6']"
              aria-hidden="true"
            />
            <span class="flex-1">{{ app.label }}</span>
            <span
              class="lucide-arrow-up-right size-3.5 text-ink-gray-4"
              aria-hidden="true"
            />
          </a>
        </div>
      </template>
    </div>
    <!-- «Pregúntale a Muelle» (E7): the desktop door, one item, only once
         shell_api.status said yes. No bubble (design/ASSISTANT.md). -->
    <button
      v-if="assistantOn"
      class="flex flex-none items-center rounded-6 text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8"
      :class="ROW[expanded ? 'wide' : 'icon']"
      :aria-label="__('Ask Muelle')"
      :data-tip="`${__('Ask Muelle')} (${assistantKey})`"
      :aria-keyshortcuts="assistantKeys"
      data-testid="rail-assistant"
      @click="$emit('assistant')"
    >
      <span class="lucide-sparkles size-[18px] flex-none" aria-hidden="true" />
      <template v-if="expanded">
        <span class="flex-1 truncate text-left" aria-hidden="true">{{
          __('Ask Muelle')
        }}</span>
        <kbd
          class="rounded-4 border border-outline-gray-2 px-1 font-sans text-xs text-ink-gray-5"
          aria-hidden="true"
          >{{ assistantKey }}</kbd
        >
      </template>
    </button>
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
      v-if="tip && !expanded && !appsOpen"
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
  nextTick,
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
  useShellLayer,
} from '@/composables/shellKeyboard'
import { assistantOn } from '@/components/assistant/assistantDoor'
import {
  installedSiblings,
  moduleCount,
  railCounts,
  railExpanded,
  railWidth,
  refreshRailCounts,
  siblingHref,
  sortSiblings,
  toggleRail,
} from '@/composables/shellRail'
import UserMenu from './UserMenu.vue'
import { installLinkPrefetch } from '@/utils/speculate'

const props = defineProps({
  modules: { type: Array, default: () => [] },
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
  props.modules.filter((module) => module.key !== 'avisos'),
)
const avisos = computed(() =>
  props.modules.some((module) => module.key === 'avisos'),
)
// What waits in each module, read again when the worker comes back to the
// window, moves to another page, or every two minutes while it is in view.
const counts = computed(() =>
  Object.fromEntries(
    props.modules.map((module) => [
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
const siblings = sortSiblings(installedSiblings())
// Hovering a sibling app (data-sibling) fetches its page before the click.
installLinkPrefetch()
const siblingLinks = computed(() => {
  const label = props.modules.find(
    (module) => module.key === props.active,
  )?.label
  return Object.fromEntries(
    siblings.map((app) => [app.key, siblingHref(app, route.fullPath, label)]),
  )
})

// Collapsed: one «Otras apps» button opens them beside the rail. The first
// app takes the focus and Tab stays in the menu; Esc (from anywhere) or
// another page closes it.
const appsOpen = ref(false)
const appsButton = ref(null)
const appsMenu = ref(null)
const appsMenuStyle = ref({})
function toggleApps() {
  if (appsOpen.value) return closeApps()
  const box = appsButton.value?.getBoundingClientRect()
  const top = Math.max(
    8,
    Math.min((box?.top ?? 8) - 8, window.innerHeight - 260),
  )
  appsMenuStyle.value = { left: `${railWidth.value + 4}px`, top: `${top}px` }
  appsOpen.value = true
  nextTick(() => appsMenu.value?.querySelector('a')?.focus())
}
function closeApps() {
  appsOpen.value = false
  nextTick(() => appsButton.value?.focus())
}
useShellLayer(appsMenu, {
  open: () => appsOpen.value,
  onKeydown(event) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    closeApps()
  },
})
watch(
  () => route.fullPath,
  () => (appsOpen.value = false),
)
watch(railExpanded, () => (appsOpen.value = false))
</script>
