<template>
  <!-- A page's own heading block (Shell SPEC §2.2.2): the title on its own
       row, wrapping between words (never «T…»), one subtitle line, and the
       actions under it on a phone (beside it on wide screens). On list pages
       a phone shows the title in the AppBar instead, and create is a Fab. -->
  <div
    class="flex flex-col gap-3 px-4 pb-3 pt-4 sm:flex-row sm:items-start sm:gap-4"
    data-ui-page-header
  >
    <div class="min-w-0 flex-1">
      <component
        :is="`h${level}`"
        class="break-words text-xl font-semibold leading-snug text-ink-gray-9 [text-wrap:balance]"
        data-ui-page-title
      >
        {{ title
        }}<span
          v-if="count !== undefined && count !== null && count !== ''"
          class="ml-1.5 font-normal text-ink-gray-6"
          >{{ count }}</span
        >
      </component>
      <p
        v-if="subtitle"
        class="mt-0.5 line-clamp-2 break-words text-sm leading-snug text-ink-gray-6 sm:line-clamp-none"
      >
        {{ subtitle }}
      </p>
      <slot />
    </div>
    <div
      v-if="$slots.actions"
      class="flex flex-wrap items-center gap-2 sm:flex-none sm:justify-end"
      data-ui-page-actions
    >
      <slot name="actions" />
    </div>
  </div>
</template>
<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  count: { type: [Number, String], default: undefined },
  /** Heading level: 1 when the page has no AppBar title, else 2. */
  level: { type: Number, default: 2 },
})
</script>
