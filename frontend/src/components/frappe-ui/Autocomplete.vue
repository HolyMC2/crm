<template>
  <Combobox v-model="selectedValue" :disabled="disabled" nullable>
    <!-- The search field and the options are written once and shown in a
         panel under the field on desktop, or in a bottom sheet on a phone. -->
    <DefineSearch v-slot="{ pill }">
      <div class="relative flex items-center">
        <span
          class="lucide-search pointer-events-none absolute left-3 size-4 text-ink-gray-5"
          aria-hidden="true"
        />
        <ComboboxInput
          ref="search"
          class="w-full border-0 pl-9 pr-10 text-base text-ink-gray-9 placeholder-ink-gray-5 focus:ring-0"
          :class="
            pill
              ? 'h-11 rounded-full bg-surface-gray-2 focus:bg-surface-gray-3'
              : 'h-10 rounded-t-8 bg-transparent'
          "
          type="text"
          :value="query"
          autocomplete="off"
          enterkeyhint="search"
          :placeholder="__('Search')"
          :aria-label="searchLabel || __('Search')"
          data-autocomplete-search
          @change="
            (e) => {
              query = e.target.value
            }
          "
        />
        <span
          v-if="loading"
          role="status"
          class="absolute right-3 flex size-5 items-center justify-center"
        >
          <span
            class="lucide-loader-circle size-4 animate-spin text-ink-gray-5 motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span class="sr-only">{{ __('Searching…') }}</span>
        </span>
        <button
          v-else-if="query"
          type="button"
          class="press absolute right-1 inline-flex size-9 items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-3"
          :aria-label="__('Clear search')"
          :title="__('Clear search')"
          @click="clearQuery"
        >
          <span class="lucide-x size-4" aria-hidden="true" />
        </button>
      </div>
    </DefineSearch>

    <DefineOptions v-slot="{ roomy }">
      <ComboboxOptions
        class="overflow-y-auto overscroll-contain"
        :class="roomy ? 'px-2 pb-2' : 'max-h-[16rem] p-1.5'"
        static
      >
        <div
          v-for="group in groups"
          v-show="group.items.length > 0"
          :key="group.key"
          class="[&+&]:mt-1.5"
        >
          <div
            v-if="group.group && !group.hideLabel"
            class="truncate px-2.5 py-1.5 text-sm-medium text-ink-gray-5"
          >
            {{ group.group }}
          </div>
          <ComboboxOption
            v-for="option in group.items.slice(0, props.maxOptions)"
            :key="option.value"
            v-slot="{ active, selected }"
            as="template"
            :value="option"
          >
            <li
              class="flex cursor-pointer items-center gap-2 text-base"
              :class="[
                roomy
                  ? 'min-h-12 rounded-8 px-3 py-2'
                  : 'min-h-8 rounded-5 px-2.5 py-1.5',
                active ? 'bg-surface-gray-3' : '',
              ]"
              :data-selected="isCurrent(option) || undefined"
            >
              <slot name="item-prefix" v-bind="{ active, selected, option }" />
              <div class="min-w-0 flex-1">
                <slot name="item-label" v-bind="{ active, selected, option }">
                  <div class="truncate text-ink-gray-7">
                    {{ option.label }}
                  </div>
                </slot>
              </div>
              <span
                v-if="isCurrent(option)"
                class="lucide-check size-4 flex-none text-ink-gray-8"
                aria-hidden="true"
              />
            </li>
          </ComboboxOption>
        </div>
        <li
          v-if="groups.length == 0"
          class="px-3 text-base text-ink-gray-5"
          :class="roomy ? 'py-4' : 'py-2'"
          data-autocomplete-empty
        >
          {{
            loading
              ? __('Searching…')
              : query
                ? __('Nothing matches «{0}».', [query])
                : __('No results found')
          }}
        </li>
      </ComboboxOptions>
    </DefineOptions>

    <Popover
      v-model:open="panelOpen"
      bare
      trigger="manual"
      match-trigger-width
      :auto-focus="false"
      :side="side"
      :align="align"
      :offset="4"
    >
      <template #trigger>
        <div class="flex w-full">
          <!-- The Popover clones its trigger and drops a ref on it: the ref sits inside. -->
          <div ref="root" class="flex w-full">
            <slot
              name="target"
              v-bind="{
                open: openPopover,
                togglePopover,
                isOpen: showOptions,
                selectedValue,
                displayValue,
                targetAttrs,
              }"
            >
              <div class="w-full">
                <button
                  v-bind="targetAttrs"
                  :aria-describedby="selectedValue ? valueId : undefined"
                  class="relative flex h-7 w-full items-center justify-between gap-2 rounded-4 px-2 py-1 transition-colors pr-7"
                  :class="inputClasses"
                  @click="() => !disabled && togglePopover()"
                >
                  <div
                    v-if="selectedValue"
                    class="flex text-base leading-5 items-center truncate"
                  >
                    <slot name="prefix" />
                    <span :id="valueId" class="truncate">
                      {{ displayValue(selectedValue) }}
                    </span>
                  </div>
                  <div
                    v-else
                    class="absolute text-ink-gray-4 text-left truncate w-full pr-7"
                  >
                    {{ placeholder || __('Choose or type to search') }}
                  </div>
                  <span
                    v-if="!disabled"
                    class="lucide-chevron-down absolute h-4 w-4 text-ink-gray-5 right-2 transition-transform motion-reduce:transition-none"
                    :class="showOptions ? 'rotate-180' : ''"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </slot>
          </div>
        </div>
      </template>
      <template #default="{ open }">
        <div
          v-show="open"
          class="flex w-[max(16rem,var(--reka-popover-trigger-width))] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-8 bg-surface-elevation-2 text-base shadow-2xl ring-1 ring-outline-elevation-2"
          data-autocomplete-panel
        >
          <div class="border-b border-outline-elevation-2">
            <ReuseSearch />
          </div>
          <ReuseOptions />
          <div
            v-if="slots.footer"
            class="border-t border-outline-elevation-2 p-1.5"
          >
            <slot name="footer" v-bind="{ value: query, close }"></slot>
          </div>
        </div>
      </template>
    </Popover>
    <!-- A phone picks in a sheet: the search on top, the rows in thumb reach.
         Inside a dialog or sheet it stays a panel (no sheet over a sheet). -->
    <BottomSheet
      v-if="sheetMounted"
      :open="sheetOpen"
      :title="title || searchLabel || __('Choose')"
      flush
      data-autocomplete-sheet
      @update:open="togglePopover"
    >
      <template #header>
        <ReuseSearch :pill="true" />
      </template>
      <ReuseOptions :roomy="true" />
      <template v-if="slots.footer" #actions>
        <slot name="footer" v-bind="{ value: query, close }"></slot>
      </template>
    </BottomSheet>
  </Combobox>
