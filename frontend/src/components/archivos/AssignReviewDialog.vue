<template>
  <Dialog v-model="open" :options="{ title: __('Assign review') }">
    <template #body-content>
      <p class="mb-3 text-sm text-ink-gray-7">
        {{
          __(
            'The person you choose can classify, link or file this document until the review is done. You keep it as its receiver.',
          )
        }}
      </p>
      <label
        v-if="doc.visibility === 'Private'"
        class="mb-3 flex min-h-11 items-start gap-2 text-sm text-ink-gray-8"
      >
        <input v-model="share" type="checkbox" class="mt-1" />
        <span>{{
          __('Share with {0} so someone else can review it', [doc.company])
        }}</span>
      </label>
      <FormControl
        v-model="query"
        type="text"
        :placeholder="__('Search a person')"
        :aria-label="__('Search a person')"
        autocomplete="off"
      />
      <ul
        class="mt-2 max-h-64 overflow-y-auto"
        role="listbox"
        :aria-label="__('People')"
      >
        <li v-for="person in people" :key="person.user">
          <button
            type="button"
            role="option"
            :aria-selected="chosen === person.user"
            class="flex min-h-11 w-full items-center rounded px-3 text-left text-base hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline-gray-4"
            :class="
              chosen === person.user ? 'bg-surface-gray-2 font-medium' : ''
            "
            @click="chosen = person.user"
          >
            {{ person.label }}
          </button>
        </li>
        <li
          v-if="!loading && !people.length"
          class="px-3 py-2 text-sm text-ink-gray-6"
        >
          {{
            __(
              'Nobody with access to {0} matches. Ask your manager to give them access.',
              [doc.company],
            )
          }}
        </li>
      </ul>
      <ArchivoGuard
        v-if="failure"
        class="mt-3"
        :state="failure"
        @action="onAction"
      />
    </template>
    <template #actions>
      <div class="flex flex-wrap justify-end gap-2">
        <Button :label="__('Cancel')" @click="open = false" />
        <Button
          variant="solid"
          :label="__('Assign review')"
          :disabled="!chosen || (doc.visibility === 'Private' && !share)"
          :loading="saving"
          @click="assign"
        />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Button, Dialog, FormControl } from 'frappe-ui'
import ArchivoGuard from './ArchivoGuard.vue'
import { archivosApi, problem } from '@/composables/useArchivos'

const props = defineProps({ doc: { type: Object, required: true } })
const open = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['assigned'])
const query = ref(''),
  people = ref([]),
  chosen = ref(''),
  share = ref(false),
  loading = ref(false),
  saving = ref(false),
  failure = ref(null)
async function search() {
  loading.value = true
  try {
    people.value = await archivosApi('reviewers', {
      name: props.doc.name,
      query: query.value,
    })
  } catch (error) {
    failure.value = problem(error)
  } finally {
    loading.value = false
  }
}
const debounced = useDebounceFn(search, 200)
watch(query, debounced)
watch(open, (value) => {
  if (!value) return
  failure.value = null
  chosen.value = ''
  share.value = false
  search()
})
function onAction(action) {
  if (action.kind === 'share_and_assign') {
    share.value = true
    assign()
  } else if (action.kind === 'retry') {
    failure.value = null
    search()
  }
}
async function assign() {
  saving.value = true
  failure.value = null
  try {
    const detail = await archivosApi('assign_review', {
      name: props.doc.name,
      user: chosen.value,
      share: share.value ? 1 : 0,
    })
    open.value = false
    emit('assigned', detail)
  } catch (error) {
    failure.value = problem(error)
  } finally {
    saving.value = false
  }
}
</script>
