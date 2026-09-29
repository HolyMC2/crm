<template>
  <div class="flex flex-col gap-5">
    <p class="text-p-base text-ink-gray-6">
      {{
        __(
          'The words around the questions. Use {business} for your business name.',
        )
      }}
    </p>
    <FormControl
      type="text"
      :label="__('Button text')"
      :model-value="b.form.submit_button_label"
      :placeholder="__('Submit')"
      @update:model-value="(v) => set('submit_button_label', v)"
    />
    <FormControl
      type="textarea"
      :rows="3"
      :label="__('Thank-you message')"
      :model-value="b.form.success_message"
      :placeholder="__('Thanks! We got your message and will reply soon.')"
      @update:model-value="(v) => set('success_message', v)"
    />
    <div>
      <FormControl
        type="text"
        :label="__('Then send visitors to (optional)')"
        :model-value="b.form.redirect_url"
        placeholder="https://"
        @update:model-value="(v) => set('redirect_url', v)"
      />
      <p
        class="mt-1.5 text-p-sm"
        :class="redirectOk ? 'text-ink-gray-5' : 'text-ink-red-5'"
      >
        {{
          redirectOk
            ? __(
                'After the thank-you message, visitors go to this page. Leave blank to stay on the message.',
              )
            : __('Use a full address starting with https://')
        }}
      </p>
    </div>
    <div>
      <div class="mb-1.5 text-xs text-ink-gray-5">{{ __('Web address') }}</div>
      <div
        class="flex h-7 items-center rounded border border-transparent bg-surface-gray-2 px-2.5 text-base hover:bg-surface-gray-3 focus-within:border-outline-gray-4 focus-within:bg-surface-base"
      >
        <span class="shrink-0 text-ink-gray-5">/crm-form/</span>
        <input
          :value="b.form.route"
          :aria-label="__('Web address')"
          class="min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-ink-gray-8 focus:outline-none focus:ring-0"
          @input="(e) => set('route', e.target.value.toLowerCase())"
        />
      </div>
      <p
        class="mt-1.5 text-p-sm"
        :class="routeOk ? 'text-ink-gray-5' : 'text-ink-red-5'"
      >
        {{
          !routeOk
            ? __('Use lowercase letters, numbers and dashes.')
            : b.savedPublished.value
              ? __('Changing it breaks links and QR codes you already shared.')
              : __('The end of the link people open.')
        }}
      </p>
    </div>
    <FormControl
      type="select"
      :label="__('Language visitors see')"
      :model-value="b.settings.language"
      :options="languageOptions"
      @update:model-value="(v) => ((b.settings.language = v), b.markDirty())"
    />
  </div>
</template>

<script setup>
import { FORM_BUILDER } from './useFormBuilder'
import { FormControl, createResource } from 'frappe-ui'
import { computed, inject } from 'vue'
import { isValidRoute } from './formModel'

// the builder model, shared with the page and the other panels
const b = inject(FORM_BUILDER)

function set(key, value) {
  b.form[key] = value
  b.markDirty()
}
const routeOk = computed(() => isValidRoute(b.form.route))
const redirectOk = computed(
  () => !b.form.redirect_url || /^https?:\/\//.test(b.form.redirect_url),
)

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
const languageOptions = computed(() =>
  (languages.data || []).map((l) => ({
    label: l.language_name || l.name,
    value: l.name,
  })),
)
</script>
