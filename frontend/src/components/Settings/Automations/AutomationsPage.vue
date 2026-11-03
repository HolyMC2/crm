<template>
  <AutomationConnection v-if="open" :name="open" @back="close" />
  <div
    v-else
    class="flex h-full min-w-0 flex-col gap-4 px-3 py-6 text-ink-gray-8 sm:px-6 sm:py-8"
  >
    <header class="flex flex-wrap items-start justify-between gap-3 px-2">
      <div class="min-w-0 flex-1 basis-60">
        <h2 class="title-face text-2xl-semibold leading-tight">
          {{ __('Automations (n8n)') }}
        </h2>
        <p class="mt-1 text-p-base text-ink-gray-6">
          {{
            __(
              'Send what happens in the CRM, the inbox, the assistant and any ERP record to n8n, and let n8n act through the same permissions as a person.',
            )
          }}
        </p>
      </div>
      <Button
        v-if="!creating"
        class="press"
        variant="solid"
        icon-left="lucide-plus"
        :label="__('New connection')"
        @click="creating = true"
      />
    </header>

    <form
      v-if="creating"
      class="mx-2 flex flex-col gap-3 rounded-6 border border-outline-gray-2 p-3"
      @submit.prevent="create"
    >
      <FormControl
        v-model="draft.title"
        :label="__('Name')"
        :placeholder="__('For example: Follow up new leads')"
      />
      <Link
        v-model="draft.user"
        doctype="User"
        :filters="{ enabled: 1, user_type: 'System User' }"
        :label="__('Acts as user')"
        :placeholder="__('A dedicated user, for example n8n@yourshop')"
      />
      <p class="text-p-sm text-ink-gray-5">
        {{
          __(
            "Events carry only what this user may read, and the connection's API calls use this user's API key. Use a dedicated user with only the roles the workflow needs.",
          )
        }}
      </p>
      <p v-if="error" role="alert" class="text-p-sm text-ink-red-7">
        {{ error }}
      </p>
      <div class="flex justify-end gap-2">
        <Button
          class="press"
          variant="subtle"
          :label="__('Cancel')"
          @click="creating = false"
        />
        <Button
          type="submit"
          class="press"
          variant="solid"
          :label="__('Create connection')"
          :loading="busy"
          :disabled="!draft.title.trim() || !draft.user"
        />
      </div>
    </form>

    <div class="min-h-0 flex-1 overflow-y-auto px-2">
      <p v-if="loading && !rows.length" class="text-p-sm text-ink-gray-5">
        {{ __('Loading…') }}
      </p>
      <p v-else-if="loadError" role="alert" class="text-p-sm text-ink-red-7">
        {{ loadError }}
      </p>
      <ul v-else-if="rows.length" class="divide-y divide-outline-gray-1">
        <li v-for="row in rows" :key="row.name">
          <button
            type="button"
            class="press flex w-full min-w-0 items-center gap-3 py-3 text-left hover:bg-surface-gray-1"
            @click="open = row.name"
          >
            <span
              class="size-2 flex-none rounded-full"
              :class="dot(row)"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-p-base-medium text-ink-gray-8">{{
                row.title
              }}</span>
              <span class="block truncate text-p-sm text-ink-gray-5">{{
                state(row)
              }}</span>
            </span>
            <span
              v-if="row.consecutive_failures"
              class="num flex-none text-p-sm font-semibold text-ink-red-7"
              >{{ __('{0} failed', [row.consecutive_failures]) }}</span
            >
            <span
              class="lucide-chevron-right size-4 flex-none text-ink-gray-5"
              aria-hidden="true"
            />
          </button>
        </li>
      </ul>
      <div v-else-if="!creating" class="flex flex-col gap-2 py-6">
        <p class="text-p-base-medium text-ink-gray-8">
          {{ __('No connections yet') }}
        </p>
        <p class="text-p-sm text-ink-gray-6">
          {{
            __(
              'A connection sends signed events to an n8n Webhook node, and gives n8n an API key to answer customers, update records or ask the assistant.',
            )
          }}
        </p>
      </div>
    </div>
  </div>
</template>
<script setup>
import { onMounted, reactive, ref } from 'vue'
import { Button, FormControl, call } from 'frappe-ui'
import Link from '@/components/Controls/Link.vue'
import { formatDateTime } from '@/utils/display'
import AutomationConnection from './AutomationConnection.vue'

const DOCTYPE = 'CRM Integration'
const rows = ref([]),
  loading = ref(false),
  loadError = ref(''),
  open = ref(''),
  creating = ref(false),
  busy = ref(false),
  error = ref('')
const draft = reactive({ title: '', user: '' })
const message = (e, fallback) =>
  e?.messages?.length ? String(e.messages[0]).replace(/<[^>]+>/g, '') : fallback

async function load() {
  loading.value = true
  try {
    rows.value =
      (await call('frappe.client.get_list', {
        doctype: DOCTYPE,
        fields: [
          'name',
          'title',
          'enabled',
          'webhook_url',
          'api_channel',
          'last_delivery_status',
          'last_delivery_at',
          'consecutive_failures',
        ],
        order_by: 'title asc',
        limit_page_length: 100,
      })) || []
    loadError.value = ''
  } catch (e) {
    loadError.value = message(e, __('The connections could not be loaded.'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

const dot = (row) =>
  !row.enabled
    ? 'bg-surface-gray-5'
    : row.consecutive_failures
      ? 'bg-surface-red-5'
      : 'bg-surface-green-5'
function state(row) {
  if (!row.enabled) return __('Off')
  if (row.last_delivery_at)
    return __('On. Last event {0}: {1}', [
      formatDateTime(row.last_delivery_at),
      row.last_delivery_status || '',
    ])
  return __('On. No events sent yet.')
}
async function create() {
  busy.value = true
  error.value = ''
  try {
    const doc = await call('frappe.client.insert', {
      doc: {
        doctype: DOCTYPE,
        title: draft.title.trim(),
        integration_user: draft.user,
      },
    })
    Object.assign(draft, { title: '', user: '' })
    creating.value = false
    open.value = doc.name
  } catch (e) {
    error.value = message(e, __('The connection was not created. Try again.'))
  } finally {
    busy.value = false
  }
}
function close() {
  open.value = ''
  load()
}
</script>
