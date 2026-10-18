<template>
  <BottomSheet
    v-model:open="open"
    title="Quién recibe"
    :subtitle="recipe.title"
    :dismissible="!saving"
  >
    <div class="space-y-4 px-1 pb-2">
      <fieldset v-if="recipe.default_roles?.length" class="space-y-1">
        <legend class="pb-1 text-sm font-medium text-ink-gray-7">
          Equipos
        </legend>
        <label class="flex min-h-11 items-center gap-3 text-base">
          <input v-model="useGroups" type="checkbox" class="size-5" />
          <span>{{ groupsLabel }}</span>
        </label>
      </fieldset>
      <label
        v-if="recipe.seller_label"
        class="flex min-h-11 items-center gap-3 text-base"
      >
        <input v-model="seller" type="checkbox" class="size-5" />
        <span>{{ recipe.seller_label || 'Vendedor' }} del documento</span>
      </label>

      <fieldset class="space-y-1">
        <legend class="pb-1 text-sm font-medium text-ink-gray-7">
          Personas
        </legend>
        <ul v-if="people.length" class="space-y-1">
          <li
            v-for="person in people"
            :key="person.user"
            class="flex min-h-11 items-center gap-2"
          >
            <span class="min-w-0 flex-1 break-words text-base">{{
              person.name || person.user
            }}</span>
            <Button
              variant="ghost"
              class="min-h-11"
              label="Quitar"
              :aria-label="`Quitar a ${person.name || person.user}`"
              @click="people = people.filter((p) => p.user !== person.user)"
            />
          </li>
        </ul>
        <FormControl
          v-model="search"
          type="text"
          placeholder="Buscar a alguien del equipo"
          class="[&_input]:min-h-11"
          aria-label="Buscar a alguien del equipo"
        />
        <ul v-if="matches.length" class="space-y-1">
          <li v-for="person in matches" :key="person.user">
            <button
              type="button"
              class="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-base hover:bg-surface-gray-2"
              @click="add(person)"
            >
              <span
                class="lucide-user-plus size-4 flex-none"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1 break-words">{{
                person.name || person.user
              }}</span>
            </button>
          </li>
        </ul>
      </fieldset>
      <p v-if="error" role="alert" class="text-sm text-ink-red-4">
        {{ error }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        variant="solid"
        label="Guardar"
        :loading="saving"
        @click="save"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { Button, FormControl } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { errorText, personas } from '@/components/documentos/avisame'

const open = defineModel('open', { type: Boolean, default: false })
const props = defineProps({
  recipe: { type: Object, required: true },
  saving: Boolean,
})
const emit = defineEmits(['save'])

const useGroups = ref(true)
const seller = ref(false)
const people = ref([])
const search = ref('')
const found = ref([])
const error = ref('')

const groupsLabel = computed(() => {
  const groups = props.recipe.default_groups || []
  return groups.length ? groups.join(' y ') : 'Su equipo'
})
const matches = computed(() =>
  found.value.filter((p) => !people.value.some((q) => q.user === p.user)),
)

watch(
  () => [open.value, props.recipe],
  () => {
    if (!open.value) return
    useGroups.value = Boolean(props.recipe.roles?.length)
    seller.value = Boolean(props.recipe.seller)
    people.value = [...(props.recipe.people || [])]
    search.value = ''
    found.value = []
    error.value = ''
  },
  { immediate: true },
)

watchDebounced(
  search,
  async (text) => {
    if (!text || text.trim().length < 2) {
      found.value = []
      return
    }
    try {
      found.value = (await personas(text.trim())) || []
    } catch (failure) {
      error.value = errorText(failure, 'No se pudo buscar.')
    }
  },
  { debounce: 250 },
)

function add(person) {
  people.value = [...people.value, person]
  search.value = ''
  found.value = []
}

// The page saves and closes the sheet once the server accepted it.
function save() {
  emit('save', {
    people: people.value.map((p) => p.user),
    roles: useGroups.value ? props.recipe.default_roles || [] : [],
    seller: seller.value ? 1 : 0,
  })
}
</script>
