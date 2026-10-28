<!-- Vendored from muelle/workspace/packages/ui@0.1.0 (ce74d3b9f43a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- The one create action of a list (Shell SPEC §2.2.6). On a phone it docks
       at the end of the shell's command bar (primaryDock), in the thumb's
       reach and never over the last rows; the label stays as its accessible
       name and tooltip. Elsewhere it is an extended FAB at the bottom end of
       the page, absolute inside it (give the page `relative`). Records use one
       filled button instead. -->
  <Teleport to="#shell-primary-action" :disabled="!primaryDock" defer>
    <UiTag
      :as="to ? RouterLink : 'button'"
      :to="to || undefined"
      :type="to ? undefined : 'button'"
      :class="
        primaryDock
          ? DOCKED
          : [
              FLOATING,
              position === 'center' ? 'left-1/2 -translate-x-1/2' : 'right-4',
              extended ? 'px-5' : 'w-14',
            ]
      "
      :aria-label="label"
      :title="primaryDock ? label : undefined"
      data-ui-fab
      data-testid="list-create-fab"
      v-bind="$attrs"
    >
      <Transition name="icon-swap" mode="out-in">
        <span
          :key="icon"
          :class="[icon, 'size-6 flex-none']"
          aria-hidden="true"
        />
      </Transition>
      <span v-if="extended && !primaryDock" class="whitespace-nowrap">{{
        label
      }}</span>
    </UiTag>
  </Teleport>
</template>
<script setup>
import UiTag from './UiTag'
import { RouterLink } from 'vue-router'
import { primaryDock } from './primaryDock'

// The root is a Teleport, so the page's attributes (@click, data-testid) are
// bound on the button itself, last, so they win over the defaults as a
// fallthrough would.
defineOptions({ inheritAttrs: false })
defineProps({
  label: { type: String, required: true },
  icon: { type: String, default: 'lucide-plus' },
  /** Icon and label (default); false: icon only, the label stays for screen readers. */
  extended: { type: Boolean, default: true },
  to: { type: [String, Object], default: null },
  /** 'end' (Material, as the Agenda) or 'center' (where a right-side launcher sits). */
  position: { type: String, default: 'end' },
})

const FLOATING =
  'press absolute bottom-4 z-10 flex h-14 items-center justify-center gap-2 rounded-8 bg-surface-gray-10 text-base font-semibold text-ink-base shadow-lg'
// The tenant accent carries the page's one primary action.
const DOCKED =
  'press ml-0.5 flex size-11 flex-none items-center justify-center rounded-full bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
</script>
