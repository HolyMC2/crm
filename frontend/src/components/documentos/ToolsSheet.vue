<template>
  <!-- «⋯» on a record (Shell SPEC §6 DD5): every tool in one sheet. A tool
       this worker cannot use now stays in its place with the reason under it
       (Frappe permissions and the document's state), never a dead tap. -->
  <BottomSheet
    :open="open"
    title="Herramientas"
    :subtitle="subtitle"
    flush
    @update:open="emit('update:open', $event)"
  >
    <ul class="pb-2" data-testid="documentos-tools">
      <li v-for="tool in tools" :key="tool.key">
        <ListRow
          :icon="tool.icon"
          :title="tool.label"
          :subtitle="tool.allowed ? tool.hint : tool.reason"
          :subtitle-lines="2"
          :class="[
            tool.allowed ? '' : 'opacity-60',
            tool.danger && tool.allowed ? 'text-ink-red-7' : '',
          ]"
          :aria-disabled="tool.allowed ? undefined : 'true'"
          :data-tool="tool.key"
          @click="pick(tool)"
        />
      </li>
    </ul>
  </BottomSheet>
</template>
<script setup>
import { BottomSheet, ListRow } from '@/components/ui'

defineProps({
  open: { type: Boolean, default: false },
  // toolsFor(record, …) entries
  tools: { type: Array, default: () => [] },
  subtitle: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'tool'])

function pick(tool) {
  if (!tool.allowed) return
  emit('update:open', false)
  emit('tool', tool.key)
}
</script>
