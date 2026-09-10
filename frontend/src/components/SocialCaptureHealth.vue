<template>
  <details class="border-b border-outline-gray-1 bg-surface-base px-5 py-3">
    <summary class="cursor-pointer text-sm font-medium text-ink-gray-8">
      {{ __('Captación y conexión con Meta') }}
    </summary>
    <p class="mt-2 text-sm text-ink-gray-6">
      {{ __('Las notificaciones de grupos de Facebook no garantizan un evento disponible para CRM. Puedes capturar una consulta manualmente aunque la conexión falle.') }}
    </p>
    <p v-if="loading" class="mt-2 text-sm text-ink-gray-5" role="status">
      {{ __('Consultando configuración…') }}
    </p>
    <p v-if="error" class="mt-2 text-sm text-ink-red-7" role="alert">{{ error }}</p>
    <p v-if="!loading && !error && !connections.length" class="mt-2 text-sm text-ink-gray-6">
      {{ __('No hay páginas configuradas para esta vista.') }}
    </p>
    <ul class="mt-2 space-y-3">
      <li v-for="(connection, index) in connections" :key="`${connection.page_id}-${index}`" class="text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium text-ink-gray-8">{{ connection.label }}</span>
          <span class="text-ink-gray-6">{{ __(captureHealthLabel(verified[connection.page_id]?.state || connection.state)) }}</span>
          <button v-if="canVerify" type="button" :disabled="!!checking"
            class="rounded border border-outline-gray-2 px-2 py-1 text-ink-gray-8 disabled:opacity-50"
            @click="verify(connection.page_id)">
            {{ checking === connection.page_id ? __('Verificando…') : __('Verificar en Meta') }}
          </button>
        </div>
        <p class="mt-1 text-xs text-ink-gray-5">
          {{ __('Última mención de Facebook guardada en la sucursal:') }}
          {{ connection.last_stored_mention_at || __('Sin registros') }}
        </p>
        <p class="text-xs text-ink-gray-5">
          {{ __('Último comentario guardado de la página:') }}
          {{ connection.last_stored_comment_at || __('Sin registros') }}
        </p>
        <p v-if="verified[connection.page_id]?.checked_at" class="text-xs text-ink-gray-5">
          {{ __('Comprobado:') }} {{ verified[connection.page_id].checked_at }}
        </p>
      </li>
    </ul>
    <p v-if="truncated" class="mt-2 text-xs text-ink-gray-6">
      {{ __('Hay más páginas. Filtra por sucursal para verlas.') }}
    </p>
    <button v-if="error" type="button" class="mt-2 text-sm text-ink-blue-9" @click="reload">
      {{ __('Reintentar diagnóstico') }}
    </button>
  </details>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { sessionStore } from '@/stores/session'
import { captureHealthLabel, newCaptureHealthRequests } from '@/utils/socialCaptureHealth'

const props = defineProps({ shop: { type: String, default: '' } })
const session = sessionStore()
const requests = newCaptureHealthRequests()
const connections = ref([])
const verified = ref({})
const canVerify = ref(false)
const loading = ref(false)
const checking = ref('')
const error = ref('')
const truncated = ref(false)

async function reload() {
  const request = requests.invalidate()
  connections.value = []
  verified.value = {}
  checking.value = ''
  canVerify.value = false
  error.value = ''
  loading.value = !!session.user
  if (!session.user) return
  try {
    const result = await call('doco_marketing.services.social.capture_health.get_capture_health', { shop: props.shop || null })
    if (!requests.current(request)) return
    connections.value = result.connections || []
    canVerify.value = result.can_verify === true
    truncated.value = result.truncated === true
  } catch {
    if (requests.current(request)) {
      error.value = __('El diagnóstico no está disponible. Revisa el acceso y la versión de la integración. La captura manual sigue disponible.')
    }
  } finally {
    if (requests.current(request)) loading.value = false
  }
}

async function verify(pageId) {
  if (checking.value || !canVerify.value) return
  const request = requests.invalidate()
  checking.value = pageId
  error.value = ''
  try {
    const result = await call('doco_marketing.services.social.capture_health.inspect_page', { page_id: pageId })
    if (requests.current(request)) verified.value[pageId] = result
  } catch {
    if (requests.current(request)) error.value = __('No se pudo verificar la página. Revisa el acceso e intenta de nuevo.')
  } finally {
    if (requests.current(request)) checking.value = ''
  }
}

watch([() => props.shop, () => session.user], reload, { immediate: true })
onBeforeUnmount(() => requests.invalidate())
</script>
