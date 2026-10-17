<template>
  <article
    class="rounded-xl border border-outline-gray-2 bg-surface-base"
    :aria-labelledby="`conn-${connector.name}`"
  >
    <div class="space-y-3 p-4">
      <!-- Who and how it is doing -->
      <div class="flex items-start gap-3">
        <span
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-gray-2"
          :title="typeLabel(connector.connector_type)"
        >
          <FeatherIcon
            :name="typeIcon(connector.connector_type)"
            class="h-5 w-5 text-ink-gray-7"
          />
        </span>
        <div class="min-w-0 flex-1">
          <h2
            :id="`conn-${connector.name}`"
            class="break-words text-lg font-semibold text-ink-gray-9"
          >
            {{ connector.title || typeLabel(connector.connector_type) }}
          </h2>
          <p class="break-all text-sm text-ink-gray-6">
            {{ addressLine }}
          </p>
        </div>
        <Badge
          class="shrink-0"
          size="lg"
          :theme="healthTheme(health.status)"
          :label="healthLabel(health.status)"
        />
      </div>
      <p
        v-if="health.hint"
        class="rounded-lg p-3 text-base"
        :class="hintClass"
        :role="health.status === 'error' ? 'alert' : undefined"
      >
        {{ health.hint }}
      </p>

      <ul class="space-y-1 text-sm text-ink-gray-7">
        <li v-if="times.length" class="flex flex-wrap gap-x-3 gap-y-1">
          <span v-for="t in times" :key="t.key" :title="t.title">{{
            t.label
          }}</span>
        </li>
        <li v-else>{{ __('Not checked yet') }}</li>
        <li v-if="queue">{{ queue }}</li>
        <li>{{ delivery }}</li>
        <li v-if="version">{{ version }}</li>
        <li v-if="importLine">{{ importLine }}</li>
      </ul>

      <p
        v-if="!connector.can_manage"
        class="rounded-lg bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
      >
        {{
          __(
            'You can see this connection but not change it. Ask an administrator of this company.',
          )
        }}
      </p>

      <!-- What a manager can do now -->
      <div v-else class="flex flex-wrap gap-2">
        <Button
          class="min-h-11 sm:min-h-0"
          :icon-left="connector.enabled ? 'pause' : 'play'"
          :label="connector.enabled ? __('Pause') : __('Resume')"
          :loading="busy === 'enabled'"
          :disabled="blocked && !connector.enabled"
          @click="toggleEnabled"
        />
        <Button
          class="min-h-11 sm:min-h-0"
          icon-left="zap"
          :label="__('Test connection')"
          :loading="busy === 'probe'"
          :disabled="blocked"
          @click="probe"
        />
        <Button
          class="min-h-11 sm:min-h-0"
          icon-left="refresh-cw"
          :label="__('Check now')"
          :loading="busy === 'sync'"
          :disabled="blocked || !connector.enabled"
          :title="
            !connector.enabled ? __('Resume the connection first') : undefined
          "
          @click="syncNow"
        />
      </div>
      <p
        v-if="actionError"
        role="alert"
        class="rounded-lg border border-outline-red-2 bg-surface-red-1 p-3 text-base text-ink-red-4"
      >
        {{ actionError }}
      </p>
      <p v-if="actionNote" role="status" class="text-sm text-ink-gray-7">
        {{ actionNote }}
      </p>

      <!-- Failed work never stays a dead end: retry it or open its document -->
      <div v-if="connector.can_manage && health.failed" class="space-y-2">
        <Button
          v-if="!problems.length"
          variant="ghost"
          class="min-h-11 sm:min-h-0"
          icon-left="alert-triangle"
          :label="__('See what failed')"
          :loading="detailLoading"
          @click="refresh"
        />
        <ul v-else class="space-y-2" :aria-label="__('What failed')">
          <li
            v-for="task in problems"
            :key="task.name"
            class="flex flex-wrap items-center gap-2 rounded-lg bg-surface-gray-1 p-3 text-sm"
          >
            <span class="min-w-0 flex-1 text-ink-gray-8">
              {{ taskLabel(task) }}
              <span class="block text-ink-gray-6">{{
                task.error_message
              }}</span>
            </span>
            <Button
              v-if="task.state === 'Failed'"
              class="min-h-11 sm:min-h-0"
              :label="__('Try again')"
              :loading="busy === task.name"
              @click="retry(task)"
            />
            <a
              v-else-if="task.document"
              :href="archivosHref({ document: task.document })"
              class="inline-flex min-h-11 items-center rounded px-3 text-ink-gray-8 hover:bg-surface-gray-2 sm:min-h-8"
              >{{ __('Verify in the document') }}</a
            >
          </li>
        </ul>
      </div>
    </div>

    <!-- Sections: one open at a time so a phone screen stays readable -->
    <!-- Locked (no Documentos in the plan, or stopped): settings talk to the
         archive, so they wait; the page's guard says what unlocks them. -->
    <div
      v-if="connector.can_manage && !blocked"
      class="flex flex-wrap gap-1 border-t border-outline-gray-1 px-2 py-2"
      role="group"
      :aria-label="__('Settings of {0}', [connector.title])"
    >
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        class="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm sm:min-h-9"
        :class="
          panel === tab.value
            ? 'bg-surface-gray-3 font-medium text-ink-gray-9'
            : 'text-ink-gray-7 hover:bg-surface-gray-2'
        "
        :aria-expanded="panel === tab.value ? 'true' : 'false'"
        @click="openPanel(tab.value)"
      >
        <FeatherIcon :name="tab.icon" class="h-4 w-4" />{{ tab.label }}
      </button>
    </div>
    <div v-if="panel && !blocked" class="border-t border-outline-gray-1 p-4">
      <ConnectorForm
        v-if="panel === 'edit'"
        :connector="connector"
        :company="connector.company"
        :catalog="catalog"
        :catalog-loading="catalogLoading"
        :catalog-error="catalogError"
        @load-catalog="loadCatalog"
        @saved="onSaved"
        @cancel="panel = ''"
      />
      <BackfillPanel
        v-else-if="panel === 'import'"
        :connector="connector"
        @progress="onProgress"
        @refresh="refresh"
      />
      <template v-else-if="panel === 'maps'">
        <div v-if="!detail && detailLoading" class="space-y-2" aria-busy="true">
          <div class="h-12 animate-pulse rounded bg-surface-gray-2" />
          <div class="h-12 animate-pulse rounded bg-surface-gray-2" />
        </div>
        <ArchivoGuard
          v-else-if="detailProblem"
          :state="detailProblem"
          @action="refresh"
        />
        <MappingsPanel
          v-else-if="detail"
          :name="connector.name"
          :maps="detail.maps || []"
          :kinds="kinds"
          :catalog="catalog"
          :catalog-loading="catalogLoading"
          :catalog-error="catalogError"
          @load-catalog="loadCatalog"
          @saved="onDetail"
        />
      </template>
      <SetupPanel
        v-else-if="panel === 'setup'"
        :connector="connector"
        @connector="emit('updated', $event)"
      />
    </div>
  </article>
