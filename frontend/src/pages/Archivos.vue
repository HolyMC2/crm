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
    :entries="viewEntries"
    :active-key="view"
    @select="selectView"
  >
    <template #sidebar>
      <div class="mt-6 space-y-2 px-3 text-sm">
        <a
          v-if="boot.can_configure"
          href="/desk/documentos?conectores=1"
          class="flex min-h-11 items-center gap-2 text-ink-gray-6 hover:text-ink-gray-8"
          ><FeatherIcon name="settings" class="h-4 w-4" />{{
            __('Document archive connection')
          }}</a
        >
      </div>
    </template>
    <div class="flex min-h-0 flex-1 flex-col">
      <a
        v-if="returnTo"
        :href="returnTo"
        class="flex min-h-11 shrink-0 items-center gap-2 border-b border-outline-gray-2 px-4 text-sm text-ink-gray-7 hover:bg-surface-gray-1"
        ><FeatherIcon name="arrow-left" class="h-4 w-4" />{{
          __('Back to {0}', [returnLabel || __('the previous record')])
        }}</a
      >
      <div class="flex min-h-0 flex-1">
        <!-- Queue -->
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
                  {{
                    __(
                      'Receive invoices, receipts and contracts; link them to an operation and keep working.',
                    )
                  }}
                </p>
              </div>
              <Button
                variant="solid"
                class="min-h-11 shrink-0 sm:min-h-0"
                icon-left="upload"
                :label="__('Receive')"
                @click="uploadOpen = !uploadOpen"
              />
            </div>
            <div class="grid gap-2 sm:hidden">
              <FormControl
                type="select"
                :aria-label="__('List')"
                :model-value="view"
                :options="
                  viewEntries.map((e) => ({ value: e.value, label: e.label }))
                "
                @update:model-value="selectView"
              />
            </div>
            <FormControl
              v-if="boot.companies.length > 1"
              type="select"
              :aria-label="__('Company')"
              :model-value="company"
              :options="boot.companies.map((c) => ({ value: c, label: c }))"
              @update:model-value="selectCompany"
            />
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
              @received="onReceived"
              @cancel="uploadOpen = false"
            />
            <FormControl
              v-model="q"
              type="text"
              :placeholder="__('Search title, issuer, tag or text')"
              :aria-label="__('Search files')"
              enterkeyhint="search"
            />
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto">
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
                  @click="uploadOpen = true"
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
            </div>
            <ul
              v-else
              class="divide-y divide-outline-gray-1"
              :aria-label="viewLabel(view)"
            >
              <li v-for="row in rows" :key="row.name">
                <button
                  type="button"
                  class="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-outline-gray-4"
                  :class="row.name === documentName ? 'bg-surface-gray-2' : ''"
                  :aria-current="row.name === documentName ? 'true' : undefined"
                  @click="open(row.name)"
                >
                  <FeatherIcon
                    :name="row.visibility === 'Private' ? 'lock' : 'file-text'"
                    :aria-label="
                      row.visibility === 'Private'
                        ? __('Only you can see it')
                        : undefined
                    "
                    class="h-4 w-4 shrink-0 text-ink-gray-5"
                  />
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-base font-medium text-ink-gray-9"
                      >{{ row.title }}</span
                    >
                    <span class="block truncate text-sm text-ink-gray-6">{{
                      [
                        kindLabel(row.document_kind),
                        row.counterparty,
                        formatDay(row.document_date || row.modified, locale),
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    }}</span>
                  </span>
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
          <div
            v-else
            class="m-auto max-w-sm p-6 text-center text-sm text-ink-gray-6"
          >
            {{
              __('Choose a file from the list to see the original and link it.')
            }}
          </div>
        </section>
      </div>
    </div>
  </ModuleLayout>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { Badge, Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import ArchivoDetail from '@/components/archivos/ArchivoDetail.vue'
import ArchivoGuard from '@/components/archivos/ArchivoGuard.vue'
import ArchivoUpload from '@/components/archivos/ArchivoUpload.vue'
import ArchivosRegistroPanel from '@/components/archivos/ArchivosRegistroPanel.vue'
import {
  VIEWS,
  archivosApi,
  archivosBoot as boot,
  doctypeLabel,
  formatDay,
  kindLabel,
  loadArchivosBoot,
  nextAfter,
  normalizeView,
  parseTarget,
  problem,
  safeReturn,
  statusLabel,
  statusTheme,
  viewLabel,
  withDone,
} from '@/composables/useArchivos'

const route = useRoute(),
  router = useRouter()
const locale =
  (window.lang || document.documentElement.lang || '').replace('_', '-') ||
  undefined

// URL is state: view, search, company, open document, record target and return.
const view = computed(() => normalizeView(route.query.view))
const documentName = computed(() => String(route.query.document || ''))
const target = computed(() => parseTarget(String(route.query.target || '')))
const returnTo = computed(() => safeReturn(String(route.query.return_to || '')))
const returnLabel = computed(() =>
  String(route.query.return_label || '').slice(0, 40),
)
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
  lastDone = ref(null)

const viewEntries = computed(() =>
  VIEWS.map((v) => ({
    value: v.value,
    icon: v.icon,
    label: counts.value[v.value]
      ? `${viewLabel(v.value)} · ${counts.value[v.value]}`
      : viewLabel(v.value),
  })),
)
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
      title: __('Nothing needs help'),
      body: __(
        'Files that could not be processed show up here with what to do.',
      ),
    }
  if (view.value === 'archivo')
    return {
      icon: 'archive',
      title: __('Nothing filed yet'),
      body: __('Linked and filed documents stay here, searchable.'),
    }
  return {
    icon: 'inbox',
    title: lastDone.value ? __('All classified') : __('Nothing to classify'),
    body: __(
      'When you receive an invoice, receipt or contract it shows up here until you link it to its operation.',
    ),
  }
})

function patch(query) {
  const next = { ...route.query, ...query }
  for (const key of Object.keys(next))
    if (next[key] === undefined || next[key] === '') delete next[key]
  return router.replace({ query: next })
}
function selectView(value) {
  patch({
    view: value === 'por_clasificar' ? undefined : value,
    document: undefined,
  })
}
function selectCompany(value) {
  patch({ company: value, document: undefined })
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

let requestSeq = 0
async function loadList({ more = false } = {}) {
  if (!company.value) return
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
watch(
  () => [view.value, company.value],
  () => loadList(),
)

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
    // on the queue so it can be sent too.
    toast.success(__('File received. Send the next one when ready.'))
    loadList()
    return
  }
  uploadOpen.value = false
  toast.success(__('File received'))
  patch({
    company:
      detail.company !== company.value ? detail.company : route.query.company,
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

// A recovered permission reopens the record origin and the queue, not just the boot.
async function start({ refresh = false } = {}) {
  await loadArchivosBoot({ refresh })
  if (!boot.value?.enabled) return
  await loadTarget()
  loadList()
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
