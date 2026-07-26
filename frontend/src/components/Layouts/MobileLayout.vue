<template>
  <div class="flex h-screen w-screen">
    <MobileSidebar />
    <!-- min-w-0 HERE is the real side-scroll fix: this column is the item of the
         horizontal shell row, so its auto minimum = the widest descendant's
         intrinsic width (chip scrollers etc. tunnel up through flex-col cross
         axes untouched by their own min-w-0/overflow). 382px @ 360 on Marco's
         phone. overflow-x-hidden is the belt. -->
    <div class="flex h-full min-w-0 flex-1 flex-col overflow-x-hidden bg-surface-white">
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
      <OutboxStrip />
      <!-- install nudge (spec 1.7): shows only when installable + ≥3 distinct-day
           visits; dismiss is permanent. iOS never fires the event → never shows. -->
      <div
        v-if="installNudgeVisible"
        class="flex flex-none items-center gap-2 border-b border-outline-gray-1 bg-surface-gray-1 px-3 py-1.5 text-[12px] text-ink-gray-7"
        role="status"
      >
        <span aria-hidden="true">📲</span>
        <span class="min-w-0 flex-1 truncate">{{ __('Instala la app para abrirla más rápido') }}</span>
        <button
          class="press flex-none rounded-md px-2.5 py-1 text-[12px] font-semibold text-white"
          style="background: var(--brand)"
          @click="acceptInstall"
        >
          {{ __('Instalar') }}
        </button>
        <button
          class="press flex-none px-1.5 text-[14px] text-ink-gray-5"
          :aria-label="__('No mostrar de nuevo')"
          @click="dismissInstallNudge"
        >
          ×
        </button>
      </div>
      <!-- route-keyed so navigation replays the page-in animation (native-app feel).
           App.vue's router-view is keyed on fullPath too, so this adds no extra
           re-renders — it only hosts the CSS animation. overflow-auto lives HERE
           (not on the column) so the header + bottom tab bar stay pinned. -->
      <!-- overflow-x-hidden + min-w-0 is THE side-scroll choke point: any inner
           element's min-content (e.g. a chip row scroller) otherwise propagates
           up flex ancestors lacking min-w-0 and widens the whole shell past the
           viewport (382px @ 360 — Marco's phone, 07-25). Inner overflow-x-auto
           rows still scroll internally. -->
      <div
        :key="$route.fullPath"
        class="page-in flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
      >
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
import OutboxStrip from '@/components/Mobile/OutboxStrip.vue'
import GlobalModals from '@/components/Modals/GlobalModals.vue'
import { useRoute } from 'vue-router'
import { useOnline } from '@vueuse/core'
import {
  initInstallNudge,
  installNudgeVisible,
  acceptInstall,
  dismissInstallNudge,
} from '@/composables/installNudge'

const $route = useRoute()
const online = useOnline()
initInstallNudge()
</script>
