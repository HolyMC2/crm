<template>
  <!-- «Palabras que significan lo mismo» (doco workspaces.palabras): the shop's
       word list, one list every product search reads (POS, Mercado,
       Productos, Ctrl+K, the assistant, Escáner, Taller, the online store).
       Groups are chips; a word is added in place and removed with its ×; the
       screen's one search tries the list on screen before it is saved. -->
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col" data-palabras>
    <AppBar
      v-if="isPhone"
      v-model:search="query"
      v-model:search-open="searchOpen"
      back
      :back-label="__('Back')"
      :title="__('Words that mean the same', null, 'Palabras')"
      :bell="false"
      searchable
      :search-label="__('Try a search', null, 'Palabras')"
    />
    <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-3xl space-y-4 px-4 pb-28 pt-3 lg:px-6">
        <h1
          v-if="!isPhone"
          class="title-face text-2xl font-semibold text-ink-gray-9"
        >
          {{ __('Words that mean the same', null, 'Palabras') }}
        </h1>
        <input
          v-if="!isPhone"
          v-model="query"
          type="search"
          class="ui-focus h-11 w-full max-w-xl rounded-full border-0 bg-surface-gray-2 px-4 text-base text-ink-gray-9"
          :placeholder="__('Try a search', null, 'Palabras')"
          :aria-label="__('Try a search', null, 'Palabras')"
          data-palabras-probar
        />

        <p
          v-if="problem"
          role="alert"
          class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          {{ problem }}
          <Button
            v-if="!loaded"
            class="ml-2 min-h-11"
            :label="__('Retry')"
            @click="load"
          />
        </p>

        <!-- What the search finds with the list on screen -->
        <section
          v-if="tried"
          :aria-busy="trying"
          aria-live="polite"
          data-palabras-resultado
        >
          <p class="mb-2 flex flex-wrap gap-x-4 text-sm text-ink-gray-7">
            <span data-palabras-con
              ><span class="num font-semibold text-ink-gray-9">{{
                tried.con_lista
              }}</span>
              {{ __('with the list', null, 'Palabras') }}</span
            >
            <span data-palabras-sin
              ><span class="num font-semibold text-ink-gray-9">{{
                tried.sin_lista
              }}</span>
              {{ __('without it', null, 'Palabras') }}</span
            >
          </p>
          <ListGroup v-if="tried.rows.length" tag="ul">
            <li v-for="row in tried.rows" :key="row.name">
              <ListRow
                :to="{ name: 'Producto', params: { item: row.name } }"
                :title="row.title"
                :subtitle="row.item_group || ''"
              >
                <template #trailing>
                  <StatusChip
                    v-if="row.por_lista"
                    :label="__('By the list', null, 'Palabras')"
                    tone="info"
                    data-palabras-por-lista
                  />
                </template>
              </ListRow>
            </li>
          </ListGroup>
          <p v-else class="text-sm text-ink-gray-7">
            {{ __('No product answers «{0}».', [tried.q], 'Palabras') }}
          </p>
        </section>

        <div v-if="!loaded && !problem" role="status" class="space-y-3">
          <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
          <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
        </div>

        <template v-else-if="loaded">
          <p
            v-if="!canChange"
            class="flex items-start gap-2 rounded-7 bg-surface-gray-2 p-3 text-sm text-ink-gray-7"
            data-palabras-solo-dueno
          >
            <span
              class="lucide-lock mt-0.5 size-4 flex-none"
              aria-hidden="true"
            />
            {{ __('Only the owner changes these words.', null, 'Palabras') }}
          </p>

          <EmptyState
            v-if="!groups.length"
            :title="__('No words yet', null, 'Palabras')"
            :action="canChange ? __('New group', null, 'Palabras') : ''"
            @action="newGroup"
          />

          <ListGroup v-else tag="ul" data-palabras-grupos>
            <li
              v-for="(group, index) in groups"
              :key="keys[index]"
              class="px-4 py-2"
              :data-palabras-grupo="index"
            >
              <div class="flex flex-wrap items-center gap-x-2">
                <span
                  v-for="word in group"
                  :key="word"
                  :class="chipClass(false)"
                  class="!pr-1 after:hidden"
                  data-palabras-palabra
                >
                  {{ word }}
                  <button
                    v-if="canChange"
                    type="button"
                    class="press relative z-[1] flex size-6 items-center justify-center rounded-full text-ink-gray-6 after:absolute after:-inset-2.5 after:content-[''] hover:text-ink-gray-9"
                    :aria-label="__('Remove «{0}»', [word], 'Palabras')"
                    :title="__('Remove «{0}»', [word], 'Palabras')"
                    @click="remove(index, word)"
                  >
                    <span class="lucide-x size-3.5" aria-hidden="true" />
                  </button>
                </span>
                <input
                  v-if="canChange && adding === index"
                  :ref="(el) => (adder = el)"
                  v-model="draft"
                  type="text"
                  enterkeyhint="done"
                  class="ui-focus my-1.5 h-8 w-40 rounded-[var(--muelle-shape-chip)] border-0 bg-surface-gray-4 px-3 text-[14px] text-ink-gray-9"
                  :aria-label="__('New word', null, 'Palabras')"
                  :placeholder="__('Word', null, 'Palabras')"
                  data-palabras-nueva
                  @keydown.enter.prevent="commit(index, true)"
                  @keydown.esc.prevent="cancelAdding"
                  @input="splitOnComma(index)"
                  @blur="commit(index, false)"
                />
                <button
                  v-else-if="canChange"
                  type="button"
                  :class="chipClass(false)"
                  class="border-dashed"
                  :aria-label="__('Add a word', null, 'Palabras')"
                  data-palabras-agregar
                  @click="startAdding(index)"
                >
                  <span class="lucide-plus size-4" aria-hidden="true" />
                  {{ __('Word', null, 'Palabras') }}
                </button>
                <!-- The bin ends the last line of chips, at the right edge. -->
                <template v-if="canChange">
                  <Button
                    v-if="deleting === index"
                    variant="ghost"
                    class="ml-auto min-h-11 flex-none text-ink-red-7"
                    :label="__('Delete', null, 'Palabras')"
                    data-palabras-borrar-si
                    @click="dropGroup(index)"
                  />
                  <button
                    v-else
                    type="button"
                    class="press ml-auto flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:text-ink-gray-9"
                    :aria-label="__('Delete group', null, 'Palabras')"
                    :title="__('Delete group', null, 'Palabras')"
                    data-palabras-borrar
                    @click="deleting = index"
                  >
                    <span class="lucide-trash-2 size-4" aria-hidden="true" />
                  </button>
                </template>
              </div>
              <p
                v-if="lonely.includes(index) && adding !== index"
                class="pb-1 text-sm text-ink-red-7"
                data-palabras-falta
              >
                {{
                  __('Add another word that means the same.', null, 'Palabras')
                }}
              </p>
            </li>
          </ListGroup>

          <Button
            v-if="canChange && groups.length"
            class="min-h-11"
            :label="__('New group', null, 'Palabras')"
            data-palabras-nuevo
            @click="newGroup"
          >
            <template #prefix>
              <span class="lucide-plus size-4" aria-hidden="true" />
            </template>
          </Button>
        </template>
      </div>
    </div>
    <Fab
      v-if="canChange && dirty"
      :label="saving ? __('Saving…') : __('Save words', null, 'Palabras')"
      icon="lucide-check"
      dock="extended"
      :disabled="saving || lonely.length > 0"
      data-palabras-guardar
      @click="save"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { Button, call, toast } from 'frappe-ui'
