<template>
  <section class="mx-auto w-full max-w-lg space-y-4 p-6">
    <h1 class="text-xl font-semibold">
      {{
        failed && !asksAccess
          ? 'No se pudo abrir esta sección'
          : 'No tienes permiso para abrir esta sección'
      }}
    </h1>
    <p class="text-sm text-ink-gray-7">
      {{ failed?.reason_text || copy.reason }}
    </p>
    <p v-if="failed?.detail" class="text-xs text-ink-gray-5">
      Detalle: {{ failed.detail }}
    </p>
    <div class="flex flex-wrap gap-2">
      <Button
        v-if="landing"
        :label="`Ir a ${landing.label}`"
        variant="solid"
        @click="router.push(landing.to)"
      /><Button
        v-if="asksAccess"
        label="Pedir acceso"
        @click="requestAccess"
      /><Button
        v-if="!failed || failed.retry"
        :label="asksAccess ? 'Reintentar permisos' : 'Reintentar'"
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
  hostedModules,
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
  resultados: {
    reason:
      'Resultados muestra las ventas, el efectivo y las reparaciones a quien las sigue (encargados de ventas o de contabilidad, encargado del taller). Pide al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito ver Resultados en Muelle: permiso de lectura de las ventas, cortes de caja o reparaciones de mi tienda. Quiero retomar los números que intentaba abrir.',
    missing:
      'Todavía falta acceso a Resultados. Comparte la solicitud y reintenta después del ajuste.',
  },
  bancos: {
    reason:
      'Bancos muestra los saldos y los movimientos de las cuentas de la empresa a quien lleva la contabilidad (dueño, encargado de contabilidad o contador). Pide al dueño que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito ver Bancos en Muelle: permiso de lectura de las cuentas bancarias o del libro mayor de mi empresa. Quiero retomar la cuenta que intentaba abrir.',
    missing:
      'Todavía falta acceso a Bancos. Comparte la solicitud y reintenta después del ajuste.',
  },
  contactos: {
    reason:
      'Para abrir Contactos necesitas permiso de lectura de un origen nativo y acceso a su módulo. Pide al encargado que revise tu usuario.',
    request:
      'Necesito permiso de lectura para abrir Contactos en Muelle. Revisa los registros nativos que debo consultar y sus módulos; quiero retomar la ficha que intentaba abrir.',
    missing:
      'Todavía falta acceso a los datos de Contactos. Comparte la solicitud y reintenta después del ajuste.',
  },
  encuestas: {
    reason:
      'Para abrir Encuestas necesitas permiso de lectura de las respuestas de clientes en tu empresa. Pide al dueño que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito permiso de lectura de las respuestas de clientes (Quality Feedback) en mi empresa para abrir Encuestas en Muelle; quiero retomar la respuesta que intentaba abrir.',
    missing:
      'Todavía falta acceso a Encuestas. Comparte la solicitud y reintenta después del ajuste.',
  },
  garantias: {
    reason:
      'Para abrir Garantías necesitas permiso de lectura de casos de garantía en tu empresa. Pide al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito permiso de lectura de casos de garantía (Warranty Claim) en mi empresa para abrir Garantías en Muelle; quiero retomar el caso que intentaba abrir.',
    missing:
      'Todavía falta acceso a Garantías. Comparte la solicitud y reintenta después del ajuste.',
  },
  equipo: {
    reason:
      'Equipo es para el dueño y los encargados. Tus turnos, tu asistencia y tus vacaciones están en Asistencia.',
    request:
      'Necesito abrir Equipo en Muelle: mi puesto debe ser Dueño o Encargado. Quiero retomar la persona que intentaba abrir.',
    missing:
      'Tu puesto todavía no es Dueño ni Encargado. Comparte la solicitud y reintenta después del ajuste.',
  },
  manual: {
    reason:
      'El manual de la tienda es para las cuentas del equipo. Pide al dueño o al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito leer el manual de la tienda en Muelle: revisa que mi usuario sea una cuenta del equipo activa. Quiero retomar el artículo que intentaba abrir.',
    missing:
      'Todavía falta acceso al manual de la tienda. Comparte la solicitud y reintenta después del ajuste.',
  },
  documentos: {
    reason:
      'Para abrir Documentos necesitas permiso de lectura de al menos un tipo de documento (cotizaciones, pedidos, facturas, compras o pagos). Pide al dueño o al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito permiso de lectura de los documentos de venta, compra o pago que uso (por ejemplo, facturas) para abrir Documentos en Muelle; quiero retomar el documento que intentaba abrir.',
    missing:
      'Todavía falta acceso a Documentos. Comparte la solicitud y reintenta después del ajuste.',
  },
  inventario: {
    reason:
      'Para abrir Inventario necesitas permiso de lectura de movimientos de inventario o de almacenes. Pide al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito permiso de lectura de movimientos de inventario (Stock Entry) y almacenes para abrir Inventario en Muelle; quiero retomar lo que intentaba abrir.',
    missing:
      'Todavía falta acceso a Inventario. Comparte la solicitud y reintenta después del ajuste.',
  },
  inmobiliaria: {
    reason:
      'Para abrir Inmobiliaria necesitas permiso de lectura de unidades o de alguna de sus listas de trabajo. Pide a un administrador que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito acceso a Inmobiliaria en Muelle (lectura de unidades o de mis listas de trabajo); quiero retomar lo que intentaba abrir.',
    missing:
      'Todavía falta acceso a Inmobiliaria. Comparte la solicitud y reintenta después del ajuste.',
  },
  hoy: {
    reason:
      'Hoy es la página de inicio de las cuentas del equipo. Tu usuario todavía no es una cuenta del equipo activa.',
    request:
      'Necesito abrir Hoy en Muelle: revisa que mi usuario sea una cuenta del equipo activa. Quiero retomar mi día.',
    missing:
      'Tu usuario todavía no es una cuenta del equipo activa. Comparte la solicitud y reintenta después del ajuste.',
  },
  pendientes: {
    reason:
      'Para abrir Pendientes necesitas permiso de lectura de tus pendientes (ToDo) o de las tareas de Ventas. No hace falta acceso a Ventas.',
    request:
      'Necesito permiso para leer mis pendientes (ToDo) en Muelle. Revisa mi usuario; quiero retomar la lista que intentaba abrir.',
    missing:
      'Todavía falta permiso para leer tus pendientes. Comparte la solicitud y reintenta después del ajuste.',
  },
  productos: {
    reason:
      'Para abrir Productos necesitas permiso de lectura de artículos. Pide al encargado que revise tu usuario; después toca Reintentar permisos.',
    request:
      'Necesito permiso de lectura de artículos para abrir Productos en Muelle; quiero retomar el producto que intentaba abrir.',
    missing:
      'Todavía falta acceso a Productos. Comparte la solicitud y reintenta después del ajuste.',
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
// The module's builder failed on the server: the reason is the server's, and
// asking for access only makes sense when it says it was a permission.
const failed = computed(() => {
  const entry = shellBoot.value?.modules?.[module.value]
  return entry?.state === 'unavailable' ? entry : null
})
const asksAccess = computed(
  () => !failed.value || failed.value.reason_code === 'permission',
)
// The module asked for, when the shell already opens it to this worker: a
// page gate refused what the shell allows (the server answers an
// Inmobiliaria address with the Ventas check), so the way on is the screen
// they asked for, else that module's home. Never for Ventas, whose refusal
// the router itself decides.
const reopen = computed(() => {
  if (module.value === 'ventas') return null
  if (!recoveryReady(module.value, shellBoot.value)) return null
  const home = hostedModules.find((m) => m.key === module.value)
  if (!home) return null
  const to = safeIntendedRoute(
    '/crm' + (route.query.intended || '/'),
    '/crm' + home.to,
  )
  return { key: home.key, label: home.label, to: to.slice(4) || home.to }
})
// Where this worker can keep working now: the module they asked for when it
// is open to them, else another module they do have.
const landing = computed(
  () => reopen.value || firstModuleRoute(shellBoot.value, module.value),
)
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
onMounted(async () => {
  await loadShell().catch(() => null)
  // The boot opens what the worker asked for: go on, no detour.
  if (reopen.value) router.replace(reopen.value.to)
})
</script>
