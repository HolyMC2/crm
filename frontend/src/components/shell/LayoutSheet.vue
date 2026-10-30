<template>
  <!-- «Personalizar» (mine) and the owner's «Barra por puesto» (team): one
       list of the places, in three parts. The bar is what sits a tap away
       (the phone's bottom bar, the top of the desktop rail); Más holds the
       rest in this order; hidden places fold away but still open from Más,
       the rail's «Más» and the search. Drag a row (long-press on the phone,
       the grip on desktop, or the grip and the arrow keys) to reorder. -->
  <BottomSheet
    v-model:open="open"
    :title="team ? __('Bar by puesto') : __('Customize')"
    :subtitle="subtitle"
    layer="layout"
    @closed="closed"
  >
    <template v-if="team" #header>
      <label for="layout-class" class="sr-only">{{ __('Puesto') }}</label>
      <select
        id="layout-class"
        v-model="klass"
        class="h-11 w-full rounded-6 border-0 bg-surface-gray-2 pl-3 pr-8 text-base"
        data-testid="layout-class"
      >
        <option
          v-for="(label, key) in NAV_CLASS_LABELS"
          :key="key"
          :value="key"
        >
          {{ label }}{{ teamLayouts[key] ? '' : ` · ${__('suggested')}` }}
        </option>
      </select>
    </template>

    <div v-if="loadError" class="space-y-3 py-4" role="alert">
      <p class="text-base text-ink-gray-8">{{ loadError }}</p>
      <Button :label="__('Retry')" @click="loadTeam" />
    </div>
    <div v-else ref="scroller" class="space-y-5 pt-1">
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
          <li v-if="hoy" :class="ROW" data-layout-row="hoy">
            <span class="w-8 flex-none" aria-hidden="true" />
            <span :class="[hoy.icon, 'size-5 flex-none']" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ hoy.label }}</span>
            <span class="flex-none pr-3 text-sm text-ink-gray-6">{{
              __('Always first')
            }}</span>
          </li>
        </ul>
        <ul class="mt-1 space-y-1" data-reorder-list="bar">
          <li
            v-for="(key, index) in bar"
            :key="key"
            :class="ROW"
            :data-reorder-key="key"
            :data-layout-row="key"
          >
            <button
              type="button"
              data-drag-handle
              :class="GRIP"
              :aria-label="__('Move {0}', [labelOf(key)])"
              :title="__('Drag, or use the arrow keys, to reorder')"
              @keydown="nudge('bar', index, $event)"
            >
              <span class="lucide-grip-vertical size-4" aria-hidden="true" />
            </button>
            <span
              :class="[placeOf(key)?.icon, 'size-5 flex-none']"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate">{{ labelOf(key) }}</span>
            <button
              type="button"
              :class="ACTION"
              :aria-label="__('Take {0} off the bar', [labelOf(key)])"
              :title="__('Take off the bar')"
              data-action="off-bar"
              @click="offBar(key)"
            >
              <span class="lucide-pin-off size-4" aria-hidden="true" />
            </button>
          </li>
        </ul>
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
        <h3 id="layout-more" class="pb-2 text-sm font-semibold text-ink-gray-7">
          {{ __('In Más') }}
        </h3>
        <ul class="space-y-1" data-reorder-list="more">
          <li
            v-for="(key, index) in more"
            :key="key"
            :class="ROW"
            :data-reorder-key="key"
            :data-layout-row="key"
          >
            <button
              type="button"
              data-drag-handle
              :class="GRIP"
              :aria-label="__('Move {0}', [labelOf(key)])"
              :title="__('Drag, or use the arrow keys, to reorder')"
              @keydown="nudge('more', index, $event)"
            >
              <span class="lucide-grip-vertical size-4" aria-hidden="true" />
            </button>
            <span
              :class="[placeOf(key)?.icon, 'size-5 flex-none']"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate">{{ labelOf(key) }}</span>
            <button
              type="button"
              :class="ACTION"
              :aria-label="__('Pin {0} to the bar', [labelOf(key)])"
              :title="__('Pin to the bar')"
              data-action="to-bar"
              @click="toBar(key)"
            >
              <span class="lucide-pin size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              :class="ACTION"
              :aria-label="__('Hide {0}', [labelOf(key)])"
              :title="__('Hide from Más')"
              data-action="hide"
              @click="hide(key)"
            >
              <span class="lucide-eye-off size-4" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <p v-if="!more.length" class="py-2 text-sm text-ink-gray-6">
          {{ __('Nothing else: everything is on the bar or hidden.') }}
        </p>
      </section>

      <section aria-labelledby="layout-hidden">
        <h3
          id="layout-hidden"
          class="pb-1 text-sm font-semibold text-ink-gray-7"
        >
          {{ __('Hidden places') }}
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
        <ul class="space-y-1">
          <li
            v-for="key in hidden"
            :key="key"
            :class="ROW"
            :data-layout-row="key"
          >
            <span class="w-8 flex-none" aria-hidden="true" />
            <span
              :class="[placeOf(key)?.icon, 'size-5 flex-none text-ink-gray-6']"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate text-ink-gray-7">{{
              labelOf(key)
            }}</span>
            <button
              type="button"
              :class="ACTION"
              :aria-label="__('Show {0}', [labelOf(key)])"
              :title="__('Show')"
              data-action="show"
              @click="show(key)"
            >
              <span class="lucide-eye size-4" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>
    </div>

    <template v-if="!loadError" #actions>
      <Button
        v-if="canReset"
        :label="resetLabel"
        :loading="busy === 'reset'"
        :disabled="!!busy"
        data-testid="layout-reset"
        @click="reset"
      />
      <Button
        variant="solid"
        :label="
          team ? __('Save for {0}', [NAV_CLASS_LABELS[klass]]) : __('Save')
        "
        :loading="busy === 'save'"
        :disabled="!!busy || (team && !teamLoaded)"
        data-testid="layout-save"
        @click="save"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, call, toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
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
import {
  NAV_CLASS_LABELS,
  arrangeShell,
  barRoom,
  layoutOf,
} from '@/utils/shellLayout'

