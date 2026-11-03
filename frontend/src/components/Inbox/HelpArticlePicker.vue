<template>
  <div class="relative">
    <button
      type="button"
      class="text-xs underline"
      :disabled="disabled"
      :aria-expanded="open"
      @click="toggle"
    >
      Artículo de ayuda
    </button>
    <div
      v-if="open"
      class="absolute bottom-6 left-0 z-30 w-72 rounded-4 border border-outline-gray-2 bg-surface-base p-2 shadow-lg"
    >
      <input
        ref="input"
        v-model="query"
        type="search"
        class="block w-full min-w-0 rounded-4 border border-outline-gray-2 bg-surface-base p-1 text-sm"
        placeholder="Buscar en la base de conocimiento"
        aria-label="Buscar artículo de ayuda"
        @input="search"
        @keydown.esc="open = false"
      />
      <p v-if="loading" class="mt-2 text-xs" role="status">Buscando…</p>
      <p v-else-if="!articles.length" class="mt-2 text-xs text-ink-gray-5">
        {{
          query.trim()
            ? 'Ningún artículo publicado coincide.'
            : 'Escribe para buscar artículos publicados.'
        }}
      </p>
      <ul class="mt-1 max-h-60 overflow-y-auto">
        <li v-for="item in articles" :key="item.name">
          <button
            type="button"
            class="block w-full rounded-4 p-1.5 text-left hover:bg-surface-gray-2"
            :disabled="!item.url"
            @click="pick(item)"
          >
            <span class="block text-sm font-medium">{{ item.title }}</span>
            <span class="block truncate text-xs text-ink-gray-5">{{
              item.snippet
            }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
<script setup>
import { nextTick, ref } from 'vue'
import { call } from 'frappe-ui'

defineProps({ disabled: Boolean })
const emit = defineEmits(['pick'])
const open = ref(false),
  query = ref(''),
  articles = ref([]),
  loading = ref(false),
  input = ref(null)
let timer,
  request = 0
async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    input.value?.focus()
    if (!articles.value.length) search()
  }
}
function search() {
  clearTimeout(timer)
  const mine = ++request
  timer = setTimeout(async () => {
    loading.value = true
    try {
      const rows = await call('crm.api.inbox.search_help', {
        query: query.value.trim(),
      })
      if (mine === request) articles.value = rows || []
    } catch {
      if (mine === request) articles.value = []
    } finally {
      if (mine === request) loading.value = false
    }
  }, 250)
}
function pick(item) {
  emit('pick', `${item.title}: ${item.url}`)
  open.value = false
}
</script>