</template>

<script setup>
import { matchTokens } from '@/vendor/muelle-shell/contracts/search'
import { isMobile } from '@/components/ui/host'
import {
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
} from '@headlessui/vue'
import { createReusableTemplate } from '@vueuse/core'
import { Popover } from 'frappe-ui'
import {
  ref,
  computed,
  defineAsyncComponent,
  useAttrs,
  useSlots,
  watch,
  nextTick,
} from 'vue'

const BottomSheet = defineAsyncComponent(
  () => import('@/components/ui/BottomSheet.vue'),
)
const [DefineSearch, ReuseSearch] = createReusableTemplate()
const [DefineOptions, ReuseOptions] = createReusableTemplate()

const props = defineProps({
  id: { type: String, default: undefined },
  labelId: { type: String, default: undefined },
  searchLabel: { type: String, default: undefined },
  /** The sheet's title on a phone: the field's label. */
  title: { type: String, default: '' },
  modelValue: {
    type: String,
    default: '',
  },
  options: {
    type: Array,
    default: () => [],
  },
  /** The options are on their way (a server search): the field shows a spinner. */
  loading: { type: Boolean, default: false },
  size: {
    type: String,
    default: 'sm',
  },
  variant: {
    type: String,
    default: 'subtle',
  },
  placeholder: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  filterable: {
    type: Boolean,
    default: true,
  },
  placement: {
    type: String,
    default: 'bottom-start',
  },
  maxOptions: {
    type: Number,
    default: 20,
  },
})
const emit = defineEmits(['update:modelValue', 'update:query', 'change'])

const query = ref('')
const showOptions = ref(false)
const search = ref(null)
const root = ref(null)
const valueId = computed(() => (props.id ? `${props.id}-value` : undefined))
const targetAttrs = computed(() => ({
  id: props.id,
  type: 'button',
  disabled: props.disabled,
  'aria-labelledby': props.labelId,
  'aria-haspopup': 'listbox',
  'aria-expanded': showOptions.value,
  onKeydown: onTriggerKeydown,
}))

// Where this open shows: a sheet on a phone, unless the field already sits in
// a dialog or a sheet; a panel under the field everywhere else.
const inSheet = ref(false)
const sheetMounted = ref(false)
const panelOpen = computed({
  get: () => showOptions.value && !inSheet.value,
  set: (open) => togglePopover(open),
})
const sheetOpen = computed(() => showOptions.value && inSheet.value)

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) showOptions.value = false
  },
)

const attrs = useAttrs()
const slots = useSlots()

const valuePropPassed = computed(() => 'value' in attrs)

const selectedValue = computed({
  get() {
    return valuePropPassed.value ? attrs.value : props.modelValue
  },
  set(val) {
    query.value = ''
    if (val) {
      showOptions.value = false
    }
    emit(valuePropPassed.value ? 'change' : 'update:modelValue', val)
  },
})

function close() {
  showOptions.value = false
}

function openPopover() {
  togglePopover(true)
}

function togglePopover(flag) {
  if (flag instanceof Event) flag = undefined
  const open = flag == null ? !showOptions.value : Boolean(flag)
  if (open && !showOptions.value) {
    inSheet.value = isMobile.value && !root.value?.closest('[role="dialog"]')
    if (inSheet.value) sheetMounted.value = true
  }
  showOptions.value = open
}

