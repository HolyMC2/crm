<template>
  <article class="flex min-h-0 flex-1 flex-col" :aria-busy="loading">
    <header
      class="flex shrink-0 items-start gap-2 border-b border-outline-gray-2 px-4 py-3"
    >
      <Button
        class="min-h-11 min-w-11 lg:hidden"
        icon="arrow-left"
        variant="ghost"
        :aria-label="__('Back to the list')"
        @click="$emit('close')"
      />
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-xl font-semibold text-ink-gray-9">
          {{ doc?.title || __('Document') }}
        </h2>
        <p v-if="doc" class="truncate text-sm text-ink-gray-6">
          {{ kindLabel(doc.document_kind) }} ·
          {{
            __('Received by {0}', [
              doc.received_by_me ? __('you') : doc.owner_label,
            ])
          }}
          · {{ doc.company }}
        </p>
      </div>
      <Badge
        v-if="doc"
        :theme="statusTheme(doc.status)"
        :label="statusLabel(doc.status)"
      />
    </header>

    <div v-if="loading && !doc" class="space-y-3 p-4" aria-hidden="true">
      <div class="h-48 animate-pulse rounded-lg bg-surface-gray-2" />
      <div class="h-10 animate-pulse rounded bg-surface-gray-2" />
      <div class="h-10 animate-pulse rounded bg-surface-gray-2" />
    </div>
    <div v-else-if="loadProblem" class="p-4">
      <ArchivoGuard :state="loadProblem" @action="onGuardAction" />
    </div>

    <div v-else-if="doc" class="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-6">
      <div class="grid gap-4 p-4 xl:grid-cols-2">
        <!-- Original -->
        <section :aria-label="__('Original')" class="min-w-0 space-y-2">
          <div
            class="overflow-hidden rounded-lg border border-outline-gray-2 bg-surface-gray-1"
          >
            <img
              v-if="preview === 'image'"
              :src="doc.file_url"
              :alt="doc.title"
              class="mx-auto max-h-[60vh] w-auto object-contain"
            />
            <iframe
              v-else-if="preview === 'pdf'"
              :src="doc.file_url"
              :title="doc.title"
              class="h-[60vh] w-full bg-surface-base"
            />
            <pre
              v-else-if="doc.extracted_text"
              class="max-h-[60vh] overflow-auto whitespace-pre-wrap p-3 text-sm text-ink-gray-8"
              >{{ doc.extracted_text.slice(0, 6000) }}</pre
            >
            <p v-else class="p-6 text-center text-sm text-ink-gray-6">
              {{
                __('No preview for this file. Open the original to check it.')
              }}
            </p>
          </div>
          <a
            :href="doc.file_url"
            target="_blank"
            rel="noopener"
            class="inline-flex min-h-11 items-center gap-2 text-sm text-ink-gray-7 underline sm:min-h-0"
            ><FeatherIcon name="external-link" class="h-4 w-4" />{{
              __('Open original')
            }}</a
          >
          <p v-if="extractionFacts" class="text-sm text-ink-gray-6">
            {{ extractionFacts }}
          </p>
        </section>

        <div class="min-w-0 space-y-4">
          <!-- Why this worker cannot change it, and how to continue -->
          <ArchivoGuard
            v-if="!doc.can_edit"
            :state="readOnlyGuard"
            @action="onGuardAction"
            @called="onCalled"
          />

          <!-- Next step -->
          <section
            v-if="doc.can_edit"
            class="space-y-3 rounded-lg border border-outline-gray-2 p-4"
            :aria-label="__('Next step')"
          >
            <h3 class="text-base font-semibold text-ink-gray-9">
              {{ __('Next step') }}
            </h3>
            <p class="text-sm text-ink-gray-7">{{ nextHint }}</p>

            <div
              v-if="targetPending"
              class="flex flex-wrap items-center gap-2 rounded bg-surface-gray-1 p-3"
            >
              <span class="min-w-0 flex-1 text-sm text-ink-gray-8"
                >{{ doctypeLabel(target.doctype) }} ·
                <strong>{{ target.title || target.name }}</strong></span
              >
              <Button
                variant="solid"
                class="min-h-11 sm:min-h-0"
                :label="__('Link to this record')"
                @click="askLink(target)"
              />
            </div>

            <div v-if="isBank" class="space-y-2">
              <a
                v-if="boot.banking_enabled"
                :href="bankUrl"
                class="inline-flex min-h-11 items-center gap-2 rounded bg-surface-gray-7 px-4 text-base font-medium text-ink-base sm:min-h-8"
                >{{
                  hasBankImport ? __('View in Bancos') : __('Import in Bancos')
                }}</a
              >
              <p v-else class="text-sm text-ink-gray-7">
                {{
                  __(
                    'Bank statement import is part of Contador. You can file this statement now and import it once your plan includes Bancos.',
                  )
                }}
              </p>
            </div>

            <div v-else>
              <h4 class="mb-1 text-sm font-medium text-ink-gray-8">
                {{ __('Suggested records') }}
              </h4>
              <p v-if="suggestLoading" class="text-sm text-ink-gray-6">
                {{ __('Looking for matches…') }}
              </p>
              <ul v-else-if="suggestions.length" class="space-y-1">
                <li
                  v-for="item in suggestions"
                  :key="item.doctype + item.name"
                  class="flex flex-wrap items-center gap-2 rounded border border-outline-gray-1 px-3 py-2"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-base text-ink-gray-9"
                      >{{ item.title }}
                      <span class="text-ink-gray-6"
                        >· {{ doctypeLabel(item.doctype) }}</span
                      ></span
                    >
                    <span class="block truncate text-sm text-ink-gray-6">{{
                      [item.reason, item.subtitle].filter(Boolean).join(' · ')
                    }}</span>
                  </span>
                  <Button
                    class="min-h-11 sm:min-h-0"
                    :label="__('Link document')"
                    @click="askLink(item)"
                  />
                </li>
              </ul>
              <p v-else class="text-sm text-ink-gray-6">
                {{
                  __(
                    'No matches yet. Fill in who issued it and its date, or search the record below.',
                  )
                }}
              </p>
            </div>

            <details v-if="!isBank" class="group" :open="manualOpen">
              <summary
                class="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink-gray-8"
                @click.prevent="manualOpen = !manualOpen"
              >
                <FeatherIcon name="search" class="h-4 w-4" />{{
                  __('Search another record')
                }}
              </summary>
              <div class="mt-2 grid gap-2 sm:grid-cols-[minmax(0,12rem)_1fr]">
                <FormControl
                  v-model="manual.doctype"
                  type="select"
                  :options="linkTypeOptions"
                  :aria-label="__('Record type')"
                />
                <FormControl
                  v-model="manual.query"
                  type="text"
                  :placeholder="__('Folio, name or reference')"
                  :aria-label="__('Folio, name or reference')"
                  enterkeyhint="search"
                />
              </div>
              <ul class="mt-2 space-y-1">
                <li
                  v-for="item in manual.results"
                  :key="item.doctype + item.name"
                  class="flex flex-wrap items-center gap-2 rounded border border-outline-gray-1 px-3 py-2"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-base text-ink-gray-9">{{
                      item.title
                    }}</span>
                    <span class="block truncate text-sm text-ink-gray-6">{{
                      [item.name !== item.title ? item.name : '', item.subtitle]
                        .filter(Boolean)
                        .join(' · ')
                    }}</span>
                  </span>
                  <Button
                    class="min-h-11 sm:min-h-0"
                    :label="__('Link document')"
                    @click="askLink(item)"
                  />
                </li>
                <li
                  v-if="manual.searched && !manual.results.length"
                  class="text-sm text-ink-gray-6"
                >
                  {{
                    __(
                      'Nothing in {0} matches. Check the folio or create the record first.',
                      [doc.company],
                    )
                  }}
                  <a
                    v-if="manual.doctype === 'Purchase Invoice'"
                    :href="newPurchaseHref"
                    target="_blank"
                    rel="noopener"
                    class="underline"
                    >{{ __('Create purchase invoice') }}</a
                  >
                </li>
              </ul>
            </details>
            <ArchivoGuard
              v-if="actionProblem"
              :state="actionProblem"
              @action="onGuardAction"
              @called="onCalled"
            />
          </section>

          <!-- Linked records -->
          <section v-if="doc.links.length" :aria-label="__('Linked to')">
            <h3 class="mb-1 text-sm font-medium text-ink-gray-8">
              {{ __('Linked to') }}
            </h3>
            <ul class="space-y-1">
              <li
                v-for="row in doc.links"
                :key="row.reference_doctype + row.reference_name"
              >
                <a
                  :href="recordHref(row.reference_doctype, row.reference_name)"
                  class="flex min-h-11 items-center gap-2 rounded px-2 text-base text-ink-gray-9 hover:bg-surface-gray-1"
                  ><FeatherIcon name="link" class="h-4 w-4 text-ink-gray-5" />{{
                    doctypeLabel(row.reference_doctype)
                  }}
                  · {{ row.reference_name }}</a
                >
              </li>
            </ul>
          </section>

          <!-- Metadata -->
          <section
            class="space-y-3 rounded-lg border border-outline-gray-2 p-4"
            :aria-label="__('Details')"
          >
            <div class="flex items-center gap-2">
              <h3 class="flex-1 text-base font-semibold text-ink-gray-9">
                {{ __('Details') }}
              </h3>
              <span v-if="draftRestored" class="text-sm text-ink-gray-6">{{
                __('Unsaved changes recovered')
              }}</span>
            </div>
            <FormControl
              v-model="form.title"
              :label="__('Title')"
              type="text"
              :disabled="!doc.can_edit"
              maxlength="140"
            />
            <div class="grid gap-3 sm:grid-cols-2">
              <FormControl
                v-model="form.document_kind"
                :label="__('Type')"
                type="select"
                :options="kindOptions"
                :disabled="!doc.can_edit"
              />
              <FormControl
                v-model="form.document_date"
                :label="__('Document date')"
                type="date"
                :disabled="!doc.can_edit"
              />
            </div>
            <FormControl
              v-model="form.counterparty"
              :label="__('Issued by or for')"
              type="text"
              :placeholder="__('Supplier, customer or bank')"
              :disabled="!doc.can_edit"
              maxlength="140"
            />
            <FormControl
              v-model="form.tags"
              :label="__('Notes or tags')"
              type="text"
              :disabled="!doc.can_edit"
              maxlength="500"
            />
            <FormControl
              v-if="doc.received_by_me || isAdmin"
              v-model="form.visibility"
              :label="__('Who can see it')"
              type="select"
              :options="visibilityOptions"
              :disabled="!doc.can_edit"
            />
            <ArchivoGuard
              v-if="formProblem"
              :state="formProblem"
              @action="onGuardAction"
            />
            <div
              v-if="conflict"
              class="rounded border border-outline-amber-3 bg-surface-amber-1 p-3 text-sm"
            >
              <p class="font-medium text-ink-amber-8">
                {{ __('Current version') }}
              </p>
              <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <template v-for="field in conflictFields" :key="field.key">
                  <dt class="text-ink-gray-6">{{ field.label }}</dt>
                  <dd class="text-ink-gray-9">
                    {{ field.current || '—' }}
                    <span class="text-ink-gray-6"
                      >({{ __('yours: {0}', [field.mine || '—']) }})</span
                    >
                  </dd>
                </template>
              </dl>
              <div class="mt-2 flex flex-wrap gap-2">
                <Button
                  :label="__('Keep my changes')"
                  variant="solid"
                  @click="reapply"
                />
                <Button
                  :label="__('Use current version')"
                  @click="useCurrent"
                />
              </div>
            </div>
            <div v-if="doc.can_edit" class="flex flex-wrap gap-2">
              <Button
                variant="solid"
                class="min-h-11 sm:min-h-0"
                :label="__('Save details')"
                :disabled="!dirty"
                :loading="saving"
                @click="save"
              />
              <Button
                v-if="dirty"
                variant="ghost"
                class="min-h-11 sm:min-h-0"
                :label="__('Discard changes')"
                @click="resetForm()"
              />
            </div>
          </section>

          <!-- Review assignment -->
          <section
            class="space-y-2 text-sm text-ink-gray-7"
            :aria-label="__('Review')"
          >
            <p v-if="doc.review_assignee">
              {{
                __('Review assigned to {0} by {1}', [
                  doc.assigned_to_me ? __('you') : doc.review_assignee_label,
                  doc.review_assigned_by_label,
                ])
              }}
            </p>
            <div class="flex flex-wrap gap-2">
              <Button
                v-if="doc.can_assign"
                class="min-h-11 sm:min-h-0"
                :label="
                  doc.review_assignee
                    ? __('Reassign review')
                    : __('Assign review')
                "
                icon-left="user-check"
                @click="assignOpen = true"
              />
              <Button
                v-if="
                  doc.review_assignee && (doc.can_assign || doc.assigned_to_me)
                "
                class="min-h-11 sm:min-h-0"
                :label="
                  doc.assigned_to_me ? __('Return review') : __('Remove review')
                "
                :loading="busy === 'clear'"
                @click="clearReview"
              />
            </div>
          </section>

          <!-- Help: processing / failed jobs -->
          <section
            v-if="failedTasks.length"
            class="space-y-2"
            :aria-label="__('Problems')"
          >
            <h3 class="text-sm font-medium text-ink-gray-8">
              {{ __('What went wrong') }}
            </h3>
            <div
              v-for="task in failedTasks"
              :key="task.name"
              class="flex flex-wrap items-center gap-2 rounded border border-outline-gray-2 p-3"
            >
              <span class="min-w-0 flex-1 text-sm text-ink-gray-8">{{
                task.state === 'Failed'
                  ? task.error_message || __('Processing failed.')
                  : __(
                      'The archive may already have this file. Check it there and enter its document number; it is not sent again.',
                    )
              }}</span>
              <Button
                v-if="task.state === 'Failed'"
                class="min-h-11 sm:min-h-0"
                :label="__('Try again')"
                :loading="busy === task.name"
                @click="retryTask(task)"
              />
              <Button
                v-else-if="verifying !== task.name"
                class="min-h-11 sm:min-h-0"
                :label="__('Verify delivery')"
                @click="startVerify(task)"
              />
              <form
                v-else
                class="flex w-full flex-wrap items-end gap-2"
                @submit.prevent="verifyTask(task)"
              >
                <label class="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                  {{ __('Document number in the archive') }}
                  <input
                    v-model="remoteId"
                    inputmode="numeric"
                    pattern="[0-9]+"
                    required
                    class="min-h-11 rounded border border-outline-gray-2 px-2 text-base sm:min-h-8"
                  />
                </label>
                <Button
                  type="submit"
                  variant="solid"
                  class="min-h-11 sm:min-h-0"
                  :label="__('Verify')"
                  :loading="busy === task.name"
                  :disabled="!/^[0-9]+$/.test(remoteId)"
                  @click="verifyTask(task)"
                />
                <Button
                  class="min-h-11 sm:min-h-0"
                  :label="__('Cancel')"
                  @click="verifying = ''"
                />
              </form>
            </div>
          </section>

          <div
            v-if="doc.can_edit"
            class="flex flex-wrap gap-2 border-t border-outline-gray-1 pt-3"
          >
            <Button
              v-if="doc.status !== 'Archived'"
              variant="subtle"
              class="min-h-11 sm:min-h-0"
              :label="__('File without linking')"
              :loading="busy === 'Archived'"
              @click="setStatus('Archived')"
            />
            <Button
              v-if="doc.status !== 'Review'"
              variant="subtle"
              class="min-h-11 sm:min-h-0"
              :label="__('Back to review')"
              :loading="busy === 'Review'"
              @click="setStatus('Review')"
            />
            <!-- Not in Archivos yet: the Desk archive page keeps them for this
                 document and returns here. -->
            <a
              v-if="doc.can_archive"
              :href="classicHref"
              class="inline-flex min-h-11 items-center gap-2 rounded px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-2 sm:min-h-8"
              >{{ __('Send to the archive for OCR') }}</a
            >
            <a
              v-if="doc.can_prepare_purchase"
              :href="classicHref"
              class="inline-flex min-h-11 items-center gap-2 rounded px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-2 sm:min-h-8"
              >{{ __('Prepare purchase draft') }}</a
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Phone: the next action stays in the thumb zone -->
    <div
      v-if="doc && doc.can_edit && stickyAction"
      class="sticky bottom-0 flex gap-2 border-t border-outline-gray-2 bg-surface-base p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <Button
        variant="solid"
        class="min-h-11 flex-1"
        :label="stickyAction.label"
        @click="stickyAction.run()"
      />
    </div>

    <Dialog
      v-model="confirmOpen"
      :options="{ title: __('Link this document?') }"
    >
      <template #body-content>
        <p v-if="pending" class="text-base text-ink-gray-8">
          {{
            __(
              '«{0}» will be linked to {1} {2}. Anyone who opens that record will find it.',
              [
                doc?.title,
                doctypeLabel(pending.doctype),
                pending.title || pending.name,
              ],
            )
          }}
        </p>
        <ArchivoGuard
          v-if="linkProblem"
          class="mt-3"
          :state="linkProblem"
          @action="onLinkGuard"
        />
      </template>
      <template #actions>
        <div class="flex flex-wrap justify-end gap-2">
          <Button :label="__('Cancel')" @click="confirmOpen = false" />
          <Button
            variant="solid"
            :label="__('Link document')"
            :loading="busy === 'link'"
            @click="confirmLink"
          />
        </div>
      </template>
    </Dialog>
    <AssignReviewDialog
      v-if="doc"
      v-model="assignOpen"
      :doc="doc"
      @assigned="applyDetail"
    />
  </article>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Badge, Button, Dialog, FeatherIcon, FormControl } from 'frappe-ui'
