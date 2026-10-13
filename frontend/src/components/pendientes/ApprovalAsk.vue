<template>
  <section
    v-if="asks.length"
    class="mb-4 rounded-xl border border-outline-amber-2 bg-surface-amber-1 p-3 sm:p-4"
    :aria-label="__('Asked of you')"
    data-approval-ask
  >
    <div v-for="ask in asks" :key="ask.todo" class="min-w-0">
      <p class="text-base font-medium text-ink-gray-9">
        {{ __('{0} asked you: {1}', [ask.requested_by_name, ask.text]) }}
      </p>
      <p v-if="ask.note" class="mt-0.5 text-sm text-ink-gray-8">
        «{{ ask.note }}»
      </p>
      <p v-if="ask.requested_at" class="mt-0.5 text-xs text-ink-gray-6">
        {{ formatMoment(ask.requested_at) }}
      </p>
    </div>
    <!-- On a phone the answer stays at thumb reach: a bar above the shell's
         bottom nav (the record's own decision first); inline from sm up. -->
    <div
      class="fixed inset-x-0 bottom-14 z-20 flex flex-wrap justify-end gap-2 border-t border-outline-gray-2 bg-surface-base px-4 py-3 sm:static sm:z-auto sm:mt-3 sm:justify-start sm:border-0 sm:bg-transparent sm:p-0"
      data-ask-actions
    >
      <Button
        class="min-h-11 sm:min-h-8"
        :label="__(`Don't approve`)"
        @click="selected = asks[0]"
      />
      <span class="contents sm:hidden"><slot name="primary" /></span>
    </div>
    <DeclineDialog
      :model-value="Boolean(selected)"
      :todo="selected?.todo || ''"
      :title="selected?.text || ''"
      @update:model-value="(open) => !open && (selected = null)"
      @declined="declined"
    />
  </section>
</template>
<script setup>
import { ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import DeclineDialog from '@/components/pendientes/DeclineDialog.vue'
import { aprobacionesApi } from '@/composables/useAprobaciones'
import { formatMoment } from '@/utils/contactos'

// What was asked of me on this record (Pendientes «Por aprobar»): read from the
// server for the record on screen, never from a ToDo id in the URL. Deciding
// stays the screen's own action (slot `primary` repeats it in the phone bar);
// «No aprobar» answers with a reason.
const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
})
const emit = defineEmits(['declined'])
const asks = ref([]),
  selected = ref(null)

async function load() {
  if (!props.name) {
    asks.value = []
    return
  }
  try {
    const answer = await aprobacionesApi('asks', {
      doctype: props.doctype,
      name: props.name,
    })
    asks.value = answer?.asks || []
  } catch {
    // An older server or no access: the record screen works without the banner.
    asks.value = []
  }
}
function declined(answer) {
  asks.value = asks.value.filter((ask) => ask.todo !== answer?.todo)
  selected.value = null
  emit('declined', answer)
}

watch(() => [props.doctype, props.name], load, { immediate: true })
defineExpose({ reload: load })
</script>
