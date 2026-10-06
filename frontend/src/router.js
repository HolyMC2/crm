import { createRouter, createWebHistory } from 'vue-router'
import { call } from 'frappe-ui'
import { sessionStore } from '@/stores/session'
import {
  isNeutralModule,
  loadShell,
  shellBoot,
} from '@/composables/muelleShell'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
import { loadCapabilities, gateRoute } from '@/utils/crmCapabilities'
import { legacyIdentityRoute, safeIntendedRoute } from '@/utils/shellRoutes'

let personaChecked = false
export const PERSONA_DONE_KEY = 'crm_persona_captured'

async function shouldCapturePersona() {
  // Client-side flag guards against re-prompting if the server persist failed.
  if (localStorage.getItem(PERSONA_DONE_KEY)) return false
  const captured = await call('frappe.client.get_single_value', {
    doctype: 'FCRM Settings',
    field: 'persona_captured',
  })
  if (captured) return false
  // The wizard only feeds telemetry; skip it entirely if the user opted out.
  const { enabled } =
    (await call('frappe.utils.telemetry.pulse.client.boot_config')) || {}
  return !!enabled
}

const routes = [
  // Ventas module home in the Muelle shell (contracts basePath).
  { path: '/ventas', name: 'Ventas', redirect: { name: 'Home' } },
  {
    path: '/contactos',
    name: 'Contactos',
    component: () => import('@/pages/Contactos.vue'),
    meta: { app: 'contactos', title: 'Contactos', stableKey: true },
  },
  {
    path: '/contactos/:source/:name',
    name: 'Contacto',
    component: () => import('@/pages/Contacto.vue'),
    props: true,
    meta: { app: 'contactos', title: 'Contactos', stableKey: true },
  },
  {
    path: '/compras',
    name: 'Compras',
    component: () => import('@/pages/Compras.vue'),
    meta: { app: 'compras', title: 'Compras', stableKey: true },
  },
  {
    path: '/compras/nueva',
    name: 'CompraNueva',
    component: () => import('@/pages/CompraOrden.vue'),
    meta: { app: 'compras', title: 'Compras', listParent: 'Compras' },
  },
  {
    path: '/compras/orden/:name',
    name: 'CompraOrden',
    component: () => import('@/pages/CompraOrden.vue'),
    props: true,
    meta: { app: 'compras', title: 'Compras', listParent: 'Compras' },
  },
  {
    path: '/compras/solicitud/:name',
    name: 'CompraSolicitud',
    component: () => import('@/pages/CompraSolicitud.vue'),
    props: true,
    meta: { app: 'compras', title: 'Compras', listParent: 'Compras' },
  },
  {
    path: '/',
    name: 'Home',
  },
  {
    path: '/avisos',
    name: 'Avisos',
    component: () => import('@/pages/Avisos.vue'),
    meta: { app: 'avisos', title: 'Avisos', stableKey: true },
  },
  {
    // The CRM notifications page merged into Avisos; old links keep working.
    path: '/notifications',
    name: 'Notifications',
    redirect: () => ({ path: '/avisos' }),
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/pages/Dashboard.vue'),
  },
  {
    path: '/inquiries',
    name: 'Inquiries',
    component: () => import('@/pages/Inquiries.vue'),
    meta: { navLabel: 'Consultas', title: 'Consultas' },
  },
  {
    // FCRM redesign owns /leads (LeadsView.vue); upstream list stays reachable
    // at /leads/view/:viewType for the kanban/calendar view system.
    path: '/leads/view/:viewType?',
    name: 'Leads',
    component: () => import('@/pages/Leads.vue'),
  },
  {
    path: '/leads/:leadId',
    name: 'Lead',
    component: () => import(`@/pages/${handleMobileView('Lead')}.vue`),
    props: true,
  },
  {
    // FCRM redesign owns /deals (DealsView.vue); upstream list stays reachable
    // at /deals/view/:viewType for the kanban/calendar view system.
    path: '/deals/view/:viewType?',
    name: 'Deals',
    component: () => import('@/pages/Deals.vue'),
  },
  {
    path: '/deals/:dealId',
    name: 'Deal',
    component: () => import(`@/pages/${handleMobileView('Deal')}.vue`),
    props: true,
  },
  {
    alias: '/notes',
    path: '/notes/view/:viewType?',
    name: 'Notes',
    component: () => import('@/pages/Notes.vue'),
  },
  {
    // FCRM redesign owns /tasks (TasksView.vue); upstream list at /tasks/view/.
    path: '/tasks/view/:viewType?',
    name: 'Tasks',
    component: () => import('@/pages/Tasks.vue'),
  },
  {
    alias: '/contacts',
    path: '/contacts/view/:viewType?',
    name: 'Contacts',
    redirect: (to) => legacyIdentityRoute(to, 'contact'),
  },
  {
    path: '/contacts/:contactId',
    name: 'Contact',
    redirect: (to) => legacyIdentityRoute(to, 'contact'),
  },
  {
    alias: '/organizations',
    path: '/organizations/view/:viewType?',
    name: 'Organizations',
    redirect: (to) => legacyIdentityRoute(to, 'organization'),
  },
  {
    path: '/organizations/:organizationId',
    name: 'Organization',
    redirect: (to) => legacyIdentityRoute(to, 'organization'),
  },
  {
    // FCRM redesign owns /call-logs (CallsView.vue); upstream list at /call-logs/view/.
    path: '/call-logs/view/:viewType?',
    name: 'Call Logs',
    component: () => import('@/pages/CallLogs.vue'),
  },
  {
    path: '/calendar',
    name: 'Calendar',
    component: () => import('@/pages/Calendar.vue'),
  },
  {
    path: '/data-import',
    name: 'DataImportList',
    component: () => import('@/pages/DataImport.vue'),
  },
  {
    path: '/data-import/doctype/:doctype',
    name: 'NewDataImport',
    component: () => import('@/pages/DataImport.vue'),
    props: true,
  },
  {
    path: '/data-import/:importName',
    name: 'DataImport',
    component: () => import('@/pages/DataImport.vue'),
    props: true,
  },
  {
    path: '/welcome',
    name: 'Welcome',
    component: () => import('@/pages/Welcome.vue'),
  },
  // ── FCRM redesign surfaces (handoff §4.1). Placeholder component until each
  //    phase ships its real page; meta drives the nav-rail label + back label.
  {
    path: '/inbox',
    name: 'Inbox',
    component: () => import('@/pages/Inbox.vue'),
    // stableKey: the page keys its own state off the query (workspace, deal,
    // conversation), so a query change must not remount it — a remount
    // re-ran the whole bootstrap on every thread click.
    meta: { navLabel: 'Inbox', title: 'Inbox', stableKey: true },
  },
  {
    path: '/leads',
    name: 'Leads List',
    component: () => import('@/pages/LeadsView.vue'),
    meta: { navLabel: 'Leads', title: 'Leads' },
  },
  {
    path: '/deals',
    name: 'Deals List',
    component: () => import('@/pages/DealsView.vue'),
    meta: { navLabel: 'Deals', title: 'Deals' },
  },
  {
    path: '/deal/:dealId',
    name: 'Deal 360',
    component: () => import('@/pages/Deal360.vue'),
    props: true,
    meta: { navLabel: 'Inbox', title: 'Deal 360°' },
  },
  {
    path: '/pipeline-analysis',
    name: 'Pipeline Analysis',
    component: () => import('@/pages/PipelineAnalysis.vue'),
    meta: { navLabel: 'Leads', title: 'Pipeline Analysis' },
  },
  {
    path: '/campaigns',
    name: 'Campaigns',
    component: () => import('@/pages/Campaigns.vue'),
    meta: { navLabel: 'Campaigns', title: 'Campaigns' },
  },
  {
    path: '/campaigns/:campaignId',
    name: 'Campaign',
    component: () => import('@/pages/CampaignDetail.vue'),
    props: true,
    meta: { navLabel: 'Campaigns', title: 'Campaign' },
  },
  {
    path: '/forms',
    name: 'Forms',
    component: () => import('@/pages/Forms.vue'),
    meta: { navLabel: 'Forms', title: 'Forms', managerOnly: true },
  },
  {
    path: '/forms/:formId',
    name: 'Form',
    component: () => import('@/pages/FormBuilder.vue'),
    props: true,
    meta: { navLabel: 'Forms', title: 'Form', managerOnly: true },
  },
  {
    path: '/automations',
    name: 'Automations',
    component: () => import('@/pages/AutomationWorkspace.vue'),
    meta: { navLabel: 'Automations', title: 'Sales automations' },
  },
  {
    path: '/chatflows',
    name: 'Chatflows',
    component: () => import('@/pages/Chatflows.vue'),
    meta: { navLabel: 'Campaigns', title: 'Chatflows' },
  },
  {
    path: '/tasks',
    name: 'Tasks List',
    component: () => import('@/pages/TasksView.vue'),
    meta: { navLabel: 'Tasks', title: 'Tasks' },
  },
  {
    path: '/call-logs',
    name: 'Calls List',
    component: () => import('@/pages/CallsView.vue'),
    meta: { navLabel: 'Calls', title: 'Calls' },
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('@/pages/Reports.vue'),
    meta: { navLabel: 'Reports', title: 'Reports' },
  },
  {
    path: '/workload',
    name: 'Workload',
    component: () => import('@/pages/WorkloadView.vue'),
    meta: { navLabel: 'Workload', title: 'Carga de trabajo' },
  },
  {
    path: '/score-rules',
    name: 'Score Rules',
    component: () => import('@/pages/ScoreRules.vue'),
    meta: { navLabel: 'Score Rules', title: 'Score Rules' },
  },
  {
    path: '/webshop',
    name: 'Webshop',
    component: () => import('@/pages/Webshop.vue'),
    meta: { navLabel: 'Webshop', title: 'Webshop' },
  },
  {
    path: '/whatsapp-queue',
    name: 'WhatsApp Queue',
    component: () => import('@/pages/WhatsAppQueue.vue'),
    meta: { navLabel: 'Aprobaciones', title: 'Aprobaciones WhatsApp' },
  },
  {
    path: '/social',
    name: 'Social',
    component: () => import('@/pages/SocialCalendar.vue'),
    meta: { navLabel: 'Social', title: 'Social' },
  },
  {
    path: '/social/evergreen',
    name: 'Social Evergreen',
    component: () => import('@/pages/SocialEvergreen.vue'),
    meta: { navLabel: 'Social', title: 'Biblioteca evergreen' },
  },
  {
    path: '/social/mentions',
    name: 'Social Mentions',
    component: () => import('@/pages/SocialMentions.vue'),
    meta: { navLabel: 'Social', title: 'Menciones' },
  },
  {
    path: '/onboarding',
    name: 'Onboarding',
    component: () => import('@/pages/PersonaForm.vue'),
  },
  {
    path: '/:invalidpath',
    name: 'Invalid Page',
    component: () => import('@/pages/InvalidPage.vue'),
  },
  {
    path: '/not-permitted',
    name: 'Not Permitted',
    meta: { app: 'contactos', title: 'Permisos', recovery: true },
    component: () => import('@/pages/NotPermitted.vue'),
  },
]

