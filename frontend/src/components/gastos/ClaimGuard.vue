<template>
  <div
    role="alert"
    class="space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-gray-8"
    :data-code="guard.code || undefined"
  >
    <p>{{ guard.message }}</p>
    <div v-if="guard.actions?.length" class="flex flex-wrap gap-2">
      <template
        v-for="action in guard.actions"
        :key="`${action.key}:${action.what || ''}`"
      >
        <a
          v-if="action.href"
          class="inline-flex min-h-11 items-center px-2 text-ink-blue-link underline sm:min-h-8"
          :href="action.href"
          >{{ actionLabel(action) }}</a
        >
        <Button
          v-else
          class="min-h-11 sm:min-h-8"
          :loading="running === action.key"
          :label="actionLabel(action)"
          @click="run(action)"
        />
      </template>
    </div>
    <p v-if="note" role="status" class="text-ink-gray-7">{{ note }}</p>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { Button } from 'frappe-ui'
import {
  actionLabel,
  claimProblem,
  claimsApi,
  runOnce,
} from '@/composables/useGastosEmpleados'

// A refusal with its way on: «Pedir mi ficha», «Pedir que lo activen»… are
// asked here (the administrators get the request in Pendientes); the rest
// (take the photo, ask someone else, continue with bills) go to the page.
defineProps({ guard: { type: Object, required: true } })
const emit = defineEmits(['action'])
const running = ref('')
const note = ref('')

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    note.value = __('Request copied. Share it with your manager.')
  } catch {
    note.value = text
  }
}

async function run(action) {
  if (action.key === 'copy') return copy(action.text || '')
  if (action.key !== 'request_setup') return emit('action', action)
  running.value = action.key
  note.value = ''
  try {
    const result = await runOnce(
      claimsApi,
      'request_setup',
      `setup:${action.what}`,
      { what: action.what },
    )
    if (result.copy) await copy(result.copy)
    if (result.message) note.value = result.message
  } catch (error) {
    note.value = claimProblem(error).detail
  } finally {
    running.value = ''
  }
}
</script>
