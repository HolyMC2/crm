<template>
  <div
    class="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-surface-base text-ink-gray-9"
  >
    <!-- CRM routes keep their own chrome (CrmRuntime layouts); the Muelle header,
         offline strip and bottom nav render only on Contactos routes so no
         viewport ever shows two headers or two bottom navs. -->
    <a
      v-if="neutral"
      href="#muelle-content"
      class="sr-only focus:not-sr-only focus:p-3"
      >Ir al contenido</a
    >
    <header
      v-if="neutral"
      class="flex h-14 shrink-0 items-center gap-3 border-b border-outline-gray-2 px-4 sm:px-6"
    >
      <details class="relative" ref="switcher">
        <summary
          class="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          aria-label="Cambiar aplicación"
        >
          <FeatherIcon name="grid" class="h-5 w-5" />Muelle<FeatherIcon
            name="chevron-down"
            class="h-4 w-4"
          />
        </summary>
        <nav
          aria-label="Aplicaciones"
          class="absolute left-0 top-12 z-50 w-56 rounded-xl border border-outline-gray-2 bg-surface-base p-2 shadow-lg"
        >
          <RouterLink
            v-for="module in shellModules"
            :key="module.key"
            :to="module.to"
            class="flex min-h-11 items-center gap-3 rounded-lg px-3 hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2"
            @click="switcher.open = false"
          >
            <FeatherIcon :name="module.icon" class="h-4 w-4" />{{
              module.label
            }}
          </RouterLink>
        </nav>
      </details>
      <span class="min-w-0 flex-1 truncate text-sm text-ink-gray-6">{{
        route.meta.title || 'Muelle'
      }}</span>
      <Button
        v-if="installable"
        label="Instalar"
        variant="ghost"
        @click="install"
      />
      <Button
        :icon="dark ? 'sun' : 'moon'"
        :aria-label="dark ? 'Usar tema claro' : 'Usar tema oscuro'"
        variant="ghost"
        @click="toggleTheme"
      />
      <Button
        icon="log-out"
        aria-label="Cerrar sesión"
        variant="ghost"
        @click="session.logout.submit()"
      />
    </header>
    <div
      v-if="neutral && !online"
      role="status"
      class="bg-surface-amber-1 px-4 py-2 text-sm text-ink-amber-8"
    >
      Sin conexión. Tu borrador sigue aquí; vuelve a conectarte y toca
      Reintentar.
    </div>
    <div v-if="neutral && shellLoading && !shellBoot" role="status" class="p-6">
      Cargando Contactos…
    </div>
    <section
      v-else-if="
        neutral && (shellError || shellBoot?.capabilities?.directory === false)
      "
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">No pudimos abrir Contactos</h1>
      <p>
        {{
          shellError ||
          'No tienes permiso para consultar ningún origen de Contactos. Pide acceso al encargado y reintenta permisos.'
        }}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button label="Reintentar permisos" @click="reload" /><Button
          label="Pedir acceso"
          @click="accessOpen = true"
        /><Button label="Volver" @click="router.back()" />
      </div>
    </section>
    <main
      v-else
      id="muelle-content"
      class="flex min-h-0 min-w-0 flex-1 overflow-hidden"
    >
      <slot />
    </main>
    <nav
      v-if="neutral"
      class="flex shrink-0 justify-around border-t border-outline-gray-2 pb-[env(safe-area-inset-bottom)] sm:hidden"
      aria-label="Navegación de Muelle"
    >
      <RouterLink
        v-for="module in shellModules"
        :key="module.key"
        :to="module.to"
        class="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium"
        :aria-current="route.meta.app === module.key ? 'page' : undefined"
        ><FeatherIcon :name="module.icon" class="h-5 w-5" />{{
          module.label
        }}</RouterLink
      >
    </nav>
    <Dialog
      v-model="accessOpen"
      :options="{ title: 'Pedir acceso a Contactos' }"
      ><template #body-content
        ><p class="mb-4">
          Pide al encargado permiso de lectura para Personas, Clientes,
          Proveedores o Empresas y el módulo correspondiente. Para guardar
          también necesitas permiso de creación o edición del registro.
        </p>
        <Button label="Copiar solicitud" @click="copyRequest" />
        <p v-if="copied" role="status">{{ copied }}</p></template
      ></Dialog
    >
  </div>
</template>
<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOnline } from '@vueuse/core'
import { Button, Dialog, FeatherIcon, useTheme } from 'frappe-ui'
import { sessionStore } from '@/stores/session'
import {
  loadShell,
  shellBoot,
  shellError,
  shellLoading,
  shellModules,
} from '@/composables/muelleShell'
const route = useRoute(),
  router = useRouter(),
  session = sessionStore()
const neutral = computed(
  () =>
    route.meta.app === 'contactos' ||
    (window.muelle_module === 'contactos' && !route.matched.length),
)
const online = useOnline(),
  switcher = ref(null),
  accessOpen = ref(false),
  copied = ref('')
const { setTheme } = useTheme()
// frappe-ui marks the theme as <html data-theme>, never a .dark class.
const dark = ref(document.documentElement.dataset.theme === 'dark')
function toggleTheme() {
  dark.value = !dark.value
  setTheme(dark.value ? 'dark' : 'light')
}
function reload() {
  loadShell({ refresh: true }).catch(() => {})
}
async function copyRequest() {
  const text =
    'Necesito acceso a Contactos y permiso de lectura del registro nativo para continuar. Revisa mis permisos de creación/edición si debo guardar datos.'
  try {
    await navigator.clipboard.writeText(text)
    copied.value = 'Solicitud copiada. Compártela con tu encargado.'
  } catch {
    copied.value = text
  }
}
const installable = ref(false)
let installEvent
function captureInstall(event) {
  event.preventDefault()
  installEvent = event
  installable.value = true
}
async function install() {
  if (installEvent) {
    await installEvent.prompt()
    installEvent = null
    installable.value = false
  }
}
watch(
  () => route.meta.app,
  () => {
    document.title = `${neutral.value ? 'Contactos' : 'Ventas'} · Muelle`
  },
)
onMounted(() => {
  document.title = `${neutral.value ? 'Contactos' : 'Ventas'} · Muelle`
  reload()
  window.addEventListener('beforeinstallprompt', captureInstall)
})
onBeforeUnmount(() =>
  window.removeEventListener('beforeinstallprompt', captureInstall),
)
</script>
