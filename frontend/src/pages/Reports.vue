<template>
  <div
    class="flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-surface-gray-2"
  >
    <nav
      v-if="addonAvailable"
      :aria-label="__('Report area')"
      class="flex shrink-0 gap-2 border-b border-outline-gray-2 bg-surface-base px-3"
    >
      <button
        class="min-h-11 rounded px-3 text-ink-gray-9"
        :aria-pressed="!marketing"
        @click="marketing = false"
      >
        {{ __('Sales') }}
      </button>
      <button
        class="min-h-11 rounded px-3 text-ink-gray-9"
        :aria-pressed="marketing"
        @click="marketing = true"
      >
        {{ __('Marketing') }}
      </button>
    </nav>
    <KeepAlive
      ><MarketingReports v-if="marketing && addonAvailable" /><SalesReport
        v-else
    /></KeepAlive>
  </div>
</template>
<script setup>
import { defineAsyncComponent, ref } from 'vue'
import { addonAvailable } from '@/utils/crmCapabilities'
import SalesReport from '@/components/Reports/SalesReport.vue'
const MarketingReports = defineAsyncComponent(
  () => import('@/components/Reports/MarketingReports.vue'),
)
const marketing = ref(false)
</script>
