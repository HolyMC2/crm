<!-- Vendored from muelle/workspace/packages/ui@0.3.0 (52d6d25388e7). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<script>
// The kit's button (Material 3), a drop-in for frappe-ui 1.0.2's <Button>:
// the same props, slots and heights (24, 28, 32, 40 px), as a pill.
// solid = filled (the shop's accent on gray), subtle (the default) = tonal
// (the secondary container), outline = outlined, ghost = text; blue, green and
// red keep their status hues. The pressed look follows `data-state` (open or
// active), as a menu trigger stamps it. A loading button keeps its look, takes
// no pointer and spins a mask icon. `tooltip` becomes the native title.
// No frappe-ui import: Taller and Clínica load it without that package.
import { computed, defineComponent, h, useSlots } from 'vue'
import { RouterLink } from 'vue-router'

const iconProp = { type: [String, Object, Function], default: undefined }

export const buttonProps = {
  theme: { type: String, default: 'gray' },
  size: { type: String, default: 'sm' },
  variant: { type: String, default: 'subtle' },
  label: { type: String, default: undefined },
  icon: iconProp,
  iconLeft: iconProp,
  iconRight: iconProp,
  tooltip: { type: String, default: undefined },
  loading: { type: Boolean, default: false },
  loadingText: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  route: { type: [String, Object], default: undefined },
  href: { type: String, default: undefined },
  type: { type: String, default: 'button' },
}

const SECONDARY =
  'bg-[var(--muelle-secondary-container)] text-[var(--muelle-on-secondary-container)]'
const LOOK = {
  solid: {
    gray: 'bg-surface-gray-10 text-ink-base',
    blue: 'bg-surface-blue-6 text-ink-base',
    green: 'bg-surface-green-7 text-ink-base',
    red: 'bg-surface-red-7 text-ink-base dark:text-ink-red-9',
  },
  subtle: {
    gray: SECONDARY,
    blue: 'bg-surface-blue-2 text-ink-blue-5',
    green: 'bg-surface-green-2 text-ink-green-8',
    red: 'bg-surface-red-2 text-ink-red-7',
  },
  outline: {
    gray: 'border border-outline-gray-3 text-ink-gray-8',
    blue: 'border border-outline-blue-1 text-ink-blue-5',
    green: 'border border-outline-green-3 text-ink-green-8',
    red: 'border border-outline-red-1 text-ink-red-7',
  },
  ghost: {
    gray: 'text-ink-gray-8',
    blue: 'text-ink-blue-5',
    green: 'text-ink-green-8',
    red: 'text-ink-red-7',
  },
}
// Held pressed (an open menu's trigger): one step of the ink over the fill.
const HELD = 'bg-[image:linear-gradient(color-mix(in_srgb,currentColor_12%,transparent)_0_0)]'
const DISABLED = {
  solid: 'bg-surface-gray-2 text-ink-gray-5',
  subtle: 'bg-surface-gray-2 text-ink-gray-5',
  outline: 'border border-outline-gray-2 text-ink-gray-5',
  ghost: 'text-ink-gray-5',
}
const TEXT_SIZE = {
  xs: 'h-6 gap-1 px-2.5 text-xs',
  sm: 'h-7 gap-1.5 px-3 text-[14px]',
  md: 'h-8 gap-1.5 px-3.5 text-[14px]',
  lg: 'h-10 gap-2 px-5 text-[15px]',
}
const ICON_SIZE = { xs: 'size-6', sm: 'size-7', md: 'size-8', lg: 'size-10' }
const GLYPH = { xs: 'size-3.5', sm: 'size-4', md: 'size-4.5', lg: 'size-5' }

export default defineComponent({
  name: 'Button',
  inheritAttrs: false,
  props: buttonProps,
  setup(props, { attrs }) {
    const slots = useSlots()
    // Read on every render: slots are not reactive.
    function iconOnly() {
      if (props.icon || slots.icon) return true
      const content = slots.default?.()
      if (!Array.isArray(content) || content.length !== 1) return false
      const name = content[0]?.type?.name
      return typeof name === 'string' && name.startsWith('lucide-')
    }
    const variant = computed(() => (LOOK[props.variant] ? props.variant : 'subtle'))
    const theme = computed(() => (LOOK.solid[props.theme] ? props.theme : 'gray'))
    const size = computed(() => (TEXT_SIZE[props.size] ? props.size : 'sm'))

    function glyph(icon) {
      if (!icon) return null
      if (typeof icon === 'string')
        return icon.startsWith('lucide-')
          ? h('span', { class: [icon, GLYPH[size.value]], 'aria-hidden': 'true' })
          : null
      return h(icon, { class: GLYPH[size.value] })
    }
    function spinner() {
      return h('span', {
        class: ['lucide-loader-circle animate-spin', GLYPH[size.value]],
        'aria-hidden': 'true',
      })
    }

    return () => {
      const icon = iconOnly()
      const busy = props.disabled || props.loading
      const held = ['open', 'active'].includes(attrs['data-state'])
      const classes = [
        'press inline-flex shrink-0 items-center justify-center rounded-full font-[580] leading-none transition-colors',
        props.disabled ? DISABLED[variant.value] : LOOK[variant.value][theme.value],
        held && !props.disabled ? HELD : '',
        props.loading && !props.disabled ? 'pointer-events-none' : '',
        icon ? ICON_SIZE[size.value] : TEXT_SIZE[size.value],
      ]
      let children
      if (icon) {
        children = [
          props.loading
            ? spinner()
            : props.icon
              ? glyph(props.icon)
              : slots.icon
                ? slots.icon()
                : h('span', { class: ['inline-flex', GLYPH[size.value]] }, slots.default?.()),
        ]
        if (props.label) children.push(h('span', { class: 'sr-only' }, props.label))
      } else {
        children = [
          props.loading ? spinner() : slots.prefix ? slots.prefix() : glyph(props.iconLeft),
          props.loading && props.loadingText
            ? props.loadingText
            : h('span', { class: 'truncate' }, slots.default?.() ?? props.label),
          slots.suffix ? slots.suffix() : glyph(props.iconRight),
        ]
      }
      const common = {
        ...attrs,
        class: [classes, attrs.class],
        title: attrs.title ?? props.tooltip,
        'aria-busy': props.loading || undefined,
        'data-kit-button': variant.value,
      }
      if (!busy && props.route) return h(RouterLink, { ...common, to: props.route }, () => children)
      if (!busy && props.href)
        return h(
          'a',
          { ...common, href: props.href, target: '_blank', rel: 'noreferrer noopener' },
          children,
        )
      return h('button', { ...common, type: props.type, disabled: busy }, children)
    }
  },
})
</script>
