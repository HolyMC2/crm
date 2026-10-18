<template>
  <!-- Asignar: who is on this document. Tap a coworker to add or remove them;
       the change is saved at once (Frappe's assignments). -->
  <BottomSheet
    :open="open"
    title="Asignar"
    :subtitle="subtitle"
    flush
    @update:open="emit('update:open', $event)"
  >
    <div class="px-4 pb-2">
      <label class="sr-only" for="doc-assign-search">Buscar persona</label>
      <input
        id="doc-assign-search"
        v-model="search"
        type="search"
        enterkeyhint="search"
        class="h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
        placeholder="Buscar persona"
        autocomplete="off"
      />
    </div>
    <p v-if="error" role="alert" class="px-4 pb-2 text-base text-ink-red-7">
      {{ error }}
    </p>
    <ul class="pb-2" data-testid="documentos-people">
      <li v-for="person in shown" :key="person.user">
        <ListRow
          :avatar="person.name"
          :title="person.name"
          :subtitle="isAssigned(person.user) ? 'Asignado · toca para quitar' : ''"
          :selected="isAssigned(person.user)"
          :class="busy === person.user ? 'opacity-60' : ''"
          @click="toggle(person)"
        >
          <template v-if="isAssigned(person.user)" #trailing>
            <span class="lucide-check size-5 text-ink-gray-8" aria-hidden="true" />
          </template>
        </ListRow>
      </li>
      <li v-if="!loading && !shown.length" class="px-4 py-3 text-base text-ink-gray-6">
        Nadie se llama así en tu equipo.
      </li>
    </ul>
  </BottomSheet>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { BottomSheet, ListRow } from '@/components/ui'
import { docApi, errorText } from '@/documentos/api'

const props = defineProps({
  open: { type: Boolean, default: false },
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  subtitle: { type: String, default: '' },
  // [{ user, name }] already on the document
  assigned: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:open', 'done'])
const search = ref('')
const people = ref([])
const loading = ref(false)
const busy = ref('')
const error = ref('')

const assignedUsers = computed(() => new Set(props.assigned.map((a) => a.user)))
const isAssigned = (user) => assignedUsers.value.has(user)
// The ones already on it first, so removing is one tap away.
const shown = computed(() => {
  const list = [...people.value]
  for (const a of props.assigned)
    if (!list.some((p) => p.user === a.user)) list.unshift(a)
  return list.sort((a, b) => isAssigned(b.user) - isAssigned(a.user))
})

let timer = null
let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  try {
    const found = await docApi('people', { search: search.value })
    if (mine === seq) people.value = found || []
  } catch (e) {
    if (mine === seq) error.value = errorText(e)
  } finally {
    if (mine === seq) loading.value = false
  }
}
watch(search, () => {
  clearTimeout(timer)
  timer = setTimeout(load, 250)
})
watch(
  () => props.open,
  (open) => {
    error.value = ''
    if (open && !people.value.length) load()
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))

async function toggle(person) {
  if (busy.value) return
  busy.value = person.user
  error.value = ''
  try {
    const key = isAssigned(person.user) ? 'remove' : 'add'
    const activity = await docApi('assign', {
      doctype: props.doctype,
      name: props.name,
      [key]: [person.user],
    })
    emit('done', activity)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    busy.value = ''
  }
}
</script>
