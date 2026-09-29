<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex flex-none items-center justify-between gap-2 pb-3">
      <div class="text-sm font-medium text-ink-gray-7">
        {{ __('What visitors see') }}
      </div>
      <div
        class="flex items-center gap-0.5 rounded-full bg-surface-gray-2 p-0.5"
        role="group"
        :aria-label="__('Preview size')"
      >
        <button
          v-for="d in devices"
          :key="d.key"
          class="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
          :class="
            device === d.key
              ? 'bg-surface-base text-ink-gray-9 shadow-sm'
              : 'text-ink-gray-6'
          "
          :aria-pressed="device === d.key"
          @click="device = d.key"
        >
          <component :is="d.icon" class="size-3.5" />
          {{ d.label }}
        </button>
      </div>
    </div>

    <!-- the device: a phone outline around the page so it reads as "the public
         page", not as another settings card -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div
        class="mx-auto transition-[max-width] duration-200"
        :class="
          device === 'phone'
            ? 'max-w-[380px] rounded-[28px] border-[6px] border-outline-gray-3 bg-surface-gray-2 p-3 shadow-sm'
            : 'max-w-[620px] rounded-xl border border-outline-gray-2 bg-surface-gray-2 p-5'
        "
      >
        <div
          class="rounded-[14px] border border-outline-gray-1 bg-surface-base p-5"
        >
          <div
            v-if="business"
            class="mb-4 text-[13px] font-semibold text-ink-gray-5"
          >
            {{ business }}
          </div>
          <div v-if="submitted" class="flex flex-col items-center gap-3 py-8">
            <div
              class="flex size-12 items-center justify-center rounded-full bg-surface-green-2 text-ink-green-6"
            >
              <LucideCheck class="size-6" />
            </div>
            <div class="text-center text-lg font-semibold text-ink-gray-9">
              {{ fill(form.success_message) || __('Thank you!') }}
            </div>
            <p v-if="form.redirect_url" class="text-p-sm text-ink-gray-5">
              {{ __('Then visitors go to {0}', [form.redirect_url]) }}
            </p>
            <Button :label="__('Fill it in again')" @click="reset" />
          </div>
          <template v-else>
            <div class="text-xl font-semibold text-ink-gray-9">
              {{ fill(form.title) || __('Form title') }}
            </div>
            <div
              v-if="form.description"
              class="mt-3 whitespace-pre-wrap text-sm text-ink-gray-6"
            >
              {{ fill(form.description) }}
            </div>
            <div class="mt-5 flex flex-col gap-5">
              <div v-for="(section, si) in layout" :key="si">
                <div
                  v-if="section.label"
                  class="mb-3 text-sm font-semibold text-ink-gray-8"
                >
                  {{ section.label }}
                </div>
                <div
                  class="grid gap-x-4"
                  :style="{
                    gridTemplateColumns:
                      device === 'phone'
                        ? '1fr'
                        : `repeat(${section.columns.length}, minmax(0,1fr))`,
                  }"
                >
                  <div
                    v-for="(col, ci) in section.columns"
                    :key="ci"
                    class="flex flex-col gap-4"
                  >
                    <div
                      v-for="f in col"
                      v-show="fieldVisible(f)"
                      :key="f.fieldname"
                    >
                      <label
                        v-if="f.fieldtype !== 'Check'"
                        :for="`pv-${f.fieldname}`"
                        class="mb-1.5 block text-sm text-ink-gray-6"
                      >
                        {{ f.label
                        }}<span v-if="fieldRequired(f)" class="text-ink-red-5"
                          >*</span
                        >
                      </label>
                      <FormControl
                        v-if="TEXTAREA_TYPES.includes(f.fieldtype)"
                        :id="`pv-${f.fieldname}`"
                        v-model="values[f.fieldname]"
                        type="textarea"
                        :placeholder="fill(f.placeholder)"
                        :disabled="fieldReadOnly(f)"
                      />
                      <FormControl
                        v-else-if="['Select', 'Link'].includes(f.fieldtype)"
                        :id="`pv-${f.fieldname}`"
                        v-model="values[f.fieldname]"
                        type="select"
                        :options="selectOptions(f)"
                        :disabled="fieldReadOnly(f)"
                      />
                      <label
                        v-else-if="f.fieldtype === 'Check'"
                        class="flex items-center gap-2 text-sm text-ink-gray-6"
                      >
                        <FormControl
                          v-model="values[f.fieldname]"
                          type="checkbox"
                          :disabled="fieldReadOnly(f)"
                        />
                        {{ f.label
                        }}<span v-if="fieldRequired(f)" class="text-ink-red-5"
                          >*</span
                        >
                      </label>
                      <FormControl
                        v-else
                        :id="`pv-${f.fieldname}`"
                        v-model="values[f.fieldname]"
                        :type="inputType(f)"
                        :placeholder="fill(f.placeholder)"
                        :disabled="fieldReadOnly(f)"
                      />
                      <div
                        v-if="f.field_description"
                        class="mt-1 text-sm text-ink-gray-5"
                      >
                        {{ fill(f.field_description) }}
                      </div>
                      <div
                        v-if="missing.includes(f.fieldname)"
                        class="mt-1 text-sm text-ink-red-5"
                      >
                        {{ __('Required') }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div
                v-if="!layout.length"
                class="rounded-md border border-dashed border-outline-gray-2 p-4 text-center text-sm text-ink-gray-5"
              >
                {{ __('Add a question and it shows up here.') }}
              </div>
              <label
                v-if="consentText"
                class="flex items-start gap-2 text-sm text-ink-gray-6"
              >
                <FormControl v-model="consent" type="checkbox" class="mt-0.5" />
                <span>{{ consentText }}</span>
              </label>
              <div class="flex justify-end">
                <Button
                  variant="solid"
                  size="md"
                  :label="form.submit_button_label || __('Submit')"
                  @click="tryIt"
                />
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div
      class="mt-3 flex flex-none items-center justify-between gap-3 rounded-lg bg-surface-gray-2 px-3 py-2.5"
    >
      <p class="text-p-sm text-ink-gray-6">
        {{
          __(
            'Fill it in above, then send a test to see the record it creates. Nothing is saved.',
          )
        }}
      </p>
      <Button
        :label="__('Send a test')"
        icon-left="send"
        :loading="testing"
        @click="sendTest"
      />
    </div>
  </div>
</template>

<script setup>
import { Button, FormControl } from 'frappe-ui'
import LucideCheck from '~icons/lucide/check'
import LucideSmartphone from '~icons/lucide/smartphone'
import LucideMonitor from '~icons/lucide/monitor'
import { evaluateDependsOnValue } from '@/utils/expressions'
import { computed, reactive, ref } from 'vue'
import { fillBusiness, layoutFromFields, inputFields } from './formModel'

const props = defineProps({
  form: { type: Object, required: true },
  settings: { type: Object, required: true },
  business: { type: String, default: '' },
  linkOptions: { type: Object, default: () => ({}) },
  testing: { type: Boolean, default: false },
})
const emit = defineEmits(['test'])

const devices = [
  { key: 'phone', label: __('Phone'), icon: LucideSmartphone },
  { key: 'desktop', label: __('Desktop'), icon: LucideMonitor },
]
const device = ref('phone')
const values = reactive({})
const consent = ref(false)
const submitted = ref(false)
const missing = ref([])

const TEXTAREA_TYPES = [
  'Small Text',
  'Text',
  'Long Text',
  'Text Editor',
  'HTML Editor',
  'Markdown Editor',
]

const fill = (text) => fillBusiness(text, props.business)
const layout = computed(() => layoutFromFields(props.form.fields))
const collectsPhone = computed(() =>
  inputFields(props.form.fields).some((f) =>
    ['mobile_no', 'phone'].includes(f.fieldname),
  ),
)
const consentText = computed(() =>
  props.settings.consent_enabled && collectsPhone.value
    ? fill(props.settings.consent_text)
    : '',
)

const evalRule = (expr, fallback) =>
  expr ? evaluateDependsOnValue(expr, values) : fallback
const fieldVisible = (f) => evalRule(f.depends_on, true)
const fieldRequired = (f) =>
  f.reqd ? true : evalRule(f.mandatory_depends_on, false)
const fieldReadOnly = (f) => evalRule(f.read_only_depends_on, false)

function selectOptions(f) {
  const opts =
    f.fieldtype === 'Select'
      ? (f.options || '').split('\n').filter(Boolean)
      : props.linkOptions[f.options] || []
  return [
    { label: fill(f.placeholder) || __('Select…'), value: '' },
    ...opts.map((o) => ({ label: o, value: o })),
  ]
}
function inputType(f) {
  if (f.options === 'Email') return 'email'
  if (f.options === 'Phone' || f.fieldtype === 'Phone') return 'tel'
  if (['Int', 'Float', 'Currency', 'Percent'].includes(f.fieldtype))
    return 'number'
  if (f.fieldtype === 'Date') return 'date'
  if (f.fieldtype === 'Datetime') return 'datetime-local'
  if (f.fieldtype === 'Time') return 'time'
  if (f.fieldtype === 'Color') return 'color'
  return 'text'
}

function validate() {
  missing.value = inputFields(props.form.fields)
    .filter(
      (f) =>
        fieldVisible(f) &&
        fieldRequired(f) &&
        (values[f.fieldname] === undefined || values[f.fieldname] === ''),
    )
    .map((f) => f.fieldname)
  return !missing.value.length
}
function tryIt() {
  if (validate()) submitted.value = true
}
function sendTest() {
  if (!validate()) return
  emit('test', {
    values: Object.fromEntries(
      inputFields(props.form.fields)
        .filter((f) => fieldVisible(f))
        .map((f) => [
          f.fieldname,
          f.fieldtype === 'Check'
            ? values[f.fieldname]
              ? 1
              : 0
            : values[f.fieldname] ?? '',
        ]),
    ),
    consent: consent.value,
  })
}
function reset() {
  submitted.value = false
  missing.value = []
  consent.value = false
  Object.keys(values).forEach((k) => delete values[k])
}
defineExpose({ reset })
</script>
