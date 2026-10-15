<template>
  <template v-if="allowed.length">
    <template v-if="trigger">
      <button
        v-if="variant === 'appbar'"
        type="button"
        class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
        :aria-label="buttonLabel"
        :title="buttonLabel"
        v-bind="$attrs"
        data-capturar-documento
        @click="show"
      >
        <FeatherIcon name="file-plus" class="h-6 w-6" />
      </button>
      <Button
        v-else
        :variant="variant"
        icon-left="file-plus"
        :label="buttonLabel"
        class="min-h-11 sm:min-h-8"
        v-bind="$attrs"
        data-capturar-documento
        @click="show"
      />
    </template>
    <!-- A bottom sheet on a phone, a dialog on wider screens. -->
    <PowerSheet
      v-model="sheetOpen"
      kind="capturar-documento"
      :title="buttonLabel"
      :subtitle="
        __(
          'Upload the quote, invoice, ticket or transfer receipt. We read it and you review a draft before anything is recorded.',
        )
      "
    >
      <fieldset v-if="allowed.length > 1" class="space-y-1">
        <legend class="pb-1 text-sm text-ink-gray-7">
          {{ __('What do you want to create?') }}
        </legend>
        <div class="flex flex-wrap gap-2">
          <Button
            v-for="target in allowed"
            :key="target"
            class="min-h-11 sm:min-h-8"
            :variant="form.target === target ? 'solid' : 'subtle'"
            :aria-pressed="form.target === target"
            :label="targetLabel(target, boot)"
            :disabled="busy"
            @click="form.target = target"
          />
        </div>
      </fieldset>
      <FormControl
        v-if="companies.length > 1"
        v-model="form.company"
        type="select"
        :label="__('Company')"
        :disabled="busy"
        :options="companies.map((c) => ({ label: c, value: c }))"
      />
      <div class="space-y-1">
        <label :for="fileId" class="block text-sm text-ink-gray-7">{{
          __('File or photo')
        }}</label>
        <input
          :id="fileId"
          ref="fileInput"
          type="file"
          class="block min-h-11 w-full text-sm text-ink-gray-8 file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-surface-gray-2 file:px-3 file:text-ink-gray-8 sm:file:min-h-8"
          :accept="boot?.accept || ''"
          :disabled="busy"
          @change="pickFile"
        />
        <p class="text-xs text-ink-gray-6">
          {{
            __('PDF, photo or XML invoice, up to {0} MB.', [boot?.max_mb || 10])
          }}
        </p>
      </div>
      <FormControl
        v-model="form.note"
        type="textarea"
        :label="__('Note (optional)')"
        :placeholder="
          __('Anything the reader should know, e.g. «only the first page»')
        "
        :disabled="busy"
        :maxlength="500"
      />
      <p v-if="busy" role="status" class="text-sm text-ink-gray-7">
        {{ __('Uploading…') }}
      </p>
      <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
        {{ problem }}
      </p>
      <template #actions>
        <Button
          class="min-h-11 sm:min-h-8"
          :label="__('Cancel')"
          :disabled="busy"
          @click="sheetOpen = false"
        />
        <Button
          variant="solid"
          class="min-h-11 sm:min-h-8"
          :label="__('Capture')"
          :loading="busy"
          :disabled="busy"
          @click="submit"
        />
      </template>
    </PowerSheet>
  </template>
</template>
<script setup>
import { computed, onMounted, reactive, ref, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, FeatherIcon, FormControl } from 'frappe-ui'
import PowerSheet from '@/components/power/PowerSheet.vue'
import { readBase64, uploadName } from '@/composables/useArchivos'
import {
  allowedTargets,
  capturaApi,
  capturaBoot,
  capturaMessage,
  capturaRoute,
  captureProblem,
  loadCapturaBoot,
  targetLabel,
} from '@/composables/useCaptura'

// «Capturar documento»: drop a paper, the books pipeline reads it and the
// worker reviews a draft (/compras|gastos/captura/:name). Hidden when this user may create
// none of the caller's targets (boot.targets, D9).
defineOptions({ inheritAttrs: false })
const props = defineProps({
  /** Doctypes this entry point offers, in preference order. */
  targets: { type: Array, required: true },
  supplier: { type: String, default: '' },
  invoice: { type: String, default: '' },
  label: { type: String, default: '' },
  variant: { type: String, default: 'subtle' },
  returnLabel: { type: String, default: '' },
  /** False: no button of its own; the caller opens it with v-model:open. */
  trigger: { type: Boolean, default: true },
})
const open = defineModel('open', { type: Boolean, default: false })
const route = useRoute()
const router = useRouter()
const fileId = useId()
const fileInput = ref(null)
const boot = capturaBoot
const busy = ref(false)
const problem = ref('')
const form = reactive({ target: '', company: '', note: '', file: null })

const allowed = computed(() => allowedTargets(boot.value, props.targets))
const companies = computed(() => boot.value?.companies || [])
const buttonLabel = computed(() => props.label || __('Capture document'))
// Uploading cannot be cancelled halfway: the sheet stays until it answers.
const sheetOpen = computed({
  get: () => open.value,
  set: (value) => {
    if (!value && busy.value) return
    open.value = value
  },
})

function reset() {
  form.target = allowed.value[0] || ''
  form.company = boot.value?.default_company || companies.value[0] || ''
  form.note = ''
  form.file = null
  problem.value = ''
  if (fileInput.value) fileInput.value.value = ''
}
watch(open, (value) => {
  if (value) reset()
})

function show() {
  open.value = true
}
function pickFile(event) {
  form.file = event.target.files?.[0] || null
  problem.value = form.file ? captureProblem(form.file, boot.value) : ''
}

async function submit() {
  if (busy.value) return
  problem.value = captureProblem(form.file, boot.value)
  if (!problem.value && !allowed.value.includes(form.target))
    problem.value = __('Choose what to create.')
  if (!problem.value && !form.company) problem.value = __('Choose a company.')
  if (problem.value) return
  busy.value = true
  try {
    const content = await readBase64(form.file)
    const data = await capturaApi('capture', {
      target_doctype: form.target,
      company: form.company,
      file_name: uploadName(form.file),
      content_b64: content,
      note: form.note.trim(),
      supplier: props.supplier || '',
      invoice: props.invoice || '',
    })
    busy.value = false
    open.value = false
    await router.push(
      capturaRoute(data.name, {
        doctype: data.doc_type || form.target,
        returnTo: '/crm' + route.fullPath,
        returnLabel:
          props.returnLabel || (route.meta?.title ? __(route.meta.title) : ''),
        duplicate: Boolean(data.duplicate),
      }),
    )
  } catch (error) {
    problem.value = capturaMessage(error)
  } finally {
    busy.value = false
  }
}

onMounted(() => loadCapturaBoot())
defineExpose({ show, allowed })
</script>
