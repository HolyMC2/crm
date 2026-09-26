<template>
  <RouterLink
    v-if="hasApp('doco') && isManager()"
    :to="{
      name: 'Automations',
      query: {
        reference_doctype: doctype,
        reference_name: name,
        return_to: `/crm${route.fullPath}`,
      },
    }"
    class="inline-flex min-h-11 items-center rounded px-2 text-sm text-ink-gray-7 underline focus-visible:ring-2"
    >{{ __('Automations') }}</RouterLink
  >
</template>
<script setup>
import { useRoute } from 'vue-router'
import { usersStore } from '@/stores/users'
import { hasApp } from '@/utils/crmCapabilities'
defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
})
const route = useRoute()
const { isManager } = usersStore()
</script>
