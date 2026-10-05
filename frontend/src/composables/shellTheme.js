import { computed } from 'vue'
import { useTheme } from 'frappe-ui'
import { DEFAULT_THEME } from '@/vendor/muelle-shell/contracts'

// Claro is the v1 default; the worker's choice (claro/oscuro/sistema) is kept
// per browser by frappe-ui (localStorage «theme») and set as <html data-theme>.
export function useShellTheme() {
  const { currentTheme, setTheme } = useTheme()
  return {
    theme: computed(() => currentTheme?.value || DEFAULT_THEME),
    setTheme,
  }
}

export const THEME_CHOICES = [
  { value: 'light', label: 'Light', icon: 'lucide-sun' },
  { value: 'dark', label: 'Dark', icon: 'lucide-moon' },
  { value: 'system', label: 'System', icon: 'lucide-monitor' },
]
