<template>
  <div
    v-if="state"
    class="rounded-lg border border-outline-gray-2 bg-surface-gray-1 p-4"
    :role="state.code === 'network' ? 'status' : 'alert'"
  >
    <p class="text-base font-medium text-ink-gray-9">{{ state.message }}</p>
    <p v-if="hint" class="mt-1 text-sm text-ink-gray-6">{{ hint }}</p>
    <div v-if="state.actions?.length" class="mt-3 flex flex-wrap gap-2">
      <Button
        v-for="(action, index) in state.actions"
        :key="index"
        :label="action.label"
        :variant="index === 0 ? 'solid' : 'subtle'"
        :loading="busy === index"
        class="min-h-11 sm:min-h-0"
        @click="run(action, index)"
      />
    </div>
    <p v-if="note" role="status" class="mt-2 text-sm text-ink-gray-7">
      {{ note }}
    </p>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { Button } from 'frappe-ui'
import { archivosApi } from '@/composables/useArchivos'

// Renders the shared guard DTO. Route, call, copy and login actions resolve
// here; every other kind (retry, assign_self, clear_target, …) goes to the host.
const props = defineProps({
  state: { type: Object, default: null },
  hint: { type: String, default: '' },
  copyText: { type: String, default: '' },
})
const emit = defineEmits(['action', 'called'])
const busy = ref(-1),
  note = ref('')
async function run(action, index) {
  note.value = ''
  if (action.kind === 'route' && action.target) {
    window.location.assign(action.target)
    return
  }
  if (action.kind === 'login') {
    const back = window.location.pathname + window.location.search
    window.location.assign(`/login?redirect-to=${encodeURIComponent(back)}`)
    return
  }
  if (action.kind === 'copy' || action.kind === 'request_access') {
    const text =
      props.copyText ||
      __(
        'I need access in Archivos to continue: {0}. Please check my user permissions.',
        [props.state?.message || ''],
      )
    try {
      await navigator.clipboard.writeText(text)
      note.value = __('Request copied. Share it with your manager.')
    } catch {
      note.value = text
    }
    return
  }
  if (action.kind === 'call' && action.target) {
    busy.value = index
    try {
      const result = await archivosApi(action.target, action.args || {})
      note.value = result?.message || __('Done.')
      emit('called', { action, result })
    } catch (error) {
      note.value =
        error?.messages?.[0] ||
        __('We could not finish. Try again in a moment.')
    } finally {
      busy.value = -1
    }
    return
  }
  emit('action', action)
}
</script>
