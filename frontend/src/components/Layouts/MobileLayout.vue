<template>
  <div class="flex h-screen w-screen">
    <MobileSidebar />
    <div class="flex h-full flex-1 flex-col bg-surface-white">
      <MobileAppHeader />
      <!-- connectivity strip (spec 3.4): silent socket death and dead zones were
           read as "no me llegan mensajes" — say it out loud instead -->
      <div
        v-if="!online"
        class="flex flex-none items-center justify-center gap-2 bg-surface-amber-1 px-3 py-1.5 text-[12px] font-semibold text-ink-amber-3"
        role="status"
      >
        <span class="h-1.5 w-1.5 flex-none animate-pulse rounded-full" style="background: #d9930b" />
        {{ __('Sin conexión — mostrando lo último guardado') }}
      </div>
      <!-- route-keyed so navigation replays the page-in animation (native-app feel).
           App.vue's router-view is keyed on fullPath too, so this adds no extra
           re-renders — it only hosts the CSS animation. overflow-auto lives HERE
           (not on the column) so the header + bottom tab bar stay pinned. -->
      <div :key="$route.fullPath" class="page-in flex min-h-0 flex-1 flex-col overflow-auto">
        <slot />
      </div>
      <MobileTabBar />
    </div>
    <GlobalModals />
  </div>
</template>
<script setup>
import MobileSidebar from '@/components/Mobile/MobileSidebar.vue'
import MobileAppHeader from '@/components/Mobile/MobileAppHeader.vue'
import MobileTabBar from '@/components/Mobile/MobileTabBar.vue'
import GlobalModals from '@/components/Modals/GlobalModals.vue'
import { useRoute } from 'vue-router'
import { useOnline } from '@vueuse/core'

const $route = useRoute()
const online = useOnline()
</script>
