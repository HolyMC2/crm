<!--
  «Sort with the assistant» for one mailbox (doco's correo agent, doco.docoutils.correo.api):
  off by default because reading mail with a model costs money. Switching it on sorts the last
  two days once; each morning the readers get the summary. Nothing changes in the mailbox.
  Shown only on sites with doco.
-->
<template>
  <section
    v-if="agent.data?.available"
    class="flex items-center justify-between gap-4"
    data-testid="email-agent"
  >
    <div class="flex min-w-0 flex-col gap-0.5">
      <div class="text-p-base-medium text-ink-gray-7">
        {{ __('Sort with the assistant') }}
      </div>
      <p class="text-p-sm text-ink-gray-5">
        {{
          __(
            'The assistant reads each new mail and sorts it: what needs you, money, agenda, noise. Every morning you get the summary. Nothing changes in the mailbox itself.',
          )
        }}
      </p>
      <ErrorMessage v-if="error" :message="error" />
    </div>
    <Switch
      :model-value="Boolean(agent.data.on)"
      :disabled="!agent.data.can_edit || saving"
      data-testid="email-agent-switch"
      @update:model-value="toggle"
    />
  </section>
</template>

<script setup>
import { hasApp } from '@/utils/crmCapabilities'
import { ErrorMessage, Switch, call, createResource, toast } from 'frappe-ui'
import { ref } from 'vue'

const props = defineProps({
  account: { type: String, required: true },
})

const agent = createResource({
  url: 'doco.docoutils.correo.api.agent',
  params: { account: props.account },
  auto: hasApp('doco'),
})
const saving = ref(false)
const error = ref('')

async function toggle(on) {
  saving.value = true
  error.value = ''
  try {
    agent.data = await call('doco.docoutils.correo.api.set_agent', {
      account: props.account,
      on: on ? 1 : 0,
    })
    toast.success(
      on
        ? __('The assistant is sorting the last two days of mail.')
        : __('Saved'),
    )
  } catch (err) {
    error.value = err?.messages?.[0] || __('Could not save. Try again.')
  } finally {
    saving.value = false
  }
}
</script>