const props = defineProps({ mode: { type: String, default: 'mine' } })
const team = computed(() => props.mode === 'team')
const open = ref(true)
const busy = ref('')
const note = ref('')
const loadError = ref('')

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
const more = ref([])
const hidden = ref([])
function fill(arranged) {
  const keys = (list) =>
    list.map((place) => place.key).filter((key) => key !== 'hoy')
  bar.value = keys(arranged.bar)
  more.value = keys(arranged.more)
  hidden.value = keys(arranged.hidden)
  note.value = ''
}

// Mine: what the shell shows now. Team: the owner's layout for the chosen
// class, else what the contracts defaults give that class.
const klass = ref(shellBoot.value?.user?.nav_role || 'vendedor')
const teamLayouts = ref({})
const teamLoaded = ref(false)
function fillTeam() {
  fill(
    arrangeShell({
      role: klass.value,
      modules: shellModules.value,
      apps: sortSiblings(installedSiblings()),
      layout: teamLayouts.value[klass.value] || null,
    }),
  )
}
async function loadTeam() {
  loadError.value = ''
  try {
    teamLayouts.value = (await call('crm.api.shell.team_layouts')).layouts || {}
    teamLoaded.value = true
    fillTeam()
  } catch (error) {
    loadError.value =
      error?.messages?.[0] ||
      __('We could not read the bars by puesto. Retry in a moment.')
  }
}
if (team.value) loadTeam()
else fill(shellLayout.value)
watch(klass, () => teamLoaded.value && fillTeam())

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
  hidden.value = hidden.value.filter((other) => other !== key)
}
// A full bar makes room: its last place moves to the top of Más, and the
// sheet says so (never a refusal).
function toBar(key) {
  without(key)
  note.value = ''
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
function hide(key) {
  without(key)
  hidden.value = [...hidden.value, key]
}
function show(key) {
  without(key)
  more.value = [...more.value, key]
}
const lists = { bar, more }
function nudge(list, index, event) {
  const step = { ArrowUp: -1, ArrowDown: 1 }[event.key]
  const keys = lists[list].value
  if (!step || index + step < 0 || index + step >= keys.length) return
  event.preventDefault()
  const next = keys.slice()
  const [key] = next.splice(index, 1)
  next.splice(index + step, 0, key)
  lists[list].value = next
  // The grip keeps the focus on its row at the new place.
  requestAnimationFrame(() =>
    document
      .querySelector(`[data-layout-row="${key}"] [data-drag-handle]`)
      ?.focus(),
  )
}
const scroller = ref(null)
useReorder(scroller, {
  onDrop: ({ list, keys }) => {
    if (lists[list]) lists[list].value = keys
  },
})

const canReset = computed(() =>
  team.value
    ? !!teamLayouts.value[klass.value]
    : shellBoot.value?.layout?.source === 'personal',
)
const resetLabel = computed(() =>
  team.value ? __('Use the suggested one') : __("Back to my puesto's"),
)

async function save() {
  busy.value = 'save'
  try {
    const layout = layoutOf({
      bar: bar.value,
      more: more.value,
      hidden: hidden.value,
    })
    if (team.value) {
      teamLayouts.value = (
        await call('crm.api.shell.save_team_layout', {
          nav_class: klass.value,
          layout: JSON.stringify(layout),
        })
      ).layouts
      toast.success(
        __('Saved for {0}. Whoever arranged their own keeps it.', [
          NAV_CLASS_LABELS[klass.value],
        ]),
      )
      // My own shell may follow this class's layout.
      loadShell({ refresh: true }).catch(() => {})
    } else {
      await saveLayout(layout)
      toast.success(__('Saved. Your bar and Más changed.'))
    }
    open.value = false
  } catch (error) {
    toast.error(error?.messages?.[0] || __('We could not save it. Retry.'))
  } finally {
    busy.value = ''
  }
}
async function reset() {
  busy.value = 'reset'
  try {
    if (team.value) {
      teamLayouts.value = (
        await call('crm.api.shell.save_team_layout', { nav_class: klass.value })
      ).layouts
      fillTeam()
      loadShell({ refresh: true }).catch(() => {})
      toast.success(
        __('{0} starts with the suggested bar again.', [
          NAV_CLASS_LABELS[klass.value],
        ]),
      )
    } else {
      await resetLayout()
      fill(shellLayout.value)
      toast.success(__("Back to your puesto's bar."))
    }
  } catch (error) {
    toast.error(error?.messages?.[0] || __('We could not save it. Retry.'))
  } finally {
    busy.value = ''
  }
}

const ROW =
  'flex min-h-12 items-center gap-2 rounded-6 bg-surface-gray-1 pr-1 text-base'
const GRIP =
  'flex h-11 w-8 flex-none cursor-grab items-center justify-center rounded-6 text-ink-gray-5 touch-none'
const ACTION =
  'press flex size-11 flex-none items-center justify-center rounded-6 text-ink-gray-7 hover:bg-surface-gray-3'
</script>
