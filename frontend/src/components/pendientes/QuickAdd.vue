<template>
  <!-- Quick add (Shell-S8): one line, Enter adds. The day, time, person,
       repeat and star come out of the words as chips the worker can drop
       (×) or correct (tap: the full editor, prefilled). On the phone it rises
       over the command bar from the + and stays open for the next one. -->
  <Transition :name="docked ? 'qa-rise' : ''">
    <div
      v-if="!docked || open"
      :class="
        docked
          ? 'fixed inset-x-0 bottom-0 z-50 border-t border-outline-gray-1 bg-surface-base px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-2xl'
          : 'px-4 pb-2 pt-1 sm:px-6'
      "
      data-quick-add
    >
      <form class="space-y-2" @submit.prevent="submit">
        <div
          class="flex min-h-12 items-center gap-1 rounded-full border border-transparent bg-surface-gray-2 pl-4 pr-1 focus-within:border-outline-gray-3 focus-within:bg-surface-base"
        >
          <Icon
            icon="plus"
            class="size-5 shrink-0 text-ink-gray-5"
            aria-hidden="true"
          />
          <input
            ref="input"
            v-model="text"
            type="text"
            enterkeyhint="done"
            autocomplete="off"
            maxlength="400"
            class="h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-0"
            :placeholder="placeholder"
            :aria-label="__('Add a pendiente')"
            :aria-describedby="tokens.length ? chipsId : undefined"
            data-quick-add-input
            @keydown.esc.prevent="close"
          />
          <button
            type="button"
            class="press flex size-10 shrink-0 items-center justify-center rounded-full text-ink-gray-6 [@media(hover:hover)]:hover:bg-surface-gray-3"
            :aria-label="__('More details')"
            :title="__('More details')"
            @click="$emit('details', parsed)"
          >
            <Icon icon="sliders-horizontal" class="size-5" aria-hidden="true" />
          </button>
          <button
            type="submit"
            class="press flex size-10 shrink-0 items-center justify-center rounded-full transition-colors duration-150"
            :class="
              parsed.title
                ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                : 'text-ink-gray-4'
            "
            :disabled="!parsed.title"
            :aria-label="__('Add')"
            :title="__('Add')"
          >
            <Icon icon="arrow-up" class="size-5" aria-hidden="true" />
          </button>
        </div>
        <!-- What the words say, as chips: × gives the words back to the title. -->
        <div
          v-if="tokens.length || suggestions.length"
          :id="chipsId"
          class="flex flex-wrap items-center gap-1.5 px-1"
          role="group"
          :aria-label="__('What we understood')"
          data-quick-add-chips
        >
          <span
            v-for="chip in tokens"
            :key="chip.key + chip.kind"
            class="qa-chip inline-flex min-h-8 items-center rounded-full text-sm"
            :class="
              chip.unknown
                ? 'bg-surface-amber-1 text-ink-amber-9'
                : 'bg-surface-gray-2 text-ink-gray-8'
            "
          >
            <button
              type="button"
              class="flex min-h-8 items-center gap-1.5 pl-2.5 pr-1"
              :title="__('Change')"
              @click="$emit('details', parsed)"
            >
              <Icon :icon="chip.icon" class="size-3.5" aria-hidden="true" />
              <span class="num">{{ chip.label }}</span>
            </button>
            <button
              type="button"
              class="flex size-8 items-center justify-center rounded-full text-ink-gray-5"
              :aria-label="__('Keep «{0}» as words', [chip.text])"
              @click="drop(chip)"
            >
              <Icon icon="x" class="size-3.5" aria-hidden="true" />
            </button>
          </span>
          <!-- «@ol»: the coworkers it could be, one tap completes the name. -->
          <button
            v-for="person in suggestions"
            :key="person.user"
            type="button"
            class="press inline-flex min-h-8 items-center gap-1.5 rounded-full border border-outline-gray-2 px-2.5 text-sm text-ink-gray-8"
            @click="mention(person)"
          >
            <Icon icon="user" class="size-3.5" aria-hidden="true" />
            {{ person.name }}
          </button>
        </div>
      </form>
    </div>
  </Transition>
  <Transition name="fade">
    <div
      v-if="docked && open"
      class="fixed inset-0 z-40 bg-black/20"
      aria-hidden="true"
      @click="close"
    />
  </Transition>
</template>
<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import Icon from '@/components/Icon.vue'
import { createValues, fold, parseQuickAdd } from '@/utils/quickAdd'
import {
  dayHeading,
  pendientesApi,
  priorityLabel,
  repeatLabel,
} from '@/composables/usePendientes'

