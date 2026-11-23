<!-- Vendored from muelle/workspace/packages/ui@0.3.0 (52d6d25388e7). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- A tonal group (Material 3): its children as container-low tiles 2 px
       apart, 20 px corners on the group's outer edge. For a screen that drops a
       block's heading; a hairline list stays valid where it reads better. -->
  <component
    :is="tag"
    class="flex flex-col gap-0.5 overflow-hidden rounded-7 [&>*]:bg-[var(--muelle-surface-container-low)]"
    data-ui-list-group
  >
    <slot />
  </component>
</template>

<script setup>
defineProps({
  // ul for a list of rows (its children are <li>), div for anything else
  tag: { type: String, default: 'div' },
})
</script>
