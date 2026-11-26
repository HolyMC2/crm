<!--
  «Traducir» in the conversation's bar (doco_marketing services/translate.py). Shows only
  when the customer writes in another language than the shop's (told by their own words,
  no model call). The card over the thread lists the customer's messages in the shop's
  language, and turns the worker's reply into the customer's language for the composer:
  nothing sends from here.
-->
<template>
  <div v-if="shown" class="flex-none" @keydown.esc="expanded = false">
    <button
      type="button"
      class="press inline-flex h-8 items-center gap-1.5 rounded-6 px-2 text-xs font-medium text-ink-gray-7 hover:bg-surface-gray-2"
      :class="expanded && 'bg-surface-gray-2 text-ink-gray-9'"
      :aria-expanded="expanded"
      :title="__('Traducir del {0}', [language.label])"
      data-testid="translate-toggle"
      @click="toggle"
    >
      <span class="lucide-languages size-4" aria-hidden="true" />
      <span class="max-sm:sr-only">{{ __('Traducir') }}</span>
    </button>
    <div
      v-if="expanded"
      class="absolute inset-x-2 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-7 bg-surface-gray-1 p-3 shadow-lg sm:inset-x-4"
      role="region"
      :aria-label="__('Traducción del chat')"
      data-testid="translate-card"
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <div class="text-sm font-semibold text-ink-gray-8">
          {{ __('El cliente escribe en {0}', [language.label]) }}
        </div>
        <button
          type="button"
          class="press flex size-8 items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
          :title="__('Ocultar')"
          :aria-label="__('Ocultar')"
          @click="expanded = false"
        >
          <span class="lucide-chevron-up size-4" aria-hidden="true" />
        </button>
      </div>
      <p v-if="loading" class="text-sm text-ink-gray-6">
        {{ __('Traduciendo…') }}
      </p>
      <p v-else-if="error" class="text-sm text-ink-red-6">{{ error }}</p>
      <ul v-else class="space-y-2">
        <li
          v-for="item in items"
          :key="item.id + item.original"
          class="text-sm text-ink-gray-9"
        >
          {{ item.text }}
          <span class="block text-xs text-ink-gray-6">{{ item.original }}</span>
        </li>
      </ul>
      <form class="mt-3 flex items-end gap-2" @submit.prevent="translateReply">
        <label class="min-w-0 flex-1">
          <span class="sr-only">{{ __('Tu respuesta') }}</span>
          <textarea
            v-model="reply"
            rows="2"
            class="ui-focus w-full resize-none rounded-6 border-0 bg-surface-gray-3 px-3 py-2 text-sm text-ink-gray-9 placeholder:text-ink-gray-5"
            :placeholder="__('Tu respuesta')"
            data-enter-keeps
          />
        </label>
        <Button
          variant="solid"
          :loading="replying"
          :disabled="!reply.trim()"
          type="submit"
          data-testid="translate-reply"
        >
          {{ __('Al {0}', [language.label]) }}
        </Button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Button, call, toast } from 'frappe-ui'
import {
  activeDeal,
  activeDealDoctype,
  setComposerDraft,
} from '@/composables/inbox'

const API = 'doco_marketing.api.inbox'
const language = ref({})
const expanded = ref(false)
const loading = ref(false)
const replying = ref(false)
const error = ref('')
const items = ref([])
const reply = ref('')

const shown = computed(() =>
  Boolean(language.value.enabled && language.value.foreign),
)

async function check() {
  language.value = {}
  items.value = []
  expanded.value = false
  error.value = ''
  if (!activeDeal.value) return
  const name = activeDeal.value
  try {
    const out = await call(`${API}.conversation_language`, {
      reference_doctype: activeDealDoctype.value,
      reference_name: name,
    })
    if (name === activeDeal.value) language.value = out || {}
  } catch {
    language.value = {}
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const out = await call(`${API}.translate_thread`, {
      reference_doctype: activeDealDoctype.value,
      reference_name: activeDeal.value,
    })
    items.value = (out?.items || []).slice().reverse()
  } catch (failure) {
    error.value =
      failure?.messages?.[0] || __('No se pudo traducir en este momento.')
  } finally {
    loading.value = false
  }
}

function toggle() {
  expanded.value = !expanded.value
  if (expanded.value && !items.value.length) load()
}

async function translateReply() {
  if (!reply.value.trim()) return
  replying.value = true
  try {
    const out = await call(`${API}.translate_reply`, {
      reference_doctype: activeDealDoctype.value,
      reference_name: activeDeal.value,
      text: reply.value,
      language: language.value.language,
    })
    setComposerDraft({ text: out.text })
    reply.value = ''
    expanded.value = false
    toast.success(__('Listo en el chat, revísalo y envíalo.'))
  } catch (failure) {
    toast.error(
      failure?.messages?.[0] || __('No se pudo traducir en este momento.'),
    )
  } finally {
    replying.value = false
  }
}

watch([activeDeal, activeDealDoctype], check, { immediate: true })
</script>
