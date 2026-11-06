// frappe-ui's editor family (TipTap with its extensions, about 900 KB) mounts when
// a composer opens, so a record page without an open composer never downloads it.
// composerParts.js is the one module behind the dynamic import: every part here
// comes out of the same chunk.
import { defineAsyncComponent, h } from 'vue'

const parts = () => import('@/components/editor/composerParts.js')

const ComposerLoading = {
  render: () =>
    h('div', {
      class: 'mx-4 my-3 h-16 animate-pulse rounded-5 bg-surface-gray-2',
      'aria-busy': 'true',
    }),
}

export const ComposerEditor = defineAsyncComponent({
  loader: () => parts().then((m) => m.ComposerEditor),
  loadingComponent: ComposerLoading,
  delay: 150,
})
export const ComposerToolbar = defineAsyncComponent(() =>
  parts().then((m) => m.ComposerToolbar),
)
export const EditorContent = defineAsyncComponent(() =>
  parts().then((m) => m.EditorContent),
)
export const EditorTableMenu = defineAsyncComponent(() =>
  parts().then((m) => m.EditorTableMenu),
)
