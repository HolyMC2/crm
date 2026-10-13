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
    <p v-if="problem" role="alert" class="mt-2 text-sm text-ink-red-7">
      <strong>{{ problem.title }}.</strong> {{ problem.detail }}
    </p>
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
      <!-- An ask the screen has no decision for (a review): answered here. -->
      <Button
        v-if="settleable"
        class="min-h-11 sm:min-h-8"
        variant="solid"
        :label="settleLabel || __('Done')"
        :loading="settling"
        @click="settle(settleable)"
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
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import DeclineDialog from '@/components/pendientes/DeclineDialog.vue'
import {
  approvalError,
  aprobacionesApi,
  requestId,
} from '@/composables/useAprobaciones'
import { formatMoment } from '@/utils/contactos'

// What was asked of me on this record (Pendientes «Por aprobar»): read from the
// server for the record on screen, never from a ToDo id in the URL. Deciding
// stays the screen's own action (slot `primary` repeats it in the phone bar);
// «No aprobar» answers with a reason. Asks of `settleKinds` (a purchase review)
// have no decision on the screen: «Revisada» answers them and tells who asked.
const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  settleKinds: { type: Array, default: () => [] },
  settleLabel: { type: String, default: '' },
})
const emit = defineEmits(['declined', 'settled'])
const asks = ref([]),
  selected = ref(null),
  settling = ref(false),
  problem = ref(null)
// One id per answer until it lands: a lost response is not a second answer.
let settleRequest = null

const settleable = computed(() =>
  asks.value.find((ask) => props.settleKinds.includes(ask.kind)),
)

async function load() {
  problem.value = null
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
async function settle(ask) {
  settling.value = true
  problem.value = null
  if (settleRequest?.todo !== ask.todo)
    settleRequest = { todo: ask.todo, id: requestId() }
  try {
    const answer = await aprobacionesApi('settle', {
      todo: ask.todo,
      request_id: settleRequest.id,
    })
    settleRequest = null
    asks.value = asks.value.filter((item) => item.todo !== ask.todo)
    emit('settled', { ...ask, ...(answer || {}) })
  } catch (error) {
    problem.value = approvalError(error)
  } finally {
    settling.value = false
  }
}

watch(() => [props.doctype, props.name], load, { immediate: true })
defineExpose({ reload: load })
</script>
