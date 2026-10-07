<template>
  <Dialog
    :model-value="modelValue"
    :options="{ title: __('Send reminder by WhatsApp'), size: 'xl' }"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #body-content>
      <div class="space-y-4 text-base">
        <p class="text-sm text-ink-gray-6">
          {{ __('Reminder {0} for {1}', [name, customerName || '']) }}
        </p>
        <div v-if="loading && !context" role="status" class="text-sm">
          {{ __('Preparing the preview…') }}
        </div>
        <div
          v-if="problem"
          role="alert"
          class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <Button class="ml-2" :label="__('Retry', null, CTX)" @click="load" />
        </div>

        <template v-if="context">
          <!-- What the customer gets: PDF, recipient, account and text. -->
          <dl class="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <template v-if="context.artifact">
              <dt class="text-ink-gray-6">{{ __('PDF') }}</dt>
              <dd>
                {{ context.artifact.label }} · {{ context.artifact.filename }}
                <a
                  v-if="context.can_download"
                  class="ml-2 text-ink-blue-link underline"
                  :href="downloadUrl(doctype, name, context.account)"
                  target="_blank"
                  rel="noopener"
                  >{{ __('Preview') }}</a
                >
              </dd>
            </template>
            <template v-if="context.recipients.length">
              <dt class="text-ink-gray-6">{{ __('To') }}</dt>
              <dd>
                <select
                  v-model="selection.recipient"
                  class="min-h-9 w-full rounded border border-outline-gray-2 bg-surface-white px-2 text-sm"
                  :aria-label="__('Customer number')"
                  @change="load"
                >
                  <option
                    v-for="r in context.recipients"
                    :key="r.value"
                    :value="r.value"
                  >
                    {{ r.display }}
                  </option>
                </select>
              </dd>
            </template>
            <template v-if="context.accounts.length > 1">
              <dt class="text-ink-gray-6">{{ __('From') }}</dt>
              <dd>
                <select
                  v-model="selection.account"
                  class="min-h-9 w-full rounded border border-outline-gray-2 bg-surface-white px-2 text-sm"
                  :aria-label="__('WhatsApp account')"
                  @change="load"
                >
                  <option
                    v-for="a in context.accounts"
                    :key="a.name"
                    :value="a.name"
                  >
                    {{ a.label }}
                  </option>
                </select>
              </dd>
            </template>
          </dl>

          <FormControl
            v-if="context.path === 'session'"
            v-model="selection.caption"
            type="textarea"
            :rows="4"
            :label="__('Message')"
          />
          <div
            v-else-if="context.template"
            class="rounded-lg bg-surface-gray-1 p-3 text-sm"
          >
            <p class="mb-1 text-ink-gray-6">
              {{
                __(
                  'Approved template (the customer has not written in 24 hours)',
                )
              }}
            </p>
            <p class="whitespace-pre-line">{{ context.template.text }}</p>
          </div>

          <!-- The first blocker explains itself and offers its way forward. -->
          <div
            v-if="blocker"
            role="alert"
            class="space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-gray-8"
          >
            <p>{{ blocker.message }}</p>
            <div class="flex flex-wrap items-center gap-2">
              <template v-for="action in blocker.actions" :key="action">
                <a
                  v-if="action === 'download'"
                  class="inline-flex min-h-9 items-center rounded px-2 text-ink-blue-link underline"
                  :href="downloadUrl(doctype, name, context.account)"
                  target="_blank"
                  rel="noopener"
                  >{{ __(SEND_ACTION_LABELS.download) }}</a
                >
                <a
                  v-else-if="action === 'device_share' && context.share"
                  class="inline-flex min-h-9 items-center rounded px-2 text-ink-blue-link underline"
                  :href="waLink(context.share.wa_digits, context.share.text)"
                  target="_blank"
                  rel="noopener"
                  >{{ __(SEND_ACTION_LABELS.device_share) }}</a
                >
                <a
                  v-else-if="action === 'configure'"
                  class="inline-flex min-h-9 items-center rounded px-2 text-ink-blue-link underline"
                  href="/app/whatsapp-document-settings"
                  >{{ __(SEND_ACTION_LABELS.configure) }}</a
                >
                <a
                  v-else-if="
                    [
                      'take_control',
                      'request_control',
                      'reopen_conversation',
                    ].includes(action)
                  "
                  class="inline-flex min-h-9 items-center rounded px-2 text-ink-blue-link underline"
                  href="/crm/inbox"
                  >{{ __(SEND_ACTION_LABELS[action]) }}</a
                >
                <span
                  v-else-if="action === 'add_phone'"
                  class="flex flex-wrap items-center gap-2"
                >
                  <FormControl
                    v-model="phone"
                    type="tel"
                    :placeholder="__('Customer mobile')"
                    :aria-label="__('Customer mobile')"
                  />
                  <Button
                    :label="__(SEND_ACTION_LABELS.add_phone)"
                    :loading="working"
                    :disabled="!phone.trim()"
                    @click="savePhone"
                  />
                </span>
                <Button
                  v-else-if="action === 'request_owner'"
                  :label="__(SEND_ACTION_LABELS.request_owner)"
                  :loading="working"
                  @click="askOwner"
                />
                <Button
                  v-else-if="action === 'confirm_duplicate'"
                  :label="__(SEND_ACTION_LABELS.confirm_duplicate)"
                  :loading="sending"
                  @click="send(true)"
                />
                <Button
                  v-else-if="SEND_ACTION_LABELS[action]"
                  :label="__(SEND_ACTION_LABELS[action])"
                  @click="load"
                />
              </template>
            </div>
          </div>

          <p
            v-if="state"
            role="status"
            class="rounded-lg bg-surface-gray-1 p-3 text-sm"
          >
            {{ __('WhatsApp: {0}', [state.label]) }}
            <span v-if="state.reason"> — {{ state.reason }}</span>
          </p>
          <p v-else-if="context.last_send" class="text-sm text-ink-gray-6">
            {{
              __('Last send: {0} to {1}', [
                context.last_send.label,
                context.last_send.recipient || '',
              ])
            }}
          </p>
          <p v-if="notice" role="status" class="text-sm text-ink-gray-7">
            {{ notice }}
          </p>
        </template>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          :label="state ? __('Done') : __('Cancel')"
          @click="$emit('update:modelValue', false)"
        />
        <Button
          v-if="!state"
          variant="solid"
          :label="__('Send')"
          :loading="sending"
          :disabled="!context?.ready"
          @click="send(false)"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import {
  CTX,
  SEND_ACTION_LABELS,
  SEND_API,
  cobranzaApi,
  downloadUrl,
  outcomeUnknown,
  problemOf,
  sendContext,
  sendStatus,
  waLink,
} from '@/composables/useCobranza'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  doctype: { type: String, default: 'Dunning' },
  name: { type: String, default: '' },
  customerName: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'sent'])

