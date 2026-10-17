<template>
  <BottomSheet
    :open="modelValue"
    layer="more"
    :aria-label="__('More')"
    @update:open="(open) => !open && close()"
  >
    <template #header>
      <!-- Who is signed in: the sheet's first line, not a button. -->
      <div class="flex items-center gap-3 pb-2">
        <span
          class="flex size-10 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-gray-3 text-sm font-semibold"
        >
          <img
            v-if="user.image"
            :src="user.image"
            alt=""
            class="size-full object-cover"
          />
          <span v-else>{{ initials }}</span>
        </span>
        <div class="min-w-0 flex-1">
          <div class="truncate font-semibold">
            {{ user.full_name || user.name }}
          </div>
          <div v-if="user.puesto" class="truncate text-sm text-ink-gray-6">
            {{ user.puesto }}
          </div>
        </div>
      </div>
    </template>

    <div class="space-y-6 pb-2">
      <!-- Door 2 of «Pregúntale a Muelle» (SHELL-S2, design/ASSISTANT.md):
           one full-width tonal row at the top, only when the assistant is on. -->
      <button
        v-if="assistantEnabled"
        type="button"
        class="flex min-h-12 w-full items-center gap-3 rounded-xl bg-surface-gray-2 px-4 text-left text-base font-medium"
        data-testid="more-assistant"
        @click="askMuelle"
      >
        <span class="lucide-sparkles size-5" aria-hidden="true" />
        {{ __('Ask Muelle') }}
      </button>

      <!-- The bar's modules are not repeated here: only what the bar leaves out. -->
      <section v-if="extraModules.length" aria-labelledby="more-modules">
        <h2
          id="more-modules"
          class="pb-2 text-sm font-semibold text-ink-gray-7"
        >
          {{ __('Modules') }}
        </h2>
        <div class="grid grid-cols-3 gap-2">
          <RouterLink
            v-for="module in extraModules"
            :key="module.key"
            :to="module.to"
            :class="TILE"
            @click="close"
          >
            <span :class="[module.icon, 'size-5']" aria-hidden="true" />
            {{ module.label }}
          </RouterLink>
        </div>
      </section>

      <!-- Escáner and the other apps: the stock tools next to the modules. -->
      <section v-if="siblings.length" aria-labelledby="more-apps">
        <h2 id="more-apps" class="pb-2 text-sm font-semibold text-ink-gray-7">
          {{ __('Other apps') }}
        </h2>
        <div class="grid grid-cols-3 gap-2">
          <a
            v-for="app in siblings"
            :key="app.key"
            :href="app.href"
            :data-sibling="app.key"
            :class="TILE"
          >
            <span :class="[app.icon, 'size-5']" aria-hidden="true" />
            {{ app.label }}
          </a>
        </div>
      </section>

      <!-- Ventas on a phone: the daily lists. The rest sits under Configuración. -->
      <VentasSections v-if="ventas" part="daily" @navigate="close" />

      <section aria-labelledby="more-settings" class="space-y-1">
        <h2
          id="more-settings"
          class="pb-1 text-sm font-semibold text-ink-gray-7"
        >
          {{ __('Settings') }}
        </h2>
        <VentasSections v-if="ventas" part="rest" @navigate="close" />

        <button
          type="button"
          :class="ROW"
          :aria-expanded="customizing"
          @click="customizing = !customizing"
        >
          <span
            class="lucide-layout-list size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="flex-1">{{ __('Customize bar') }}</span>
          <span
            class="lucide-chevron-down size-4 text-ink-gray-6"
            aria-hidden="true"
          />
        </button>
        <div v-if="customizing" class="space-y-1 pb-2 pl-1">
          <p class="pb-1 text-sm text-ink-gray-6">
            {{
              __(
                'Choose the order of the bottom bar. Hoy always comes first when available.',
              )
            }}
          </p>
          <div
            v-for="(key, index) in order"
            :key="key"
            class="flex min-h-11 items-center gap-2 rounded-lg bg-surface-gray-1 px-3"
          >
            <span class="flex-1">{{ labelOf(key) }}</span>
            <button
              type="button"
              class="flex size-11 items-center justify-center rounded-lg"
              :aria-label="__('Move up {0}', [labelOf(key)])"
              :disabled="index === 0"
              @click="move(index, -1)"
            >
              <span class="lucide-arrow-up size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="flex size-11 items-center justify-center rounded-lg"
              :aria-label="__('Move down {0}', [labelOf(key)])"
              :disabled="index === order.length - 1"
              @click="move(index, 1)"
            >
              <span class="lucide-arrow-down size-4" aria-hidden="true" />
            </button>
          </div>
          <p v-if="saveMessage" role="status" class="text-sm text-ink-gray-7">
            {{ saveMessage }}
          </p>
          <Button
            :label="__('Save bar')"
            variant="solid"
            class="w-full"
            @click="saveOrder"
          />
        </div>

        <div class="flex min-h-11 items-center gap-2.5 px-1 py-1">
          <span
            class="lucide-palette size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="flex-1 text-sm">{{ __('Theme') }}</span>
          <div class="flex gap-1" role="group" :aria-label="__('Theme')">
            <button
              v-for="choice in THEME_CHOICES"
              :key="choice.value"
              type="button"
              class="flex size-11 items-center justify-center rounded-lg"
              :class="theme === choice.value ? 'bg-surface-gray-3' : ''"
              :aria-label="__(choice.label)"
              :aria-pressed="theme === choice.value"
              @click="setTheme(choice.value)"
            >
              <span :class="[choice.icon, 'size-4']" aria-hidden="true" />
            </button>
          </div>
        </div>

        <!-- Where Muelle opens (was Hoy's footer): a setting, so it lives here. -->
        <div class="flex min-h-11 items-center gap-2.5 px-1 py-1">
          <span
            class="lucide-door-open size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          <label for="more-landing" class="flex-1 text-sm">{{
            __('Open Muelle on')
          }}</label>
          <select
            id="more-landing"
            class="h-11 max-w-[55%] rounded-lg border-0 bg-surface-gray-2 pl-3 pr-8 text-sm"
            :value="landing"
            data-testid="more-landing"
            @change="chooseLanding($event.target.value)"
          >
            <option
              v-for="option in landingChoices"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>

        <button
          v-if="helpAvailable"
          type="button"
          :class="ROW"
          data-testid="more-help"
          @click="openHelp"
        >
          <span
            class="lucide-circle-help size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          {{ __('Help') }}
        </button>
        <button v-if="ventas" type="button" :class="ROW" @click="openSettings">
          <span
            class="lucide-settings size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          {{ __('Ventas settings') }}
        </button>
        <button
          v-if="installAvailable"
          type="button"
          :class="ROW"
          @click="installApp"
        >
          <span
            class="lucide-download size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          {{ __('Install app') }}
        </button>
        <a v-if="user.is_admin" href="/desk" :class="ROW">
          <span
            class="lucide-layout-grid size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          {{ __('Administration') }}
        </a>
        <button
          type="button"
          :class="[ROW, 'text-ink-red-8']"
          @click="session.logout.submit()"
        >
          <span class="lucide-log-out size-4" aria-hidden="true" />
          {{ __('Sign out') }}
        </button>
      </section>
    </div>
  </BottomSheet>
