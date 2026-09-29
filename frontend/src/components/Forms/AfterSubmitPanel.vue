<template>
  <div class="flex flex-col gap-6">
    <p class="text-p-base text-ink-gray-6">
      {{
        __(
          'Decide what happens the moment someone sends this form, so every submission reaches a person and a next step.',
        )
      }}
    </p>

    <!-- what a submission becomes -->
    <section class="flex flex-col gap-3">
      <PanelHeading
        :title="__('Each submission creates')"
        :hint="
          __(
            'A lead is someone to qualify. A deal is a real sale opportunity from the start.',
          )
        "
      />
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="opt in targetOptions()"
          :key="opt.value"
          class="rounded-lg border px-3 py-2.5 text-left transition-colors"
          :class="
            b.form.document_type === opt.value
              ? 'border-outline-gray-4 bg-surface-gray-2'
              : 'border-outline-gray-2 hover:bg-surface-gray-1'
          "
          :aria-pressed="b.form.document_type === opt.value"
          @click="b.requestDoctypeChange(opt.value)"
        >
          <div class="text-base font-medium text-ink-gray-9">
            {{ opt.label }}
          </div>
          <div class="text-p-sm text-ink-gray-6">
            {{
              opt.value === 'CRM Lead'
                ? __('Goes to your Leads list')
                : __('Goes straight to your Deals pipeline')
            }}
          </div>
        </button>
      </div>
      <FormControl
        v-if="statusField"
        type="select"
        :label="__('Starting status')"
        :model-value="statusField.default"
        :options="statusOptions"
        @update:model-value="(v) => b.setHiddenDefault(statusField, v)"
      />
    </section>

    <!-- owner -->
    <section class="flex flex-col gap-3">
      <PanelHeading
        :title="__('Who follows up')"
        :hint="__('The owner is assigned and gets a notification.')"
      />
      <div class="flex flex-col gap-2" role="radiogroup">
        <label
          v-for="mode in assignModes"
          :key="mode.value"
          class="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 focus-within:ring-2 focus-within:ring-outline-gray-4"
          :class="
            b.settings.assign_mode === mode.value
              ? 'border-outline-gray-4 bg-surface-gray-2'
              : 'border-outline-gray-2'
          "
        >
          <input
            type="radio"
            class="sr-only"
            name="assign_mode"
            :value="mode.value"
            :checked="b.settings.assign_mode === mode.value"
            @change="setSetting('assign_mode', mode.value)"
          />
          <ChoiceRadio
            class="mt-0.5"
            :checked="b.settings.assign_mode === mode.value"
          />
          <div class="min-w-0">
            <div class="text-base text-ink-gray-9">{{ mode.label }}</div>
            <div class="text-p-sm text-ink-gray-6">{{ mode.hint }}</div>
          </div>
        </label>
      </div>
      <Combobox
        v-if="b.settings.assign_mode === 'user'"
        :options="userOptions"
        :model-value="b.settings.assign_to || null"
        :placeholder="__('Choose a person')"
        :label="__('Assign to')"
        @update:model-value="(v) => setSetting('assign_to', v || '')"
      />
      <ErrorMessage
        v-if="b.settings.assign_mode === 'user' && !b.settings.assign_to"
        :message="__('Choose who gets new submissions.')"
      />
    </section>

    <!-- watchers -->
    <section class="flex flex-col gap-3">
      <PanelHeading
        :title="__('Also tell')"
        :hint="
          __(
            'People who should hear about every submission, like a manager. They get an in-app notification.',
          )
        "
      />
      <div v-if="b.settings.notify_users.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="u in b.settings.notify_users"
          :key="u"
          class="inline-flex items-center gap-1 rounded-full bg-surface-gray-2 py-1 pl-2.5 pr-1 text-sm text-ink-gray-8"
        >
          {{ userName(u) }}
          <button
            class="rounded-full p-0.5 text-ink-gray-5 hover:bg-surface-gray-3 hover:text-ink-gray-8"
            :aria-label="__('Remove {0}', [userName(u)])"
            @click="removeWatcher(u)"
          >
            <LucideX class="size-3.5" />
          </button>
        </span>
      </div>
      <Combobox
        :options="watcherOptions"
        :model-value="null"
        :placeholder="__('Add a person')"
        @update:model-value="addWatcher"
      />
      <SegmentedControl
        v-if="b.settings.notify_users.length"
        :model-value="b.settings.notify_mode"
        :options="notifyModes"
        :label="__('How often')"
        @update:model-value="(v) => setSetting('notify_mode', v)"
      />
    </section>

    <!-- follow-up campaign (doco_marketing) -->
    <section v-if="opts.marketing" class="flex flex-col gap-3">
      <PanelHeading
        :title="__('Start a follow-up')"
        :hint="
          __(
            'Enroll each new lead in a campaign. Messages go out on the campaign’s own schedule, and never to people who opted out.',
          )
        "
      />
      <template v-if="b.form.document_type === 'CRM Lead'">
        <FormControl
          type="select"
          :model-value="b.settings.campaign"
          :options="campaignOptions"
          :aria-label="__('Follow-up campaign')"
          @update:model-value="(v) => setSetting('campaign', v)"
        />
        <p v-if="!opts.campaigns?.length" class="text-p-sm text-ink-gray-6">
          {{ __('No active campaigns yet.') }}
          <RouterLink to="/campaigns" class="text-ink-gray-9 underline">{{
            __('Open Campaigns')
          }}</RouterLink>
        </p>
        <RouterLink
          v-else-if="b.settings.campaign"
          :to="`/campaigns/${b.settings.campaign}`"
          class="self-start text-p-sm text-ink-gray-7 underline"
          >{{ __('See the campaign’s steps') }}</RouterLink
        >
        <p
          v-if="opts.auto_campaigns?.length"
          class="flex items-start gap-1.5 rounded-md bg-surface-gray-2 p-2.5 text-p-sm text-ink-gray-7"
        >
          <LucideInfo class="mt-0.5 size-3.5 shrink-0" />
          {{
            __('Every new lead also joins: {0}', [
              opts.auto_campaigns.map((c) => c.title).join(', '),
            ])
          }}
        </p>
      </template>
      <p v-else class="text-p-sm text-ink-gray-6">
        {{ __('Follow-up campaigns work with forms that create leads.') }}
      </p>
    </section>

    <!-- consent -->
    <section v-if="opts.marketing" class="flex flex-col gap-3">
      <div class="flex items-start justify-between gap-3">
        <PanelHeading
          :title="__('Ask for WhatsApp consent')"
          :hint="
            __(
              'Adds an optional checkbox. When ticked, the consent is recorded with the exact text shown.',
            )
          "
        />
        <Switch
          :model-value="Boolean(b.settings.consent_enabled)"
          :aria-label="__('Ask for WhatsApp consent')"
          @update:model-value="(v) => setSetting('consent_enabled', v ? 1 : 0)"
        />
      </div>
      <template v-if="b.settings.consent_enabled">
        <FormControl
          type="textarea"
          :rows="2"
          :label="__('Checkbox text')"
          :model-value="b.settings.consent_text"
          :placeholder="
            __('Yes, send me offers and news from {business} on WhatsApp.')
          "
          @update:model-value="(v) => setSetting('consent_text', v)"
        />
        <ErrorMessage
          v-if="!collectsPhone"
          :message="
            __(
              'Add a phone or mobile field — the checkbox only shows on forms that ask for one.',
            )
          "
        />
      </template>
    </section>
    <!-- channel follow-ups (doco_marketing addon) -->
    <template v-if="channels">
      <ConfirmationSection />
      <EmailSection />
    </template>
  </div>
