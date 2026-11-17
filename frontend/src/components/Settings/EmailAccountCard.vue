<template>
  <div
    class="flex items-center justify-between px-2 py-3 border-outline-elevation-2 cursor-pointer hover:bg-surface-sidebar rounded-4"
  >
    <!-- avatar and name -->
    <div class="flex items-center justify-between gap-2">
      <EmailProviderIcon :logo="emailIcon[emailAccount.service]" />
      <div>
        <div class="text-p-base text-ink-gray-8">
          {{ emailAccount.email_account_name }}
        </div>
        <div class="text-p-sm text-ink-gray-5">{{ emailAccount.email_id }}</div>
      </div>
    </div>
    <div class="flex items-center gap-1.5">
      <Badge
        v-if="personal"
        variant="subtle"
        theme="blue"
        :label="__('Personal')"
        data-testid="email-account-personal"
      >
        <template #prefix>
          <span class="lucide-lock size-3" aria-hidden="true" />
        </template>
      </Badge>
      <Badge variant="subtle" :label="badgeTitle" theme="gray" />
    </div>
    <!-- email id -->
  </div>
</template>

<script setup>
import { emailIcon } from './emailConfig'
import EmailProviderIcon from './EmailProviderIcon.vue'
import { computed } from 'vue'

const props = defineProps({
  emailAccount: { type: Object, required: true },
})

// only its owner reads a personal mailbox (crm.permissions.correo)
const personal = computed(() => props.emailAccount.crm_alcance === 'Personal')

const badgeTitle = computed(() => {
  if (
    props.emailAccount.default_incoming &&
    props.emailAccount.default_outgoing
  ) {
    return __('Default Sending & Inbox')
  } else if (props.emailAccount.default_incoming) {
    return __('Default Inbox')
  } else if (props.emailAccount.default_outgoing) {
    return __('Default Sending')
  } else {
    return __('Inbox')
  }
})
</script>

<style scoped></style>
