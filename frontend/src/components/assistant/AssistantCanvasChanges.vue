<template>
  <!-- What one Lienzo version changed against the one before it (doco
       canvas.compare): a table names each row (by its identifying column or
       its row number) and each changed cell, a text shows its lines with a
       sign, any other file only says whether it changed. The lists are the
       first changes; their counts are whole. -->
  <div
    class="max-h-[50vh] space-y-3 overflow-auto rounded-6 bg-surface-gray-1 p-3 text-sm"
    data-testid="canvas-changes"
  >
    <p class="text-ink-gray-6">
      {{
        changes.sheets?.length > 1
          ? __('Against version {0}, sheet {1}', [
              changes.old.version,
              changes.sheet,
            ])
          : __('Against version {0}', [changes.old.version])
      }}
    </p>
    <p v-if="changes.same" class="text-ink-gray-8">
      {{ __('Same content as version {0}.', [changes.old.version]) }}
    </p>
    <template v-else-if="changes.table">
      <section v-for="part in sections" :key="part.id" :data-changes="part.id">
        <h3 class="font-medium text-ink-gray-9">
          {{ part.title }}
          <span class="num ml-1 font-normal text-ink-gray-6">{{
            part.count
          }}</span>
        </h3>
        <ul class="mt-1 space-y-0.5 text-ink-gray-8">
          <li v-for="(item, i) in part.items" :key="i" class="break-words">
            <span v-if="item.row" class="font-medium text-ink-gray-9">{{
              item.row
            }}</span>
            <!-- the template drops the spaces between tags: they ride in
                 the interpolations -->
            <template v-if="item.column"
              >{{ ` ${item.column}: `
              }}<span class="num">{{ item.before }}</span
              ><span aria-hidden="true">{{ ' → ' }}</span
              ><span class="sr-only">{{ `${__('to', null, 'Lienzo')} ` }}</span
              ><span class="num">{{ item.after }}</span></template
            >
            <template v-else>{{ ` ${item.text}` }}</template>
          </li>
        </ul>
        <p v-if="part.more" class="mt-1 text-xs text-ink-gray-6">
          {{ __('And {0} more.', [part.more]) }}
        </p>
      </section>
      <p class="text-xs text-ink-gray-6">
        {{
          changes.table.key
            ? __('Rows are matched by {0}.', [changes.table.key])
            : __('Rows are matched by their place in the sheet.')
        }}
      </p>
    </template>
    <template v-else-if="changes.text">
      <p class="text-ink-gray-8">
        {{
          __('Lines added: {0}. Lines taken out: {1}.', [
            changes.text.added,
            changes.text.removed,
          ])
        }}
      </p>
      <pre
        class="overflow-x-auto rounded-4 bg-surface-base py-1 font-mono text-xs leading-5"
      ><span
          v-for="(line, i) in lines"
          :key="i"
          class="block whitespace-pre-wrap break-words px-2"
          :class="LINE[line.sign]"
          :data-sign="line.sign"
        >{{ line.text }}</span></pre>
      <p v-if="changes.text.truncated" class="text-xs text-ink-gray-6">
        {{
          __(
            'There are more changes than shown here. Download both versions to see them all.',
          )
        }}
      </p>
    </template>
    <p v-else class="text-ink-gray-8">
      {{
        __(
          'This version is different from version {0}. Open each one to see them.',
          [changes.old.version],
        )
      }}
    </p>
  </div>
</template>
<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** canvas.compare: { old, new, same, table | text, sheet, sheets } */
  changes: { type: Object, required: true },
})

// a diff line's sign keeps its meaning without the colour
const LINE = {
  '+': 'bg-surface-green-1 text-ink-green-8',
  '-': 'bg-surface-red-1 text-ink-red-7',
  '@': 'text-ink-gray-5',
  ' ': 'text-ink-gray-7',
}

const lines = computed(() =>
  (props.changes.text?.diff || []).map((line) =>
    line.startsWith('@@')
      ? { sign: '@', text: '⋯' }
      : { sign: '+- '.includes(line[0]) ? line[0] : ' ', text: line },
  ),
)

const sections = computed(() => {
  const table = props.changes.table || {}
  const counts = table.counts || {}
  // rows matched by place are named by their row number in the sheet
  const row = (fila) => (table.key ? fila : __('Row {0}', [fila]))
  const empty = (value) => (value === '' || value == null ? '—' : value)
  const part = (id, title, count, items) =>
    count && {
      id,
      title,
      count,
      items,
      more: Math.max(count - items.length, 0),
    }
  return [
    part(
      'columns-added',
      __('New columns'),
      table.columns_added?.length,
      (table.columns_added || []).map((text) => ({ text })),
    ),
    part(
      'columns-removed',
      __('Columns taken out'),
      table.columns_removed?.length,
      (table.columns_removed || []).map((text) => ({ text })),
    ),
    part(
      'changed',
      __('Changed cells'),
      counts.celdas_cambiadas,
      (table.changed || []).map((c) => ({
        row: `${row(c.fila)},`,
        column: c.columna,
        before: empty(c.antes),
        after: empty(c.despues),
      })),
    ),
    part(
      'added',
      __('New rows'),
      counts.filas_nuevas,
      (table.added || []).map((r) => ({ row: row(r.fila), text: r.texto })),
    ),
    part(
      'removed',
      __('Rows taken out'),
      counts.filas_quitadas,
      (table.removed || []).map((r) => ({ row: row(r.fila), text: r.texto })),
    ),
  ].filter(Boolean)
})
</script>
