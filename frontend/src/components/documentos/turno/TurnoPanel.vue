<template>
  <!-- The whole register turn under its bar (POS Opening Shift or POS Closing
       Shift): where and when it ran, tiles for what it sold and the cash, the
       other half and the handovers, then one view at a time (tickets, payment
       methods, cobros, cash movements, bags, traslados, counts, drawer opens),
       picked by chips with their counts. An open turn reads again as the
       register saves. -->
  <section class="flex flex-col gap-3" data-testid="turno-panel">
    <div
      v-if="!data && !error"
      role="status"
      aria-label="Cargando el turno…"
      class="flex flex-col gap-2 px-4"
    >
      <div class="h-5 w-2/3 animate-pulse rounded-full bg-surface-gray-2" />
      <div class="grid grid-cols-2 gap-2">
        <div
          v-for="n in 2"
          :key="n"
          class="h-[5.5rem] animate-pulse rounded-7 bg-surface-gray-2"
        />
      </div>
    </div>
    <div
      v-else-if="error && !data"
      role="alert"
      class="mx-4 flex items-center gap-3 rounded-7 bg-surface-red-1 px-4 py-3 text-base text-ink-red-7"
    >
      <span class="min-w-0 flex-1">{{ error }}</span>
      <button
        type="button"
        class="press min-h-11 rounded-full px-4 font-medium"
        @click="load()"
      >
        Reintentar
      </button>
    </div>
    <template v-else>
      <p
        v-if="where"
        class="px-4 text-base text-ink-gray-7"
        data-testid="turno-where"
      >
        {{ where }}
      </p>
      <KpiGrid v-if="kpis.length" class="px-4" data-testid="turno-tiles">
        <KpiTile
          v-for="tile in kpis"
          :key="tile.key"
          :label="tile.label"
          :value="tile.value"
          :hint="tile.hint || ''"
          :tone="tile.tone || 'neutral'"
          :data-tile="tile.key"
        />
      </KpiGrid>
      <ul v-if="related.length" class="flex flex-col" data-testid="turno-links">
        <li v-for="row in related" :key="row.key">
          <ListRow
            :title="row.title"
            :subtitle="row.subtitle"
            :icon="row.icon"
            :to="row.to"
          />
        </li>
      </ul>
      <div
        v-if="chips.length"
        class="-my-1 flex gap-1.5 overflow-x-auto px-4 py-1 [scrollbar-width:none]"
        role="tablist"
        aria-label="Del turno"
        data-testid="turno-views"
      >
        <button
          v-for="chip in chips"
          :key="chip.value"
          type="button"
          role="tab"
          :aria-selected="chip.value === current"
          :class="chipClass(chip.value === current)"
          :data-view="chip.value"
          @click="view = chip.value"
        >
          {{ chip.label }}
          <span class="font-normal tabular-nums">{{ chip.count }}</span>
        </button>
      </div>
      <ul
        v-if="rows.length"
        role="tabpanel"
        class="flex flex-col"
        :data-testid="`turno-rows-${current}`"
      >
        <li v-for="row in rows" :key="row.key">
          <ListRow
            :title="row.title"
            :subtitle="row.subtitle || ''"
            :subtitle-lines="row.subtitleLines || 1"
            :subtitle-tone="row.subtitleTone || ''"
            :meta="row.meta || ''"
            :meta-tone="row.metaTone || ''"
            :icon="row.icon || ''"
            :to="row.to || null"
          />
        </li>
      </ul>
      <p
        v-else-if="current"
        role="tabpanel"
        class="px-4 py-3 text-base text-ink-gray-6"
      >
        {{ EMPTY[current] || 'Nada todavía' }}
      </p>
      <p
        v-if="current === 'ventas' && data.sales?.has_more"
        class="px-4 text-sm text-ink-gray-6"
      >
        Las {{ data.sales.rows.length }} más recientes
      </p>
    </template>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { chipClass, KpiGrid, KpiTile, ListRow } from '@/components/ui'
import { shellBoot } from '@/composables/muelleShell'
import { useLiveList } from '@/composables/liveList'
import {
  LIVE,
  links,
  readShift,
  tiles,
  turnLine,
  viewChips,
  views,
} from '@/documentos/turno'
import { errorText } from '@/utils/errorText'

const props = defineProps({
  record: { type: Object, required: true },
  doctype: { type: String, required: true },
  name: { type: String, required: true },
})

const EMPTY = {
  ventas: 'Sin ventas todavía',
  pagos: 'Sin pagos todavía',
}

const data = ref(null)
const error = ref('')
const view = ref('ventas')

const where = computed(() => turnLine(data.value))
const kpis = computed(() => tiles(data.value))
const related = computed(() => links(data.value, props.doctype))
const byView = computed(() => views(data.value, { boot: shellBoot.value }))
const chips = computed(() => viewChips(byView.value, data.value))
// The picked view, or the first one this turn holds.
const current = computed(() =>
  chips.value.some((c) => c.value === view.value)
    ? view.value
    : chips.value[0]?.value || '',
)
const rows = computed(() => byView.value[current.value] || [])

let seq = 0
async function load() {
  const mine = ++seq
  try {
    const answer = await readShift(props.doctype, props.name)
    if (mine !== seq) return
    data.value = answer
    error.value = ''
  } catch (e) {
    if (mine !== seq) return
    error.value = errorText(e, 'No se pudo leer el turno.')
  }
}

watch(
  () => [props.doctype, props.name],
  () => {
    data.value = null
    error.value = ''
    load()
  },
  { immediate: true },
)

// An open turn changes with every sale, movement and bag at its register.
const open = computed(() => data.value?.shift?.status === 'Open')
useLiveList(() => (open.value ? LIVE : ''), load, { minIntervalMs: 5000 })
onBeforeUnmount(() => {
  seq++
})
</script>
