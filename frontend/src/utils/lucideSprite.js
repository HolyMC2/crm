// Icon.vue draws <use href="#name"> against one hidden element, id
// `lucide-sprite` (the id frappe-ui's sprite Icon and IconPicker look up too).
// That element holds one of two sprites: the subset of the icons the source
// names (virtual:lucide-subset, scripts/lucide-subset.mjs, ~10 KB gzip) or the
// whole of lucide-static (~95 KB gzip). The subset is the first paint's; the
// whole one takes its place the first time a name falls outside it (a view
// icon a user picked, an entry a server sends) or a picker asks for it.
const ID = 'lucide-sprite'
const NAME = /^[a-z0-9-]+$/

const loaders = {
  subset: () => import('virtual:lucide-subset'),
  full: () => import('lucide-static/sprite.svg?raw'),
}
const pending = { subset: null, full: null }

const holder = () => document.getElementById(ID)
const complete = () => holder()?.dataset.complete === '1'
const has = (name) => Boolean(holder()?.querySelector(`symbol[id="${name}"]`))

function install(svg, full) {
  let div = holder()
  if (!div) {
    div = document.createElement('div')
    div.id = ID
    div.style.display = 'none'
    document.body.prepend(div)
  } else if (div.dataset.complete === '1') return
  div.innerHTML = svg
  if (full) div.dataset.complete = '1'
}

function fetchSprite(kind, load, retry) {
  pending[kind] ||= load[kind]().then(
    ({ default: svg }) => install(svg, kind === 'full'),
    () => {
      // Offline or mid-deploy: no unhandled error; the next icon (or the
      // return of the connection) tries again.
      pending[kind] = null
      window.addEventListener('online', retry, { once: true })
    },
  )
  return pending[kind]
}

/**
 * Resolves once the sprite can draw `name`; without a name, once the whole
 * sprite is in (the picker, the desktop warm-up). `load` is for tests.
 */
export function ensureLucideSprite(name, load = loaders) {
  if (typeof document === 'undefined' || complete()) return Promise.resolve()
  const retry = () => ensureLucideSprite(name, load)
  if (!name) return fetchSprite('full', load, retry)
  // A name no sprite carries: nothing to fetch for it.
  if (!NAME.test(name) || has(name)) return Promise.resolve()
  return fetchSprite('subset', load, retry).then(() => {
    if (complete() || has(name)) return
    return fetchSprite('full', load, retry)
  })
}
