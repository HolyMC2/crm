<template>
  <!-- Bancos (Shell SPEC §6 DD19). ≥1024: master-detail, the account cards
       on the left and the chosen account on the right. Below: one page at a
       time; the account's back returns to the cards. -->
  <div
    v-if="wide"
    class="flex h-full min-w-0 flex-1 overflow-hidden"
    data-testid="bancos-split"
  >
    <div
      class="bancos-master flex flex-none flex-col overflow-hidden border-r border-outline-gray-1"
    >
      <CuentasLista pane :selected="cuenta" />
    </div>
    <div class="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <CuentaDetalle v-if="cuenta" :key="cuenta" :cuenta="cuenta" pane />
      <EmptyState
        v-else
        state="empty"
        title="Elige una cuenta"
        message="Ábrela de la lista para ver sus movimientos y conciliarlos."
      />
    </div>
  </div>
  <CuentaDetalle v-else-if="cuenta" :key="cuenta" :cuenta="cuenta" />
  <CuentasLista v-else />
</template>
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { EmptyState } from '@/components/ui'
import { isWide } from '@/composables/breakpoint'
import CuentaDetalle from '@/components/bancos/CuentaDetalle.vue'
import CuentasLista from '@/components/bancos/CuentasLista.vue'

const route = useRoute()
const wide = isWide
const cuenta = computed(() => String(route.params.cuenta || ''))
</script>
<style scoped>
/* scoped, not Tailwind arbitrary values: keeps the global sheet in budget */
.bancos-master {
  width: 24rem;
}
@media (min-width: 1280px) {
  .bancos-master {
    width: 28rem;
  }
}
</style>