import ArchivoGuard from './ArchivoGuard.vue'
import AssignReviewDialog from './AssignReviewDialog.vue'
import {
  archivosApi,
  archivosHref,
  bankHandoffUrl,
  doctypeLabel,
  kindLabel,
  previewKind,
  problem,
  recordHref,
  statusLabel,
  statusTheme,
} from '@/composables/useArchivos'
import { errorKind } from '@/utils/contactos'

const props = defineProps({
  name: { type: String, required: true },
  boot: { type: Object, required: true },
  target: { type: Object, default: null },
})
const emit = defineEmits(['close', 'done', 'updated', 'clear-target'])

const FIELDS = [
  'title',
  'document_kind',
  'document_date',
  'counterparty',
  'tags',
  'visibility',
]
const doc = ref(null),
  loading = ref(false),
  loadProblem = ref(null),
  form = reactive({}),
  baseline = ref({}),
  expected = ref(''),
  saving = ref(false),
  formProblem = ref(null),
  conflict = ref(null),
  draftRestored = ref(false),
  suggestions = ref([]),
  suggestLoading = ref(false),
  manualOpen = ref(false),
  manual = reactive({ doctype: '', query: '', results: [], searched: false }),
  pending = ref(null),
  confirmOpen = ref(false),
  linkProblem = ref(null),
  actionProblem = ref(null),
  assignOpen = ref(false),
  busy = ref('')
