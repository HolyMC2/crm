<template>
  <Dialog
    v-model="open"
    :options="{ title: 'Desempeño del equipo', size: '4xl' }"
  >
    <template #body-content>
      <form
        class="flex flex-wrap items-end gap-2 text-xs"
        @submit.prevent="load"
      >
        <label class="font-medium"
          >Desde
          <input
            v-model="from"
            type="date"
            class="mt-1 block rounded-4 border border-outline-gray-2 bg-surface-base p-1 text-sm"
          />
        </label>
        <label class="font-medium"
          >Hasta
          <input
            v-model="to"
            type="date"
            class="mt-1 block rounded-4 border border-outline-gray-2 bg-surface-base p-1 text-sm"
          />
        </label>
        <button
          type="submit"
          class="rounded-4 bg-surface-gray-10 px-3 py-1.5 text-ink-base"
          :disabled="loading"
        >
          Ver periodo
        </button>
      </form>
      <p v-if="error" role="alert" class="mt-3 text-sm">{{ error }}</p>
      <p v-else-if="loading" role="status" class="mt-3 text-sm">Calculando…</p>
      <template v-else-if="report">
        <p class="mt-3 text-xs text-ink-gray-5">
          Metas: primera respuesta en
          {{ report.targets.first_response_minutes || '—' }} min, resolución en
          {{ report.targets.resolution_hours || '—' }} h. Ajusta las metas en
          Ajustes de bandeja.
        </p>
        <div class="mt-2 overflow-x-auto">
          <table class="w-full min-w-[42rem] text-left text-xs">
            <thead>
              <tr class="border-b border-outline-gray-2">
                <th
                  v-for="col in COLUMNS"
                  :key="col.key"
                  class="p-1.5"
                  scope="col"
                >
                  {{ col.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in report.rows"
                :key="row.person || 'none'"
                class="border-b border-outline-gray-1"
              >
                <td v-for="col in COLUMNS" :key="col.key" class="p-1.5">
                  {{ cell(row, col) }}
                </td>
              </tr>
              <tr v-if="!report.rows.length">
                <td :colspan="COLUMNS.length" class="p-1.5 text-ink-gray-5">
                  Nadie atendió conversaciones en este periodo.
                </td>
              </tr>
            </tbody>
            <tfoot v-if="report.rows.length">
              <tr class="font-medium">
                <td v-for="col in COLUMNS" :key="col.key" class="p-1.5">
                  {{ cell(report.total, col) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </template>
    </template>
  </Dialog>
</template>
<script setup>
import { ref, watch } from 'vue'
import { Dialog, call } from 'frappe-ui'

const open = defineModel({ type: Boolean, default: false })
const COLUMNS = [
  { key: 'person_name', label: 'Persona' },
  { key: 'replies', label: 'Respuestas' },
  { key: 'avg_first_response_minutes', label: 'Primera respuesta (min)' },
  { key: 'first_response_met_pct', label: 'Respondidas a tiempo', pct: true },
  { key: 'closed', label: 'Cerradas' },
  { key: 'avg_resolution_hours', label: 'Resolución (h)' },
  { key: 'resolution_met_pct', label: 'Resueltas a tiempo', pct: true },
  { key: 'ratings', label: 'Calificaciones' },
  { key: 'avg_rating', label: 'Promedio (1-5)' },
]
const from = ref(''),
  to = ref(''),
  report = ref(null),
  loading = ref(false),
  error = ref('')
let request = 0
function cell(row, col) {
  const value = row?.[col.key]
  if (value === null || value === undefined) return '—'
  return col.pct ? `${value} %` : value
}
async function load() {
  const mine = ++request
  loading.value = true
  error.value = ''
  try {
    const result = await call('crm.api.inbox.performance', {
      from_date: from.value || null,
      to_date: to.value || null,
    })
    if (mine !== request) return
    report.value = result
    from.value = result.from_date
    to.value = result.to_date
  } catch (e) {
    if (mine === request)
      error.value = e?.messages?.length
        ? String(e.messages[0]).replace(/<[^>]+>/g, '')
        : 'No se pudo calcular el desempeño. Elige otro periodo e inténtalo de nuevo.'
  } finally {
    if (mine === request) loading.value = false
  }
}
watch(open, (value) => {
  if (value && !report.value) load()
})
</script>
