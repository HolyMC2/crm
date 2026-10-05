<template><p role="status" class="p-4">Abriendo Contactos…</p></template>
<script setup>
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
const route = useRoute(),
  router = useRouter()
onMounted(() =>
  router.replace({
    name: 'Contacto',
    params: { source: 'contact', name: route.params.contactId },
    query: route.query,
    hash: route.hash,
  }),
)
</script>
