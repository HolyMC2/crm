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
      <ol v-if="merged.length" class="mt-2 max-h-48 space-y-2 overflow-y-auto">
        <li
          v-for="note in merged"
          :key="(note.record ? 'r:' : 'c:') + note.name"
          class="rounded-4 bg-surface-gray-2 p-2"
        >
          <p class="flex flex-wrap items-center gap-1 text-xs text-ink-gray-5">
            <RouterLink
              v-if="note.record"
              :to="recordRoute(note.record)"
              class="rounded-4 border border-outline-gray-2 px-1 underline"
              >{{ recordLabel(note.record) }}</RouterLink
            >
            {{ note.author_name || note.author }} · {{ when(note.creation) }}
          </p>
          <p
            v-if="note.title && note.title !== note.content"
            class="mt-1 font-medium"
          >
            {{ note.title }}
          </p>
          <p class="mt-1 whitespace-pre-wrap">{{ note.content }}</p>
        </li>
      </ol>
      <form class="mt-2" @submit.prevent="submit">
        <div class="flex flex-wrap items-center justify-between gap-1">
          <label class="block text-xs font-medium" :for="`${id}-note`"
            >Nueva nota</label
          >
          <label v-if="records.length" class="text-xs"
            >Guardar en
            <select
              v-model="target"
              class="ml-1 rounded-4 border border-outline-gray-2 bg-surface-base p-1"
              :disabled="busy"
            >
              <option value="">Esta conversación (interna)</option>
              <option
                v-for="record in records"
                :key="record.doctype + record.name"
                :value="record.doctype + '|' + record.name"
              >
                {{ recordLabel(record) }} (en su historial)
              </option>
            </select>
          </label>
        </div>
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
            v-if="!target"
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
        <ul
          v-if="people.length && !target"
          class="mt-1 text-xs"
          aria-label="Personas"
        >
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
import { computed, ref, watch, useId } from 'vue'
import { RouterLink } from 'vue-router'
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
  records = ref([]),
  recordNotes = ref([]),
  target = ref(''),
  busy = ref(false),
  error = ref('')
let epoch = 0,
  searchTimer
const when = (value) => formatDateTime(value)
const KIND = { 'CRM Deal': 'Trato', 'CRM Lead': 'Prospecto' }
const recordLabel = (record) =>
  `${KIND[record.doctype] || record.doctype} «${record.label || record.name}»`
const recordRoute = (record) =>
  record.doctype === 'CRM Deal'
    ? { name: 'Deal 360', params: { dealId: record.name } }
    : { name: 'Lead', params: { leadId: record.name } }
// One history: the conversation's own notes and the linked records' notes, oldest first.
const merged = computed(() =>
  [...notes.value, ...recordNotes.value].sort((a, b) =>
    String(a.creation).localeCompare(String(b.creation)),
  ),
)
async function load() {
  const stamp = epoch
  const name = props.conversation.name
  const [own, linked] = await Promise.allSettled([
    call(API + 'list_notes', { name }),
    call(API + 'record_notes', { name }),
  ])
  if (stamp !== epoch) return
  if (own.status === 'fulfilled') notes.value = own.value || []
  else
    error.value = 'No se pudieron cargar las notas. Actualiza la conversación.'
  // The record notes are extra context; without them the panel still works.
  if (linked.status === 'fulfilled') {
    records.value = linked.value?.records || []
    recordNotes.value = linked.value?.notes || []
    if (!records.value.some((r) => r.doctype + '|' + r.name === target.value))
      target.value = ''
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
    records.value = []
    recordNotes.value = []
    target.value = ''
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
    if (target.value) {
      const [doctype, docname] = target.value.split('|')
      await call(API + 'add_record_note', {
        name: props.conversation.name,
        doctype,
        docname,
        content: body.value,
      })
    } else
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
