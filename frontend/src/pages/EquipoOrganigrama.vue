<template>
  <!-- Equipo › Organigrama: who reports to whom (ERPNext's Employee
       «Reporta a», the tree HRMS approvals read too) and what each person
       can do. One tap on a person opens their card; the pencil there, or a
       drag with a mouse, changes whom they report to, shown at once with
       «Deshacer». «¿Quién puede…?» lights up who can do one thing. -->
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-org-scroller
  >
    <div
      class="mx-auto w-full px-4 pb-28 pt-4 sm:px-6 sm:pb-10"
      :class="isWide ? 'max-w-6xl' : 'max-w-3xl'"
    >
      <!-- On a phone the shell's app bar has the back arrow (meta.listParent). -->
      <nav v-if="!isPhone" class="mb-3">
        <button
          type="button"
          class="press flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="router.push('/equipo')"
        >
          <span class="lucide-arrow-left size-4" aria-hidden="true" />
          {{ __('Back to Equipo') }}
        </button>
      </nav>
      <h1
        class="title-face text-2xl font-semibold text-ink-gray-9 [text-wrap:balance]"
      >
        {{ __('Organization chart') }}
      </h1>
      <p class="text-sm text-ink-gray-6" data-testid="org-summary">
        {{ summary }}
      </p>

      <section
        v-if="guard"
        role="status"
        class="mt-4 space-y-3 border-y border-outline-gray-1 py-3"
        data-testid="org-guard"
      >
        <p class="text-base text-ink-gray-8">{{ guard.message }}</p>
        <button
          type="button"
          :class="BTN.tonal"
          class="press"
          @click="router.push('/equipo')"
        >
          {{ __('Open Equipo') }}
        </button>
      </section>
      <section
        v-else-if="failure && !answer"
        role="alert"
        class="mt-4 space-y-3"
      >
        <p class="text-base text-ink-gray-8">{{ failure }}</p>
        <button type="button" :class="BTN.tonal" class="press" @click="load">
          {{ __('Retry', null, 'Equipo') }}
        </button>
      </section>
      <p
        v-else-if="!answer"
        role="status"
        class="py-10 text-sm text-ink-gray-6"
      >
        {{ __('Loading the organization chart…') }}
      </p>

      <template v-else>
        <!-- The phone: one search pill; the lens waits in its panel. -->
        <div v-if="isPhone" class="sticky top-0 z-20 -mx-4 mt-2">
          <SearchPanel
            v-model:open="searchOpen"
            :query="query"
            :placeholder="__('Search a person or puesto')"
            :label="__('Search the organization chart')"
            @update:query="(value) => (query = value)"
          >
            <!-- The lens is a door beside the pill, so a phone finds it
                 without knowing the panel. -->
            <template #trailing>
              <button
                type="button"
                :class="chipClass(Boolean(lensCap))"
                class="ml-1"
                data-testid="org-lens-door"
                @click="searchOpen = true"
              >
                {{ __('Who can…?') }}
              </button>
            </template>
            <template v-if="lensCap" #active>
              <button
                type="button"
                :class="chipClass(true)"
                :aria-label="__('Remove filter {0}', [lensCap.label])"
                data-testid="org-lens-active"
                @click="setLens('')"
              >
                {{ lensCap.label }}
                <span class="lucide-x size-3 flex-none" aria-hidden="true" />
              </button>
            </template>
            <ChipGroup
              :label="__('Who can…?')"
              :options="lensOptions"
              :model-value="lens"
              clear-value=""
              :max="16"
              testid="org-lens"
              @update:model-value="setLens"
            />
          </SearchPanel>
        </div>
        <div v-else class="mt-4 space-y-3">
          <label
            class="flex min-h-11 max-w-sm items-center gap-2 rounded-full bg-surface-gray-2 px-4 focus-within:ring-1 focus-within:ring-outline-gray-3"
          >
            <span
              class="lucide-search size-4 flex-none text-ink-gray-5"
              aria-hidden="true"
            />
            <input
              v-model="query"
              type="search"
              enterkeyhint="search"
              class="w-full border-0 bg-transparent p-0 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:outline-none focus:ring-0"
              :placeholder="__('Search a person or puesto')"
              :aria-label="__('Search the organization chart')"
              data-testid="org-search"
            />
          </label>
          <ChipGroup
            :label="__('Who can…?')"
            :options="lensOptions"
            :model-value="lens"
            clear-value=""
            :max="16"
            testid="org-lens"
            @update:model-value="setLens"
          />
        </div>
        <p
          v-if="lensCap"
          role="status"
          class="mt-3 text-sm text-ink-gray-7"
          data-testid="org-lens-line"
        >
          {{ lensLine }}
        </p>

        <section
          v-if="suggestion && !query"
          class="mt-4 flex flex-col items-start gap-2 border-y border-outline-gray-1 py-3 sm:flex-row sm:items-center sm:gap-4"
          data-testid="org-suggestion"
        >
          <p class="min-w-0 text-sm text-ink-gray-8 sm:flex-1">
            {{ suggestionText }}
          </p>
          <button
            type="button"
            :class="BTN.tonal"
            class="press"
            :disabled="busy"
            data-testid="org-suggestion-apply"
            @click="applySuggestion"
          >
            {{ suggestionAction }}
          </button>
        </section>

        <div class="mt-4" :class="isWide ? 'org-split' : ''">
          <div class="min-w-0">
            <div
              v-if="drag.source && drag.source.reports_to"
              class="mb-2 flex min-h-12 items-center justify-center rounded-8 border border-dashed border-outline-gray-3 text-sm text-ink-gray-7"
              :class="drag.over === TOP ? 'bg-surface-gray-2' : ''"
              data-testid="org-drop-top"
              @dragover.prevent="drag.hoverTop()"
              @dragleave="drag.leave({ employee: TOP })"
              @drop.prevent="drag.drop(null)"
            >
              {{ __('Drop here: they report to nobody') }}
            </div>
            <p v-if="dragLine" role="status" class="sr-only">
              {{ dragLine }}
            </p>
            <ul
              v-if="tree.roots.length"
              class="-ml-2"
              :aria-label="__('Organization chart')"
              data-testid="org-tree"
            >
              <OrgNode
                v-for="root in tree.roots"
                :key="root.employee"
                :node="root"
                :visible="visible"
                :lens="lensPeople"
                :selected="selected"
                :folded="folded"
                :drag="drag"
                :drag-on="dragOn"
                @select="select"
                @toggle="toggleFold"
              />
            </ul>
            <div
              v-if="!people.length"
              class="py-8 text-center"
              data-testid="org-empty"
            >
              <p class="text-base font-medium text-ink-gray-9">
                {{ __('Nobody on the chart yet') }}
              </p>
              <p class="mt-1 text-sm text-ink-gray-6">
                {{
                  __(
                    'Each person with an employee record shows here. Add your team in Equipo.',
                  )
                }}
              </p>
            </div>
            <p
              v-else-if="visible && !visible.size"
              class="py-6 text-sm text-ink-gray-6"
            >
              {{ __('Nobody matches «{0}».', [query]) }}
            </p>
            <section
              v-if="answer.without_record?.length"
              class="mt-6 flex flex-col items-start gap-1 border-t border-outline-gray-1 pt-3 sm:flex-row sm:items-center sm:gap-4"
              data-testid="org-without-record"
            >
              <p class="min-w-0 text-sm text-ink-gray-6 sm:flex-1">
                {{ withoutText }}
              </p>
              <button
                type="button"
                :class="BTN.text"
                class="press"
                @click="
                  router.push({ name: 'Equipo', query: { segment: 'todos' } })
                "
              >
                {{ __('Complete them in Equipo') }}
              </button>
            </section>
          </div>

          <!-- A desk: the person beside the tree, or who can do what. -->
          <aside
            v-if="isWide"
            class="sticky top-4 self-start border-l border-outline-gray-1 pl-8"
            data-testid="org-pane"
          >
            <template v-if="current">
              <button
                type="button"
                class="press float-right -mr-2 -mt-2 flex size-11 items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
                :aria-label="__('Close')"
                :title="__('Close')"
                data-testid="org-pane-close"
                @click="select('')"
              >
                <span class="lucide-x size-4" aria-hidden="true" />
              </button>
              <OrgPersona
                :person="current"
                :nodes="tree.nodes"
                :capabilities="answer.capabilities"
                :lens="lens"
                @select="select"
                @move="openMove"
                @lens="setLens"
              />
              <div class="mt-6 flex flex-wrap gap-2">
                <button
                  v-if="current.editable"
                  type="button"
                  :class="BTN.filled"
                  class="press"
                  @click="openMove(current.employee)"
                >
                  {{ __('Change whom they report to') }}
                </button>
                <button
                  type="button"
                  :class="BTN.tonal"
                  class="press"
                  @click="openFicha(current.employee)"
                >
                  {{ __('Open their page') }}
                </button>
              </div>
            </template>
            <template v-else>
              <h2 class="text-base font-semibold text-ink-gray-9">
                {{ __('Who can do what') }}
              </h2>
              <p class="mb-2 text-sm text-ink-gray-6">
                {{
                  dragOn
                    ? __(
                        'Tap a person to see their card. Drag a person onto another to change whom they report to.',
                      )
                    : __('Tap a person to see their card.')
                }}
              </p>
              <ul class="divide-y divide-outline-gray-1">
                <li v-for="cap in answer.capabilities" :key="cap.key">
                  <button
                    type="button"
                    class="press flex min-h-12 w-full items-start gap-3 py-2 text-left hover:bg-surface-gray-1"
                    :aria-pressed="String(lens === cap.key)"
                    :data-testid="`org-cap-${cap.key}`"
                    @click="setLens(lens === cap.key ? '' : cap.key)"
                  >
                    <span class="min-w-0 flex-1">
                      <span class="block text-sm text-ink-gray-9">{{
                        cap.label
                      }}</span>
                      <span
                        v-if="namesFor(cap.key)"
                        class="block truncate text-sm text-ink-gray-6"
                        >{{ namesFor(cap.key) }}</span
                      >
                    </span>
                    <span
                      class="num w-8 flex-none text-right text-sm text-ink-gray-7"
                      >{{ cap.count }}</span
                    >
                  </button>
                </li>
              </ul>
            </template>
          </aside>
        </div>
      </template>

      <div
        v-if="notice"
        role="status"
        class="ui-inverse sticky bottom-24 z-30 mt-4 flex items-center gap-3 rounded-full py-1 pl-5 pr-1 text-sm shadow-lg sm:bottom-4 sm:mx-auto sm:max-w-lg"
        data-testid="org-notice"
      >
        <span class="min-w-0 flex-1">{{ notice.text }}</span>
        <button
          v-if="notice.undo"
          type="button"
          class="press min-h-11 rounded-full px-4 font-medium hover:bg-surface-gray-9"
          data-testid="org-undo"
          @click="undo"
        >
          {{ __('Undo') }}
        </button>
        <button
          v-else
          type="button"
          class="press flex size-11 items-center justify-center rounded-full hover:bg-surface-gray-9"
          :aria-label="__('Close')"
          @click="notice = null"
        >
          <span class="lucide-x size-4" aria-hidden="true" />
        </button>
      </div>
    </div>

    <BottomSheet
      v-if="!isWide && current"
      :open="Boolean(current)"
      :aria-label="current.full_name || __('No name', null, 'Equipo')"
      @update:open="(v) => !v && select('')"
    >
      <OrgPersona
        :person="current"
        :nodes="tree.nodes"
        :capabilities="answer.capabilities"
        :lens="lens"
        @select="select"
        @move="openMove"
        @lens="lensFromSheet"
      />
      <template #actions>
        <button
          type="button"
          :class="BTN.tonal"
          class="press"
          @click="openFicha(current.employee)"
        >
          {{ __('Open their page') }}
        </button>
        <button
          v-if="current.editable"
          type="button"
          :class="BTN.filled"
          class="press"
          @click="openMove(current.employee)"
        >
          {{ __('Change whom they report to') }}
        </button>
      </template>
    </BottomSheet>
    <ReportaASheet
      v-if="moving"
      :open="Boolean(moving)"
      :person="moving"
      :nodes="tree.nodes"
      @pick="(boss) => move(moving.employee, boss)"
      @close="moveFor = ''"
    />
  </div>
