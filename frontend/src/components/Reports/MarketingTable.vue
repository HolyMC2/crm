<template>
  <div class="min-w-0">
    <div class="hidden max-w-full overflow-x-auto sm:block">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="border-b border-outline-gray-2 text-ink-gray-6">
            <th scope="col" class="min-w-40 px-3 py-3 text-left font-medium">
              {{ __('Nombre') }}
            </th>
            <th
              v-for="column in columns"
              :key="column.key"
              scope="col"
              class="whitespace-nowrap px-3 py-3 font-medium"
              :class="numeric(column) ? 'text-right' : 'text-left'"
            >
              {{ column.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in rows"
            :key="row.name || row.campaign || index"
            class="border-b border-outline-gray-1 text-ink-gray-9"
          >
            <th
              scope="row"
              class="max-w-64 break-words px-3 py-3 text-left font-medium"
            >
              <RouterLink
                v-if="link && link(row)"
                :to="link(row)"
                class="underline decoration-outline-gray-3 underline-offset-4 focus-visible:outline focus-visible:outline-2"
                >{{ row[labelKey] || __('Sin nombre') }}</RouterLink
              >
              <span v-else>{{ row[labelKey] || __('Sin nombre') }}</span>
            </th>
            <td
              v-for="column in columns"
              :key="column.key"
              class="px-3 py-3"
              :class="
                numeric(column)
                  ? 'whitespace-nowrap text-right tabular-nums'
                  : 'min-w-32 text-left'
              "
            >
              <button
                v-if="drillable(row, column)"
                type="button"
                class="report-drill"
                :aria-label="drillLabel(row, column)"
                @click="openDrill(row, column)"
              >
                {{ format(row, column) }}
              </button>
              <template v-else>{{ format(row, column) }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="grid min-w-0 gap-3 sm:hidden">
      <article
        v-for="(row, index) in rows"
        :key="row.name || row.campaign || index"
        class="min-w-0 rounded-lg border border-outline-gray-2 p-3"
      >
        <RouterLink
          v-if="link && link(row)"
          :to="link(row)"
          class="block break-words text-base font-medium text-ink-gray-9 underline decoration-outline-gray-3 underline-offset-4 focus-visible:outline focus-visible:outline-2"
        >
          {{ row[labelKey] || __('Sin nombre') }}
        </RouterLink>
        <h4 v-else class="break-words text-base font-medium text-ink-gray-9">
          {{ row[labelKey] || __('Sin nombre') }}
        </h4>
        <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
          <div v-for="column in columns" :key="column.key" class="min-w-0">
            <dt class="break-words text-ink-gray-6">{{ column.label }}</dt>
            <dd class="mt-1 break-words tabular-nums text-ink-gray-9">
              <button
                v-if="drillable(row, column)"
                type="button"
                class="report-drill"
                :aria-label="drillLabel(row, column)"
                @click="openDrill(row, column)"
              >
                {{ format(row, column) }}
              </button>
              <template v-else>{{ format(row, column) }}</template>
            </dd>
          </div>
        </dl>
      </article>
    </div>
  </div>
</template>

<script setup>
import { fmtDuration } from '@/utils/agentMetricsFormat'
import { drillFor, moneyText } from './MarketingData'
const emit = defineEmits(['drill'])
const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  labelKey: { type: String, default: 'name' },
  currency: { type: String, default: '' },
  link: { type: Function, default: null },
})
function numeric(column) {
  return (
    column.money ||
    column.duration ||
    column.percent ||
    props.rows.some((row) => typeof row[column.key] === 'number')
  )
}
function format(row, column) {
  const value = row[column.key]
  if (value == null) return __('Sin datos')
  if (column.money) return moneyText(row, column.key, props.currency || null)
  if (column.duration) return fmtDuration(value)
  if (column.percent) return `${value}%`
  return column.format ? column.format(value) : value
}
// Counts the server can reproduce open their exact records.
function drillable(row, column) {
  return Number(row[column.key]) > 0 && Boolean(drillFor(row, column.key))
}
function drillTitle(row, column) {
  return `${column.label} · ${row[props.labelKey] || __('Sin nombre')}`
}
function drillLabel(row, column) {
  return __('Ver registros: {0}', [drillTitle(row, column)])
}
function openDrill(row, column) {
  emit('drill', {
    drill: drillFor(row, column.key),
    title: drillTitle(row, column),
  })
}
</script>

<style scoped>
.report-drill {
  @apply min-h-11 rounded px-1 tabular-nums text-ink-gray-9 underline underline-offset-4 hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2;
}
</style>
