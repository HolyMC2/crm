<template>
  <section class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5" aria-label="Conversaciones vinculadas">
    <div>
      <h2 class="text-base font-semibold">{{ __('Conversaciones vinculadas') }}</h2>
      <p class="mt-1 text-sm text-ink-gray-5">{{ __('Abre una conversación para ver su historial y responder desde su cuenta.') }}</p>
    </div>
    <p v-if="error" role="alert" class="text-sm text-ink-red-6">{{ error }}</p>
    <p v-if="loading" role="status" class="text-sm text-ink-gray-5">{{ __('Cargando conversaciones…') }}</p>
    <ul v-if="items.length" class="flex flex-col gap-2">
      <li v-for="item in items" :key="item.name">
        <RouterLink :to="{ name: 'Inbox', query: { conversation: item.name } }" class="flex items-center justify-between gap-3 rounded-lg border border-outline-gray-2 p-3 hover:bg-surface-gray-2">
          <span>{{ item.provider }} · {{ __('Cuenta') }} {{ item.account_id }}</span>
          <span class="text-sm text-ink-gray-5">{{ __(item.control_state) }} →</span>
        </RouterLink>
      </li>
    </ul>
    <p v-else-if="!loading && !error" class="text-sm text-ink-gray-5">{{ __('No hay conversaciones vinculadas disponibles para este registro. Puedes buscar en las cuentas a las que tienes acceso.') }}</p>
    <button v-if="error || cursor" type="button" class="self-start text-sm underline" :disabled="loading" @click="load">{{ error ? __('Reintentar') : __('Cargar más') }}</button>
    <RouterLink :to="{ name: 'Inbox' }" class="self-start text-sm font-medium text-ink-green-7 underline">{{ __('Abrir conversaciones') }}</RouterLink>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { call } from 'frappe-ui'

const props = defineProps({ doctype: { type: String, required: true }, name: { type: String, required: true } })
const items = ref([]), cursor = ref(null), loading = ref(false), error = ref('')
async function load() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const result = await call('crm.api.conversation_threads.list_for_reference', { doctype: props.doctype, name: props.name, cursor: cursor.value })
    items.value.push(...result.items)
    cursor.value = result.next_cursor
  } catch {
    error.value = __('No se pudieron cargar las conversaciones. Reintenta o revisa tu acceso a la cuenta.')
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>
