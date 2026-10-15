<template>
  <section class="space-y-4" :aria-label="__('Notifications in Paperless')">
    <div>
      <h3 class="text-base font-semibold text-ink-gray-9">
        {{ __('Notifications in Paperless') }}
      </h3>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'With a notice from Paperless, new documents arrive in a minute instead of waiting for the next check. This is what Muelle would set up in Paperless:',
          )
        }}
      </p>
    </div>
    <p
      v-if="!connector.enabled"
      class="rounded-lg bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
    >
      {{ __('Resume the connection to see or create its notices.') }}
    </p>
    <div v-else-if="loading && !plan" class="space-y-2" aria-busy="true">
      <div class="h-14 animate-pulse rounded bg-surface-gray-2" />
      <div class="h-14 animate-pulse rounded bg-surface-gray-2" />
    </div>
    <ArchivoGuard v-else-if="loadProblem" :state="loadProblem" @action="load" />
    <template v-else-if="plan">
      <ol class="space-y-2">
        <li
          v-for="step in plan.steps"
          :key="step.what"
          class="space-y-1 rounded-lg border border-outline-gray-2 p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="min-w-0 flex-1 break-words text-base font-medium text-ink-gray-9"
              >{{ stepTitle(step) }}</span
            >
            <Badge
              :theme="step.exists ? 'green' : 'gray'"
              :label="
                step.exists ? __('Already in Paperless') : __('To create')
              "
            />
          </div>
          <p class="break-words text-sm text-ink-gray-6">{{ step.name }}</p>
          <p class="text-sm text-ink-gray-7">{{ step.detail }}</p>
          <p v-if="step.url" class="break-all text-sm text-ink-gray-6">
            {{ __('Notice address: {0}', [step.url]) }}
          </p>
        </li>
      </ol>
      <p
        v-if="!plan.writes_allowed"
        class="rounded-lg border border-outline-amber-2 bg-surface-amber-1 p-3 text-sm text-ink-gray-8"
      >
        {{ plan.guard }}
      </p>
      <div
        v-if="connector.can_manage"
        class="flex flex-wrap items-center gap-2"
      >
        <Button
          variant="solid"
          class="min-h-11 sm:min-h-0"
          :label="allExist ? __('Update in Paperless') : __('Create in Paperless')"
          :disabled="!plan.writes_allowed"
          :title="!plan.writes_allowed ? plan.guard || undefined : undefined"
          :loading="applying"
          @click="apply"
        />
        <Button
          variant="ghost"
          class="min-h-11 sm:min-h-0"
          :label="__('Check again')"
          :loading="loading"
          @click="load"
        />
      </div>
      <p v-if="!plan.writes_allowed" class="text-sm text-ink-gray-6">
        {{
          __(
            'The button turns on when the owner of this Paperless allows Muelle to write in it.',
          )
        }}
      </p>
      <p
        v-if="applyError"
        role="alert"
        class="rounded-lg border border-outline-red-2 bg-surface-red-1 p-3 text-base text-ink-red-4"
      >
        {{ applyError }}
      </p>
    </template>
  </section>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { Badge, Button, toast } from 'frappe-ui'
import ArchivoGuard from '../ArchivoGuard.vue'
import { archivosApi, problem } from '@/composables/useArchivos'
import { connectorMethod } from '@/utils/archivosConectores'

const props = defineProps({
  connector: { type: Object, required: true },
})
const emit = defineEmits(['connector'])

const plan = ref(null),
  loading = ref(false),
  loadProblem = ref(null),
  applying = ref(false),
  applyError = ref('')
const allExist = computed(
  () => plan.value?.steps?.length && plan.value.steps.every((s) => s.exists),
)
function stepTitle(step) {
  if (step.what === 'workflow')
    return __('Notice when a document is added or changed')
  if (step.what === 'custom_field')
    return __('Field with the Muelle document number')
  if (step.what === 'tags') return __('Tags that say what Muelle did')
  return step.what
}

async function load() {
  if (!props.connector.enabled) return
  loading.value = true
  loadProblem.value = null
  try {
    plan.value = await archivosApi(connectorMethod('setup_plan'), {
      name: props.connector.name,
    })
  } catch (error) {
    loadProblem.value = problem(error)
  } finally {
    loading.value = false
  }
}
async function apply() {
  applying.value = true
  applyError.value = ''
  try {
    const result = await archivosApi(connectorMethod('setup_apply'), {
      name: props.connector.name,
    })
    const { connector, ...rest } = result || {}
    plan.value = rest
    if (connector) emit('connector', connector)
    toast.success(__('Notices created in Paperless'))
  } catch (error) {
    applyError.value = problem(error).message
  } finally {
    applying.value = false
  }
}
onMounted(load)
</script>
