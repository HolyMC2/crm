<template>
  <!-- Tu dinero: the money pages behind one route (router.js). They ship in one
       chunk: as separate small chunks the build folds them into the entry. -->
  <component :is="page" :key="route.params.dinero" />
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ADondeVa from '@/pages/ADondeVa.vue'
import Colchon from '@/pages/Colchon.vue'
import Deudas from '@/pages/Deudas.vue'

const PAGES = { deudas: Deudas, 'a-donde-va': ADondeVa, colchon: Colchon }
const route = useRoute()
const page = computed(() => PAGES[route.params.dinero] || Deudas)
</script>
