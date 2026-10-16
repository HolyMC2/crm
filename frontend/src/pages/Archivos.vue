<template>
  <div v-if="!boot" class="space-y-3 p-6" aria-busy="true">
    <div class="h-6 w-40 animate-pulse rounded bg-surface-gray-2" />
    <div class="h-14 animate-pulse rounded bg-surface-gray-2" />
    <div class="h-14 animate-pulse rounded bg-surface-gray-2" />
  </div>
  <section
    v-else-if="!boot.enabled"
    class="mx-auto w-full max-w-xl space-y-4 p-6"
    role="alert"
  >
    <h1 class="text-xl font-semibold text-ink-gray-9">
      {{ __('We could not open Archivos') }}
    </h1>
    <p class="text-base text-ink-gray-7">
      {{
        boot.reason ||
        __(
          'We could not check your permissions. Try again or ask your manager for access.',
        )
      }}
    </p>
    <ArchivoGuard
      :state="{
        code: 'permission',
        message: __(
          'Archivos needs read access to at least one company and its documents.',
        ),
        actions: [
          { label: __('Retry permissions'), kind: 'retry' },
          { label: __('Ask for access'), kind: 'copy' },
          { label: __('Back'), kind: 'back' },
        ],
      }"
      :copy-text="
        __(
          'I need access to Archivos in Muelle (documents of my company) to receive and classify receipts.',
        )
      "
      @action="onPageGuard"
    />
  </section>
  <ModuleLayout
    v-else
    title="Archivos"
    :entries="[]"
    :active-key="view"
    @select="(value) => go({ view: value })"
  >
    <template #sidebar>
      <ArchivosNav
        :view="view"
        :current-key="browseState.key"
        :counts="counts"
        :summary="summary"
        :folders="folders"
        @select="go"
        @new-folder="openNewFolder"
        @folder-action="onFolderAction"
        @move-to="onMoveTo"
      />
      <div
        v-if="boot.can_configure"
        class="mt-6 border-t border-outline-gray-2 px-3 pt-4 text-sm"
      >
        <router-link
          :to="{
            name: 'ArchivosConectores',
            query: company ? { company } : {},
          }"
          class="flex min-h-11 items-center gap-2 text-ink-gray-6 hover:text-ink-gray-8"
          :title="
            __(
              'Connect your Paperless archive and your invoice mailbox, check that they work and run the initial import.',
            )
          "
          ><FeatherIcon name="settings" class="h-4 w-4 shrink-0" />{{
            __('Archive settings')
          }}</router-link
        >
      </div>
    </template>
    <div
      class="relative flex min-h-0 flex-1 flex-col"
      @dragenter="onPageDrag"
      @dragover="onPageDrag"
    >
      <!-- A file dragged anywhere on the page is received, not opened by the browser -->
      <div
        v-if="pageDragging"
        class="absolute inset-0 z-20 flex items-center justify-center bg-surface-base p-6"
        @dragover.prevent
        @dragleave.self="pageDragging = false"
        @drop.prevent="onPageDrop"
      >
        <div
          class="pointer-events-none flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-outline-gray-5 px-10 py-12 text-center"
        >
          <FeatherIcon name="upload-cloud" class="h-8 w-8 text-ink-gray-7" />
          <p class="text-lg font-semibold text-ink-gray-9">
            {{
              targetCtx?.supported
                ? __('Drop to receive for {0}', [
                    targetCtx.title || target?.name,
                  ])
                : openFolderTitle
                  ? __('Drop to file it in {0}', [openFolderTitle])
                  : __('Drop to receive it in {0}', [company])
            }}
          </p>
          <p class="text-sm text-ink-gray-6">
            {{ __('You choose who can see it before sending.') }}
          </p>
        </div>
      </div>
      <a
        v-if="returnTo"
        :href="returnTo"
        class="flex min-h-11 shrink-0 items-center gap-2 border-b border-outline-gray-2 px-4 text-sm text-ink-gray-7 hover:bg-surface-gray-1"
        ><FeatherIcon name="arrow-left" class="h-4 w-4" />{{
          __('Back to {0}', [returnLabel || __('the previous record')])
        }}</a
      >
      <div
        class="shrink-0 gap-2 border-b border-outline-gray-2 p-3 sm:hidden"
        :class="documentName || fileId ? 'hidden' : 'grid'"
      >
        <ArchivosNav
          mobile
          :view="view"
          :current-key="browseState.key"
          :counts="counts"
          :summary="summary"
          :folders="folders"
          @select="go"
        />
      </div>
      <div
        v-if="boot.companies.length > 1"
        class="shrink-0 border-b border-outline-gray-2 px-3 py-2"
      >
        <FormControl
          class="h-11 sm:h-auto"
          type="select"
          :aria-label="__('Company')"
          :model-value="company"
          :options="boot.companies.map((c) => ({ value: c, label: c }))"
          @update:model-value="selectCompany"
        />
      </div>

      <!-- Explorar: the file manager -->
      <div v-if="browsing" class="flex min-h-0 flex-1">
        <div
          class="flex min-h-0 w-full flex-col border-outline-gray-2 lg:w-[560px] lg:shrink-0 lg:border-r"
          :class="fileId ? 'hidden lg:flex' : 'flex'"
        >
          <ArchivoUpload
            v-if="uploadOpen"
            class="m-3"
            :company="company"
            :folder="openFolder"
            :limit-mb="boot.upload_limit_mb || 10"
            :initial-file="droppedFile"
            @received="onReceived"
            @cancel="closeUpload"
          />
          <ArchivosBrowser
            ref="browser"
            :view="view"
            :current-key="browseState.key"
            :q="browseState.q"
            :kind="browseState.kind"
            :channel="browseState.channel"
            :month="browseState.month"
            :sort="browseState.sort"
            :data="browseData"
            :loading="browseLoading"
            :problem-state="browseProblem"
            :active-id="fileId"
            :locale="locale"
            @navigate="go"
            @patch="onFilter"
            @open="(item) => patch({ file: item.id })"
            @more="loadBrowse({ more: true })"
            @retry="loadBrowse()"
            @move="(items) => askMove(docNames(items))"
            @trash="(items) => askTrash(docNames(items))"
            @restore="(items) => doRestore(docNames(items))"
            @download="download"
            @upload="openUpload"
            @new-folder="openNewFolder"
            @folder-action="onFolderAction"
            @move-to="onMoveTo"
            @rename="askRename"
          />
        </div>
        <section
          class="min-h-0 min-w-0 flex-1 flex-col"
          :class="fileId ? 'flex' : 'hidden lg:flex'"
        >
          <ArchivoPreview
            v-if="fileId"
            :id="fileId"
            :key="`${fileId}:${previewVersion}`"
            :company="company"
            :view="view"
            :current-key="browseState.key"
            :limit-mb="boot.upload_limit_mb || 10"
            :locale="locale"
            :auto-rename="renameWanted === fileId"
            @close="patch({ file: undefined })"
            @changed="afterWrite"
            @move="(item) => askMove(docNames([item]))"
            @classify="openInBandeja"
            @open-id="(id) => patch({ file: id })"
            @redirect="(id) => patch({ file: id })"
          />
          <div
            v-else
            class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
          >
            <FeatherIcon name="folder" class="h-10 w-10 text-ink-gray-4" />
            <p class="text-base text-ink-gray-7">
              {{ __('Pick a file to see it here.') }}
            </p>
          </div>
        </section>
      </div>

      <!-- Bandeja: the intake queue -->
      <div v-else class="flex min-h-0 flex-1">
        <section
          class="flex min-h-0 w-full flex-col border-outline-gray-2 lg:w-[420px] lg:shrink-0 lg:border-r"
          :class="documentName ? 'hidden lg:flex' : 'flex'"
          :aria-label="viewLabel(view)"
        >
          <div class="shrink-0 space-y-3 p-4">
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <h1 class="text-xl font-semibold text-ink-gray-9">
                  {{ viewLabel(view) }}
                </h1>
                <p class="text-sm text-ink-gray-6">
                  {{ viewHint(view) }}
                </p>
              </div>
              <Button
                variant="solid"
                class="min-h-11 shrink-0 sm:min-h-0"
                :icon-left="uploadOpen ? 'x' : 'upload'"
                :label="uploadOpen ? __('Close') : __('Receive')"
                :aria-expanded="uploadOpen ? 'true' : 'false'"
                @click="toggleUpload"
              />
            </div>
            <div
              v-if="target"
              class="space-y-2 rounded-lg border border-outline-gray-2 bg-surface-gray-1 p-3"
            >
              <div class="flex items-center gap-2">
                <p class="min-w-0 flex-1 text-sm text-ink-gray-8">
                  <template v-if="targetCtx"
                    >{{ __('For {0}', [doctypeLabel(target.doctype)]) }}
                    <strong>{{
                      targetCtx.title || target.name
                    }}</strong></template
                  >
                  <template v-else>{{ __('Checking the record…') }}</template>
                </p>
                <Button
                  variant="ghost"
                  class="min-h-11 sm:min-h-0"
                  :label="__('Remove record')"
                  @click="clearTarget"
                />
              </div>
              <ArchivoGuard
                v-if="targetProblem"
                :state="targetProblem"
                @action="onTargetGuard"
              />
              <ArchivosRegistroPanel
                v-else-if="targetCtx"
                :doctype="target.doctype"
                :name="target.name"
                :return-to="returnTo"
                :return-label="returnLabel"
              />
            </div>
            <ArchivoUpload
              v-if="uploadOpen"
              :company="company"
              :target="targetCtx?.supported ? targetCtx : null"
              :limit-mb="boot.upload_limit_mb || 10"
              :initial-file="droppedFile"
              @received="onReceived"
              @cancel="closeUpload"
            />
            <FormControl
              v-if="!fiscalView"
              v-model="q"
              data-list-search
              class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
              type="text"
              :placeholder="__('Search title, issuer, tag or text')"
              :aria-label="__('Search files')"
              enterkeyhint="search"
            />
          </div>

          <!-- Huecos fiscales: its own queue; a document opens on the right -->
          <HuecosFiscales
            v-if="fiscalView"
            class="min-h-0 flex-1"
            :company="company"
            :kind="gapsKind"
            :return-to="gapsReturn"
            :heading="false"
            @kind-change="(kind) => patch({ kind })"
            @open-document="open"
          />
          <div v-else class="min-h-0 flex-1 overflow-y-auto">
            <div
              v-if="listLoading && !rows.length"
              class="space-y-2 px-4"
              aria-hidden="true"
            >
              <div
                v-for="n in 6"
                :key="n"
                class="h-14 animate-pulse rounded bg-surface-gray-2"
              />
            </div>
            <div v-else-if="listProblem" class="px-4">
              <ArchivoGuard :state="listProblem" @action="loadList()" />
            </div>
            <div v-else-if="!rows.length" class="px-6 py-10 text-center">
              <FeatherIcon
                :name="emptyState.icon"
                class="mx-auto h-10 w-10 text-ink-gray-4"
              />
              <p class="mt-3 text-base font-medium text-ink-gray-8">
                {{ emptyState.title }}
              </p>
              <p class="mt-1 text-sm text-ink-gray-6">{{ emptyState.body }}</p>
              <div class="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  v-if="q"
                  class="min-h-11 sm:min-h-0"
                  :label="__('Clear search')"
                  @click="q = ''"
                />
                <Button
                  v-else-if="view === 'por_clasificar'"
                  variant="solid"
                  class="min-h-11 sm:min-h-0"
                  :label="__('Receive file')"
                  @click="openUpload"
                />
                <a
                  v-if="returnTo && lastDone"
                  :href="
                    withDone(returnTo, lastDone.doctype, lastDone.reference) ||
                    returnTo
                  "
                  class="inline-flex min-h-11 items-center rounded border border-outline-gray-2 px-4 text-base text-ink-gray-8 sm:min-h-8"
                  >{{
                    __('Back to {0}', [
                      returnLabel || __('the previous record'),
                    ])
                  }}</a
                >
              </div>
              <!-- Phones have no second pane: explain the app under the empty queue -->
              <ArchivosOverview
                v-if="view === 'por_clasificar' && !q"
                class="mt-6 border-t border-outline-gray-2 !p-0 !pt-6 text-left lg:hidden"
                :company="company"
                :counts="counts"
                :limit-mb="boot.upload_limit_mb || 10"
                @view="(value) => go({ view: value })"
                @file="receiveFile"
              />
            </div>
            <ul
              v-else
              class="divide-y divide-outline-gray-1"
              :aria-label="viewLabel(view)"
            >
              <li v-for="row in rows" :key="row.name">
                <button
                  type="button"
                  data-key-row
                  class="flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-outline-gray-4"
                  :class="row.name === documentName ? 'bg-surface-gray-2' : ''"
                  :aria-current="row.name === documentName ? 'true' : undefined"
                  :data-row-current="row.name === documentName || undefined"
                  @click="open(row.name)"
                >
                  <span
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-gray-2"
                    :title="kindLabel(row.document_kind)"
                  >
                    <FeatherIcon
                      :name="kindIcon(row.document_kind)"
                      class="h-4 w-4 text-ink-gray-6"
                    />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-1.5">
                      <span
                        class="truncate text-base font-medium text-ink-gray-9"
                        >{{ row.title }}</span
                      >
                      <FeatherIcon
                        v-if="row.visibility === 'Private'"
                        name="lock"
                        class="h-3 w-3 shrink-0 text-ink-gray-5"
                        :aria-label="__('Only you can see it')"
                      />
                    </span>
                    <span class="block truncate text-sm text-ink-gray-6">{{
                      [
                        row.counterparty || kindLabel(row.document_kind),
                        row.document_date
                          ? formatDay(row.document_date, locale)
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    }}</span>
                  </span>
                  <span class="flex shrink-0 flex-col items-end gap-1">
                    <Badge
                      v-if="row.assigned_to_me"
                      theme="blue"
                      :label="__('Yours to review')"
                    />
                    <Badge
                      v-else-if="view !== 'por_clasificar'"
                      :theme="statusTheme(row.status)"
                      :label="statusLabel(row.status)"
                    />
                    <span
                      class="text-xs text-ink-gray-5"
                      :title="formatDay(row.modified, locale)"
                      >{{ ageLabel(row.modified, locale) }}</span
                    >
                  </span>
                </button>
              </li>
            </ul>
            <div v-if="hasMore" class="p-4">
              <Button
                class="min-h-11 w-full sm:min-h-0"
                :label="__('Load more')"
                :loading="listLoading"
                @click="loadList({ more: true })"
              />
            </div>
          </div>
        </section>

        <!-- Record -->
        <section
          class="min-h-0 min-w-0 flex-1 flex-col"
          :class="documentName ? 'flex' : 'hidden lg:flex'"
        >
          <ArchivoDetail
            v-if="documentName"
            :key="documentName"
            :name="documentName"
            :boot="boot"
            :target="targetCtx"
            @close="closeDocument"
            @done="onDone"
            @updated="onUpdated"
            @clear-target="clearTarget"
          />
          <div v-else class="min-h-0 flex-1 overflow-y-auto">
            <ArchivosOverview
              :company="company"
              :counts="counts"
              :limit-mb="boot.upload_limit_mb || 10"
              @view="(value) => go({ view: value })"
              @file="receiveFile"
            />
          </div>
        </section>
      </div>
    </div>

    <MoveDialog
      v-model:open="moveState.open"
      :folders="folders"
      :current="moveState.current"
      :blocked="moveState.blocked"
      :title="moveState.title"
      :busy="moveState.busy"
      :error-text="moveState.error"
      @choose="onMoveChosen"
    />
    <FolderDialog
      v-model:open="folderState.open"
      :mode="folderState.mode"
      :folder="folderState.folder"
      :busy="folderState.busy"
      :error-text="folderState.error"
      @submit="onFolderSubmit"
    />
    <Dialog v-model="confirmState.open" :title="confirmState.title" size="sm">
      <template #default>
        <p class="text-base text-ink-gray-7">{{ confirmState.body }}</p>
      </template>
      <template #actions>
        <div class="flex justify-end gap-2">
          <Button :label="__('Cancel')" @click="confirmState.open = false" />
          <Button
            variant="solid"
            theme="red"
            :label="confirmState.confirm"
            @click="runConfirm"
          />
        </div>
      </template>
    </Dialog>
  </ModuleLayout>
</template>
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import {
  Badge,
  Button,
  Dialog,
  FeatherIcon,
  FormControl,
  toast,
} from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import { useListKeys } from '@/composables/pageKeys'
import ArchivoDetail from '@/components/archivos/ArchivoDetail.vue'
import ArchivoGuard from '@/components/archivos/ArchivoGuard.vue'
import ArchivoPreview from '@/components/archivos/ArchivoPreview.vue'
import ArchivoUpload from '@/components/archivos/ArchivoUpload.vue'
import ArchivosBrowser from '@/components/archivos/ArchivosBrowser.vue'
import ArchivosNav from '@/components/archivos/ArchivosNav.vue'
import ArchivosOverview from '@/components/archivos/ArchivosOverview.vue'
import ArchivosRegistroPanel from '@/components/archivos/ArchivosRegistroPanel.vue'
import FolderDialog from '@/components/archivos/FolderDialog.vue'
import HuecosFiscales from '@/components/archivos/HuecosFiscales.vue'
import MoveDialog from '@/components/archivos/MoveDialog.vue'
import {
  BROWSE,
  MANAGE,
  ageLabel,
  archivosApi,
  archivosBoot as boot,
  canManageItem,
  doctypeLabel,
  folderLine,
  formatDay,
  isBrowseView,
  kindIcon,
  kindLabel,
  loadArchivosBoot,
  nextAfter,
  normalizeView,
  parseBrowseState,
  parseTarget,
  problem,
  safeReturn,
  statusLabel,
  statusTheme,
  viewHint,
  viewLabel,
  withDone,
} from '@/composables/useArchivos'

const route = useRoute(),
  router = useRouter()
const locale =
  (window.lang || document.documentElement.lang || '').replace('_', '-') ||
  undefined

// URL is state: view, key, search, filters, company, open file or document.
const view = computed(() => normalizeView(route.query.view))
const browsing = computed(() => isBrowseView(view.value))
const browseState = computed(() => parseBrowseState(route.query))
const fileId = computed(() => (browsing.value ? browseState.value.file : ''))
const documentName = computed(() => String(route.query.document || ''))
const target = computed(() => parseTarget(String(route.query.target || '')))
const returnTo = computed(() => safeReturn(String(route.query.return_to || '')))
const returnLabel = computed(() =>
  String(route.query.return_label || '').slice(0, 40),
)
// «Huecos fiscales»: the kind is in the URL; its steps come back to it.
const fiscalView = computed(() => view.value === 'huecos_fiscales')
const gapsKind = computed(() => String(route.query.kind || ''))
const gapsReturn = computed(() => {
  const params = new URLSearchParams({ view: 'huecos_fiscales' })
  if (gapsKind.value) params.set('kind', gapsKind.value)
  if (route.query.company) params.set('company', String(route.query.company))
  return `/crm/archivos?${params.toString()}`
})
// Keyboard standard: search, j/k rows, Enter opens beside the list, c receives
// a file, Esc closes the open file or document (Explorar adds its own keys).
useListKeys({
  page: 'archivos',
  search: true,
  rows: true,
  open: true,
  create: () => {
    uploadOpen.value = true
  },
  close: () => {
    if (fileId.value) return void patch({ file: undefined })
    if (!documentName.value) return false
    closeDocument()
  },
})
const company = computed(
  () =>
    String(route.query.company || '') ||
    targetCtx.value?.company ||
    boot.value?.company ||
    '',
)
const q = ref(String(route.query.q || ''))

const rows = ref([]),
  counts = ref({}),
  page = ref(1),
  hasMore = ref(false),
  listLoading = ref(false),
  listProblem = ref(null),
  uploadOpen = ref(false),
  targetCtx = ref(null),
  targetProblem = ref(null),
  lastDone = ref(null),
  pageDragging = ref(false),
  droppedFile = ref(null)

// Browse state: the folder tree, the counts and one page of files.
const folders = ref([]),
  summary = ref(null),
  browseData = ref(null),
  browseLoading = ref(false),
  browseProblem = ref(null),
  browsePage = ref(1),
  browser = ref(null)

const openFolder = computed(() =>
  view.value === 'carpeta' ? browseState.value.key : '',
)
const openFolderTitle = computed(
  () => folders.value.find((f) => f.name === openFolder.value)?.title || '',
)

// Receiving: the header button, the empty queue, the overview and a file
// dropped anywhere on the page all open the same intake panel.
function openUpload() {
  uploadOpen.value = true
}
function closeUpload() {
  uploadOpen.value = false
  droppedFile.value = null
}
function toggleUpload() {
  if (uploadOpen.value) closeUpload()
  else openUpload()
}
function receiveFile(file) {
  droppedFile.value = file
  // On a phone only one pane shows: bring back the list, where intake lives.
  const wide = window.matchMedia?.('(min-width: 1024px)').matches
  if (!wide && (documentName.value || fileId.value))
    patch({ document: undefined, file: undefined })
  openUpload()
}
function hasFiles(event) {
  return [...(event.dataTransfer?.types || [])].includes('Files')
}
function onPageDrag(event) {
  if (!hasFiles(event)) return
  event.preventDefault()
  pageDragging.value = true
}
function onPageDrop(event) {
  pageDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) receiveFile(file)
}
const emptyState = computed(() => {
  if (q.value)
    return {
      icon: 'search',
      title: __('No file matches «{0}»', [q.value]),
      body: __('Try the issuer, a tag or part of the text.'),
    }
  if (view.value === 'ayuda')
    return {
      icon: 'check-circle',
      title: __('Nothing needs attention'),
      body: __(
        'Files that could not be read or processed show up here with what to do.',
      ),
    }
  return {
    icon: 'inbox',
    title: lastDone.value ? __('All classified') : __('Nothing to classify'),
    body: __(
      'When you receive an invoice, receipt or contract it shows up here until you link it to its operation.',
    ),
  }
})

