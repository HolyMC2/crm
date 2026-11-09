<template>
  <!-- What the arrangement will look like while it is being made: on the
       phone the bottom bar, on a wider screen the rail at its real size. The
       row under the pointer or the focus lights its place. A picture only:
       the list beside it is what readers and keys use. -->
  <div
    v-if="kind === 'bar'"
    class="flex items-stretch rounded-6 border border-outline-gray-1 bg-surface-base"
    aria-hidden="true"
    data-testid="layout-preview"
    data-preview="bar"
  >
    <span
      v-for="place in bar"
      :key="place.key"
      :class="[TAB, place.key === lit ? 'text-ink-gray-9' : 'text-ink-gray-6']"
      :data-preview-place="place.key"
    >
      <span class="relative flex h-7 w-12 items-center justify-center">
        <span
          v-if="place.key === lit"
          class="absolute inset-0 rounded-full bg-surface-gray-3"
        />
        <span :class="[place.icon, 'relative size-5']" />
      </span>
      <span class="block max-w-full truncate px-px tracking-tight">{{
        place.label
      }}</span>
    </span>
    <span :class="[TAB, moreLit ? 'text-ink-gray-9' : 'text-ink-gray-6']">
      <span class="relative flex h-7 w-12 items-center justify-center">
        <span
          v-if="moreLit"
          class="absolute inset-0 rounded-full bg-surface-gray-3"
        />
        <span class="lucide-menu relative size-5" />
      </span>
      <span class="block max-w-full truncate px-px tracking-tight">Más</span>
    </span>
  </div>
  <div
    v-else
    class="flex w-14 flex-none flex-col items-center gap-1 overflow-hidden rounded-6 border border-outline-gray-1 bg-surface-base py-2"
    aria-hidden="true"
    data-testid="layout-preview"
    data-preview="rail"
  >
    <span
      v-for="place in modules"
      :key="place.key"
      class="flex size-10 flex-none items-center justify-center rounded-6"
      :class="
        place.key === lit
          ? 'bg-surface-gray-3 text-ink-gray-9'
          : 'text-ink-gray-6'
      "
      :data-preview-place="place.key"
    >
      <span :class="[place.icon, 'block size-[18px]']" />
    </span>
    <span
      class="relative flex size-10 flex-none items-center justify-center rounded-6 text-ink-gray-6"
      :class="hiddenLit ? 'bg-surface-gray-3 text-ink-gray-9' : ''"
    >
      <span class="lucide-ellipsis size-[18px]" />
      <span
        v-if="hiddenCount"
        class="num absolute right-0.5 top-0.5 text-[10px] text-ink-gray-5"
        >{{ hiddenCount }}</span
      >
    </span>
    <template v-if="apps.length">
      <span class="my-1 h-px w-8 flex-none bg-outline-gray-1" />
      <span
        v-for="app in apps"
        :key="app.key"
        class="flex size-10 flex-none items-center justify-center"
        :data-preview-place="app.key"
      >
        <span
          class="flex size-8 items-center justify-center rounded-full"
          :class="
            app.key === lit
              ? 'bg-surface-gray-4 text-ink-gray-9'
              : 'bg-surface-gray-2 text-ink-gray-6'
          "
        >
          <span :class="[app.icon, 'size-[18px]']" />
        </span>
      </span>
    </template>
  </div>
</template>
<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** 'bar': the phone's bottom bar; 'rail': the desktop rail. */
  kind: { type: String, default: 'bar' },
  /** The bar's places, Hoy first. */
  bar: { type: Array, default: () => [] },
  /** Más in order, hidden places left out. */
  more: { type: Array, default: () => [] },
  /** Keys flagged hidden: they wait behind the rail's «⋯» and in Más. */
  hidden: { type: Set, default: () => new Set() },
  /** The place whose row is under the pointer or the focus. */
  lit: { type: String, default: '' },
})

const onBar = computed(() => props.bar.some((place) => place.key === props.lit))
const moreLit = computed(() => !!props.lit && !onBar.value)
const hiddenLit = computed(() => props.hidden.has(props.lit))
const hiddenCount = computed(() => props.hidden.size)
// The rail: the bar's places lead, Más follows; the other apps sit at its foot.
const placed = computed(() => [...props.bar, ...props.more])
const modules = computed(() => placed.value.filter((place) => !place.app))
const apps = computed(() => placed.value.filter((place) => place.app))

const TAB =
  'flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium max-[359px]:text-[10px]'
</script>
