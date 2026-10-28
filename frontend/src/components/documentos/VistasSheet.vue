<template>
  <!-- «Vistas» of one list (the title opens it): the whole list, the worker's
       saved views and the team's, one tap each; the list as it is now saved
       under a name. Views live in the URL query, so a view is a link too. -->
  <BottomSheet
    :open="open"
    title="Vistas"
    :subtitle="listTitle"
    flush
    @update:open="emit('update:open', $event)"
  >
    <ul class="pb-1" aria-label="Vistas" data-testid="vistas-list">
      <li>
        <ListRow
          icon="lucide-layers"
          :title="listTitle"
          subtitle="Como abre la lista"
          :selected="!current && isPlain"
          data-testid="vistas-all"
          @click="emit('apply', {})"
        />
      </li>
      <li
        v-for="view in views"
        :key="view.name"
        class="flex items-center"
        :class="current?.name === view.name ? 'bg-surface-gray-2' : ''"
        data-testid="vistas-view"
      >
        <ListRow
          class="min-w-0 flex-1"
          icon="lucide-bookmark"
          :title="view.label"
          :subtitle="subtitleFor(view)"
          :selected="current?.name === view.name"
          @click="emit('apply', view.query)"
        />
        <!-- Two taps: the bin, then «Borrar» in its place. -->
        <button
          v-if="view.can_change && confirming === view.name"
          type="button"
          class="mr-2 min-h-11 flex-none rounded-full px-3 text-base font-medium text-ink-red-7 active:bg-surface-gray-2"
          :disabled="busy === view.name"
          data-testid="vistas-delete-confirm"
          @click="remove(view)"
        >
          Borrar
        </button>
        <button
          v-else-if="view.can_change"
          type="button"
          class="mr-2 flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-6 active:bg-surface-gray-2 [@media(hover:hover)]:hover:bg-surface-gray-2"
          :aria-label="`Borrar la vista ${view.label}`"
          data-testid="vistas-delete"
          @click="confirming = view.name"
        >
          <span class="lucide-trash-2 size-5" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <p
      v-if="loading && !views.length"
      class="px-4 pb-2 text-base text-ink-gray-6"
    >
      Cargando las vistas…
    </p>

    <!-- Save what the list shows now. -->
    <section
      class="border-t border-outline-gray-1 px-4 pb-4 pt-3"
      aria-labelledby="vistas-save"
    >
      <h3 id="vistas-save" class="pb-1 text-base font-semibold text-ink-gray-9">
        Guardar esta vista
      </h3>
      <p v-if="isPlain" class="text-base text-ink-gray-6" role="note">
        Elige un estado, filtros, una búsqueda o un orden. Después guárdalos
        aquí con un nombre y vuelve a ellos con un toque.
      </p>
      <p v-else-if="current" class="text-base text-ink-gray-6" role="note">
        Ya la tienes guardada como «{{ current.label }}». Cambia un filtro para
        guardar otra.
      </p>
      <form v-else class="space-y-3" @submit.prevent="save">
        <div class="flex gap-2">
          <label class="sr-only" for="vistas-name">Nombre de la vista</label>
          <input
            id="vistas-name"
            v-model="label"
            type="text"
            maxlength="60"
            enterkeyhint="done"
            autocomplete="off"
            class="h-11 min-w-0 flex-1 rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
            placeholder="Nombre de la vista"
            data-testid="vistas-name"
          />
          <button
            type="submit"
            :class="BTN.filled"
            :disabled="!label.trim() || busy === 'save'"
            data-testid="vistas-save"
          >
            Guardar
          </button>
        </div>
        <label
          v-if="canPublish"
          class="flex min-h-11 items-center gap-3 text-base text-ink-gray-8"
        >
          <input
            v-model="forTeam"
            type="checkbox"
            class="size-5 rounded-4"
            data-testid="vistas-team"
          />
          Para todo el equipo
        </label>
      </form>
    </section>
    <p v-if="error" role="alert" class="px-4 pb-3 text-base text-ink-red-7">
      {{ error }}
    </p>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { BottomSheet, ListRow } from '@/components/ui'
import { docApi, errorText } from '@/documentos/api'
import { BTN } from '@/documentos/tools'
import {
  activeView,
  describeView,
  normalQuery,
  suggestName,
} from '@/documentos/vistas'

const props = defineProps({
  open: { type: Boolean, default: false },
  doctype: { type: String, required: true },
  listTitle: { type: String, default: 'Documentos' },
  // The list's URL query now (listState writeListQuery).
  query: { type: Object, default: () => ({}) },
  profile: { type: Object, default: null },
  // { views, can_publish } when the page already asked.
  saved: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'apply', 'changed'])

const views = computed(() => props.saved?.views || [])
const canPublish = computed(() => !!props.saved?.can_publish)
const current = computed(() => activeView(views.value, props.query))
const isPlain = computed(() => !Object.keys(normalQuery(props.query)).length)
const label = ref('')
const forTeam = ref(false)
const busy = ref('')
const error = ref('')
const loading = ref(false)
const confirming = ref('')

function subtitleFor(view) {
  const what = describeView(view.query, props.profile)
  if (view.public) return what ? `Del equipo · ${what}` : 'Del equipo'
  return what
}

watch(
  () => props.open,
  (open) => {
    if (!open) return
    error.value = ''
    confirming.value = ''
    forTeam.value = false
    label.value = suggestName(props.query, props.profile)
    if (!props.saved) reload()
  },
  { immediate: true },
)

async function reload() {
  loading.value = true
  try {
    emit('changed', await docApi('views', { doctype: props.doctype }))
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!label.value.trim() || busy.value) return
  busy.value = 'save'
  error.value = ''
  try {
    emit(
      'changed',
      await docApi('save_view', {
        doctype: props.doctype,
        label: label.value,
        query: normalQuery(props.query),
        public: forTeam.value ? 1 : 0,
      }),
    )
  } catch (e) {
    error.value = errorText(e)
  } finally {
    busy.value = ''
  }
}

async function remove(view) {
  if (busy.value) return
  busy.value = view.name
  error.value = ''
  try {
    emit('changed', await docApi('delete_view', { name: view.name }))
    confirming.value = ''
  } catch (e) {
    error.value = errorText(e)
  } finally {
    busy.value = ''
  }
}
</script>
