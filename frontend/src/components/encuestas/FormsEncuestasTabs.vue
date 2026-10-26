<template>
  <!-- Formularios and Encuestas share one front (Q7 = B): shown only when
       the worker may open both, one tab per page, each tab its own route. -->
  <nav
    v-if="tabs.length > 1"
    class="px-4 pt-3 sm:px-5"
    data-testid="encuestas-front"
  >
    <Segmented
      class="sm:max-w-xs"
      :model-value="route.name"
      :options="tabs"
      :label="__('Forms and surveys')"
      @update:model-value="open"
    />
  </nav>
</template>
<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Segmented from '@/components/ui/Segmented.vue'
import { shellBoot } from '@/composables/muelleShell'
import { usersStore } from '@/stores/users'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
import {
  frontTabs,
  frontTarget,
  rememberFront,
} from '@/composables/useEncuestas'

const route = useRoute()
const router = useRouter()
const { isManager } = usersStore()

const tabs = computed(() =>
  frontTabs({
    forms: isManager(),
    encuestas: moduleEnabled(shellBoot.value, 'encuestas'),
  }),
)

watch(
  () => route.fullPath,
  () => rememberFront(route),
  { immediate: true },
)

function open(name) {
  const tab = tabs.value.find((t) => t.value === name)
  if (tab) router.push(frontTarget(tab))
}
</script>
