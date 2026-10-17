<template>
  <!-- One search dialog, two modes (Muelle keyboard standard): ⌘K / Ctrl+K
       «Buscar o ir a…» and ⌘G / Ctrl+G «Buscar registros». The other key or
       chip switches modes here and keeps the typed text. -->
  <div
    ref="dialog"
    class="fixed inset-0 z-50 flex justify-center sm:items-start sm:pt-[12vh]"
    role="dialog"
    aria-modal="true"
    data-shell-layer="palette"
    :data-mode="activeMode"
    :aria-label="__('Command palette')"
  >
    <div class="absolute inset-0 bg-black/30" @click="close" />
    <div
      class="relative flex h-full w-full flex-col bg-surface-base sm:h-auto sm:max-h-[70vh] sm:w-[640px] sm:rounded-xl sm:shadow-2xl"
    >
      <div
        class="flex items-center gap-1.5 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] sm:pt-2"
        role="group"
        :aria-label="__('Search')"
      >
        <button
          v-for="chip in chips"
          :key="chip.mode"
          type="button"
          class="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm"
          :class="
            chip.mode === activeMode
              ? 'bg-surface-gray-3 font-semibold text-ink-gray-9'
              : 'text-ink-gray-7 hover:bg-surface-gray-2'
          "
          :aria-pressed="chip.mode === activeMode"
          :aria-keyshortcuts="chip.aria"
          :data-palette-mode="chip.mode"
          @click="setMode(chip.mode)"
        >
          {{ chip.label }}
          <kbd
            class="hidden rounded border border-outline-gray-2 px-1 font-sans text-xs font-normal text-ink-gray-6 sm:inline"
            >{{ chip.key }}</kbd
          >
        </button>
      </div>
      <div class="flex items-center gap-2 border-b border-outline-gray-1 px-4">
        <span
          class="lucide-search size-5 flex-none text-ink-gray-6"
          aria-hidden="true"
        />
        <input
          ref="input"
          v-model="raw"
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          class="min-h-14 min-w-0 flex-1 border-0 bg-transparent text-base text-ink-gray-9 placeholder-ink-gray-5 focus:ring-0 [&::-webkit-search-cancel-button]:hidden"
          :placeholder="placeholder"
          :aria-label="placeholder"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="flat.length > 0"
          aria-controls="muelle-palette-results"
          :aria-activedescendant="
            flat[cursor] ? `palette-item-${cursor}` : undefined
          "
        />
        <button
          class="flex size-11 flex-none items-center justify-center rounded-lg text-sm text-ink-gray-6"
          :aria-label="__('Close')"
          @click="close"
        >
          <span class="hidden sm:inline">Esc</span>
          <span class="lucide-x size-5 sm:hidden" aria-hidden="true" />
        </button>
      </div>
      <div
        id="muelle-palette-results"
        role="listbox"
        class="min-h-0 flex-1 overflow-y-auto py-2"
      >
        <template v-for="section in sections" :key="section.group">
          <div class="px-4 pb-1 pt-3 text-sm font-semibold text-ink-gray-6">
            {{ shellT(PALETTE_GROUP_LABELS[section.group]) }}
          </div>
          <button
            v-for="item in section.items"
            :id="`palette-item-${flat.indexOf(item)}`"
            :key="(item.source || '') + item.id"
            role="option"
            tabindex="-1"
            :aria-selected="flat.indexOf(item) === cursor"
            class="flex min-h-12 w-full items-center gap-3 px-4 text-left"
            :class="flat.indexOf(item) === cursor ? 'bg-surface-gray-2' : ''"
            @mousemove="cursor = flat.indexOf(item)"
            @click="choose(item)"
          >
            <span
              :class="[
                item.icon || 'lucide-circle-dot',
                'size-4 flex-none text-ink-gray-6',
              ]"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm text-ink-gray-9">{{
                item.title
              }}</span>
              <span
                v-if="item.subtitle"
                class="block truncate text-xs text-ink-gray-6"
                >{{ item.subtitle }}</span
              >
            </span>
            <kbd
              v-if="keyShown(item)"
              class="hidden flex-none rounded border border-outline-gray-2 px-1.5 font-sans text-xs text-ink-gray-6 sm:inline"
              >{{ keyLabel(item.shortcut) }}</kbd
            >
            <span
              v-if="item.external || item.scanPick || item.desk"
              class="lucide-arrow-up-right size-3.5 flex-none text-ink-gray-5"
              :title="__('Opens in another app')"
              aria-hidden="true"
            />
          </button>
        </template>
        <p
          v-if="searching"
          role="status"
          class="px-4 py-2 text-sm text-ink-gray-6"
        >
          {{ __('Searching…') }}
        </p>
        <p
          v-else-if="query.kind !== 'empty' && !flat.length"
          class="px-4 py-6 text-center text-sm text-ink-gray-6"
        >
          {{ __('Nothing matches «{0}».', [query.text]) }}
        </p>
      </div>
      <div
        class="hidden border-t border-outline-gray-1 px-4 py-2 text-xs text-ink-gray-6 sm:block"
        data-testid="palette-footer"
      >
        {{ shellT(PALETTE_FOOTER) }}
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { openAssistant } from '@/components/assistant/useAssistant'
import { useRouter } from 'vue-router'
import {
  PALETTE_DEBOUNCE_MS,
  PALETTE_FOOTER,
  PALETTE_GROUP_LABELS,
  PALETTE_MODES,
  PALETTE_MODE_COPY,
  PALETTE_MODE_KEYS,
  federatedSearch,
  groupPaletteItems,
  parsePaletteQuery,
  providersFor,
  SHELL_MODULES,
  pushRecent,
  safeReturn,
} from '@/vendor/muelle-shell/contracts'
import {
  moduleKeyFor,
  shellBoot,
  shellModules,
} from '@/composables/muelleShell'
import { scanPickHref, siblingHref } from '@/composables/shellRail'
import {
  createShellProviders,
  loadRecent,
  resolveRecent,
  saveRecent,
  toRecentRef,
} from '@/utils/shellPalette'
import { useShellTheme } from '@/composables/shellTheme'
import { runRecordAction } from '@/composables/recordActions'
import {
  ariaKeys,
  keyLabel,
  openShortcutSheet,
  pageShortcuts,
  shellCreate,
  shellKeymap,
  shellT,
  useShellLayer,
} from '@/composables/shellKeyboard'

