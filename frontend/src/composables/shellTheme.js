import { computed } from 'vue'
import { useColorScheme } from 'frappe-ui'
import { DEFAULT_THEME } from '@/vendor/muelle-shell/contracts'

// Claro is the v1 default; the worker's choice (claro/oscuro/sistema) is kept
// per browser by frappe-ui (localStorage «theme») and set as <html data-theme>.
export function useShellTheme() {
  const { colorScheme, setColorScheme } = useColorScheme()
  return {
    theme: computed(() => colorScheme?.value || DEFAULT_THEME),
    setTheme: setColorScheme,
  }
}

export const THEME_CHOICES = [
  { value: 'light', label: 'Light', icon: 'lucide-sun' },
  { value: 'dark', label: 'Dark', icon: 'lucide-moon' },
  { value: 'system', label: 'System', icon: 'lucide-monitor' },
]