</template>

<script setup>
import {
  computed,
  defineAsyncComponent,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BottomSheet, ChipGroup, SearchPanel, chipClass } from '@/components/ui'
import { isMobile as isPhone, isWide } from '@/composables/breakpoint'
import { equipoApi, personRoute } from '@/composables/useEquipo'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/utils/errorText'
import OrgNode from '@/components/equipo/OrgNode.vue'
import OrgPersona from '@/components/equipo/OrgPersona.vue'
import {
  CHART,
  MOVE,
  MOVE_MANY,
  buildTree,
  canDrop,
  lensSet,
  visibleFor,
  withMove,
} from '@/components/equipo/organigrama'

// The picker mounts on its first open.
const ReportaASheet = defineAsyncComponent(
  () => import('@/components/equipo/ReportaASheet.vue'),
)

const TOP = '__top__'
const route = useRoute()
const router = useRouter()

const answer = ref(null)
const people = ref([])
const failure = ref('')
const busy = ref(false)
const notice = ref(null)
const query = ref('')
const searchOpen = ref(false)
const folded = ref(new Set())
const moveFor = ref('')
const selected = computed(() => String(route.query.persona || ''))
const lens = computed(() => String(route.query.puede || ''))
// A mouse drags; a finger keeps the pencil.
const dragOn = ref(false)

