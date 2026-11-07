<template>
  <div
    class="flex h-full min-w-0 flex-col gap-4 px-3 py-6 text-ink-gray-8 sm:px-6 sm:py-8"
  >
    <header class="flex flex-wrap items-center gap-2 px-2">
      <button
        type="button"
        class="press flex size-9 flex-none items-center justify-center rounded-4 hover:bg-surface-gray-2"
        :aria-label="__('Back to connections')"
        :title="__('Back to connections')"
        :disabled="pending"
        @click="back"
      >
        <span class="lucide-chevron-left size-5" aria-hidden="true" />
      </button>
      <h2
        class="title-face min-w-0 flex-1 truncate text-2xl-semibold leading-tight"
      >
        {{ doc?.title || __('Connection') }}
      </h2>
      <div v-if="resource.isDirty" class="flex items-center gap-2">
        <Button
          class="press"
          variant="subtle"
          :label="__('Discard')"
          :disabled="pending"
          @click="discardSettingsDocument(resource)"
        />
        <Button
          class="press"
          variant="solid"
          :label="__('Save')"
          :loading="resource.save.loading"
          @click="save"
        />
      </div>
    </header>
    <p v-if="error" role="alert" class="px-2 text-p-sm text-ink-red-7">
      {{ error }}
    </p>
    <p v-if="!doc && !error" class="px-2 text-p-sm text-ink-gray-5">
      {{ __('Loading…') }}
    </p>

    <div
      v-if="doc"
      class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-2 pb-6"
    >
      <section class="flex flex-col gap-2">
        <FormControl v-model="doc.title" :label="__('Name')" />
        <SettingSwitch
          v-model="doc.enabled"
          :label="__('Enabled')"
          :description="
            __(
              'New connections start disabled. Enable after «Send test event» succeeds.',
            )
          "
          :blocked="!doc.enabled && summary?.blocker ? summary.blocker : ''"
        />
      </section>

      <section :aria-labelledby="`${id}-connect`" class="flex flex-col gap-3">
        <h3 :id="`${id}-connect`" class="title-face text-lg font-semibold">
          {{ __('Connect n8n') }}
        </h3>
        <ol class="flex flex-col gap-4">
          <li class="flex flex-col gap-1">
            <FormControl
              v-model="doc.webhook_url"
              type="url"
              :label="__('1. Webhook URL')"
              placeholder="https://n8n.example.com/webhook/…"
            />
            <p class="text-p-sm text-ink-gray-5">
              {{
                __(
                  "Your n8n Webhook node's production URL. It must start with https://; for an n8n on your own network, ask support to allow its address.",
                )
              }}
            </p>
          </li>
          <li class="flex flex-col gap-1">
            <Link
              v-model="doc.integration_user"
              doctype="User"
              :filters="{ enabled: 1, user_type: 'System User' }"
              :label="__('2. Acts as user')"
            />
            <p class="text-p-sm text-ink-gray-5">
              {{
                __(
                  "Events carry only what this user may read, and the connection's API calls use this user's API key. Use a dedicated user with only the roles the workflow needs.",
                )
              }}
            </p>
          </li>
          <li class="flex flex-col gap-2">
            <p class="text-p-base-medium">
              {{ __('3. API access for n8n (HTTP Request credential)') }}
            </p>
            <CopyLine :label="__('Base URL')" :value="origin" />
            <CopyLine
              :label="__('Check the credential with')"
              :value="`GET ${origin}/api/method/crm.api.integration.whoami`"
            />
            <template v-if="keys">
              <CopyLine
                :label="__('Header «Authorization»')"
                :value="`token ${keys.api_key}:${keys.api_secret}`"
              />
              <p class="text-p-sm text-ink-amber-8">
                {{
                  __(
                    'Copy it now: the secret is shown only once. Paste it into an n8n «Header Auth» credential.',
                  )
                }}
              </p>
            </template>
            <p v-else class="text-p-sm text-ink-gray-6">
              {{
                summary?.api_key_ready
                  ? __(
                      'This user already has an API key. Making a new secret stops flows that use the old one until you paste the new one.',
                    )
                  : __('This user has no API key yet.')
              }}
            </p>
            <Button
              class="press self-start"
              variant="subtle"
              icon-left="lucide-key"
              :label="
                confirmKey
                  ? __('Yes, make a new secret')
                  : summary?.api_key_ready
                    ? __('Make a new API secret')
                    : __('Create API key')
              "
              :loading="busy === 'keys'"
              :disabled="!doc.integration_user || pending"
              @click="createKeys"
            />
          </li>
          <li class="flex flex-col gap-2">
            <p class="text-p-base-medium">{{ __('4. Signing secret') }}</p>
            <p class="text-p-sm text-ink-gray-5">
              {{
                __(
                  'Every event is signed (Standard Webhooks). Check the webhook-signature header in n8n with this secret to accept only events from this CRM.',
                )
              }}
            </p>
            <CopyLine
              v-if="secret"
              :label="__('Signing secret')"
              :value="secret"
            />
            <p v-if="rotationOpen" class="text-p-sm text-ink-gray-6">
              {{
                __(
                  'Events also carry the old signature until {0}. Paste the new secret into n8n before then.',
                  [formatDateTime(doc.previous_secret_until)],
                )
              }}
            </p>
            <div class="flex flex-wrap gap-2">
              <Button
                class="press"
                variant="subtle"
                icon-left="lucide-eye"
                :label="secret ? __('Hide') : __('Show signing secret')"
                :loading="busy === 'secret'"
                :disabled="pending"
                @click="toggleSecret"
              />
              <Button
                class="press"
                variant="subtle"
                icon-left="lucide-refresh-cw"
                :label="
                  confirmRotate
                    ? __('Yes, replace the secret')
                    : __('Replace secret')
                "
                :loading="busy === 'rotate'"
                :disabled="pending"
                @click="rotate"
              />
            </div>
          </li>
          <li class="flex flex-col gap-2">
            <p class="text-p-base-medium">{{ __('5. Send a test event') }}</p>
            <Button
              class="press self-start"
              variant="solid"
              icon-left="lucide-send"
              :label="__('Send test event')"
              :loading="busy === 'test'"
              :disabled="!doc.webhook_url || pending"
              @click="sendTest"
            />
            <p
              v-if="test"
              role="status"
              class="text-p-sm"
              :class="
                test.status === 'Delivered'
                  ? 'text-ink-green-8'
                  : 'text-ink-red-7'
              "
            >
              {{ testText }}
            </p>
          </li>
        </ol>
      </section>

      <section :aria-labelledby="`${id}-events`" class="flex flex-col gap-3">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 :id="`${id}-events`" class="title-face text-lg font-semibold">
            {{ __('Events') }}
          </h3>
          <span class="num text-p-sm text-ink-gray-6">{{
            __('{0} chosen', [(doc.subscriptions || []).length])
          }}</span>
        </div>
        <fieldset
          v-for="group in groups"
          :key="group.key"
          class="flex flex-col gap-1"
        >
          <legend class="mb-1 text-p-base-medium text-ink-gray-8">
            {{ group.label }}
          </legend>
          <div v-for="item in group.events" :key="item.event">
            <label class="flex min-h-11 cursor-pointer items-start gap-2 py-1">
              <input
                type="checkbox"
                class="mt-0.5 size-4 flex-none"
                :checked="has(item.event)"
                @change="
                  (event) => toggle(item.event, null, event.target.checked)
                "
              />
              <span class="min-w-0">
                <span class="block text-p-sm text-ink-gray-8">{{
                  item.label || item.description
                }}</span>
                <code class="text-xs text-ink-gray-5">{{ item.event }}</code>
              </span>
            </label>
            <WatchedFields
              v-if="item.watches_fields && has(item.event)"
              class="mb-1 ml-6"
              :value="rowOf(item.event)?.only_fields"
              @change="(value) => setWatched(item.event, null, value)"
            />
          </div>
        </fieldset>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-p-base-medium text-ink-gray-8">
            {{ __('Any record type') }}
          </legend>
          <p class="text-p-sm text-ink-gray-5">
            {{
              __(
                'Invoices, orders, payments, products, appointments or any other record this user can read.',
              )
            }}
          </p>
          <div
            v-for="type in documentTypes"
            :key="type"
            class="flex flex-col gap-1 rounded-4 bg-surface-gray-1 p-2"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-p-base-medium">{{ __(type) }}</span>
              <button
                type="button"
                class="press flex size-8 items-center justify-center rounded-4 text-ink-gray-6 hover:bg-surface-gray-2"
                :aria-label="__('Stop sending {0}', [__(type)])"
                :title="__('Stop sending {0}', [__(type)])"
                @click="dropType(type)"
              >
                <span class="lucide-x size-4" aria-hidden="true" />
              </button>
            </div>
            <div class="flex flex-wrap gap-x-4 gap-y-1">
              <label
                v-for="item in documentEvents"
                :key="item.event"
                class="flex min-h-11 cursor-pointer items-center gap-1.5 text-p-sm"
                :title="item.label || item.description"
              >
                <input
                  type="checkbox"
                  class="size-4"
                  :checked="has(item.event, type)"
                  @change="
                    (event) => toggle(item.event, type, event.target.checked)
                  "
                />
                {{ DOCUMENT_WORDS[item.event] || item.event }}
              </label>
            </div>
            <WatchedFields
              v-if="has('document.updated', type)"
              :value="rowOf('document.updated', type)?.only_fields"
              @change="(value) => setWatched('document.updated', type, value)"
            />
          </div>
          <div class="relative">
            <input
              v-model="typeQuery"
              type="search"
              class="h-9 w-full min-w-0 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
              :placeholder="__('Add a record type, for example Sales Invoice')"
              :aria-label="__('Add a record type')"
              @input="searchTypes"
            />
            <ul
              v-if="typeResults.length"
              class="mt-1 max-h-56 overflow-y-auto rounded-4 border border-outline-gray-2 bg-surface-base"
              :aria-label="__('Record types')"
            >
              <li v-for="row in typeResults" :key="row.name">
                <button
                  type="button"
                  class="press flex w-full items-baseline justify-between gap-2 px-2 py-2 text-left text-sm hover:bg-surface-gray-2"
                  @click="addType(row)"
                >
                  <span class="min-w-0 truncate">{{ row.label }}</span>
                  <span class="flex-none text-xs text-ink-gray-5">{{
                    row.module
                  }}</span>
                </button>
              </li>
            </ul>
            <p
              v-else-if="typeQuery.trim() && !typeLoading"
              class="mt-1 text-p-sm text-ink-gray-5"
            >
              {{
                __(
                  'No record type matches, or this user cannot read it. Give the user a role that can read it first.',
                )
              }}
            </p>
          </div>
        </fieldset>

        <SettingSwitch
          v-model="doc.skip_own_changes"
          :label="__('Skip changes this connection made')"
          :description="
            __(
              'Record and document events are not sent for changes made with this connection\'s own user, so a flow that writes back does not trigger itself.',
            )
          "
        />
      </section>

      <section :aria-labelledby="`${id}-channel`" class="flex flex-col gap-2">
        <h3 :id="`${id}-channel`" class="title-face text-lg font-semibold">
          {{ __('Inbox channel') }}
        </h3>
        <SettingSwitch
          v-model="doc.api_channel"
          :label="__('Use as an inbox channel')"
          :description="
            __(
              'Optional. Lets this connection bring messages from another channel (email, SMS, Telegram…) into the CRM inbox. Replies written in the inbox leave as message.created events with direction «out».',
            )
          "
        />
        <CopyLine
          v-if="doc.api_channel && doc.channel_account_id"
          :label="__('Channel account')"
          :value="doc.channel_account_id"
        />
        <CopyLine
          v-if="doc.api_channel"
          :label="__('Bring a customer message in with')"
          :value="`POST ${origin}/api/method/crm.api.integration.channel_message`"
        />
      </section>

      <section :aria-labelledby="`${id}-health`" class="flex flex-col gap-2">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 :id="`${id}-health`" class="title-face text-lg font-semibold">
            {{ __('Deliveries') }}
          </h3>
          <button
            type="button"
            class="press text-p-sm text-ink-gray-7 underline"
            @click="loadSummary"
          >
            {{ __('Refresh') }}
          </button>
        </div>
        <dl class="flex flex-wrap gap-2">
          <div
            v-for="item in counts"
            :key="item.key"
            class="min-w-24 rounded-4 border border-outline-gray-2 px-3 py-2"
          >
            <dt class="text-xs text-ink-gray-6">{{ item.label }}</dt>
            <dd
              class="num text-lg font-semibold"
              :class="item.alarm && item.value ? 'text-ink-red-7' : ''"
            >
              {{ item.value }}
            </dd>
          </div>
        </dl>
        <p v-if="doc.last_error" class="text-p-sm text-ink-gray-7">
          {{ __('Last error: {0}', [__(doc.last_error)]) }}
        </p>
        <ul
          v-if="summary?.problems?.length"
          class="divide-y divide-outline-gray-1"
          :aria-label="__('Events that did not arrive')"
        >
          <li
            v-for="row in summary.problems"
            :key="row.name"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
          >
            <span class="min-w-0 flex-1 basis-48">
              <code class="block text-xs text-ink-gray-7">{{ row.event }}</code>
              <span class="block text-p-sm text-ink-gray-6">
                {{ statusLabel(row.status) }} ·
                {{ formatDateTime(row.modified) }}
              </span>
              <span
                v-if="row.last_error"
                class="block text-p-sm text-ink-gray-5 [overflow-wrap:anywhere]"
                >{{ __(row.last_error) }}</span
              >
            </span>
            <Button
              class="press"
              variant="subtle"
              :label="__('Send again')"
              :loading="busy === row.name"
              :disabled="pending || !doc.enabled"
              @click="redeliver(row)"
            />
          </li>
        </ul>
        <p v-if="summary?.problems?.length && !doc.enabled" class="text-p-sm">
          {{ __('Enable the connection before sending its events again.') }}
        </p>
      </section>

      <section class="flex flex-col gap-2">
        <FormControl
          v-model="doc.description"
          type="textarea"
          :rows="2"
          :label="__('Notes')"
        />
        <button
          type="button"
          class="press flex h-9 items-center gap-1 self-start rounded-4 px-2 text-sm"
          :class="
            confirmDelete
              ? 'bg-surface-red-2 text-ink-red-7'
              : 'text-ink-gray-6 hover:bg-surface-gray-2'
          "
          :disabled="pending"
          @click="remove"
        >
          <span class="lucide-trash-2 size-4" aria-hidden="true" />
          {{
            confirmDelete
              ? __('Delete this connection and its delivery history')
              : __('Delete connection')
          }}
        </button>
      </section>
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, useId } from 'vue'
import { Button, FormControl, call, toast } from 'frappe-ui'
import Link from '@/components/Controls/Link.vue'
import SettingSwitch from '@/components/Settings/Inbox/SettingSwitch.vue'
import {
  discardSettingsDocument,
  settingsDocumentResource,
  settingsErrorMessage,
  useSettingsDraft,
} from '@/composables/settingsSession'
import { formatDateTime, parseServerDate } from '@/utils/display'
import CopyLine from './CopyLine.vue'
import WatchedFields from './WatchedFields.vue'

