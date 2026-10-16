<template>
  <!-- Phones have no sidebar: one control that still shows both groups. -->
  <div v-if="mobile" class="grid gap-2">
    <select
      class="h-11 w-full rounded border border-outline-gray-2 bg-surface-white px-3 text-base text-ink-gray-9"
      :aria-label="__('List')"
      :value="currentValue"
      @change="pickMobile($event.target.value)"
    >
      <optgroup :label="__('Inbox')">
        <option
          v-for="entry in bandejaEntries"
          :key="entry.value"
          :value="entry.value"
        >
          {{ entry.label }}
        </option>
      </optgroup>
      <optgroup :label="__('Explore')">
        <option
          v-for="entry in browseEntries"
          :key="entry.value"
          :value="entry.value"
        >
          {{ entry.label }}
        </option>
      </optgroup>
      <optgroup v-if="folderRows.length" :label="__('Folders')">
        <option
          v-for="folder in allFolderRows"
          :key="folder.name"
          :value="'carpeta:' + folder.name"
        >
          {{ '— '.repeat(folder.depth) + folder.title }}
        </option>
      </optgroup>
    </select>
  </div>
  <nav v-else class="flex flex-col gap-1" :aria-label="__('Archivos lists')">
    <p class="px-3 pb-1 text-xs font-medium uppercase text-ink-gray-5">
      {{ __('Inbox') }}
    </p>
    <button
      v-for="entry in bandejaEntries"
      :key="entry.value"
      type="button"
      class="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
      :class="rowClass(view === entry.value && !currentKey)"
      :aria-current="view === entry.value ? 'page' : undefined"
      @click="$emit('select', { view: entry.value, key: '' })"
    >
      <FeatherIcon :name="entry.icon" class="h-4 w-4 shrink-0" />
      <span class="truncate">{{ entry.label }}</span>
    </button>

    <p class="px-3 pb-1 pt-5 text-xs font-medium uppercase text-ink-gray-5">
      {{ __('Explore') }}
    </p>
    <template v-for="entry in browseEntries" :key="entry.value">
      <button
        type="button"
        class="flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
        :class="[
          rowClass(view === entry.value && !currentKey),
          entry.value === 'carpeta' && dropTarget === ''
            ? 'ring-2 ring-outline-gray-4'
            : '',
        ]"
        :aria-current="view === entry.value && !currentKey ? 'page' : undefined"
        @click="$emit('select', { view: entry.value, key: '' })"
        @dragover="entry.value === 'carpeta' && allowDrop($event, '')"
        @dragleave="entry.value === 'carpeta' && (dropTarget = null)"
        @drop="entry.value === 'carpeta' && drop($event, '')"
      >
        <FeatherIcon :name="entry.icon" class="h-4 w-4 shrink-0" />
        <span class="truncate">{{ entry.label }}</span>
        <span
          v-if="entryCount(entry.value) !== ''"
          class="ml-auto text-xs text-ink-gray-5"
          >{{ entryCount(entry.value) }}</span
        >
      </button>
      <div v-if="entry.value === 'carpeta'" class="flex flex-col gap-0.5">
        <div
          v-for="folder in folderRows"
          :key="folder.name"
          class="group flex min-h-9 items-center rounded-lg pr-1 text-sm hover:bg-surface-gray-2"
          :class="[
            view === 'carpeta' && currentKey === folder.name
              ? 'bg-surface-gray-2 font-semibold text-ink-gray-9'
              : 'text-ink-gray-7',
            dropTarget === folder.name ? 'ring-2 ring-outline-gray-4' : '',
          ]"
          @dragover="allowDrop($event, folder.name)"
          @dragleave="dropTarget = null"
          @drop="drop($event, folder.name)"
        >
          <span :style="{ width: 10 + folder.depth * 12 + 'px' }" />
          <button
            v-if="folder.hasChildren"
            type="button"
            class="flex h-6 w-5 shrink-0 items-center justify-center text-ink-gray-5"
            :aria-label="
              expanded.has(folder.name) ? __('Collapse') : __('Expand')
            "
            :aria-expanded="expanded.has(folder.name) ? 'true' : 'false'"
            @click.stop="toggle(folder.name)"
          >
            <FeatherIcon
              :name="
                expanded.has(folder.name) ? 'chevron-down' : 'chevron-right'
              "
              class="h-3.5 w-3.5"
            />
          </button>
          <span v-else class="w-5 shrink-0" />
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
            @click="$emit('select', { view: 'carpeta', key: folder.name })"
          >
            <FeatherIcon
              :name="folder.visibility === 'Company' ? 'folder' : 'lock'"
              class="h-3.5 w-3.5 shrink-0 text-ink-gray-5"
            />
            <span class="truncate">{{ folder.title }}</span>
            <span
              v-if="folder.count"
              class="shrink-0 text-xs text-ink-gray-5"
              >{{ folder.count }}</span
            >
          </button>
          <Dropdown
            v-if="folder.can_manage"
            :options="folderMenu(folder)"
            placement="right"
          >
            <button
              type="button"
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-gray-5 opacity-0 hover:bg-surface-gray-3 focus:opacity-100 group-hover:opacity-100"
              :aria-label="__('Folder actions')"
            >
              <FeatherIcon name="more-horizontal" class="h-4 w-4" />
            </button>
          </Dropdown>
        </div>
        <button
          type="button"
          class="flex min-h-9 items-center gap-2 rounded-lg px-3 text-left text-sm text-ink-gray-6 hover:bg-surface-gray-2 hover:text-ink-gray-8"
          @click="$emit('new-folder', currentFolderParent)"
        >
          <FeatherIcon name="folder-plus" class="h-3.5 w-3.5 shrink-0" />
          {{ __('New folder') }}
        </button>
      </div>
    </template>
  </nav>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Dropdown, FeatherIcon } from 'frappe-ui'
