<template>
  <div class="min-w-0">
    <div
      v-if="loading && !row && !approval"
      role="status"
      class="py-8 text-sm text-ink-gray-6"
    >
      {{ __('Loading pendiente…') }}
    </div>
    <!-- An ask for a decision: it is decided on its owner's screen, never ticked here. -->
    <section
      v-else-if="approval"
      role="status"
      class="mt-4 space-y-3 rounded-6 bg-surface-gray-1 p-4"
    >
      <p class="text-base-medium text-ink-gray-9">
        {{ __('This is decided in {0}.', [approval.where]) }}
      </p>
      <p class="text-sm text-ink-gray-7">
        {{
          __(
            'Open it there to decide; it also waits for you in Pendientes, in To approve.',
          )
        }}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button
          v-if="approvalOpen"
          variant="solid"
          class="min-h-11 sm:min-h-8"
          :label="__('Open in {0}', [approval.where])"
          @click="openApproval"
        />
        <Button
          class="min-h-11 sm:min-h-8"
          :label="
            approval.list?.includes('segment=waiting')
              ? __('Waiting for an answer')
              : __('To approve')
          "
          @click="router.push(approval.list.replace(/^\/crm/, ''))"
        />
      </div>
    </section>
    <section
      v-else-if="problem && !row"
      role="alert"
      class="mt-4 space-y-3 rounded-6 bg-surface-red-1 p-4 text-ink-red-7"
    >
      <p>
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
      </p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry')" @click="load" />
        <slot name="leave" />
      </div>
    </section>
    <template v-else-if="row">
      <header class="mt-3 space-y-2">
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span
            class="rounded-full px-2 py-0.5 font-medium"
            :class="statusClass"
            >{{ statusText }}</span
          >
          <span
            v-if="row.doctype === 'CRM Task'"
            class="rounded-full bg-surface-gray-2 px-2 py-0.5 text-ink-gray-7"
            >{{ sourceLabel(row) }}</span
          >
          <span
            v-if="row.priority === 'High'"
            class="rounded-full bg-surface-amber-1 px-2 py-0.5 text-ink-amber-9"
            >{{ priorityLabel(row.priority) }}</span
          >
        </div>
        <h1
          class="whitespace-pre-line text-xl font-semibold text-ink-gray-9 [overflow-wrap:break-word] [text-wrap:balance]"
          :class="row.status === 'Closed' ? 'text-ink-gray-6 line-through' : ''"
        >
          {{ row.description }}
        </h1>
      </header>
      <p
        v-if="row.notes"
        class="mt-3 whitespace-pre-line text-base text-ink-gray-8 [overflow-wrap:break-word]"
      >
        {{ row.notes }}
      </p>
      <!-- The light checklist: lines of the notes, ticked in place. -->
      <section
        v-if="row.checklist?.length || canAct"
        class="mt-4"
        aria-labelledby="pendiente-checklist"
      >
        <h2
          id="pendiente-checklist"
          class="text-sm font-medium text-ink-gray-6"
          :class="row.checklist?.length ? '' : 'sr-only'"
        >
          {{ __('Checklist') }}
          <template v-if="row.checklist?.length"
            >· {{ checklistText(row.checklist) }}</template
          >
        </h2>
        <ul class="mt-1">
          <li v-for="item in row.checklist" :key="item.index">
            <button
              type="button"
              role="checkbox"
              :aria-checked="item.checked"
              class="flex min-h-11 w-full items-center gap-3 rounded-6 text-left text-base disabled:cursor-default"
              :disabled="busy || !row.can_change"
              @click="tick(item)"
            >
              <span
                class="flex size-5 shrink-0 items-center justify-center rounded-4 border-2"
                :class="
                  item.checked
                    ? 'border-outline-green-4 bg-surface-green-7 text-white'
                    : 'border-outline-gray-4'
                "
                ><span
                  v-if="item.checked"
                  class="lucide-check size-3.5"
                  aria-hidden="true"
              /></span>
              <span
                :class="
                  item.checked
                    ? 'text-ink-gray-5 line-through'
                    : 'text-ink-gray-9'
                "
                >{{ item.text }}</span
              >
            </button>
          </li>
        </ul>
        <!-- «Agregar subtarea» (Google Tasks): one more «- [ ]» line in the notes. -->
        <form
          v-if="canAct && row.status === 'Open'"
          class="flex min-h-11 items-center gap-3"
          @submit.prevent="addItem"
        >
          <span
            class="lucide-plus size-5 shrink-0 text-ink-gray-5"
            aria-hidden="true"
          />
          <input
            v-model="newItem"
            type="text"
            maxlength="200"
            class="min-h-11 min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-0"
            :placeholder="__('Add a subtask')"
            :aria-label="__('Add a subtask')"
            :disabled="busy"
          />
        </form>
      </section>

      <div
        v-if="problem"
        role="alert"
        class="mt-4 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button
          class="ml-2"
          :label="
            problem.kind === 'conflict'
              ? __('Load current version')
              : __('Retry')
          "
          @click="load"
        />
      </div>

      <!-- One solid next action; the rest stay secondary (≤3 + ⋯). -->
      <div
        class="z-20 flex flex-wrap gap-2"
        :class="
          docked
            ? 'fixed inset-x-0 bottom-14 border-t border-outline-gray-2 bg-surface-base px-4 py-3 sm:static sm:mt-5 sm:border-0 sm:bg-transparent sm:p-0'
            : 'mt-5'
        "
      >
        <template v-if="canAct && row.status === 'Open'">
          <Button
            variant="solid"
            class="min-h-11 sm:min-h-8"
            :label="__('Mark done')"
            :loading="saving"
            :disabled="busy"
            @click="markDone"
          />
          <Button
            class="min-h-11 sm:min-h-8"
            :icon-left="LucidePen"
            :label="__('Edit')"
            :disabled="busy"
            @click="edit()"
          />
          <Dropdown :options="moreOptions">
            <Button
              class="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
              :icon="LucideEllipsis"
              :aria-label="__('More actions')"
              :disabled="busy"
            />
          </Dropdown>
        </template>
        <!-- Closed and cancelled work both come back through Reopen. -->
        <Button
          v-else-if="canReopen"
          variant="solid"
          class="min-h-11 sm:min-h-8"
          :label="__('Reopen')"
          :loading="saving"
          :disabled="busy"
          @click="reopen()"
        />
      </div>
      <p
        v-if="!row.can_change && row.blocked_reason"
        class="mt-2 text-sm text-ink-gray-6"
      >
        {{ row.blocked_reason }}
      </p>
      <p
        v-else-if="canReopen && row.cancelled"
        class="mt-2 text-sm text-ink-gray-6"
      >
        {{ __('This pendiente was cancelled. Reopen it to work on it again.') }}
      </p>

      <dl
        class="mt-6 grid grid-cols-1 gap-x-6 gap-y-4"
        :class="wide ? 'sm:grid-cols-2' : ''"
      >
        <div>
          <dt class="text-sm text-ink-gray-6">{{ __('Due') }}</dt>
          <dd
            class="text-base"
            :class="row.group === 'overdue' ? 'text-ink-red-7' : ''"
          >
            <!-- «Sin fecha» once, not «Sin fecha · Sin fecha». -->
            <template v-if="row.date">
              {{ formatDay(row.date)
              }}<template v-if="row.time">, {{ row.time }}</template> ·
              {{ dueText({ ...row, time: '' }, today) }}
            </template>
            <template v-else>{{ __('No date') }}</template>
          </dd>
        </div>
        <div>
          <dt class="text-sm text-ink-gray-6">
            {{ __('For', null, 'Pendiente') }}
          </dt>
          <dd class="text-base">
            <button
              v-if="row.can_change"
              type="button"
              class="min-h-11 text-left text-ink-blue-link underline-offset-2 hover:underline sm:min-h-0"
              @click="edit('person')"
            >
              {{ assigneeText }}
            </button>
            <span v-else>{{ assigneeText }}</span>
          </dd>
        </div>
        <div v-if="row.assigned_by && row.assigned_by !== row.assigned_to">
          <dt class="text-sm text-ink-gray-6">
            {{ __('Asked by', null, 'Pendiente') }}
          </dt>
          <dd class="text-base">
            {{ row.assigned_by_name || personName(row.assigned_by) }}
          </dd>
        </div>
        <div v-if="row.reminder">
          <dt class="text-sm text-ink-gray-6">{{ __('Reminder') }}</dt>
          <dd class="text-base">{{ reminderText(row.reminder) }}</dd>
        </div>
        <div v-if="row.repeat">
          <dt class="text-sm text-ink-gray-6">{{ __('Repeats') }}</dt>
          <dd class="text-base">{{ repeatLabel(row.repeat) }}</dd>
        </div>
        <div v-if="row.activity_type && row.activity_type !== 'Task'">
          <dt class="text-sm text-ink-gray-6">{{ __('Activity') }}</dt>
          <dd class="text-base">{{ __(row.activity_type) }}</dd>
        </div>
        <div>
          <dt class="text-sm text-ink-gray-6">
            {{ row.reference_name ? referenceKind : __('Record') }}
          </dt>
          <dd class="text-base">
            <!-- The linked record as a chip: it opens the record, back returns here. -->
            <button
              v-if="reference"
              type="button"
              class="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-surface-gray-2 px-3 text-left text-base text-ink-gray-9 sm:min-h-8"
              @click="openReference"
            >
              <span class="lucide-link size-4 shrink-0" aria-hidden="true" />
              <span class="truncate">{{ referenceName }}</span>
            </button>
            <span v-else-if="row.reference_name">{{ referenceName }}</span>
            <span v-else>{{ __('Not linked to a record') }}</span>
          </dd>
        </div>
      </dl>

      <section
        v-if="row.reference_name"
        class="mt-8"
        aria-labelledby="pendiente-next"
      >
        <h2 id="pendiente-next" class="text-base font-semibold">
          {{ __('Next on {0}', [referenceName]) }}
        </h2>
        <ul class="mt-2 divide-y divide-outline-gray-1">
          <li v-for="task in row.next" :key="task.doctype + task.name">
            <RouterLink
              :to="pendienteRoute(task, route.query)"
              class="flex min-h-11 items-center justify-between gap-3 py-2 text-base hover:text-ink-gray-9"
            >
              <span class="min-w-0 truncate">{{ task.description }}</span>
              <span class="shrink-0 text-sm text-ink-gray-6">{{
                dueText(task, today)
              }}</span>
            </RouterLink>
          </li>
        </ul>
        <p v-if="!row.next.length" class="mt-1 text-sm text-ink-gray-6">
          {{ __('Nothing else is planned on this record.') }}
        </p>
        <Button
          v-if="canCreateOn(row, boot)"
          class="mt-3 min-h-11 sm:min-h-8"
          :icon-left="LucidePlus"
          :label="__('Add next pendiente')"
          @click="createOpen = true"
        />
      </section>

      <section class="mt-8" aria-labelledby="pendiente-files">
        <div class="flex flex-wrap items-center gap-2">
          <h2 id="pendiente-files" class="flex-1 text-base font-semibold">
            {{ __('Files') }}
            <span v-if="row.files?.length" class="text-ink-gray-6"
              >({{ row.files.length }})</span
            >
          </h2>
          <template v-if="row.can_comment">
            <Button
              class="min-h-11 sm:min-h-8"
              :icon-left="LucideCamera"
              :label="__('Take photo')"
              :loading="uploading === 'camera'"
              :disabled="Boolean(uploading)"
              @click="cameraInput?.click()"
            />
            <Button
              class="min-h-11 sm:min-h-8"
              :icon-left="LucidePaperclip"
              :label="__('Attach')"
              :loading="uploading === 'file'"
              :disabled="Boolean(uploading)"
              @click="fileInput?.click()"
            />
          </template>
          <input
            ref="cameraInput"
            type="file"
            accept="image/*"
            capture="environment"
            class="hidden"
            @change="upload($event, 'camera')"
          />
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            @change="upload($event, 'file')"
          />
        </div>
        <ul v-if="row.files?.length" class="mt-2 flex flex-wrap gap-2">
          <li v-for="file in row.files" :key="file.name">
            <a
              :href="file.url"
              target="_blank"
              rel="noopener"
              class="flex min-h-11 max-w-60 items-center gap-2 rounded-6 bg-surface-gray-1 p-1 pr-3 text-sm text-ink-gray-8"
            >
              <img
                v-if="file.is_image"
                :src="file.url"
                alt=""
                class="size-10 shrink-0 rounded-4 object-cover"
                loading="lazy"
              />
              <span
                v-else
                class="lucide-file size-5 shrink-0"
                aria-hidden="true"
              />
              <span class="truncate">{{ file.file_name }}</span>
            </a>
          </li>
        </ul>
      </section>

      <section
        class="mt-8"
        :class="docked ? 'pb-20 sm:pb-0' : ''"
        aria-labelledby="pendiente-activity"
      >
        <h2 id="pendiente-activity" class="text-base font-semibold">
          {{ __('Comments and activity') }}
        </h2>
        <ol class="mt-2 space-y-3">
          <li
            v-for="entry in row.timeline"
            :key="entry.name || entry.kind + entry.at"
            class="flex gap-3"
          >
            <span
              class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
              :class="
                entry.kind === 'comment'
                  ? 'bg-surface-blue-1 text-ink-blue-7'
                  : 'bg-surface-gray-2 text-ink-gray-6'
              "
              aria-hidden="true"
              >{{ initials(entry.who) }}</span
            >
            <div class="min-w-0 flex-1">
              <p
                v-if="entry.kind === 'comment'"
                class="text-sm text-ink-gray-6"
              >
                <span class="font-medium text-ink-gray-8">{{ entry.who }}</span>
                ·
                {{ relativeTime(entry.at) }}
              </p>
              <p
                class="text-base [overflow-wrap:break-word]"
                :class="
                  entry.kind === 'comment'
                    ? 'whitespace-pre-line text-ink-gray-9'
                    : 'text-ink-gray-7'
                "
              >
                <template v-if="entry.kind !== 'comment'"
                  ><span class="font-medium text-ink-gray-8">{{
                    entry.who
                  }}</span>
                  {{ entry.text }}
                  <span class="text-sm text-ink-gray-5"
                    >· {{ relativeTime(entry.at) }}</span
                  ></template
                >
                <template v-else>{{ entry.text }}</template>
              </p>
            </div>
          </li>
        </ol>
        <form
          v-if="row.can_comment"
          class="mt-4 flex items-end gap-2"
          @submit.prevent="sendComment"
        >
          <FormControl
            v-model="comment"
            class="min-w-0 flex-1"
            type="textarea"
            :rows="1"
            :placeholder="__('Write a comment')"
            :aria-label="__('Comment')"
            @keydown.enter.exact.prevent="sendComment"
          />
          <Button
            type="submit"
            class="min-h-11 sm:min-h-8"
            :label="__('Send')"
            :loading="commenting"
            :disabled="!comment.trim()"
          />
        </form>
      </section>
    </template>
    <CompleteDialog
      v-model="completeOpen"
      :row="row"
      :today="today"
      :with-next="true"
      @done="afterComplete"
      @reload="reloadAfterConflict"
    />
    <CreateDialog
      v-model="createOpen"
      :today="today"
      :reference="row && row.reference_name ? row : null"
      @created="load"
    />
    <CreateDialog
      v-model="editOpen"
      :today="today"
      :row="row"
      :focus="editFocus"
      @saved="saved"
    />
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Dropdown, FormControl, toast } from 'frappe-ui'
import { initials, kindLabel, personName, relativeTime } from '@/utils/display'
import CompleteDialog from '@/components/pendientes/CompleteDialog.vue'
import CreateDialog from '@/components/pendientes/CreateDialog.vue'
import { loadShell, shellBoot } from '@/composables/muelleShell'
import { formatDay } from '@/utils/contactos'
import { approvalTarget } from '@/composables/useAprobaciones'
import { useAssistantContext } from '@/components/assistant/useAssistant'
import {
  canCreateOn,
  checklistText,
  datePresets,
  dueText,
  parseQuery,
  pendienteError,
  pendienteRoute,
  pendientesApi,
  priorityLabel,
  referenceTarget,
  reminderText,
  repeatLabel,
  requestId,
  sourceLabel,
  sourceSlug,
  stateLabel,
} from '@/composables/usePendientes'
import LucideCircleCheckBig from '~icons/lucide/circle-check-big'
import LucideCalendar from '~icons/lucide/calendar'
import LucidePen from '~icons/lucide/pen'
import LucideEllipsis from '~icons/lucide/ellipsis'
import LucidePlus from '~icons/lucide/plus'
import LucideCamera from '~icons/lucide/camera'
import LucidePaperclip from '~icons/lucide/paperclip'

