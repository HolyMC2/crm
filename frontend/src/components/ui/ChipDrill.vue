<!-- Vendored from muelle/workspace/packages/ui@0.4.0 (487326036330). DO NOT EDIT: change the package, then run its scripts/vendor.mjs against this directory. -->
<!-- «Más filtros» for a search panel: one chip per long option list (stage,
     owner, source…); tapping it slides that list open under the row as more
     chips, one list at a time, on a tonal tile (container-low). -->
<template>
  <section :aria-label="label">
    <p v-if="label" class="mb-0.5 text-xs font-medium text-ink-gray-6">
      {{ label }}
    </p>
    <div class="flex flex-wrap gap-x-2">
      <button
        v-for="sec in sections"
        :key="sec.key"
        type="button"
        :class="chipClass(sec.selected.length > 0)"
        :aria-expanded="expanded === sec.key"
        :data-testid="`drill-${sec.key}`"
        @click="expanded = expanded === sec.key ? '' : sec.key"
      >
        {{ sec.label }}
        <span v-if="sec.selected.length" class="tabular-nums font-normal">{{
          sec.selected.length
        }}</span>
        <span
          class="lucide-chevron-down -mr-1 size-4 transition-transform duration-200"
          :class="expanded === sec.key ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>
    </div>
    <ExpandTransition>
      <div
        v-if="current"
        :key="current.key"
        class="mt-1 rounded-6 bg-surface-gray-1 px-3 py-1.5"
      >
        <template v-for="grp in groupsOf(current)" :key="grp.label">
          <template v-if="grp.options.length">
            <p
              v-if="grp.label"
              class="mt-1.5 text-xs text-[var(--muelle-on-surface-variant)] first:mt-0.5"
            >
              {{ grp.label }}
            </p>
            <div class="flex flex-wrap gap-x-2">
              <button
                v-for="o in grp.options"
                :key="o.value"
                type="button"
                :class="chipClass(current.selected.includes(o.value))"
                :aria-pressed="current.selected.includes(o.value)"
                @click="current.toggle(o.value)"
              >
                <span
                  v-if="o.color"
                  v-bind="dotBinding(o.color)"
                  aria-hidden="true"
                />
                {{ o.label }}
              </button>
            </div>
          </template>
        </template>
        <p
          v-if="!groupsOf(current).some((g) => g.options.length)"
          class="py-1.5 text-xs text-[var(--muelle-on-surface-variant)]"
        >
          {{ t('Sin opciones') }}
        </p>
      </div>
    </ExpandTransition>
  </section>
</template>

<script setup>
import { t } from './host'
import { computed, ref } from 'vue'
import ExpandTransition from './ExpandTransition.vue'
import { chipClass, dotBinding } from './chipClass'

const props = defineProps({
  label: { type: String, default: '' },
  // [{ key, label, selected: [], toggle(value), options?: [], groups?: [{ label, options }] }]
  sections: { type: Array, default: () => [] },
})
const expanded = ref('')
const current = computed(
  () => props.sections.find((s) => s.key === expanded.value) || null,
)
const groupsOf = (sec) => sec.groups || [{ label: '', options: sec.options }]
</script>
