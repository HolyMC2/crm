<template>
  <section class="mx-auto w-full max-w-lg space-y-4 p-6">
    <h1 class="text-xl font-semibold">
      No tienes permiso para abrir esta sección
    </h1>
    <p class="text-sm text-ink-gray-7">{{ copy.reason }}</p>
    <div class="flex flex-wrap gap-2">
      <Button
        v-if="landing"
        :label="`Ir a ${landing.label}`"
        variant="solid"
        @click="router.push(landing.to)"
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
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import {
  firstModuleRoute,
  loadShell,
  shellBoot,
} from '@/composables/muelleShell'
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
  agenda: {
    reason:
      'Para abrir la Agenda necesitas una cuenta de personal con permiso de lectura de eventos. Pide al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito permiso de lectura de eventos (cuenta de personal) para abrir la Agenda en Muelle; quiero retomar la cita que intentaba abrir.',
    missing:
      'Todavía falta acceso a la Agenda. Comparte la solicitud y reintenta después del ajuste.',
  },
  archivos: {
    reason:
      'Para abrir Archivos necesitas acceso a los documentos de tu empresa. Pide al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito acceso a Archivos en Muelle (documentos de mi empresa) para recibir y clasificar comprobantes; quiero retomar el documento que intentaba abrir.',
    missing:
      'Todavía falta acceso a Archivos. Comparte la solicitud y reintenta después del ajuste.',
  },
  avisos: {
    reason:
      'Avisos es para cuentas del personal. Pide al encargado que convierta tu usuario en usuario del sistema y que esté activo; después toca Reintentar permisos.',
    request:
      'Necesito que mi usuario de Muelle sea usuario del sistema (personal) y esté activo para ver mis Avisos; quiero retomarlos después del ajuste.',
    missing:
      'Tu usuario todavía no es de personal. Comparte la solicitud y reintenta después del ajuste.',
  },
  cobranza: {
    reason:
      'Para abrir Cobranza necesitas permiso de lectura de facturas de venta. Pide al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito permiso de lectura de facturas de venta para abrir Cobranza en Muelle; quiero retomar el cliente que intentaba abrir.',
    missing:
      'Todavía falta acceso a Cobranza. Comparte la solicitud y reintenta después del ajuste.',
  },
  compras: {
    reason:
      'Para abrir Compras necesitas permiso de lectura de órdenes de compra. Pide al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito permiso de lectura de órdenes de compra para abrir Compras en Muelle; quiero retomar la compra que intentaba abrir.',
    missing:
      'Todavía falta acceso a Compras. Comparte la solicitud y reintenta después del ajuste.',
  },
  gastos: {
    reason:
      'Para abrir Gastos necesitas permiso de lectura de facturas de proveedor. Pide al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito permiso de lectura de facturas de proveedor para abrir Gastos en Muelle; quiero retomar la factura que intentaba abrir.',
    missing:
      'Todavía falta acceso a Gastos. Comparte la solicitud y reintenta después del ajuste.',
  },
  contactos: {
    reason:
      'Para abrir Contactos necesitas permiso de lectura de un origen nativo y acceso a su módulo. Pide al encargado que revise tu usuario.',
    request:
      'Necesito permiso de lectura para abrir Contactos en Muelle. Revisa los registros nativos que debo consultar y sus módulos; quiero retomar la ficha que intentaba abrir.',
    missing:
      'Todavía falta acceso a los datos de Contactos. Comparte la solicitud y reintenta después del ajuste.',
  },
  garantias: {
    reason:
      'Para abrir Garantías necesitas permiso de lectura de casos de garantía en tu empresa. Pide al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito permiso de lectura de casos de garantía (Warranty Claim) en mi empresa para abrir Garantías en Muelle; quiero retomar el caso que intentaba abrir.',
    missing:
      'Todavía falta acceso a Garantías. Comparte la solicitud y reintenta después del ajuste.',
  },
  pendientes: {
    reason:
      'Para abrir Pendientes necesitas permiso de lectura de tus pendientes (ToDo) o de las tareas de Ventas. No hace falta acceso a Ventas.',
    request:
      'Necesito permiso para leer mis pendientes (ToDo) en Muelle. Revisa mi usuario; quiero retomar la lista que intentaba abrir.',
    missing:
      'Todavía falta permiso para leer tus pendientes. Comparte la solicitud y reintenta después del ajuste.',
  },
  ventas: {
    reason:
      'Para ver oportunidades y prospectos de ventas necesitas acceso al módulo Ventas. Tu acceso a los demás módulos se conserva.',
    request:
      'Necesito permiso para abrir Ventas en Muelle. Revisa mi rol de ventas y el acceso al módulo; quiero retomar la sección que intentaba abrir.',
    missing:
      'Todavía falta acceso a Ventas. Puedes continuar en otro módulo o compartir la solicitud.',
  },
}
const module = computed(() => recoveryModule(route.query.intended))
const copy = computed(() => COPY[module.value])
// Where this worker can keep working now: another module they do have.
const landing = computed(() => firstModuleRoute(shellBoot.value, module.value))
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
        safeIntendedRoute(
          '/crm' + (route.query.intended || '/'),
          '/crm' + (firstModuleRoute(data)?.to || '/'),
        ).slice(4) || '/',
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
onMounted(() => loadShell().catch(() => null))
</script>
