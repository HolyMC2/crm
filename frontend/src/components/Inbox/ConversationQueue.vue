<template>
  <section
    class="flex min-h-0 min-w-0 flex-col border-r border-outline-gray-1"
    aria-label="Conversaciones de clientes"
  >
    <div class="border-b border-outline-gray-1 p-3">
      <label class="block text-xs font-medium"
        >Cuenta del canal
        <select
          :value="accountKey(account)"
          :disabled="disabled"
          class="mt-2 block w-full min-w-0 rounded border border-outline-gray-2 bg-surface-white p-2 text-sm"
          @change="selectAccount"
        >
          <option value="" disabled>Seleccionar cuenta</option>
          <option
            v-for="item in accounts"
            :key="accountKey(item)"
            :value="accountKey(item)"
          >
            {{ item.provider }} · {{ item.label }} · {{ item.account_id
            }}{{ item.active ? '' : ' (inactiva)' }}
          </option>
        </select>
      </label>
      <p
        v-if="account"
        class="mt-2 text-xs text-ink-gray-5 [overflow-wrap:anywhere]"
      >
        {{ account.provider }} · {{ account.account_id }}
      </p>
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <p v-if="!threads.length && !loading" class="p-4 text-sm text-ink-gray-5">
        No hay conversaciones visibles en esta cuenta.
      </p>
      <button
        v-for="thread in threads"
        :key="thread.peer_id"
        type="button"
        :disabled="disabled"
        class="block w-full min-w-0 border-b border-outline-gray-1 p-3 text-left hover:bg-surface-gray-2 [overflow-wrap:anywhere]"
        :class="
          selected === thread.name && thread.name ? 'bg-surface-gray-2' : ''
        "
        @click="$emit('select', thread)"
      >
        <span class="block text-sm font-medium">{{ thread.peer_id }}</span>
        <span class="mt-1 block text-xs text-ink-gray-5">{{
          thread.materialized
            ? thread.human_owner || 'Sin responsable'
            : 'Abrir historial de esta cuenta y destinatario'
        }}</span>
        <span v-if="thread.preview" class="mt-2 line-clamp-2 text-sm">{{
          thread.preview
        }}</span>
      </button>
      <button
        v-if="more"
        type="button"
        class="w-full p-3 text-sm underline"
        :disabled="loading || disabled"
        @click="$emit('more')"
      >
        Cargar más conversaciones
      </button>
      <p v-if="loading" class="p-3 text-sm" role="status">Cargando…</p>
    </div>
  </section>
</template>
<script setup>
const props = defineProps({
  accounts: { type: Array, default: () => [] },
  account: { type: Object, default: null },
  threads: { type: Array, default: () => [] },
  selected: { type: String, default: null },
  loading: Boolean,
  disabled: Boolean,
  more: Boolean,
})
const emit = defineEmits(['account', 'select', 'more'])
const accountKey = (a) => (a ? `${a.provider}:${a.account_id}` : '')
function selectAccount(event) {
  emit(
    'account',
    props.accounts.find((a) => accountKey(a) === event.target.value),
  )
}
</script>
