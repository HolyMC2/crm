import { navItems, navItemsBottom } from '@/composables/navModel'

// Ventas sections for the shell (desktop sidebar, phone «Más», the palette's
// places), CRM program S5.1 and Shell D3. No reactive state here: the palette
// reads it without the Ventas runtime.

// Keys of navModel entries, in order. «Prospectos» (CRM-S3.4, D4) is leads and
// inquiries in one list; their own lists stay under «Más».
export const VENTAS_SECTIONS = Object.freeze({
  daily: ['deals', 'prospectos', 'inbox'],
  more: [
    'dashboard',
    'leads',
    'tasks',
    'calls',
    'reports',
    'funnel',
    'workload',
  ],
  settings: [
    'campaigns',
    'forms',
    'social',
    'automations',
    'score-rules',
    'webshop',
  ],
})

// Labels that differ from navModel's (English source, es-MX in crm/locale/es.po).
// Inbox keeps «Bandeja de entrada», the page's own title: its «Conversaciones»
// tab is one of the two spaces inside it.
// «Leads» reads «Prospectos» in es-MX, the daily list's name: the old leads
// list under «Más» says «Lista de leads».
const LABELS = { leads: 'Lead list' }
// Manager views besides the whole «Configuración» section.
const MANAGER_ONLY = new Set(['workload', ...VENTAS_SECTIONS.settings])
// Set-up screens built for a desk (Shell D3): below 768px Más leaves them out
// and their routes show «Ábrelo en una computadora». «Lista de leads» too: on
// a phone /leads opens Prospectos (SHELL-S4.3).
export const DESKTOP_ONLY = new Set(['leads', ...VENTAS_SECTIONS.settings])
// Shell-module entries never shown inside Ventas.
const NOT_IN_VENTAS = new Set(['contactos', 'calendar'])

const ALL = [...navItems, ...navItemsBottom]

/** navModel entries of one section, with the Ventas label and role gate. */
export function ventasSection(section) {
  return VENTAS_SECTIONS[section]
    .map((key) => ALL.find((item) => item.key === key))
    .filter((item) => item && !NOT_IN_VENTAS.has(item.key))
    .map((item) => ({
      ...item,
      label: LABELS[item.key] || item.label,
      managerOnly: item.managerOnly || MANAGER_ONLY.has(item.key),
      desktopOnly: DESKTOP_ONLY.has(item.key),
    }))
}