</template>
<script setup>
import { computed, ref } from 'vue'
import { Badge, Button, FeatherIcon, toast } from 'frappe-ui'
import ArchivoGuard from '../ArchivoGuard.vue'
import BackfillPanel from './BackfillPanel.vue'
import ConnectorForm from './ConnectorForm.vue'
import MappingsPanel from './MappingsPanel.vue'
import SetupPanel from './SetupPanel.vue'
import { archivosApi, archivosHref, problem } from '@/composables/useArchivos'
import {
  backfillLabel,
  connectorMethod,
  deliveryLabel,
  healthLabel,
  healthTheme,
  queueLabel,
  timeline,
  typeIcon,
  typeLabel,
  versionLabel,
} from '@/utils/archivosConectores'

const props = defineProps({
  connector: { type: Object, required: true },
  kinds: { type: Array, default: () => [] },
  // The site stopped connectors or the plan has no automation: nothing runs.
  blocked: { type: Boolean, default: false },
})
const emit = defineEmits(['updated'])
const locale =
  (window.lang || document.documentElement.lang || '').replace('_', '-') ||
  undefined

const panel = ref(''),
  busy = ref(''),
  actionError = ref(''),
  actionNote = ref(''),
  detail = ref(null),
  detailLoading = ref(false),
  detailProblem = ref(null),
  catalog = ref(null),
  catalogLoading = ref(false),
  catalogError = ref('')