const props = defineProps({
  modelValue: Boolean,
  /** 'all' (⌘K «Buscar o ir a…») or 'records' (⌘G «Buscar registros»). */
  mode: { type: String, default: 'all' },
  /** Bumped when the open dialog's key is pressed again: refocus the input. */
  focusKey: { type: Number, default: 0 },
})
const emit = defineEmits(['update:modelValue', 'update:mode'])
const router = useRouter()
const { setTheme } = useShellTheme()
const dialog = ref(null)
const input = ref(null)
const raw = ref('')
const cursor = ref(0)
const states = ref([])
const searching = ref(false)
let recentRefs = loadRecent()
// Shown only once the server confirms read access to each record.
const recent = ref([])
resolveRecent(recentRefs, shellBoot.value).then((items) => {
  if (items === null) return
  recent.value = items
  recentRefs = items.map(toRecentRef)
  saveRecent(recentRefs)
})
const providers = createShellProviders({
  boot: shellBoot,
  modules: shellModules,
})
const activeMode = computed(() =>
  PALETTE_MODES.includes(props.mode) ? props.mode : 'all',
)
// «Todo»: the catalog's bare «All» is «Todos» (contract copy for es, else a context).
const chips = computed(() =>
  PALETTE_MODES.map((value) => ({
    mode: value,
    label:
      value === 'all'
        ? shellT(PALETTE_MODE_COPY[value].chip, [], 'Palette mode')
        : shellT(PALETTE_MODE_COPY[value].chip),
    key: keyLabel(PALETTE_MODE_KEYS[value]),
    aria: ariaKeys(PALETTE_MODE_KEYS[value]),
  })),
)
// A row shows its key only when the shell answers it everywhere (go-to, Alt+H);
// «c» only on the create action of the module the worker is in (what «c» runs).
const answered = computed(
  () =>
    new Set(
      shellKeymap(shellModules.value)
        .filter((shortcut) => shortcut.context === 'global')
        .flatMap((shortcut) => shortcut.keys),
    ),
)
function keyShown(item) {
  if (item.shortcut === 'c') return shellCreate.value?.id === item.id
  // A record action's key: only while the page answers it (keyed and enabled).
  if (item.action === 'record')
    return pageShortcuts.value.extra.some(
      (shortcut) =>
        shortcut.id === `record.${item.args?.id}` &&
        shortcut.keys.includes(item.shortcut),
    )
  return answered.value.has(item.shortcut)
}
const placeholder = computed(() =>
  shellT(PALETTE_MODE_COPY[activeMode.value].placeholder),
)
const query = computed(() => parsePaletteQuery(raw.value))
// Records mode shows Registros, plus Recientes while the input is empty. A
// typed query ranks the records (a deal, a customer) above «Nuevo …»; an empty
// input opens on Recientes and the modules to go to.
const SECTION_ORDER = {
  empty: ['recientes', 'ir_a', 'registros', 'acciones'],
  typed: ['registros', 'acciones', 'ir_a', 'recientes'],
}
const sections = computed(() => {
  const empty = query.value.kind === 'empty'
  const grouped = empty
    ? groupPaletteItems(
        [
          ...states.value,
          { key: 'recent', label: '', status: 'done', items: recent.value },
        ],
        activeMode.value,
      )
    : groupPaletteItems(states.value, activeMode.value)
  const order = SECTION_ORDER[empty ? 'empty' : 'typed']
  const rank = (group) => {
    const index = order.indexOf(group)
    return index < 0 ? order.length : index
  }
  return [...grouped].sort((a, b) => rank(a.group) - rank(b.group))
})
const flat = computed(() => sections.value.flatMap((section) => section.items))