const props = defineProps({ name: { type: String, required: true } })
const emit = defineEmits(['back'])
const API = 'crm.api.integration.'
const DOCTYPE = 'CRM Integration'
const SUBSCRIPTION = 'CRM Integration Subscription'
const GROUPS = [
  {
    key: 'conversations',
    label: __('Conversations'),
    records: [
      'CRM Conversation',
      'CRM Conversation Note',
      'CRM Conversation Rating',
    ],
  },
  {
    key: 'messages',
    label: __('Messages and replies'),
    records: ['Message', 'CRM Outbound Intent'],
  },
  {
    key: 'records',
    label: __('Contacts, leads, deals and inquiries'),
    records: ['Contact', 'CRM Lead', 'CRM Deal', 'CRM Inquiry'],
  },
  {
    key: 'assistant',
    label: __('Business assistant'),
    records: ['Books Chat Log'],
  },
]
const DOCUMENT_WORDS = {
  'document.created': __('Created'),
  'document.updated': __('Changed'),
  'document.submitted': __('Submitted'),
  'document.cancelled': __('Cancelled'),
  'document.deleted': __('Deleted'),
}
const STATUS = {
  Delivered: __('Delivered'),
  Pending: __('Waiting to send'),
  Sending: __('Waiting to send'),
  Failed: __('Retrying'),
  Dead: __('Gave up'),
  Skipped: __('Not sent'),
}
const id = useId()
const origin = window.location.origin
const error = ref(''),
  catalog = ref([]),
  summary = ref(null),
  busy = ref(''),
  secret = ref(''),
  keys = ref(null),
  test = ref(null),
  confirmKey = ref(false),
  confirmRotate = ref(false),
  confirmDelete = ref(false),
  extraTypes = ref([]),
  typeQuery = ref(''),
  typeResults = ref([]),
  typeLoading = ref(false)
