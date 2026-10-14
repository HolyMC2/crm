<template>
  <Dialog
    v-model="open"
    :options="{ title: __('Automatic payment reminders'), size: 'xl' }"
  >
    <template #body-content>
      <div class="auto-setup space-y-4 text-base" data-auto-setup>
        <p class="text-sm text-ink-gray-6">{{ company }}</p>
        <div v-if="loading && !setup" role="status" class="text-sm">
          {{ __('Loading the reminder settings…') }}
        </div>
        <div
          v-if="problem"
          role="alert"
          class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          <Button class="ml-2" :label="__('Retry', null, CTX)" @click="load" />
        </div>

        <template v-if="setup">
          <p
            class="rounded-lg p-3 text-sm"
            :class="
              setup.paused
                ? 'bg-surface-amber-1 text-ink-gray-8'
                : setup.enabled
                  ? 'bg-surface-green-1 text-ink-green-8'
                  : 'bg-surface-gray-1 text-ink-gray-8'
            "
            role="status"
          >
            {{ statusText }}
          </p>

          <section aria-labelledby="auto-ladder-title">
            <h3 id="auto-ladder-title" class="text-sm font-semibold">
              {{ __('What goes out') }}
            </h3>
            <ol class="mt-2 space-y-2">
              <li
                v-for="level in setup.ladder"
                :key="level.level"
                class="rounded-lg border border-outline-gray-2 p-3"
              >
                <p class="text-sm font-medium text-ink-gray-9">
                  {{ __('Day {0} overdue · {1}', [level.days, level.title]) }}
                </p>
                <p class="mt-1 text-sm text-ink-gray-7">
                  {{ level.body }} {{ level.closing }}
                </p>
              </li>
            </ol>
            <p class="mt-2 text-xs text-ink-gray-6">
              {{
                __(
                  'With the letter as a PDF. No fees and no interest. At most one reminder per customer every {0} days; none after they reply, promise to pay or pay.',
                  [setup.cap_days],
                )
              }}
            </p>
          </section>

          <p
            v-if="setup.mode === 'manual'"
            class="rounded-lg bg-surface-gray-1 p-3 text-sm text-ink-gray-8"
          >
            {{
              __(
                'Your business sends WhatsApp from its phone: each day the due reminders wait in Cobranza, ready to send from your phone.',
              )
            }}
          </p>

          <FormControl
            v-if="setup.accounts.length"
            :model-value="form.account"
            type="select"
            :label="__('WhatsApp account')"
            :options="accountOptions"
            @update:model-value="chooseAccount"
          />

          <div v-if="setup.mode === 'api'" class="space-y-2">
            <FormControl
              v-model="form.template"
              type="select"
              :label="__('Approved template')"
              :options="templateOptions"
            />
            <!-- The reason shows once: here, unless it is what blocks saving below. -->
            <p
              v-if="
                chosenTemplate?.problem && blocker?.action !== 'choose_template'
              "
              role="status"
              class="rounded-md bg-surface-amber-1 px-3 py-2 text-sm text-ink-gray-8"
            >
              {{ chosenTemplate.reason }} {{ __('Choose another template.') }}
            </p>
            <a
              v-if="setup.can_configure"
              class="inline-flex min-h-11 items-center text-sm text-ink-blue-link underline sm:min-h-0"
              href="/app/whatsapp-templates/new"
              target="_blank"
              rel="noopener"
              >{{ __('Create a template') }}</a
            >
          </div>

          <div class="grid grid-cols-2 gap-3">
            <FormControl
              v-model="form.from"
              type="time"
              :label="__('Send from')"
            />
            <FormControl
              v-model="form.to"
              type="time"
              :label="__('Send until')"
            />
          </div>
          <p class="-mt-2 text-xs text-ink-gray-6">
            {{ __('Monday to Saturday, in the business hours you set here.') }}
          </p>

          <p class="text-sm text-ink-gray-8">
            {{ __('They go out in your name ({0}).', [setup.me.full_name]) }}
            <template
              v-if="
                setup.enabled &&
                setup.sender &&
                setup.sender.user !== setup.me.user
              "
            >
              {{
                __(
                  'Today they go out in the name of {0}; saving makes it you.',
                  [setup.sender.full_name],
                )
              }}
            </template>
          </p>
          <p class="text-sm font-medium text-ink-gray-9">
            {{ countText }}
          </p>

          <div
            v-if="blocker"
            role="alert"
            class="space-y-2 rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-gray-8"
          >
            <p>{{ blocker.text }}</p>
            <div class="flex flex-wrap gap-2">
              <Button
                v-if="blocker.action === 'copy_request'"
                class="min-h-11 sm:min-h-8"
                :label="__('Copy request for the owner')"
                @click="copyRequest"
              />
              <Button
                v-else-if="blocker.action === 'setup_ladder'"
                class="min-h-11 sm:min-h-8"
                :label="__(AUTO_ACTION_LABELS.setup_ladder)"
                :loading="working"
                @click="setupLadder"
              />
              <a
                v-else-if="blocker.action === 'whatsapp_settings'"
                class="inline-flex min-h-11 items-center text-ink-blue-link underline sm:min-h-0"
                href="/app/whatsapp-settings"
                >{{ __(AUTO_ACTION_LABELS.whatsapp_settings) }}</a
              >
              <a
                v-if="
                  setup.missing.includes('documents_off') && setup.can_configure
                "
                class="inline-flex min-h-11 items-center text-ink-blue-link underline sm:min-h-0"
                href="/app/whatsapp-document-settings"
                >{{ __('Open document sending settings') }}</a
              >
            </div>
          </div>
          <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
            {{ copied }}
          </p>
        </template>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          class="min-h-11 sm:min-h-8"
          :label="__('Cancel')"
          @click="open = false"
        />
        <Button
          v-if="setup?.enabled && setup.can_switch_off"
          class="min-h-11 sm:min-h-8"
          :label="__('Switch off')"
          :loading="saving === 'off'"
          @click="save(false)"
        />
        <Button
          variant="solid"
          class="min-h-11 sm:min-h-8"
          :label="
            setup?.enabled ? __('Save') : __('Switch on automatic reminders')
          "
          :disabled="!setup || Boolean(blocker) || loading"
          :loading="saving === 'on'"
          @click="save(true)"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, Dialog, FormControl, toast } from 'frappe-ui'
