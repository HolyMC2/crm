<template>
  <!-- A module's own sections arranged from its title (Ventas' lists,
       Inmobiliaria's homes): the same three layers as the bar. What the
       module ships, then the owner's per puesto, then the worker's own. The
       owner switches between «Para mí» and «Por puesto». A hidden section
       keeps its place, dimmed with the eye crossed; it still opens from the
       search and from its links. -->
  <BottomSheet
    v-model:open="open"
    :title="__('Arrange {0}', [options.title])"
    :subtitle="subtitle"
    layer="sections"
    @closed="closed"
  >
    <template v-if="arrangesTeam" #header>
      <Segmented
        v-model="mode"
        :options="MODES"
        :label="__('Whose arrangement')"
        data-testid="sections-mode"
      />
      <template v-if="team">
        <label for="sections-class" class="sr-only">{{ __('Puesto') }}</label>
        <select
          id="sections-class"
          v-model="teamState.klass.value"
          class="mt-2 h-11 w-full rounded-6 border-0 bg-surface-gray-2 pl-3 pr-8 text-base"
          data-testid="sections-class"
        >
          <option
            v-for="(label, key) in NAV_CLASS_LABELS"
            :key="key"
            :value="key"
          >
            {{ label
            }}{{
              teamState.layouts.value[key] ? '' : ` · ${__('suggested order')}`
            }}
          </option>
        </select>
      </template>
    </template>

    <div v-if="loadError" class="space-y-3 py-4" role="alert">
      <p class="text-base text-ink-gray-8">{{ loadError }}</p>
      <Button :label="__('Retry')" @click="loadTeam" />
    </div>
    <div v-else ref="scroller" class="space-y-5 pt-1">
      <section v-if="options.parts" aria-labelledby="sections-top">
        <h3
          id="sections-top"
          class="pb-2 text-sm font-semibold text-ink-gray-7"
        >
          {{ options.parts.top }}
        </h3>
        <ArrangeList
          v-model:keys="top"
          list="top"
          :item-of="itemOf"
          :move="DOWN"
          @move="toRest"
        />
        <p v-if="!top.length" class="py-2 text-sm text-ink-gray-6">
          {{ __('Empty: pin a section from below to put it first.') }}
        </p>
      </section>
      <section aria-labelledby="sections-rest">
        <h3
          v-if="options.parts"
          id="sections-rest"
          class="pb-1 text-sm font-semibold text-ink-gray-7"
        >
          {{ options.parts.rest }}
        </h3>
        <p class="pb-2 text-sm text-ink-gray-6">
          {{
            options.hint ||
            __(
              'Hiding does not take access away: a hidden section still opens from the search.',
            )
          }}
        </p>
        <ArrangeList
          v-model:keys="rest"
          list="rest"
          :item-of="itemOf"
          :hidden="hidden"
          hideable
          :move="options.parts ? UP : null"
          @move="toTop"
          @toggle="toggleHidden"
        />
      </section>

      <TeamResets
        v-if="team && teamState.loaded.value"
        :klass-label="NAV_CLASS_LABELS[teamState.klass.value]"
        :one="!!teamState.layouts.value[teamState.klass.value]"
        :arranged="teamState.arranged.value.length"
        :reach="teamState.reach.value"
        :busy="busy"
        @one="resetTeamOne"
        @all="resetTeamAll"
      />
    </div>

    <template v-if="!loadError" #actions>
      <Button
        v-if="!team && mine?.source === 'personal'"
        :label="__('Back to my puesto\'s order')"
        :loading="busy === 'reset'"
        :disabled="!!busy"
        data-testid="sections-reset"
        @click="resetMine"
      />
      <Button
        variant="solid"
        :label="
          team
            ? __('Save for {0}', [NAV_CLASS_LABELS[teamState.klass.value]])
            : __('Save')
        "
        :loading="busy === 'save'"
        :disabled="!!busy || (team && !teamState.loaded.value)"
        data-testid="sections-save"
        @click="save"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import {
  loadShell,
  moduleLayout,
  resetModuleLayout,
  saveModuleLayout,
  sectionsSheet,
  shellBoot,
} from '@/composables/muelleShell'
import { useReorder } from '@/composables/useReorder'
import { useTeamLayouts } from '@/composables/teamLayouts'
import {
  NAV_CLASS_LABELS,
  arrangeSections,
  layoutOf,
} from '@/utils/shellLayout'
import ArrangeList from './ArrangeList.vue'
import TeamResets from './TeamResets.vue'

