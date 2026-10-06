<template>
  <Dialog v-model="open" :options="{ title: __('Aviso preferences') }">
    <template #body-content>
      <p class="mb-4 text-sm text-ink-gray-7">
        {{
          __(
            'Choose what counts on the bell. «List only» keeps avisos here without the red count; «Hide» moves them to Muted.',
          )
        }}
      </p>
      <div class="space-y-3">
        <div
          v-for="cat in CATEGORIES"
          :key="cat"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="min-w-32 flex-1 text-base font-medium">{{
            categoryMeta(cat).label
          }}</span>
          <FormControl
            type="select"
            class="w-44"
            :aria-label="__('Preference for {0}', [categoryMeta(cat).label])"
            :model-value="draft[cat]"
            :options="options(cat)"
            @update:model-value="(value) => (draft[cat] = value)"
          />
        </div>
      </div>
      <p class="mt-3 text-sm text-ink-gray-6">
        {{
          __(
            'Mentions and assignments always stay in your list. Email delivery is set in your Desk notification settings.',
          )
        }}
      </p>
      <p v-if="error" role="alert" class="mt-3 text-sm text-ink-red-4">
        {{ error }}
      </p>
    </template>
    <template #actions>
      <div class="flex justify-end gap-2">
        <Button :label="__('Cancel')" @click="open = false" />
        <Button
          variant="solid"
          :label="__('Save')"
          :loading="saving"
          @click="save"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { reactive, ref, watch } from 'vue'
import {
  CATEGORIES,
  MODES,
  categoryMeta,
  errorText,
  modeLabel,
  savePreferences,
} from '@/composables/useAvisos'

const open = defineModel('open', { type: Boolean, default: false })
const props = defineProps({ prefs: { type: Object, default: null } })
const emit = defineEmits(['saved'])
const draft = reactive({})
const saving = ref(false)
const error = ref('')

function options(cat) {
  return MODES.filter((mode) => cat !== 'direct' || mode !== 'off').map(
    (mode) => ({ label: modeLabel(mode), value: mode }),
  )
}

watch(open, (value) => {
  if (!value) return
  error.value = ''
  Object.assign(draft, props.prefs?.categories || {})
})

async function save() {
  saving.value = true
  error.value = ''
  try {
    emit('saved', await savePreferences({ ...draft }))
    open.value = false
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    saving.value = false
  }
}
</script>
