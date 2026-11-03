<template>
  <div class="flex flex-col gap-6">
    <section :aria-labelledby="`${id}-auto`" class="flex flex-col gap-2">
      <h3 :id="`${id}-auto`" class="title-face text-lg font-semibold">
        {{ __('Automatic assignment') }}
      </h3>
      <SettingSwitch
        v-model="doc.auto_assign_enabled"
        :label="__('Assign new customer conversations automatically')"
        :description="
          __(
            'Each unassigned conversation goes to the available person with the fewest open conversations. People turn their availability on and off from the inbox.',
          )
        "
      />
      <FormControl
        v-if="doc.auto_assign_enabled"
        v-model.number="doc.auto_assign_max_open"
        class="w-60"
        type="number"
        :min="0"
        :label="__('Most open conversations per person')"
        :description="__('0 means no limit.')"
      />
    </section>

    <section :aria-labelledby="`${id}-people`" class="flex flex-col gap-2">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 :id="`${id}-people`" class="title-face text-lg font-semibold">
          {{ __('Who receives conversations') }}
        </h3>
        <span v-if="people.length" class="num text-p-sm text-ink-gray-6">{{
          __('{0} of {1} available', [available, people.length])
        }}</span>
      </div>
      <p class="text-p-sm text-ink-gray-5">
        {{
          doc.auto_assign_enabled
            ? __(
                'Only people on this list receive new conversations, and only while they are available.',
              )
            : __(
                'Turn on automatic assignment above to hand out new conversations to this list.',
              )
        }}
      </p>
      <p v-if="error" role="alert" class="text-p-sm text-ink-red-7">
        {{ error }}
      </p>
      <p v-if="loading && !people.length" class="text-p-sm text-ink-gray-5">
        {{ __('Loading…') }}
      </p>
      <ul v-else-if="people.length" class="divide-y divide-outline-gray-1">
        <li
          v-for="person in people"
          :key="person.user"
          class="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
        >
          <div class="min-w-0 flex-1 basis-40">
            <p class="truncate text-p-base-medium text-ink-gray-8">
              {{ person.full_name }}
            </p>
            <p class="num text-p-sm text-ink-gray-5">
              {{ __('{0} open', [person.open]) }}
            </p>
          </div>
          <select
            :value="person.department"
            class="h-8 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
            :aria-label="`${person.full_name}: ${__('Only this team')}`"
            :disabled="busy === person.user"
            @change="
              (event) => save(person, { department: event.target.value })
            "
          >
            <option v-for="team in TEAMS" :key="team.value" :value="team.value">
              {{ team.label }}
            </option>
          </select>
          <label class="flex items-center gap-1 text-p-sm text-ink-gray-7">
            {{ __('Limit') }}
            <input
              :value="person.max_open"
              type="number"
              min="0"
              class="num h-8 w-16 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
              :title="__('0 uses the inbox limit.')"
              :disabled="busy === person.user"
              @change="
                (event) =>
                  save(person, {
                    max_open: Math.max(0, Number(event.target.value) || 0),
                  })
              "
            />
          </label>
          <AjustesSwitch
            :model-value="person.receives_new"
            :label="`${person.full_name}: ${__('Receives new conversations')}`"
            :disabled="busy === person.user"
            @update:model-value="
              (value) => save(person, { receives_new: value })
            "
          />
          <button
            type="button"
            class="press flex h-8 items-center justify-center rounded-4 px-2 text-sm"
            :class="
              confirming === person.user
                ? 'bg-surface-red-2 text-ink-red-7'
                : 'text-ink-gray-6 hover:bg-surface-gray-2'
            "
            :aria-label="
              confirming === person.user
                ? __('Remove {0}', [person.full_name])
                : __('Remove from the list')
            "
            :title="__('Remove from the list')"
            :disabled="busy === person.user"
            @click="remove(person)"
          >
            <span v-if="confirming === person.user">{{ __('Remove') }}</span>
            <span v-else class="lucide-trash-2 size-4" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <p v-else class="text-p-sm text-ink-gray-6">
        {{
          __(
            'Nobody is on the list yet. Add the people who answer customers; they can also add themselves from the inbox.',
          )
        }}
      </p>
      <form
        class="flex flex-wrap items-end gap-2 pt-1"
        @submit.prevent="addPerson"
      >
        <Link
          v-model="newUser"
          class="min-w-0 flex-1 basis-56"
          doctype="User"
          :filters="{ enabled: 1, user_type: 'System User' }"
          :label="__('Add a person')"
          :placeholder="__('Search people')"
        />
        <Button
          type="submit"
          class="press"
          variant="subtle"
          :label="__('Add')"
          :disabled="!newUser || !!busy"
        />
      </form>
    </section>
  </div>
</template>
<script setup>
import { onMounted, ref, computed, useId } from 'vue'
import { Button, FormControl, call, toast } from 'frappe-ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import Link from '@/components/Controls/Link.vue'
import SettingSwitch from './SettingSwitch.vue'

const doc = defineModel('doc', { type: Object, required: true })
const API = 'crm.api.inbox.'
const TEAMS = [
  { value: '', label: __('Every team') },
  { value: 'marketing', label: __('Marketing') },
  { value: 'sales', label: __('Sales') },
  { value: 'support', label: __('Support') },
  { value: 'finance', label: __('Finance') },
  { value: 'warehouse', label: __('Warehouse') },
  { value: 'technicians', label: __('Technicians') },
]
const id = useId()
const people = ref([]),
  loading = ref(false),
  busy = ref(''),
  error = ref(''),
  confirming = ref(''),
  newUser = ref('')
const available = computed(
  () => people.value.filter((p) => p.receives_new).length,
)
const message = (e, fallback) =>
  e?.messages?.length ? String(e.messages[0]).replace(/<[^>]+>/g, '') : fallback

async function load() {
  loading.value = true
  try {
    people.value = (await call(API + 'list_agents')) || []
    error.value = ''
  } catch (e) {
    error.value = message(
      e,
      __('The list could not be loaded. Close and open this page again.'),
    )
  } finally {
    loading.value = false
  }
}
onMounted(load)

async function run(user, method, args, done) {
  busy.value = user
  error.value = ''
  try {
    people.value = (await call(API + method, args)) || []
    if (done) toast.success(done)
    return true
  } catch (e) {
    error.value = message(
      e,
      __('The change was not saved. Check your connection and try again.'),
    )
    return false
  } finally {
    busy.value = ''
  }
}
function save(person, change) {
  const next = { ...person, ...change }
  return run(person.user, 'save_agent', {
    user: person.user,
    receives_new: next.receives_new ? 1 : 0,
    department: next.department || '',
    max_open: next.max_open || 0,
  })
}
function remove(person) {
  if (confirming.value !== person.user) {
    confirming.value = person.user
    return
  }
  confirming.value = ''
  run(
    person.user,
    'remove_agent',
    { user: person.user },
    __('{0} no longer receives conversations.', [person.full_name]),
  )
}
async function addPerson() {
  const user = newUser.value
  if (!user) return
  if (people.value.some((p) => p.user === user)) {
    error.value = __('This person is already on the list.')
    return
  }
  const ok = await run(user, 'save_agent', {
    user,
    receives_new: 1,
    department: '',
    max_open: 0,
  })
  if (ok) newUser.value = ''
}
</script>
