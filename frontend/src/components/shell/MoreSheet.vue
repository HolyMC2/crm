<template>
  <div
    class="fixed inset-0 z-40"
    role="dialog"
    aria-modal="true"
    :aria-label="__('More')"
  >
    <div class="absolute inset-0 bg-black/30" @click="close" />
    <div
      ref="sheet"
      class="absolute inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-surface-base pb-[env(safe-area-inset-bottom)] shadow-2xl"
      tabindex="-1"
      @keydown.esc="close"
    >
      <div class="sticky top-0 flex justify-center bg-surface-base pb-1 pt-2">
        <span
          class="h-1 w-10 rounded-full bg-surface-gray-4"
          aria-hidden="true"
        />
      </div>
      <div
        class="flex items-center gap-3 border-b border-outline-gray-1 px-4 pb-3"
      >
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
        <button
          class="flex size-11 items-center justify-center rounded-lg text-ink-gray-7"
          :aria-label="__('Close')"
          @click="close"
        >
          <span class="lucide-x size-5" aria-hidden="true" />
        </button>
      </div>

      <section class="px-4 pt-4">
        <h2
          class="pb-2 text-xs font-semibold uppercase tracking-wide text-ink-gray-6"
        >
          {{ __('Modules') }}
        </h2>
        <div class="grid grid-cols-3 gap-2">
          <RouterLink
            v-for="module in modules"
            :key="module.key"
            :to="module.to"
            class="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl bg-surface-gray-1 text-sm"
            @click="close"
          >
            <span :class="[module.icon, 'size-5']" aria-hidden="true" />
            {{ module.label }}
          </RouterLink>
        </div>
      </section>

      <VentasSections v-if="ventas" @navigate="close" />

      <section v-if="siblings.length" class="px-4 pt-5">
        <h2
          class="pb-2 text-xs font-semibold uppercase tracking-wide text-ink-gray-6"
        >
          {{ __('Other apps') }}
        </h2>
        <div class="grid grid-cols-3 gap-2">
          <a
            v-for="app in siblings"
            :key="app.key"
            :href="app.path"
            class="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl bg-surface-gray-1 text-sm"
          >
            <span :class="[app.icon, 'size-5']" aria-hidden="true" />
            {{ app.label }}
          </a>
        </div>
      </section>

      <section class="px-4 pt-5">
        <button
          class="flex min-h-11 w-full items-center justify-between rounded-lg text-left"
          :aria-expanded="customizing"
          @click="customizing = !customizing"
        >
          <span class="font-medium">{{ __('Customize bar') }}</span>
          <span class="lucide-chevron-down size-4" aria-hidden="true" />
        </button>
        <div v-if="customizing" class="space-y-1 pb-2">
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
              class="flex size-10 items-center justify-center rounded-lg"
              :aria-label="__('Move up {0}', [labelOf(key)])"
              :disabled="index === 0"
              @click="move(index, -1)"
            >
              <span class="lucide-arrow-up size-4" aria-hidden="true" />
            </button>
            <button
              class="flex size-10 items-center justify-center rounded-lg"
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
      </section>

      <section class="border-t border-outline-gray-1 mt-4 px-4 py-3">
        <div
          class="pb-2 text-xs font-semibold uppercase tracking-wide text-ink-gray-6"
        >
          {{ __('Theme') }}
        </div>
        <div class="flex gap-2" role="group" :aria-label="__('Theme')">
          <button
            v-for="choice in THEME_CHOICES"
            :key="choice.value"
            class="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm"
            :class="
              theme === choice.value
                ? 'bg-surface-gray-3 font-semibold'
                : 'bg-surface-gray-1'
            "
            :aria-pressed="theme === choice.value"
            @click="setTheme(choice.value)"
          >
            <span :class="[choice.icon, 'size-4']" aria-hidden="true" />
            {{ __(choice.label) }}
          </button>
        </div>
        <button
          v-if="ventas"
          class="mt-2 flex min-h-11 w-full items-center gap-2.5 text-left"
          @click="openSettings"
        >
          <span
            class="lucide-settings size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          {{ __('Ventas settings') }}
        </button>
        <button
          v-if="installAvailable"
          class="flex min-h-11 w-full items-center gap-2.5 text-left"
          @click="installApp"
        >
          <span
            class="lucide-download size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          {{ __('Install app') }}
        </button>
        <a
          v-if="user.is_admin"
          href="/desk"
          class="flex min-h-11 w-full items-center gap-2.5"
        >
          <span
            class="lucide-layout-grid size-4 text-ink-gray-6"
            aria-hidden="true"
          />
          {{ __('Administration') }}
        </a>
        <button
          class="flex min-h-11 w-full items-center gap-2.5 text-left text-ink-red-8"
          @click="session.logout.submit()"
        >
          <span class="lucide-log-out size-4" aria-hidden="true" />
          {{ __('Sign out') }}
        </button>
      </section>
    </div>
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, ref } from 'vue'
import { Button } from 'frappe-ui'
import { sessionStore } from '@/stores/session'
import { useRouter } from 'vue-router'
import {
  navSlots,
  openSalesSettings,
  saveNavSlots,
} from '@/composables/muelleShell'
import { installApp, installAvailable } from '@/composables/shellInstall'
import { THEME_CHOICES, useShellTheme } from '@/composables/shellTheme'
import { SIBLING_APPS, moduleEnabled } from '@/vendor/muelle-shell/contracts'

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
const sheet = ref(null)
const customizing = ref(false)
const saveMessage = ref('')
const user = computed(() => props.boot?.user || {})
const ventas = computed(() => moduleEnabled(props.boot, 'ventas'))
const initials = computed(() => {
  const parts = String(user.value.full_name || user.value.name || '?')
    .trim()
    .split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
})
const SIBLING_APP_NAMES = {
  pos: 'posawesome',
  taller: 'taller',
  clinica: 'clinica',
  mercado: 'mercado',
  scan: 'scanner_kit',
}
const siblings = computed(() =>
  SIBLING_APPS.filter((app) =>
    (window.installed_apps || []).includes(SIBLING_APP_NAMES[app.key]),
  ),
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
const router = useRouter()
function openSettings() {
  close()
  openSalesSettings(router)
}
onMounted(() => nextTick(() => sheet.value?.focus()))
</script>