const props = defineProps({
  today: { type: String, default: '' },
  me: { type: String, default: '' },
  /** Phone: fixed over the command bar while `open`. Desk: inline at the top. */
  docked: { type: Boolean, default: false },
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['add', 'details', 'update:open'])
const chipsId = `qa-chips-${Math.random().toString(36).slice(2, 8)}`
const input = ref(null)
const text = ref('')
const ignore = ref([])
const people = ref([])

const placeholder = computed(() =>
  __('Add a pendiente: «Call Olga tomorrow 5pm»'),
)
const parsed = computed(() =>
  parseQuickAdd(text.value, {
    today: props.today,
    people: people.value,
    ignore: ignore.value,
  }),
)

// A chip per detail understood, in the order typed.
const tokens = computed(() => {
  const value = parsed.value
  return value.tokens.map((token) => {
    const chip = { ...token, icon: 'calendar', label: token.text }
    if (token.kind === 'date') chip.label = dayHeading(value.date, props.today)
    else if (token.kind === 'time') {
      chip.icon = 'clock'
      chip.label = value.time
    } else if (token.kind === 'repeat') {
      chip.icon = 'repeat'
      chip.label = repeatLabel(value.repeat)
    } else if (token.kind === 'priority') {
      chip.icon = 'star'
      chip.label =
        value.priority === 'High'
          ? __('Starred')
          : __('Priority: {0}', [priorityLabel(value.priority).toLowerCase()])
    } else if (token.kind === 'person') {
      chip.icon = 'user'
      chip.unknown = !value.person
      chip.label = value.person
        ? value.person.user === props.me
          ? __('For me')
          : __('For {0}', [value.person.name])
        : __('Who is @{0}?', [value.mention])
    }
    return chip
  })
})

// Coworkers for «@…»: asked as the worker types, kept for the next ones.
let peopleTimer = 0
watch(
  () => parsed.value.mention,
  (mention) => {
    clearTimeout(peopleTimer)
    if (!mention && people.value.length) return
    if (!text.value.includes('@')) return
    peopleTimer = setTimeout(async () => {
      try {
        const response = await pendientesApi('people', { search: mention })
        const known = new Map(people.value.map((p) => [p.user, p]))
        for (const person of response?.rows || []) known.set(person.user, person)
        people.value = [...known.values()]
      } catch {
        /* the chip keeps asking who it is */
      }
    }, 200)
  },
)
const suggestions = computed(() => {
  const value = parsed.value
  if (!value.mention || value.person) return []
  const wanted = fold(value.mention)
  return people.value
    .filter((person) =>
      fold(person.name)
        .split(/\s+/)
        .some((word) => word.startsWith(wanted)),
    )
    .slice(0, 4)
})
function mention(person) {
  const first = person.name.split(/\s+/)[0]
  text.value = text.value.replace(
    `@${parsed.value.mention}`,
    `@${first}`,
  )
  input.value?.focus()
}

function drop(chip) {
  ignore.value = [...ignore.value, chip.key]
  input.value?.focus()
}
// Words typed again after a chip was dropped are read again.
watch(text, (value) => {
  if (!value) ignore.value = []
})

function submit() {
  const value = parsed.value
  if (!value.title) return
  emit('add', { values: createValues(value, { me: props.me }), parsed: value })
  text.value = ''
  ignore.value = []
  // Rapid entry: the field stays ready for the next one.
  input.value?.focus()
}
function close() {
  emit('update:open', false)
}
function focus() {
  input.value?.focus()
}
/** The editor gave the line back (closed without saving): keep typing. */
function restore(value) {
  text.value = value || ''
  nextTick(focus)
}
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen || !props.docked) return
    await nextTick()
    focus()
  },
)
defineExpose({ focus, restore, text })
</script>
<style scoped>
.qa-rise-enter-active {
  transition:
    transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 200ms ease-out;
}
.qa-rise-leave-active {
  transition:
    transform 140ms ease-in,
    opacity 140ms ease-in;
}
.qa-rise-enter-from,
.qa-rise-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
.qa-chip {
  animation: qa-in 140ms ease-out;
}
@keyframes qa-in {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
}
@media (prefers-reduced-motion: reduce) {
  .qa-rise-enter-active,
  .qa-rise-leave-active {
    transition: opacity 120ms;
  }
  .qa-rise-enter-from,
  .qa-rise-leave-to {
    transform: none;
  }
  .qa-chip {
    animation: none;
  }
}
</style>
