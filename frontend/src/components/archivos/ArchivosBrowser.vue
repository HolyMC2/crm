<template>
  <section class="flex min-h-0 w-full flex-col" :aria-label="viewLabel(view)">
    <div class="shrink-0 space-y-3 border-b border-outline-gray-2 p-4">
      <!-- Where I am -->
      <nav
        class="flex flex-wrap items-center gap-1 text-sm"
        :aria-label="__('Breadcrumb')"
      >
        <button
          type="button"
          class="rounded px-1.5 py-0.5 font-medium text-ink-gray-8 hover:bg-surface-gray-2"
          @click="$emit('navigate', { view, key: '' })"
        >
          {{ viewLabel(view) }}
        </button>
        <template v-for="crumb in crumbs" :key="crumb.view + crumb.key">
          <FeatherIcon name="chevron-right" class="h-3 w-3 text-ink-gray-4" />
          <button
            type="button"
            class="truncate rounded px-1.5 py-0.5 text-ink-gray-7 hover:bg-surface-gray-2"
            @click="$emit('navigate', { view: crumb.view, key: crumb.key })"
          >
            {{ crumb.label }}
          </button>
        </template>
      </nav>

      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-semibold text-ink-gray-9">
            {{ heading }}
          </h1>
          <p class="text-sm text-ink-gray-6">{{ viewHint(view) }}</p>
        </div>
        <Button
          v-if="view === 'carpeta'"
          class="min-h-11 shrink-0 sm:min-h-0"
          icon-left="folder-plus"
          :label="__('New folder')"
          @click="$emit('new-folder', currentKey)"
        />
        <Button
          variant="solid"
          class="min-h-11 shrink-0 sm:min-h-0"
          icon-left="upload"
          :label="__('Receive')"
          @click="$emit('upload')"
        />
      </div>

      <!-- Narrow it down -->
      <div class="flex flex-wrap items-center gap-2">
        <div data-archivos-search data-list-search class="min-w-[180px] flex-1">
          <FormControl
            v-model="search"
            class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
            type="text"
            :placeholder="__('Search by name, issuer or text')"
            :aria-label="__('Search files')"
            enterkeyhint="search"
          />
        </div>
        <Dropdown :options="kindOptions">
          <Button
            class="min-h-11 sm:min-h-0"
            icon-right="chevron-down"
            :label="kind ? browseKindLabel(kind) : __('Type')"
            :variant="kind ? 'subtle' : 'ghost'"
          />
        </Dropdown>
        <Dropdown :options="channelOptions">
          <Button
            class="min-h-11 sm:min-h-0"
            icon-right="chevron-down"
            :label="channel ? channelLabel(channel) : __('Channel')"
            :variant="channel ? 'subtle' : 'ghost'"
          />
        </Dropdown>
        <Dropdown :options="monthOptions">
          <Button
            class="min-h-11 sm:min-h-0"
            icon-right="chevron-down"
            :label="month ? monthLabel(month, locale) : __('Month')"
            :variant="month ? 'subtle' : 'ghost'"
          />
        </Dropdown>
        <Dropdown :options="sortOptions">
          <Button
            class="min-h-11 sm:min-h-0"
            variant="ghost"
            icon-left="bar-chart-2"
            :label="sortLabel(sort)"
          />
        </Dropdown>
        <div class="flex shrink-0 rounded border border-outline-gray-2">
          <button
            v-for="mode in ['list', 'grid']"
            :key="mode"
            type="button"
            class="flex h-11 w-11 items-center justify-center sm:h-8 sm:w-8"
            :class="layout === mode ? 'bg-surface-gray-3' : 'text-ink-gray-6'"
            :aria-pressed="layout === mode ? 'true' : 'false'"
            :aria-label="mode === 'list' ? __('List') : __('Grid')"
            @click="setLayout(mode)"
          >
            <FeatherIcon
              :name="mode === 'list' ? 'list' : 'grid'"
              class="h-4 w-4"
            />
          </button>
        </div>
      </div>
      <div
        v-if="activeFilters.length"
        class="flex flex-wrap items-center gap-2"
      >
        <button
          v-for="chip in activeFilters"
          :key="chip.kind"
          type="button"
          class="inline-flex min-h-8 items-center gap-1 rounded-full bg-surface-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-3"
          @click="$emit('patch', { [chip.kind]: '' })"
        >
          {{ chip.label }}
          <FeatherIcon name="x" class="h-3 w-3" />
        </button>
        <button
          type="button"
          class="text-sm text-ink-gray-6 underline"
          @click="$emit('patch', { kind: '', channel: '', month: '', q: '' })"
        >
          {{ __('Clear filters') }}
        </button>
      </div>
    </div>

    <!-- What is here -->
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
      <div
        v-if="loading && !rows.length"
        class="space-y-2 p-4"
        aria-hidden="true"
      >
        <div
          v-for="n in 6"
          :key="n"
          class="h-14 animate-pulse rounded bg-surface-gray-2"
        />
      </div>
      <div v-else-if="problemState" class="p-4">
        <ArchivoGuard :state="problemState" @action="$emit('retry')" />
      </div>
      <template v-else>
        <!-- Group views: one row per record, party, month, type or channel -->
        <ul
          v-if="groups.length"
          class="divide-y divide-outline-gray-1"
          :aria-label="__('Groups')"
        >
          <li v-for="group in groups" :key="group.view + group.key">
            <button
              type="button"
              class="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-gray-1"
              @click="$emit('navigate', { view: group.view, key: group.key })"
            >
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-gray-2"
              >
                <FeatherIcon
                  :name="groupIcon(group)"
                  class="h-4 w-4 text-ink-gray-6"
                />
              </span>
              <span class="min-w-0 flex-1 truncate text-base text-ink-gray-9">{{
                groupLabel(view, group, locale)
              }}</span>
              <Badge theme="gray" :label="String(group.count)" />
              <FeatherIcon
                name="chevron-right"
                class="h-4 w-4 shrink-0 text-ink-gray-4"
              />
            </button>
          </li>
        </ul>

        <!-- Child folders come before the loose files -->
        <ul
          v-if="folders.length"
          class="divide-y divide-outline-gray-1"
          :aria-label="__('Folders')"
        >
          <li v-for="folder in folders" :key="folder.name">
            <div
              class="group flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-gray-1"
              :class="
                dropTarget === folder.name
                  ? 'ring-2 ring-inset ring-outline-gray-4'
                  : ''
              "
              @dragover="allowDrop($event, folder.name)"
              @dragleave="dropTarget = null"
              @drop="dropOn($event, folder.name)"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 text-left"
                @click="
                  $emit('navigate', { view: 'carpeta', key: folder.name })
                "
              >
                <span
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-gray-2"
                >
                  <FeatherIcon name="folder" class="h-4 w-4 text-ink-gray-6" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <span
                      class="truncate text-base font-medium text-ink-gray-9"
                      >{{ folder.title }}</span
                    >
                    <FeatherIcon
                      v-if="folder.visibility !== 'Company'"
                      name="lock"
                      class="h-3 w-3 shrink-0 text-ink-gray-5"
                      :aria-label="__('Not everyone sees it')"
                    />
                  </span>
                  <span class="block text-sm text-ink-gray-6">{{
                    __('{0} files', [folder.count || 0])
                  }}</span>
                </span>
              </button>
              <Dropdown
                v-if="folder.can_manage"
                :options="folderMenu(folder)"
                placement="left"
              >
                <button
                  type="button"
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded text-ink-gray-5 hover:bg-surface-gray-3"
                  :aria-label="__('Folder actions')"
                >
                  <FeatherIcon name="more-horizontal" class="h-4 w-4" />
                </button>
              </Dropdown>
            </div>
          </li>
        </ul>

        <div
          v-if="!rows.length && !groups.length && !folders.length"
          class="px-6 py-12 text-center"
        >
          <FeatherIcon
            :name="empty.icon"
            class="mx-auto h-10 w-10 text-ink-gray-4"
          />
          <p class="mt-3 text-base font-medium text-ink-gray-8">
            {{ empty.title }}
          </p>
          <p class="mt-1 text-sm text-ink-gray-6">{{ empty.body }}</p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              v-if="q || kind || channel || month"
              class="min-h-11 sm:min-h-0"
              :label="__('Clear filters')"
              @click="
                $emit('patch', { kind: '', channel: '', month: '', q: '' })
              "
            />
            <template v-else-if="view === 'carpeta'">
              <Button
                variant="solid"
                class="min-h-11 sm:min-h-0"
                :label="__('Upload a file')"
                @click="$emit('upload')"
              />
              <Button
                class="min-h-11 sm:min-h-0"
                :label="__('Create a folder')"
                @click="$emit('new-folder', currentKey)"
              />
            </template>
            <Button
              v-else-if="view !== 'papelera'"
              variant="solid"
              class="min-h-11 sm:min-h-0"
              :label="__('Upload a file')"
              @click="$emit('upload')"
            />
          </div>
        </div>

        <!-- List -->
        <ul
          v-else-if="layout === 'list' && rows.length"
          class="divide-y divide-outline-gray-1"
          :aria-label="__('Files')"
        >
          <li v-for="(item, index) in rows" :key="item.id">
            <div
              class="flex min-h-16 items-center gap-2 px-2 py-2 hover:bg-surface-gray-1 sm:px-4"
              :class="rowClass(item, index)"
              :draggable="canManageItem(item) ? 'true' : 'false'"
              @dragstart="onDragStart($event, item)"
            >
              <input
                type="checkbox"
                class="h-5 w-5 shrink-0 rounded border-outline-gray-3"
                :checked="selected.has(item.id)"
                :aria-label="__('Select {0}', [item.title])"
                @click.prevent.stop="onCheck($event, item, index)"
              />
              <button
                type="button"
                data-archivos-row
                data-key-row
                class="flex min-w-0 flex-1 items-center gap-3 text-left"
                :aria-current="item.id === activeId ? 'true' : undefined"
                @click="onOpen(item, index)"
              >
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-gray-2"
                >
                  <img
                    v-if="item.preview === 'image' && item.file_url"
                    loading="lazy"
                    class="h-full w-full object-cover"
                    :src="item.file_url"
                    :alt="item.title"
                  />
                  <FeatherIcon
                    v-else
                    :name="previewIcon(item.preview, item.kind)"
                    class="h-4 w-4 text-ink-gray-6"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <span
                      class="truncate text-base font-medium text-ink-gray-9"
                      >{{ item.title }}</span
                    >
                    <FeatherIcon
                      v-if="
                        item.visibility === 'Private' ||
                        (item.source === 'attachment' && item.is_private)
                      "
                      name="lock"
                      class="h-3 w-3 shrink-0 text-ink-gray-5"
                      :aria-label="__('Only you can see it')"
                    />
                  </span>
                  <span class="block truncate text-sm text-ink-gray-6">{{
                    subtitle(item)
                  }}</span>
                </span>
                <span class="hidden shrink-0 items-center gap-2 sm:flex">
                  <Badge
                    v-if="item.channel && item.channel !== 'subida'"
                    theme="gray"
                    :label="channelLabel(item.channel)"
                  />
                  <span class="w-16 text-right text-xs text-ink-gray-5">{{
                    formatBytes(item.file_size)
                  }}</span>
                  <span
                    class="w-24 text-right text-xs text-ink-gray-5"
                    :title="formatDay(item.date || item.creation, locale)"
                    >{{ ageLabel(item.date || item.creation, locale) }}</span
                  >
                </span>
              </button>
            </div>
          </li>
        </ul>

        <!-- Grid -->
        <ul
          v-else-if="rows.length"
          class="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4"
          :aria-label="__('Files')"
        >
          <li v-for="(item, index) in rows" :key="item.id">
            <div
              class="relative flex h-full flex-col overflow-hidden rounded-lg border bg-surface-base"
              :class="
                selected.has(item.id) || item.id === activeId
                  ? 'border-outline-gray-4'
                  : 'border-outline-gray-2'
              "
              :draggable="canManageItem(item) ? 'true' : 'false'"
              @dragstart="onDragStart($event, item)"
            >
              <input
                type="checkbox"
                class="absolute left-2 top-2 z-10 h-5 w-5 rounded border-outline-gray-3 bg-surface-white"
                :checked="selected.has(item.id)"
                :aria-label="__('Select {0}', [item.title])"
                @click.prevent.stop="onCheck($event, item, index)"
              />
              <button
                type="button"
                data-archivos-row
                data-key-row
                class="flex flex-1 flex-col text-left"
                @click="onOpen(item, index)"
              >
                <span
                  class="flex h-28 items-center justify-center bg-surface-gray-2"
                >
                  <img
                    v-if="item.preview === 'image' && item.file_url"
                    loading="lazy"
                    class="h-full w-full object-cover"
                    :src="item.file_url"
                    :alt="item.title"
                  />
                  <FeatherIcon
                    v-else
                    :name="previewIcon(item.preview, item.kind)"
                    class="h-8 w-8 text-ink-gray-5"
                  />
                </span>
                <span class="flex min-w-0 flex-1 flex-col gap-0.5 p-2">
                  <span class="truncate text-sm font-medium text-ink-gray-9">{{
                    item.title
                  }}</span>
                  <span class="truncate text-xs text-ink-gray-6">{{
                    subtitle(item)
                  }}</span>
                </span>
              </button>
            </div>
          </li>
        </ul>

        <div v-if="hasMore" class="p-4">
          <Button
            class="min-h-11 w-full sm:min-h-0"
            :label="__('Load more')"
            :loading="loading"
            @click="$emit('more')"
          />
        </div>
      </template>
    </div>

    <!-- What I do with what I picked -->
    <div
      v-if="selectedItems.length"
      class="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-outline-gray-2 bg-surface-base p-3"
      role="toolbar"
      :aria-label="__('Selected files')"
    >
      <span class="text-sm font-medium text-ink-gray-8">{{
        __('{0} selected', [selectedItems.length])
      }}</span>
      <Button
        v-if="movable.length"
        class="min-h-11 sm:min-h-0"
        icon-left="corner-up-right"
        :label="__('Move to…')"
        @click="$emit('move', movable)"
      />
      <Button
        v-if="view === 'papelera' && movable.length"
        class="min-h-11 sm:min-h-0"
        icon-left="rotate-ccw"
        :label="__('Restore')"
        @click="$emit('restore', movable)"
      />
      <Button
        v-else-if="movable.length"
        class="min-h-11 sm:min-h-0"
        icon-left="trash-2"
        :label="__('Send to trash')"
        @click="$emit('trash', movable)"
      />
      <Button
        class="min-h-11 sm:min-h-0"
        icon-left="download"
        :label="__('Download')"
        @click="$emit('download', selectedItems)"
      />
      <Button
        variant="ghost"
        class="ml-auto min-h-11 sm:min-h-0"
        :label="__('Clear selection')"
        @click="clearSelection"
      />
    </div>
  </section>
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Badge, Button, Dropdown, FeatherIcon, FormControl } from 'frappe-ui'
import ArchivoGuard from '@/components/archivos/ArchivoGuard.vue'
import {
  BROWSE_CHANNELS,
  BROWSE_KINDS,
  SORTS,
  ageLabel,
  browseKindIcon,
  browseKindLabel,
  canManageItem,
  channelLabel,
  doctypeLabel,
  formatBytes,
  formatDay,
  groupLabel,
  monthLabel,
  previewIcon,
  selectionRange,
  sortLabel,
  viewHint,
  viewLabel,
  whereLabel,
} from '@/composables/useArchivos'

