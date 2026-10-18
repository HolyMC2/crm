<template>
  <!-- Who receives a recipe: M3 list items (56px), a trailing checkbox for
       the team and the seller, people as avatar rows with «Quitar». -->
  <BottomSheet
    v-model:open="open"
    title="Quién recibe"
    :subtitle="recipe.title"
    :dismissible="!saving"
    flush
  >
    <div class="pb-2">
      <section v-if="recipe.default_roles?.length || recipe.seller_label">
        <h3 class="px-4 pb-1 pt-2 text-sm font-medium text-ink-gray-7">
          Equipos
        </h3>
        <ul>
          <li v-if="recipe.default_roles?.length">
            <ListRow
              role="checkbox"
              :aria-checked="useGroups ? 'true' : 'false'"
              :title="groupsLabel"
              subtitle="Todo el equipo, también quien entre después"
              data-recipient="groups"
              @click="useGroups = !useGroups"
            >
              <template #trailing>
                <CheckMark :on="useGroups" />
              </template>
            </ListRow>
          </li>
          <li v-if="recipe.seller_label">
            <ListRow
              role="checkbox"
              :aria-checked="seller ? 'true' : 'false'"
              :title="`${recipe.seller_label} del documento`"
              subtitle="Solo a quien le toca ese documento"
              data-recipient="seller"
              @click="seller = !seller"
            >
              <template #trailing>
                <CheckMark :on="seller" />
              </template>
            </ListRow>
          </li>
        </ul>
      </section>

      <section>
        <h3 class="px-4 pb-1 pt-3 text-sm font-medium text-ink-gray-7">
          Personas
        </h3>
        <ul v-if="people.length">
          <li v-for="person in people" :key="person.user">
            <ListRow
              :avatar="person.name || person.user"
              :title="person.name || person.user"
            >
              <template #trailing>
                <Button
                  variant="ghost"
                  class="min-h-11"
                  label="Quitar"
                  :aria-label="`Quitar a ${person.name || person.user}`"
                  @click="people = people.filter((p) => p.user !== person.user)"
                />
              </template>
            </ListRow>
          </li>
        </ul>
        <div class="px-4 pt-1">
          <FormControl
            v-model="search"
            type="text"
            placeholder="Buscar a alguien del equipo"
            class="[&_input]:min-h-12"
            aria-label="Buscar a alguien del equipo"
          />
        </div>
        <ul v-if="matches.length" class="pt-1">
          <li v-for="person in matches" :key="person.user">
            <ListRow
              :avatar="person.name || person.user"
              :title="person.name || person.user"
              subtitle="Agregar"
              @click="add(person)"
            />
          </li>
        </ul>
      </section>
      <p v-if="error" role="alert" class="px-4 pt-2 text-sm text-ink-red-4">
        {{ error }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-12 w-full"
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
import { BottomSheet, ListRow } from '@/components/ui'
import CheckMark from './CheckMark.vue'
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