const props = defineProps({
  doctype: { type: String, default: '' },
  name: { type: String, required: true },
  /** Phone record page: the actions dock above the bottom bar. */
  docked: { type: Boolean, default: false },
  /** Room for two columns of details (record page on a tablet or desktop). */
  wide: { type: Boolean, default: true },
})
const emit = defineEmits(['loaded', 'changed', 'redirect'])
const route = useRoute(),
  router = useRouter()
const row = ref(null),
  approval = ref(null),
  loading = ref(false),
  saving = ref(false),
  problem = ref(null),
  completeOpen = ref(false),
  createOpen = ref(false),
  editOpen = ref(false),
  editFocus = ref(''),
  comment = ref(''),
  commenting = ref(false),
  uploading = ref(''),
  cameraInput = ref(null),
  fileInput = ref(null)
const boot = computed(() => shellBoot.value?.modules?.pendientes || null)
const today = computed(() => boot.value?.today || '')
const busy = computed(() => loading.value || saving.value)
const canAct = computed(
  () => Boolean(row.value?.can_change) && !row.value?.cancelled,
)
// Cancelled work is not completable, but whoever may change it can reopen it.
const canReopen = computed(
  () => Boolean(row.value?.can_change) && row.value?.status === 'Closed',
)
const reference = computed(() => {
  const target = referenceTarget(row.value)
  // No Desk dead ends from a phone (SPEC §1.5): a record without a shell page is a label.
  return target?.href && globalThis.innerWidth < 1024 ? null : target
})
// «Contacto», «Trato»…: the linked record says what it is (pattern 6).
const referenceKind = computed(
  () => kindLabel(row.value?.reference_type) || __('Record'),
)
const referenceName = computed(
  () => row.value?.reference_label || row.value?.reference_name || '',
)
const assigneeText = computed(() =>
  row.value.mine
    ? __('Me')
    : row.value.assigned_to_name || personName(row.value.assigned_to) || '—',
)
const statusText = computed(() => {
  const value = row.value
  if (value.cancelled) return __('Cancelled')
  if (value.status === 'Closed') return __('Completed')
  if (['in_progress', 'blocked', 'backlog'].includes(value.state))
    return stateLabel(value.state)
  return value.group === 'overdue' ? __('Late') : stateLabel('open')
})
const statusClass = computed(() => {
  const value = row.value
  if (value.status === 'Closed') return 'bg-surface-green-1 text-ink-green-7'
  if (value.state === 'blocked' || value.group === 'overdue')
    return 'bg-surface-red-1 text-ink-red-7'
  return 'bg-surface-blue-1 text-ink-blue-7'
})
const moreOptions = computed(() => {
  const value = row.value
  const states = (value?.states || [])
    .filter((state) => !['done', value.state].includes(state))
    .map((state) => ({
      label:
        state === 'cancelled'
          ? __('Cancel pendiente')
          : __('Mark as: {0}', [stateLabel(state)]),
      icon: state === 'cancelled' ? 'x-circle' : 'circle',
      onClick: () => setState(state),
    }))
  return [
    {
      label: __('Done and schedule next'),
      icon: LucideCircleCheckBig,
      onClick: () => (completeOpen.value = true),
    },
    ...datePresets(today.value)
      .filter((preset) => preset.value !== value?.date)
      .map((preset) => ({
        label: __('Reschedule: {0}', [preset.label]),
        icon: LucideCalendar,
        onClick: () => reschedule(preset.value),
      })),
    ...states,
  ]
})