let timer = null
let controller = null
watch(
  [raw, activeMode],
  () => {
    clearTimeout(timer)
    controller?.abort()
    timer = setTimeout(
      run,
      query.value.kind === 'empty' ? 0 : PALETTE_DEBOUNCE_MS,
    )
  },
  { immediate: true },
)
async function run() {
  controller = new AbortController()
  const signal = controller.signal
  searching.value = true
  const answering = providersFor(
    providers,
    query.value,
    'contactos',
    activeMode.value,
  )
  await federatedSearch(answering, query.value, {
    signal,
    onUpdate(next) {
      states.value = next
      searching.value = next.some((state) => state.status === 'slow')
    },
  })
  if (!signal.aborted) {
    searching.value = false
    cursor.value = 0
  }
}

function close() {
  emit('update:modelValue', false)
}
function focusInput() {
  nextTick(() => input.value?.focus())
}
function setMode(next) {
  if (next !== activeMode.value) emit('update:mode', next)
  focusInput()
}
function choose(item) {
  if (!item) return
  const reference = toRecentRef(item)
  if (reference) {
    recentRefs = pushRecent(recentRefs, reference).map(toRecentRef)
    saveRecent(recentRefs)
  }
  if (item.action === 'theme') setTheme(item.args?.theme)
  const href = item.href && safeReturn(`/crm${item.href}`, ['/crm/'])
  // Sibling apps (Escáner, POS…) open with «Volver a …» back to this page.
  const external = item.scanPick
    ? scanPickHref(
        router.currentRoute.value.fullPath,
        moduleLabelFor(router.currentRoute.value),
      )
    : item.external && siblingTarget(item.external)
  // A Desk form (Inmobiliaria's records) opens in this tab; Desk takes no way back.
  const desk = item.desk && safeReturn(item.desk, ['/desk/'])
  close()
  // The sheet returns the focus to whatever had it before the palette opened.
  if (item.action === 'shortcuts') openShortcutSheet(previousFocus)
  // The record's action runs once the palette is gone (its focus restored).
  if (item.action === 'record') nextTick(() => runRecordAction(item.args?.id))
  // «Preguntar a Muelle»: the sheet opens over this screen and asks.
  if (item.action === 'assistant')
    nextTick(() => openAssistant({ text: item.args?.text, send: true }))
  if (href) router.push(href.replace(/^\/crm/, ''))
  else if (external) window.location.assign(external)
  else if (desk) window.location.assign(desk)
}
function siblingTarget(path) {
  if (!safeReturn(path)) return null
  const current = router.currentRoute.value
  return siblingHref({ path }, current.fullPath, moduleLabelFor(current))
}
function moduleLabelFor(route) {
  const key = moduleKeyFor(route)
  return SHELL_MODULES.find((module) => module.key === key)?.label
}
// Esc, ↑↓ and ↵ answer wherever the focus is while the palette is open; Tab
// stays inside it (shell layer). A focused chip or button takes its own ↵.
function onKeydown(event) {
  if (event.isComposing) return
  const focused = document.activeElement
  if (event.key === 'Escape') close()
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const step = event.key === 'ArrowDown' ? 1 : -1
    cursor.value = Math.max(
      0,
      Math.min(cursor.value + step, flat.value.length - 1),
    )
    if (focused !== input.value) focusInput()
  } else if (event.key === 'Enter') {
    if (
      focused !== input.value &&
      dialog.value?.contains(focused) &&
      focused.matches('button, a[href]')
    )
      return
    choose(flat.value[cursor.value])
  } else return
  event.preventDefault()
  event.stopPropagation()
}
useShellLayer(dialog, { onKeydown })
const previousFocus = document.activeElement
watch(() => props.focusKey, focusInput)
onMounted(focusInput)
onBeforeUnmount(() => {
  controller?.abort()
  clearTimeout(timer)
  previousFocus?.focus?.()
})
</script>
