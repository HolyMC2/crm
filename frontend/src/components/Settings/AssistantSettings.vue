<!--
  Asistente: the brain every new conversation starts on, and the money path
  (doco Books Assistant Settings). Marco 2026-11-16: mail reading runs on Haiku,
  anything about money always on Opus at high effort, and the money model sits
  next to the default one. Only these fields are shown: the doctype also holds
  tokens and keys, which stay in Desk. A save sends only the fields that changed.
-->
<template>
  <div class="flex h-full flex-col gap-6 py-8 px-6 text-ink-gray-8">
    <div class="flex justify-between px-2 text-ink-gray-8">
      <div class="flex flex-col gap-1">
        <h2 class="flex gap-2 text-2xl-semibold leading-none h-5">
          {{ __('Assistant') }}
        </h2>
        <p class="text-p-base text-ink-gray-6">
          {{
            __(
              'The model the assistant thinks with. Money questions and mail (invoices, payments, banks, taxes, cash) use their own model.',
            )
          }}
        </p>
      </div>
      <div class="flex item-center space-x-2 w-3/12 justify-end">
        <Button
          v-if="isDirty"
          :label="__('Update')"
          variant="solid"
          :loading="settings.setValue.loading"
          @click="update"
        />
      </div>
    </div>

    <div v-if="settings.doc" class="flex-1 flex flex-col overflow-y-auto">
      <div class="flex items-center justify-between gap-4 py-3 px-2">
        <div class="flex flex-col">
          <div class="text-p-base-medium text-ink-gray-7 truncate">
            {{ __('Default model') }}
          </div>
          <div class="text-p-sm text-ink-gray-5">
            {{ __('Every new conversation and mail reading use it.') }}
          </div>
        </div>
        <Select
          v-model="defaultModel"
          :options="modelOptions(defaultModel, true)"
          class="!w-56"
        />
      </div>
      <div class="flex items-center justify-between gap-4 py-3 px-2">
        <div class="flex flex-col">
          <div class="text-p-base-medium text-ink-gray-7 truncate">
            {{ __('Default effort') }}
          </div>
          <div class="text-p-sm text-ink-gray-5">
            {{ __('How much it reasons before it answers.') }}
          </div>
        </div>
        <Select
          v-model="defaultEffort"
          :options="effortOptions(true)"
          class="!w-56"
        />
      </div>
      <div class="h-px border-t mx-2 border-outline-elevation-2" />
      <div class="flex items-center justify-between gap-4 py-3 px-2">
        <div class="flex flex-col">
          <div class="text-p-base-medium text-ink-gray-7 truncate">
            {{ __('Money path') }}
          </div>
          <div class="text-p-sm text-ink-gray-5">
            {{
              __(
                'Money questions and mail use the money model, even when the conversation picked another one.',
              )
            }}
          </div>
        </div>
        <Switch v-model="moneyOn" />
      </div>
      <div class="flex items-center justify-between gap-4 py-3 px-2">
        <div class="flex flex-col">
          <div class="text-p-base-medium text-ink-gray-7 truncate">
            {{ __('Money model') }}
          </div>
          <div class="text-p-sm text-ink-gray-5">
            {{ __('Recommended: the strongest model.') }}
          </div>
        </div>
        <Select
          v-model="moneyModel"
          :options="modelOptions(moneyModel, false)"
          :disabled="!moneyOn"
          class="!w-56"
        />
      </div>
      <div class="flex items-center justify-between gap-4 py-3 px-2">
        <div class="flex flex-col">
          <div class="text-p-base-medium text-ink-gray-7 truncate">
            {{ __('Money effort') }}
          </div>
          <div class="text-p-sm text-ink-gray-5">
            {{ __('Recommended: high.') }}
          </div>
        </div>
        <Select
          v-model="moneyEffort"
          :options="effortOptions(false)"
          :disabled="!moneyOn"
          class="!w-56"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  settingsDocumentResource,
  discardSettingsDocument,
  useSettingsDraft,
} from '@/composables/settingsSession'
import { Button, Select, Switch, toast } from 'frappe-ui'
import { computed } from 'vue'

const DOCTYPE = 'Books Assistant Settings'
const FIELDS = [
  'assistant_default_model',
  'assistant_default_effort',
  'assistant_money_path',
  'assistant_money_model',
  'assistant_money_effort',
]
const MONEY_MODEL = 'claude-opus-5-5'
const MODELS = [
  { label: 'Claude Haiku 5.5', value: 'claude-haiku-5-5' },
  { label: 'Claude Sonnet 5.5', value: 'claude-sonnet-5-5' },
  { label: 'Claude Opus 5.5', value: 'claude-opus-5-5' },
  { label: 'Claude Fable 5.2', value: 'claude-fable-5-2' },
]

const settings = settingsDocumentResource({ doctype: DOCTYPE, name: DOCTYPE })

// A new Check field reads as unset on a site that never saved the single: the
// documented default (on) applies, as on the server (money_path.enabled).
const moneyOn = computed({
  get: () => {
    const value = settings.doc?.assistant_money_path
    return value === undefined || value === null ? true : Boolean(Number(value))
  },
  set: (on) => {
    settings.doc.assistant_money_path = on ? 1 : 0
  },
})

// Blank fields read as the server's defaults (model_choice, money_path), so the
// Select always shows what actually runs.
function withDefault(field, fallback) {
  return computed({
    get: () => settings.doc?.[field] || fallback,
    set: (value) => {
      settings.doc[field] = value
    },
  })
}
// frappe-ui's Select reads null as «nothing chosen» and '' as the blank option
const defaultModel = withDefault('assistant_default_model', '')
const defaultEffort = withDefault('assistant_default_effort', 'medium')
const moneyModel = withDefault('assistant_money_model', MONEY_MODEL)
const moneyEffort = withDefault('assistant_money_effort', 'high')

function modelOptions(current, allowBlank) {
  const options = allowBlank
    ? [{ label: __('Same as the assistant'), value: '' }]
    : []
  options.push(...MODELS)
  if (current && !MODELS.some((m) => m.value === current)) {
    options.push({ label: current, value: current })
  }
  return options
}

function effortOptions(withOff) {
  const options = [
    { label: __('Low'), value: 'low' },
    { label: __('Medium'), value: 'medium' },
    { label: __('High'), value: 'high' },
    { label: __('Very high'), value: 'xhigh' },
    { label: __('Maximum'), value: 'max' },
  ]
  return withOff
    ? [{ label: __('No reasoning'), value: 'off' }, ...options]
    : options
}

function norm(value) {
  return value === undefined || value === null ? '' : String(value)
}

const changed = computed(() => {
  const doc = settings.doc || {}
  const original = settings.originalDoc || {}
  const out = {}
  for (const field of FIELDS) {
    if (norm(doc[field]) !== norm(original[field])) out[field] = doc[field]
  }
  return out
})

const isDirty = computed(() => Object.keys(changed.value).length > 0)

function update() {
  settings.setValue.submit(changed.value, {
    onSuccess: () => toast.success(__('Settings updated successfully')),
    onError(error) {
      toast.error(error?.messages?.[0] || __('Failed to save settings'))
    },
  })
}

useSettingsDraft({
  dirty: isDirty,
  pending: () => settings.setValue.loading,
  discard: () => discardSettingsDocument(settings),
})
</script>