const context = ref(null)
const loading = ref(false)
const sending = ref(false)
const working = ref(false)
const problem = ref(null)
const notice = ref('')
const phone = ref('')
const state = ref(null)
const selection = reactive({ account: null, recipient: null, caption: '' })
let requestKey = null
let requestPayload = ''
let pollTimer = 0

const blocker = computed(() => context.value?.blockers?.[0] || null)

function newKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID()
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`
}

async function load() {
  if (!props.name) return
  loading.value = true
  problem.value = null
  try {
    const view = await sendContext({
      doctype: props.doctype,
      name: props.name,
      account: selection.account,
      recipient: selection.recipient,
    })
    context.value = view
    selection.account = view.account
    selection.recipient = view.recipient
    if (view.path === 'session' && !selection.caption)
      selection.caption = view.caption || ''
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    loading.value = false
  }
}

async function send(confirmDuplicate) {
  if (!context.value) return
  // A request key belongs to one exact payload: a retry after a lost answer
  // reuses it, any change the customer would see mints a new one.
  const payload = JSON.stringify([
    selection.account,
    selection.recipient,
    context.value.path === 'session' ? selection.caption.trim() : '',
    context.value.source.revision,
  ])
  if (!requestKey || payload !== requestPayload) {
    requestKey = newKey()
    requestPayload = payload
  }
  sending.value = true
  problem.value = null
  try {
    const result = await cobranzaApi(`${SEND_API}.send_document`, {
      doctype: props.doctype,
      name: props.name,
      request_uuid: requestKey,
      expected_revision: context.value.source.revision,
      account: selection.account,
      recipient: selection.recipient,
      caption: context.value.path === 'session' ? selection.caption : '',
      confirm_duplicate: confirmDuplicate ? 1 : 0,
    })
    if (result.sent) {
      state.value = result.status
      emit('sent', result)
      poll(result.send, 0)
    } else {
      context.value = result.context
      if (confirmDuplicate) requestKey = null
    }
  } catch (error) {
    if (!outcomeUnknown(error)) requestKey = null
    problem.value = problemOf(error)
  } finally {
    sending.value = false
  }
}

function poll(sendId, round) {
  window.clearTimeout(pollTimer)
  if (round > 10 || !props.modelValue) return
  pollTimer = window.setTimeout(async () => {
    const next = await sendStatus(sendId).catch(() => null)
    if (next) state.value = next
    if (!next || ['preparing', 'queued', 'sending'].includes(next.state))
      poll(sendId, round + 1)
  }, 3000)
}

async function savePhone() {
  working.value = true
  problem.value = null
  try {
    context.value = await cobranzaApi(`${SEND_API}.update_party_phone`, {
      doctype: props.doctype,
      name: props.name,
      phone: phone.value.trim(),
    })
    selection.recipient = context.value.recipient
    phone.value = ''
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    working.value = false
  }
}

async function askOwner() {
  working.value = true
  try {
    await cobranzaApi(`${SEND_API}.request_owner_send`, {
      doctype: props.doctype,
      name: props.name,
    })
    notice.value = __('Request sent. The owner sees it in their pending list.')
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    working.value = false
  }
}

watch(
  () => [props.modelValue, props.name],
  ([open]) => {
    window.clearTimeout(pollTimer)
    if (!open) return
    context.value = null
    state.value = null
    notice.value = ''
    requestKey = null
    Object.assign(selection, { account: null, recipient: null, caption: '' })
    load()
  },
  { immediate: true },
)
</script>
