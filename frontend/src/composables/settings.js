import { computed, ref } from 'vue'
import { useWindowSize } from '@vueuse/core'

export const mobileSidebarOpened = ref(false)

const { width } = useWindowSize()
export const isMobileView = computed(() => width.value < 768)

const settingsOpen = ref(false)
let closeGuard = null
export const showSettings = computed({
  get: () => settingsOpen.value,
  set: (open) => {
    if (!open && settingsOpen.value && closeGuard && !closeGuard()) return
    settingsOpen.value = open
  },
})

export function registerSettingsCloseGuard(guard) {
  closeGuard = guard
  return () => {
    if (closeGuard === guard) closeGuard = null
  }
}

export const disableSettingModalOutsideClick = ref(false)

export const activeSettingsPage = ref('')