const STICKY = ['company', 'target', 'return_to', 'return_label']
function patch(query) {
  const next = { ...route.query, ...query }
  for (const key of Object.keys(next))
    if (next[key] === undefined || next[key] === '') delete next[key]
  return router.replace({ query: next })
}
/** Change list: a new view or key starts clean, keeping only what follows us. */
function go({ view: value, key = '' }) {
  const next = {}
  for (const name of STICKY)
    if (route.query[name]) next[name] = route.query[name]
  if (value && value !== 'por_clasificar') next.view = value
  if (key) next.key = key
  q.value = ''
  router.push({ query: next })
}
function onFilter(patchValues) {
  patch({ ...patchValues, file: undefined })
}
function selectCompany(value) {
  patch({ company: value, document: undefined, file: undefined })
}
function open(name) {
  router.push({ query: { ...route.query, document: name } })
}
function closeDocument() {
  patch({ document: undefined })
}
function clearTarget() {
  targetCtx.value = null
  targetProblem.value = null
  patch({ target: undefined })
}
/** A browse document continues in the Bandeja, where classifying lives. */
function openInBandeja(name) {
  router.push({
    query: {
      ...route.query,
      view: undefined,
      key: undefined,
      file: undefined,
      document: name,
    },
  })
}

let requestSeq = 0
async function loadList({ more = false } = {}) {
  if (!company.value || browsing.value || fiscalView.value) return
  const seq = ++requestSeq
  listLoading.value = true
  listProblem.value = null
  try {
    const data = await archivosApi('queue', {
      view: view.value,
      company: company.value,
      query: q.value,
      page: more ? page.value + 1 : 1,
    })
    if (seq !== requestSeq) return
    rows.value = more ? [...rows.value, ...data.documents] : data.documents
    page.value = data.page
    hasMore.value = data.has_more
    counts.value = data.counts
  } catch (error) {
    if (seq === requestSeq) listProblem.value = problem(error)
  } finally {
    if (seq === requestSeq) listLoading.value = false
  }
}
const debouncedSearch = useDebounceFn(() => {
  patch({ q: q.value || undefined })
  loadList()
}, 250)
watch(q, debouncedSearch)