import {
  AppBar,
  EmptyState,
  Fab,
  ListGroup,
  ListRow,
  StatusChip,
  chipClass,
} from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { errorText } from '@/utils/errorText'
import {
  lonelyGroups,
  sameGroups,
  splitWords,
  toSave,
  withWords,
  withoutGroup,
  withoutWord,
} from '@/components/productos/palabras'

const API = 'doco.workspaces.palabras.'
const saved = ref([])
const groups = ref([])
const keys = ref([])
const canChange = ref(false)
const loaded = ref(false)
const problem = ref('')
const saving = ref(false)
const adding = ref(-1)
const draft = ref('')
const deleting = ref(-1)
const query = ref('')
const searchOpen = ref(false)
const tried = ref(null)
const trying = ref(false)
const scroller = ref(null)
let adder = null
let nextKey = 0
let timer = null
let asked = 0

const dirty = computed(() => !sameGroups(groups.value, saved.value))
const lonely = computed(() => lonelyGroups(groups.value))

function show(answer) {
  saved.value = answer.groups || []
  groups.value = saved.value.map((group) => [...group])
  keys.value = groups.value.map(() => (nextKey += 1))
  canChange.value = Boolean(answer.can_change)
  loaded.value = true
}

async function load() {
  problem.value = ''
  try {
    show(await call(API + 'state'))
  } catch (error) {
    problem.value = errorText(error, __('Check your connection and try again.'))
  }
}