const isAdmin = computed(() => Boolean(props.boot.can_configure))
const preview = computed(() => previewKind(doc.value?.media_type))
const isBank = computed(() => doc.value?.document_kind === 'BankStatement')
const hasBankImport = computed(() =>
  doc.value?.links?.some((r) => r.reference_doctype === 'Importacion Bancaria'),
)
const bankUrl = computed(() =>
  doc.value
    ? bankHandoffUrl(doc.value, archivosHref({ document: doc.value.name }))
    : '',
)
const classicHref = computed(
  () =>
    `/desk/documentos?${new URLSearchParams({ clasico: '1', document: doc.value?.name || '' })}`,
)
const newPurchaseHref = computed(() => {
  const params = new URLSearchParams({ company: doc.value?.company || '' })
  return `/desk/purchase-invoice/new?${params.toString()}`
})
const targetPending = computed(
  () =>
    props.target?.supported &&
    doc.value &&
    !doc.value.links.some(
      (r) =>
        r.reference_doctype === props.target.doctype &&
        r.reference_name === props.target.name,
    ),
)
// Failed jobs retry; a delivery that may exist (Uncertain, Submitting) is only
// verified against the archive, never resent blindly.
const failedTasks = computed(() =>
  (doc.value?.tasks || []).filter((t) =>
    ['Failed', 'Uncertain', 'Submitting'].includes(t.state),
  ),
)
const verifying = ref(''),
  remoteId = ref('')
