<template>
  <div class="flex h-screen w-screen">
    <MobileSidebar />
    <div class="flex h-full flex-1 flex-col overflow-auto bg-surface-white">
      <MobileAppHeader />
      <!-- route-keyed so navigation replays the page-in animation (native-app feel).
           App.vue's router-view is keyed on fullPath too, so this adds no extra
           re-renders — it only hosts the CSS animation. -->
      <div :key="$route.fullPath" class="page-in flex min-h-0 flex-1 flex-col">
        <slot />
      </div>
    </div>
    <GlobalModals />
  </div>
</template>
<script setup>
import MobileSidebar from '@/components/Mobile/MobileSidebar.vue'
import MobileAppHeader from '@/components/Mobile/MobileAppHeader.vue'
import GlobalModals from '@/components/Modals/GlobalModals.vue'
import { useRoute } from 'vue-router'

const $route = useRoute()
</script>