// The browse pane: breadcrumbs, filters, list or grid, selection and the bulk
// bar. It never decides who sees what; it shows exactly what the server sent.
const props = defineProps({
  view: { type: String, default: 'recientes' },
  currentKey: { type: String, default: '' },
  q: { type: String, default: '' },
  kind: { type: String, default: '' },
  channel: { type: String, default: '' },
  month: { type: String, default: '' },
  sort: { type: String, default: 'recent' },
  data: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  problemState: { type: Object, default: null },
  activeId: { type: String, default: '' },
  locale: { type: String, default: undefined },
})
const emit = defineEmits([
  'navigate',
  'patch',
  'open',
  'more',
  'retry',
  'move',
  'trash',
  'restore',
  'download',
  'upload',
  'new-folder',
  'folder-action',
  'move-to',
  'rename',
])

const rows = computed(() => props.data?.items || [])
const groups = computed(() => props.data?.groups || [])
const folders = computed(() => props.data?.folders || [])
const crumbs = computed(() => {
  const sent = props.data?.crumbs || []
  // Listing the records of one doctype has no server crumb: name it anyway so
  // the worker can see, and leave, where they are.
  if (
    !sent.length &&
    ['registro', 'contacto'].includes(props.view) &&
    props.currentKey &&
    !props.currentKey.includes('::')
  )
    return [
      {
        view: props.view,
        key: props.currentKey,
        label: doctypeLabel(props.currentKey),
      },
    ]
  // A record-type crumb comes as the DocType name: say it in the worker's words.
  return sent.map((crumb) =>
    crumb.key && !crumb.key.includes('::') && crumb.label === crumb.key
      ? { ...crumb, label: doctypeLabel(crumb.key) }
      : crumb,
  )
})
const hasMore = computed(() => !!props.data?.has_more)
const heading = computed(
  () => crumbs.value[crumbs.value.length - 1]?.label || viewLabel(props.view),
)