</template>

<script setup>
import SegmentedControl from './SegmentedControl.vue'
import ChoiceRadio from './ChoiceRadio.vue'
import { Combobox, ErrorMessage, FormControl, Switch } from 'frappe-ui'
import { usersStore } from '@/stores/users'
import LucideInfo from '~icons/lucide/info'
import LucideX from '~icons/lucide/x'
import { computed, h, inject } from 'vue'
import { inputFields } from './formModel'
import { FORM_BUILDER, targetOptions } from './useFormBuilder'
import { FORM_CHANNELS } from './channels/useFormChannels'
import ConfirmationSection from './channels/ConfirmationSection.vue'
import EmailSection from './channels/EmailSection.vue'

// the builder model, shared with the page and the other panels
const b = inject(FORM_BUILDER)
const channels = inject(FORM_CHANNELS, null)

// small heading + one-line hint used by every block in the panel
const PanelHeading = (p) =>
  h('div', { class: 'flex flex-col gap-0.5' }, [
    h('div', { class: 'text-base font-semibold text-ink-gray-9' }, p.title),
    p.hint ? h('div', { class: 'text-p-sm text-ink-gray-6' }, p.hint) : null,
  ])
PanelHeading.props = ['title', 'hint']

const { users, getUser } = usersStore()
const userName = (email) => getUser(email)?.full_name || email
const opts = computed(() => b.options.data || {})

