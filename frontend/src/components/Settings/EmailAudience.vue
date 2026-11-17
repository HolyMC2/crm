<!--
  Who reads a mailbox (crm.api.correo_buzones): «Only me» keeps a personal mailbox to its owner
  (crm.permissions.correo); «My team» shares it with the people chosen here. Every change saves
  at once: there is nothing to lose by leaving the page.
-->
<template>
  <section class="flex flex-col gap-2" data-testid="email-audience">
    <div class="text-p-base-medium text-ink-gray-7">
      {{ __('Who reads it') }}
    </div>
    <div v-if="audience.data" class="flex flex-col gap-2">
      <div
        role="radiogroup"
        :aria-label="__('Who reads it')"
        class="flex gap-2"
      >
        <button
          v-for="choice in choices"
          :key="choice.value"
          type="button"
          role="radio"
          :aria-checked="scope === choice.value"
          :disabled="!canEdit || saving"
          class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-7 px-3 text-sm ring-1 transition-colors disabled:opacity-60"
          :class="
            scope === choice.value
              ? 'bg-surface-gray-2 text-ink-gray-9 ring-outline-gray-4'
              : 'text-ink-gray-7 ring-outline-gray-2 hover:bg-surface-gray-1'
          "
          :data-testid="`email-audience-${choice.value.toLowerCase()}`"
          @click="choose(choice.value)"
        >
          <span :class="[choice.icon, 'size-4']" aria-hidden="true" />
          {{ choice.label }}
        </button>
      </div>
      <p class="text-p-sm text-ink-gray-5">{{ hint }}</p>
      <div
        v-if="scope === 'Shared'"
        class="rounded-7 ring-1 ring-outline-gray-2"
        :class="{ 'pointer-events-none opacity-60': !canEdit }"
      >
        <UserMultiSelect
          :model-value="readers"
          :candidates="candidates"
          :loading="users.loading"
          :show-mail="true"
          @update:model-value="setReaders"
        />
      </div>
    </div>
    <ErrorMessage v-if="error" :message="error" />
  </section>
</template>

<script setup>
import UserMultiSelect from '@/components/Settings/Hierarchy/UserMultiSelect.vue'
import { usersStore } from '@/stores/users'
import { ErrorMessage, call, createResource, toast } from 'frappe-ui'
import { computed, ref } from 'vue'

const props = defineProps({
  account: { type: String, required: true },
})

const { users } = usersStore()
const audience = createResource({
  url: 'crm.api.correo_buzones.audience',
  params: { account: props.account },
  auto: true,
})
const saving = ref(false)
const error = ref('')

const choices = [
  { value: 'Personal', label: __('Only me'), icon: 'lucide-lock' },
  { value: 'Shared', label: __('My team'), icon: 'lucide-users' },
]
const scope = computed(() => audience.data?.scope || 'Shared')
const canEdit = computed(() => Boolean(audience.data?.can_edit))
const readers = computed(() =>
  (audience.data?.readers || []).map((person) => person.user),
)
const candidates = computed(() =>
  (users.data?.crmUsers || [])
    .filter((user) => user.name !== 'Administrator')
    .map((user) => ({
      value: user.name,
      full_name: user.full_name || user.name,
      email: user.email || user.name,
      user_image: user.user_image,
    })),
)
const hint = computed(() => {
  if (!canEdit.value)
    return scope.value === 'Personal'
      ? __('Only its owner can change a personal mailbox.')
      : __('Ask an administrator to change who reads this mailbox.')
  return scope.value === 'Personal'
    ? __(
        'Only you read it. It never links itself to contacts, leads or deals, and the shop never sends from it.',
      )
    : __(
        'The people you choose read it. Administrators also read every shared mailbox.',
      )
})

async function save(next, people) {
  saving.value = true
  error.value = ''
  try {
    audience.data = await call('crm.api.correo_buzones.save_audience', {
      account: props.account,
      scope: next,
      readers: people,
    })
    toast.success(__('Saved'))
  } catch (err) {
    error.value = err?.messages?.[0] || __('Could not save. Try again.')
  } finally {
    saving.value = false
  }
}

function choose(next) {
  if (next === scope.value) return
  save(next, next === 'Shared' ? readers.value : [])
}

function setReaders(people) {
  save('Shared', people)
}
</script>
