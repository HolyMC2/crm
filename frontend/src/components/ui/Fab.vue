<template>
  <!-- The one create action of a list (Shell SPEC §2.2.6): an extended FAB at
       the bottom end of the page, 16px above the bottom nav. It is absolute
       inside the page (give the page `relative`), so it never guesses the
       nav's height. Records use one filled button instead. -->
  <component
    :is="to ? 'RouterLink' : 'button'"
    :to="to || undefined"
    :type="to ? undefined : 'button'"
    class="press absolute bottom-4 z-10 flex h-14 items-center justify-center gap-2 rounded-2xl bg-surface-gray-10 text-base font-semibold text-ink-base shadow-lg"
    :class="[
      position === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-4',
      extended ? 'px-5' : 'w-14',
    ]"
    :aria-label="label"
    data-ui-fab
    data-testid="list-create-fab"
  >
    <span :class="[icon, 'size-6 flex-none']" aria-hidden="true" />
    <span v-if="extended" class="whitespace-nowrap">{{ label }}</span>
  </component>
</template>
<script setup>
defineProps({
  label: { type: String, required: true },
  icon: { type: String, default: 'lucide-plus' },
  /** Icon and label (default); false: icon only, the label stays for screen readers. */
  extended: { type: Boolean, default: true },
  to: { type: [String, Object], default: null },
  /** 'end' (Material, as the Agenda) or 'center' (where a right-side launcher sits). */
  position: { type: String, default: 'end' },
})
</script>
