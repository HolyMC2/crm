<template>
  <BottomSheet
    :open="open"
    :title="__('Change password', null, 'Perfil')"
    :dismissible="!dirty && !saving"
    @update:open="(value) => !value && cancel()"
  >
    <form
      id="perfil-password"
      class="space-y-3 pb-2"
      data-testid="perfil-password"
      @submit.prevent="save"
    >
      <label v-for="field in FIELDS" :key="field.key" class="block">
        <span class="text-sm text-ink-gray-7">{{ field.label }}</span>
        <input
          v-model="values[field.key]"
          type="password"
          class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
          :autocomplete="field.autocomplete"
        />
      </label>
      <p
        v-if="problem"
        class="text-sm text-ink-red-7"
        role="alert"
        data-testid="perfil-password-problem"
      >
        {{ problem }}
      </p>
      <p
        v-else-if="hint"
        class="text-sm text-ink-gray-6"
        role="status"
        data-testid="perfil-password-hint"
      >
        {{ hint }}
      </p>
    </form>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="__('Cancel', null, 'Perfil')"
        @click="cancel"
      />
      <Button
        variant="solid"
        type="submit"
        form="perfil-password"
        class="min-h-11 w-full"
        :label="__('Change password', null, 'Perfil')"
        :loading="saving"
        :disabled="Boolean(hint)"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { errorText } from '@/utils/errorText'
import { passwordProblem } from './perfil'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** (current, next) => Promise: crm.api.user.change_password. */
  submit: { type: Function, required: true },
})
const emit = defineEmits(['close', 'saved'])

const FIELDS = [
  {
    key: 'current',
    label: __('Current password', null, 'Perfil'),
    autocomplete: 'current-password',
  },
  {
    key: 'next',
    label: __('New password', null, 'Perfil'),
    autocomplete: 'new-password',
  },
  {
    key: 'confirm',
    label: __('New password again', null, 'Perfil'),
    autocomplete: 'new-password',
  },
]
const values = reactive({ current: '', next: '', confirm: '' })
const saving = ref(false)
const problem = ref('')
watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(values, { current: '', next: '', confirm: '' })
    problem.value = ''
  },
)
const dirty = computed(() =>
  Boolean(values.current || values.next || values.confirm),
)
// The button says nothing is missing only when the rules pass.
const hint = computed(() =>
  passwordProblem(values.current, values.next, values.confirm),
)
watch(values, () => (problem.value = ''))
function cancel() {
  if (saving.value) return
  emit('close')
}
async function save() {
  if (hint.value || saving.value) return
  saving.value = true
  try {
    await props.submit(values.current, values.next)
    emit('saved')
  } catch (error) {
    problem.value = errorText(
      error,
      __('The password did not change. Try again.', null, 'Perfil'),
    )
  } finally {
    saving.value = false
  }
}
</script>
