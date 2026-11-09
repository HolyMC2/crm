<template>
  <!-- «Personalizar» (mine) and the owner's «Barra por puesto» (team): one
       list of the places, in two parts. The bar is what sits a tap away (the
       phone's bottom bar, the top of the desktop rail); Más holds the rest in
       this order. A hidden place keeps its spot in Más, dimmed with the eye
       crossed; it still opens from Más, the rail's «Más» and the search.
       Beside the list, the bar (phone) or the rail (wider) as it will look. -->
  <BottomSheet
    v-model:open="open"
    :title="team ? __('Bar by puesto') : __('Customize')"
    :subtitle="subtitle"
    layer="layout"
    @closed="closed"
  >
    <template v-if="team || phone" #header>
      <template v-if="team">
        <label for="layout-class" class="sr-only">{{ __('Puesto') }}</label>
        <select
          id="layout-class"
          v-model="teamState.klass.value"
          class="h-11 w-full rounded-6 border-0 bg-surface-gray-2 pl-3 pr-8 text-base"
          data-testid="layout-class"
        >
          <option
            v-for="(label, key) in NAV_CLASS_LABELS"
            :key="key"
            :value="key"
          >
            {{ label
            }}{{ teamState.layouts.value[key] ? '' : ` · ${__('suggested')}` }}
          </option>
        </select>
      </template>
      <ShellPreview
        v-if="phone && !loadError"
        kind="bar"
        :class="team ? 'mt-2' : ''"
        :bar="barPlaces"
        :more="morePlaces"
        :hidden="hidden"
        :lit="lit"
      />
    </template>

    <div v-if="loadError" class="space-y-3 py-4" role="alert">
      <p class="text-base text-ink-gray-8">{{ loadError }}</p>
      <Button :label="__('Retry')" @click="teamState.load().then(fillTeam)" />
    </div>
    <div v-else ref="scroller" class="flex items-start gap-4 pt-1">
      <ShellPreview
        v-if="!phone"
        kind="rail"
        class="sticky top-0"
        :bar="barPlaces"
        :more="morePlaces"
        :hidden="hidden"
        :lit="lit"
      />
      <div class="min-w-0 flex-1 space-y-5">
        <section aria-labelledby="layout-bar">
          <h3
            id="layout-bar"
            class="flex items-baseline gap-2 pb-2 text-sm font-semibold text-ink-gray-7"
          >
            <span class="flex-1">{{ __('On the bar') }}</span>
            <span class="num font-normal text-ink-gray-6">{{
              __('{0} of {1}', [bar.length, room])
            }}</span>
          </h3>
          <ul class="space-y-1">
            <li
              v-if="hoy"
              :class="HOY_ROW"
              data-layout-row="hoy"
              @pointerenter="lit = 'hoy'"
              @pointerleave="lit = ''"
            >
              <span class="w-8 flex-none" aria-hidden="true" />
              <span
                :class="[hoy.icon, 'size-5 flex-none']"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1 truncate">{{ hoy.label }}</span>
              <span class="flex-none pr-3 text-sm text-ink-gray-6">{{
                __('Always first')
              }}</span>
            </li>
          </ul>
          <ArrangeList
            v-model:keys="bar"
            list="bar"
            class="mt-1"
            :item-of="placeOf"
            :move="OFF_BAR"
            @move="offBar"
            @lit="lit = $event"
          />
          <p v-if="!bar.length" class="py-2 text-sm text-ink-gray-6">
            {{
              __(
                'Empty: Muelle fills the bar with what your puesto uses most. Pin a place from Más to choose.',
              )
            }}
          </p>
          <!-- What a pin to a full bar moved, said where it happened. -->
          <p v-if="note" role="status" class="pt-2 text-sm text-ink-gray-7">
            {{ note }}
          </p>
        </section>

        <section aria-labelledby="layout-more">
          <h3
            id="layout-more"
            class="pb-1 text-sm font-semibold text-ink-gray-7"
          >
            {{ __('In Más') }}
          </h3>
          <p class="pb-2 text-sm text-ink-gray-6">
            {{
              team
                ? __(
                    'Hiding does not take access away: change the puesto in Equipo for that.',
                  )
                : __(
                    'Hidden places still open from Más > Hidden and from the search.',
                  )
            }}
          </p>
          <ArrangeList
            v-model:keys="more"
            list="more"
            :item-of="placeOf"
            :hidden="hidden"
            hideable
            :move="TO_BAR"
            @move="toBar"
            @toggle="toggleHidden"
            @lit="lit = $event"
          />
          <p v-if="!more.length" class="py-2 text-sm text-ink-gray-6">
            {{ __('Nothing else: everything is on the bar.') }}
          </p>
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
    </div>

    <template v-if="!loadError" #actions>
      <Button
        v-if="!team && canResetMine"
        :label="__('Back to my puesto\'s')"
        :loading="busy === 'reset'"
        :disabled="!!busy"
        data-testid="layout-reset"
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
        data-testid="layout-save"
        @click="save"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { isMobile } from '@/composables/breakpoint'
import {
  layoutSheet,
  loadShell,
  resetLayout,
  saveLayout,
  shellBoot,
  shellLayout,
  shellModules,
} from '@/composables/muelleShell'
import { installedSiblings, sortSiblings } from '@/composables/siblingApps'
import { useReorder } from '@/composables/useReorder'
import { useTeamLayouts } from '@/composables/teamLayouts'
import {
  NAV_CLASS_LABELS,
  arrangeShell,
  barRoom,
  layoutOf,
} from '@/utils/shellLayout'
import ArrangeList from './ArrangeList.vue'
import ShellPreview from './ShellPreview.vue'
import TeamResets from './TeamResets.vue'

const props = defineProps({ mode: { type: String, default: 'mine' } })
const team = computed(() => props.mode === 'team')
const phone = isMobile
const open = ref(true)
const busy = ref('')
const note = ref('')
const lit = ref('')

// Every place the sheet arranges, with its icon and name.
const places = computed(() => [
  ...shellModules.value.filter((module) => module.key !== 'avisos'),
  ...sortSiblings(installedSiblings()).map((app) => ({ ...app, app: true })),
])
const placeOf = (key) => places.value.find((place) => place.key === key)
const labelOf = (key) => placeOf(key)?.label || key
const hoy = computed(() => placeOf('hoy'))
const room = computed(() => barRoom(places.value))

const bar = ref([])
// Más in order, the hidden places in their spot; `hidden` flags them.
const more = ref([])
const hidden = ref(new Set())
function fill(arranged) {
  const keys = (list) =>
    list.map((place) => place.key).filter((key) => key !== 'hoy')
  bar.value = keys(arranged.bar)
  more.value = keys(arranged.rest)
  hidden.value = new Set(keys(arranged.hidden))
  note.value = ''
}
// The preview draws what a save would give.
const barPlaces = computed(() =>
  [hoy.value, ...bar.value.map(placeOf)].filter(Boolean),
)
const morePlaces = computed(() =>
  more.value.filter((key) => !hidden.value.has(key)).map(placeOf),
)

// Mine: what the shell shows now. Team: the owner's layout for the chosen
// class, else what the contracts defaults give that class.
const teamState = useTeamLayouts()
const loadError = computed(() => (team.value ? teamState.loadError.value : ''))
function fillTeam() {
  fill(
    arrangeShell({
      role: teamState.klass.value,
      modules: shellModules.value,
      apps: sortSiblings(installedSiblings()),
      layout: teamState.layouts.value[teamState.klass.value] || null,
    }),
  )
}
if (team.value) teamState.load().then(fillTeam)
else fill(shellLayout.value)
watch(teamState.klass, () => teamState.loaded.value && fillTeam())

// Unmounted once the sheet has slid away.
function closed() {
  layoutSheet.value = null
}

const subtitle = computed(() =>
  team.value
    ? __(
        'How each puesto starts. People only see what their permissions open, and can arrange their own.',
      )
    : __('Keep what you use a tap away.'),
)

function without(key) {
  bar.value = bar.value.filter((other) => other !== key)
  more.value = more.value.filter((other) => other !== key)
}
// A full bar makes room: its last place moves to the top of Más, and the
// sheet says so (never a refusal). A hidden place pinned shows again.
function toBar(key) {
  without(key)
  note.value = ''
  if (hidden.value.has(key)) {
    const next = new Set(hidden.value)
    next.delete(key)
    hidden.value = next
  }
  if (bar.value.length >= room.value) {
    const bumped = bar.value.pop()
    more.value = [bumped, ...more.value]
    note.value = __('{0} moved to Más to make room.', [labelOf(bumped)])
  }
  bar.value = [...bar.value, key]
}
function offBar(key) {
  without(key)
  more.value = [key, ...more.value]
}
function toggleHidden(key) {
  const next = new Set(hidden.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  hidden.value = next
}
const lists = { bar, more }
const scroller = ref(null)
useReorder(scroller, {
  onDrop: ({ list, keys }) => {
    if (lists[list]) lists[list].value = keys
  },
})

const OFF_BAR = {
  icon: 'lucide-pin-off',
  title: __('Take off the bar'),
  action: 'off-bar',
  label: (name) => __('Take {0} off the bar', [name]),
}
const TO_BAR = {
  icon: 'lucide-pin',
  title: __('Pin to the bar'),
  action: 'to-bar',
  label: (name) => __('Pin {0} to the bar', [name]),
}

const canResetMine = computed(
  () => shellBoot.value?.layout?.source === 'personal',
)
const current = () =>
  layoutOf({ bar: bar.value, more: more.value, hidden: [...hidden.value] })

async function save() {
  busy.value = 'save'
  try {
    if (team.value) {
      await teamState.save(current())
      toast.success(
        __('Saved for {0}. Whoever arranged their own keeps it.', [
          NAV_CLASS_LABELS[teamState.klass.value],
        ]),
      )
      // My own shell may follow this class's layout.
      loadShell({ refresh: true }).catch(() => {})
    } else {
      await saveLayout(current())
      toast.success(__('Saved. Your bar and Más changed.'))
    }
    open.value = false
  } catch (error) {
    toast.error(error?.messages?.[0] || __('We could not save it. Retry.'))
  } finally {
    busy.value = ''
  }
}
async function run(kind, action, done) {
  busy.value = kind
  try {
    await action()
    done()
  } catch (error) {
    toast.error(error?.messages?.[0] || __('We could not save it. Retry.'))
  } finally {
    busy.value = ''
  }
}
function resetMine() {
  run('reset', resetLayout, () => {
    fill(shellLayout.value)
    toast.success(__("Back to your puesto's bar."))
  })
}
function resetTeamOne() {
  run('reset', teamState.resetOne, () => {
    fillTeam()
    loadShell({ refresh: true }).catch(() => {})
    toast.success(
      __('{0} starts with the suggested bar again.', [
        NAV_CLASS_LABELS[teamState.klass.value],
      ]),
    )
  })
}
function resetTeamAll() {
  run('reset-all', teamState.resetAll, () => {
    fillTeam()
    loadShell({ refresh: true }).catch(() => {})
    toast.success(__('Every puesto starts with the suggested bar again.'))
  })
}

const HOY_ROW =
  'flex min-h-12 items-center gap-2 rounded-6 bg-surface-gray-1 pr-1 text-base'
</script>
