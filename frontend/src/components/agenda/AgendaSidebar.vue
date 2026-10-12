<template>
  <nav class="ag-side" :aria-label="__('Agenda')">
    <div class="ag-side__create">
      <button
        v-if="canCreate"
        type="button"
        class="ag-side__createbtn"
        :aria-label="__('Create')"
        @click="createMenu = !createMenu"
      >
        <span class="lucide-plus h-5 w-5" aria-hidden="true" />
        <span>{{ __('Create') }}</span>
        <span
          class="lucide-chevron-down h-4 w-4 opacity-70"
          aria-hidden="true"
        />
      </button>
      <div
        v-if="createMenu"
        class="ag-menu"
        role="menu"
        @keydown.esc="createMenu = false"
      >
        <button
          type="button"
          role="menuitem"
          class="ag-menu__item"
          @click="pickCreate('event')"
        >
          <span class="lucide-calendar-plus h-4 w-4" aria-hidden="true" />{{
            __('Event')
          }}
        </button>
        <button
          v-if="canCreateTask"
          type="button"
          role="menuitem"
          class="ag-menu__item"
          @click="pickCreate('task')"
        >
          <span class="lucide-circle-check h-4 w-4" aria-hidden="true" />{{
            __('Task')
          }}
        </button>
      </div>
    </div>

    <AgendaMiniMonth
      class="mt-4"
      :selected="selected"
      :today="today"
      :range="range"
      :busy-dates="busyDates"
      :week-starts-on="weekStartsOn"
      :locale="locale"
      @pick="(date) => emit('pick', date)"
    />

    <section v-for="group in groups" :key="group.key" class="ag-side__group">
      <button
        type="button"
        class="ag-side__grouphead"
        :aria-expanded="!collapsed[group.key]"
        @click="collapsed[group.key] = !collapsed[group.key]"
      >
        <span class="flex-1 text-left">{{ group.label }}</span>
        <span
          v-if="group.key === 'other'"
          class="ag-side__iconbtn"
          role="button"
          :aria-label="__('Add a calendar')"
          @click.stop="emit('settings', 'sync')"
        >
          <span class="lucide-plus h-4 w-4" aria-hidden="true" />
        </span>
        <span
          :class="
            collapsed[group.key] ? 'lucide-chevron-down' : 'lucide-chevron-up'
          "
          class="h-4 w-4"
          aria-hidden="true"
        />
      </button>
      <ul v-if="!collapsed[group.key]" class="ag-side__list">
        <li
          v-for="calendar in group.rows"
          :key="calendar.key"
          class="ag-side__row"
        >
          <label
            class="ag-side__label"
            :title="calendar.reason || calendar.label"
          >
            <input
              type="checkbox"
              class="sr-only"
              :checked="calendar.visible"
              :disabled="calendar.blocked"
              @change="emit('toggle', calendar.key)"
            />
            <span
              class="ag-side__check"
              :style="
                calendar.visible
                  ? { background: calendar.color, borderColor: calendar.color }
                  : { borderColor: calendar.color }
              "
              aria-hidden="true"
            >
              <span
                v-if="calendar.visible"
                class="lucide-check h-3.5 w-3.5"
                :style="{ color: textOn(calendar.color) }"
              />
            </span>
            <span
              class="truncate"
              :class="calendar.blocked ? 'text-ink-gray-5' : ''"
              >{{ calendar.label }}</span
            >
          </label>
          <button
            v-if="!calendar.blocked"
            type="button"
            class="ag-side__iconbtn ag-side__rowmenu"
            :aria-label="__('Options for {0}', [calendar.label])"
            @click="menu = menu === calendar.key ? '' : calendar.key"
          >
            <span class="lucide-more-vertical h-4 w-4" aria-hidden="true" />
          </button>
          <div
            v-if="menu === calendar.key"
            class="ag-menu ag-menu--right"
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              class="ag-menu__item"
              @click="only(calendar.key)"
            >
              {{ __('Display this only') }}
            </button>
            <div class="ag-swatches" role="group" :aria-label="__('Color')">
              <button
                v-for="swatch in PALETTE"
                :key="swatch.id"
                type="button"
                class="ag-swatch"
                :style="{ background: swatch.hex }"
                :aria-label="__(swatch.name)"
                :title="__(swatch.name)"
                :aria-pressed="swatch.hex === calendar.color"
                @click="pickColor(calendar.key, swatch.hex)"
              >
                <span
                  v-if="swatch.hex === calendar.color"
                  class="lucide-check h-3 w-3"
                  :style="{ color: textOn(swatch.hex) }"
                  aria-hidden="true"
                />
              </button>
            </div>
            <button
              type="button"
              role="menuitem"
              class="ag-menu__item"
              @click="((menu = ''), emit('settings', 'calendars'))"
            >
              {{ __('Settings') }}
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section class="ag-side__group">
      <button
        type="button"
        class="ag-side__sync"
        @click="emit('settings', 'sync')"
      >
        <span class="lucide-refresh-cw h-4 w-4 shrink-0" aria-hidden="true" />
        <span class="min-w-0 flex-1 text-left">
          <span class="block truncate">{{ syncTitle }}</span>
          <span class="block truncate text-xs text-ink-gray-6">{{
            syncHint
          }}</span>
        </span>
      </button>
    </section>
  </nav>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import AgendaMiniMonth from '@/components/agenda/AgendaMiniMonth.vue'
import { PALETTE, textOn } from '@/components/agenda/agendaColors'

