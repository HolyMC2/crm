<template>
  <div class="flex pr-3">
    <div class="z-20 ml-2 flex items-center justify-center">
      <Button
        class="size-7"
        variant="ghost"
        @click="sidebarOpened = !sidebarOpened"
      >
        <MenuIcon class="h-4 text-ink-gray-9" />
      </Button>
    </div>
    <!-- min-w-0: the teleported page header (breadcrumbs + actions) must shrink
         and truncate inside the phone width instead of widening the shell. -->
    <div id="app-header" class="min-w-0 flex-1" />
  </div>
  <CallUI class="mr-3 mt-2" />
</template>

<script setup>
import MenuIcon from '@/components/Icons/MenuIcon.vue'
import CallUI from '@/components/Telephony/CallUI.vue'
import { mobileSidebarOpened as sidebarOpened } from '@/composables/settings'
</script>
