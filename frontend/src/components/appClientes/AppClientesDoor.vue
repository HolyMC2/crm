<template>
  <!-- The door to «App de tus clientes» from another page (Fidelidad): shown
       only where the cell answers a shop with an online store and lets this
       person read it, with what the app shows today on its second line. -->
  <ListRow
    v-if="view"
    to="/negocio/app-clientes"
    icon="lucide-smartphone"
    :title="__('What your customers see in their app', null, CTX)"
    :subtitle="view.line"
    :subtitle-lines="2"
    data-testid="app-clientes-puerta"
  >
    <template #trailing>
      <span
        class="lucide-chevron-right size-4 text-ink-gray-5"
        aria-hidden="true"
      />
    </template>
  </ListRow>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { ListRow } from '@/components/ui'
import { defaultState } from './api'
import { CTX, doorView } from './view'

const state = ref(null)
const view = computed(() => doorView(state.value))

onMounted(async () => {
  try {
    state.value = await defaultState()
  } catch {
    // No online store, or this person may not read it: no door.
    state.value = null
  }
})
</script>