const props = defineProps({
  calendars: { type: Array, default: () => [] },
  selected: { type: String, required: true },
  today: { type: String, required: true },
  range: { type: Array, default: null },
  busyDates: { type: Array, default: () => [] },
  weekStartsOn: { type: Number, default: 1 },
  locale: { type: String, default: undefined },
  canCreate: { type: Boolean, default: false },
  canCreateTask: { type: Boolean, default: false },
  sync: { type: Object, default: null },
})
const emit = defineEmits([
  'create',
  'pick',
  'toggle',
  'only',
  'color',
  'settings',
])

const createMenu = ref(false)
const menu = ref('')
const collapsed = reactive({ mine: false, other: false })
const groups = computed(() =>
  [
    {
      key: 'mine',
      label: __('My calendars'),
      rows: props.calendars.filter((row) => row.group === 'mine'),
    },
    {
      key: 'other',
      label: __('Other calendars'),
      rows: props.calendars.filter((row) => row.group !== 'mine'),
    },
  ].filter((group) => group.rows.length || group.key === 'other'),
)
const syncTitle = computed(() => {
  const google = props.sync?.google
  if (google?.connected && google?.authorized)
    return __('Google Calendar connected')
  return __('Connect Google, Outlook or Apple')
})
const syncHint = computed(() => {
  const google = props.sync?.google
  if (google?.connected && google?.authorized)
    return __('Sync, subscribe and settings')
  return __('Two-way sync or a subscription link')
})
function pickCreate(kind) {
  createMenu.value = false
  emit('create', kind)
}
function only(key) {
  menu.value = ''
  emit('only', key)
}
function pickColor(key, hex) {
  emit('color', key, hex)
}
function outside(event) {
  if (
    !event.target.closest?.('.ag-menu, .ag-side__createbtn, .ag-side__rowmenu')
  ) {
    createMenu.value = false
    menu.value = ''
  }
}
onMounted(() => window.addEventListener('pointerdown', outside, true))
onBeforeUnmount(() => window.removeEventListener('pointerdown', outside, true))
</script>
<style scoped>
.ag-side {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px 24px 8px;
}
.ag-side__create {
  position: relative;
  padding-left: 4px;
}
.ag-side__createbtn {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  height: 56px;
  padding: 0 18px 0 16px;
  border-radius: 16px;
  background: var(--surface-elevation-2, var(--surface-base));
  color: var(--ink-gray-9);
  font-size: 14px;
  font-weight: 500;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.18),
    0 4px 10px -2px rgba(0, 0, 0, 0.18);
  transition:
    box-shadow 0.15s,
    background 0.15s;
}
.ag-side__createbtn:hover {
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.22),
    0 8px 18px -4px rgba(0, 0, 0, 0.25);
  background: var(--surface-gray-1);
}
.ag-menu {
  position: absolute;
  z-index: 60;
  top: calc(100% + 4px);
  left: 4px;
  min-width: 200px;
  padding: 6px 0;
  border-radius: 10px;
  background: var(--surface-elevation-2, var(--surface-base));
  box-shadow:
    0 10px 30px -6px rgba(0, 0, 0, 0.35),
    0 0 0 1px var(--outline-gray-1);
}
.ag-menu--right {
  left: auto;
  right: 0;
  top: 100%;
}
.ag-menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 36px;
  padding: 0 14px;
  font-size: 14px;
  text-align: left;
  color: var(--ink-gray-8);
}
.ag-menu__item:hover {
  background: var(--surface-gray-2);
}
.ag-swatches {
  display: grid;
  grid-template-columns: repeat(6, 22px);
  gap: 8px;
  padding: 8px 14px;
}
.ag-swatch {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
}
.ag-swatch:hover {
  transform: scale(1.12);
}
.ag-side__group {
  margin-top: 12px;
}
.ag-side__grouphead {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-height: 36px;
  padding: 0 8px 0 12px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink-gray-8);
}
.ag-side__grouphead:hover {
  background: var(--surface-gray-2);
}
.ag-side__list {
  display: flex;
  flex-direction: column;
}
.ag-side__row {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: 999px;
}
.ag-side__row:hover {
  background: var(--surface-gray-2);
}
.ag-side__label {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 36px;
  align-items: center;
  gap: 12px;
  padding-left: 14px;
  font-size: 14px;
  color: var(--ink-gray-8);
  cursor: pointer;
}
.ag-side__check {
  display: grid;
  place-items: center;
  flex: none;
  width: 18px;
  height: 18px;
  border: 2px solid;
  border-radius: 3px;
}
.ag-side__label:focus-within .ag-side__check {
  outline: 2px solid var(--ag-accent);
  outline-offset: 2px;
}
.ag-side__iconbtn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  color: var(--ink-gray-7);
}
.ag-side__iconbtn:hover {
  background: var(--surface-gray-3);
}
.ag-side__rowmenu {
  opacity: 0;
  margin-right: 4px;
}
.ag-side__row:hover .ag-side__rowmenu,
.ag-side__rowmenu:focus-visible {
  opacity: 1;
}
@media (pointer: coarse) {
  .ag-side__rowmenu {
    opacity: 1;
  }
}
.ag-side__sync {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 6px 12px 6px 14px;
  border-radius: 12px;
  font-size: 13px;
  color: var(--ink-gray-8);
  background: var(--surface-gray-1);
}
.ag-side__sync:hover {
  background: var(--surface-gray-2);
}
</style>
