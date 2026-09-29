<template>
  <section class="flex flex-col gap-3">
    <PanelHeading
      :title="__('Confirm on WhatsApp')"
      :hint="
        __(
          'Reply to the visitor with an approved WhatsApp template. Each message waits in Approvals until someone sends it, and goes only to people who ticked consent.',
        )
      "
    />
    <div
      class="flex items-center gap-0.5 self-start rounded-full bg-surface-gray-2 p-0.5"
      role="group"
      :aria-label="__('Confirm on WhatsApp')"
    >
      <button
        v-for="m in modes"
        :key="m.value"
        class="rounded-full px-3 py-1 text-sm"
        :class="
          c.followup.mode === m.value
            ? 'bg-surface-base text-ink-gray-9 shadow-sm'
            : 'text-ink-gray-6'
        "
        :aria-pressed="c.followup.mode === m.value"
        @click="c.change(c.followup, 'mode', m.value)"
      >
        {{ m.label }}
      </button>
    </div>
    <template v-if="c.followup.mode === 'template'">
      <FormControl
        type="select"
        :label="__('Template')"
        :model-value="c.followup.template"
        :options="templateOptions"
        @update:model-value="(v) => c.change(c.followup, 'template', v)"
      />
      <p
        v-if="selected?.template"
        class="whitespace-pre-wrap rounded-md bg-surface-gray-2 p-2.5 text-p-sm text-ink-gray-7"
      >
        {{ selected.template }}
      </p>
      <div v-if="varCount || c.followup.template_params">
        <FormControl
          type="text"
          :label="__('Fill the variables with')"
          :model-value="c.followup.template_params"
          :placeholder="keys.slice(0, varCount).join(',')"
          @update:model-value="
            (v) => c.change(c.followup, 'template_params', v)
          "
        />
        <p
          class="mt-1 text-p-sm"
          :class="paramsNote.bad ? 'text-ink-red-5' : 'text-ink-gray-5'"
        >
          {{ paramsNote.text }}
        </p>
      </div>
      <ErrorMessage v-if="problem" :message="problem" />
    </template>
  </section>
</template>

<script setup>
import {
  ErrorMessage,
  FormControl,
  createListResource,
  createResource,
} from 'frappe-ui'
import { computed, h, inject } from 'vue'
import { paramsProblem, templateVarCount } from '@/utils/templateParams'
import { FORM_BUILDER } from '../useFormBuilder'
import { FORM_CHANNELS } from './useFormChannels'
import { followupProblem } from './channelModel'

const PanelHeading = (p) =>
  h('div', { class: 'flex flex-col gap-0.5' }, [
    h('div', { class: 'text-base font-semibold text-ink-gray-9' }, p.title),
    h('div', { class: 'text-p-sm text-ink-gray-6' }, p.hint),
  ])
PanelHeading.props = ['title', 'hint']

const b = inject(FORM_BUILDER)
const c = inject(FORM_CHANNELS)

const modes = [
  { value: 'none', label: __('No') },
  { value: 'template', label: __('With a template') },
]

const templates = createListResource({
  doctype: 'WhatsApp Templates',
  fields: ['name', 'template_name', 'template', 'status'],
  pageLength: 200,
  auto: true,
})
const vars = createResource({
  url: 'doco_marketing.api.campaigns.template_variables',
  auto: true,
})
const keys = computed(() => (vars.data?.keys || []).map((k) => k.key))

const templateOptions = computed(() => [
  { label: __('Choose a template'), value: '' },
  ...(templates.data || []).map((t) => ({
    label:
      t.status === 'APPROVED'
        ? t.template_name || t.name
        : `${t.template_name || t.name} (${t.status || '—'})`,
    value: t.name,
    disabled: t.status !== 'APPROVED' && t.name !== c.followup.template,
  })),
])
const selected = computed(() =>
  (templates.data || []).find((t) => t.name === c.followup.template),
)
const varCount = computed(() => templateVarCount(selected.value?.template))
const paramsNote = computed(() => {
  const problem = paramsProblem(
    selected.value?.template,
    c.followup.template_params,
    keys.value,
  )
  const list = __('Available: {0}', [keys.value.join(', ')])
  if (problem?.unknown)
    return {
      bad: true,
      text: __('Unknown: {0}. {1}', [problem.unknown.join(', '), list]),
    }
  if (problem)
    return {
      bad: true,
      text: __('The template has {0} variable(s); you filled {1}. {2}', [
        problem.need,
        problem.have,
        list,
      ]),
    }
  return {
    bad: false,
    text: __('One per variable, in order, separated by commas. {0}', [list]),
  }
})
const problem = computed(() =>
  followupProblem({
    mode: c.followup.mode,
    template: c.followup.template,
    templates: templates.data,
    consentEnabled: !!b.settings.consent_enabled,
    whatsappMode: c.channels.data?.whatsapp?.mode,
  }),
)
</script>