let browseSeq = 0
async function loadBrowse({ more = false } = {}) {
  if (!company.value || !browsing.value) return
  const state = browseState.value
  const seq = ++browseSeq
  browseLoading.value = true
  browseProblem.value = null
  try {
    const data = await archivosApi(`${BROWSE}.files`, {
      company: company.value,
      view: state.view,
      key: state.key || undefined,
      query: state.q,
      kind: state.kind || undefined,
      channel: state.channel || undefined,
      month: state.month || undefined,
      page: more ? browsePage.value + 1 : 1,
      page_size: 50,
      sort: state.sort,
    })
    if (seq !== browseSeq) return
    if (more && browseData.value)
      data.items = [...(browseData.value.items || []), ...(data.items || [])]
    browseData.value = data
    browsePage.value = data.page || 1
  } catch (error) {
    if (seq === browseSeq) browseProblem.value = problem(error)
  } finally {
    if (seq === browseSeq) browseLoading.value = false
  }
}
async function loadFolders() {
  if (!company.value) return
  try {
    const data = await archivosApi(`${BROWSE}.folders`, {
      company: company.value,
    })
    folders.value = data?.folders || []
  } catch {
    // The tree is a convenience: a refusal must not take down the page.
    folders.value = []
  }
}
async function loadSummary() {
  if (!company.value) return
  try {
    summary.value = await archivosApi(`${BROWSE}.summary`, {
      company: company.value,
    })
  } catch {
    summary.value = null
  }
}