import {
  AUTO_ACTION_LABELS,
  AUTO_API,
  CTX,
  cobranzaApi,
  outcomeUnknown,
  ownerRequest,
  problemOf,
  requestId,
  setupProblem,
} from '@/composables/useCobranza'

const open = defineModel({ type: Boolean, default: false })
const props = defineProps({ company: { type: String, default: '' } })
const emit = defineEmits(['saved'])

const setup = ref(null)
const loading = ref(false)
const saving = ref('')
const working = ref(false)
const problem = ref(null)
const copied = ref('')
const form = reactive({ account: '', template: '', from: '10:00', to: '19:00' })
// One request id per pending save: a retry after a lost answer reuses it.
const pending = {}

const blocker = computed(() => setupProblem(setup.value, form))
const accountOptions = computed(() =>
  (setup.value?.accounts || []).map((a) => ({
    label: a.active ? a.label : __('{0} (not active)', [a.label]),
    value: a.name,
  })),
)
const templateOptions = computed(() => [
  { label: __('Choose a template'), value: '' },
  ...(setup.value?.templates || []).map((t) => ({
    label: t.problem ? __('{0} · {1}', [t.label, templateState(t)]) : t.label,
    value: t.name,
  })),
])
const chosenTemplate = computed(() =>
  (setup.value?.templates || []).find((t) => t.name === form.template),
)
// «Hoy saldrían N»: outside the sending window they go out when it opens.
const countText = computed(() => {
  const s = setup.value
  if (!s) return ''
  if (s.window_open === false && s.enabled)
    return s.today_count === 1
      ? __('When the sending window opens, 1 reminder goes out.')
      : __('When the sending window opens, {0} reminders go out.', [
          s.today_count,
        ])
  return s.today_count === 1
    ? __('Today 1 reminder would go out.')
    : __('Today {0} reminders would go out.', [s.today_count])
})
const statusText = computed(() => {
  const s = setup.value
  if (!s) return ''
  if (s.paused) return __('Paused: {0}', [s.paused.reason])
  if (s.enabled)
    return __('On: they go out in the name of {0}.', [
      s.sender?.full_name || '',
    ])
  return __(
    'Off. Switch them on and every overdue invoice gets its reminder on day 1, 7 and 15 without anyone pressing «Send».',
  )
})

function templateState(t) {
  if (t.status === 'REJECTED') return __('rejected')
  if (t.status === 'APPROVED') return __('cannot be used')
  return __('in review')
}

function fill(data) {
  setup.value = data
  form.account = data.account || ''
  const usable = (data.templates || []).find((t) => !t.problem)
  form.template = data.template || usable?.name || ''
  form.from = data.window?.from || '10:00'
  form.to = data.window?.to || '19:00'
}

async function load(account = '') {
  if (!props.company) return
  loading.value = true
  problem.value = null
  try {
    const data = await cobranzaApi(`${AUTO_API}.get_setup`, {
      company: props.company,
      account,
    })
    if (account) {
      // Only the account-dependent parts change; what the person typed stays.
      const keep = { from: form.from, to: form.to }
      fill(data)
      Object.assign(form, keep)
    } else fill(data)
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    loading.value = false
  }
}

function chooseAccount(value) {
  form.account = value
  load(value)
}

async function save(enabled) {
  const key = `${props.company}:${enabled ? 1 : 0}`
  pending[key] = pending[key] || requestId()
  saving.value = enabled ? 'on' : 'off'
  problem.value = null
  try {
    const result = await cobranzaApi(`${AUTO_API}.save_setup`, {
      request_id: pending[key],
      company: props.company,
      enabled: enabled ? 1 : 0,
      account: enabled ? form.account : '',
      template: enabled ? form.template : '',
      auto_from: enabled ? form.from : '',
      auto_to: enabled ? form.to : '',
    })
    delete pending[key]
    toast.success(
      enabled
        ? __('Automatic reminders are on')
        : __('Automatic reminders are off'),
    )
    emit('saved', result)
    open.value = false
  } catch (error) {
    if (!outcomeUnknown(error)) delete pending[key]
    problem.value = problemOf(error)
  } finally {
    saving.value = ''
  }
}

async function setupLadder() {
  working.value = true
  try {
    await cobranzaApi('setup_ladder', { company: props.company })
    toast.success(__('Reminder levels ready'))
    await load(form.account)
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    working.value = false
  }
}

async function copyRequest() {
  const text = ownerRequest(setup.value?.missing, props.company)
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with the owner.')
  } catch {
    copied.value = text
  }
}

watch(
  () => [open.value, props.company],
  ([isOpen]) => {
    if (!isOpen) return
    copied.value = ''
    problem.value = null
    setup.value = null
    load()
  },
  { immediate: true },
)
</script>
<style scoped>
/* 44 px targets for the pickers on a phone; the desktop keeps frappe-ui's size. */
.auto-setup :deep([role='combobox']) {
  min-height: 44px;
}
@media (min-width: 640px) {
  .auto-setup :deep([role='combobox']) {
    min-height: 28px;
  }
}
</style>
