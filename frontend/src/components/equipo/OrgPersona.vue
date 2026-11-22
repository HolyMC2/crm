<template>
  <!-- A person on the organigrama: whom they report to (pencil to change it),
       who reports to them, and what they can do. The puesto, the money switch
       and the limits change on their Equipo page, one tap away. -->
  <div class="space-y-5" data-testid="org-persona">
    <header class="flex items-start gap-3">
      <img
        v-if="person.image"
        :src="person.image"
        alt=""
        class="size-12 flex-none rounded-full object-cover"
      />
      <span
        v-else
        class="flex size-12 flex-none items-center justify-center rounded-full bg-surface-gray-3 text-base font-medium text-ink-gray-7"
        aria-hidden="true"
      >
        <span v-if="person.full_name">{{ initials(person.full_name) }}</span>
        <span v-else class="lucide-user-round size-5" />
      </span>
      <div class="min-w-0 flex-1">
        <h2
          class="title-face break-words text-xl font-semibold text-ink-gray-9"
          data-testid="org-persona-name"
        >
          {{ person.full_name || __('No name', null, 'Equipo') }}
        </h2>
        <p v-if="line" class="text-sm text-ink-gray-6">{{ line }}</p>
        <p v-if="todayText" class="mt-0.5 text-sm text-ink-gray-7">
          {{ todayText }}
        </p>
      </div>
    </header>

    <section :aria-label="__('Reports to')">
      <h3 class="mb-1 text-sm font-medium text-ink-gray-6">
        {{ __('Reports to') }}
      </h3>
      <div class="flex min-h-11 items-center gap-2">
        <button
          v-if="boss"
          type="button"
          class="press min-w-0 flex-1 truncate rounded-6 py-1 text-left text-base text-ink-gray-9 hover:underline"
          data-testid="org-persona-boss"
          @click="$emit('select', boss.employee)"
        >
          {{ boss.full_name || __('No name', null, 'Equipo') }}
        </button>
        <p v-else class="min-w-0 flex-1 text-base text-ink-gray-7">
          {{ bossText }}
        </p>
        <button
          v-if="person.editable"
          type="button"
          class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          :aria-label="__('Change whom {0} reports to', [shortName])"
          :title="__('Change whom {0} reports to', [shortName])"
          data-testid="org-persona-move"
          @click="$emit('move', person.employee)"
        >
          <span class="lucide-pencil size-4" aria-hidden="true" />
        </button>
      </div>
      <p v-if="chainText" class="text-sm text-ink-gray-6">{{ chainText }}</p>
      <p
        v-if="!person.editable && person.blocked"
        class="mt-1 text-sm text-ink-gray-6"
        data-testid="org-persona-blocked"
      >
        {{ person.blocked }}
      </p>
    </section>

    <section :aria-label="__('Reports to them')">
      <h3 class="mb-1 text-sm font-medium text-ink-gray-6">
        {{ __('Reports to them') }}
        <span v-if="node?.children.length" class="num">{{
          node.children.length
        }}</span>
      </h3>
      <ul
        v-if="node?.children.length"
        class="divide-y divide-outline-gray-1"
        data-testid="org-persona-team"
      >
        <li v-for="child in node.children" :key="child.employee">
          <button
            type="button"
            class="press flex min-h-11 w-full items-center justify-between gap-2 py-1 text-left text-base text-ink-gray-9 hover:underline"
            @click="$emit('select', child.employee)"
          >
            <span class="min-w-0 truncate">{{
              child.full_name || __('No name', null, 'Equipo')
            }}</span>
            <span v-if="child.total" class="num text-sm text-ink-gray-5">{{
              child.total
            }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="text-base text-ink-gray-7">{{ __('Nobody yet.') }}</p>
      <p v-if="below" class="mt-1 text-sm text-ink-gray-6">
        {{ __('And {0} more below them.', [below]) }}
      </p>
      <!-- Frappe opens the records under a limited user's own Employee too:
           the tree is a permission, so the card says it. -->
      <p
        v-if="person.sees_reports"
        class="mt-2 flex items-start gap-2 text-sm text-ink-gray-7"
        data-testid="org-persona-sees"
      >
        <span class="lucide-eye mt-0.5 size-4 flex-none" aria-hidden="true" />
        {{
          __(
            'Sees the employee records of whoever reports to them: attendance, leave and advances.',
          )
        }}
      </p>
    </section>

    <section :aria-label="__('Can', null, 'Equipo')">
      <h3 class="mb-1 text-sm font-medium text-ink-gray-6">
        {{ __('Can', null, 'Equipo') }}
      </h3>
      <div v-if="yes.length" class="flex flex-wrap gap-1.5">
        <button
          v-for="cap in yes"
          :key="cap.key"
          type="button"
          :class="chipClass(lens === cap.key)"
          :aria-pressed="String(lens === cap.key)"
          :title="__('See everyone who can')"
          data-testid="org-persona-cap"
          @click="$emit('lens', lens === cap.key ? '' : cap.key)"
        >
          {{ cap.label }}
        </button>
      </div>
      <p v-else class="text-base text-ink-gray-7">
        {{ __('None of these. Their puesto decides what they can do.') }}
      </p>
      <details v-if="person.can_do?.length" class="mt-3">
        <summary
          class="fold-summary press flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink-gray-7"
          data-testid="org-persona-all"
        >
          <span class="lucide-chevron-right size-4" aria-hidden="true" />
          {{ __('Everything their roles allow ({0})', [allCount]) }}
        </summary>
        <ul class="mt-2 space-y-1 text-sm text-ink-gray-8">
          <li v-for="word in person.can_do" :key="word">{{ word }}</li>
          <li v-if="person.can_do_more" class="text-ink-gray-6">
            {{ __('and {0} more permissions', [person.can_do_more]) }}
          </li>
        </ul>
      </details>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { chipClass, initials } from '@/components/ui'
import { todayLabel } from '@/composables/useEquipo'
import { chainOf, roleLine } from './organigrama'

const props = defineProps({
  person: { type: Object, required: true },
  /** The built tree's node map (buildTree().nodes). */
  nodes: { type: Object, required: true },
  /** [{ key, label }] the site's «¿Quién puede…?» questions. */
  capabilities: { type: Array, default: () => [] },
  lens: { type: String, default: '' },
})
defineEmits(['select', 'move', 'lens'])

const node = computed(() => props.nodes.get(props.person.employee))
const boss = computed(() =>
  props.person.reports_to ? props.nodes.get(props.person.reports_to) : null,
)
const line = computed(() => roleLine(props.person))
const shortName = computed(
  () => (props.person.full_name || '').split(' ')[0] || __('this person'),
)
const todayText = computed(() =>
  props.person.today ? todayLabel(props.person.today) : '',
)
const bossText = computed(() => {
  if (props.person.boss_hidden)
    return __('Someone you cannot see from your user.')
  if (props.person.boss_gone)
    return __('Someone who no longer works here. Pick who they report to now.')
  return __('Nobody: they are at the top.')
})
const chainText = computed(() => {
  const chain = chainOf(props.person.employee, props.nodes)
  return chain.length > 1
    ? chain.map((n) => n.full_name || __('No name', null, 'Equipo')).join(' › ')
    : ''
})
const below = computed(() => {
  const n = node.value
  return n ? n.total - n.children.length : 0
})
const yes = computed(() =>
  props.capabilities.filter((c) =>
    (props.person.capabilities || []).includes(c.key),
  ),
)
const allCount = computed(
  () => (props.person.can_do?.length || 0) + (props.person.can_do_more || 0),
)
</script>
