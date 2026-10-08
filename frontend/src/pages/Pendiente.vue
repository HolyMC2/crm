<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div
      class="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10 sm:pt-6"
    >
      <RouterLink
        :to="backTarget"
        class="inline-flex min-h-11 items-center gap-1 rounded-lg text-sm text-ink-gray-6 hover:text-ink-gray-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:min-h-8"
      >
        <FeatherIcon name="arrow-left" class="h-4 w-4" />{{ backLabel }}
      </RouterLink>
      <div
        v-if="loading && !row"
        role="status"
        class="py-8 text-sm text-ink-gray-6"
      >
        {{ __('Loading pendiente…') }}
      </div>
      <section
        v-else-if="problem && !row"
        role="alert"
        class="mt-4 space-y-3 rounded-lg bg-surface-red-1 p-4 text-ink-red-7"
      >
        <p>
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button :label="__('Retry')" @click="load" />
          <Button :label="backLabel" @click="router.push(backTarget)" />
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
              class="rounded-full bg-surface-gray-2 px-2 py-0.5 text-ink-gray-7"
              >{{ sourceLabel(row) }}</span
            >
            <span
              v-if="row.priority === 'High'"
              class="rounded-full bg-surface-amber-1 px-2 py-0.5 text-ink-amber-7"
              >{{ priorityLabel(row.priority) }}</span
            >
          </div>
          <h1 class="whitespace-pre-line text-xl font-semibold text-ink-gray-9">
            {{ row.description }}
          </h1>
        </header>
        <section
          v-if="row.body"
          class="mt-4 rounded-lg bg-surface-gray-1 p-3"
          aria-labelledby="pendiente-body"
        >
          <h2 id="pendiente-body" class="text-sm font-medium text-ink-gray-6">
            {{ __('Instructions') }}
          </h2>
          <p class="mt-1 whitespace-pre-line text-base text-ink-gray-8">
            {{ row.body }}
          </p>
        </section>

        <div
          v-if="problem"
          role="alert"
          class="mt-4 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
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

        <!-- One solid next action; the rest stay secondary. -->
        <div
          class="fixed inset-x-0 bottom-14 z-20 flex flex-wrap gap-2 border-t border-outline-gray-2 bg-surface-base px-4 py-3 sm:static sm:mt-5 sm:border-0 sm:bg-transparent sm:p-0"
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
              :label="__('Done and schedule next')"
              :disabled="busy"
              @click="completeOpen = true"
            />
            <Dropdown :options="rescheduleOptions">
              <Button
                class="min-h-11 sm:min-h-8"
                icon-left="calendar"
                :label="__('Reschedule')"
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
          <Button
            v-if="row.can_edit"
            class="min-h-11 sm:min-h-8"
            icon-left="edit-2"
            :label="__('Edit task')"
            :disabled="busy"
            @click="editTask"
          />
          <Button
            v-if="reference"
            class="min-h-11 sm:min-h-8"
            icon-left="external-link"
            :label="__('Open {0}', [referenceName])"
            @click="openReference"
          />
        </div>
        <p
          v-if="!row.can_write && row.blocked_reason"
          class="mt-2 text-sm text-ink-gray-6"
        >
          {{ row.blocked_reason }}
        </p>
        <p
          v-else-if="canReopen && row.cancelled"
          class="mt-2 text-sm text-ink-gray-6"
        >
          {{
            __('This pendiente was cancelled. Reopen it to work on it again.')
          }}
        </p>

        <dl class="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div>
            <dt class="text-sm text-ink-gray-6">{{ __('Due') }}</dt>
            <dd
              class="text-base"
              :class="row.group === 'overdue' ? 'text-ink-red-6' : ''"
            >
              {{ row.date ? formatDay(row.date) : __('No date') }} ·
              {{ dueText(row, today) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-ink-gray-6">{{ __('Assigned to') }}</dt>
            <dd class="text-base">
              {{ row.mine ? __('You (assignee)') : row.assigned_to || '—' }}
            </dd>
          </div>
          <div v-if="row.activity_type">
            <dt class="text-sm text-ink-gray-6">{{ __('Activity') }}</dt>
            <dd class="text-base">{{ __(row.activity_type) }}</dd>
          </div>
          <div>
            <dt class="text-sm text-ink-gray-6">{{ __('Record') }}</dt>
            <dd class="text-base">
              <button
                v-if="reference"
                class="text-left text-ink-blue-link underline-offset-2 hover:underline"
                @click="openReference"
              >
                {{ referenceName }}
              </button>
              <span v-else>{{ __('Not linked to a record') }}</span>
            </dd>
          </div>
        </dl>

        <section v-if="reference" class="mt-8" aria-labelledby="pendiente-next">
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
            class="mt-3"
            icon-left="plus"
            :label="__('Add next pendiente')"
            @click="createOpen = true"
          />
        </section>
      </template>
    </div>
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
      :reference="row && reference ? row : null"
      @created="load"
    />
    <DoctypeModals v-if="nativeEditor" />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Dropdown, FeatherIcon, toast } from 'frappe-ui'
import CompleteDialog from '@/components/pendientes/CompleteDialog.vue'
import CreateDialog from '@/components/pendientes/CreateDialog.vue'
import { loadShell, shellBoot } from '@/composables/muelleShell'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { formatDay } from '@/utils/contactos'
import { safeIntendedRoute } from '@/utils/shellRoutes'
import {
  canCreateOn,
  datePresets,
  dueText,
  pendienteError,
  pendienteRoute,
  pendientesApi,
  priorityLabel,
  referenceTarget,
  requestId,
  sourceFromSlug,
  sourceLabel,
  sourceSlug,
} from '@/composables/usePendientes'

// CRM's own wired CRM Task editor (assignee, time, body), loaded only when used.
const DoctypeModals = defineAsyncComponent(
  () => import('@/components/Modals/DoctypeModals.vue'),
)
const { showModal } = useDoctypeModal()
const props = defineProps({
  source: { type: String, required: true },
  name: { type: String, required: true },
})
const route = useRoute(),
  router = useRouter()
const row = ref(null),
  loading = ref(false),
  saving = ref(false),
  problem = ref(null),
  completeOpen = ref(false),
  createOpen = ref(false),
  nativeEditor = ref(false)
const boot = computed(() => shellBoot.value?.modules?.pendientes || null)
const today = computed(() => boot.value?.today || '')
const doctype = computed(() => sourceFromSlug(props.source))
const busy = computed(() => loading.value || saving.value)
const canAct = computed(
  () => Boolean(row.value?.can_write) && !row.value?.cancelled,
)
// Cancelled work is not completable, but its owner can always reopen it.
const canReopen = computed(
  () => Boolean(row.value?.can_write) && row.value?.status === 'Closed',
)
const reference = computed(() => referenceTarget(row.value))
const referenceName = computed(
  () => row.value?.reference_label || row.value?.reference_name || '',
)
// Opened from another shell page (Hoy) with the return protocol: back goes there.
const returnTo = computed(() => {
  const value = route.query.return_to
  return typeof value === 'string' && value.startsWith('/crm/')
    ? safeIntendedRoute(value, '')
    : ''
})
const backTarget = computed(() =>
  returnTo.value
    ? returnTo.value.replace(/^\/crm/, '')
    : {
        name: 'Pendientes',
        query: Object.fromEntries(
          new URLSearchParams(String(route.query.list || '')),
        ),
      },
)
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        String(route.query.return_label || 'Hoy').slice(0, 40),
      ])
    : __('Back to Pendientes'),
)
const statusText = computed(() =>
  row.value.cancelled
    ? __('Cancelled')
    : row.value.status === 'Closed'
      ? __('Completed')
      : row.value.group === 'overdue'
        ? __('Late')
        : __('To do'),
)
const statusClass = computed(() =>
  row.value.status === 'Closed'
    ? 'bg-surface-green-1 text-ink-green-7'
    : row.value.group === 'overdue'
      ? 'bg-surface-red-1 text-ink-red-7'
      : 'bg-surface-blue-1 text-ink-blue-7',
)
const rescheduleOptions = computed(() =>
  datePresets(today.value)
    .filter((preset) => preset.value !== row.value?.date)
    .map((preset) => ({
      label: preset.label,
      onClick: () => reschedule(preset.value),
    })),
)