function startAdding(index) {
  deleting.value = -1
  adding.value = index
  draft.value = ''
  nextTick(() => adder?.focus())
}

function splitOnComma(index) {
  if (!/[,;]/.test(draft.value)) return
  const parts = draft.value.split(/[,;]/)
  const rest = parts.pop()
  groups.value = withWords(groups.value, index, parts.join(','))
  draft.value = rest.trimStart()
}

function commit(index, keepOpen) {
  if (adding.value !== index) return
  if (splitWords(draft.value).length)
    groups.value = withWords(groups.value, index, draft.value)
  draft.value = ''
  if (!keepOpen) {
    adding.value = -1
    if (!groups.value[index]?.length) dropGroup(index)
  }
}

function cancelAdding() {
  const index = adding.value
  draft.value = ''
  adding.value = -1
  if (index >= 0 && !groups.value[index]?.length) dropGroup(index)
}

function remove(index, word) {
  groups.value = withoutWord(groups.value, index, word)
  if (!groups.value[index].length) dropGroup(index)
}

function dropGroup(index) {
  groups.value = withoutGroup(groups.value, index)
  keys.value = keys.value.filter((_key, i) => i !== index)
  deleting.value = -1
  if (adding.value === index) adding.value = -1
  else if (adding.value > index) adding.value -= 1
}

function newGroup() {
  groups.value = [...groups.value, []]
  keys.value = [...keys.value, (nextKey += 1)]
  startAdding(groups.value.length - 1)
}

async function save() {
  if (saving.value || lonely.value.length) return
  saving.value = true
  try {
    show(
      await call(API + 'save', {
        groups: JSON.stringify(toSave(groups.value)),
      }),
    )
    toast.success(__('Words saved', null, 'Palabras'))
  } catch (error) {
    toast.error(errorText(error, __('Check your connection and try again.')))
  } finally {
    saving.value = false
  }
}

// «Probar»: the list on screen, unsaved, against the shop's products.
async function probar() {
  const text = query.value.trim()
  if (text.length < 2) {
    tried.value = null
    return
  }
  const ask = (asked += 1)
  trying.value = true
  try {
    // A group still waiting for its second word does not count yet.
    const ready = toSave(groups.value).filter((group) => group.length > 1)
    const answer = await call(API + 'probar', {
      q: text,
      groups: JSON.stringify(ready),
    })
    if (ask !== asked) return
    // The first answer shows from the top, wherever the list was scrolled.
    if (!tried.value) scroller.value?.scrollTo({ top: 0 })
    tried.value = answer
  } catch (error) {
    if (ask === asked) problem.value = errorText(error)
  } finally {
    if (ask === asked) trying.value = false
  }
}

watch(
  () => [query.value, JSON.stringify(toSave(groups.value))],
  () => {
    clearTimeout(timer)
    timer = setTimeout(probar, 250)
  },
)
watch(adding, (index) => {
  if (index < 0) adder = null
})

onMounted(load)
onBeforeUnmount(() => clearTimeout(timer))
onBeforeRouteLeave(() => {
  if (!dirty.value || !canChange.value) return true
  return window.confirm(
    __('You have unsaved words. Leave without saving them?', null, 'Palabras'),
  )
})
</script>
