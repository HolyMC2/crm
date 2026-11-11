<template>
  <BottomSheet
    :open="open"
    :title="__('Your name', null, 'Perfil')"
    :dismissible="!dirty && !saving"
    @update:open="(value) => !value && cancel()"
  >
    <form
      id="perfil-nombre"
      class="space-y-3 pb-2"
      data-testid="perfil-nombre"
      @submit.prevent="save"
    >
      <label class="block">
        <span class="text-sm text-ink-gray-7">{{
          __('First name', null, 'Perfil')
        }}</span>
        <input
          v-model="first"
          class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
          autocomplete="given-name"
          required
        />
      </label>
      <label class="block">
        <span class="text-sm text-ink-gray-7">{{
          __('Last name', null, 'Perfil')
        }}</span>
        <input
          v-model="last"
          class="mt-1 h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
          autocomplete="family-name"
        />
      </label>
      <p v-if="problem" class="text-sm text-ink-red-7" role="alert">
        {{ problem }}
      </p>
      <p v-else-if="!first.trim()" class="text-sm text-ink-gray-6">
        {{ __('Your first name is how the team sees you.', null, 'Perfil') }}
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
        form="perfil-nombre"
        class="min-h-11 w-full"
        :label="__('Save name', null, 'Perfil')"
        :loading="saving"
        :disabled="!first.trim() || !dirty"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { errorText } from '@/utils/errorText'

const props = defineProps({
  open: { type: Boolean, default: false },
  doc: { type: Object, default: null },
  /** (values) => Promise: writes first_name and last_name. */
  submit: { type: Function, required: true },
})
const emit = defineEmits(['close', 'saved'])

const first = ref('')
const last = ref('')
const saving = ref(false)
const problem = ref('')
watch(
  () => props.open,
  (open) => {
    if (!open) return
    first.value = props.doc?.first_name || ''
    last.value = props.doc?.last_name || ''
    problem.value = ''
  },
  { immediate: true },
)
const dirty = computed(
  () =>
    first.value.trim() !== (props.doc?.first_name || '') ||
    last.value.trim() !== (props.doc?.last_name || ''),
)
function cancel() {
  if (saving.value) return
  emit('close')
}
async function save() {
  if (!first.value.trim() || !dirty.value || saving.value) return
  saving.value = true
  problem.value = ''
  try {
    await props.submit({
      first_name: first.value.trim(),
      last_name: last.value.trim(),
    })
    emit('saved')
  } catch (error) {
    problem.value = errorText(
      error,
      __('Your name was not saved. Try again.', null, 'Perfil'),
    )
  } finally {
    saving.value = false
  }
}
</script>
