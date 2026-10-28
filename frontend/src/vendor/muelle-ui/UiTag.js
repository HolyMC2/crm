// Vendored from muelle/workspace/packages/ui@0.1.0 (1ceb2df0a0ad). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory.
import { h } from 'vue'

// Renders `as` (a native tag name or a component such as RouterLink) with the
// given attributes. `<component :is="'button'">` cannot be used for native
// tags here: Vue resolves the string against globally registered components
// first, and frappe-ui registers `Button`.
export default function UiTag(props, { attrs, slots }) {
  return typeof props.as === 'string'
    ? h(props.as, attrs, slots.default?.())
    : h(props.as, attrs, { default: slots.default })
}
UiTag.props = ['as']
UiTag.inheritAttrs = false