// Search is typed here and lands in the URL once the worker stops typing.
const search = ref(props.q)
watch(
  () => props.q,
  (value) => {
    if (value !== search.value) search.value = value
  },
)
const pushSearch = useDebounceFn(() => emit('patch', { q: search.value }), 300)
watch(search, pushSearch)

const layout = ref('list')
onMounted(() => {
  const saved = localStorage.getItem('archivos:layout')
  const phone = !window.matchMedia?.('(min-width: 640px)')?.matches
  layout.value =
    saved === 'grid' || saved === 'list' ? saved : phone ? 'grid' : 'list'
})
function setLayout(mode) {
  layout.value = mode
  try {
    localStorage.setItem('archivos:layout', mode)
  } catch {
    // A locked-down browser just forgets the choice next time.
  }
}

function option(label, patch, active) {
  return {
    label: active ? '• ' + label : label,
    onClick: () => emit('patch', patch),
  }
}
const kindOptions = computed(() => [
  option(__('Any type'), { kind: '' }, !props.kind),
  ...BROWSE_KINDS.map((k) =>
    option(browseKindLabel(k), { kind: k }, props.kind === k),
  ),
])
const channelOptions = computed(() => [
  option(__('Any channel'), { channel: '' }, !props.channel),
  ...BROWSE_CHANNELS.map((c) =>
    option(channelLabel(c), { channel: c }, props.channel === c),
  ),
])
const monthOptions = computed(() => {
  const now = new Date()
  const list = [option(__('Any month'), { month: '' }, !props.month)]
  for (let i = 0; i < 18; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    list.push(
      option(
        monthLabel(key, props.locale),
        { month: key },
        props.month === key,
      ),
    )
  }
  return list
})
const sortOptions = computed(() =>
  SORTS.map((s) =>
    option(sortLabel(s.value), { sort: s.value }, props.sort === s.value),
  ),
)
const activeFilters = computed(() => {
  const chips = []
  if (props.kind)
    chips.push({ kind: 'kind', label: browseKindLabel(props.kind) })
  if (props.channel)
    chips.push({ kind: 'channel', label: channelLabel(props.channel) })
  if (props.month)
    chips.push({ kind: 'month', label: monthLabel(props.month, props.locale) })
  return chips
})

