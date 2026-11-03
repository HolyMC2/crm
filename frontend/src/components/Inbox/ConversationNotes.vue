<template>
  <details
    class="min-w-0 border-t border-outline-gray-1 px-3 py-2 text-sm [overflow-wrap:anywhere]"
    :open="open"
    @toggle="toggled"
  >
    <summary class="cursor-pointer text-xs font-medium">
      Notas internas{{ notes.length ? ` (${notes.length})` : '' }} · el cliente
      no las ve
    </summary>
    <p v-if="error" role="alert" class="mt-2 text-xs">{{ error }}</p>
    <!-- Rendered only while open, so the reply composer stays the first field. -->
    <template v-if="open">
      <ol v-if="notes.length" class="mt-2 max-h-48 space-y-2 overflow-y-auto">
        <li
          v-for="note in notes"
          :key="note.name"
          class="rounded-4 bg-surface-gray-2 p-2"
        >
          <p class="text-xs text-ink-gray-5">
            {{ note.author_name }} · {{ when(note.creation) }}
          </p>
          <p class="mt-1 whitespace-pre-wrap">{{ note.content }}</p>
        </li>
      </ol>
      <form class="mt-2" @submit.prevent="submit">
        <label class="block text-xs font-medium" :for="`${id}-note`"
          >Nueva nota</label
        >
        <textarea
          :id="`${id}-note`"
          v-model="body"
          rows="2"
          maxlength="4000"
          class="mt-1 block w-full min-w-0 resize-y rounded-4 border border-outline-gray-2 bg-surface-base p-2 text-sm"
          :disabled="busy"
        />
        <div class="mt-2 flex flex-wrap items-center gap-1 text-xs">
          <span
            v-for="person in mentions"
            :key="person.name"
            class="inline-flex items-center gap-1 rounded-4 border border-outline-gray-2 px-1.5 py-0.5"
          >
            @{{ person.label }}
            <button
              type="button"
              :aria-label="`Quitar mención de ${person.label}`"
              @click="mentions = mentions.filter((p) => p.name !== person.name)"
            >
              ×
            </button>
          </span>
          <input
            v-model="query"
            type="search"
            class="min-w-0 flex-1 rounded-4 border border-outline-gray-2 bg-surface-base p-1"
            placeholder="Mencionar a…"
            aria-label="Buscar a quién mencionar"
            :disabled="busy"
            @input="search"
          />
          <button
            type="submit"
            class="rounded-4 bg-surface-gray-10 px-3 py-1 text-ink-base"
            :disabled="busy || !body.trim()"
          >
            Guardar nota
          </button>
        </div>
        <ul v-if="people.length" class="mt-1 text-xs" aria-label="Personas">
          <li v-for="person in people" :key="person.name">
            <button type="button" class="underline" @click="mention(person)">
              {{ person.label }}
            </button>
          </li>
        </ul>
      </form>
    </template>
  </details>
</template>
<script setup>
import { ref, watch, useId } from 'vue'
import { call } from 'frappe-ui'
import { formatDateTime } from '@/utils/display'

const API = 'crm.api.inbox.'
const props = defineProps({
  conversation: { type: Object, required: true },
})
const id = useId()
const open = ref(false),
  notes = ref([]),
  body = ref(''),
  query = ref(''),
  people = ref([]),
  mentions = ref([]),
  busy = ref(false),
  error = ref('')
let epoch = 0,
  searchTimer
const when = (value) => formatDateTime(value)
async function load() {
  const stamp = epoch
  try {
    const rows = await call(API + 'list_notes', {
      name: props.conversation.name,
    })
    if (stamp === epoch) notes.value = rows || []
  } catch {
    if (stamp === epoch)
      error.value =
        'No se pudieron cargar las notas. Actualiza la conversación.'
  }
}
function toggled(event) {
  open.value = event.target.open
  if (open.value) load()
}
watch(
  () => props.conversation.name,
  () => {
    epoch++
    notes.value = []
    body.value = ''
    query.value = ''
    people.value = []
    mentions.value = []
    error.value = ''
    busy.value = false
    if (open.value) load()
  },
  { immediate: true },
)
function search() {
  clearTimeout(searchTimer)
  const stamp = epoch,
    text = query.value.trim()
  if (!text) {
    people.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      const rows = await call(API + 'mentionable', {
        name: props.conversation.name,
        query: text,
      })
      if (stamp === epoch && text === query.value.trim())
        people.value = (rows || []).filter(
          (p) => !mentions.value.some((m) => m.name === p.name),
        )
    } catch {
      if (stamp === epoch) people.value = []
    }
  }, 250)
}
function mention(person) {
  mentions.value = [...mentions.value, person]
  people.value = []
  query.value = ''
}
async function submit() {
  if (busy.value || !body.value.trim()) return
  const stamp = epoch
  busy.value = true
  error.value = ''
  try {
    await call(API + 'add_note', {
      name: props.conversation.name,
      content: body.value,
      command_id: crypto.randomUUID(),
      mentions: JSON.stringify(mentions.value.map((p) => p.name)),
    })
    if (stamp !== epoch) return
    body.value = ''
    mentions.value = []
    await load()
  } catch (e) {
    if (stamp === epoch)
      error.value = e?.messages?.length
        ? String(e.messages[0]).replace(/<[^>]+>/g, '')
        : 'La nota no se guardó. Tu texto sigue aquí; inténtalo de nuevo.'
  } finally {
    if (stamp === epoch) busy.value = false
  }
}
</script>
