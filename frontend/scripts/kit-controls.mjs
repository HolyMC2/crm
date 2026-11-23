// frappe-ui's Button and Switch are the kit's Material 3 controls
// (src/components/ui/Button.vue, Switch.vue): every `import { Button } from
// 'frappe-ui'` in crm, its global <Button> and its own screens get them. The
// swap happens where frappe-ui's component index names its file, so the
// package's barrel and its tree shaking stay as they are; any other route to
// those files (frappe-ui-components/Button/Button.vue) still reaches frappe-ui's.
import path from 'node:path'

const SWAPS = [
  ['Button/index.ts', './Button.vue', 'src/components/ui/Button.vue'],
  ['Switch/index.ts', './Switch.vue', 'src/components/ui/Switch.vue'],
]

export function kitControls(root) {
  return {
    name: 'muelle-kit-controls',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null
      const from = importer.replace(/\\/g, '/').split('?')[0]
      for (const [index, wanted, kit] of SWAPS)
        if (
          source === wanted &&
          from.endsWith(`/frappe-ui/src/components/${index}`)
        )
          return path.resolve(root, kit)
      return null
    },
  }
}