// Only the latest request for the URL's record may fill the screen.
let generation = 0
async function load() {
  const current = ++generation
  if (row.value && !showing(row.value)) row.value = null
  if (!doctype.value) {
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
      doctype: doctype.value,
      name: props.name,
    })
    if (current !== generation) return
    if (response.redirect) {
      router.replace(pendienteRoute(response.redirect, route.query))
      return
    }
    row.value = response
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
    if (showing(response.row)) row.value = response.row
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
function showing(item) {
  return (
    Boolean(item) &&
    sourceSlug(item) === props.source &&
    String(item.name) === props.name
  )
}
function afterComplete(response) {
  if (showing(response.row)) row.value = response.row
  toast.success(
    response.created
      ? __('Done. Next pendiente scheduled.')
      : __('Pendiente completed'),
  )
}
function editTask() {
  nativeEditor.value = true
  showModal({
    doctype: 'CRM Task',
    name: String(row.value.name),
    title: __('Task'),
    callbacks: { afterUpdate: load },
  })
}
function openReference() {
  const target = reference.value
  if (target?.to) router.push(target.to)
  else if (target?.href) window.location.assign(target.href)
}
watch(() => [props.source, props.name], load, { immediate: true })
function reloadAfterConflict() {
  completeOpen.value = false
  load()
}
</script>