const kindOptions = computed(() =>
  (props.boot.kinds || []).map((value) => ({ value, label: kindLabel(value) })),
)
const linkTypeOptions = computed(() =>
  (props.boot.link_types || []).map((value) => ({
    value,
    label: doctypeLabel(value),
  })),
)
const visibilityOptions = computed(() => [
  { value: 'Private', label: __('Only the person who received it') },
  {
    value: 'Company',
    label: __('Everyone in {0}', [doc.value?.company || '']),
  },
])
const extractionFacts = computed(() => {
  const e = doc.value?.extraction || {}
  return [
    e.issuer_rfc && __('Issuer RFC {0}', [e.issuer_rfc]),
    e.uuid && __('Fiscal folio {0}', [e.uuid]),
  ]
    .filter(Boolean)
    .join(' · ')
})
const dirty = computed(() =>
  FIELDS.some((k) => (form[k] || '') !== (baseline.value[k] || '')),
)
const nextHint = computed(() => {
  if (doc.value?.status === 'Linked')
    return __(
      'Linked. You can link it to another record too, or go to the next one.',
    )
  if (isBank.value)
    return __(
      'Bancos imports the statement and continues the reconciliation; it returns you here.',
    )
  return __(
    'Confirm which operation this proves. Nothing is linked until you confirm.',
  )
})
const readOnlyGuard = computed(() => {
  const owner = doc.value?.owner_label || ''
  const actions = [
    {
      label: __('Ask {0} to review it', [owner]),
      kind: 'call',
      target: 'doco.docoutils.documents.bandeja.request_review',
      args: { name: doc.value?.name },
    },
  ]
  if (doc.value?.can_assign)
    actions.unshift({
      label: __('Assign the review to me'),
      kind: 'assign_self',
    })
  return {
    code: 'not_reviewer',
    message: __(
      '{0} received this document. Only they or the person assigned to review it can classify or link it.',
      [owner],
    ),
    actions,
  }
})
const stickyAction = computed(() => {
  if (!doc.value) return null
  if (targetPending.value)
    return {
      label: __('Link to {0}', [props.target.title || props.target.name]),
      run: () => askLink(props.target),
    }
  if (isBank.value && props.boot.banking_enabled)
    return {
      label: hasBankImport.value
        ? __('View in Bancos')
        : __('Import in Bancos'),
      run: () => window.location.assign(bankUrl.value),
    }
  if (dirty.value) return { label: __('Save details'), run: save }
  if (suggestions.value[0] && doc.value.status === 'Review')
    return {
      label: __('Link to {0}', [suggestions.value[0].title]),
      run: () => askLink(suggestions.value[0]),
    }
  return null
})
const conflictFields = computed(() => {
  const current = conflict.value || {}
  const labels = {
    title: __('Title'),
    document_kind: __('Type'),
    document_date: __('Document date'),
    counterparty: __('Issued by or for'),
    tags: __('Notes or tags'),
    visibility: __('Who can see it'),
  }
  return FIELDS.filter((k) => (current[k] || '') !== (form[k] || '')).map(
    (k) => ({
      key: k,
      label: labels[k],
      current: k === 'document_kind' ? kindLabel(current[k]) : current[k],
      mine: k === 'document_kind' ? kindLabel(form[k]) : form[k],
    }),
  )
})

