<template>
  <div class="flex h-screen w-screen">
    <DocoNavRail />
    <div class="flex-1 flex flex-col h-full overflow-auto bg-surface-white">
      <AppHeader />
      <slot />
    </div>
    <GlobalModals />
  </div>
</template>
<script setup>
// FCRM redesign: the 58px DocoNavRail replaces the wide AppSidebar (left in place,
// unused, to keep the upstream fork rebase-clean). handoff §4.1 / §9.2.
import DocoNavRail from '@/components/Layouts/DocoNavRail.vue'
import AppHeader from '@/components/Layouts/AppHeader.vue'
import GlobalModals from '@/components/Modals/GlobalModals.vue'
</script>
