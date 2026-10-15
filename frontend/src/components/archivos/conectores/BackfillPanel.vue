<template>
  <section class="space-y-4" :aria-label="__('Initial import')">
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="flex-1 text-base font-semibold text-ink-gray-9">
        {{ __('Initial import') }}
      </h3>
      <Badge
        :theme="backfillTheme(progress.state)"
        :label="backfillLabel(progress.state)"
      />
    </div>
    <p class="text-sm text-ink-gray-6">
      {{
        __(
          'Brings the documents already in Paperless, a few at a time and within your monthly capacity. First try without importing to see what would come in.',
        )
      }}
    </p>
    <p
      v-if="!connector.enabled"
      class="rounded-lg bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
    >
      {{ __('Resume the connection to try or run the import.') }}
    </p>

    <!-- Running / waiting for capacity: progress first -->
    <div v-if="showProgress" class="space-y-2">
      <div
        class="h-3 w-full overflow-hidden rounded-full bg-surface-gray-2"
        role="progressbar"
        :aria-valuenow="progress.percent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="__('Import progress')"
      >
        <div
          class="h-full rounded-full bg-surface-gray-7 transition-all"
          :style="{ width: `${progress.percent}%` }"
        />
      </div>
      <p class="text-base text-ink-gray-8">
        {{
          __('{0} of {1} imported ({2}%)', [
            progress.imported,
            progress.total,
            progress.percent,
          ])
        }}
      </p>
      <p class="text-sm text-ink-gray-6">
        {{
          [
            __('{0} sent to import', [progress.queued]),
            progress.failed ? __('{0} failed', [progress.failed]) : '',
            progress.started_at
              ? __('started {0}', [relativeTime(progress.started_at)])
              : '',
          ]
            .filter(Boolean)
            .join(' · ')
        }}
      </p>
      <p
        v-if="progress.state === 'Capacity'"
        class="rounded-lg border border-outline-amber-2 bg-surface-amber-1 p-3 text-sm text-ink-gray-8"
      >
        {{
          __(
            'The capacity for this month is used up. The import continues on its own next month from where it stopped, or sooner if your plan grows.',
          )
        }}
      </p>
    </div>
    <p
      v-if="progress.state === 'Complete'"
      class="rounded-lg border border-outline-gray-2 bg-surface-green-1 p-3 text-base text-ink-gray-8"
    >
      {{
        progress.finished_at
          ? __('Finished {0}: {1} imported.', [
              formatWhen(progress.finished_at, locale),
              progress.imported,
            ])
          : __('Finished: {0} imported.', [progress.imported])
      }}
      {{ __('New documents keep coming in on their own.') }}
    </p>
    <p
      v-if="progress.state === 'Failed'"
      role="alert"
      class="rounded-lg border border-outline-red-2 bg-surface-red-1 p-3 text-base text-ink-gray-8"
    >
      {{
        connector.error_message ||
        __(
          'The import stopped because of an error. Check the connection and continue.',
        )
      }}
    </p>

    <!-- Actions -->
    <div v-if="connector.can_manage" class="flex flex-wrap gap-2">
      <Button
        v-if="progress.state === 'Running' || progress.state === 'Capacity'"
        class="min-h-11 sm:min-h-0"
        icon-left="pause"
        :label="__('Pause import')"
        :loading="busy === 'pause'"
        @click="run('pause')"
      />
      <template v-else>
        <Button
          :variant="progress.report ? 'subtle' : 'solid'"
          class="min-h-11 sm:min-h-0"
          :label="
            progress.report
              ? __('Try again without importing')
              : __('Try without importing')
          "
          :loading="busy === 'dry'"
          :disabled="!connector.enabled"
          @click="run('dry')"
        />
        <Button
          v-if="next.action"
          :variant="progress.report ? 'solid' : 'subtle'"
          class="min-h-11 sm:min-h-0"
          :label="next.label"
          :loading="busy === 'start'"
          :disabled="next.disabled || !connector.enabled"
          :title="next.reason || undefined"
          @click="run('start')"
        />
        <Button
          v-if="
            progress.resumable &&
            ['Paused', 'Complete', 'Failed'].includes(progress.state)
          "
          variant="ghost"
          class="min-h-11 sm:min-h-0"
          :label="__('Start over from the beginning')"
          :loading="busy === 'restart'"
          :disabled="next.disabled || !connector.enabled"
          @click="run('restart')"
        />
      </template>
    </div>
    <p v-if="next.reason && next.action" class="text-sm text-ink-gray-6">
      {{ next.reason }}
    </p>
    <p
      v-if="actionError"
      role="alert"
      class="rounded-lg border border-outline-red-2 bg-surface-red-1 p-3 text-base text-ink-red-4"
    >
      {{ actionError }}
    </p>

    <!-- The dry-run report -->
    <div v-if="report" class="space-y-4 border-t border-outline-gray-1 pt-4">
      <p class="text-sm text-ink-gray-6">
        {{ __('Try from {0}', [formatWhen(report.at, locale)]) }}
      </p>
      <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div
          v-for="tile in tiles"
          :key="tile.label"
          class="rounded-lg bg-surface-gray-1 p-3"
        >
          <dt class="text-sm text-ink-gray-6">{{ tile.label }}</dt>
          <dd class="text-xl font-semibold text-ink-gray-9">
            {{ tile.value }}
          </dd>
        </div>
      </dl>
      <p
        class="text-base"
        :class="report.fits_this_month ? 'text-ink-gray-8' : 'text-ink-amber-3'"
      >
        {{ monthsLabel(report) }}
      </p>

      <details v-if="report.document_types?.length" open>
        <summary
          class="flex min-h-11 cursor-pointer items-center text-sm font-medium text-ink-gray-8"
        >
          {{ __('Document types ({0})', [report.document_types.length]) }}
        </summary>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="row in report.document_types"
            :key="row.id"
            class="flex min-h-11 items-center gap-3 py-1.5"
          >
            <span class="min-w-0 flex-1 truncate text-base text-ink-gray-8">{{
              row.name
            }}</span>
            <span class="shrink-0 text-sm text-ink-gray-5">{{
              row.document_count
            }}</span>
            <Badge
              :theme="row.kind && row.kind !== 'Unknown' ? 'blue' : 'gray'"
              :label="kindLabel(row.kind)"
            />
          </li>
        </ul>
      </details>

      <details v-if="report.correspondents?.length">
        <summary
          class="flex min-h-11 cursor-pointer items-center text-sm font-medium text-ink-gray-8"
        >
          {{ __('Who sends the most ({0})', [report.correspondents.length]) }}
        </summary>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="row in report.correspondents"
            :key="row.id"
            class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-1.5"
          >
            <span class="min-w-0 flex-1 truncate text-base text-ink-gray-8">{{
              row.name
            }}</span>
            <span class="shrink-0 text-sm text-ink-gray-5">{{
              __('{0} docs', [row.document_count])
            }}</span>
            <span class="flex w-full items-center gap-2 sm:w-auto">
              <span class="truncate text-sm text-ink-gray-7">{{
                row.party || __('No match yet')
              }}</span>
              <Badge
                v-if="row.via"
                :theme="viaTheme(row.via)"
                :label="viaLabel(row.via)"
              />
            </span>
          </li>
        </ul>
      </details>

      <details v-if="report.sample?.length">
        <summary
          class="flex min-h-11 cursor-pointer items-center text-sm font-medium text-ink-gray-8"
        >
          {{ __('Example of what comes in ({0})', [report.sample.length]) }}
        </summary>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="row in report.sample" :key="row.id" class="py-2">
            <p class="truncate text-base text-ink-gray-9">{{ row.title }}</p>
            <p class="text-sm text-ink-gray-6">
              {{
                [
                  row.created ? formatDay(row.created, locale) : '',
                  row.correspondent,
                  row.document_type,
                ]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </p>
            <p class="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <Badge
                :theme="row.kind && row.kind !== 'Unknown' ? 'blue' : 'gray'"
                :label="kindLabel(row.kind)"
              />
              <span v-if="row.party" class="text-ink-gray-7">
                {{ doctypeLabel(row.party.doctype) }}: {{ row.party.name }}
              </span>
              <span v-else class="text-ink-gray-5">{{
                __('No supplier or customer yet')
              }}</span>
              <Badge
                v-if="row.party?.via"
                :theme="viaTheme(row.party.via)"
                :label="viaLabel(row.party.via)"
              />
            </p>
          </li>
        </ul>
      </details>
    </div>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Badge, Button, toast } from 'frappe-ui'
import {
  archivosApi,
  doctypeLabel,
  formatDay,
  kindLabel,
  problem,
} from '@/composables/useArchivos'
import {
  backfillAction,
  backfillLabel,
  backfillTheme,
  connectorMethod,
  formatWhen,
  monthsLabel,
  relativeTime,
  viaLabel,
  viaTheme,
} from '@/utils/archivosConectores'

const props = defineProps({
  connector: { type: Object, required: true },
})
const emit = defineEmits(['progress', 'refresh'])
const locale =
  (window.lang || document.documentElement.lang || '').replace('_', '-') ||
  undefined

const busy = ref(''),
  actionError = ref('')
const progress = computed(
  () => props.connector.backfill || { state: 'Idle', percent: 0 },
)
const report = computed(() => progress.value.report)
const next = computed(() => backfillAction(progress.value))
const showProgress = computed(
  () =>
    ['Running', 'Capacity', 'Paused', 'Failed'].includes(
      progress.value.state,
    ) && progress.value.total > 0,
)
const tiles = computed(() => {
  const r = report.value || {}
  return [
    { label: __('In Paperless'), value: r.total ?? 0 },
    { label: __('Already in Muelle'), value: r.already_imported ?? 0 },
    { label: __('To import'), value: r.to_import ?? 0 },
    {
      label: __('Left this month'),
      value: r.capacity ? r.capacity.left : '—',
    },
  ]
})

async function run(kind) {
  busy.value = kind
  actionError.value = ''
  const name = props.connector.name
  try {
    let result
    if (kind === 'dry')
      result = await archivosApi(connectorMethod('backfill_dry_run'), { name })
    else if (kind === 'pause')
      result = await archivosApi(connectorMethod('backfill_pause'), { name })
    else
      result = await archivosApi(connectorMethod('backfill_start'), {
        name,
        restart: kind === 'restart' ? 1 : 0,
      })
    emit('progress', result)
    if (kind === 'dry') toast.success(__('Try ready. Nothing was imported.'))
    if (kind === 'start' || kind === 'restart')
      toast.success(__('Import started'))
    if (kind === 'pause') toast.success(__('Import paused'))
  } catch (error) {
    actionError.value = problem(error).message
  } finally {
    busy.value = ''
  }
}

// While importing, refresh the progress every 15 s (the card reloads it).
let timer = null
function stopPolling() {
  if (timer) clearInterval(timer)
  timer = null
}
watch(
  () => progress.value.state,
  (state) => {
    stopPolling()
    if (state === 'Running') timer = setInterval(() => emit('refresh'), 15000)
  },
  { immediate: true },
)
onBeforeUnmount(stopPolling)
</script>