// Typed metadata survives a reload in this tab, scoped to site and user.
function draftKey() {
  const user =
    document.cookie.split('; ').find((x) => x.startsWith('user_id=')) || ''
  return `archivos:${window.location.host}:${user}:draft:${props.name}`
}
function readDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(draftKey()) || 'null')
  } catch {
    return null
  }
}
function writeDraft() {
  try {
    if (dirty.value)
      sessionStorage.setItem(
        draftKey(),
        JSON.stringify({ values: { ...form }, modified: expected.value }),
      )
    else sessionStorage.removeItem(draftKey())
  } catch {
    /* storage unavailable: the form still works */
  }
}
watch(form, writeDraft, { deep: true })

function valuesOf(source) {
  return Object.fromEntries(
    FIELDS.map((k) => [k, source?.[k] == null ? '' : String(source[k])]),
  )
}
function resetForm(source = doc.value) {
  baseline.value = valuesOf(source)
  Object.assign(form, baseline.value)
  draftRestored.value = false
}
function applyDetail(detail) {
  const keepEdits = dirty.value ? { ...form } : null
  doc.value = detail
  expected.value = detail.modified
  baseline.value = valuesOf(detail)
  Object.assign(form, keepEdits || baseline.value)
  emit('updated', detail)
}
async function load() {
  loading.value = true
  loadProblem.value = null
  conflict.value = null
  formProblem.value = null
  actionProblem.value = null
  try {
    const detail = await archivosApi('detail', { name: props.name })
    doc.value = detail
    expected.value = detail.modified
    resetForm(detail)
    const saved = readDraft()
    if (saved?.values && detail.can_edit) {
      Object.assign(form, saved.values)
      draftRestored.value = dirty.value
      if (saved.modified && saved.modified !== detail.modified) {
        // The record changed since the draft: show both before saving anything.
        conflict.value = valuesOf(detail)
      }
    }
    loadSuggestions()
  } catch (error) {
    loadProblem.value = problem(error)
  } finally {
    loading.value = false
  }
}
async function loadSuggestions() {
  suggestions.value = []
  if (!doc.value?.can_edit || isBank.value) return
  suggestLoading.value = true
  try {
    suggestions.value = await archivosApi('suggest', { name: props.name })
  } catch {
    suggestions.value = []
  } finally {
    suggestLoading.value = false
  }
}
watch(() => props.name, load, { immediate: true })