// «Pregúntale a Muelle» knows which pendiente this is, not just the route (S2c).
useAssistantContext(() =>
  row.value
    ? {
        doctype: row.value.doctype || props.doctype,
        name: String(row.value.name || props.name),
        title: row.value.description,
      }
    : null,
)

// Only the latest request for this record may fill the screen.
let generation = 0
async function load() {
  const current = ++generation
  if (row.value && !showing(row.value)) row.value = null
  approval.value = null
  if (!props.doctype) {
    row.value = null
    problem.value = {
      kind: 'missing',
      title: __('Unknown pendiente link'),
      detail: __('Open it again from your list.'),
    }
    return
  }
  loading.value = true
  problem.value = null
  try {
    await loadShell().catch(() => null)
    const response = await pendientesApi('item', {
      doctype: props.doctype,
      name: props.name,
    })
    if (current !== generation) return
    if (response.redirect) {
      emit('redirect', response.redirect)
      return
    }
    if (response.approval) {
      row.value = null
      approval.value = response.approval
      return
    }
    row.value = response
    emit('loaded', response)
  } catch (error) {
    if (current === generation) problem.value = pendienteError(error)
  } finally {
    if (current === generation) loading.value = false
  }
}
async function act(method, extra = {}, target = row.value) {
  if (busy.value || !target) return null
  saving.value = true
  problem.value = null
  try {
    const response = await pendientesApi(method, {
      doctype: target.doctype,
      name: String(target.name),
      modified: target.modified,
      request_id: requestId(),
      ...extra,
    })
    if (showing(response.row)) {
      row.value = response.row
      emit('loaded', response.row)
    }
    emit('changed', response.row)
    return response
  } catch (error) {
    problem.value = pendienteError(error)
    return null
  } finally {
    saving.value = false
  }
}
async function markDone() {
  const response = await act('complete')
  if (response)
    toast.success(__('Pendiente completed'), {
      duration: 8000,
      action: {
        label: __('Undo'),
        // The completed task, even if the screen has moved to another one.
        onClick: () => reopen(response.row),
      },
    })
}
async function reopen(target = row.value) {
  if (await act('reopen', {}, target)) toast.success(__('Pendiente reopened'))
}
async function reschedule(date) {
  if (await act('reschedule', { date }))
    toast.success(__('Moved to {0}', [formatDay(date)]))
}
async function setState(state) {
  if (await act('update', { values: { state } }))
    toast.success(
      state === 'cancelled' ? __('Pendiente cancelled') : stateLabel(state),
    )
}
const newItem = ref('')
async function addItem() {
  const text = newItem.value.trim()
  if (!text) return
  const notes = String(row.value?.notes_text || '').replace(/\s+$/, '')
  const response = await act('update', {
    values: { notes: `${notes ? `${notes}\n` : ''}- [ ] ${text}` },
  })
  if (response) newItem.value = ''
}
async function tick(item) {
  await act('check', {
    index: item.index,
    checked: !item.checked,
    text: item.text,
  })
}
async function sendComment() {
  const text = comment.value.trim()
  if (!text || commenting.value || !row.value) return
  commenting.value = true
  try {
    const response = await pendientesApi('comment', {
      doctype: row.value.doctype,
      name: String(row.value.name),
      text,
      request_id: requestId(),
    })
    comment.value = ''
    if (showing(response.row)) row.value = response.row
  } catch (error) {
    problem.value = pendienteError(error)
  } finally {
    commenting.value = false
  }
}
async function upload(event, kind) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !row.value) return
  uploading.value = kind
  try {
    const body = new FormData()
    body.append('file', file, file.name || 'foto.jpg')
    body.append('doctype', row.value.doctype)
    body.append('docname', String(row.value.name))
    body.append('is_private', '1')
    const headers = { Accept: 'application/json' }
    if (window.csrf_token && window.csrf_token !== '{{ csrf_token }}')
      headers['X-Frappe-CSRF-Token'] = window.csrf_token
    const response = await fetch('/api/method/upload_file', {
      method: 'POST',
      headers,
      body,
    })
    if (!response.ok)
      throw new Error(__('The file could not be attached. Try again.'))
    toast.success(__('File attached'))
    await load()
  } catch (error) {
    problem.value = pendienteError(error)
  } finally {
    uploading.value = ''
  }
}
function edit(focus = '') {
  editFocus.value = focus
  editOpen.value = true
}
function saved(updated) {
  if (showing(updated)) row.value = updated
  emit('changed', updated)
  toast.success(__('Pendiente saved'))
}
function showing(item) {
  return (
    Boolean(item) &&
    item.doctype === props.doctype &&
    String(item.name) === props.name
  )
}
function afterComplete(response) {
  if (showing(response.row)) row.value = response.row
  emit('changed', response.row)
  toast.success(
    response.created
      ? __('Done. Next pendiente scheduled.')
      : __('Pendiente completed'),
  )
}
function openReference() {
  const target = reference.value
  if (target?.to) router.push(target.to)
  else if (target?.href) window.location.assign(target.href)
}
// The owner screen of an ask, with the way back to the approval list.
const approvalOpen = computed(() =>
  approval.value?.url
    ? approvalTarget(
        { url: approval.value.url },
        parseQuery(
          Object.fromEntries(
            new URL(approval.value.list, 'https://muelle.invalid').searchParams,
          ),
        ),
      )
    : null,
)
function openApproval() {
  const target = approvalOpen.value
  if (target?.to) router.push(target.to)
  else if (target?.href) window.location.assign(target.href)
}
function reloadAfterConflict() {
  completeOpen.value = false
  load()
}
watch(() => [props.doctype, props.name], load, { immediate: true })
defineExpose({ load, row, sourceSlug })
</script>