const guard = computed(() => answer.value?.guard || null)
const tree = computed(() => buildTree(people.value))
const visible = computed(() => visibleFor(query.value, tree.value.nodes))
const lensPeople = computed(() => lensSet(lens.value, people.value))
const current = computed(() =>
  selected.value ? tree.value.nodes.get(selected.value) || null : null,
)
const moving = computed(() =>
  moveFor.value ? tree.value.nodes.get(moveFor.value) || null : null,
)
const lensOptions = computed(() => [
  { value: '', label: __('Everyone', null, 'Equipo') },
  ...(answer.value?.capabilities || []).map((c) => ({
    value: c.key,
    label: c.label,
    count: countFor(c.key),
  })),
])
const lensCap = computed(
  () =>
    (answer.value?.capabilities || []).find((c) => c.key === lens.value) ||
    null,
)
const suggestion = computed(() => {
  const s = answer.value?.suggestion
  if (!s) return null
  const loose = s.people.filter((e) => tree.value.nodes.get(e)?.loose)
  return loose.length ? { ...s, people: loose } : null
})

const summary = computed(() => {
  const n = people.value.length
  if (!answer.value || guard.value)
    return __('Who reports to whom, and what each one can do.')
  return n === 1
    ? __('One person. Who reports to whom, and what each one can do.')
    : __('{0} people. Who reports to whom, and what each one can do.', [n])
})
const lensLine = computed(() => {
  const cap = lensCap.value
  if (!cap) return ''
  const yes = people.value.filter((p) => lensPeople.value?.has(p.employee))
  if (!yes.length) return __('Nobody here can: {0}.', [cap.label])
  if (yes.length === 1)
    return __('Only {0} can: {1}.', [
      yes[0].full_name || __('No name', null, 'Equipo'),
      cap.label,
    ])
  return __('{0} of {1} people can: {2}.', [
    yes.length,
    people.value.length,
    cap.label,
  ])
})
const suggestionText = computed(() => {
  const s = suggestion.value
  if (!s) return ''
  if (s.people.length === 1)
    return __('{0} reports to nobody.', [nameOf(s.people[0])])
  return __('{0} people report to nobody.', [s.people.length])
})
const suggestionAction = computed(() => {
  const s = suggestion.value
  if (!s) return ''
  return s.people.length === 1
    ? __('Have {0} report to {1}', [
        firstName(s.people[0]),
        s.boss_name || __('the owner'),
      ])
    : __('Have them report to {0}', [s.boss_name || __('the owner')])
})
const withoutText = computed(() => {
  const rows = answer.value?.without_record || []
  if (rows.length === 1)
    return __(
      '{0} has a user but no employee record, so they are not on the chart.',
      [rows[0].full_name || __('Someone')],
    )
  return __(
    '{0} people have a user but no employee record, so they are not on the chart.',
    [rows.length],
  )
})
const dragLine = computed(() => {
  const d = drag
  if (!d.source || !d.over) return ''
  if (d.over === TOP)
    return __('Release: {0} reports to nobody', [
      d.source.full_name || __('No name', null, 'Equipo'),
    ])
  const target = tree.value.nodes.get(d.over)
  return d.allowed && target
    ? __('Release to move {0} under {1}', [
        d.source.full_name || __('No name', null, 'Equipo'),
        target.full_name || __('No name', null, 'Equipo'),
      ])
    : ''
})

