<template><p role="status" class="p-4">Abriendo Contactos…</p></template>
<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
const route = useRoute(),
  router = useRouter()
onMounted(() =>
  router.replace({
    name: 'Contactos',
    query: { ...route.query, segment: 'companies' },
  }),
)
</script>
