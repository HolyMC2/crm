<!--
  ConversationReviewStrip — pending/failed supervised WhatsApp sends for the OPEN
  conversation, shown above the message thread (Activities.vue WhatsApp tab → used by
  both the inbox Conversación tab and the Deal 360 page).

  Scope = this deal/lead OR the contact's phone (last-10), so a Repair-Order "ya está
  listo" that threads in by phone still surfaces here for one-tap approval. Renders
  nothing when the queue is empty. Re-emits `changed` so the parent reloads the thread.
-->
<template>
  <div v-if="rows.length" class="rounded-[10px] border border-amber-200 bg-surface-amber-1 p-2 dark:border-amber-900/40">
    <div class="mb-1.5 flex items-center gap-1.5 px-1">
      <FeatherIcon name="clock" class="size-3.5 text-ink-amber-7" />
      <span class="text-2xs-semibold uppercase tracking-wide text-ink-amber-7">
        {{ rows.length }} {{ rows.length === 1 ? __('mensaje por aprobar') : __('mensajes por aprobar') }}
      </span>
    </div>
    <div class="flex flex-col gap-2">
      <WhatsAppReviewCard
        v-for="row in rows"
        :key="row.name"
        :row="row"
        @changed="onChanged"
      />
    </div>
  </div>
</template>

<script setup>
import WhatsAppReviewCard from '@/components/doco/WhatsAppReviewCard.vue'
import { FeatherIcon, createResource } from 'frappe-ui'
import { computed, watch } from 'vue'

const props = defineProps({
  referenceDoctype: { type: String, default: '' },
  referenceName: { type: String, default: '' },
  phone: { type: String, default: '' },
})
const emit = defineEmits(['changed'])

const queue = createResource({
  url: 'doco_marketing.api.review_queue.get_queue',
  makeParams: () => ({
    status: 'Pendiente,Fallido',
    reference_doctype: props.referenceDoctype,
    reference_name: props.referenceName,
    phone: props.phone,
    limit: 25,
  }),
})

// only the still-actionable rows (the backend already scopes to Pendiente/Fallido,
// but guard in case an approved row lingers in a cached payload)
const rows = computed(() =>
  (queue.data || []).filter((r) => ['Pendiente', 'Fallido'].includes(r.status)),
)

function reload() {
  if (props.referenceName || props.phone) queue.reload()
}

// fetch when the conversation changes (deal switch in the inbox, contact switch)
watch(
  () => [props.referenceName, props.phone],
  () => reload(),
  { immediate: true },
)

function onChanged() {
  reload()
  emit('changed')
}

defineExpose({ reload })
</script>
