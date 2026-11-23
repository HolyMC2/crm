<!-- Vendored from muelle/workspace/packages/ui@0.3.0 (08716fb45b7a). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<template>
  <!-- KPI tiles two per row on a phone, one per row when a tile would be
       narrower than 9rem (305px, large text), more on wide screens. -->
  <div
    class="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2"
    data-ui-kpi-grid
  >
    <slot />
  </div>
</template>
