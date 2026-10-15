<template>
  <form class="space-y-4" novalidate @submit.prevent="save">
    <FormControl
      v-model="form.title"
      class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
      type="text"
      :label="__('Name on this page')"
      :placeholder="isMailbox ? __('Invoice mailbox') : __('Paperless archive')"
      maxlength="140"
    />

    <!-- Paperless -->
    <template v-if="!isMailbox">
      <FormControl
        v-model="form.base_url"
        class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
        type="url"
        inputmode="url"
        autocomplete="off"
        :label="__('Paperless address')"
        :placeholder="__('https://paperless.yourcompany.mx')"
        :error="shown.base_url"
        required
      />
      <FormControl
        v-model="form.api_token"
        class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
        type="password"
        autocomplete="new-password"
        :label="__('Access token')"
        :placeholder="
          form.has_token
            ? __('Saved. Type a new one only to replace it.')
            : __('Paste the token from Paperless')
        "
        :description="
          __(
            'In Paperless open My profile and copy the API token of the owner user. It must not be a superuser.',
          )
        "
        :error="shown.api_token"
      />
      <div class="grid gap-4 sm:grid-cols-2">
        <FormControl
          v-model="form.remote_owner"
          class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
          type="number"
          inputmode="numeric"
          min="1"
          :label="__('Owner user number')"
          :description="__('Muelle only reads documents this user owns.')"
          :error="shown.remote_owner"
          required
        />
        <FormControl
          v-model="form.source_tag"
          class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
          type="number"
          inputmode="numeric"
          min="0"
          :label="__('Intake tag number')"
          :description="
            __('Only documents with this tag come in. 0 brings all of them.')
          "
          :error="shown.source_tag"
        />
      </div>
      <RemotePicker
        v-model="form.filter_document_types"
        :label="__('Document types to bring')"
        :all-text="__('All document types.')"
        :options="catalog?.document_types || null"
        :loading="catalogLoading"
        :disabled="!form.name"
        :disabled-reason="
          __('Save the connection first to choose from its lists.')
        "
        @load="emit('load-catalog')"
      />
      <RemotePicker
        v-model="form.filter_correspondents"
        :label="__('Correspondents to bring')"
        :all-text="__('All correspondents.')"
        :options="catalog?.correspondents || null"
        :loading="catalogLoading"
        :disabled="!form.name"
        :disabled-reason="
          __('Save the connection first to choose from its lists.')
        "
        @load="emit('load-catalog')"
      />
      <p v-if="catalogError" role="alert" class="text-sm text-ink-red-4">
        {{ catalogError }}
      </p>
      <FormControl
        v-model="form.page_size"
        class="[&_input]:min-h-11 sm:[&_input]:min-h-0 sm:max-w-xs"
        type="number"
        inputmode="numeric"
        min="1"
        max="100"
        :label="__('Documents per round')"
        :description="
          __('How many documents each check brings, from 1 to 100. 25 is fine.')
        "
        :error="shown.page_size"
      />
      <label class="flex min-h-11 cursor-pointer items-start gap-3 py-1">
        <input
          v-model="form.download_archived"
          type="checkbox"
          class="mt-0.5 h-5 w-5 shrink-0 rounded"
        />
        <span>
          <span class="block text-base text-ink-gray-8">{{
            __('Import the archived PDF/A instead of the original')
          }}</span>
          <span class="block text-sm text-ink-gray-6">{{
            __(
              'The archived copy is the one Paperless made searchable. The original is the file as it was scanned or received.',
            )
          }}</span>
        </span>
      </label>
      <label class="flex min-h-11 cursor-pointer items-start gap-3 py-1">
        <input
          v-model="form.write_back"
          type="checkbox"
          class="mt-0.5 h-5 w-5 shrink-0 rounded"
        />
        <span>
          <span class="block text-base text-ink-gray-8">{{
            __('Write back to Paperless')
          }}</span>
          <span class="block text-sm text-ink-gray-6">{{
            __(
              'Muelle adds tags and a field with its document number in Paperless, so you can see there what was linked. Nothing is deleted.',
            )
          }}</span>
          <span
            v-if="form.write_back && connector && !connector.writes_allowed"
            class="mt-1 block text-sm text-ink-amber-3"
            >{{
              __(
                'The owner of this Paperless has not allowed Muelle to write yet. Until then Muelle only reads.',
              )
            }}</span
          >
        </span>
      </label>
      <details class="rounded-lg border border-outline-gray-2 px-3">
        <summary
          class="flex min-h-11 cursor-pointer items-center text-sm font-medium text-ink-gray-8"
        >
          {{ __('Advanced') }}
        </summary>
        <div class="space-y-2 pb-3">
          <FormControl
            v-model="form.webhook_url"
            class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
            type="url"
            inputmode="url"
            autocomplete="off"
            :label="__('Address Paperless uses to reach Muelle')"
            :placeholder="__('https://muelle.yourcompany.mx')"
            :description="
              __(
                'Only if Paperless cannot reach this site by its usual address. Write only the server, without a path.',
              )
            "
          />
          <p
            v-if="connector?.webhook_endpoint"
            class="break-all text-sm text-ink-gray-6"
          >
            {{ __('Notices go to: {0}', [connector.webhook_endpoint]) }}
          </p>
        </div>
      </details>
    </template>

    <!-- Mailbox -->
    <template v-else>
      <FormControl
        v-model="form.base_url"
        class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
        type="text"
        inputmode="url"
        autocomplete="off"
        :label="__('Mail server (IMAP)')"
        placeholder="imaps://imap.gmail.com:993"
        :description="
          __(
            'Gmail: imaps://imap.gmail.com:993 · Outlook: imaps://outlook.office365.com:993',
          )
        "
        :error="shown.base_url"
        required
      />
      <FormControl
        v-model="form.remote_account"
        class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
        type="email"
        inputmode="email"
        autocomplete="off"
        :label="__('Email account')"
        :placeholder="__('invoices@yourcompany.mx')"
        :error="shown.remote_account"
        required
      />
      <FormControl
        v-model="form.api_token"
        class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
        type="password"
        autocomplete="new-password"
        :label="__('App password')"
        :placeholder="
          form.has_token
            ? __('Saved. Type a new one only to replace it.')
            : __('Paste the app password')
        "
        :description="
          __(
            'Create an app password in the email account settings. Do not use the normal password.',
          )
        "
        :error="shown.api_token"
      />
      <FormControl
        v-model="form.mail_folder"
        class="[&_input]:min-h-11 sm:[&_input]:min-h-0 sm:max-w-xs"
        type="text"
        :label="__('Folder')"
        placeholder="INBOX"
        :description="__('INBOX is the main inbox.')"
      />
      <MailRulesEditor v-model="form.mail_rules" />
      <p v-if="shown.mail_rules" role="alert" class="text-sm text-ink-red-4">
        {{ shown.mail_rules }}
      </p>
    </template>

    <label
      v-if="!form.name"
      class="flex min-h-11 cursor-pointer items-start gap-3 py-1"
    >
      <input
        v-model="form.enable"
        type="checkbox"
        class="mt-0.5 h-5 w-5 shrink-0 rounded"
      />
      <span>
        <span class="block text-base text-ink-gray-8">{{
          __('Turn it on when saving')
        }}</span>
        <span class="block text-sm text-ink-gray-6">{{
          __('Muelle tests the connection first and only saves it if it works.')
        }}</span>
      </span>
    </label>

    <div
      v-if="saveError"
      role="alert"
      class="rounded-lg border border-outline-red-2 bg-surface-red-1 p-3 text-base text-ink-red-4"
    >
      {{ saveError }}
    </div>
    <div class="flex flex-wrap gap-2">
      <Button
        type="submit"
        variant="solid"
        class="min-h-11 sm:min-h-0"
        :label="form.name ? __('Save changes') : __('Save connection')"
        :loading="saving"
      />
      <Button
        class="min-h-11 sm:min-h-0"
        :label="__('Cancel')"
        :disabled="saving"
        @click="emit('cancel')"
      />
    </div>
  </form>
