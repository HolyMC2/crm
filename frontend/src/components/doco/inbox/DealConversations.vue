<template>
  <section class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5" aria-label="Conversaciones vinculadas">
    <div>
      <h2 class="text-base font-semibold">{{ __('Conversaciones vinculadas') }}</h2>
      <p class="mt-1 text-sm text-ink-gray-5">{{ __('Abre una conversación para ver su historial y responder desde su cuenta.') }}</p>
    </div>
    <p v-if="error" role="alert" class="text-sm text-ink-red-6">{{ error }}</p>
    <p v-if="loading" role="status" class="text-sm text-ink-gray-5">{{ __('Cargando conversaciones…') }}</p>
    <ul v-if="items.length" class="flex flex-col gap-2">
      <li v-for="item in items" :key="itemKey(item)">
        <component
          :is="item.name ? RouterLink : 'button'"
          v-bind="item.name ? { to: conversationRoute(item.name) } : { type: 'button', disabled: opening === itemKey(item) }"
          class="flex w-full items-center justify-between gap-3 rounded-lg border border-outline-gray-2 p-3 text-left hover:bg-surface-gray-2 disabled:opacity-60"
          @click="item.name ? null : open(item)"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium text-ink-gray-9">{{ item.display_name || item.peer_id }}</span>
            <span class="block text-xs text-ink-gray-5">
              {{ item.provider }} · {{ __('Cuenta') }} {{ item.account_id }}
              <template v-if="item.last_message_at"> · {{ age(item.last_message_at) }}</template>
            </span>
            <span v-if="item.preview" class="mt-1 block truncate text-sm text-ink-gray-7">{{ item.preview }}</span>
          </span>
          <span class="shrink-0 text-sm text-ink-gray-5">
            {{ item.name ? __(item.control_state) : (opening === itemKey(item) ? __('Abriendo…') : __('Abrir historial')) }} →
          </span>
        </component>
      </li>
    </ul>
    <p v-else-if="!loading && !error" class="text-sm text-ink-gray-5">{{ __('No hay conversaciones vinculadas disponibles para este registro. Puedes buscar en las cuentas a las que tienes acceso.') }}</p>
    <button v-if="error || cursor" type="button" class="self-start text-sm underline" :disabled="loading" @click="load">{{ error ? __('Reintentar') : __('Cargar más') }}</button>
    <RouterLink :to="{ name: 'Inbox', query: { workspace: 'conversations' } }" class="self-start text-sm font-medium text-ink-green-7 underline">{{ __('Abrir conversaciones') }}</RouterLink>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { call } from 'frappe-ui'
import { relativeAge } from '@/utils/reviewCardFormat'

// Rows come from conversation_threads.list_for_reference: a materialized
// conversation (name set) opens directly; a thread only implied by the record's
// messages (name null) is materialized here through the explicit open, exactly
// like a legacy row in the conversation queue.
const props = defineProps({ doctype: { type: String, required: true }, name: { type: String, required: true } })
const router = useRouter()
const items = ref([]), cursor = ref(null), loading = ref(false), error = ref(''), opening = ref('')

const itemKey = (item) => item.name || `${item.provider}:${item.account_id}:${item.peer_id}`
const conversationRoute = (name) => ({ name: 'Inbox', query: { workspace: 'conversations', conversation: name } })
const age = (ts) => relativeAge(ts, Date.now(), { now: __('ahora') })

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

async function open(item) {
  if (opening.value) return
  opening.value = itemKey(item)
  error.value = ''
  try {
    const doc = await call('crm.api.conversation_threads.open_thread', {
      provider: item.provider, account_id: item.account_id, peer_id: item.peer_id,
    })
    await router.push(conversationRoute(doc.name))
  } catch {
    error.value = __('No se pudo abrir la conversación. Reintenta o revisa tu acceso a la cuenta.')
  } finally {
    opening.value = ''
  }
}
onMounted(load)
</script>
