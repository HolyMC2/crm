<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
    <!-- A sub-page of Contactos: up to the list in the one bar (Shell S4.2). -->
    <AppBar
      v-if="isPhone"
      :back="{ name: 'Contactos' }"
      back-label="Contactos"
      context="Contactos"
      :title="__('Importar del teléfono')"
    />
    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto w-full max-w-2xl px-4 pb-12 pt-4 sm:px-6">
        <nav v-if="!isPhone" class="mb-3">
          <RouterLink
            :to="{ name: 'Contactos' }"
            class="press flex min-h-11 w-fit items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          >
            <span class="lucide-arrow-left size-4" aria-hidden="true" />
            {{ __('Volver a Contactos') }}
          </RouterLink>
        </nav>
        <h1
          v-if="!isPhone"
          class="title-face break-words text-2xl font-semibold text-ink-gray-9 [text-wrap:balance]"
        >
          {{ __('Importar del teléfono') }}
        </h1>
        <p class="mb-5 text-sm text-ink-gray-6">
          {{
            __(
              'Agrega a Contactos los números que ya están guardados en un celular. Los que ya están en Contactos no se repiten.',
            )
          }}
        </p>

        <template v-if="step === 'pick'">
          <h2 :class="HEADING">
            {{ __('1. Saca los contactos del teléfono') }}
          </h2>
          <Segmented
            v-model="source"
            :options="sourceOptions"
            :label="__('Teléfono')"
            class="mt-2"
          />
          <ol
            class="mt-3 list-decimal space-y-1 pl-5 text-base text-ink-gray-8"
            data-testid="importar-telefono-pasos"
          >
            <li v-for="line in steps" :key="line">{{ __(line) }}</li>
          </ol>
          <h2 :class="HEADING">{{ __('2. Elige el archivo') }}</h2>
          <p class="mb-3 text-sm text-ink-gray-6">
            {{
              __(
                'Desde el mismo celular o desde la computadora a la que lo pasaste.',
              )
            }}
          </p>
          <label
            :class="[
              PRIMARY,
              'cursor-pointer focus-within:ring-2 focus-within:ring-outline-gray-4',
            ]"
            data-testid="importar-telefono-archivo"
          >
            <span class="lucide-upload size-4" aria-hidden="true" />
            {{ __('Elegir archivo .vcf') }}
            <input
              type="file"
              class="sr-only"
              :accept="ACCEPT"
              @change="pick"
            />
          </label>
          <p v-if="problem" role="alert" class="mt-3 text-sm text-ink-red-6">
            {{ problem }}
          </p>
        </template>

        <p
          v-else-if="step === 'reading'"
          role="status"
          class="flex items-center gap-2 py-10 text-sm text-ink-gray-6"
        >
          <span
            class="lucide-loader-circle size-4 animate-spin"
            aria-hidden="true"
          />
          {{ __('Leyendo el archivo…') }}
        </p>

        <template v-else-if="step === 'review'">
          <dl
            class="grid grid-cols-2 gap-x-4 gap-y-3 rounded-8 bg-surface-gray-1 p-4 sm:grid-cols-4"
            data-testid="importar-telefono-resumen"
          >
            <div v-for="item in summary" :key="item.key" class="min-w-0">
              <dt class="text-sm text-ink-gray-6">{{ item.label }}</dt>
              <dd class="num text-lg font-semibold text-ink-gray-9">
                {{ formatQty(item.value) }}
              </dd>
            </div>
          </dl>

          <template v-if="rows.length">
            <input
              v-model="query"
              type="search"
              :class="[FIELD, 'mt-5']"
              :placeholder="__('Buscar nombre o número')"
              :aria-label="__('Buscar nombre o número')"
            />
            <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span class="text-sm text-ink-gray-7">
                {{
                  query.trim()
                    ? __('Marcar los que se ven como:')
                    : __('Marcar todos como:')
                }}
              </span>
              <Segmented
                :model-value="bulk"
                :options="choiceOptions"
                :label="__('Marcar todos como')"
                class="w-full sm:w-64"
                data-testid="importar-telefono-todos"
                @update:model-value="setAll"
              />
            </div>
            <ul
              class="mt-2 divide-y divide-outline-gray-1"
              data-testid="importar-telefono-filas"
            >
              <li
                v-for="row in visible"
                :key="row.key"
                class="flex min-h-14 items-center gap-3 py-2"
                :data-kind="row.kind"
              >
                <div class="min-w-0 flex-1">
                  <p
                    class="truncate text-base"
                    :class="
                      row.kind === 'no' ? 'text-ink-gray-5' : 'text-ink-gray-9'
                    "
                  >
                    {{ row.name }}
                  </p>
                  <p class="num truncate text-sm text-ink-gray-6">
                    {{ row.numbers.map(displayNumber).join(' · ') }}
                  </p>
                </div>
                <select
                  v-model="row.kind"
                  :class="SELECT"
                  :aria-label="__('Cómo agregar a {0}', [row.name])"
                >
                  <option
                    v-for="option in rowOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
              </li>
            </ul>
            <p v-if="!visible.length" class="py-6 text-sm text-ink-gray-6">
              {{ __('Nada coincide con «{0}».', [query.trim()]) }}
            </p>
          </template>
          <section v-else class="space-y-3 py-6" role="status">
            <p class="text-base text-ink-gray-8">
              {{
                __('Todos los números de este archivo ya están en Contactos.')
              }}
            </p>
            <button type="button" :class="SECONDARY" @click="restart">
              {{ __('Elegir otro archivo') }}
            </button>
          </section>
        </template>

        <p
          v-else-if="step === 'importing'"
          role="status"
          class="flex items-center gap-2 py-10 text-base text-ink-gray-8"
        >
          <span
            class="lucide-loader-circle size-4 animate-spin"
            aria-hidden="true"
          />
          {{
            __('Agregando… {0} de {1}', [
              formatQty(progress.done),
              formatQty(progress.total),
            ])
          }}
        </p>

        <section
          v-else-if="step === 'done'"
          class="space-y-3 py-2"
          role="status"
          data-testid="importar-telefono-listo"
        >
          <p class="text-lg font-semibold text-ink-gray-9">
            {{
              result.created === 1
                ? __('Se agregó 1 contacto.')
                : __('Se agregaron {0} contactos.', [formatQty(result.created)])
            }}
          </p>
          <p v-if="result.skipped" class="text-base text-ink-gray-7">
            {{
              result.skipped === 1
                ? __('1 ya estaba en Contactos y no se repitió.')
                : __('{0} ya estaban en Contactos y no se repitieron.', [
                    formatQty(result.skipped),
                  ])
            }}
          </p>
          <div v-if="result.failed.length" class="space-y-1">
            <p class="text-base text-ink-red-6">
              {{
                result.failed.length === 1
                  ? __('1 no se pudo agregar:')
                  : __('{0} no se pudieron agregar:', [
                      formatQty(result.failed.length),
                    ])
              }}
            </p>
            <ul class="space-y-1 text-sm text-ink-gray-7">
              <li v-for="item in failedRows" :key="item.key">
                <span class="font-medium text-ink-gray-9">{{ item.name }}</span>
                — {{ item.message }}
              </li>
            </ul>
          </div>
          <div class="flex flex-wrap gap-3 pt-2">
            <RouterLink :to="{ name: 'Contactos' }" :class="PRIMARY">
              {{ __('Ver Contactos') }}
            </RouterLink>
            <button type="button" :class="SECONDARY" @click="restart">
              {{ __('Importar otro archivo') }}
            </button>
          </div>
        </section>
      </div>
    </div>

    <div
      v-if="step === 'review' && rows.length"
      class="border-t border-outline-gray-1 bg-surface-base pt-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]"
      data-testid="importar-telefono-barra"
    >
      <div
        class="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 sm:px-6"
      >
        <p class="num min-w-0 flex-1 text-sm text-ink-gray-7">
          {{ chosenLine }}
        </p>
        <button
          type="button"
          :class="PRIMARY"
          :disabled="!counts.total"
          data-testid="importar-telefono-agregar"
          @click="importAll"
        >
          {{ __('Agregar {0}', [formatQty(counts.total)]) }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { AppBar, Segmented } from '@/components/ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { contactosApi } from '@/composables/useContactos'
import { formatQty } from '@/utils/display'
import { errorText } from '@/utils/errorText'
import {
  ACCEPT,
  CHOICES,
  SOURCES,
  addResult,
  batches,
  displayNumber,
  fileProblem,
  filterRows,
  tally,
  withChoices,
} from '@/utils/contactosImportar'

const HEADING = 'title-face mb-1 mt-7 text-base font-semibold text-ink-gray-9'
const FIELD =
  'h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 sm:h-10'
const PRIMARY =
  'press inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-8 bg-[var(--muelle-accent)] px-5 text-base font-semibold text-[var(--muelle-accent-ink)] disabled:opacity-50'
const SECONDARY =
  'press inline-flex min-h-11 items-center justify-center rounded-8 bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-8 hover:bg-surface-gray-3 disabled:opacity-50'

const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
const step = ref('pick')
const source = ref(/iPhone|iPad/i.test(agent) ? 'iphone' : 'android')
const problem = ref('')
const preview = ref(null)
const rows = ref([])
const query = ref('')
const bulk = ref('')
const progress = ref({ done: 0, total: 0 })
const result = ref(null)

const sourceOptions = SOURCES.map(({ value, label }) => ({ value, label }))
const steps = computed(
  () => SOURCES.find((item) => item.value === source.value)?.steps || [],
)
const SELECT =
  'press h-11 w-32 flex-none rounded-6 border-0 bg-surface-gray-2 pl-3 pr-8 text-base text-ink-gray-9 sm:h-10'
const rowOptions = [
  { value: 'cliente', label: __('Cliente') },
  { value: 'otro', label: __('Otro') },
  { value: 'no', label: __('No agregar') },
]
const choiceOptions = CHOICES.map((option) => ({
  ...option,
  label: __(option.label),
}))
const visible = computed(() => filterRows(rows.value, query.value))
const counts = computed(() => tally(rows.value))
const chosenLine = computed(() => {
  const { cliente, otro } = counts.value
  const parts = []
  if (cliente)
    parts.push(
      cliente === 1
        ? __('1 cliente')
        : __('{0} clientes', [formatQty(cliente)]),
    )
  if (otro)
    parts.push(otro === 1 ? __('1 otro') : __('{0} otros', [formatQty(otro)]))
  return parts.length ? parts.join(' · ') : __('Ninguno elegido')
})
const summary = computed(() => {
  const c = preview.value?.counts || {}
  return [
    { key: 'archivo', label: __('En el archivo'), value: c.en_archivo || 0 },
    { key: 'nuevos', label: __('Nuevos'), value: c.nuevos || 0 },
    { key: 'ya', label: __('Ya en Contactos'), value: c.ya_estan || 0 },
    {
      key: 'sin',
      label: __('Sin teléfono'),
      value: c.sin_telefono || 0,
    },
  ]
})
const failedRows = computed(() => {
  const names = new Map(rows.value.map((row) => [row.key, row.name]))
  return (result.value?.failed || []).map((item) => ({
    ...item,
    name: names.get(item.key) || __('Sin nombre'),
  }))
})

async function pick(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  const reason = fileProblem(file)
  problem.value = reason ? __(reason) : ''
  if (!file || reason) return
  step.value = 'reading'
  try {
    const text = await file.text()
    preview.value = await contactosApi('import_preview', { vcf: text })
    rows.value = withChoices(preview.value.rows)
    query.value = ''
    bulk.value = ''
    step.value = 'review'
  } catch (error) {
    problem.value = errorText(error, __('No pude leer el archivo.'))
    step.value = 'pick'
  }
}

function setAll(choice) {
  bulk.value = choice
  const shown = new Set(visible.value.map((row) => row.key))
  rows.value = rows.value.map((row) =>
    shown.has(row.key) ? { ...row, kind: choice } : row,
  )
}

async function importAll() {
  const parts = batches(rows.value)
  if (!parts.length) return
  step.value = 'importing'
  progress.value = { done: 0, total: counts.value.total }
  let total = null
  for (const part of parts) {
    try {
      // Every number is checked again on the server, so a retried batch adds nothing twice.
      const answer = await contactosApi('import_contacts', {
        rows: JSON.stringify(part),
      })
      total = addResult(total, answer)
    } catch (error) {
      const message = errorText(error, __('No se pudo agregar.'))
      total = addResult(total, {
        failed: part.map((row) => ({ key: row.key, message })),
      })
    }
    progress.value = {
      ...progress.value,
      done: progress.value.done + part.length,
    }
  }
  result.value = total
  step.value = 'done'
}

function restart() {
  step.value = 'pick'
  problem.value = ''
  preview.value = null
  rows.value = []
  result.value = null
  query.value = ''
}
</script>