</template>
<script setup>
import { computed, reactive, ref } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import MailRulesEditor from './MailRulesEditor.vue'
import RemotePicker from './RemotePicker.vue'
import { archivosApi, problem } from '@/composables/useArchivos'
import {
  connectorMethod,
  formFromConnector,
  formProblems,
  saveValues,
} from '@/utils/archivosConectores'

const props = defineProps({
  connector: { type: Object, default: null },
  type: { type: String, default: 'Paperless' },
  company: { type: String, required: true },
  catalog: { type: Object, default: null },
  catalogLoading: { type: Boolean, default: false },
  catalogError: { type: String, default: '' },
})
const emit = defineEmits(['saved', 'cancel', 'load-catalog'])

const form = reactive(formFromConnector(props.connector, props.type))
const isMailbox = computed(() => form.connector_type === 'Mailbox')
const saving = ref(false),
  saveError = ref(''),
  tried = ref(false)
const problems = computed(() => formProblems(form))
// Field errors show after the first try, so an empty new form is not red.
const shown = computed(() => (tried.value ? problems.value : {}))

async function save() {
  tried.value = true
  saveError.value = ''
  if (Object.keys(problems.value).length) {
    saveError.value = __('Check the fields marked above.')
    return
  }
  saving.value = true
  try {
    const saved = await archivosApi(connectorMethod('save'), {
      company: props.company,
      values: saveValues(form),
    })
    form.api_token = ''
    emit('saved', saved)
  } catch (error) {
    saveError.value = problem(error).message
  } finally {
    saving.value = false
  }
}
</script>