const props = defineProps({
  // { module, title, items: [{ key, label, icon }], top: [keys],
  //   parts: { top, rest } | null, hint: where a hidden one still opens }
  options: { type: Object, required: true },
})
const open = ref(true)
const busy = ref('')
const arrangesTeam = computed(() => !!shellBoot.value?.user?.arranges_team)
const MODES = [
  { value: 'mine', label: __('For me') },
  { value: 'team', label: __('By puesto') },
]
const mode = ref('mine')
const team = computed(() => mode.value === 'team')
const mine = computed(() => moduleLayout(props.options.module))

const itemOf = (key) => props.options.items.find((item) => item.key === key)

const top = ref([])
const rest = ref([])
const hidden = ref(new Set())
function fill(layout) {
  const arranged = arrangeSections({
    items: props.options.items,
    top: props.options.parts ? props.options.top || [] : [],
    layout,
  })
  const keys = (list) => list.map((item) => item.key)
  top.value = keys(arranged.top)
  rest.value = keys(arranged.rest)
  hidden.value = new Set(arranged.hidden)
}
fill(mine.value)

const teamState = useTeamLayouts(props.options.module)
const loadError = computed(() => (team.value ? teamState.loadError.value : ''))
const fillTeam = () =>
  fill(teamState.layouts.value[teamState.klass.value] || null)
function loadTeam() {
  return teamState.load().then(() => teamState.loaded.value && fillTeam())
}
watch(mode, (value) => {
  if (value === 'mine') fill(mine.value)
  else if (teamState.loaded.value) fillTeam()
  else loadTeam()
})
watch(teamState.klass, () => teamState.loaded.value && fillTeam())

function closed() {
  sectionsSheet.value = null
}

const subtitle = computed(() =>
  team.value
    ? __('How each puesto finds {0}. People can still arrange their own.', [
        props.options.title,
      ])
    : __('Put first what you open most.'),
)

function without(key) {
  top.value = top.value.filter((other) => other !== key)
  rest.value = rest.value.filter((other) => other !== key)
}
function toTop(key) {
  without(key)
  if (hidden.value.has(key)) toggleHidden(key)
  top.value = [...top.value, key]
}
function toRest(key) {
  without(key)
  rest.value = [key, ...rest.value]
}
function toggleHidden(key) {
  const next = new Set(hidden.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  hidden.value = next
}
const lists = { top, rest }
const scroller = ref(null)
useReorder(scroller, {
  onDrop: ({ list, keys }) => {
    if (lists[list]) lists[list].value = keys
  },
})

const DOWN = {
  icon: 'lucide-pin-off',
  title: __('Move down'),
  action: 'to-rest',
  label: (name) =>
    __('Move {0} to {1}', [name, props.options.parts?.rest || '']),
}
const UP = {
  icon: 'lucide-pin',
  title: __('Put first'),
  action: 'to-top',
  label: (name) =>
    __('Move {0} to {1}', [name, props.options.parts?.top || '']),
}

const current = () =>
  layoutOf({ bar: top.value, more: rest.value, hidden: [...hidden.value] })

async function run(kind, action, done) {
  busy.value = kind
  try {
    await action()
    done?.()
  } catch (error) {
    toast.error(error?.messages?.[0] || __('We could not save it. Retry.'))
  } finally {
    busy.value = ''
  }
}
function save() {
  run('save', async () => {
    if (team.value) {
      await teamState.save(current())
      toast.success(
        __('Saved for {0}. Anyone with an order of their own keeps it.', [
          NAV_CLASS_LABELS[teamState.klass.value],
        ]),
      )
      // My own module may follow this class's layout.
      refreshShell()
    } else {
      await saveModuleLayout(props.options.module, current())
      toast.success(__('Saved. {0} changed.', [props.options.title]))
    }
    open.value = false
  })
}
function resetMine() {
  run(
    'reset',
    () => resetModuleLayout(props.options.module),
    () => {
      fill(mine.value)
      toast.success(__("Back to your puesto's order."))
    },
  )
}
function refreshShell() {
  loadShell({ refresh: true }).catch(() => {})
}
function resetTeamOne() {
  run('reset', teamState.resetOne, () => {
    fillTeam()
    refreshShell()
    toast.success(
      __('{0} starts with the suggested order again.', [
        NAV_CLASS_LABELS[teamState.klass.value],
      ]),
    )
  })
}
function resetTeamAll() {
  run('reset-all', teamState.resetAll, () => {
    fillTeam()
    refreshShell()
    toast.success(__('Every puesto starts with the suggested order again.'))
  })
}
</script>