let typeTimer,
  typeRequest = 0

const resource = settingsDocumentResource({
  doctype: DOCTYPE,
  name: props.name,
  onError: (e) => (error.value = settingsErrorMessage(e)),
})
const doc = computed(() => resource.doc)
const pending = computed(() => !!busy.value || resource.save.loading)
const rotationOpen = computed(
  () => (parseServerDate(doc.value?.previous_secret_until) || 0) > new Date(),
)
const message = (e, fallback) =>
  e?.messages?.length ? String(e.messages[0]).replace(/<[^>]+>/g, '') : fallback
const statusLabel = (status) => STATUS[status] || status

useSettingsDraft({
  dirty: () => resource.isDirty,
  pending: () => pending.value,
  discard: () => discardSettingsDocument(resource),
})

const groups = computed(() => {
  const plain = catalog.value.filter((e) => !e.needs_document_type)
  const out = GROUPS.map((g) => ({
    ...g,
    events: plain.filter((e) => g.records.includes(e.record)),
  }))
  const known = new Set(GROUPS.flatMap((g) => g.records))
  const other = plain.filter((e) => !known.has(e.record))
  if (other.length)
    out.push({ key: 'other', label: __('Other'), events: other })
  return out.filter((g) => g.events.length)
})
const documentEvents = computed(() =>
  catalog.value.filter((e) => e.needs_document_type),
)
const documentTypes = computed(() => {
  const chosen = (doc.value?.subscriptions || [])
    .map((row) => row.document_type)
    .filter(Boolean)
  return [...new Set([...chosen, ...extraTypes.value])]
})
const counts = computed(() => {
  const c = summary.value?.counts || {}
  return [
    { key: 'Delivered', label: STATUS.Delivered, value: c.Delivered || 0 },
    {
      key: 'Pending',
      label: STATUS.Pending,
      value: (c.Pending || 0) + (c.Sending || 0),
    },
    { key: 'Failed', label: STATUS.Failed, value: c.Failed || 0, alarm: true },
    { key: 'Dead', label: STATUS.Dead, value: c.Dead || 0, alarm: true },
    { key: 'Skipped', label: __('Skipped'), value: c.Skipped || 0 },
  ]
})
const testText = computed(() => {
  const t = test.value
  if (!t) return ''
  if (t.status === 'Delivered')
    return __('n8n answered {0}. The connection works.', [t.response_code])
  return t.last_error
    ? __('It did not arrive: {0}', [__(t.last_error)])
    : __('It did not arrive (answer {0}).', [t.response_code || '—'])
})