watch(
  () => [
    view.value,
    browseState.value.key,
    browseState.value.q,
    browseState.value.kind,
    browseState.value.channel,
    browseState.value.month,
    browseState.value.sort,
    company.value,
  ],
  () => {
    if (browsing.value) loadBrowse()
    else loadList()
  },
)
watch(company, () => {
  loadFolders()
  loadSummary()
})

async function loadTarget() {
  targetCtx.value = null
  targetProblem.value = null
  if (!target.value) return
  try {
    targetCtx.value = await archivosApi('target_context', {
      reference_doctype: target.value.doctype,
      reference_name: target.value.name,
    })
    if (!targetCtx.value.supported)
      targetProblem.value = {
        code: 'unsupported_target',
        message: __(
          'This kind of record does not take receipts from Archivos yet. You can still receive the file and link it to a supported record.',
        ),
        actions: [
          { label: __('Receive without a record'), kind: 'clear_target' },
        ],
      }
    else uploadOpen.value = !documentName.value
  } catch (error) {
    targetProblem.value = problem(error)
  }
}
watch(target, loadTarget)
function onTargetGuard(action) {
  if (action.kind === 'clear_target') clearTarget()
  else if (action.kind === 'retry') loadTarget()
}

function onReceived(detail, { pending = false } = {}) {
  if (pending) {
    // Another file was chosen while this one was sending: keep the intake open
    // on the list so it can be sent too.
    toast.success(__('File received. Send the next one when ready.'))
    refresh()
    return
  }
  closeUpload()
  toast.success(__('File received'))
  if (browsing.value) {
    patch({ file: detail.id || 'doc:' + detail.name })
    refresh()
    return
  }
  patch({
    company:
      detail.company && detail.company !== company.value
        ? detail.company
        : route.query.company,
    view: undefined,
    document: detail.name,
  })
  loadList()
}
function onUpdated(detail) {
  const index = rows.value.findIndex((r) => r.name === detail.name)
  if (index >= 0) rows.value[index] = { ...rows.value[index], ...detail }
}
function onDone(event) {
  lastDone.value = event
  // Record-origin work ends where it started, telling the caller what was done.
  if (
    returnTo.value &&
    event.outcome === 'linked' &&
    target.value &&
    event.doctype === target.value.doctype &&
    event.reference === target.value.name
  ) {
    toast.success(
      __('Linked. Returning to {0}', [returnLabel.value || event.reference]),
    )
    window.location.assign(
      withDone(returnTo.value, event.doctype, event.reference),
    )
    return
  }
  const next =
    view.value === 'por_clasificar' ? nextAfter(rows.value, event.name) : ''
  if (view.value === 'por_clasificar') {
    rows.value = rows.value.filter((r) => r.name !== event.name)
    counts.value = {
      ...counts.value,
      por_clasificar: Math.max(0, (counts.value.por_clasificar || 1) - 1),
    }
  }
  toast.success(
    event.outcome === 'linked' ? __('Linked') : __('Filed without linking'),
  )
  patch({ document: next || undefined })
  loadList()
}

