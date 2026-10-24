// The lucide sprite (every icon as an inline <symbol>, ~500 KB of source) is
// only needed where Icon.vue or the IconPicker render <use href="#name">, so
// it loads after first paint instead of shipping in the entry chunk. The
// sprite comes straight from lucide-static (frappe-ui 1.0 parked its
// spritePlugin under experimental and will remove it); the `lucide-sprite`
// id is what frappe-ui's sprite Icon/IconPicker look up too.
let loading = null

export function ensureLucideSprite(
  load = () => import('lucide-static/sprite.svg?raw'),
) {
  if (
    typeof document === 'undefined' ||
    document.getElementById('lucide-sprite')
  )
    return Promise.resolve()
  loading ||= load().then(
    ({ default: sprite }) => {
      if (document.getElementById('lucide-sprite')) return
      const div = document.createElement('div')
      div.id = 'lucide-sprite'
      div.style.display = 'none'
      div.innerHTML = sprite
      document.body.prepend(div)
    },
    () => {
      // Offline or mid-deploy: no unhandled error; the next icon (or the
      // return of the connection) tries again.
      loading = null
      window.addEventListener('online', () => ensureLucideSprite(), {
        once: true,
      })
    },
  )
  return loading
}
