<template>
  <section
    class="flex min-h-0 flex-1 flex-col bg-surface-base"
    :aria-label="__('File')"
  >
    <header
      class="flex shrink-0 items-center gap-2 border-b border-outline-gray-2 px-3 py-2"
    >
      <Button
        variant="ghost"
        class="min-h-11 shrink-0 sm:min-h-0"
        icon-left="arrow-left"
        :label="__('Back')"
        @click="$emit('close')"
      />
      <h2
        class="min-w-0 flex-1 truncate text-base font-semibold text-ink-gray-9"
      >
        {{ item?.title || __('File') }}
      </h2>
      <Badge
        v-if="item?.status"
        :theme="statusTheme(item.status)"
        :label="statusLabel(item.status)"
      />
    </header>

    <div v-if="loading" class="space-y-3 p-4" aria-hidden="true">
      <div class="h-56 animate-pulse rounded bg-surface-gray-2" />
      <div class="h-6 w-40 animate-pulse rounded bg-surface-gray-2" />
    </div>
    <div v-else-if="problemState" class="p-4">
      <ArchivoGuard :state="problemState" @action="onGuard" />
    </div>
    <div v-else-if="item" class="min-h-0 flex-1 overflow-y-auto">
      <!-- What the file looks like -->
      <div class="border-b border-outline-gray-2 bg-surface-gray-1 p-3">
        <div
          v-if="item.preview === 'image' && item.file_url"
          class="flex justify-center"
        >
          <img
            class="cursor-zoom-in rounded"
            :class="
              zoomed ? 'max-w-none' : 'max-h-[60vh] w-auto object-contain'
            "
            :src="item.file_url"
            :alt="item.title"
            @click="zoomed = !zoomed"
          />
        </div>
        <iframe
          v-else-if="item.preview === 'pdf' && item.file_url"
          class="h-[60vh] w-full rounded border border-outline-gray-2 bg-surface-white"
          :title="item.title"
          :src="item.file_url"
        />
        <!-- XML: a document gets the CFDI card (raw XML one tap away inside
             it); a native SAT attachment, or a non-CFDI XML, stays raw. -->
        <div v-else-if="item.preview === 'xml'" class="space-y-3">
          <CfdiCard
            v-if="item.source === 'document'"
            :name="item.name"
            :raw-text="text"
            @loaded="cfdi = $event"
          />
          <template
            v-if="item.source !== 'document' || cfdi?.available === false"
          >
            <p v-if="textProblem" class="text-sm text-ink-gray-6">
              {{ textProblem }}
            </p>
            <pre
              v-else
              class="max-h-[60vh] overflow-auto rounded border border-outline-gray-2 bg-surface-white p-3 text-xs text-ink-gray-8"
              >{{ prettyXml(text) }}</pre
            >
          </template>
        </div>
        <div v-else-if="item.preview === 'text'">
          <p v-if="textProblem" class="text-sm text-ink-gray-6">
            {{ textProblem }}
          </p>
          <div
            v-else-if="isCsv"
            class="max-h-[60vh] overflow-auto rounded border border-outline-gray-2 bg-surface-white"
          >
            <table class="w-full border-collapse text-xs">
              <tbody>
                <tr
                  v-for="(row, r) in csvRows"
                  :key="r"
                  class="border-b border-outline-gray-1"
                >
                  <td
                    v-for="(cell, c) in row"
                    :key="c"
                    class="max-w-[220px] truncate px-2 py-1"
                    :class="
                      r === 0
                        ? 'font-medium text-ink-gray-9'
                        : 'text-ink-gray-7'
                    "
                  >
                    {{ cell }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <pre
            v-else
            class="max-h-[60vh] overflow-auto rounded border border-outline-gray-2 bg-surface-white p-3 text-xs text-ink-gray-8"
            >{{ text }}</pre
          >
        </div>
        <div v-else class="flex flex-col items-center gap-3 py-10">
          <FeatherIcon
            :name="previewIcon(item.preview, item.kind)"
            class="h-12 w-12 text-ink-gray-4"
          />
          <p class="text-sm text-ink-gray-6">
            {{ __('This file cannot be shown here. Download it to open it.') }}
          </p>
        </div>
        <p v-if="truncated" class="mt-2 text-xs text-ink-gray-5">
          {{ __('Showing the beginning of the file only.') }}
        </p>
      </div>

      <!-- What I can do with it -->
      <div class="flex flex-wrap gap-2 border-b border-outline-gray-2 p-3">
        <a
          v-if="item.file_url"
          class="inline-flex min-h-11 items-center gap-1.5 rounded bg-surface-gray-10 px-3 text-sm font-medium text-ink-base sm:min-h-8"
          :href="item.file_url"
          download
          ><FeatherIcon name="download" class="h-4 w-4" />{{
            __('Download')
          }}</a
        >
        <a
          v-if="recordLink"
          class="inline-flex min-h-11 items-center gap-1.5 rounded border border-outline-gray-2 px-3 text-sm text-ink-gray-8 sm:min-h-8"
          :href="recordLink.href"
          ><FeatherIcon name="external-link" class="h-4 w-4" />{{
            __('Open record')
          }}</a
        >
        <Button
          v-if="canManageItem(item)"
          class="min-h-11 sm:min-h-0"
          icon-left="edit-2"
          :label="__('Rename')"
          @click="startRename"
        />
        <Button
          v-if="canManageItem(item)"
          class="min-h-11 sm:min-h-0"
          icon-left="corner-up-right"
          :label="__('Move')"
          @click="$emit('move', item)"
        />
        <Button
          v-if="canManageItem(item) && item.visibility === 'Private'"
          class="min-h-11 sm:min-h-0"
          icon-left="users"
          :label="__('Share with the company')"
          :loading="busy === 'share'"
          @click="share"
        />
        <Button
          class="min-h-11 sm:min-h-0"
          icon-left="link"
          :label="__('Copy link')"
          @click="copyLink"
        />
        <Button
          v-if="isDocumentItem(item)"
          class="min-h-11 sm:min-h-0"
          icon-left="layers"
          :label="__('Versions')"
          @click="toggleVersions"
        />
        <Button
          v-if="canManageItem(item) && !item.trashed_on"
          class="min-h-11 sm:min-h-0"
          icon-left="trash-2"
          :label="__('Send to trash')"
          :loading="busy === 'trash'"
          @click="trash"
        />
        <Button
          v-if="canManageItem(item) && item.trashed_on"
          class="min-h-11 sm:min-h-0"
          icon-left="rotate-ccw"
          :label="__('Restore')"
          :loading="busy === 'restore'"
          @click="restore"
        />
        <Button
          v-if="isDocumentItem(item)"
          class="min-h-11 sm:min-h-0"
          icon-left="inbox"
          :label="__('Classify in the inbox')"
          @click="$emit('classify', item.name)"
        />
        <Button
          v-if="item.can_promote"
          variant="solid"
          class="min-h-11 sm:min-h-0"
          icon-left="save"
          :label="__('Save to Archivos')"
          :loading="busy === 'promote'"
          @click="promote"
        />
      </div>

      <div
        v-if="renaming"
        class="flex flex-wrap items-end gap-2 border-b border-outline-gray-2 p-3"
      >
        <FormControl
          v-model="newTitle"
          class="min-w-[200px] flex-1 [&_input]:min-h-11 sm:[&_input]:min-h-0"
          type="text"
          :label="__('New name')"
          @keydown.enter="saveRename"
        />
        <Button
          variant="solid"
          class="min-h-11 sm:min-h-0"
          :label="__('Save')"
          :loading="busy === 'rename'"
          @click="saveRename"
        />
        <Button
          class="min-h-11 sm:min-h-0"
          :label="__('Cancel')"
          @click="renaming = false"
        />
      </div>

      <ArchivoGuard
        v-if="actionProblem"
        class="m-3"
        :state="actionProblem"
        @action="actionProblem = null"
      />

      <!-- Versions -->
      <div v-if="showVersions" class="border-b border-outline-gray-2 p-3">
        <div class="mb-2 flex items-center gap-2">
          <h3 class="text-sm font-semibold text-ink-gray-9">
            {{ __('Versions') }}
          </h3>
          <label
            v-if="canManageItem(item)"
            class="ml-auto inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded border border-outline-gray-2 px-3 text-sm text-ink-gray-8"
          >
            <FeatherIcon name="upload" class="h-3.5 w-3.5" />{{
              __('Upload a new version')
            }}
            <input
              type="file"
              :accept="ACCEPT"
              class="sr-only"
              @change="pickVersion"
            />
          </label>
        </div>
        <p v-if="versionsLoading" class="text-sm text-ink-gray-6">
          {{ __('Loading…') }}
        </p>
        <ul v-else class="divide-y divide-outline-gray-1">
          <li v-for="row in versions" :key="row.name">
            <button
              type="button"
              class="flex min-h-11 w-full items-center gap-2 text-left text-sm hover:bg-surface-gray-1"
              @click="$emit('open-id', 'doc:' + row.name)"
            >
              <Badge theme="gray" :label="__('v{0}', [row.version_no])" />
              <span class="min-w-0 flex-1 truncate text-ink-gray-8">{{
                row.filename || row.title
              }}</span>
              <span class="shrink-0 text-xs text-ink-gray-5">{{
                formatDay(row.creation, locale)
              }}</span>
            </button>
          </li>
        </ul>
      </div>

      <!-- What it is -->
      <dl class="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt class="text-ink-gray-5">{{ __('Type') }}</dt>
          <dd class="text-ink-gray-9">{{ browseKindLabel(item.kind) }}</dd>
        </div>
        <div>
          <dt class="text-ink-gray-5">{{ __('Channel') }}</dt>
          <dd class="text-ink-gray-9">
            {{ channelLabel(item.channel) || '—' }}
          </dd>
        </div>
        <div>
          <dt class="text-ink-gray-5">{{ __('Date') }}</dt>
          <dd class="text-ink-gray-9">
            {{ formatDay(item.date || item.creation, locale) || '—' }}
          </dd>
        </div>
        <div>
          <dt class="text-ink-gray-5">{{ __('Size') }}</dt>
          <dd class="text-ink-gray-9">{{ formatBytes(item.file_size) }}</dd>
        </div>
        <div>
          <dt class="text-ink-gray-5">{{ __('Received by') }}</dt>
          <dd class="truncate text-ink-gray-9">
            {{ item.owner_label || item.owner }}
          </dd>
        </div>
        <div>
          <dt class="text-ink-gray-5">{{ __('Where it lives') }}</dt>
          <dd class="truncate text-ink-gray-9">
            {{ whereLabel(item) || __('No folder') }}
          </dd>
        </div>
      </dl>
      <div v-if="item.links?.length" class="px-4 pb-4">
        <p class="mb-1 text-sm text-ink-gray-5">{{ __('Linked records') }}</p>
        <ul class="flex flex-wrap gap-2">
          <li v-for="link in item.links" :key="link.doctype + link.name">
            <a
              class="inline-flex min-h-9 items-center gap-1.5 rounded border border-outline-gray-2 px-2.5 text-sm text-ink-gray-8 hover:bg-surface-gray-1"
              :href="recordHref(link.doctype, link.name)"
              ><FeatherIcon name="link-2" class="h-3.5 w-3.5" />{{
                link.title || link.name
              }}</a
            >
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Badge, Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import ArchivoGuard from '@/components/archivos/ArchivoGuard.vue'
import CfdiCard from '@/components/archivos/CfdiCard.vue'
import {
  ACCEPT,
  BROWSE,
  MANAGE,
  archivosApi,
  browseKindLabel,
  canManageItem,
  channelLabel,
  fileLink,
  formatBytes,
  formatDay,
  isDocumentItem,
  parseCsv,
  prettyXml,
  previewIcon,
  problem,
  readBase64,
  recordHref,
  statusLabel,
  statusTheme,
  uploadName,
  uploadProblem,
  whereLabel,
} from '@/composables/useArchivos'

// One file, up close: what it looks like, what it is and what I can do with it.
const props = defineProps({
  company: { type: String, required: true },
  id: { type: String, required: true },
  view: { type: String, default: 'recientes' },
  currentKey: { type: String, default: '' },
  limitMb: { type: Number, default: 10 },
  locale: { type: String, default: undefined },
  // F2 in the list opens the file already asking for its new name.
  autoRename: { type: Boolean, default: false },
})
const cfdi = ref(null)
const emit = defineEmits([
  'close',
  'changed',
  'move',
  'classify',
  'open-id',
  'redirect',
])

const TEXT_LIMIT = 200 * 1024
const item = ref(null),
  loading = ref(false),
  problemState = ref(null),
  actionProblem = ref(null),
  busy = ref(''),
  zoomed = ref(false),
  text = ref(''),
  textProblem = ref(''),
  truncated = ref(false),
  renaming = ref(false),
  newTitle = ref(''),
  showVersions = ref(false),
  versions = ref([]),
  versionsLoading = ref(false)

const isCsv = computed(
  () =>
    /\.csv$/i.test(item.value?.file_name || '') ||
    item.value?.media_type === 'text/csv',
)
const csvRows = computed(() => parseCsv(text.value, 200))
const recordLink = computed(() => {
  const record = item.value?.attached_to || item.value?.links?.[0]
  if (!record?.doctype || !record?.name) return null
  return { href: recordHref(record.doctype, record.name) }
})

let seq = 0
async function load() {
  const mine = ++seq
  loading.value = true
  problemState.value = null
  actionProblem.value = null
  renaming.value = false
  showVersions.value = false
  zoomed.value = false
  text.value = ''
  textProblem.value = ''
  truncated.value = false
  try {
    const data = await archivosApi(`${BROWSE}.file`, {
      company: props.company,
      id: props.id,
    })
    if (mine !== seq) return
    if (data?.redirect) {
      emit('redirect', data.redirect)
      return
    }
    if (!data?.id) {
      // The row is gone (purged, or a version chain that no longer resolves).
      problemState.value = {
        code: 'missing',
        message: __('We could not find this file.'),
        actions: [{ label: __('Back'), kind: 'back' }],
      }
      return
    }
    item.value = data
    if (props.autoRename && canManageItem(data)) startRename()
    if (['text', 'xml'].includes(data?.preview)) loadText(data.file_url, mine)
  } catch (error) {
    if (mine === seq) problemState.value = problem(error)
  } finally {
    if (mine === seq) loading.value = false
  }
}
async function loadText(url, mine) {
  if (!url) return
  try {
    const response = await fetch(url, { credentials: 'same-origin' })
    if (!response.ok) throw new Error(String(response.status))
    const body = await response.text()
    if (mine !== seq) return
    truncated.value = body.length > TEXT_LIMIT
    text.value = body.slice(0, TEXT_LIMIT)
  } catch {
    if (mine === seq)
      textProblem.value = __(
        'We could not read this file. Download it to open it.',
      )
  }
}
watch(() => [props.company, props.id], load, { immediate: true })
// F2 on a file already open asks for the new name without reloading it.
watch(
  () => props.autoRename,
  (wanted) => {
    if (wanted && canManageItem(item.value)) startRename()
  },
)

function onGuard(action) {
  if (action.kind === 'retry') load()
  else emit('close')
}
async function run(kind, method, args, done) {
  busy.value = kind
  actionProblem.value = null
  try {
    const result = await archivosApi(method, args)
    await done?.(result)
    emit('changed')
  } catch (error) {
    actionProblem.value = problem(error)
  } finally {
    busy.value = ''
  }
}

/** The document's current `modified`, which every classify write must carry. */
async function stamp(name) {
  const detail = await archivosApi('detail', { name })
  return detail?.modified
}

function startRename() {
  newTitle.value = item.value?.title || ''
  renaming.value = true
}
async function saveRename() {
  const name = item.value?.name,
    title = newTitle.value.trim()
  if (!name || !title) return
  busy.value = 'rename'
  actionProblem.value = null
  try {
    // Renaming is a classify write: it needs the stamp the server last saw, so
    // a teammate's change is refused instead of silently overwritten.
    const expected = await stamp(name)
    await archivosApi('classify', {
      name,
      values: { title },
      expected_modified: expected,
    })
    renaming.value = false
    toast.success(__('Renamed'))
    await load()
    emit('changed')
  } catch (error) {
    actionProblem.value = problem(error)
  } finally {
    busy.value = ''
  }
}
async function share() {
  const name = item.value?.name
  if (!name) return
  busy.value = 'share'
  actionProblem.value = null
  try {
    const expected = await stamp(name)
    await archivosApi('classify', {
      name,
      values: { visibility: 'Company' },
      expected_modified: expected,
    })
    toast.success(__('Now everyone in the company can see it.'))
    await load()
    emit('changed')
  } catch (error) {
    actionProblem.value = problem(error)
  } finally {
    busy.value = ''
  }
}
async function copyLink() {
  const link = fileLink(props.id, { view: props.view, key: props.currentKey })
  try {
    await navigator.clipboard.writeText(link)
    toast.success(__('Link copied'))
  } catch {
    actionProblem.value = {
      code: 'clipboard',
      message: link,
      actions: [{ label: __('Close'), kind: 'dismiss' }],
    }
  }
}
function trash() {
  run(
    'trash',
    `${MANAGE}.trash_documents`,
    { names: [item.value.name] },
    () => {
      toast.success(__('Sent to the trash'))
      return load()
    },
  )
}
function restore() {
  run(
    'restore',
    `${MANAGE}.restore_documents`,
    { names: [item.value.name] },
    () => {
      toast.success(__('Restored'))
      return load()
    },
  )
}
function promote() {
  run(
    'promote',
    `${MANAGE}.promote`,
    { company: props.company, file: item.value.name, visibility: 'Company' },
    (result) => {
      toast.success(__('Saved to Archivos'))
      if (result?.id) emit('open-id', result.id)
    },
  )
}

async function loadVersions() {
  versionsLoading.value = true
  try {
    versions.value = await archivosApi(`${MANAGE}.versions`, {
      name: item.value.name,
    })
  } catch (error) {
    actionProblem.value = problem(error)
  } finally {
    versionsLoading.value = false
  }
}
function toggleVersions() {
  showVersions.value = !showVersions.value
  if (showVersions.value && !versions.value.length) loadVersions()
}
async function pickVersion(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const bad = uploadProblem(file, props.limitMb)
  if (bad) {
    actionProblem.value = {
      code: 'file',
      message: bad,
      actions: [{ label: __('Close'), kind: 'dismiss' }],
    }
    return
  }
  busy.value = 'version'
  actionProblem.value = null
  try {
    await archivosApi(`${MANAGE}.receive`, {
      company: props.company,
      filename: uploadName(file),
      content: await readBase64(file),
      visibility: item.value?.visibility || 'Private',
      version_of: item.value.name,
    })
    toast.success(__('New version saved'))
    versions.value = []
    await load()
    showVersions.value = true
    await loadVersions()
    emit('changed')
  } catch (error) {
    actionProblem.value = problem(error)
  } finally {
    busy.value = ''
  }
}

defineExpose({ reload: load })
</script>
