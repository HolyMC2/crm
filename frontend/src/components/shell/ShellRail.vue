<template>
  <nav
    class="relative flex h-full flex-none flex-col gap-1 border-r border-outline-gray-1 bg-surface-base py-3 transition-[width] duration-150 ease-out motion-reduce:transition-none"
    :class="expanded ? 'items-stretch px-2' : 'items-center'"
    :style="{ width: `${railWidth}px` }"
    :aria-label="__('Apps')"
    :data-rail="expanded ? 'expanded' : 'collapsed'"
  >
    <div
      class="mb-2 flex flex-none items-center gap-2.5"
      :class="expanded ? 'px-0.5' : 'justify-center'"
    >
      <span
        class="flex size-9 flex-none items-center justify-center rounded-lg bg-[var(--muelle-accent)] text-sm font-bold text-[var(--muelle-accent-ink)]"
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
      class="flex flex-none items-center rounded-lg text-ink-gray-6 hover:bg-surface-gray-2"
      :class="ROW[expanded ? 'wide' : 'icon']"
      :aria-label="__('Search')"
      :title="searchHint"
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
          class="rounded border border-outline-gray-2 px-1 font-sans text-xs text-ink-gray-5"
          aria-hidden="true"
          >{{ paletteKey }}</kbd
        >
      </template>
    </button>
    <div
      class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none]"
      :class="expanded ? 'items-stretch' : 'items-center'"
    >
      <RouterLink
        v-for="module in apps"
        :key="module.key"
        :to="module.to"
        :title="expanded ? undefined : module.label"
        :aria-label="module.label"
        :aria-current="module.key === active ? 'page' : undefined"
        :data-module="module.key"
        class="flex flex-none items-center rounded-lg"
        :class="[
          ROW[expanded ? 'wide' : 'icon'],
          module.key === active
            ? 'bg-surface-gray-3 font-medium text-ink-gray-9'
            : 'text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8',
        ]"
      >
        <span
          :class="[module.icon, 'size-[18px] flex-none']"
          aria-hidden="true"
        />
        <span v-if="expanded" class="truncate" aria-hidden="true">{{
          module.label
        }}</span>
      </RouterLink>
      <template v-if="siblings.length">
        <div
          v-if="expanded"
          class="flex-none px-2.5 pb-0.5 pt-3 text-xs font-medium text-ink-gray-5"
        >
          {{ __('Other apps') }}
        </div>
        <hr
          v-else
          class="my-1.5 w-6 flex-none border-outline-gray-2"
          aria-hidden="true"
        />
        <a
          v-for="app in siblings"
          :key="app.key"
          :href="siblingLinks[app.key]"
          :title="expanded ? undefined : app.label"
          :aria-label="app.label"
          :data-sibling="app.key"
          class="flex flex-none items-center rounded-lg text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8"
          :class="ROW[expanded ? 'wide' : 'icon']"
        >
          <span
            :class="[app.icon, 'size-[18px] flex-none']"
            aria-hidden="true"
          />
          <template v-if="expanded">
            <span class="flex-1 truncate" aria-hidden="true">{{
              app.label
            }}</span>
            <span
              class="lucide-arrow-up-right size-3.5 flex-none text-ink-gray-4"
              aria-hidden="true"
            />
          </template>
        </a>
      </template>
    </div>
    <button
      class="flex flex-none items-center rounded-lg text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8"
      :class="ROW[expanded ? 'wide' : 'icon']"
      :aria-label="toggleLabel"
      :aria-expanded="expanded"
      :title="`${toggleLabel} (${sidebarKey})`"
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
          toggleLabel
        }}</span>
        <kbd
          class="rounded border border-outline-gray-2 px-1 font-sans text-xs text-ink-gray-5"
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
    <UserMenu :ventas="ventas" :expanded="expanded" />
  </nav>
</template>
<script setup>
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { keyLabel, searchEntryHint } from '@/composables/shellKeyboard'
import {
  installedSiblings,
  railExpanded,
  railWidth,
  siblingHref,
  toggleRail,
} from '@/composables/shellRail'
import UserMenu from './UserMenu.vue'

const props = defineProps({
  modules: { type: Array, default: () => [] },
  active: { type: String, default: '' },
  ventas: Boolean,
})
defineEmits(['palette'])

// One row shape per width: an icon tile, or a full-width row with the name.
const ROW = Object.freeze({
  icon: 'size-10 justify-center',
  wide: 'h-9 w-full gap-3 px-2.5 text-sm',
})
// «Buscar o ir a… (Ctrl+K) · Buscar registros (Ctrl+G)», ⌘ on Apple.
const { label: searchHint, aria: searchKeys } = searchEntryHint()
const paletteKey = keyLabel('mod+k')
const sidebarKey = keyLabel('[')
const AvisosBell = defineAsyncComponent(
  () => import('@/components/avisos/AvisosBell.vue'),
)
const route = useRoute()
const expanded = railExpanded
const toggleLabel = computed(() =>
  expanded.value ? __('Collapse sidebar') : __('Expand sidebar'),
)
const apps = computed(() =>
  props.modules.filter((module) => module.key !== 'avisos'),
)
const avisos = computed(() =>
  props.modules.some((module) => module.key === 'avisos'),
)
// Sibling SPAs (Escáner, POS, Taller…) open with the way back to this page:
// «Volver a Productos» in Escáner returns to the record the worker left.
const siblings = installedSiblings()
const siblingLinks = computed(() => {
  const label = props.modules.find((module) => module.key === props.active)
    ?.label
  return Object.fromEntries(
    siblings.map((app) => [app.key, siblingHref(app, route.fullPath, label)]),
  )
})
</script>