</template>
<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, ref } from 'vue'
import { useShellLayer } from '@/composables/shellKeyboard'
import { Button, toast } from 'frappe-ui'
import { landingOptions, saveLanding } from '@/composables/useHoy'
import {
  assistantEnabled,
  loadStatus,
  openAssistant,
} from '@/components/assistant/useAssistant'
import { useRoute, useRouter } from 'vue-router'
import { sessionStore } from '@/stores/session'
import {
  moduleKeyFor,
  navSlots,
  openSalesSettings,
  saveNavSlots,
  shellBoot,
} from '@/composables/muelleShell'
import {
  installedSiblings,
  scanPickHref,
  siblingHref,
  sortSiblings,
} from '@/composables/shellRail'
import { installApp, installAvailable } from '@/composables/shellInstall'
import { installLinkPrefetch } from '@/utils/speculate'
import { THEME_CHOICES, useShellTheme } from '@/composables/shellTheme'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
import { BottomSheet } from '@/components/ui'

// Pressing a sibling app (data-sibling) starts fetching its page.
installLinkPrefetch()

const props = defineProps({
  modelValue: Boolean,
  modules: { type: Array, default: () => [] },
  boot: Object,
})
const emit = defineEmits(['update:modelValue'])
const VentasSections = defineAsyncComponent(
  () => import('./VentasSections.vue'),
)
const session = sessionStore()
const { theme, setTheme } = useShellTheme()
const customizing = ref(false)
const saveMessage = ref('')
const user = computed(() => props.boot?.user || {})
const ventas = computed(() => moduleEnabled(props.boot, 'ventas'))
// «Abrir Muelle en»: Automático, Hoy, or one of my modules. A saved module I
// no longer have reads as Automático (the server falls back the same way).
const landingChoices = computed(() => landingOptions(props.modules))
const savedLanding = ref(props.boot?.landing || '')
const landing = computed(() =>
  landingChoices.value.some((option) => option.value === savedLanding.value)
    ? savedLanding.value
    : '',
)
async function chooseLanding(value) {
  const previous = savedLanding.value
  savedLanding.value = value
  try {
    await saveLanding(value)
    if (shellBoot.value) shellBoot.value.landing = value
    toast.success(
      value
        ? __('Muelle will open on {0}.', [
            landingChoices.value.find((option) => option.value === value)
              ?.label || value,
          ])
        : __('Muelle will open where your puesto works.'),
    )
  } catch (error) {
    savedLanding.value = previous
    toast.error(
      error?.messages?.[0] || __('Could not save your choice. Retry.'),
    )
  }
}
const initials = computed(() => {
  const parts = String(user.value.full_name || user.value.name || '?')
    .trim()
    .split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
})
// Modules the bottom bar does not hold; the bar's own are one tap away below.
const extraModules = computed(() =>
  props.modules.filter(
    (module) => !navSlots.value.some((slot) => slot.key === module.key),
  ),
)
// Sibling SPAs open with the way back to the page the worker left.
const route = useRoute()
const moduleLabel = computed(
  () =>
    props.modules.find((module) => module.key === moduleKeyFor(route))?.label,
)
// Escáner goes to the picker with the way back to this page (the same link the
// bar's scan icon uses), wherever the bar is not showing it.
const siblings = computed(() =>
  sortSiblings(installedSiblings()).map((app) => ({
    ...app,
    href:
      app.key === 'scan'
        ? scanPickHref(route.fullPath, moduleLabel.value)
        : siblingHref(app, route.fullPath, moduleLabel.value),
  })),
)
const order = ref(
  [
    ...navSlots.value.map((module) => module.key),
    ...props.modules.map((module) => module.key),
  ].filter((key, index, all) => all.indexOf(key) === index),
)
const labelOf = (key) =>
  props.modules.find((module) => module.key === key)?.label || key
