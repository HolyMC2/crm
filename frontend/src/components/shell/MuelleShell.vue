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
      @palette="paletteOpen = true"
    />
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        v-if="phone"
        class="flex min-h-[52px] shrink-0 items-center gap-1 border-b border-outline-gray-1 pl-3 pr-1 pt-[env(safe-area-inset-top)]"
      >
        <!-- Ventas pages teleport their own header (breadcrumbs + actions) here. -->
        <div
          v-if="activeKey === 'ventas'"
          id="app-header"
          class="min-w-0 flex-1"
        />
        <h1 v-else class="min-w-0 flex-1 truncate text-lg font-semibold">
          {{ route.meta.title || activeModule?.label || 'Muelle' }}
        </h1>
        <button
          class="flex size-11 flex-none items-center justify-center rounded-lg text-ink-gray-7 hover:bg-surface-gray-2"
          :aria-label="__('Search')"
          @click="paletteOpen = true"
        >
          <span class="lucide-search size-5" aria-hidden="true" />
        </button>
        <button
          v-if="ventasEnabled"
          class="flex size-11 flex-none items-center justify-center rounded-lg text-ink-gray-7 hover:bg-surface-gray-2"
          :aria-label="__('Notifications')"
          @click="router.push('/notifications')"
        >
          <span class="lucide-bell size-5" aria-hidden="true" />
        </button>
      </header>
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
        v-else-if="neutral && blocked"
        role="alert"
        class="mx-auto w-full max-w-xl space-y-4 p-6"
      >
        <h1 class="text-xl font-semibold">
          {{ __('We could not open Contactos') }}
        </h1>
        <p class="text-sm text-ink-gray-7">
          {{ blocked }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button :label="__('Retry permissions')" @click="reload" />
          <Button :label="__('Ask for access')" @click="copyRequest" />
          <Button :label="__('Back')" @click="router.back()" />
        </div>
        <p v-if="copied" role="status" class="text-sm">{{ copied }}</p>
      </section>
      <main
        v-else
        id="muelle-content"
        class="flex min-h-0 min-w-0 flex-1 overflow-hidden"
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
    <MoreSheet
      v-if="moreOpen"
      v-model="moreOpen"
      :modules="shellModules"
      :boot="shellBoot"
    />
    <CommandPalette v-if="paletteOpen" v-model="paletteOpen" />
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
import { mobileView } from '@/composables/mobileView'
import {
  loadShell,
  moduleKeyFor,
  navSlots,
  shellBoot,
  shellError,
  shellLoading,
  shellModules,
} from '@/composables/muelleShell'
import { useShellKeyboard } from '@/composables/shellKeyboard'
import { applyShellAppearance } from '@/utils/shellAppearance'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
import ShellRail from './ShellRail.vue'
import ShellBottomNav from './ShellBottomNav.vue'

const MoreSheet = defineAsyncComponent(() => import('./MoreSheet.vue'))
const CommandPalette = defineAsyncComponent(
  () => import('./CommandPalette.vue'),
)

const route = useRoute(),
  router = useRouter()
const online = useOnline()
const phone = isMobile
const paletteOpen = ref(false),
  moreOpen = ref(false),
  copied = ref('')
const activeKey = computed(() => moduleKeyFor(route))
const activeModule = computed(() =>
  shellModules.value.find((module) => module.key === activeKey.value),
)
const neutral = computed(() => activeKey.value === 'contactos')
const ventasEnabled = computed(() => moduleEnabled(shellBoot.value, 'ventas'))
const blocked = computed(
  () =>
    shellError.value ||
    (shellBoot.value && !moduleEnabled(shellBoot.value, 'contactos')
      ? shellBoot.value.modules?.contactos?.reason ||
        __(
          'You do not have permission to see Contactos. Ask your manager for access and try again.',
        )
      : ''),
)

// Drill-down panes (inbox thread, deal 360) own the phone screen; the
// on-screen keyboard also hides the bar.
const keyboardOpen = ref(false)
function onViewport() {
  const vv = window.visualViewport
  keyboardOpen.value = vv ? vv.height < window.innerHeight * 0.75 : false
}
const navVisible = computed(
  () =>
    !keyboardOpen.value &&
    !(/^\/(inbox|deal\/)/.test(route.path) && mobileView.value !== 'list'),
)

function reload() {
  loadShell({ refresh: true }).catch(() => {})
}
async function copyRequest() {
  const text = __(
    'I need access to Contactos and read permission on the native records to continue. Please check my create/edit permissions if I need to save data.',
  )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}

useShellKeyboard({
  openPalette: () => (paletteOpen.value = true),
  modules: shellModules,
  router,
})
watch(
  () => [activeModule.value?.label, route.meta.title],
  ([module, title]) => {
    document.title = [title || module, 'Muelle'].filter(Boolean).join(' · ')
  },
  { immediate: true },
)
watch(
  () => shellBoot.value?.palette,
  (palette) => applyShellAppearance(palette),
  { immediate: true },
)
onMounted(() => {
  reload()
  window.visualViewport?.addEventListener('resize', onViewport)
})
onBeforeUnmount(() =>
  window.visualViewport?.removeEventListener('resize', onViewport),
)
</script>
