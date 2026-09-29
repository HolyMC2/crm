<template>
  <section class="flex flex-col gap-3">
    <div class="flex flex-col gap-0.5">
      <div class="text-base font-semibold text-ink-gray-9">
        {{ __('Email') }}
      </div>
      <div class="text-p-sm text-ink-gray-6">
        {{
          __(
            'Emails go out from your own business address, never from the platform.',
          )
        }}
      </div>
    </div>

    <div
      v-if="!view.ready"
      class="flex flex-col items-start gap-2 rounded-lg border border-dashed border-outline-gray-3 p-3"
    >
      <div
        class="flex items-center gap-1.5 text-sm font-medium text-ink-gray-8"
      >
        <LucideMailX class="size-4 text-ink-gray-5" />
        {{ __('Connect your business email') }}
      </div>
      <p class="text-p-sm text-ink-gray-6">
        {{ view.hint || __('No business email account is connected yet.') }}
        {{
          __(
            'Until then these emails are not sent; everything else still works.',
          )
        }}
      </p>
      <Button
        :label="__('Connect email')"
        icon-left="mail"
        @click="openEmailSettings"
      />
    </div>
    <p v-else class="text-p-sm text-ink-gray-6">
      {{ __('Sending from {0}.', [view.sender]) }}
    </p>

    <label
      class="flex items-start gap-2.5"
      :class="!view.ready && 'opacity-60'"
    >
      <Switch
        :model-value="c.mail.notify_team_email"
        :disabled="!view.ready"
        @update:model-value="(v) => c.change(c.mail, 'notify_team_email', v)"
      />
      <span>
        <span class="block text-base text-ink-gray-9">{{
          __('Email the team')
        }}</span>
        <span class="block text-p-sm text-ink-gray-6">{{
          __(
            'The people under "Also tell" (or the owner) get each submission by email.',
          )
        }}</span>
      </span>
    </label>

    <div :class="!view.ready && 'opacity-60'">
      <FormControl
        type="select"
        :label="__('Confirmation email to the visitor')"
        :model-value="c.mail.confirm_email_template"
        :options="emailOptions"
        :disabled="!view.ready"
        @update:model-value="
          (v) => c.change(c.mail, 'confirm_email_template', v)
        "
      />
      <p class="mt-1 text-p-sm text-ink-gray-5">
        {{
          __(
            'Sent only when the visitor gave an email and ticked consent. Pick one of your email templates.',
          )
        }}
      </p>
    </div>
  </section>
</template>

<script setup>
import { Button, FormControl, Switch, createListResource } from 'frappe-ui'
import LucideMailX from '~icons/lucide/mail-x'
import { showSettings, activeSettingsPage } from '@/composables/settings'
import { computed, inject } from 'vue'
import { FORM_CHANNELS } from './useFormChannels'
import { mailView } from './channelModel'

const c = inject(FORM_CHANNELS)
const view = computed(() => mailView(c.channels.data?.mail))

const emailTemplates = createListResource({
  doctype: 'Email Template',
  fields: ['name'],
  pageLength: 200,
  auto: true,
})
const emailOptions = computed(() => [
  { label: __("Don't send"), value: '' },
  ...(emailTemplates.data || []).map((t) => ({ label: t.name, value: t.name })),
])

// the CRM's own Settings → Email → Accounts page, not Desk
function openEmailSettings() {
  activeSettingsPage.value = __('Accounts')
  showSettings.value = true
}
</script>
