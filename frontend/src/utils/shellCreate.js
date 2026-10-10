import { can } from '@/vendor/muelle-shell/contracts'

// «Crear» per module: the palette's Acciones and the shell's «c» (in that
// module) use the same targets. Ventas creates from its list page (the
// deal dialog), so it has no target here. `right` is the boot right that
// allows it (default «create»): an employee files an expense with «claim».
const CREATE_TARGETS = [
  {
    module: 'contactos',
    id: 'contactos.create',
    title: (text) =>
      text ? __('New contact «{0}»', [text]) : __('New contact'),
    icon: 'lucide-user-plus',
    href: '/contactos?create=1',
  },
  {
    module: 'pendientes',
    id: 'pendientes.create',
    title: () => __('New pendiente'),
    icon: 'lucide-square-check-big',
    href: '/pendientes?create=1',
  },
  {
    module: 'agenda',
    id: 'agenda.create',
    title: () => __('New event'),
    icon: 'lucide-calendar-plus',
    href: '/agenda?create=1',
  },
  {
    module: 'compras',
    id: 'compras.create',
    title: () => __('New purchase'),
    icon: 'lucide-shopping-cart',
    href: '/compras/nueva',
  },
  {
    module: 'gastos',
    id: 'gastos.claim',
    right: 'claim',
    title: () => __('File an expense'),
    keywords: 'gasto ticket reembolso registrar expense receipt',
    icon: 'lucide-receipt',
    href: '/gastos?segment=empleados&chip=mios&nuevo=1',
  },
  {
    module: 'garantias',
    id: 'garantias.create',
    title: () => __('New warranty case'),
    icon: 'lucide-shield-check',
    href: '/garantias?create=1',
  },
]

/** The create actions this worker may run, one per module. */
export function createTargets(boot) {
  return CREATE_TARGETS.filter((target) =>
    can(boot, target.module, target.right || 'create'),
  )
}

/** The create action of `module` («c» there), or null. */
export function createTargetFor(boot, module) {
  return createTargets(boot).find((target) => target.module === module) || null
}
