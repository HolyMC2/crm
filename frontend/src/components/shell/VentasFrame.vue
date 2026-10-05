<template>
  <!-- Ventas inside the Muelle shell: the shell owns the rail, phone header
       and bottom nav; Ventas adds its sections sidebar and page header. -->
  <div v-if="!isMobile" class="flex h-full w-full min-w-0">
    <VentasSidebar />
    <div
      class="flex h-full min-w-0 flex-1 flex-col overflow-auto bg-surface-base"
    >
      <AppHeader />
      <slot />
    </div>
    <GlobalModals />
  </div>
  <div v-else class="flex h-full w-full min-w-0 flex-col overflow-x-hidden">
    <OutboxStrip />
    <CallUI class="mx-3 empty:hidden" />
    <!-- min-w-0 + overflow-x-hidden: chip rows scroll inside, never the shell. -->
    <div
      :key="$route.fullPath"
      class="page-in flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
    >
      <slot />
    </div>
    <GlobalModals />
  </div>
</template>
<script setup>
import { isMobile } from '@/composables/breakpoint'
import AppHeader from '@/components/Layouts/AppHeader.vue'
import GlobalModals from '@/components/Modals/GlobalModals.vue'
import OutboxStrip from '@/components/Mobile/OutboxStrip.vue'
import CallUI from '@/components/Telephony/CallUI.vue'
import VentasSidebar from './VentasSidebar.vue'
</script>