const rowOf = (event, type = null) =>
  (doc.value?.subscriptions || []).find(
    (row) => row.event === event && (row.document_type || null) === type,
  )
const has = (event, type = null) => !!rowOf(event, type)
function setWatched(event, type, value) {
  const row = rowOf(event, type)
  if (row) row.only_fields = value.trim() || null
}
function toggle(event, type, on) {
  const rows = doc.value.subscriptions || []
  doc.value.subscriptions = on
    ? [...rows, { doctype: SUBSCRIPTION, event, document_type: type }]
    : rows.filter(
        (row) => !(row.event === event && (row.document_type || null) === type),
      )
}
function addType(row) {
  typeQuery.value = ''
  typeResults.value = []
  if (documentTypes.value.includes(row.name)) return
  extraTypes.value = [...extraTypes.value, row.name]
  toggle('document.created', row.name, true)
  toggle('document.updated', row.name, true)
  if (row.submittable) toggle('document.submitted', row.name, true)
}
function dropType(type) {
  extraTypes.value = extraTypes.value.filter((t) => t !== type)
  doc.value.subscriptions = (doc.value.subscriptions || []).filter(
    (row) => row.document_type !== type,
  )
}
function searchTypes() {
  clearTimeout(typeTimer)
  const mine = ++typeRequest
  const text = typeQuery.value.trim()
  if (!text) {
    typeResults.value = []
    return
  }
  typeTimer = setTimeout(async () => {
    typeLoading.value = true
    try {
      const rows = await call(API + 'document_types', {
        query: text,
        user: doc.value?.integration_user || null,
      })
      if (mine === typeRequest)
        typeResults.value = (rows || []).filter(
          (r) => !documentTypes.value.includes(r.name),
        )
    } catch {
      if (mine === typeRequest) typeResults.value = []
    } finally {
      if (mine === typeRequest) typeLoading.value = false
    }
  }, 250)
}

