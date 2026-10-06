<template>
  <section class="mx-auto w-full max-w-lg space-y-4 p-6">
    <h1 class="text-xl font-semibold">
      No tienes permiso para abrir esta sección
    </h1>
    <p class="text-sm text-ink-gray-7">{{ copy.explain }}</p>
    <div class="flex flex-wrap gap-2">
      <Button
        v-if="
          !['archivos', 'avisos', 'compras'].includes(module) ||
          moduleEnabled(shellBoot, 'contactos')
        "
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
import { loadShell, shellBoot } from '@/composables/muelleShell'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
import {
  recoveryModule,
  recoveryReady,
  safeIntendedRoute,
} from '@/utils/shellRoutes'
const route = useRoute(),
  router = useRouter(),
  message = ref(''),
  loading = ref(false)
const COPY = {
  archivos: {
    explain:
      'Para abrir Archivos necesitas acceso a los documentos de tu empresa. Pide al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito acceso a Archivos en Muelle (documentos de mi empresa) para recibir y clasificar comprobantes; quiero retomar el documento que intentaba abrir.',
    missing:
      'Todavía falta acceso a Archivos. Comparte la solicitud y reintenta después del ajuste.',
  },
  avisos: {
    explain:
      'Avisos es para cuentas del personal. Pide al encargado que convierta tu usuario en usuario del sistema y que esté activo; después toca Reintentar permisos.',
    request:
      'Necesito que mi usuario de Muelle sea usuario del sistema (personal) y esté activo para ver mis Avisos; quiero retomarlos después del ajuste.',
    missing:
      'Tu usuario todavía no es de personal. Comparte la solicitud y reintenta después del ajuste.',
  },
  compras: {
    explain:
      'Para abrir Compras necesitas permiso de lectura de órdenes de compra. Pide al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito permiso de lectura de órdenes de compra para abrir Compras en Muelle; quiero retomar la compra que intentaba abrir.',
    missing:
      'Todavía falta acceso a Compras. Comparte la solicitud y reintenta después del ajuste.',
  },
  contactos: {
    explain:
      'Para abrir Contactos necesitas permiso de lectura de un origen nativo y acceso a su módulo. Pide al encargado que revise tu usuario.',
    request:
      'Necesito permiso de lectura para abrir Contactos en Muelle. Revisa los registros nativos que debo consultar y sus módulos; quiero retomar la ficha que intentaba abrir.',
    missing:
      'Todavía falta acceso a los datos de Contactos. Comparte la solicitud y reintenta después del ajuste.',
  },
  ventas: {
    explain:
      'Para ver oportunidades y prospectos de ventas necesitas acceso al módulo Ventas. Tu acceso a Contactos se conserva.',
    request:
      'Necesito permiso para abrir Ventas en Muelle. Revisa mi rol de ventas y el acceso al módulo; quiero retomar la sección que intentaba abrir.',
    missing:
      'Todavía falta acceso a Ventas. Puedes continuar en Contactos o compartir la solicitud.',
  },
}
const module = computed(() => recoveryModule(route.query.intended)),
  copy = computed(() => COPY[module.value])
async function requestAccess() {
  const text = copy.value.request
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
    if (recoveryReady(module.value, data))
      router.replace(
        safeIntendedRoute('/crm' + (route.query.intended || '/')).slice(4) ||
          '/',
      )
    else message.value = copy.value.missing
  } catch (error) {
    message.value =
      error.messages?.[0] ||
      'No pudimos revisar tus permisos. Reintenta cuando vuelva la conexión.'
  } finally {
    loading.value = false
  }
}
</script>