// ------------------------------------------------------------- file manager
function docNames(items = []) {
  return items.filter(canManageItem).map((item) => item.name)
}
function refresh() {
  if (browsing.value) loadBrowse()
  else loadList()
}
// A write (move, trash, share, new version) re-reads the open file too: the pane
// must show where the file is now, not where it was.
const previewVersion = ref(0)
function afterWrite() {
  previewVersion.value++
  refresh()
  loadFolders()
  loadSummary()
}
// F2 opens the file and asks for its new name in one step.
const renameWanted = ref('')
function askRename(item) {
  renameWanted.value = item.id
  patch({ file: item.id })
}
watch(fileId, (id) => {
  if (renameWanted.value && renameWanted.value !== id) renameWanted.value = ''
})
function download(items = []) {
  for (const item of items)
    if (item.file_url) window.open(item.file_url, '_blank', 'noopener')
}

const moveState = reactive({
  open: false,
  names: [],
  folderName: '',
  current: '',
  blocked: [],
  title: '',
  busy: false,
  error: '',
})
function askMove(names) {
  if (!names.length) return
  Object.assign(moveState, {
    open: true,
    names,
    folderName: '',
    current: openFolder.value,
    blocked: [],
    title: __('Move to…'),
    busy: false,
    error: '',
  })
}
function askMoveFolder(folder) {
  const inside = descendants(folder.name)
  Object.assign(moveState, {
    open: true,
    names: [],
    folderName: folder.name,
    current: folder.parent_folder || '',
    blocked: [folder.name, ...inside],
    title: __('Move folder'),
    busy: false,
    error: '',
  })
}
/** Every folder below `name`, so a folder is never moved inside itself. */
function descendants(name) {
  return folders.value
    .filter((folder) =>
      folderLine(folders.value, folder.name).some((up) => up.name === name),
    )
    .map((folder) => folder.name)
}
async function onMoveChosen(folder) {
  moveState.busy = true
  moveState.error = ''
  try {
    if (moveState.folderName)
      await archivosApi(`${MANAGE}.move_folder`, {
        name: moveState.folderName,
        parent_folder: folder || undefined,
      })
    else
      await archivosApi(`${MANAGE}.move_documents`, {
        names: moveState.names,
        folder: folder || undefined,
      })
    moveState.open = false
    toast.success(__('Moved'))
    browser.value?.clearSelection?.()
    afterWrite()
  } catch (error) {
    moveState.error = problem(error).message
  } finally {
    moveState.busy = false
  }
}
async function onMoveTo({ folder, names }) {
  try {
    await archivosApi(`${MANAGE}.move_documents`, {
      names,
      folder: folder || undefined,
    })
    toast.success(__('Moved'))
    browser.value?.clearSelection?.()
    afterWrite()
  } catch (error) {
    toast.error(problem(error).message)
  }
}

