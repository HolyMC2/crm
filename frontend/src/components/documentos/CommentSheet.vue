<template>
  <!-- Comentar: one note on the record, in the worker's own name. -->
  <BottomSheet
    :open="open"
    title="Comentar"
    :subtitle="subtitle"
    @update:open="emit('update:open', $event)"
  >
    <label class="sr-only" for="doc-comment">Comentario</label>
    <textarea
      id="doc-comment"
      ref="field"
      v-model="text"
      rows="4"
      maxlength="4000"
      class="w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-2 text-base text-ink-gray-9"
      placeholder="Escribe para tu equipo…"
      data-testid="documentos-comment-text"
    />
    <p v-if="error" role="alert" class="pt-2 text-base text-ink-red-7">
      {{ error }}
    </p>
    <template #actions>
      <button
        type="button"
        :class="BTN.filled"
        :disabled="busy || !text.trim()"
        data-testid="documentos-comment-send"
        @click="send"
      >
        {{ busy ? 'Enviando…' : 'Comentar' }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { nextTick, ref, watch } from 'vue'
import { BottomSheet } from '@/components/ui'
import { docApi, errorText } from '@/documentos/api'
import { BTN } from '@/documentos/tools'

const props = defineProps({
  open: { type: Boolean, default: false },
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  subtitle: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'done'])
const text = ref('')
const busy = ref(false)
const error = ref('')
const field = ref(null)

watch(
  () => props.open,
  (open) => {
    error.value = ''
    if (open) nextTick(() => field.value?.focus())
  },
)

async function send() {
  if (!text.value.trim() || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const activity = await docApi('comment', {
      doctype: props.doctype,
      name: props.name,
      text: text.value,
    })
    text.value = ''
    emit('done', activity)
    emit('update:open', false)
  } catch (e) {
    error.value = errorText(e)
  } finally {
    busy.value = false
  }
}
</script>
