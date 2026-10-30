<template>
  <!-- «Ajustar precios»: one rule over the selected products (or all shown):
       keep the margin, a margin, cost plus %, ± % or from another list, then
       the shop's rounding. It only writes drafts; the review saves them. -->
  <BottomSheet
    :open="open"
    title="Ajustar precios"
    :subtitle="scopeText"
    layer="precios-ajustar"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="space-y-4" data-precios-ajustar>
      <fieldset class="space-y-1">
        <legend class="mb-1 text-sm font-medium text-ink-gray-8">
          Cómo calcular
        </legend>
        <label
          v-for="option in rules"
          :key="option.value"
          class="press flex min-h-12 items-center gap-3 rounded-6 px-2 hover:bg-surface-gray-1"
        >
          <input
            v-model="kind"
            type="radio"
            name="precios-regla"
            :value="option.value"
            class="size-5"
          />
          <span class="min-w-0 flex-1">
            <span class="block text-base text-ink-gray-9">{{
              option.label
            }}</span>
            <span class="block text-sm text-ink-gray-6">{{ option.hint }}</span>
          </span>
        </label>
      </fieldset>

      <div v-if="rule?.unit" class="flex items-end gap-3">
        <label class="flex-1">
          <span class="mb-1 block text-sm font-medium text-ink-gray-8">{{
            valueLabel
          }}</span>
          <span class="relative block">
            <input
              v-model="value"
              type="text"
              inputmode="decimal"
              class="num h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 pr-8 text-base text-ink-gray-9"
              :placeholder="kind === 'porcentaje' ? '5 o −5' : '35'"
              data-precios-valor
            />
            <span
              class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-gray-5"
              >%</span
            >
          </span>
        </label>
      </div>

      <label v-if="kind === 'otra-lista'" class="block">
        <span class="mb-1 block text-sm font-medium text-ink-gray-8"
          >Desde la lista</span
        >
        <select
          v-model="from"
          class="h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base"
        >
          <option
            v-for="name in lists.filter((name) => name !== target)"
            :key="name"
            :value="name"
          >
            {{ name }}
          </option>
        </select>
      </label>

      <div v-if="lists.length > 1">
        <p class="mb-1 text-sm font-medium text-ink-gray-8">Lista que cambia</p>
        <div
          class="flex flex-wrap gap-2"
          role="group"
          aria-label="Lista que cambia"
        >
          <button
            v-for="name in lists"
            :key="name"
            type="button"
            :class="chipClass(name === target)"
            :aria-pressed="name === target"
            @click="target = name"
          >
            {{ name }}
          </button>
        </div>
      </div>

      <div>
        <p class="mb-1 text-sm font-medium text-ink-gray-8">
          Redondear hacia arriba
        </p>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Redondeo">
          <button
            v-for="option in ROUNDINGS"
            :key="option.value"
            type="button"
            :class="chipClass(option.value === rounding)"
            :aria-pressed="option.value === rounding"
            @click="emit('update:rounding', option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <section
        aria-live="polite"
        class="rounded-6 bg-surface-gray-1 p-3 text-sm"
        data-precios-vista-previa
      >
        <p class="font-medium text-ink-gray-9">{{ previewLine }}</p>
        <ul v-if="sample.length" class="mt-2 space-y-1">
          <li v-for="entry in sample" :key="entry.code" class="flex gap-2">
            <span class="min-w-0 flex-1 truncate text-ink-gray-8">{{
              entry.name
            }}</span>
            <span class="num text-ink-gray-6"
              >{{
                entry.before === null
                  ? 'Sin precio'
                  : money(entry.before, currency)
              }}
              →</span
            >
            <span class="num font-medium text-ink-gray-9">{{
              money(entry.price, currency)
            }}</span>
          </li>
        </ul>
        <p
          v-for="(count, reason) in skipped"
          :key="reason"
          class="mt-1 text-ink-gray-6"
        >
          {{ count === 1 ? '1 se queda' : `${count} se quedan` }} como están:
          {{ reason.toLowerCase() }}.
        </p>
      </section>
    </div>
    <template #actions>
      <button
        type="button"
        class="press inline-flex min-h-11 items-center rounded-6 px-4 text-base font-medium text-ink-gray-8 hover:bg-surface-gray-2"
        @click="emit('update:open', false)"
      >
        Cancelar
      </button>
      <button
        type="button"
        class="press inline-flex min-h-11 items-center rounded-6 bg-[var(--muelle-accent)] px-4 text-base font-medium text-[var(--muelle-accent-ink)] disabled:opacity-50"
        :disabled="!results.length"
        data-precios-aplicar
        @click="apply"
      >
        {{
          results.length === 1
            ? 'Poner 1 precio'
            : `Poner ${results.length} precios`
        }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { BottomSheet, chipClass } from '@/components/ui'
import {
  ROUNDINGS,
  RULES,
  cellOf,
  money,
  rulePrice,
} from '@/composables/usePrecios'

const props = defineProps({
  open: { type: Boolean, default: false },
  rows: { type: Array, default: () => [] },
  /** True when the rows are the worker's selection, false when all shown. */
  selection: { type: Boolean, default: false },
  lists: { type: Array, default: () => [] },
  list: { type: String, default: '' },
  currency: { type: String, default: 'MXN' },
  costVisible: { type: Boolean, default: false },
  rounding: { type: String, default: 'centavos' },
})
const emit = defineEmits(['update:open', 'update:rounding', 'apply'])

const rules = computed(() =>
  RULES.filter((rule) =>
    props.costVisible
      ? true
      : !['mantener', 'margen', 'sobre-costo'].includes(rule.value),
  ).filter((rule) => rule.value !== 'otra-lista' || props.lists.length > 1),
)
const kind = ref('')
const value = ref('')
const target = ref(props.list)
const from = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    target.value = props.list || props.lists[0] || ''
    if (!rules.value.some((rule) => rule.value === kind.value))
      kind.value = rules.value[0]?.value || ''
    from.value = props.lists.find((name) => name !== target.value) || ''
  },
  // The page mounts the sheet on its first open, already open.
  { immediate: true },
)
watch(target, (name) => {
  if (from.value === name)
    from.value = props.lists.find((other) => other !== name) || ''
})