const folderState = reactive({
  open: false,
  mode: 'create',
  folder: null,
  parent: '',
  busy: false,
  error: '',
})
function openNewFolder(parent = '') {
  Object.assign(folderState, {
    open: true,
    mode: 'create',
    folder: null,
    parent: typeof parent === 'string' ? parent : '',
    busy: false,
    error: '',
  })
}
function onFolderAction({ action, folder }) {
  if (action === 'rename')
    Object.assign(folderState, {
      open: true,
      mode: 'rename',
      folder,
      parent: '',
      busy: false,
      error: '',
    })
  else if (action === 'visibility')
    Object.assign(folderState, {
      open: true,
      mode: 'visibility',
      folder,
      parent: '',
      busy: false,
      error: '',
    })
  else if (action === 'move') askMoveFolder(folder)
  else if (action === 'trash')
    folderWrite('trash_folder', { name: folder.name })
  else if (action === 'restore')
    folderWrite('restore_folder', { name: folder.name })
}
async function folderWrite(method, args) {
  try {
    await archivosApi(`${MANAGE}.${method}`, args)
    toast.success(__('Done'))
    afterWrite()
  } catch (error) {
    toast.error(problem(error).message)
  }
}
async function onFolderSubmit({ mode, title, visibility, roles }) {
  folderState.busy = true
  folderState.error = ''
  try {
    if (mode === 'create')
      await archivosApi(`${MANAGE}.create_folder`, {
        company: company.value,
        title,
        parent_folder: folderState.parent || undefined,
        visibility,
        roles,
      })
    else if (mode === 'rename')
      await archivosApi(`${MANAGE}.rename_folder`, {
        name: folderState.folder.name,
        title,
      })
    else
      await archivosApi(`${MANAGE}.set_folder_visibility`, {
        name: folderState.folder.name,
        visibility,
        roles,
      })
    folderState.open = false
    afterWrite()
  } catch (error) {
    folderState.error = problem(error).message
  } finally {
    folderState.busy = false
  }
}

