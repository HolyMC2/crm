// The lucide sprite (every icon as an inline <symbol>, ~500 KB of source) is
// only needed where Icon.vue or the IconPicker render <use href="#name">, so
// it loads after first paint instead of shipping in the entry chunk.
let loading = null

export function ensureLucideSprite(load = () => import('frappe-ui/icons')) {
  if (
    typeof document === 'undefined' ||
    document.getElementById('lucide-sprite')
  )
    return Promise.resolve()
  loading ||= load().then(
    ({ spritePlugin }) => {
      if (!document.getElementById('lucide-sprite')) spritePlugin.install()
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
