// Single source of truth for the FCRM redesign primary nav. Rendered by BOTH the
// desktop DocoNavRail (58px icon rail) and the mobile drawer (DocoMobileNav), so the
// two never drift — the mobile sidebar was missing Inbox + the new surfaces because
// it had its own hardcoded list. `to` is a PATH (DocoNavRail router.push(path);
// SidebarLink wraps it as { path }).
import DashboardIcon from '~icons/lucide/layout-dashboard'
import LeadsIcon from '~icons/lucide/users'
import DealsIcon from '~icons/lucide/handshake'
import InboxIcon from '~icons/lucide/messages-square'
import CampaignsIcon from '~icons/lucide/megaphone'
import CallsIcon from '~icons/lucide/phone'
import TasksIcon from '~icons/lucide/square-check-big'
import ReportsIcon from '~icons/lucide/bar-chart-3'
import ScoreRulesIcon from '~icons/lucide/sliders-horizontal'
import WebshopIcon from '~icons/lucide/shopping-cart'

export const navItems = [
  { key: 'dashboard', icon: DashboardIcon, label: 'Dashboard', to: '/dashboard', group: 'dashboard' },
  { key: 'leads', icon: LeadsIcon, label: 'Leads', to: '/leads', group: 'leads' },
  { key: 'inbox', icon: InboxIcon, label: 'Inbox', to: '/inbox', group: 'inbox', badge: 'unread' },
  { key: 'deals', icon: DealsIcon, label: 'Deals', to: '/deals', group: 'deals' },
  { key: 'campaigns', icon: CampaignsIcon, label: 'Campaigns', to: '/campaigns', group: 'campaigns' },
  { key: 'calls', icon: CallsIcon, label: 'Calls', to: '/call-logs', group: 'calls' },
  { key: 'tasks', icon: TasksIcon, label: 'Tasks', to: '/tasks', group: 'tasks', badge: 'overdue' },
  { key: 'reports', icon: ReportsIcon, label: 'Reports', to: '/reports', group: 'reports' },
]

export const navItemsBottom = [
  { key: 'score-rules', icon: ScoreRulesIcon, label: 'Score Rules', to: '/score-rules', group: 'score-rules' },
  { key: 'webshop', icon: WebshopIcon, label: 'Webshop', to: '/webshop', group: 'webshop' },
]

// A route path lights exactly one nav group (handoff §4.1).
export function routeGroup(path) {
  if (/^\/inbox(\/|$)/.test(path)) return 'inbox'
  if (/^\/deals?(\/|$)/.test(path)) return 'deals'
  if (/^\/campaigns(\/|$)/.test(path)) return 'campaigns'
  if (/^\/(leads|pipeline|calendar|stage-scripts|enrichment|pipeline-analysis)(\/|$)/.test(path)) return 'leads'
  if (/^\/dashboard(\/|$)/.test(path)) return 'dashboard'
  if (/^\/call-logs(\/|$)/.test(path)) return 'calls'
  if (/^\/tasks(\/|$)/.test(path)) return 'tasks'
  if (/^\/reports(\/|$)/.test(path)) return 'reports'
  if (/^\/score-rules(\/|$)/.test(path)) return 'score-rules'
  if (/^\/webshop(\/|$)/.test(path)) return 'webshop'
  return ''
}
