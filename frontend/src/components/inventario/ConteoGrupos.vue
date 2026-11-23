<template>
  <!-- A product group the whole shop counts apart from the rotation: more
       often, only a sample of it, or not at all. A group's chip opens the
       three choices; none chosen is the rotation, like any other group. -->
  <section
    class="rounded-7 bg-surface-gray-1 px-4 pb-4 pt-3"
    :aria-label="__('Groups', null, CTX)"
    data-conteos-grupos
  >
    <p class="mb-1.5 text-xs font-medium text-ink-gray-6">
      {{ __('Groups', null, CTX) }}
    </p>
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="group in shown"
        :key="group"
        type="button"
        :class="chipClass(group === open)"
        :aria-expanded="String(group === open)"
        :data-grupo="group"
        @click="open = group === open ? '' : group"
      >
        {{ group }}
        <span v-if="treatments[group]" class="font-normal" data-grupo-trato>{{
          treatmentLabel(treatments[group])
        }}</span>
      </button>
      <button
        v-if="choices.length > MAX"
        type="button"
        :class="chipClass(false)"
        :aria-expanded="String(expanded)"
        data-grupos-mas
        @click="expanded = !expanded"
      >
        {{
          expanded
            ? __('Show less', null, CTX)
            : __('+{0} more', [choices.length - shown.length], CTX)
        }}
      </button>
    </div>
    <ExpandTransition>
      <ChipGroup
        v-if="open"
        class="pt-3"
        :label="open"
        :options="treatmentOptions()"
        :model-value="treatments[open] || ''"
        testid="trato"
        @update:model-value="(treatment) => setTreatment(treatment || '')"
      />
    </ExpandTransition>
    <p v-if="reason" role="alert" class="pt-1 text-sm text-ink-red-7">
      {{ reason }}
    </p>
  </section>
</template>
<script setup>
import { computed, ref } from 'vue'
import { ChipGroup, ExpandTransition, chipClass } from '@/components/ui'
import { CTX, groupChoices, treatmentLabel, treatmentOptions } from './conteos'

const props = defineProps({
  /** The page's product groups and the shop's `settings.group_rules`. */
  groups: { type: Array, default: () => [] },
  rules: { type: Array, default: () => [] },
  /** The page's refusals; a group's is under `g:<group>`. */
  errors: { type: Object, default: () => ({}) },
})
// set(group, treatment, paint(settings)): '' puts the group back in the rotation.
const emit = defineEmits(['set'])

// As the kit's chip rows: this many, then «+N más».
const MAX = 8
const open = ref('')
const expanded = ref(false)

const treatments = computed(() =>
  Object.fromEntries(props.rules.map((rule) => [rule.group, rule.treatment])),
)
// The groups with a choice lead, so what the shop decided is always in sight.
const choices = computed(() => {
  const decided = props.rules.map((rule) => rule.group)
  const all = groupChoices(props.groups, decided)
  return [
    ...all.filter((group) => treatments.value[group]),
    ...all.filter((group) => !treatments.value[group]),
  ]
})
const shown = computed(() => {
  if (expanded.value || choices.value.length <= MAX) return choices.value
  const keep = Math.max(
    MAX,
    choices.value.filter((group) => treatments.value[group]).length,
  )
  const head = choices.value.slice(0, keep)
  return open.value && !head.includes(open.value) ? [...head, open.value] : head
})
const reason = computed(() =>
  open.value ? props.errors[`g:${open.value}`] || '' : '',
)

function setTreatment(treatment) {
  const group = open.value
  emit('set', group, treatment, (settings) => {
    const rest = settings.group_rules.filter((rule) => rule.group !== group)
    settings.group_rules = treatment
      ? [...rest, { group, treatment, spot_check: 0 }]
      : rest
  })
}
</script>