const rule = computed(() => RULES.find((option) => option.value === kind.value))
const valueLabel = computed(
  () =>
    ({
      margen: 'Margen que quieres',
      'sobre-costo': 'Encima del costo',
      porcentaje: 'Cuánto sube o baja',
      'otra-lista': 'Más o menos que esa lista',
    })[kind.value] || 'Valor',
)
const scopeText = computed(() => {
  const n = props.rows.length
  if (props.selection)
    return n === 1 ? '1 producto seleccionado' : `${n} productos seleccionados`
  return n === 1
    ? 'El producto que se muestra'
    : `Los ${n} productos que se muestran`
})

const outcome = computed(() => {
  const out = { results: [], skipped: {} }
  for (const row of props.rows) {
    const answer = rulePrice(row, target.value, {
      kind: kind.value,
      value: value.value,
      from: from.value,
      rounding: props.rounding,
    })
    if (answer.skip)
      out.skipped[answer.skip] = (out.skipped[answer.skip] || 0) + 1
    else {
      const before = cellOf(row, target.value)?.rate ?? null
      if (before !== null && Math.abs(Number(before) - answer.price) < 1e-9) {
        out.skipped['Ya tiene ese precio'] =
          (out.skipped['Ya tiene ese precio'] || 0) + 1
        continue
      }
      out.results.push({
        code: row.item_code,
        name: row.item_name,
        list: target.value,
        price: answer.price,
        before,
      })
    }
  }
  return out
})
const results = computed(() => outcome.value.results)
const skipped = computed(() => outcome.value.skipped)
const sample = computed(() => results.value.slice(0, 3))
const previewLine = computed(() => {
  const n = results.value.length
  if (!n) return 'Ningún precio cambia con esta regla.'
  return n === 1
    ? `1 precio nuevo en ${target.value}`
    : `${n} precios nuevos en ${target.value}`
})

function apply() {
  emit('apply', results.value)
  emit('update:open', false)
}
</script>
