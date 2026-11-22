<template>
  <!-- One person on the organigrama and, folded or open, the people who
       report to them. The whole row is the tap (their card); the chevron
       folds the branch. With a mouse a row the reader may move drags onto
       another person. -->
  <li
    v-if="!visible || visible.has(node.employee)"
    class="org-node"
    :data-employee="node.employee"
  >
    <div
      class="flex min-h-14 items-center gap-1 rounded-8 pr-2"
      :class="rowClass"
      :draggable="dragOn && node.editable ? 'true' : undefined"
      @dragstart="onDragStart"
      @dragend="drag.end()"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <button
        v-if="kids.length"
        type="button"
        class="press flex size-8 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
        :aria-expanded="String(isOpen)"
        :aria-label="
          isOpen
            ? __('Fold the team of {0}', [name])
            : __('Show the team of {0}', [name])
        "
        :title="
          isOpen
            ? __('Fold the team of {0}', [name])
            : __('Show the team of {0}', [name])
        "
        @click="toggle"
      >
        <span
          :class="isOpen ? 'lucide-chevron-down' : 'lucide-chevron-right'"
          class="size-4"
          aria-hidden="true"
        />
      </button>
      <span v-else class="size-8 flex-none" aria-hidden="true" />
      <button
        type="button"
        class="press flex min-w-0 flex-1 items-center gap-3 rounded-8 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
        :aria-current="selected === node.employee ? 'true' : undefined"
        data-testid="org-row"
        @click="$emit('select', node.employee)"
      >
        <span class="relative flex-none">
          <img
            v-if="node.image"
            :src="node.image"
            alt=""
            class="size-9 rounded-full object-cover"
            loading="lazy"
          />
          <span
            v-else
            class="flex size-9 items-center justify-center rounded-full bg-surface-gray-3 text-sm font-medium text-ink-gray-7"
            aria-hidden="true"
          >
            <span v-if="initials">{{ initials }}</span>
            <span v-else class="lucide-user-round size-4" />
          </span>
          <span
            v-if="dot"
            :class="dot"
            class="org-dot absolute -bottom-0.5 -right-0.5 size-3 rounded-full"
            aria-hidden="true"
          />
        </span>
        <span class="min-w-0 flex-1">
          <span
            class="block truncate text-base font-medium text-ink-gray-9"
            data-testid="org-name"
            >{{ name }}</span
          >
          <span
            v-if="line"
            class="block truncate text-sm text-ink-gray-6"
            data-testid="org-line"
            >{{ line }}</span
          >
        </span>
        <span
          v-if="lens && lens.has(node.employee)"
          class="org-yes lucide-check size-4 flex-none"
          :aria-label="__('Yes', null, 'Equipo')"
          role="img"
        />
        <span
          v-if="node.total"
          class="num flex-none text-sm text-ink-gray-5"
          :title="
            __('{0} people report to them, directly or below', [node.total])
          "
          >{{ node.total }}</span
        >
      </button>
    </div>
    <ul v-if="kids.length && isOpen" class="org-branch">
      <OrgNode
        v-for="child in kids"
        :key="child.employee"
        :node="child"
        :visible="visible"
        :lens="lens"
        :selected="selected"
        :folded="folded"
        :drag="drag"
        :drag-on="dragOn"
        @select="(e) => $emit('select', e)"
        @toggle="(e) => $emit('toggle', e)"
      />
    </ul>
  </li>
</template>

<script setup>
import { computed } from 'vue'
import { initials as initialsOf } from '@/components/ui'
import { roleLine, todayDot } from './organigrama'

const props = defineProps({
  node: { type: Object, required: true },
  /** Set of employees the search keeps; null shows everyone. */
  visible: { type: Object, default: null },
  /** Set of employees the lens answers yes for; null: no lens. */
  lens: { type: Object, default: null },
  selected: { type: String, default: '' },
  /** Set of employees whose branch is folded. */
  folded: { type: Object, required: true },
  /** The page's drag state (useOrgDrag in EquipoOrganigrama). */
  drag: { type: Object, required: true },
  dragOn: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'toggle'])

const name = computed(() => props.node.full_name || __('No name'))
const initials = computed(() =>
  props.node.full_name ? initialsOf(props.node.full_name) : '',
)
const line = computed(() => roleLine(props.node))
const dot = computed(() => todayDot(props.node.today))
const kids = computed(() =>
  props.visible
    ? props.node.children.filter((c) => props.visible.has(c.employee))
    : props.node.children,
)
// A search opens every branch on the way to a match.
const isOpen = computed(
  () => Boolean(props.visible) || !props.folded.has(props.node.employee),
)
const rowClass = computed(() => {
  const d = props.drag
  if (d.source?.employee === props.node.employee) return 'opacity-40'
  if (d.source && d.over === props.node.employee)
    return d.allowed ? 'bg-surface-gray-2 ring-2 ring-outline-gray-4' : ''
  if (props.selected === props.node.employee) return 'bg-surface-gray-2'
  if (props.lens && !props.lens.has(props.node.employee)) return 'opacity-40'
  return 'hover:bg-surface-gray-1'
})

function toggle() {
  emit('toggle', props.node.employee)
}
function onDragStart(event) {
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', props.node.employee)
  props.drag.start(props.node)
}
function onDragOver(event) {
  if (!props.drag.source) return
  if (props.drag.hover(props.node)) event.preventDefault()
}
function onDragLeave() {
  props.drag.leave(props.node)
}
function onDrop() {
  props.drag.drop(props.node)
}
</script>

<style scoped>
/* Connectors: each branch hangs from its boss's chevron; each person's elbow
   meets their own row at its middle (the row is 56 px), and the last one
   closes the line. */
.org-branch {
  margin-left: 1rem;
}
.org-branch > .org-node {
  position: relative;
  padding-left: 1rem;
}
.org-branch > .org-node::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--outline-gray-2);
}
.org-branch > .org-node:last-child::before {
  bottom: auto;
  height: 1.75rem;
}
.org-branch > .org-node::after {
  content: '';
  position: absolute;
  left: 0;
  top: 1.75rem;
  width: 0.875rem;
  border-top: 1px solid var(--outline-gray-2);
}
.org-dot {
  box-shadow: 0 0 0 2px var(--surface-base);
}
.org-yes {
  color: var(--muelle-accent);
}
@media (max-width: 400px) {
  .org-branch > .org-node {
    padding-left: 0.5rem;
  }
  .org-branch > .org-node::after {
    width: 0.375rem;
  }
}
</style>
