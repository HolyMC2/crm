<template>
  <main class="min-w-0 flex-1 overflow-y-auto p-4 sm:p-8">
    <div class="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 class="text-2xl font-semibold">{{ __('Sales automations') }}</h1>
        <p class="mt-2 text-sm text-ink-gray-6">
          {{
            __(
              'Configure follow-up, review approvals, inspect results and pause work from the automation workspace.',
            )
          }}
        </p>
      </header>
      <p v-if="loading" role="status">{{ __('Checking access…') }}</p>
      <div v-else-if="error" role="alert" class="space-y-3">
        <p>{{ error }}</p>
        <button class="automation-action" @click="load">
          {{ __('Retry') }}
        </button>
      </div>
      <template v-else-if="context">
        <p v-if="!context.available" role="status">
          {{
            context.reason === 'not_installed'
              ? __(
                  'The automation workspace is not installed on this site. You can continue managing sales and next steps in CRM.',
                )
              : __(
                  'Automations are still being set up on this system. Ask your administrator or support to finish the setup.',
                )
          }}
        </p>
        <template v-else>
          <p
            v-if="context.reference"
            class="break-words rounded border border-outline-gray-2 p-3"
          >
            {{ __('Source') }}: {{ context.reference.doctype }} ·
            {{ context.reference.name }}
          </p>
          <ol class="list-decimal space-y-3 pl-6 text-sm">
            <li>{{ __('Choose a sales recipe or an existing workflow.') }}</li>
            <li>
              {{
                __(
                  'Review its scope, responsible person, conditions and expected actions. Simulate it with fictional data.',
                )
              }}
            </li>
            <li>
              {{
                __(
                  'Publish the reviewed version, start work explicitly, and inspect its result in Pending or Activity.',
                )
              }}
            </li>
          </ol>
          <p class="text-sm text-ink-gray-6">
            {{
              __(
                'Opening the workspace does not start a workflow, activate a bot or send a message.',
              )
            }}
          </p>
          <a class="automation-action" :href="context.workspace_url">{{
            __('Open sales automation workspace')
          }}</a>
          <p
            v-if="context.customer_flows_available"
            class="text-sm text-ink-gray-6"
          >
            {{
              __(
                'Existing customer flows and their active runs remain available in the same workspace. Review their account and publication state before activation.',
              )
            }}
          </p>
        </template>
      </template>
    </div>
  </main>
</template>
<script setup>
import { onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { call } from 'frappe-ui'
const route = useRoute()
const context = ref(null),
  loading = ref(false),
  error = ref('')
let epoch = 0
async function load() {
  const stamp = ++epoch
  loading.value = true
  error.value = ''
  context.value = null
  try {
    const result = await call('crm.api.automation_workspace.get_context', {
      reference_doctype: route.query.reference_doctype || undefined,
      reference_name: route.query.reference_name || undefined,
      return_to: route.query.return_to || '/crm/automations',
    })
    if (stamp !== epoch) return
    if (
      typeof result?.available !== 'boolean' ||
      (result.available &&
        !result.workspace_url?.startsWith('/desk/automatizaciones?'))
    )
      throw new Error(__('The automation response is incomplete. Try again.'))
    context.value = result
  } catch (e) {
    if (stamp === epoch)
      error.value =
        e?.messages?.[0] ||
        e?.message ||
        __('The automation service is unavailable. Try again.')
  } finally {
    if (stamp === epoch) loading.value = false
  }
}
watch(() => route.fullPath, load, { immediate: true })
onUnmounted(() => {
  epoch++
})
</script>
<style scoped>
.automation-action {
  @apply inline-flex min-h-11 items-center rounded border border-outline-gray-2 px-4 py-2 text-sm font-medium focus-visible:ring-2;
}
</style>