const isPaperless = computed(() => props.connector.connector_type !== 'Mailbox')
const health = computed(() => props.connector.health || {})
const times = computed(() => timeline(props.connector, new Date(), locale))
const queue = computed(() => queueLabel(health.value))
const delivery = computed(() => deliveryLabel(props.connector))
const version = computed(() => versionLabel(props.connector))
const addressLine = computed(() => {
  const c = props.connector
  if (!isPaperless.value)
    return [
      c.remote_account,
      c.mail_folder && __('folder {0}', [c.mail_folder]),
    ]
      .filter(Boolean)
      .join(' · ')
  return c.base_url || ''
})
const importLine = computed(() => {
  const b = props.connector.backfill
  if (!b || !b.state || b.state === 'Idle') return ''
  if (['Running', 'Paused', 'Capacity'].includes(b.state) && b.total)
    return __('Initial import: {0}, {1}%', [backfillLabel(b.state), b.percent])
  return __('Initial import: {0}', [backfillLabel(b.state)])
})
const hintClass = computed(() => {
  const s = health.value.status
  if (s === 'error' || s === 'stopped')
    return 'border border-outline-red-2 bg-surface-red-1 text-ink-gray-9'
  if (s === 'late')
    return 'border border-outline-amber-2 bg-surface-amber-1 text-ink-gray-9'
  return 'bg-surface-gray-1 text-ink-gray-8'
})
const tabs = computed(() => {
  const out = [{ value: 'edit', icon: 'edit-2', label: __('Edit') }]
  if (isPaperless.value)
    out.push(
      { value: 'import', icon: 'download-cloud', label: __('Initial import') },
      { value: 'maps', icon: 'shuffle', label: __('Mappings') },
      { value: 'setup', icon: 'bell', label: __('Notifications in Paperless') },
    )
  return out
})

const problems = computed(
  () =>
    detail.value?.problems ||
    (detail.value?.tasks || []).filter((t) =>
      ['Failed', 'Uncertain'].includes(t.state),
    ),
)
const OPERATIONS = {
  Import: 'Import of Paperless document {0}',
  Export: 'Sending to Paperless for OCR',
  Sync: 'Periodic check',
  Backfill: 'Initial import page',
}
function taskLabel(task) {
  return __(OPERATIONS[task.operation] || OPERATIONS.Sync, [task.remote_id])
}
async function retry(task) {
  busy.value = task.name
  actionError.value = ''
  try {
    await archivosApi('doco.docoutils.documents.api.retry_task', {
      name: task.name,
    })
    toast.success(__('Trying again'))
    await refresh()
  } catch (error) {
    actionError.value = problem(error).message
  } finally {
    busy.value = ''
  }
}

function openPanel(value) {
  panel.value = panel.value === value ? '' : value
  if (panel.value === 'maps') refresh()
}

async function act(kind, method, args) {
  busy.value = kind
  actionError.value = ''
  actionNote.value = ''
  try {
    return await archivosApi(connectorMethod(method), {
      name: props.connector.name,
      ...args,
    })
  } catch (error) {
    actionError.value = problem(error).message
    return null
  } finally {
    busy.value = ''
  }
}
async function toggleEnabled() {
  const result = await act('enabled', 'set_enabled', {
    enabled: props.connector.enabled ? 0 : 1,
  })
  if (!result) return
  emit('updated', result)
  toast.success(
    result.enabled ? __('Connection resumed') : __('Connection paused'),
  )
}
async function probe() {
  const result = await act('probe', 'probe')
  if (!result) return
  if (result.connector) emit('updated', result.connector)
  const r = result.result || {}
  actionNote.value = isPaperless.value
    ? __('It works: Paperless {0}, API {1}.', [r.version, r.api_version])
    : __('It works: {0} emails in the folder {1}.', [r.messages, r.folder])
  toast.success(__('Connection works'))
}
async function syncNow() {
  const result = await act('sync', 'sync_now')
  if (!result) return
  actionNote.value = __(
    'Check requested. New documents show up in Archivos in a few minutes.',
  )
}

// Detail (mappings, recent tasks) loads when a section needs it.
async function refresh() {
  detailLoading.value = true
  detailProblem.value = null
  try {
    onDetail(
      await archivosApi(connectorMethod('detail'), {
        name: props.connector.name,
      }),
    )
  } catch (error) {
    detailProblem.value = problem(error)
  } finally {
    detailLoading.value = false
  }
}
function onDetail(value) {
  detail.value = value
  // The card keeps the connector; maps and recent tasks stay in `detail`.
  const connector = { ...(value || {}) }
  delete connector.maps
  delete connector.tasks
  delete connector.problems
  if (connector.name) emit('updated', connector)
}
function onProgress(backfill) {
  emit('updated', { ...props.connector, backfill })
}
function onSaved(saved) {
  emit('updated', saved)
  panel.value = ''
  toast.success(__('Connection saved'))
}
async function loadCatalog() {
  if (catalogLoading.value) return
  catalogLoading.value = true
  catalogError.value = ''
  try {
    catalog.value = await archivosApi(connectorMethod('catalog'), {
      name: props.connector.name,
    })
  } catch (error) {
    catalogError.value = problem(error).message
  } finally {
    catalogLoading.value = false
  }
}
</script>
