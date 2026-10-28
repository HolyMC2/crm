<template>
  <!-- Compartir: send the record outside (the PDF or its link, through the
       phone's share sheet) or open it to a coworker who cannot see it yet
       (Frappe's shares). Tapping a person shares or unshares at once. -->
  <BottomSheet
    :open="open"
    title="Compartir"
    :subtitle="title"
    flush
    @update:open="emit('update:open', $event)"
  >
    <ul class="pb-1" aria-label="Fuera de Muelle">
      <li>
        <ListRow
          icon="lucide-square-arrow-out-up-right"
          title="Enviar el PDF o el enlace"
          subtitle="WhatsApp, correo o cualquier app del teléfono"
          :class="sending ? 'opacity-60' : ''"
          data-testid="share-sheet-send"
          @click="sendOut"
        />
      </li>
      <li>
        <ListRow
          icon="lucide-link"
          title="Copiar enlace"
          subtitle="Solo lo abre quien tenga acceso"
          data-testid="share-sheet-copy"
          @click="copyLink"
        />
      </li>
    </ul>
    <p v-if="notice" role="status" class="px-4 pb-2 text-base text-ink-gray-7">
      {{ notice }}
    </p>

    <h3 class="px-4 pb-1 pt-3 text-xs font-medium text-ink-gray-6">
      Con tu equipo
    </h3>
    <p v-if="!can" class="px-4 pb-3 text-base text-ink-gray-7" role="note">
      Tu usuario no puede abrir este documento a otras personas. Pídele a tu
      encargado que lo comparta o que te dé ese permiso.
    </p>
    <template v-else>
      <div class="px-4 pb-2">
        <label class="sr-only" for="doc-share-search">Buscar persona</label>
        <input
          id="doc-share-search"
          v-model="search"
          type="search"
          enterkeyhint="search"
          class="h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
          placeholder="Buscar persona"
          autocomplete="off"
        />
      </div>
      <ul class="pb-2" data-testid="share-sheet-people">
        <li v-for="person in shown" :key="person.user">
          <ListRow
            :avatar="person.name"
            :title="person.name"
            :subtitle="subtitleFor(person)"
            :selected="isShared(person.user)"
            :class="busy === person.user ? 'opacity-60' : ''"
            @click="toggle(person)"
          >
            <template v-if="isShared(person.user)" #trailing>
              <span
                class="lucide-check size-5 text-ink-gray-8"
                aria-hidden="true"
              />
            </template>
          </ListRow>
        </li>
        <li
          v-if="!loading && !shown.length"
          class="px-4 py-3 text-base text-ink-gray-6"
        >
          Nadie se llama así en tu equipo.
        </li>
      </ul>
    </template>
    <p v-if="error" role="alert" class="px-4 pb-3 text-base text-ink-red-7">
      {{ error }}
    </p>
  </BottomSheet>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { BottomSheet, ListRow } from '@/components/ui'
import { docApi, errorText } from '@/documentos/api'
import { copyText, shareDocument } from '@/documentos/tools'

const props = defineProps({
  open: { type: Boolean, default: false },
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  title: { type: String, default: '' },
  // [{ user, name, write, everyone }] (activity.shared)
  shared: { type: Array, default: () => [] },
  // the worker may share the record (activity.can.share)
  can: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'done'])
const search = ref('')
const people = ref([])
const loading = ref(false)
const busy = ref('')
const error = ref('')
const notice = ref('')
const sending = ref(false)

const sharedUsers = computed(
  () => new Map(props.shared.filter((s) => s.user).map((s) => [s.user, s])),
)
const isShared = (user) => sharedUsers.value.has(user)
// The ones it is shared with first, so taking it back is one tap away.
const shown = computed(() => {
  const list = [...people.value]
  for (const s of props.shared)
    if (s.user && !list.some((p) => p.user === s.user))
      list.unshift({ user: s.user, name: s.name })
  return list.sort((a, b) => isShared(b.user) - isShared(a.user))
})

function subtitleFor(person) {
  const share = sharedUsers.value.get(person.user)
  if (!share) return ''
  return share.write
    ? 'Puede verlo y editarlo · toca para quitar'
    : 'Puede verlo · toca para quitar'
}

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
    notice.value = ''
    if (open && props.can && !people.value.length) load()
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))

async function toggle(person) {
  if (busy.value) return
  busy.value = person.user
  error.value = ''
  try {
    const key = isShared(person.user) ? 'remove' : 'add'
    const activity = await docApi('share', {
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

const link = () => globalThis.location?.href || ''

async function sendOut() {
  if (sending.value) return
  sending.value = true
  notice.value = ''
  try {
    const result = await shareDocument({
      doctype: props.doctype,
      name: props.name,
      title: props.title,
      url: link(),
    })
    if (result === 'copied')
      notice.value = 'Enlace copiado. Pégalo donde quieras.'
    else if (result === 'failed')
      notice.value =
        'No se pudo compartir. Copia el enlace e inténtalo de nuevo.'
  } finally {
    sending.value = false
  }
}

async function copyLink() {
  notice.value = (await copyText(link()))
    ? 'Enlace copiado. Pégalo donde quieras.'
    : 'No se pudo copiar el enlace.'
}
</script>