function groupIcon(group) {
  if (props.view === 'mes') return 'calendar'
  if (props.view === 'canal') return 'message-square'
  if (props.view === 'tipo') return browseKindIcon(group?.key)
  if (props.view === 'contacto') return group?.name ? 'user' : 'users'
  return 'file-text'
}
function subtitle(item) {
  return [
    whereLabel(item),
    item.date ? formatDay(item.date, props.locale) : '',
    formatBytes(item.file_size),
  ]
    .filter(Boolean)
    .join(' · ')
}
const empty = computed(() => {
  if (props.q || props.kind || props.channel || props.month)
    return {
      icon: 'search',
      title: __('No file matches this search'),
      body: __('Try another word, or clear the filters.'),
    }
  if (props.view === 'papelera')
    return {
      icon: 'trash-2',
      title: __('The trash is empty'),
      body: __('Files you send to the trash stay here until they are purged.'),
    }
  if (props.view === 'carpeta')
    return {
      icon: 'folder',
      title: __('This folder is empty'),
      body: __('Upload a file here, or create a folder inside.'),
    }
  return {
    icon: 'inbox',
    title: __('Nothing here yet'),
    body: __('Files you receive or upload show up here.'),
  }
})

// --- selection -----------------------------------------------------------
const selected = ref(new Set())
const anchor = ref('')
const focusIndex = ref(-1)
watch(
  () => [
    props.view,
    props.currentKey,
    props.q,
    props.kind,
    props.channel,
    props.month,
  ],
  () => clearSelection(),
)
function clearSelection() {
  selected.value = new Set()
  anchor.value = ''
}
const ids = computed(() => rows.value.map((item) => item.id))
const selectedItems = computed(() =>
  rows.value.filter((item) => selected.value.has(item.id)),
)
const movable = computed(() => selectedItems.value.filter(canManageItem))
function setSelected(next) {
  selected.value = new Set(next)
}
function toggle(id) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
  anchor.value = id
}
function onCheck(event, item, index) {
  focusIndex.value = index
  if (event.shiftKey && anchor.value) {
    const range = selectionRange(ids.value, anchor.value, item.id)
    setSelected([...selected.value, ...range])
    return
  }
  toggle(item.id)
}
function onOpen(item, index) {
  focusIndex.value = index
  emit('open', item)
}