function move(index, step) {
  const next = order.value.slice()
  const [key] = next.splice(index, 1)
  next.splice(index + step, 0, key)
  order.value = next
}
async function saveOrder() {
  try {
    await saveNavSlots(order.value)
    saveMessage.value = __('Bar saved.')
  } catch {
    saveMessage.value = __('We could not save the bar. Try again.')
  }
}
function close() {
  emit('update:modelValue', false)
}
// The shell's layer keys: Tab cycles inside the sheet and Esc answers from
// wherever the focus went (the sheet's element is the one with the layer name).
const dialog = ref(null)
useShellLayer(dialog, {
  onKeydown(event) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    close()
  },
})
onMounted(() =>
  nextTick(() => {
    dialog.value = document.querySelector('[data-shell-layer="more"]')
  }),
)
// The assistant's door shows once its status says it is on (cached call).
loadStatus()
function askMuelle() {
  close()
  openAssistant()
}
// «Ayuda» comes from doco's support launcher when the site has it; on phone
// the shell hides the floating pill and offers it here.
const helpAvailable = typeof window.docoSupport?.openHelp === 'function'
function openHelp() {
  close()
  window.docoSupport.openHelp()
}
const router = useRouter()
function openSettings() {
  close()
  openSalesSettings(router)
}

// One tile style for modules and apps; one row style for settings.
const TILE =
  'flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl bg-surface-gray-1 text-sm'
const ROW =
  'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1 text-left text-sm'
</script>
