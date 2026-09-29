<template>
  <Dialog
    v-model="show"
    :options="{ title: step === 1 ? __('New form') : chosenLabel, size: '2xl' }"
  >
    <template #body-content>
      <!-- step 1: start from something that already works -->
      <div v-if="step === 1" class="flex flex-col gap-3">
        <p class="text-p-base text-ink-gray-6">
          {{
            __('Pick a starting point. Everything can be changed afterwards.')
          }}
        </p>
        <TemplateGrid :templates="templates.data || []" @pick="pick" />
      </div>

      <!-- step 2: the few things only the author knows -->
      <div v-else class="flex flex-col gap-4">
        <FormControl
          ref="titleInput"
          v-model="draft.title"
          type="text"
          :label="__('Title')"
          :placeholder="chosenLabel"
          @input="onTitleInput"
        />
        <div>
          <div class="mb-1.5 text-xs text-ink-gray-5">
            {{ __('Web address') }}
          </div>
          <div
            class="flex h-7 cursor-text items-center rounded border border-transparent bg-surface-gray-2 px-2.5 text-base hover:bg-surface-gray-3 focus-within:border-outline-gray-4 focus-within:bg-surface-base"
          >
            <span class="shrink-0 truncate text-ink-gray-5"
              >{{ origin }}/crm-form/</span
            >
            <input
              v-model="draft.route"
              :aria-label="__('Web address')"
              class="min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-ink-gray-8 focus:outline-none focus:ring-0"
              @input="routeEdited = true"
            />
          </div>
          <p
            class="mt-1 text-p-sm"
            :class="routeOk ? 'text-ink-gray-5' : 'text-ink-red-5'"
          >
            {{
              routeOk
                ? __('If it’s taken, a number is added.')
                : __('Use lowercase letters, numbers and dashes.')
            }}
          </p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <FormControl
            v-if="!template"
            v-model="draft.document_type"
            type="select"
            :label="__('Each submission creates')"
            :options="targetOptions()"
          />
          <FormControl
            v-model="draft.language"
            type="select"
            :label="__('Language visitors see')"
            :options="languageOptions"
          />
        </div>
        <ErrorMessage v-if="error" :message="error" />
      </div>
    </template>
    <template #actions>
      <div v-if="step === 2" class="flex justify-between gap-2">
        <Button :label="__('Back')" @click="step = 1" />
        <Button
          variant="solid"
          :label="__('Create form')"
          :loading="creating"
          :disabled="!routeOk"
          @click="create"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import {
  Button,
  Dialog,
  ErrorMessage,
  FormControl,
  call,
  createResource,
} from 'frappe-ui'
import { useTelemetry } from 'frappe-ui/frappe'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import TemplateGrid from './TemplateGrid.vue'
import { isValidRoute, slugify } from './formModel'
import { targetOptions } from './useFormBuilder'

const show = defineModel({ type: Boolean, default: false })
const props = defineProps({ initialTemplate: { type: String, default: null } })

const router = useRouter()
const { capture } = useTelemetry()
const origin = window.location.origin

const step = ref(1)
const template = ref(null)
const draft = reactive({
  title: '',
  route: '',
  document_type: 'CRM Lead',
  language: '',
})
const routeEdited = ref(false)
const creating = ref(false)
const error = ref('')
const titleInput = ref(null)

const templates = createResource({
  url: 'crm.api.form.get_form_templates',
  cache: 'crm-form-templates',
  auto: true,
})
const languages = createResource({
  url: 'frappe.client.get_list',
  params: {
    doctype: 'Language',
    fields: ['name', 'language_name'],
    filters: { enabled: 1 },
    order_by: 'language_name asc',
    limit_page_length: 0,
  },
  cache: 'crm-form-languages',
  auto: true,
})
const defaults = createResource({
  url: 'crm.api.form.get_form_options',
  params: { document_type: 'CRM Lead' },
  auto: true,
})
const languageOptions = computed(() =>
  (languages.data || []).map((l) => ({
    label: l.language_name || l.name,
    value: l.name,
  })),
)

const chosenLabel = computed(() =>
  template.value
    ? templates.data?.find((t) => t.key === template.value)?.label
    : __('Blank form'),
)
const routeOk = computed(() => isValidRoute(slugify(draft.route)))

function reset() {
  step.value = 1
  template.value = null
  Object.assign(draft, {
    title: '',
    route: '',
    document_type: 'CRM Lead',
    language: defaults.data?.default_language || '',
  })
  routeEdited.value = false
  error.value = ''
}
watch(show, (open) => {
  if (!open) return
  reset()
  if (props.initialTemplate !== null) pick(props.initialTemplate)
})
watch(
  () => defaults.data,
  (d) => {
    if (d && !draft.language) draft.language = d.default_language
  },
)

async function pick(key) {
  template.value = key || null
  const t = templates.data?.find((x) => x.key === key)
  draft.title = ''
  draft.route = slugify(t?.label || '')
  if (t) draft.document_type = t.document_type
  step.value = 2
  await nextTick()
  titleInput.value?.$el?.querySelector('input')?.focus()
}
function onTitleInput() {
  if (!routeEdited.value)
    draft.route = slugify(draft.title || chosenLabel.value)
}

async function create() {
  error.value = ''
  creating.value = true
  try {
    const doc = await call('crm.api.form.create_form', {
      template: template.value,
      title: draft.title || null,
      route: slugify(draft.route),
      document_type: draft.document_type,
      language: draft.language || null,
    })
    capture('form_created', {
      template: template.value || 'blank',
      doctype: draft.document_type,
    })
    show.value = false
    router.push({ name: 'Form', params: { formId: doc.name } })
  } catch (e) {
    error.value = e?.messages?.[0] || e?.message || __('Could not create form')
  } finally {
    creating.value = false
  }
}
</script>