import {
  BANDEJA_VIEWS,
  BROWSE_VIEWS,
  flattenFolders,
  folderLine,
  folderTree,
  viewCountLabel,
  viewLabel,
} from '@/composables/useArchivos'

// The whole left navigation: «Bandeja» (the intake queues) and «Explorar»
// (the file manager), with the folder tree as a drop target.
const props = defineProps({
  view: { type: String, default: 'por_clasificar' },
  currentKey: { type: String, default: '' },
  counts: { type: Object, default: () => ({}) },
  summary: { type: Object, default: null },
  folders: { type: Array, default: () => [] },
  mobile: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'new-folder', 'folder-action', 'move-to'])

const bandejaEntries = computed(() =>
  BANDEJA_VIEWS.map((v) => ({
    value: v.value,
    icon: v.icon,
    label: viewCountLabel(v.value, props.counts),
  })),
)
const browseEntries = computed(() =>
  BROWSE_VIEWS.map((v) => ({
    value: v.value,
    icon: v.icon,
    label: viewLabel(v.value),
  })),
)
function entryCount(value) {
  if (value === 'recientes' && typeof props.summary?.total === 'number')
    return String(props.summary.total)
  if (value === 'papelera' && props.summary?.trash)
    return String(props.summary.trash)
  return ''
}
function rowClass(active) {
  return active
    ? 'bg-surface-gray-2 font-semibold text-ink-gray-9'
    : 'text-ink-gray-7'
}

const tree = computed(() => folderTree(props.folders))
const expanded = ref(new Set())
// The folder being looked at is always reachable: open its line of parents.
watch(
  () => [props.view, props.currentKey, props.folders.length],
  () => {
    if (props.view !== 'carpeta' || !props.currentKey) return
    const next = new Set(expanded.value)
    for (const folder of folderLine(props.folders, props.currentKey))
      if (folder.name !== props.currentKey) next.add(folder.name)
    expanded.value = next
  },
  { immediate: true },
)
function toggle(name) {
  const next = new Set(expanded.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  expanded.value = next
}
const folderRows = computed(() => flattenFolders(tree.value, expanded.value))
const allFolderRows = computed(() => flattenFolders(tree.value, null))
const currentFolderParent = computed(() =>
  props.view === 'carpeta' ? props.currentKey : '',
)

const currentValue = computed(() =>
  props.view === 'carpeta' && props.currentKey
    ? 'carpeta:' + props.currentKey
    : props.view,
)
function pickMobile(value) {
  const [view, ...rest] = String(value).split(':')
  emit('select', { view, key: rest.join(':') })
}

function folderMenu(folder) {
  return [
    {
      label: __('Rename'),
      icon: 'edit-2',
      onClick: () => emit('folder-action', { action: 'rename', folder }),
    },
    {
      label: __('Move'),
      icon: 'corner-up-right',
      onClick: () => emit('folder-action', { action: 'move', folder }),
    },
    {
      label: __('Who sees it'),
      icon: 'eye',
      onClick: () => emit('folder-action', { action: 'visibility', folder }),
    },
    {
      label: __('New folder inside'),
      icon: 'folder-plus',
      onClick: () => emit('new-folder', folder.name),
    },
    {
      label: folder.trashed_on ? __('Restore') : __('Send to trash'),
      icon: folder.trashed_on ? 'rotate-ccw' : 'trash-2',
      onClick: () =>
        emit('folder-action', {
          action: folder.trashed_on ? 'restore' : 'trash',
          folder,
        }),
    },
  ]
}

// Dragging rows onto a folder files them there; the server still decides.
const dropTarget = ref(null)
function dragged(event) {
  return (event.dataTransfer?.types || []).includes('application/x-archivos')
}
function allowDrop(event, name) {
  if (!dragged(event)) return
  event.preventDefault()
  dropTarget.value = name
}
function drop(event, name) {
  if (!dragged(event)) return
  event.preventDefault()
  dropTarget.value = null
  const raw = event.dataTransfer.getData('application/x-archivos')
  const names = String(raw || '')
    .split(',')
    .filter(Boolean)
  if (names.length) emit('move-to', { folder: name, names })
}
</script>