// Typing on the closed field starts the search with that letter, so a worker
// who tabs in and types never has to click first. The arrows open the list.
function onTriggerKeydown(event) {
  if (props.disabled || event.isComposing) return
  const typed =
    event.key.length === 1 &&
    event.key !== ' ' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  if (typed) {
    event.preventDefault()
    // Keys typed before the search field takes focus add up, not replace.
    query.value = showOptions.value ? query.value + event.key : event.key
    togglePopover(true)
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    togglePopover(true)
  }
}

function clearQuery() {
  query.value = ''
  focusSearch()
}

// The search field mounts with the panel or sheet (the sheet loads on its
// first open, and takes focus itself), so focus follows it for a few frames.
function focusSearch(frames = 30) {
  const input = search.value?.el ?? search.value?.$el
  if (input?.isConnected) {
    if (input.value !== query.value) input.value = query.value
    if (document.activeElement !== input) {
      input.focus({ preventScroll: true })
      const end = input.value.length
      input.setSelectionRange?.(end, end)
    }
  }
  if (showOptions.value && frames > 0 && (!input?.isConnected || frames > 25))
    requestAnimationFrame(() => focusSearch(frames - 1))
}

// `placement` ("bottom-start", "top-end"…) is this component's prop; frappe-ui
// 1.0's Popover takes the two halves.
const side = computed(() => props.placement.split('-')[0])
const align = computed(() => props.placement.split('-')[1] || 'start')

const groups = computed(() => {
  if (!props.options || props.options.length == 0) return []

  let groups = props.options[0]?.group
    ? props.options
    : [{ group: '', items: props.options }]

  return groups
    .map((group, i) => {
      return {
        key: i,
        group: group.group,
        hideLabel: group.hideLabel || false,
        items: props.filterable ? filterOptions(group.items) : group.items,
      }
    })
    .filter((group) => group.items.length > 0)
})

function filterOptions(options) {
  if (!query.value) {
    return options
  }
  // Muelle: the shell's search rule (any word order, accent-blind)
  return options.filter((option) =>
    matchTokens(
      query.value,
      String(option.label ?? ''),
      String(option.value ?? ''),
    ),
  )
}

function isCurrent(option) {
  const current = selectedValue.value
  if (current == null || current === '') return false
  return (current?.value ?? current) === option.value
}

function displayValue(option) {
  if (typeof option === 'string') {
    let allOptions = groups.value.flatMap((group) => group.items)
    let selectedOption = allOptions.find((o) => o.value === option)
    return selectedOption?.label || option
  }
  return option?.label
}

watch(query, (q) => {
  emit('update:query', q)
})

watch(showOptions, (val) => {
  if (val) return nextTick(() => focusSearch())
  query.value = ''
  restoreFocus()
})

// A pick or Esc gives focus back to the field once the picker is gone, so
// Tab goes on to the next field.
function restoreFocus(frames = 30) {
  const active = document.activeElement
  if (!active || active === document.body) {
    root.value
      ?.querySelector('button, [tabindex]')
      ?.focus({ preventScroll: true })
  } else if (
    frames > 0 &&
    active.closest('[data-autocomplete-panel], [data-ui-sheet]')
  ) {
    requestAnimationFrame(() => restoreFocus(frames - 1))
  }
}

const textColor = computed(() => {
  return props.disabled ? 'text-ink-gray-5' : 'text-ink-gray-8'
})

const inputClasses = computed(() => {
  let sizeClasses = {
    sm: 'text-base rounded-4 h-7',
    md: 'text-base rounded-4 h-8',
    lg: 'text-lg rounded-5 h-10',
    xl: 'text-2xl rounded-5 h-10',
  }[props.size]

  let paddingClasses = {
    sm: 'py-1.5 px-2',
    md: 'py-1.5 px-2.5',
    lg: 'py-1.5 px-3',
    xl: 'py-1.5 px-3',
  }[props.size]

  let variant = props.disabled ? 'disabled' : props.variant
  let variantClasses = {
    subtle:
      'border border-[--surface-gray-2] bg-surface-gray-2 placeholder-ink-gray-4 hover:border-outline-elevation-2 hover:bg-surface-gray-3 focus:bg-surface-base focus:border-outline-gray-4 focus:ring-0 focus-visible:ring-2 focus-visible:ring-outline-gray-3',
    outline:
      'border border-outline-gray-2 bg-surface-base placeholder-ink-gray-4 hover:border-outline-gray-3 hover:shadow-sm focus:bg-surface-base focus:border-outline-gray-4 focus:ring-0 focus-visible:ring-2 focus-visible:ring-outline-gray-3',
    disabled: [
      'border bg-surface-sidebar placeholder-ink-gray-3',
      props.variant === 'outline'
        ? 'border-outline-gray-2'
        : 'border-transparent',
    ],
  }[variant]

  return [
    sizeClasses,
    paddingClasses,
    variantClasses,
    textColor.value,
    'transition-colors w-full',
  ]
})

defineExpose({ query })
</script>