const handleMobileView = (componentName) => {
  return window.innerWidth < 768 ? `Mobile${componentName}` : componentName
}

let router = createRouter({
  history: createWebHistory('/crm'),
  routes,
})

router.beforeEach(async (to, from, next) => {
  router.previousRoute = from

  const { isLoggedIn, user } = sessionStore()
  if (!isLoggedIn) {
    window.location.href =
      '/login?redirect-to=' +
      encodeURIComponent(safeIntendedRoute('/crm' + to.fullPath))
    return
  }
  if (isNeutralModule(to.meta.app)) {
    // Shell modules are separate capabilities; no sales stores/boot here.
    return next()
  }
  if (isNeutralModule(window.muelle_module) || shellBoot.value) {
    try {
      const boot = await loadShell()
      if (!moduleEnabled(boot, 'ventas'))
        return next({ name: 'Not Permitted', query: { intended: to.fullPath } })
    } catch {
      return next({ name: 'Not Permitted', query: { intended: to.fullPath } })
    }
  }
  const { usersStore } = await import('@/stores/users')
  const { users, isCrmUser, isAdmin, isManager } = usersStore()

  if (isLoggedIn && !users.fetched) {
    try {
      await users.promise
    } catch (error) {
      console.error('Error loading users', error)
    }
  }

  // Installed-app availability (not permissions): Home and the addon-backed
  // surfaces below need it before they can resolve. Cached after the first
  // answer, so later navigations do not wait.
  if (isLoggedIn && isCrmUser()) await loadCapabilities()

  const isAdminUser = isLoggedIn && (isAdmin() || user === 'Administrator')

  // Only admins who haven't finished may reach the wizard, even via direct URL.
  if (isLoggedIn && to.name === 'Onboarding') {
    try {
      if (!isAdminUser || !(await shouldCapturePersona())) {
        return next({ name: 'Home' })
      }
    } catch {
      return next({ name: 'Home' })
    }
  }

  if (
    isLoggedIn &&
    isCrmUser() &&
    !personaChecked &&
    to.name !== 'Onboarding' &&
    isAdminUser
  ) {
    personaChecked = true
    try {
      if (await shouldCapturePersona()) {
        return next({ name: 'Onboarding' })
      }
    } catch (error) {
      // fail open
    }
  }

  if (isLoggedIn && to.name !== 'Not Permitted' && !isCrmUser()) {
    next({ name: 'Not Permitted' })
  } else if (to.name === 'Home' && isLoggedIn) {
    // FCRM redesign: the omnichannel Inbox is the default landing (handoff §5.1)
    // when doco_marketing is installed; otherwise the native Leads list.
    next(gateRoute(to))
  } else if (!isLoggedIn) {
    window.location.href = '/login?redirect-to=/crm'
  } else if (to.matched.length === 0) {
    next({ name: 'Invalid Page' })
  } else if (to.meta?.managerOnly && !isManager() && user !== 'Administrator') {
    // same gate as the server (Sales Manager / System Manager)
    next({ name: 'Not Permitted' })
  } else if (gateRoute(to)) {
    // Addon-backed surface on a site without the addon: native fallback (the
    // upstream list / Deal page) or Home. See utils/crmCapabilities.js.
    next(gateRoute(to))
  } else if (['Deal', 'Lead'].includes(to.name) && !to.hash) {
    let storageKey = to.name === 'Deal' ? 'lastDealTab' : 'lastLeadTab'
    const activeTab = localStorage.getItem(storageKey) || 'activity'
    const hash = '#' + activeTab
    next({ ...to, hash })
  } else if (
    [
      'Leads',
      'Deals',
      'Contacts',
      'Organizations',
      'Notes',
      'Tasks',
      'Call Logs',
    ].includes(to.name) &&
    !to.query?.view
  ) {
    const { viewsStore } = await import('@/stores/views')
    const { views, standardViews, getDefaultView } = viewsStore()
    await views.promise

    const viewType = to.params?.viewType ?? ''
    const standardViewTypes = ['list', 'kanban', 'group_by']

    if (!viewType) {
      const doctypeMap = {
        Leads: 'CRM Lead',
        Deals: 'CRM Deal',
        Contacts: 'Contact',
        Organizations: 'CRM Organization',
        Notes: 'FCRM Note',
        Tasks: 'CRM Task',
        'Call Logs': 'CRM Call Log',
      }

      const doctype = doctypeMap[to.name]
      let defaultViewType = 'list'

      let globalDefault = getDefaultView()
      if (globalDefault && globalDefault.route_name === to.name) {
        defaultViewType = globalDefault.type || 'list'
        if (globalDefault.name && !globalDefault.is_standard) {
          next({
            name: to.name,
            params: { viewType: defaultViewType },
            query: { ...to.query, view: globalDefault.name },
          })
          return
        }
      }

      for (const viewType of standardViewTypes) {
        const standardView = standardViews.value?.[doctype + ' ' + viewType]
        if (standardView?.is_default) {
          defaultViewType = viewType
          break
        }
      }

      next({
        name: to.name,
        params: { viewType: defaultViewType },
        query: to.query,
      })
    } else if (!standardViewTypes.includes(viewType)) {
      const viewNameOrLabel = viewType

      let view = views.data?.find(
        (v) => v.name == viewNameOrLabel || v.label === viewNameOrLabel,
      )

      if (view) {
        next({
          name: to.name,
          params: { viewType: view.type || 'list' },
          query: { ...to.query, view: view.name },
        })
      } else {
        next({
          name: to.name,
          params: { viewType: 'list' },
          query: to.query,
        })
      }
    } else {
      next()
    }
  } else {
    next()
  }
})

export default router