const crmUsers = computed(() =>
  (users.data?.crmUsers || []).filter((u) => u.enabled !== 0),
)
const userOptions = computed(() =>
  crmUsers.value.map((u) => ({ label: u.full_name || u.name, value: u.name })),
)
const watcherOptions = computed(() =>
  userOptions.value.filter((o) => !b.settings.notify_users.includes(o.value)),
)

const assignModes = computed(() => {
  const rules = opts.value.assignment_rules?.length || 0
  let rulesHint
  if (rules)
    rulesHint = __('{0} active assignment rule(s) pick the owner.', [rules])
  else if (opts.value.auto_assign)
    rulesHint = __('Auto-assign gives it to the least busy salesperson.')
  else
    rulesHint = __(
      'No rules are active, so submissions stay unassigned until someone picks them up.',
    )
  return [
    {
      value: 'rules',
      label: __('Use my assignment rules'),
      hint: rulesHint,
    },
    {
      value: 'user',
      label: __('Always the same person'),
      hint: __('Good for a form one person looks after.'),
    },
  ]
})

const notifyModes = [
  { value: 'instant', label: __('Every submission') },
  { value: 'digest', label: __('Daily summary') },
]

const statusField = computed(() =>
  b.hiddenFields.value.find((h) => h.fieldname === 'status'),
)
const statusOptions = computed(() => {
  const list = (opts.value.statuses || []).map((s) => ({
    label: __(s.value),
    value: s.value,
  }))
  const current = statusField.value?.default
  if (current && !list.some((o) => o.value === current))
    list.unshift({ label: __(current), value: current })
  return list
})

const campaignOptions = computed(() => {
  const list = [{ label: __('No follow-up'), value: '' }]
  for (const c of opts.value.campaigns || [])
    list.push({ label: c.title || c.name, value: c.name })
  const current = b.settings.campaign
  if (current && !list.some((o) => o.value === current))
    list.push({ label: __('{0} (not active)', [current]), value: current })
  return list
})

const collectsPhone = computed(() =>
  inputFields(b.form.fields).some((f) =>
    ['mobile_no', 'phone'].includes(f.fieldname),
  ),
)

function setSetting(key, value) {
  b.settings[key] = value
  b.markDirty()
}
function addWatcher(user) {
  if (!user || b.settings.notify_users.includes(user)) return
  b.settings.notify_users.push(user)
  b.markDirty()
}
function removeWatcher(user) {
  b.settings.notify_users = b.settings.notify_users.filter((u) => u !== user)
  b.markDirty()
}
</script>