async function loadSummary() {
  try {
    summary.value = await call(API + 'summary', { name: props.name })
  } catch (e) {
    error.value = message(e, __('The delivery summary could not be loaded.'))
  }
}
onMounted(async () => {
  try {
    catalog.value = (await call(API + 'events')) || []
  } catch (e) {
    error.value = message(e, __('The event list could not be loaded.'))
  }
  loadSummary()
})

function save() {
  return new Promise((resolve) => {
    error.value = ''
    resource.save.submit(null, {
      onSuccess: () => {
        extraTypes.value = []
        toast.success(__('Connection saved.'))
        loadSummary()
        resolve(true)
      },
      onError: (e) => {
        error.value = message(e, __('The connection was not saved. Try again.'))
        resolve(false)
      },
    })
  })
}
async function act(key, work) {
  busy.value = key
  error.value = ''
  try {
    return await work()
  } catch (e) {
    error.value = message(e, __('That did not work. Try again.'))
    return null
  } finally {
    busy.value = ''
  }
}
async function sendTest() {
  if (resource.isDirty && !(await save())) return
  test.value = await act('test', () =>
    call(API + 'send_test', { name: props.name }),
  )
  loadSummary()
}
async function toggleSecret() {
  if (secret.value) {
    secret.value = ''
    return
  }
  const out = await act('secret', () =>
    call(API + 'show_secret', { name: props.name }),
  )
  secret.value = out?.secret || ''
}
async function rotate() {
  if (!confirmRotate.value) {
    confirmRotate.value = true
    return
  }
  confirmRotate.value = false
  if (resource.isDirty && !(await save())) return
  const out = await act('rotate', () =>
    call(API + 'rotate_secret', { name: props.name }),
  )
  if (out?.secret) {
    secret.value = out.secret
    toast.success(
      __(
        'New signing secret. Paste it into n8n within 24 hours; until then events also carry the old signature.',
      ),
    )
    resource.reload()
  }
}
async function createKeys() {
  if (summary.value?.api_key_ready && !confirmKey.value) {
    confirmKey.value = true
    return
  }
  confirmKey.value = false
  if (resource.isDirty && !(await save())) return
  keys.value = await act('keys', () =>
    call('frappe.core.doctype.user.user.generate_keys', {
      user: doc.value.integration_user,
    }),
  )
  loadSummary()
}
async function redeliver(row) {
  const out = await act(row.name, () =>
    call(API + 'redeliver', { delivery: row.name }),
  )
  if (out) {
    toast.success(__('Queued again. It leaves in a moment.'))
    loadSummary()
  }
}
async function remove() {
  if (!confirmDelete.value) {
    confirmDelete.value = true
    return
  }
  const deleted = await act('delete', async () => {
    await call('frappe.client.delete', { doctype: DOCTYPE, name: props.name })
    return true
  })
  if (deleted) emit('back')
}
function back() {
  if (resource.isDirty) {
    if (
      !window.confirm(__('Discard unsaved settings and return to your work?'))
    )
      return
    discardSettingsDocument(resource)
  }
  emit('back')
}
</script>
