<template>
  <section :aria-labelledby="`${id}-macros`" class="flex flex-col gap-2">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 :id="`${id}-macros`" class="title-face text-lg font-semibold">
        {{ __('Macros') }}
      </h3>
      <Button
        v-if="!editing"
        class="press"
        variant="subtle"
        icon-left="lucide-plus"
        :label="__('New macro')"
        @click="startNew"
      />
    </div>
    <p class="text-p-sm text-ink-gray-5">
      {{
        __(
          'Several steps in one tap from a conversation: reply, label, note, send to a team, snooze or close. If one step cannot run, none of them does.',
        )
      }}
    </p>
    <p v-if="error" role="alert" class="text-p-sm text-ink-red-7">
      {{ error }}
    </p>

    <form
      v-if="editing"
      class="flex flex-col gap-3 rounded-6 border border-outline-gray-2 p-3"
      :aria-label="editing.name ? __('Edit macro') : __('New macro')"
      @submit.prevent="save"
    >
      <FormControl
        v-model="editing.title"
        :label="__('Name')"
        :maxlength="80"
      />
      <FormControl
        v-model="editing.description"
        type="textarea"
        :rows="2"
        :label="__('Description')"
      />
      <SettingSwitch
        v-model="editing.shared"
        :label="__('Everyone in the inbox can use it')"
        :description="
          __('Off: only the person who created it sees it in the inbox.')
        "
      />
      <ol class="flex flex-col gap-2" :aria-label="__('Steps')">
        <li
          v-for="(step, index) in editing.actions"
          :key="stepKey(step)"
          class="flex flex-col gap-1.5 rounded-4 bg-surface-gray-1 p-2"
        >
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="num w-5 text-p-sm text-ink-gray-6">{{
              index + 1
            }}</span>
            <select
              v-model="step.action"
              class="h-8 min-w-0 flex-1 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
              :aria-label="__('Step {0}', [index + 1])"
              @change="step.value = defaultValue(step.action)"
            >
              <option v-for="a in ACTIONS" :key="a.value" :value="a.value">
                {{ a.label }}
              </option>
            </select>
            <button
              type="button"
              class="press flex size-8 items-center justify-center rounded-4 text-ink-gray-6 hover:bg-surface-gray-2 disabled:opacity-40"
              :aria-label="__('Move up')"
              :title="__('Move up')"
              :disabled="index === 0"
              @click="move(index, -1)"
            >
              <span class="lucide-chevron-up size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="press flex size-8 items-center justify-center rounded-4 text-ink-gray-6 hover:bg-surface-gray-2 disabled:opacity-40"
              :aria-label="__('Move down')"
              :title="__('Move down')"
              :disabled="index === editing.actions.length - 1"
              @click="move(index, 1)"
            >
              <span class="lucide-chevron-down size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="press flex size-8 items-center justify-center rounded-4 text-ink-gray-6 hover:bg-surface-gray-2"
              :aria-label="__('Remove step')"
              :title="__('Remove step')"
              @click="editing.actions.splice(index, 1)"
            >
              <span class="lucide-x size-4" aria-hidden="true" />
            </button>
          </div>
          <textarea
            v-if="TEXT.has(step.action)"
            v-model="step.value"
            rows="2"
            maxlength="4000"
            class="block w-full min-w-0 resize-y rounded-4 border border-outline-gray-2 bg-surface-base p-2 text-sm"
            :aria-label="__('Text')"
            :placeholder="
              step.action === 'Send reply'
                ? __('What the customer receives')
                : __('What the team reads (the customer never sees it)')
            "
          />
          <select
            v-else-if="LABEL.has(step.action)"
            v-model="step.value"
            class="h-8 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
            :aria-label="__('Label')"
          >
            <option value="" disabled>{{ __('Choose a label') }}</option>
            <option v-for="l in labels" :key="l.name" :value="l.name">
              {{ l.name }}
            </option>
          </select>
          <select
            v-else-if="step.action === 'Send to team'"
            v-model="step.value"
            class="h-8 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
            :aria-label="__('Team')"
          >
            <option v-for="t in TEAMS" :key="t.value" :value="t.value">
              {{ t.label }}
            </option>
          </select>
          <label
            v-else-if="step.action === 'Snooze'"
            class="flex items-center gap-2 text-p-sm"
          >
            <input
              v-model="step.value"
              type="number"
              min="1"
              class="num h-8 w-20 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
            />
            {{ __('hours') }}
          </label>
          <p v-else class="text-p-sm text-ink-gray-6">
            {{ __('Closes the conversation. It must be the last step.') }}
          </p>
        </li>
      </ol>
      <button
        type="button"
        class="press self-start text-p-sm text-ink-gray-7 underline"
        @click="addStep"
      >
        {{ __('Add a step') }}
      </button>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <button
          v-if="editing.name"
          type="button"
          class="press flex h-8 items-center gap-1 rounded-4 px-2 text-sm"
          :class="
            confirming
              ? 'bg-surface-red-2 text-ink-red-7'
              : 'text-ink-gray-6 hover:bg-surface-gray-2'
          "
          :disabled="busy"
          @click="remove"
        >
          <span class="lucide-trash-2 size-4" aria-hidden="true" />
          {{ confirming ? __('Delete macro') : __('Delete') }}
        </button>
        <span v-else />
        <div class="flex gap-2">
          <Button
            class="press"
            variant="subtle"
            :label="__('Cancel')"
            :disabled="busy"
            @click="cancel"
          />
          <Button
            type="submit"
            class="press"
            variant="solid"
            :label="__('Save macro')"
            :loading="busy"
            :disabled="!editing.title?.trim() || !editing.actions.length"
          />
        </div>
      </div>
    </form>

    <ul v-if="macros.length" class="divide-y divide-outline-gray-1">
      <li v-for="macro in macros" :key="macro.name">
        <button
          type="button"
          class="press flex w-full min-w-0 flex-col items-start gap-0.5 py-2 text-left hover:bg-surface-gray-1"
          :disabled="busy || !!editing"
          @click="edit(macro)"
        >
          <span class="flex flex-wrap items-center gap-2">
            <span class="text-p-base-medium text-ink-gray-8">{{
              macro.title
            }}</span>
            <span
              class="rounded-4 border border-outline-gray-2 px-1.5 text-xs text-ink-gray-6"
              >{{ macro.shared ? __('Everyone') : __('Only its author') }}</span
            >
          </span>
          <span class="text-p-sm text-ink-gray-5 [overflow-wrap:anywhere]">{{
            macro.steps.map(describe).join(' → ')
          }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="!loading && !editing" class="text-p-sm text-ink-gray-6">
      {{ __('No macros yet.') }}
    </p>
  </section>
</template>
<script setup>
import { onMounted, ref, useId } from 'vue'
import { Button, FormControl, call, toast } from 'frappe-ui'
import SettingSwitch from './SettingSwitch.vue'

defineProps({ labels: { type: Array, default: () => [] } })
const DOCTYPE = 'CRM Inbox Macro'
const STEP_DOCTYPE = 'CRM Inbox Macro Action'
const ACTIONS = [
  { value: 'Send reply', label: __('Send reply') },
  { value: 'Add label', label: __('Add label') },
  { value: 'Remove label', label: __('Remove label') },
  { value: 'Add private note', label: __('Add private note') },
  { value: 'Send to team', label: __('Send to team') },
  { value: 'Snooze', label: __('Snooze') },
  { value: 'Close', label: __('Close') },
]
const TEXT = new Set(['Send reply', 'Add private note'])
const LABEL = new Set(['Add label', 'Remove label'])
const TEAMS = [
  { value: '', label: __('No team') },
  { value: 'marketing', label: __('Marketing') },
  { value: 'sales', label: __('Sales') },
  { value: 'support', label: __('Support') },
  { value: 'finance', label: __('Finance') },
  { value: 'warehouse', label: __('Warehouse') },
  { value: 'technicians', label: __('Technicians') },
]
const id = useId()
const macros = ref([]),
  loading = ref(false),
  busy = ref(false),
  error = ref(''),
  editing = ref(null),
  confirming = ref(false)
const keys = new WeakMap()
let local = 0
function stepKey(step) {
  if (step.name) return step.name
  if (!keys.has(step)) keys.set(step, `new-${++local}`)
  return keys.get(step)
}
const actionLabel = (value) =>
  ACTIONS.find((a) => a.value === value)?.label || value
const teamLabel = (value) =>
  TEAMS.find((t) => t.value === (value || ''))?.label || value
function describe(step) {
  if (step.action === 'Close') return actionLabel(step.action)
  if (step.action === 'Send to team')
    return `${actionLabel(step.action)}: ${teamLabel(step.value)}`
  if (step.action === 'Snooze')
    return `${actionLabel(step.action)}: ${__('{0} h', [step.value])}`
  const value = String(step.value || '')
  return `${actionLabel(step.action)}: ${value.length > 40 ? value.slice(0, 40) + '…' : value}`
}
const defaultValue = (action) => (action === 'Snooze' ? '24' : '')
const message = (e, fallback) =>
  e?.messages?.length ? String(e.messages[0]).replace(/<[^>]+>/g, '') : fallback

async function load() {
  loading.value = true
  try {
    macros.value = (await call('crm.api.inbox.list_macros')) || []
  } catch (e) {
    error.value = message(e, __('The macros could not be loaded.'))
  } finally {
    loading.value = false
  }
}
onMounted(load)

function startNew() {
  error.value = ''
  confirming.value = false
  editing.value = {
    doctype: DOCTYPE,
    title: '',
    description: '',
    shared: 1,
    actions: [{ doctype: STEP_DOCTYPE, action: 'Send reply', value: '' }],
  }
}
async function edit(macro) {
  error.value = ''
  confirming.value = false
  busy.value = true
  try {
    const doc = await call('frappe.client.get', {
      doctype: DOCTYPE,
      name: macro.name,
    })
    doc.actions = (doc.actions || []).map((row) => ({
      ...row,
      value: row.value || '',
    }))
    editing.value = doc
  } catch (e) {
    error.value = message(e, __('This macro could not be opened.'))
  } finally {
    busy.value = false
  }
}
function cancel() {
  editing.value = null
  confirming.value = false
  error.value = ''
}
function addStep() {
  editing.value.actions.push({
    doctype: STEP_DOCTYPE,
    action: 'Add label',
    value: '',
  })
}
function move(index, delta) {
  const list = editing.value.actions
  const [step] = list.splice(index, 1)
  list.splice(index + delta, 0, step)
}
async function save() {
  const doc = editing.value
  busy.value = true
  error.value = ''
  try {
    doc.actions = doc.actions.map((row, index) => ({ ...row, idx: index + 1 }))
    await call(doc.name ? 'frappe.client.save' : 'frappe.client.insert', {
      doc,
    })
    toast.success(__('Macro «{0}» saved.', [doc.title]))
    editing.value = null
    await load()
  } catch (e) {
    error.value = message(
      e,
      __('The macro was not saved. Your steps are still here; try again.'),
    )
  } finally {
    busy.value = false
  }
}
async function remove() {
  if (!confirming.value) {
    confirming.value = true
    return
  }
  busy.value = true
  try {
    await call('frappe.client.delete', {
      doctype: DOCTYPE,
      name: editing.value.name,
    })
    editing.value = null
    confirming.value = false
    await load()
  } catch (e) {
    error.value = message(e, __('The macro was not deleted. Try again.'))
  } finally {
    busy.value = false
  }
}
</script>
