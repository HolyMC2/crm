<!--
  Small shared action control for a conversation attachment (WhatsApp, email,
  unified inbox): «Guardar en Archivos» / «Vincular a…», plus the «En Archivos»
  badge once the server confirms it is filed. ARC-S2.3.
-->
<template>
  <span class="inline-flex items-center gap-1">
    <a
      v-if="savedDocument"
      :href="savedHref"
      class="inline-flex items-center gap-1 rounded bg-surface-green-1 px-1.5 py-0.5 text-2xs font-medium text-ink-green-9 hover:underline"
    >
      {{ __('In Files') }}
    </a>
    <Dropdown v-else :options="options">
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-2xs text-ink-gray-6 hover:bg-surface-gray-2 disabled:opacity-60"
        :disabled="busy"
        :aria-label="__('Files actions')"
      >
        <FeatherIcon
          :name="busy ? 'loader' : 'folder'"
          class="size-3.5"
          :class="{ 'animate-spin': busy }"
        />
      </button>
    </Dropdown>
  </span>
</template>
<script setup>
import { computed } from 'vue'
import { Dropdown, FeatherIcon } from 'frappe-ui'
import { archivosHref } from '@/composables/useArchivos'

const props = defineProps({
  // Doco Document name once saved, or '' while not saved yet.
  savedDocument: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  // The record to preselect in Archivos for «Vincular a…» ({doctype, name}).
  target: { type: Object, default: null },
  returnLabel: { type: String, default: '' },
})

const emit = defineEmits(['save', 'link'])

const savedHref = computed(() =>
  props.savedDocument ? archivosHref({ document: props.savedDocument }) : '',
)

const options = computed(() => [
  {
    label: __('Save to Files'),
    icon: 'folder-plus',
    onClick: () => emit('save'),
  },
  {
    label: __('Link to…'),
    icon: 'link',
    onClick: () => emit('link'),
  },
])
</script>