function countFor(key) {
  return people.value.filter((p) => (p.capabilities || []).includes(key)).length
}
function namesFor(key) {
  const names = people.value
    .filter((p) => (p.capabilities || []).includes(key))
    .map((p) => p.full_name || __('No name', null, 'Equipo'))
  if (!names.length) return ''
  return names.length > 3
    ? __('{0} and {1} more', [names.slice(0, 3).join(', '), names.length - 3])
    : names.join(', ')
}
function nameOf(employee) {
  return (
    tree.value.nodes.get(employee)?.full_name || __('No name', null, 'Equipo')
  )
}
function firstName(employee) {
  return nameOf(employee).split(' ')[0]
}

function setQuery(patch) {
  const next = { ...route.query, ...patch }
  for (const key of Object.keys(next)) if (!next[key]) delete next[key]
  router.replace({ query: next })
}
function select(employee) {
  setQuery({ persona: employee || undefined })
}
function setLens(key) {
  setQuery({ puede: key || undefined })
}
// From the phone's card: the lens shows over the whole tree, so the card steps aside.
function lensFromSheet(key) {
  setQuery({ puede: key || undefined, persona: undefined })
}
function toggleFold(employee) {
  const next = new Set(folded.value)
  if (next.has(employee)) next.delete(employee)
  else next.add(employee)
  folded.value = next
}
function openMove(employee) {
  moveFor.value = employee
}
function openFicha(employee) {
  router.push(personRoute(employee, { list: route.fullPath }))
}

