<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <!-- Phone: one app bar with up to the list and the task as its title
         (route meta.ownPhoneHeader); the record body is shared with the
         desktop list + detail (PendienteDetail). -->
    <AppBar
      v-if="phone"
      :back="backTarget"
      :back-label="backLabel"
      :context="__('Pendientes')"
      :title="title || __('Pendiente')"
    />
    <div
      class="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10 sm:pt-6"
    >
      <RouterLink
        v-if="!phone"
        :to="backTarget"
        class="inline-flex min-h-11 items-center gap-1 rounded-6 text-sm text-ink-gray-6 hover:text-ink-gray-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:min-h-8"
      >
        <LucideArrowLeft class="h-4 w-4" />{{ backLabel }}
      </RouterLink>
      <PendienteDetail
        :doctype="doctype || ''"
        :name="name"
        :docked="true"
        @loaded="(row) => (title = row.description)"
        @redirect="
          (target) => router.replace(pendienteRoute(target, route.query))
        "
      >
        <template #leave>
          <Button :label="backLabel" @click="router.push(backTarget)" />
        </template>
      </PendienteDetail>
    </div>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { AppBar } from '@/components/ui'
import { isMobile as phone } from '@/composables/breakpoint'
import PendienteDetail from '@/components/pendientes/PendienteDetail.vue'
import { safeIntendedRoute } from '@/utils/shellRoutes'
import { pendienteRoute, sourceFromSlug } from '@/composables/usePendientes'
import LucideArrowLeft from '~icons/lucide/arrow-left'

const props = defineProps({
  source: { type: String, required: true },
  name: { type: String, required: true },
})
const route = useRoute(),
  router = useRouter()
const title = ref('')
const doctype = computed(() => sourceFromSlug(props.source))
// Opened from another shell page (Hoy) with the return protocol: back goes there.
const returnTo = computed(() => {
  const value = route.query.return_to
  return typeof value === 'string' && value.startsWith('/crm/')
    ? safeIntendedRoute(value, '')
    : ''
})
const backTarget = computed(() =>
  returnTo.value
    ? returnTo.value.replace(/^\/crm/, '')
    : {
        name: 'Pendientes',
        query: Object.fromEntries(
          new URLSearchParams(String(route.query.list || '')),
        ),
      },
)
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        String(route.query.return_label || 'Hoy').slice(0, 40),
      ])
    : __('Back to Pendientes'),
)
</script>
