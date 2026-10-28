<!-- Vendored from muelle/workspace/packages/ui@0.1.0 (ce74d3b9f43a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- One list row (Shell SPEC §2.2.5, M3 list item): a leading avatar or
       icon, the title (wraps to two lines, never letter by letter), one
       secondary line, trailing meta. The whole row is the tap target, at
       least 44px (56px with a secondary line). -->
  <UiTag
    :as="tag"
    v-bind="linkAttrs"
    class="flex w-full items-center gap-3 px-4 py-2 text-left"
    :class="[
      subtitle || $slots.subtitle ? 'min-h-14' : 'min-h-12',
      interactive
        ? 'hover:bg-surface-gray-1 focus-visible:bg-surface-gray-2'
        : '',
      selected ? 'bg-surface-gray-2' : '',
    ]"
    :aria-current="selected ? 'true' : undefined"
    data-ui-list-row
  >
    <slot name="leading">
      <span
        v-if="avatar !== undefined && avatar !== null"
        class="flex size-9 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-sm font-semibold text-ink-gray-7"
        aria-hidden="true"
      >
        <span v-if="avatarText">{{ avatarText }}</span>
        <span v-else class="lucide-user size-5" />
      </span>
      <span
        v-else-if="icon"
        class="flex size-9 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
        aria-hidden="true"
      >
        <span :class="[icon, 'size-5']" />
      </span>
    </slot>
    <span class="flex min-w-0 flex-1 flex-col">
      <span
        class="line-clamp-2 break-words text-md leading-snug text-ink-gray-9"
        :class="strong ? 'font-semibold' : 'font-medium'"
        data-ui-list-row-title
        >{{ title }}<slot name="title"
      /></span>
      <span
        v-if="subtitle || $slots.subtitle"
        class="text-sm leading-snug"
        :class="[
          subtitleLines === 2 ? 'line-clamp-2 break-words' : 'truncate',
          subtitleTone === 'danger' ? 'text-ink-red-7' : 'text-ink-gray-6',
        ]"
        ><slot name="subtitle">{{ subtitle }}</slot></span
      >
    </span>
    <span
      v-if="meta || $slots.trailing"
      class="flex max-w-[45%] flex-none flex-col items-end gap-1 self-start pt-0.5 text-right"
    >
      <span
        v-if="meta"
        class="num whitespace-nowrap text-md"
        :class="metaTone === 'danger' ? 'text-ink-red-7' : 'text-ink-gray-7'"
        >{{ meta }}</span
      >
      <slot name="trailing" />
    </span>
  </UiTag>
</template>
<script setup>
import UiTag from './UiTag'
import { RouterLink } from 'vue-router'
import { computed, useAttrs } from 'vue'
import { initials } from './host'

const props = defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  subtitleLines: { type: Number, default: 1 },
  /** 'danger' for overdue/owed: a red line, never a red row. */
  subtitleTone: { type: String, default: '' },
  meta: { type: String, default: '' },
  metaTone: { type: String, default: '' },
  /** A person or company name: shows its initials in a coloured circle ('' = silhouette). */
  avatar: { type: String, default: undefined },
  /** A lucide class (`lucide-receipt`) in a grey circle, when there is no avatar. */
  icon: { type: String, default: '' },
  /** A route location: the row is a link. */
  to: { type: [String, Object], default: null },
  href: { type: String, default: '' },
  selected: { type: Boolean, default: false },
  strong: { type: Boolean, default: false },
})
// A click listener (`@click`) falls through to the root and makes it a button.
const attrs = useAttrs()

const tag = computed(() =>
  props.to ? RouterLink : props.href ? 'a' : attrs.onClick ? 'button' : 'div',
)
const interactive = computed(() => tag.value !== 'div')
const linkAttrs = computed(() =>
  props.to
    ? { to: props.to }
    : props.href
      ? { href: props.href }
      : tag.value === 'button'
        ? { type: 'button' }
        : {},
)

const avatarText = computed(() => initials(props.avatar || ''))
</script>