// --- dragging ------------------------------------------------------------
const dropTarget = ref(null)
function dragNames(item) {
  const picked = movable.value.filter((row) => row.id === item.id).length
    ? movable.value
    : [item]
  return picked.filter(canManageItem).map((row) => row.name)
}
function onDragStart(event, item) {
  if (!canManageItem(item)) return
  const names = dragNames(item)
  if (!names.length) return
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-archivos', names.join(','))
  event.dataTransfer.setData('text/plain', item.title || item.name)
}
function allowDrop(event, name) {
  if (!(event.dataTransfer?.types || []).includes('application/x-archivos'))
    return
  event.preventDefault()
  dropTarget.value = name
}
function dropOn(event, name) {
  if (!(event.dataTransfer?.types || []).includes('application/x-archivos'))
    return
  event.preventDefault()
  dropTarget.value = null
  const names = String(
    event.dataTransfer.getData('application/x-archivos') || '',
  )
    .split(',')
    .filter(Boolean)
  if (names.length) emit('move-to', { folder: name, names })
}
function rowClass(item, index) {
  const classes = []
  if (selected.value.has(item.id)) classes.push('bg-surface-gray-2')
  else if (item.id === props.activeId) classes.push('bg-surface-gray-1')
  if (index === focusIndex.value)
    classes.push('outline outline-2 -outline-offset-2 outline-outline-gray-3')
  return classes
}