async function load() {
  failure.value = ''
  try {
    const data = await equipoApi(CHART)
    answer.value = data
    people.value = data?.people || []
  } catch (error) {
    failure.value = errorText(error, __('The organization chart did not load.'))
  }
}

/** Move one person; the screen changes first and goes back if the server refuses. */
async function move(employee, boss, { undoing = false } = {}) {
  moveFor.value = ''
  const before = people.value
  const previous = tree.value.nodes.get(employee)
  if (!previous || (previous.reports_to || null) === (boss || null)) return
  people.value = withMove(before, employee, boss)
  busy.value = true
  try {
    const result = await equipoApi(MOVE, { employee, reports_to: boss || null })
    notice.value = {
      text: result?.message || __('Done'),
      undo:
        undoing || previous.boss_gone
          ? null
          : { employee, boss: previous.reports_to || null },
    }
  } catch (error) {
    people.value = before
    notice.value = {
      text: errorText(error, __('Nothing changed.')),
      undo: null,
    }
  } finally {
    busy.value = false
  }
}

async function applySuggestion() {
  const s = suggestion.value
  if (!s) return
  const before = people.value
  let next = before
  for (const employee of s.people) next = withMove(next, employee, s.boss)
  people.value = next
  busy.value = true
  try {
    const result = await equipoApi(MOVE_MANY, {
      employees: s.people,
      reports_to: s.boss,
    })
    notice.value = { text: result?.message || __('Done'), undo: null }
  } catch (error) {
    people.value = before
    notice.value = {
      text: errorText(error, __('Nothing changed.')),
      undo: null,
    }
  } finally {
    busy.value = false
  }
}

function undo() {
  const back = notice.value?.undo
  notice.value = null
  if (back) move(back.employee, back.boss, { undoing: true })
}

// Drag and drop with a mouse: the same rule as the picker (never under your own team).
const drag = reactive({
  source: null,
  over: '',
  allowed: false,
  start(node) {
    drag.source = node
  },
  hover(node) {
    drag.over = node.employee
    drag.allowed = canDrop(drag.source, node)
    return drag.allowed
  },
  hoverTop() {
    drag.over = TOP
    drag.allowed = canDrop(drag.source, null)
  },
  leave(node) {
    if (drag.over === node.employee) {
      drag.over = ''
      drag.allowed = false
    }
  },
  drop(node) {
    const source = drag.source
    const allowed = node ? canDrop(source, node) : canDrop(source, null)
    drag.end()
    if (source && allowed) move(source.employee, node ? node.employee : null)
  },
  end() {
    drag.source = null
    drag.over = ''
    drag.allowed = false
  },
})

// The notice leaves on its own after a while; a new one restarts the wait.
let noticeTimer = null
watch(notice, (value) => {
  clearTimeout(noticeTimer)
  if (value) noticeTimer = setTimeout(() => (notice.value = null), 8000)
})

onMounted(() => {
  dragOn.value =
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(pointer: fine)').matches)
  load()
})
</script>

<style scoped>
@media (min-width: 1024px) {
  .org-split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 22rem;
    gap: 2rem;
  }
}
</style>
