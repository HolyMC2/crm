<template>
  <Dialog v-model="open" :options="{ title: __('Who works this case') }">
    <template #body-content>
      <div class="space-y-4">
        <ul v-if="assignees.length" class="space-y-1">
          <li
            v-for="person in assignees"
            :key="person.user"
            class="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-surface-gray-1 px-3"
          >
            <span class="truncate text-sm">{{ person.full_name }}</span>
            <Button
              :label="__('Remove', null, 'Garantías')"
              :loading="busy === person.user"
              @click="remove(person.user)"
            />
          </li>
        </ul>
        <p v-else class="text-sm text-ink-gray-6">
          {{ __('Nobody is assigned yet.') }}
        </p>
        <ComprasPicker
          v-model="user"
          :label="__('Assign to', null, 'Garantías')"
          :placeholder="__('Search a person')"
          :empty-text="
            __('Nobody else can work this case. Ask your manager for access.')
          "
          :hint="
            __('Only people with access to Garantías in this company appear.')
          "
          :load="search"
          clear-on-pick
          @pick="(option) => add(option.value)"
        />
        <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
          <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        </p>
      </div>
    </template>
    <template #actions>
      <div class="flex justify-end">
        <Button :label="__('Done', null, 'Garantías')" @click="open = false" />
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import { ref, watch } from 'vue'
import { Button, Dialog } from 'frappe-ui'
import ComprasPicker from '@/components/compras/ComprasPicker.vue'
import { garantiasApi, problemOf } from '@/composables/useGarantias'

// Native assignment (assign_to): the person gets a ToDo and a notification;
// the server refuses anyone who could not open the case.
const props = defineProps({
  claim: { type: String, required: true },
  assignees: { type: Array, default: () => [] },
})
const emit = defineEmits(['changed'])
const open = defineModel({ type: Boolean, default: false })
const user = ref('')
const busy = ref('')
const problem = ref(null)

watch(open, (value) => {
  if (value) problem.value = null
})

async function search(text) {
  const rows = await garantiasApi('assignable_users', {
    name: props.claim,
    q: text || '',
  })
  return rows.map((row) => ({ value: row.user, label: row.full_name }))
}
async function change(method, target) {
  busy.value = target
  problem.value = null
  try {
    emit(
      'changed',
      await garantiasApi(method, { name: props.claim, user: target }),
    )
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    busy.value = ''
    user.value = ''
  }
}
const add = (target) => change('assign', target)
const remove = (target) => change('unassign', target)
</script>
