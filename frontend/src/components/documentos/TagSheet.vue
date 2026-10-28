<template>
  <!-- Etiquetas: the record's tags (Desk's own), removed with one tap, added
       by typing or from the ones this kind of document already uses. Saved at
       once. A worker who cannot edit the record reads why. -->
  <BottomSheet
    :open="open"
    title="Etiquetas"
    :subtitle="subtitle"
    @update:open="emit('update:open', $event)"
  >
    <div
      v-if="tags.length"
      class="flex flex-wrap gap-1.5 pb-3"
      data-testid="tag-sheet-current"
    >
      <button
        v-for="tag in tags"
        :key="tag"
        type="button"
        :class="chipClass(true)"
        :disabled="!can || !!busy"
        :aria-label="`Quitar la etiqueta ${tag}`"
        @click="remove(tag)"
      >
        {{ tag }}
        <span v-if="can" class="lucide-x size-4" aria-hidden="true" />
      </button>
    </div>
    <p v-else class="pb-3 text-base text-ink-gray-6">
      Sin etiquetas. Úsalas para encontrar y agrupar documentos parecidos.
    </p>

    <p v-if="!can" class="pb-2 text-base text-ink-gray-7" role="note">
      Para cambiar las etiquetas necesitas poder editar este documento. Pídele a
      tu encargado ese permiso.
    </p>
    <template v-else>
      <form class="flex gap-2" @submit.prevent="add(draft)">
        <label class="sr-only" for="doc-tag-new">Nueva etiqueta</label>
        <input
          id="doc-tag-new"
          ref="field"
          v-model="draft"
          type="text"
          maxlength="40"
          enterkeyhint="done"
          autocomplete="off"
          class="h-11 min-w-0 flex-1 rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
          placeholder="Nueva etiqueta"
          data-testid="tag-sheet-input"
        />
        <button
          type="submit"
          :class="BTN.filled"
          :disabled="!cleanTag(draft) || !!busy"
          data-testid="tag-sheet-add"
        >
          Añadir
        </button>
      </form>
      <section
        v-if="suggestions.length"
        class="pt-3"
        aria-label="Etiquetas usadas"
      >
        <p class="pb-1.5 text-xs font-medium text-ink-gray-6">
          {{ draft.trim() ? 'Parecidas' : 'Las que más se usan aquí' }}
        </p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="tag in suggestions"
            :key="tag"
            type="button"
            :class="chipClass(false)"
            :disabled="!!busy"
            @click="add(tag)"
          >
            <span class="lucide-plus size-4" aria-hidden="true" />
            {{ tag }}
          </button>
        </div>
      </section>
    </template>
    <p v-if="error" role="alert" class="pt-2 text-base text-ink-red-7">
      {{ error }}
    </p>
  </BottomSheet>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { BottomSheet } from '@/components/ui'
import { chipClass } from '@/components/ui/chipClass'
import { docApi, errorText } from '@/documentos/api'
import { BTN } from '@/documentos/tools'
import { cleanTag } from '@/documentos/actividad'

const props = defineProps({
  open: { type: Boolean, default: false },
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  subtitle: { type: String, default: '' },
  tags: { type: Array, default: () => [] },
  // the worker may write the record (activity.can.tag)
  can: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'done'])
const draft = ref('')
const found = ref([])
const busy = ref('')
const error = ref('')
const field = ref(null)

const suggestions = computed(() => {
  const have = new Set(props.tags.map((t) => t.toLowerCase()))
  return found.value.filter((t) => !have.has(t.toLowerCase())).slice(0, 12)
})

let timer = null
let seq = 0
async function suggest() {
  const mine = ++seq
  try {
    const out = await docApi('tag_suggestions', {
      doctype: props.doctype,
      search: draft.value.trim(),
    })
    if (mine === seq) found.value = out || []
  } catch {
    // Suggestions are a help; typing still works.
    if (mine === seq) found.value = []
  }
}
watch(draft, () => {
  clearTimeout(timer)
  timer = setTimeout(suggest, 250)
})
watch(
  () => props.open,
  (open) => {
    error.value = ''
    if (open && props.can) {
      suggest()
      nextTick(() => field.value?.focus())
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))

async function change(key, tag) {
  const value = cleanTag(tag)
  if (!value || busy.value) return
  busy.value = value
  error.value = ''
  try {
    const activity = await docApi('tag', {
      doctype: props.doctype,
      name: props.name,
      [key]: [value],
    })
    if (key === 'add') draft.value = ''
    emit('done', activity)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    busy.value = ''
  }
}
const add = (tag) => change('add', tag)
const remove = (tag) => change('remove', tag)
</script>