const searchManual = useDebounceFn(async () => {
  if (!manual.doctype) return
  try {
    manual.results = await archivosApi('search_targets', {
      name: props.name,
      reference_doctype: manual.doctype,
      query: manual.query,
    })
  } catch (error) {
    manual.results = []
    actionProblem.value = problem(error)
  } finally {
    manual.searched = true
  }
}, 250)
watch(() => [manual.doctype, manual.query], searchManual)
watch(manualOpen, (open) => {
  if (open && !manual.doctype)
    manual.doctype =
      props.target?.supported && props.target.doctype
        ? props.target.doctype
        : props.boot.link_types?.[0] || ''
})

async function save() {
  if (saving.value) return
  saving.value = true
  formProblem.value = null
  const submitted = { ...form }
  const values = {}
  for (const k of FIELDS)
    if ((form[k] || '') !== (baseline.value[k] || '')) values[k] = form[k] || ''
  try {
    const detail = await archivosApi('classify', {
      name: props.name,
      values,
      expected_modified: expected.value,
    })
    conflict.value = null
    // Anything typed while the save was on its way stays on screen, unsaved.
    const newer = Object.fromEntries(
      FIELDS.filter((k) => form[k] !== submitted[k]).map((k) => [k, form[k]]),
    )
    Object.assign(form, valuesOf(detail))
    applyDetail(detail)
    resetForm(detail)
    Object.assign(form, newer)
    loadSuggestions()
  } catch (error) {
    handleWriteError(error, formProblem)
  } finally {
    saving.value = false
  }
}
function handleWriteError(error, slot) {
  const state = problem(error)
  if (state.code === 'conflict' || errorKind(error) === 'conflict') {
    const current = state.retry_context?.current
    if (current) {
      conflict.value = valuesOf(current)
      expected.value = current.modified
      doc.value = { ...doc.value, ...current }
    } else conflict.value = valuesOf(doc.value)
    slot.value = { ...state, actions: [] }
    return
  }
  slot.value = state
}
function reapply() {
  // Keep the typed values; the next save is based on the version just shown.
  conflict.value = null
  formProblem.value = null
  baseline.value = valuesOf(doc.value)
}
function useCurrent() {
  conflict.value = null
  formProblem.value = null
  resetForm(doc.value)
}

