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
