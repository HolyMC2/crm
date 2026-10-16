<template>
  <Dialog
    :model-value="open"
    :title="title || __('Move to…')"
    size="md"
    @update:model-value="$emit('update:open', $event)"
  >
    <template #default>
      <div class="space-y-3">
        <p class="text-sm text-ink-gray-6">{{ __('Pick where it goes.') }}</p>
        <ul
          class="max-h-72 overflow-y-auto rounded-lg border border-outline-gray-2"
          :aria-label="__('Folders')"
        >
          <li>
            <button
              type="button"
              class="flex min-h-11 w-full items-center gap-2 px-3 text-left text-base hover:bg-surface-gray-1"
              :class="
                picked === ''
                  ? 'bg-surface-gray-2 font-medium'
                  : 'text-ink-gray-8'
              "
              @click="picked = ''"
            >
              <FeatherIcon
                name="inbox"
                class="h-4 w-4 shrink-0 text-ink-gray-5"
              />
              {{ __('No folder') }}
            </button>
          </li>
          <li v-for="folder in rows" :key="folder.name">
            <button
              type="button"
              class="flex min-h-11 w-full items-center gap-2 px-3 text-left text-base disabled:opacity-40 hover:bg-surface-gray-1"
              :class="
                picked === folder.name
                  ? 'bg-surface-gray-2 font-medium'
                  : 'text-ink-gray-8'
              "
              :disabled="blocked.includes(folder.name)"
              @click="picked = folder.name"
            >
              <span :style="{ width: folder.depth * 14 + 'px' }" />
              <FeatherIcon
                :name="folder.visibility === 'Company' ? 'folder' : 'lock'"
                class="h-4 w-4 shrink-0 text-ink-gray-5"
              />
              <span class="truncate">{{ folder.title }}</span>
            </button>
          </li>
        </ul>
        <p v-if="!rows.length" class="text-sm text-ink-gray-6">
          {{ __('There are no folders yet. Create one first.') }}
        </p>
        <p v-if="errorText" role="alert" class="text-sm text-ink-red-7">
          {{ errorText }}
        </p>
      </div>
    </template>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button :label="__('Cancel')" @click="$emit('update:open', false)" />
        <Button
          variant="solid"
          :label="__('Move here')"
          :loading="busy"
          @click="$emit('choose', picked)"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, Dialog, FeatherIcon } from 'frappe-ui'
import { flattenFolders, folderTree } from '@/composables/useArchivos'

// The folder picker shared by «Mover a…», the bulk bar and the preview pane.
// `blocked` keeps a folder from being moved inside itself.
const props = defineProps({
  open: { type: Boolean, default: false },
  folders: { type: Array, default: () => [] },
  title: { type: String, default: '' },
  current: { type: String, default: '' },
  blocked: { type: Array, default: () => [] },
  busy: { type: Boolean, default: false },
  errorText: { type: String, default: '' },
})
defineEmits(['update:open', 'choose'])

const rows = computed(() => flattenFolders(folderTree(props.folders), null))
const picked = ref(props.current || '')
watch(
  () => [props.open, props.current],
  () => {
    if (props.open) picked.value = props.current || ''
  },
  { immediate: true },
)
</script>