const confirmState = reactive({
  open: false,
  title: '',
  body: '',
  confirm: '',
  run: null,
})
function askTrash(names) {
  if (!names.length) return
  Object.assign(confirmState, {
    open: true,
    title: __('Send to the trash?'),
    body: __('{0} files go to the trash. Nothing is deleted.', [names.length]),
    confirm: __('Send to trash'),
    run: () => doTrash(names),
  })
}
function runConfirm() {
  const action = confirmState.run
  confirmState.open = false
  action?.()
}
async function doTrash(names) {
  try {
    await archivosApi(`${MANAGE}.trash_documents`, { names })
    toast.success(__('Sent to the trash'))
    browser.value?.clearSelection?.()
    if (names.some((name) => 'doc:' + name === fileId.value))
      patch({ file: undefined })
    afterWrite()
  } catch (error) {
    toast.error(problem(error).message)
  }
}
async function doRestore(names) {
  if (!names.length) return
  try {
    await archivosApi(`${MANAGE}.restore_documents`, { names })
    toast.success(__('Restored'))
    browser.value?.clearSelection?.()
    afterWrite()
  } catch (error) {
    toast.error(problem(error).message)
  }
}

// A recovered permission reopens the record origin and the list, not just the boot.
async function start({ refresh: again = false } = {}) {
  await loadArchivosBoot({ refresh: again })
  if (!boot.value?.enabled) return
  await loadTarget()
  loadFolders()
  loadSummary()
  if (browsing.value) loadBrowse()
  else loadList()
}
function onPageGuard(action) {
  if (action.kind === 'retry') start({ refresh: true })
  if (action.kind === 'back') {
    if (returnTo.value) window.location.assign(returnTo.value)
    else router.back()
  }
}

onMounted(() => start())
</script>
