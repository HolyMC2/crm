// Single source of truth for the FCRM redesign primary nav. Rendered by BOTH the
// desktop DocoNavRail (58px icon rail) and the mobile drawer (MobileSidebar), so the
// two never drift — the mobile sidebar was missing Inbox + the new surfaces because
// it had its own hardcoded list. `to` is a PATH: DocoNavRail does router.push(path),
// MobileSidebar wraps it as { path } in its own go().
import DashboardIcon from '~icons/lucide/layout-dashboard'
import LeadsIcon from '~icons/lucide/users'
import DealsIcon from '~icons/lucide/handshake'
import InboxIcon from '~icons/lucide/messages-square'
import ReviewQueueIcon from '~icons/lucide/clipboard-check'
import CampaignsIcon from '~icons/lucide/megaphone'
import SocialIcon from '~icons/lucide/images'
import CalendarIcon from '~icons/lucide/calendar-days'
import CallsIcon from '~icons/lucide/phone'
import TasksIcon from '~icons/lucide/square-check-big'
import ReportsIcon from '~icons/lucide/bar-chart-3'
import ScoreRulesIcon from '~icons/lucide/sliders-horizontal'
import WebshopIcon from '~icons/lucide/shopping-cart'
import WorkloadIcon from '~icons/lucide/scale'
import InquiriesIcon from '~icons/lucide/message-square-plus'
import MercadoIcon from '~icons/lucide/tag'
import TallerIcon from '~icons/lucide/wrench'
import PosIcon from '~icons/lucide/receipt'
import DeskIcon from '~icons/lucide/layout-grid'

export const navItems = [
  { key: 'dashboard', icon: DashboardIcon, label: 'Dashboard', to: '/dashboard', group: 'dashboard' },
  { key: 'leads', icon: LeadsIcon, label: 'Leads', to: '/leads', group: 'leads' },
  { key: 'inquiries', icon: InquiriesIcon, label: 'Consultas', to: '/inquiries', group: 'inquiries' },
  { key: 'inbox', icon: InboxIcon, label: 'Inbox', to: '/inbox', group: 'inbox', badge: 'unread' },
  { key: 'wa-queue', icon: ReviewQueueIcon, label: 'Aprobaciones', to: '/whatsapp-queue', group: 'wa-queue', badge: 'pending' },
  { key: 'deals', icon: DealsIcon, label: 'Deals', to: '/deals', group: 'deals' },
  { key: 'campaigns', icon: CampaignsIcon, label: 'Campaigns', to: '/campaigns', group: 'campaigns' },
  { key: 'social', icon: SocialIcon, label: 'Social', to: '/social', group: 'social' },
  { key: 'calendar', icon: CalendarIcon, label: 'Calendario', to: '/calendar', group: 'calendar' },
  { key: 'calls', icon: CallsIcon, label: 'Calls', to: '/call-logs', group: 'calls' },
  { key: 'tasks', icon: TasksIcon, label: 'Tasks', to: '/tasks', group: 'tasks', badge: 'overdue' },
  { key: 'reports', icon: ReportsIcon, label: 'Reports', to: '/reports', group: 'reports' },
]

export const navItemsBottom = [
  { key: 'score-rules', icon: ScoreRulesIcon, label: 'Score Rules', to: '/score-rules', group: 'score-rules' },
  { key: 'workload', icon: WorkloadIcon, label: 'Carga de trabajo', to: '/workload', group: 'workload' },
  { key: 'webshop', icon: WebshopIcon, label: 'Webshop', to: '/webshop', group: 'webshop' },
]

// A route path lights exactly one nav group (handoff §4.1).
export function routeGroup(path) {
  if (/^\/inquiries(\/|$)/.test(path)) return 'inquiries'
  if (/^\/inbox(\/|$)/.test(path)) return 'inbox'
  if (/^\/whatsapp-queue(\/|$)/.test(path)) return 'wa-queue'
  if (/^\/deals?(\/|$)/.test(path)) return 'deals'
  if (/^\/(campaigns|chatflows)(\/|$)/.test(path)) return 'campaigns'
  if (/^\/social(\/|$)/.test(path)) return 'social'
  if (/^\/calendar(\/|$)/.test(path)) return 'calendar'
  if (/^\/(leads|pipeline|stage-scripts|enrichment|pipeline-analysis)(\/|$)/.test(path)) return 'leads'
  if (/^\/dashboard(\/|$)/.test(path)) return 'dashboard'
  if (/^\/call-logs(\/|$)/.test(path)) return 'calls'
  if (/^\/tasks(\/|$)/.test(path)) return 'tasks'
  if (/^\/reports(\/|$)/.test(path)) return 'reports'
  if (/^\/score-rules(\/|$)/.test(path)) return 'score-rules'
  if (/^\/webshop(\/|$)/.test(path)) return 'webshop'
  if (/^\/workload(\/|$)/.test(path)) return 'workload'
  return ''
}

// Sibling apps of the muelle suite — the quick access mercado / taller / POS
// offer from their user menus. None of them register on Frappe's apps screen
// (`add_to_apps_screen`), so `frappe.apps.get_apps` cannot list them: they are
// declared here and gated per tenant by installed app (crmCapabilities), so a
// site without e.g. taller never shows a dead link. Routes are the muelle ones:
// Desk at /desk (the /app→/desk rename), POS Awesome's web entry at /posapp.
// Rendered by the DocoNavRail profile panel and the mobile drawer's apps grid.
export const suiteApps = [
  { key: 'mercado', app: 'mercado', label: 'Mercado', route: '/mercado/', icon: MercadoIcon },
  { key: 'taller', app: 'taller', label: 'Taller', route: '/taller/', icon: TallerIcon },
  { key: 'pos', app: 'posawesome', label: 'POS Awesome', route: '/posapp', icon: PosIcon },
  { key: 'desk', app: null, label: 'Desk', route: '/desk', icon: DeskIcon },
]

// `hasApp(name)` is crmCapabilities.hasApp (false while the lookup is pending or
// unknown), so only Desk (`app: null` = always) shows until the list resolves.
export function visibleSuiteApps(hasApp) {
  return suiteApps.filter((app) => !app.app || hasApp(app.app))
}