function askLink(item) {
  pending.value = item
  linkProblem.value = null
  confirmOpen.value = true
}
async function confirmLink() {
  busy.value = 'link'
  linkProblem.value = null
  try {
    const detail = await archivosApi('link', {
      name: props.name,
      reference_doctype: pending.value.doctype,
      reference_name: pending.value.name,
      expected_modified: expected.value,
    })
    confirmOpen.value = false
    applyDetail(detail)
    emit('done', {
      name: props.name,
      outcome: 'linked',
      doctype: pending.value.doctype,
      reference: pending.value.name,
    })
  } catch (error) {
    const state = problem(error)
    if (state.code === 'conflict') {
      await load()
      linkProblem.value = {
        ...state,
        message: __(
          'This document changed while you were reviewing it. Check it and confirm again.',
        ),
        actions: [],
      }
    } else linkProblem.value = state
  } finally {
    busy.value = ''
  }
}
function onLinkGuard(action) {
  if (action.kind === 'retry') {
    confirmOpen.value = false
    manualOpen.value = true
  }
}
async function setStatus(status) {
  busy.value = status
  actionProblem.value = null
  try {
    const detail = await archivosApi('set_status', {
      name: props.name,
      status,
      expected_modified: expected.value,
    })
    applyDetail(detail)
    if (status === 'Archived')
      emit('done', { name: props.name, outcome: 'archived' })
  } catch (error) {
    handleWriteError(error, actionProblem)
  } finally {
    busy.value = ''
  }
}
async function clearReview() {
  busy.value = 'clear'
  try {
    applyDetail(await archivosApi('clear_review', { name: props.name }))
  } catch (error) {
    actionProblem.value = problem(error)
  } finally {
    busy.value = ''
  }
}
async function retryTask(task) {
  busy.value = task.name
  try {
    await archivosApi('doco.docoutils.documents.api.retry_task', {
      name: task.name,
    })
    await load()
  } catch (error) {
    actionProblem.value = problem(error)
  } finally {
    busy.value = ''
  }
}
function startVerify(task) {
  verifying.value = task.name
  remoteId.value = ''
}
async function verifyTask(task) {
  if (busy.value === task.name || !/^[0-9]+$/.test(remoteId.value)) return
  busy.value = task.name
  actionProblem.value = null
  try {
    await archivosApi('doco.docoutils.documents.api.resolve_task', {
      name: task.name,
      remote_id: remoteId.value,
    })
    verifying.value = ''
    await load()
  } catch (error) {
    actionProblem.value = problem(error)
  } finally {
    busy.value = ''
  }
}
async function onGuardAction(action) {
  if (action.kind === 'retry') return load()
  if (action.kind === 'assign_self') {
    busy.value = 'assign'
    try {
      const me = props.boot.user || ''
      applyDetail(
        await archivosApi('assign_review', { name: props.name, user: me }),
      )
      loadSuggestions()
    } catch (error) {
      actionProblem.value = problem(error)
    } finally {
      busy.value = ''
    }
  }
  if (action.kind === 'clear_target') emit('clear-target')
}
function onCalled() {
  /* request sent; the guard shows the confirmation and the worker moves on */
}
</script>
