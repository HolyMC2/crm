<template>
  <Dialog
    v-model="open"
    :options="{ title: __('Ask customers after they buy'), size: 'lg' }"
  >
    <template #body-content>
      <div class="space-y-4">
        <p class="text-sm text-ink-gray-7">
          {{
            __(
              'A few days after a sale with a phone, Muelle prepares one WhatsApp asking from 0 to 10 whether they would recommend you, and to rate what they bought. Someone approves each message before it goes out.',
            )
          }}
        </p>
        <div v-if="loading" role="status" class="text-sm text-ink-gray-6">
          {{ __('Loading…', null, 'Encuestas') }}
        </div>
        <template v-else>
          <label class="flex min-h-11 items-center gap-2 text-base">
            <input v-model="form.enabled" type="checkbox" class="rounded" />
            {{ __('Ask after every sale') }}
          </label>
          <FormControl
            v-model="form.template"
            type="select"
            :label="__('WhatsApp template')"
            :options="templateOptions"
            :disabled="!templates.length"
          />
          <p
            v-if="!templates.length"
            role="status"
            class="rounded-md bg-surface-amber-1 px-3 py-2 text-sm text-ink-amber-8"
          >
            {{
              __(
                'You have no WhatsApp template approved by Meta yet. Create one with a name, the product and the link, wait for approval, then come back.',
              )
            }}
            <a
              href="/app/whatsapp-templates/new"
              class="ml-1 underline"
              target="_blank"
              rel="noopener"
              >{{ __('Create a template') }}</a
            >
          </p>
          <div class="grid grid-cols-2 gap-3">
            <FormControl
              v-model="form.min_days"
              type="number"
              :label="__('Ask after (days)')"
            />
            <FormControl
              v-model="form.max_days"
              type="number"
              :label="__('Stop asking after (days)')"
            />
          </div>
          <p
            v-if="problem"
            role="alert"
            class="rounded-md bg-surface-red-1 p-3 text-sm text-ink-red-7"
          >
            <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          </p>
        </template>
      </div>
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          :label="__('Cancel', null, 'Encuestas')"
          @click="open = false"
        />
        <Button
          variant="solid"
          :label="__('Save', null, 'Encuestas')"
          :loading="saving"
          :disabled="loading || (form.enabled && !form.template)"
          class="min-h-11 sm:min-h-8"
          @click="save"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import { encuestasApi, problemOf } from '@/composables/useEncuestas'

const open = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['saved'])
const loading = ref(false)
const saving = ref(false)
const problem = ref(null)
const templates = ref([])
const form = reactive({
  enabled: true,
  template: '',
  min_days: 2,
  max_days: 14,
})

const templateOptions = computed(() => [
  { label: __('Choose a template'), value: '' },
  ...templates.value.map((t) => ({
    label: [t.template_name || t.name, t.language].filter(Boolean).join(' · '),
    value: t.name,
  })),
])

async function load() {
  loading.value = true
  problem.value = null
  try {
    const data = await encuestasApi('setup_options')
    templates.value = data.templates || []
    const ask = data.ask || {}
    form.enabled = ask.state === 'off' ? true : Boolean(ask.enabled)
    form.template = templates.value.some((t) => t.name === ask.template)
      ? ask.template
      : templates.value[0]?.name || ''
    form.min_days = ask.min_days ?? 2
    form.max_days = ask.max_days ?? 14
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  problem.value = null
  try {
    const ask = await encuestasApi('save_setup', {
      enabled: form.enabled ? 1 : 0,
      template: form.template || null,
      min_days: Number(form.min_days),
      max_days: Number(form.max_days),
    })
    emit('saved', ask)
    open.value = false
  } catch (error) {
    // The form stays as the owner left it; the message says what to change.
    problem.value = problemOf(error)
  } finally {
    saving.value = false
  }
}

watch(open, (value) => {
  if (value) load()
})
</script>