function folderMenu(folder) {
  const trashed = !!folder.trashed_on
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
      label: trashed ? __('Restore') : __('Send to trash'),
      icon: trashed ? 'rotate-ccw' : 'trash-2',
      onClick: () =>
        emit('folder-action', {
          action: trashed ? 'restore' : 'trash',
          folder,
        }),
    },
  ]
}

// --- keyboard ------------------------------------------------------------
function typing(target) {
  const tag = target?.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target?.isContentEditable
  )
}
const scroller = ref(null)
function focusRow(index) {
  const next = Math.max(0, Math.min(index, rows.value.length - 1))
  focusIndex.value = next
  const el = scroller.value?.querySelectorAll('[data-archivos-row]')?.[next]
  el?.focus?.()
  el?.scrollIntoView?.({ block: 'nearest' })
}
function onWindowKey(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
    return
  if (typing(event.target)) return
  if (event.key === '/') {
    event.preventDefault()
    document.querySelector('[data-archivos-search] input')?.focus()
    return
  }
  if (!rows.value.length) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    focusRow(focusIndex.value + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    focusRow(focusIndex.value - 1)
  } else if (event.key === 'Enter') {
    const item = rows.value[focusIndex.value]
    if (item) {
      event.preventDefault()
      emit('open', item)
    }
  } else if (event.key === ' ') {
    const item = rows.value[focusIndex.value]
    if (item) {
      event.preventDefault()
      toggle(item.id)
    }
  } else if (event.key === 'Delete') {
    const picked = movable.value.length
      ? movable.value
      : [rows.value[focusIndex.value]].filter(canManageItem)
    if (picked.length) {
      event.preventDefault()
      emit(props.view === 'papelera' ? 'restore' : 'trash', picked)
    }
  } else if (event.key === 'F2') {
    const item = movable.value[0] || rows.value[focusIndex.value]
    if (canManageItem(item)) {
      event.preventDefault()
      emit('rename', item)
    }
  } else if (event.key === 'Escape') {
    if (selected.value.size) {
      event.preventDefault()
      clearSelection()
    }
  }
}
onMounted(() => window.addEventListener('keydown', onWindowKey))
onUnmounted(() => window.removeEventListener('keydown', onWindowKey))

defineExpose({ clearSelection, select: (id) => setSelected([id]) })
</script>
