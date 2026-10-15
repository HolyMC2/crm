<template>
  <div class="relative">
    <button
      ref="trigger"
      class="mt-1 flex items-center"
      :class="
        expanded
          ? 'h-11 w-full gap-2.5 rounded-lg px-1.5 text-left hover:bg-surface-gray-2'
          : 'size-10 justify-center rounded-full'
      "
      :aria-label="__('Account menu')"
      :aria-expanded="open"
      aria-haspopup="menu"
      data-testid="rail-account"
      @click="toggle"
    >
      <span
        class="flex size-8 flex-none items-center justify-center overflow-hidden rounded-full bg-surface-gray-3 text-xs font-semibold text-ink-gray-8"
      >
        <img
          v-if="user.image"
          :src="user.image"
          alt=""
          class="size-full object-cover"
        />
        <span v-else>{{ initials }}</span>
      </span>
      <span v-if="expanded" class="min-w-0 flex-1" aria-hidden="true">
        <span class="block truncate text-sm font-medium text-ink-gray-9">{{
          user.full_name || user.name
        }}</span>
        <span
          v-if="user.puesto"
          class="block truncate text-xs text-ink-gray-6"
          >{{ user.puesto }}</span
        >
      </span>
    </button>
    <template v-if="open">
      <div class="fixed inset-0 z-40" @click="open = false" />
      <div
        ref="menu"
        role="menu"
        class="fixed bottom-3 z-50 w-64 rounded-xl border border-outline-gray-2 bg-surface-base py-1.5 shadow-xl"
        :style="{ left: `${railWidth + 4}px` }"
      >
        <div class="border-b border-outline-gray-1 px-3.5 pb-2.5 pt-1.5">
          <div class="truncate text-sm font-semibold">
            {{ user.full_name || user.name }}
          </div>
          <div v-if="user.puesto" class="truncate text-xs text-ink-gray-6">
            {{ user.puesto }}
          </div>
        </div>
        <div class="px-3.5 pb-1 pt-2 text-xs text-ink-gray-6">
          {{ __('Theme') }}
        </div>
        <div
          class="flex gap-1 px-2.5 pb-2"
          role="group"
          :aria-label="__('Theme')"
        >
          <button
            v-for="choice in THEME_CHOICES"
            :key="choice.value"
            role="menuitemradio"
            :aria-checked="theme === choice.value"
            class="flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-xs"
            :class="
              theme === choice.value
                ? 'bg-surface-gray-3 font-semibold text-ink-gray-9'
                : 'text-ink-gray-7 hover:bg-surface-gray-2'
            "
            @click="setTheme(choice.value)"
          >
            <span :class="[choice.icon, 'size-4']" aria-hidden="true" />
            {{ __(choice.label) }}
          </button>
        </div>
        <div class="border-t border-outline-gray-1 py-1">
          <button
            role="menuitem"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-surface-gray-2"
            data-testid="menu-shortcuts"
            :aria-keyshortcuts="ariaKeys('alt+h')"
            @click="showShortcuts"
          >
            <span
              class="lucide-keyboard size-4 text-ink-gray-6"
              aria-hidden="true"
            />
            <span class="flex-1">{{ shellT('Keyboard shortcuts') }}</span>
            <kbd
              class="rounded border border-outline-gray-2 px-1 font-sans text-xs text-ink-gray-6"
              >{{ keyLabel('alt+h') }}</kbd
            >
          </button>
          <button
            v-if="ventas"
            role="menuitem"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-surface-gray-2"
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
            role="menuitem"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-surface-gray-2"
            @click="install"
          >
            <span
              class="lucide-download size-4 text-ink-gray-6"
              aria-hidden="true"
            />
            {{ __('Install app') }}
          </button>
          <a
            v-if="user.is_admin"
            role="menuitem"
            href="/desk"
            target="_blank"
            rel="noopener"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm hover:bg-surface-gray-2"
          >
            <span
              class="lucide-layout-grid size-4 text-ink-gray-6"
              aria-hidden="true"
            />
            {{ __('Administration') }}
          </a>
          <button
            role="menuitem"
            class="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink-red-8 hover:bg-surface-red-1"
            @click="signOut"
          >
            <span class="lucide-log-out size-4" aria-hidden="true" />
            {{ __('Sign out') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
<script setup>
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { sessionStore } from '@/stores/session'
import { openSalesSettings, shellBoot } from '@/composables/muelleShell'
import { installApp, installAvailable } from '@/composables/shellInstall'
import { THEME_CHOICES, useShellTheme } from '@/composables/shellTheme'
import { railWidth } from '@/composables/shellRail'
import {
  ariaKeys,
  keyLabel,
  openShortcutSheet,
  shellT,
  tabbables,
  useShellLayer,
} from '@/composables/shellKeyboard'

defineProps({ ventas: Boolean, expanded: Boolean })
const router = useRouter()
const session = sessionStore()
const { theme, setTheme } = useShellTheme()
const open = ref(false)
const trigger = ref(null)
const menu = ref(null)
const user = computed(() => shellBoot.value?.user || {})
const initials = computed(() => {
  const parts = String(user.value.full_name || user.value.name || '?')
    .trim()
    .split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
})
// Open, the first entry takes the focus and Tab stays in the menu; Esc from
// anywhere closes it and returns to the account button.
function toggle() {
  if (open.value) return close()
  open.value = true
  nextTick(() => tabbables(menu.value)[0]?.focus())
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
function openSettings() {
  open.value = false
  openSalesSettings(router)
}
// Esc in the sheet returns to the account button, the menu is gone by then.
function showShortcuts() {
  open.value = false
  openShortcutSheet(trigger.value)
}
function install() {
  open.value = false
  installApp()
}
function signOut() {
  open.value = false
  session.logout.submit()
}
</script>
