<template>
  <Dialog v-model="open" :options="{ title: __('Notify the customer') }">
    <template #body-content>
      <div class="space-y-4">
        <p v-if="loading" role="status" class="text-sm text-ink-gray-6">
          {{ __('Checking how to reach the customer…') }}
        </p>
        <template v-else-if="view">
          <p class="text-sm text-ink-gray-7">
            {{
              __('WhatsApp with the case sheet ({0}) as a PDF.', [
                view.artifact?.filename || claim,
              ])
            }}
          </p>
          <FormControl
            v-if="view.recipients?.length > 1"
            v-model="recipient"
            type="select"
            :label="__('Number', null, 'Garantías')"
            :options="
              view.recipients.map((r) => ({ label: r.display, value: r.value }))
            "
            @update:model-value="refresh"
          />
          <FormControl
            v-if="view.accounts?.length > 1"
            v-model="account"
            type="select"
            :label="__('Send from', null, 'Garantías')"
            :options="
              view.accounts.map((a) => ({ label: a.label, value: a.name }))
            "
            @update:model-value="refresh"
          />
          <FormControl
            v-if="view.path === 'session'"
            v-model="caption"
            type="textarea"
            :label="__('Message', null, 'Garantías')"
          />
          <p
            v-else-if="view.template"
            class="rounded-lg bg-surface-gray-2 p-3 text-sm text-ink-gray-8"
          >
            {{ view.template.text }}
          </p>
          <ul v-if="view.blockers?.length" class="space-y-2" role="alert">
            <li
              v-for="blocker in view.blockers"
              :key="blocker.code"
              class="rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
            >
              <p>{{ blocker.message }}</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <a
                  v-if="blocker.actions.includes('download')"
                  class="text-ink-blue-link underline"
                  :href="downloadUrl"
                  >{{ __('Download PDF') }}</a
                >
                <a
                  v-if="blocker.actions.includes('device_share') && view.share"
                  class="text-ink-blue-link underline"
                  target="_blank"
                  rel="noopener"
                  :href="`https://wa.me/${view.share.wa_digits}?text=${encodeURIComponent(view.share.text)}`"
                  >{{ __('Send from my phone') }}</a
                >
                <Button
                  v-if="blocker.actions.includes('confirm_duplicate')"
                  :label="__('Send again anyway')"
                  @click="send(true)"
                />
                <span
                  v-if="
                    blocker.actions.includes('configure') ||
                    blocker.actions.includes('request_owner')
                  "
                  class="text-ink-gray-7"
                  >{{
                    __('The owner sets this up in WhatsApp settings.')
                  }}</span
                >
              </div>
            </li>
          </ul>
          <p
            v-if="sent"
            role="status"
            class="rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8"
          >
            {{ __('Sent to the queue: {0}.', [sent.label]) }}
          </p>
        </template>
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        </p>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button :label="__('Close', null, 'Garantías')" @click="open = false" />
        <Button
          v-if="!sent"
          variant="solid"
          :label="__('Send by WhatsApp')"
          :disabled="!view?.ready"
          :loading="sending"
          @click="send()"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import { callError } from '@/utils/contactos'
import {
  garantiasApi,
  outcomeUnknown,
  problemOf,
  requestId,
} from '@/composables/useGarantias'

// The shared document-send contract: a preview authorizes nothing, the send
// repeats every gate, and the same request id never sends twice.
const SEND = 'doco.docoutils.document_send.api'
const DOCTYPE = 'Warranty Claim'
const props = defineProps({ claim: { type: String, required: true } })
const emit = defineEmits(['sent'])
const open = defineModel({ type: Boolean, default: false })
const view = ref(null)
const loading = ref(false)
const sending = ref(false)
const problem = ref(null)
const sent = ref(null)
const recipient = ref('')
const account = ref('')
const caption = ref('')
let uuid = requestId()

const downloadUrl = computed(
  () =>
    `/api/method/${SEND}.download_pdf?` +
    new URLSearchParams({ doctype: DOCTYPE, name: props.claim }),
)

async function preview() {
  const query = new URLSearchParams({ doctype: DOCTYPE, name: props.claim })
  if (recipient.value) query.set('recipient', recipient.value)
  if (account.value) query.set('account', account.value)
  const response = await fetch(
    `/api/method/${SEND}.get_send_context?${query}`,
    {
      headers: { Accept: 'application/json' },
    },
  )
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw callError(SEND, response.status, data)
  return data.message
}

async function refresh() {
  loading.value = true
  problem.value = null
  try {
    view.value = await preview()
    recipient.value = view.value.recipient || ''
    account.value = view.value.account || ''
    caption.value = view.value.caption || ''
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    loading.value = false
  }
}

async function send(confirmDuplicate = false) {
  sending.value = true
  problem.value = null
  try {
    const out = await garantiasApi(`${SEND}.send_document`, {
      doctype: DOCTYPE,
      name: props.claim,
      request_uuid: uuid,
      expected_revision: view.value.source.revision,
      account: account.value,
      recipient: recipient.value,
      caption: view.value.path === 'session' ? caption.value : null,
      confirm_duplicate: confirmDuplicate ? 1 : 0,
    })
    if (out.sent) {
      sent.value = out.status
      emit('sent', out.status)
    } else {
      view.value = out.context
      uuid = requestId()
    }
  } catch (error) {
    problem.value = problemOf(error)
    if (!outcomeUnknown(error)) uuid = requestId()
  } finally {
    sending.value = false
  }
}

watch(open, (value) => {
  if (!value) return
  view.value = null
  sent.value = null
  recipient.value = ''
  account.value = ''
  uuid = requestId()
  refresh()
})
</script>
