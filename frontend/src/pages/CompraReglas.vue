<template>
  <!-- Compras' rules (shipping, supplier discounts) and the one being edited.
       ≥1024: the list on the left keeps its scope, search and scroll while
       the rule on the right changes; with none open the right pane compares
       them all. Below: one page at a time, as DocumentosSplit. -->
  <div
    v-if="wide"
    class="flex h-full min-w-0 flex-1 overflow-hidden"
    data-testid="reglas-split"
  >
    <div
      class="reglas-master flex flex-none flex-col overflow-hidden border-r border-outline-gray-1"
    >
      <component :is="kind.list" ref="list" pane @summary="summary = $event" />
    </div>
    <div class="relative flex min-w-0 flex-1 flex-col overflow-hidden">
      <component
        :is="kind.record"
        v-if="name"
        :key="name"
        :name="name"
        pane
        @saved="list?.load?.()"
      />
      <div v-else-if="summary" class="min-h-0 flex-1 overflow-y-auto">
        <component :is="kind.summary" :summary="summary" />
      </div>
    </div>
  </div>
  <component :is="kind.record" v-else-if="name" :key="name" :name="name" />
  <component :is="kind.list" v-else />
</template>
<script setup>
import { computed, defineAsyncComponent, ref, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import { isWide } from '@/composables/breakpoint'

const KINDS = {
  envios: {
    list: defineAsyncComponent(() => import('./CompraEnvios.vue')),
    record: defineAsyncComponent(() => import('./CompraEnvio.vue')),
    summary: defineAsyncComponent(
      () => import('@/components/compras/EnviosResumen.vue'),
    ),
  },
  descuentos: {
    list: defineAsyncComponent(() => import('./CompraDescuentos.vue')),
    record: defineAsyncComponent(() => import('./CompraDescuento.vue')),
    summary: defineAsyncComponent(
      () => import('@/components/compras/DescuentosResumen.vue'),
    ),
  },
}

const route = useRoute()
const wide = isWide
const kind = computed(() => KINDS[route.meta.reglas] || KINDS.envios)
const name = computed(() => String(route.params.name || ''))
const summary = shallowRef(null)
const list = ref(null)
</script>
<style scoped>
/* scoped, not Tailwind arbitrary values: keeps the global sheet in budget */
.reglas-master {
  width: 24rem;
}
@media (min-width: 1280px) {
  .reglas-master {
    width: 28rem;
  }
}
</style>
