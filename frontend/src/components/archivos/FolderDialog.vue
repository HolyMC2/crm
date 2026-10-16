<template>
  <Dialog
    :model-value="open"
    :title="heading"
    size="md"
    @update:model-value="$emit('update:open', $event)"
  >
    <template #default>
      <div class="space-y-4">
        <FormControl
          v-if="mode !== 'visibility'"
          v-model="title"
          type="text"
          :label="__('Folder name')"
          :placeholder="__('Contracts, manuals, photos…')"
          class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
          @keydown.enter="submit"
        />
        <fieldset
          v-if="mode !== 'rename'"
          class="space-y-1 text-sm text-ink-gray-8"
        >
          <legend class="mb-1 text-sm font-medium text-ink-gray-8">
            {{ __('Who sees it') }}
          </legend>
          <label class="flex min-h-11 items-start gap-2 sm:min-h-0">
            <input
              v-model="visibility"
              class="mt-1"
              type="radio"
              value="Company"
            />
            <span>
              {{ __('Everyone in the company') }}
              <span class="block text-xs text-ink-gray-5">{{
                __('Anyone who works here can open what is inside.')
              }}</span>
            </span>
          </label>
          <label class="flex min-h-11 items-start gap-2 sm:min-h-0">
            <input
              v-model="visibility"
              class="mt-1"
              type="radio"
              value="Private"
            />
            <span>
              {{ __('Only me') }}
              <span class="block text-xs text-ink-gray-5">{{
                __('Nobody else sees this folder or what is in it.')
              }}</span>
            </span>
          </label>
          <label class="flex min-h-11 items-start gap-2 sm:min-h-0">
            <input
              v-model="visibility"
              class="mt-1"
              type="radio"
              value="Roles"
            />
            <span>
              {{ __('Certain jobs') }}
              <span class="block text-xs text-ink-gray-5">{{
                __('Only the jobs you name below.')
              }}</span>
            </span>
          </label>
          <div v-if="visibility === 'Roles'" class="mt-2 space-y-1">
            <p class="text-sm font-medium text-ink-gray-8">
              {{ __('Jobs that can see it') }}
            </p>
            <p v-if="!roleOptions.length" class="text-xs text-ink-gray-5">
              {{ __('Loading jobs…') }}
            </p>
            <div
              v-else
              class="max-h-48 space-y-1 overflow-y-auto rounded border border-outline-gray-2 p-2"
            >
              <label
                v-for="role in roleOptions"
                :key="role"
                class="flex min-h-11 items-center gap-2 sm:min-h-0"
              >
                <input v-model="chosenRoles" type="checkbox" :value="role" />
                <span>{{ __(role) }}</span>
              </label>
            </div>
          </div>
        </fieldset>
        <p v-if="errorText" role="alert" class="text-sm text-ink-red-7">
          {{ errorText }}
        </p>
      </div>
    </template>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button :label="__('Cancel')" @click="$emit('update:open', false)" />
        <Button
          variant="solid"
          :label="mode === 'create' ? __('Create folder') : __('Save')"
          :loading="busy"
          :disabled="mode !== 'visibility' && !title.trim()"
          @click="submit"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, Dialog, FormControl } from 'frappe-ui'
import { archivosApi } from '@/composables/useArchivos'

// Create a folder, rename one, or say who sees it. The server validates the
// job names and answers with its own sentence when one does not exist.
const props = defineProps({
  open: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  folder: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  errorText: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'submit'])

const title = ref(''),
  visibility = ref('Company'),
  chosenRoles = ref([]),
  roleOptions = ref([])
async function loadRoles() {
  if (roleOptions.value.length) return
  try {
    roleOptions.value = await archivosApi(
      'doco.docoutils.documents.browse.roles',
    )
  } catch {
    roleOptions.value = [...chosenRoles.value]
  }
}
watch(visibility, (value) => value === 'Roles' && props.open && loadRoles())
const heading = computed(() => {
  if (props.mode === 'rename') return __('Rename folder')
  if (props.mode === 'visibility') return __('Who sees this folder')
  return __('New folder')
})
watch(
  () => [props.open, props.mode, props.folder?.name],
  () => {
    if (!props.open) return
    title.value = props.mode === 'rename' ? props.folder?.title || '' : ''
    visibility.value = props.folder?.visibility || 'Company'
    chosenRoles.value = [...(props.folder?.roles || [])]
    if (visibility.value === 'Roles') loadRoles()
  },
  { immediate: true },
)
function submit() {
  const roles = [...chosenRoles.value]
  emit('submit', {
    mode: props.mode,
    title: title.value.trim(),
    visibility: visibility.value,
    roles,
  })
}
</script>
