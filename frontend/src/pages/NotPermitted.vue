<template>
  <section class="mx-auto w-full max-w-lg space-y-4 p-6">
    <h1 class="text-xl font-semibold">
      No tienes permiso para abrir esta sección
    </h1>
    <p class="text-sm text-ink-gray-7">
      {{
        contactos
          ? 'Para abrir Contactos necesitas permiso de lectura de un origen nativo y acceso a su módulo. Pide al encargado que revise tu usuario.'
          : 'Para ver oportunidades y prospectos de ventas necesitas acceso al módulo Ventas. Tu acceso a Contactos se conserva.'
      }}
    </p>
    <div class="flex flex-wrap gap-2">
      <Button
        label="Volver a Contactos"
        variant="solid"
        @click="router.push('/contactos')"
      /><Button label="Pedir acceso" @click="requestAccess" /><Button
        label="Reintentar permisos"
        :loading="loading"
        @click="retry"
      />
    </div>
    <p v-if="message" role="status" class="text-sm">{{ message }}</p>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadShell } from '@/composables/muelleShell'
import { safeIntendedRoute } from '@/utils/shellRoutes'
const route = useRoute(),
  router = useRouter(),
  message = ref(''),
  loading = ref(false)
const contactos = computed(() =>
  ['contactos', 'contacts', 'organizations'].includes(
    String(route.query.intended || '')
      .split('?')[0]
      .split('/')[1],
  ),
)
async function requestAccess() {
  const text = contactos.value
    ? 'Necesito permiso de lectura para abrir Contactos en Muelle. Revisa los registros nativos que debo consultar y sus módulos; quiero retomar la ficha que intentaba abrir.'
    : 'Necesito permiso para abrir Ventas en Muelle. Revisa mi rol de ventas y el acceso al módulo; quiero retomar la sección que intentaba abrir.'
  try {
    await navigator.clipboard.writeText(text)
    message.value = 'Solicitud copiada. Compártela con tu encargado.'
  } catch {
    message.value = text
  }
}
async function retry() {
  loading.value = true
  try {
    const data = await loadShell({ refresh: true })
    if (contactos.value ? data.capabilities?.directory : data.sales_access)
      router.replace(
        safeIntendedRoute('/crm' + (route.query.intended || '/')).slice(4) ||
          '/',
      )
    else
      message.value = contactos.value
        ? 'Todavía falta acceso a los datos de Contactos. Comparte la solicitud y reintenta después del ajuste.'
        : 'Todavía falta acceso a Ventas. Puedes continuar en Contactos o compartir la solicitud.'
  } catch (error) {
    message.value =
      error.messages?.[0] ||
      'No pudimos revisar tus permisos. Reintenta cuando vuelva la conexión.'
  } finally {
    loading.value = false
  }
}
</script>
