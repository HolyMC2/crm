<template>
  <div
    class="flex h-[100dvh] min-w-0 overflow-hidden bg-surface-base text-ink-gray-9"
  >
    <a
      href="#muelle-content"
      class="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface-base focus:p-3"
      >{{ __('Skip to content') }}</a
    >
    <ShellRail
      v-if="!phone"
      :modules="shellModules"
      :active="activeKey"
      :ventas="ventasEnabled"
      @palette="openPalette('all')"
    />
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <!-- One compact row on phone. It slides away while the worker scrolls
           down and comes back on the first scroll up; drill-down records
           (deal, inbox thread) bring their own identity row instead, and pages
           with `meta.ownPhoneHeader` (the Agenda's calendar app bar) their own. -->
      <!-- The phone's top bar is the shared AppBar. Drill-down records (a
           Cobranza or Compras record, Producto, Equipo's vacation sheet) take
           a back arrow to their list, from meta.listParent. -->
      <AppBar
        v-if="phone && !drillDown && !route.meta.ownPhoneHeader"
        data-testid="shell-header"
        :back="backTo"
        :title="headerTitle"
        :bell-active="activeKey === 'avisos'"
        class="transition-[margin] duration-200"
        :style="headerHidden ? { marginTop: `-${headerHeight}px` } : null"
      >
        <template #title>
          <!-- Ventas pages may teleport their own header (breadcrumbs + actions)
               here; while none arrives the route's title stands in for it. -->
          <div
            v-if="activeKey === 'ventas'"
            id="app-header"
            class="min-w-0 flex-1 [&:not(:has(*))]:hidden"
          />
          <h1
            data-testid="shell-title"
            class="line-clamp-2 min-w-0 flex-1 self-center break-words px-3 text-lg font-semibold leading-snug [#app-header:has(*)+&]:hidden"
          >
            {{ headerTitle }}
          </h1>
        </template>
        <template #actions>
          <!-- Escáner is the shell's scanner: scan a code, land on its artículo. -->
          <a
            v-if="scanHref"
            :href="scanHref"
            class="flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
            :aria-label="__('Scan a code')"
            :title="__('Scan a code')"
            data-testid="shell-scan"
          >
            <span class="lucide-scan-barcode size-6" aria-hidden="true" />
          </a>
          <button
            type="button"
            class="flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
            :aria-label="__('Search')"
            :title="searchHint"
            :aria-keyshortcuts="searchKeys"
            @click="openPalette('all')"
          >
            <span class="lucide-search size-6" aria-hidden="true" />
          </button>
        </template>
      </AppBar>
      <div
        v-if="!online"
        role="status"
        class="shrink-0 bg-surface-amber-1 px-4 py-2 text-sm text-ink-amber-8"
      >
        {{
          __(
            'Offline — you see what was last loaded; your changes stay as a draft.',
          )
        }}
      </div>
      <div
        v-if="shellLoading && !shellBoot"
        role="status"
        class="flex flex-1 items-center justify-center p-6 text-sm text-ink-gray-6"
      >
        {{ __('Opening Muelle…') }}
      </div>
      <section
        v-else-if="blocked"
        role="alert"
        class="mx-auto w-full max-w-xl space-y-4 p-6"
      >
        <h1 class="text-xl font-semibold">
          {{ __('We could not open {0}', [blockedLabel]) }}
        </h1>
        <p class="text-sm text-ink-gray-7">
          {{ blocked.reason || blockedFallback }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button :label="__('Retry permissions')" @click="reload" />
          <Button :label="__('Ask for access')" @click="copyRequest" />
          <Button
            v-if="landing"
            :label="__('Go to {0}', [landing.label])"
            @click="router.push(landing.to)"
          />
          <Button :label="__('Back')" @click="router.back()" />
        </div>
        <p v-if="copied" role="status" class="text-sm">{{ copied }}</p>
      </section>
      <main
        v-else
        id="muelle-content"
        class="flex min-h-0 min-w-0 flex-1 overflow-hidden"
        @scroll.capture.passive="onContentScroll"
      >
        <slot />
      </main>
      <ShellBottomNav
        v-if="phone && navVisible"
        :slots="navSlots"
        :active="activeKey"
        @more="moreOpen = true"
      />
    </div>
    <!-- «Pregúntale a Muelle» (SHELL-S2): a sheet on phone, a docked panel
         beside the page on a wide desktop. Staff only; renders nothing until
         a door opens it. -->
    <AssistantSheet v-if="shellBoot" />
    <MoreSheet
      v-if="moreOpen"
      v-model="moreOpen"
      :modules="shellModules"
      :boot="shellBoot"
    />
    <CommandPalette
      v-if="paletteOpen"
      v-model="paletteOpen"
      v-model:mode="paletteMode"
      :focus-key="paletteFocus"
    />
    <ShortcutSheet v-if="shortcutSheet.open" />
  </div>
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
import { useRoute, useRouter } from 'vue-router'
import { useOnline } from '@vueuse/core'
import { Button } from 'frappe-ui'
import { isMobile } from '@/composables/breakpoint'
import { keyboardOpen, watchKeyboard } from '@/composables/keyboard'
import { mobileView } from '@/composables/mobileView'
import {
  firstModuleRoute,
  loadShell,
  moduleKeyFor,
  navSlots,
  shellBoot,
  shellError,
  shellLoading,
  shellModules,
} from '@/composables/muelleShell'
import {
  openShortcutSheet,
  searchEntryHint,
  shellCreate,
  shortcutSheet,
  useShellKeyboard,
} from '@/composables/shellKeyboard'
import { scanPickHref, toggleRail } from '@/composables/shellRail'
import { createTargetFor } from '@/utils/shellCreate'
import { applyShellAppearance } from '@/utils/shellAppearance'
import { moduleRefusal } from '@/utils/shellRoutes'
import { shellTitle } from '@/utils/shellTitle'
import { moduleEnabled, moduleMeta } from '@/vendor/muelle-shell/contracts'
import AppBar from '@/components/ui/AppBar.vue'
import ShellRail from './ShellRail.vue'
import ShellBottomNav from './ShellBottomNav.vue'

const MoreSheet = defineAsyncComponent(() => import('./MoreSheet.vue'))
const CommandPalette = defineAsyncComponent(
  () => import('./CommandPalette.vue'),
)
const ShortcutSheet = defineAsyncComponent(() => import('./ShortcutSheet.vue'))
const AssistantSheet = defineAsyncComponent(
  () => import('@/components/assistant/AssistantSheet.vue'),
)
const AvisosBell = defineAsyncComponent(
  () => import('@/components/avisos/AvisosBell.vue'),
)

const route = useRoute(),
  router = useRouter()
const online = useOnline()
const phone = isMobile
const paletteOpen = ref(false),
  paletteMode = ref('all'),
  paletteFocus = ref(0),
  moreOpen = ref(false),
  copied = ref('')
const activeKey = computed(() => moduleKeyFor(route))
const activeModule = computed(() =>
  shellModules.value.find((module) => module.key === activeKey.value),
)
const ventasEnabled = computed(() => moduleEnabled(shellBoot.value, 'ventas'))
const avisosEnabled = computed(() => moduleEnabled(shellBoot.value, 'avisos'))
// The refusal answers for the module the route belongs to, never another one.
const blocked = computed(() =>
  moduleRefusal(route, activeKey.value, {
    boot: shellBoot.value,
    error: shellError.value,
  }),
)
// A drill-down record names its list in meta.listParent; its back arrow goes to
// the module's list page (the route the bottom bar or «Más» opens).
const backTo = computed(() =>
  route.meta.listParent ? activeModule.value?.to || true : false,
)
const blockedLabel = computed(() => moduleMeta(activeKey.value)?.label || '')
const blockedFallback = computed(() =>
  __(
    'You do not have permission to see {0}. Ask your manager for access and try again.',
    [blockedLabel.value],
  ),
)
// Meanwhile the worker keeps working in the first module they do have.
const landing = computed(() =>
  firstModuleRoute(shellBoot.value, activeKey.value),
)

// Drill-down panes (inbox thread, deal 360) own the phone screen; the
// on-screen keyboard also hides the bar.
const drillDown = computed(
  () =>
    /^\/(inbox|(ventas\/)?deal\/)/.test(route.path) &&
    mobileView.value !== 'list',
)
const navVisible = computed(() => !keyboardOpen.value && !drillDown.value)

// Phone header hides on scroll down and returns on scroll up. Only vertical
// scrolls of the page's own scrollers count (chip rows scroll sideways).
const HEADER_HEIGHT = 56 // AppBar's min-h-14
const headerHeight = HEADER_HEIGHT
const headerHidden = ref(false)
const lastScroll = new WeakMap()
function onContentScroll(event) {
  const el = event.target
  if (!phone.value || !(el instanceof Element)) return
  const top = el.scrollTop
  const previous = lastScroll.get(el) ?? 0
  lastScroll.set(el, top)
  if (top === previous) return
  if (top <= HEADER_HEIGHT) headerHidden.value = false
  else if (top - previous > 6) headerHidden.value = true
  else if (previous - top > 6) headerHidden.value = false
}
watch(
  () => route.path,
  () => (headerHidden.value = false),
)

function reload() {
  loadShell({ refresh: true }).catch(() => {})
}
// Access requests of the newer modules; the chain in copyRequest answers for the rest.
const MODULE_REQUESTS = {
  manual: () =>
    __(
      'I need to read the shop manual in Muelle (Manual de la tienda): please check that my user is an active team account.',
    ),
  encuestas: () =>
    __(
      'I need access to Encuestas: read permission for Quality Feedback in my company so I can follow up on unhappy customers.',
    ),
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}
async function copyRequest() {
  const own = MODULE_REQUESTS[activeKey.value]
  if (own) return copyText(own())
  const text =
    activeKey.value === 'agenda'
      ? __(
          'I need access to the Agenda in Muelle: read permission for Event as a staff account, so I can see and schedule my appointments.',
        )
      : activeKey.value === 'pendientes'
        ? __(
            'I need access to Pendientes: permission to read my ToDo (and Sales tasks, if I sell). Please review my user.',
          )
        : activeKey.value === 'cobranza'
          ? __(
              'I need access to Cobranza: read permission for Sales Invoice so I can follow what customers owe.',
            )
          : activeKey.value === 'gastos'
            ? __(
                'I need access to Gastos: read permission for Purchase Invoice so I can follow supplier bills and payments.',
              )
            : activeKey.value === 'resultados'
              ? __(
                  'I need access to Resultados in Muelle: read permission for the sales, cash or repair numbers of my shop.',
                )
              : activeKey.value === 'compras'
                ? __(
                    'I need access to Compras: read permission for Purchase Order so I can follow purchases.',
                  )
                : activeKey.value === 'productos'
                  ? __(
                      'I need access to Productos: read permission for Item so I can see prices and stock.',
                    )
                  : activeKey.value === 'garantias'
                    ? __(
                        'I need access to Garantías: read permission for Warranty Claim in my company so I can follow warranty and return cases.',
                      )
                    : activeKey.value === 'equipo'
                      ? __(
                          'I need access to Equipo: my puesto must be Dueño or Encargado so I can follow the team, its shifts and vacations.',
                        )
                      : activeKey.value === 'archivos'
                        ? __(
                            'I need access to Archivos in Muelle (documents of my company) to receive and classify receipts.',
                          )
                        : activeKey.value === 'avisos'
                          ? __(
                              'I need my Muelle user to be an active staff (System User) account to see my Avisos; I want to resume them after the change.',
                            )
                          : __(
                              'I need access to Contactos and read permission on the native records to continue. Please check my create/edit permissions if I need to save data.',
                            )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}

// ⌘K / ⌘G open the palette in that mode; in an open palette they switch the
// mode (the text stays) and the same key again refocuses the input.
function openPalette(mode) {
  paletteMode.value = mode
  if (paletteOpen.value) paletteFocus.value += 1
  else paletteOpen.value = true
}
function openHelp() {
  paletteOpen.value = false
  openShortcutSheet()
}
const { label: searchHint, aria: searchKeys } = searchEntryHint()
const scanHref = computed(() =>
  scanPickHref(route.fullPath, activeModule.value?.label),
)
// `[` shows or hides the app names of the desktop rail (phone has no rail).
function toggleSidebar() {
  if (phone.value) return false
  toggleRail()
}
useShellKeyboard({
  openPalette,
  openHelp,
  modules: shellModules,
  router,
  toggleSidebar,
})
// Every route names itself through meta.title (English source, es-MX catalog).
const headerTitle = computed(() => shellTitle(route, activeModule.value))
// «c» creates in the module the worker is in: the palette's create action for
// it. A page with its own create (a dialog on the list) answers first.
watch(
  () => createTargetFor(shellBoot.value, activeKey.value),
  (target) => {
    shellCreate.value = target && {
      id: target.id,
      run: () => router.push(target.href),
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => (shellCreate.value = null))
watch(
  headerTitle,
  (title) => {
    document.title = [title, 'Muelle'].filter(Boolean).join(' · ')
  },
  { immediate: true },
)
watch(
  () => shellBoot.value?.palette,
  (palette) => applyShellAppearance(palette),
  { immediate: true },
)
// Ask for the boot during setup: from onMounted the routed page would already
// have mounted (children mount first), fired its requests, then unmounted for
// «Opening Muelle…» and mounted again.
reload()
onMounted(watchKeyboard)
</script>
<style>
/* doco injects a floating «Ayuda» launcher (support_workflow.js) whose dragged
   position persists per browser; on phone it covered the header title. The
   shell offers «Ayuda» in the Más sheet instead. */
@media (max-width: 639px) {
  #muelle-support-workflow {
    display: none !important;
  }
}
</style>
