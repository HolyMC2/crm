<template>
  <!-- «Diseño»: the label's measure and what it carries. A size (or a
       measure the worker types) is laid out by doco for whatever parts are
       on; a store format or a design template brings its own. Every change
       shows on the stage at once. -->
  <div class="space-y-5" data-etq-design>
    <section aria-labelledby="etq-medida" class="space-y-2">
      <div class="flex items-baseline justify-between gap-2">
        <h3 id="etq-medida" class="text-base font-semibold text-ink-gray-9">
          Medida
        </h3>
        <span v-if="current?.size" class="num text-sm text-ink-gray-6">{{
          current.size
        }}</span>
      </div>
      <div
        class="grid grid-cols-3 gap-2"
        role="radiogroup"
        aria-label="Medida de la etiqueta"
      >
        <button
          v-for="option in sizes"
          :key="option.key"
          type="button"
          role="radio"
          :aria-checked="option.key === layout ? 'true' : 'false'"
          class="press flex min-h-16 flex-col items-center justify-center gap-1 rounded-8 px-1 py-2 text-center"
          :class="tile(option.key === layout)"
          @click="choose(option.key)"
        >
          <span
            class="block flex-none rounded-sm border-2 border-current opacity-70"
            :style="shape(option)"
            aria-hidden="true"
          />
          <span class="block text-sm font-medium leading-tight">{{
            option.label
          }}</span>
          <span class="num block text-xs leading-tight opacity-80">{{
            dims(option)
          }}</span>
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="custom ? 'true' : 'false'"
          :aria-expanded="customOpen ? 'true' : 'false'"
          class="press flex min-h-16 flex-col items-center justify-center gap-1 rounded-8 px-1 py-2 text-center"
          :class="tile(custom)"
          data-etq-otra-medida
          @click="customOpen = !customOpen"
        >
          <Icon icon="ruler" class="size-5 opacity-80" />
          <span class="block text-sm font-medium leading-tight"
            >Otra medida</span
          >
          <span
            v-if="custom"
            class="num block text-xs leading-tight opacity-80"
            >{{ dims(current) }}</span
          >
        </button>
      </div>
      <ExpandTransition>
        <form
          v-if="customOpen"
          class="space-y-2 pt-1"
          data-etq-medida-form
          @submit.prevent="useCustom"
        >
          <div class="flex items-end gap-2">
            <label class="min-w-0 flex-1">
              <span class="block pb-1 text-sm text-ink-gray-6">Ancho (mm)</span>
              <input
                v-model="width"
                type="number"
                inputmode="decimal"
                step="0.5"
                :min="limits.min"
                :max="limits.max"
                class="num h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
                aria-label="Ancho de la etiqueta en milímetros"
              />
            </label>
            <span class="pb-3 text-ink-gray-5" aria-hidden="true">×</span>
            <label class="min-w-0 flex-1">
              <span class="block pb-1 text-sm text-ink-gray-6">Alto (mm)</span>
              <input
                v-model="height"
                type="number"
                inputmode="decimal"
                step="0.5"
                :min="limits.min"
                :max="limits.max"
                class="num h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
                aria-label="Alto de la etiqueta en milímetros"
              />
            </label>
            <Button
              type="submit"
              variant="solid"
              class="press min-h-11"
              label="Usar"
              :disabled="!!customProblem"
            />
          </div>
          <p class="text-sm text-ink-gray-6" data-etq-medida-why>
            {{
              customProblem ||
              'Mide el rollo sin el papel de soporte: ancho por alto de una etiqueta.'
            }}
          </p>
          <div v-if="recent.length" class="flex flex-wrap gap-2">
            <button
              v-for="key in recent"
              :key="key"
              type="button"
              :class="chipClass(key === layout)"
              @click="choose(key)"
            >
              <span class="num">{{ customLayout(key)?.size }}</span>
            </button>
          </div>
        </form>
      </ExpandTransition>

      <div v-if="others.length" class="space-y-1 pt-2">
        <h4 class="text-sm text-ink-gray-6">Plantillas de la tienda</h4>
        <ul
          class="-mx-2"
          role="radiogroup"
          aria-label="Plantillas de la tienda"
        >
          <li v-for="option in others" :key="option.key">
            <button
              type="button"
              role="radio"
              :aria-checked="option.key === layout ? 'true' : 'false'"
              :disabled="!!option.problem"
              class="press flex min-h-11 w-full items-center gap-3 rounded-6 px-2 py-1.5 text-left hover:bg-surface-gray-1 disabled:opacity-60"
              @click="choose(option.key)"
            >
              <span
                class="flex size-5 flex-none items-center justify-center rounded-full border-2"
                :class="
                  option.key === layout
                    ? 'border-ink-gray-9'
                    : 'border-outline-gray-3'
                "
                aria-hidden="true"
              >
                <span
                  v-if="option.key === layout"
                  class="size-2.5 rounded-full bg-ink-gray-9"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-base text-ink-gray-9">{{
                  option.label
                }}</span>
                <span
                  v-if="option.problem"
                  class="block text-sm text-ink-amber-9"
                  >{{ option.problem }}</span
                >
              </span>
              <span
                v-if="option.size"
                class="num whitespace-nowrap text-sm text-ink-gray-6"
                >{{ option.size }}</span
              >
            </button>
          </li>
        </ul>
      </div>
    </section>

    <section
      v-if="current?.kind === 'size'"
      aria-labelledby="etq-lleva"
      class="space-y-1"
      data-etq-fields
    >
      <div class="flex items-baseline justify-between gap-2">
        <h3 id="etq-lleva" class="text-base font-semibold text-ink-gray-9">
          Qué lleva
        </h3>
        <button
          v-if="!isDefault"
          type="button"
          class="press min-h-11 px-1 text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9"
          @click="reset"
        >
          Lo de siempre
        </button>
      </div>
      <p class="text-sm text-ink-gray-6">
        Lo que no quepa en la medida se deja fuera y te decimos qué; nada sale
        cortado.
      </p>
      <ul class="divide-y divide-outline-gray-1">
        <li v-for="part in parts" :key="part.key" :data-etq-part="part.key">
          <button
            type="button"
            role="switch"
            :aria-checked="on(part.key) ? 'true' : 'false'"
            class="press flex min-h-14 w-full items-center gap-3 py-2 text-left"
            @click="toggle(part.key)"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-base text-ink-gray-9">{{
                part.label
              }}</span>
              <span
                class="block text-sm"
                :class="
                  dropped.includes(part.key) && on(part.key)
                    ? 'text-ink-amber-9'
                    : 'text-ink-gray-6'
                "
                >{{ hint(part.key) }}</span
              >
            </span>
            <span
              class="relative h-5 w-9 flex-none rounded-full transition-colors motion-reduce:transition-none"
              :class="on(part.key) ? 'bg-surface-gray-7' : 'bg-surface-gray-4'"
              aria-hidden="true"
            >
              <span
                class="absolute top-0.5 size-4 rounded-full bg-surface-base transition-all motion-reduce:transition-none"
                :class="on(part.key) ? 'left-[18px]' : 'left-0.5'"
              />
            </span>
          </button>
          <ExpandTransition>
            <div
              v-if="on(part.key) && optionFor(part.key)"
              class="space-y-1 pb-3"
            >
              <template v-if="optionFor(part.key) === 'size'">
                <span class="block text-sm text-ink-gray-6">{{
                  part.key === 'name'
                    ? 'Tamaño del nombre'
                    : 'Tamaño del precio'
                }}</span>
                <Segmented
                  :model-value="
                    part.key === 'name' ? design.name_size : design.price_size
                  "
                  :label="
                    part.key === 'name'
                      ? 'Tamaño del nombre'
                      : 'Tamaño del precio'
                  "
                  :options="part.key === 'name' ? NAME_SIZES : PRICE_SIZES"
                  @update:model-value="
                    set(
                      part.key === 'name' ? 'name_size' : 'price_size',
                      $event,
                    )
                  "
                />
              </template>
              <template v-else-if="optionFor(part.key) === 'code'">
                <span class="block text-sm text-ink-gray-6"
                  >El código lleva</span
                >
                <Segmented
                  :model-value="design.code"
                  label="El código lleva"
                  :options="CODE_KINDS"
                  @update:model-value="set('code', $event)"
                />
                <span class="block text-sm text-ink-gray-6">{{
                  design.code === 'unit'
                    ? 'La serie o el lote de la pieza; si no tiene, el producto.'
                    : 'Siempre el producto, aunque la pieza tenga serie.'
                }}</span>
              </template>
              <label v-else class="block">
                <span class="block pb-1 text-sm text-ink-gray-6">{{
                  part.key === 'text'
                    ? 'Lo que dice'
                    : 'Cómo se llama en la etiqueta'
                }}</span>
                <input
                  :value="part.key === 'text' ? design.text : design.shop_text"
                  type="text"
                  :maxlength="
                    part.key === 'text'
                      ? meta.text_max || 60
                      : meta.shop_max || 40
                  "
                  :placeholder="
                    part.key === 'text'
                      ? 'Garantía 30 días'
                      : meta.shop || 'Nombre de la tienda'
                  "
                  class="h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 placeholder:text-ink-gray-5 focus:ring-2 focus:ring-outline-gray-3"
                  :data-etq-input="part.key"
                  @input="
                    set(
                      part.key === 'text' ? 'text' : 'shop_text',
                      $event.target.value,
                    )
                  "
                />
              </label>
            </div>
          </ExpandTransition>
        </li>
      </ul>
    </section>

    <section v-else-if="current" aria-labelledby="etq-propio" class="space-y-2">
      <h3 id="etq-propio" class="text-base font-semibold text-ink-gray-9">
        Qué lleva
      </h3>
      <p class="text-sm text-ink-gray-6">
        «{{ current.label }}» trae su propio diseño: qué lleva y dónde va. Para
        elegir tú qué lleva, usa una medida.
      </p>
      <a
        v-if="current.desk_url"
        :href="current.desk_url"
        target="_blank"
        rel="noopener"
        class="press inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink-gray-9 underline underline-offset-2"
        >Editar en el escritorio</a
      >
    </section>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { Segmented, chipClass } from '@/components/ui'
import ExpandTransition from '@/components/ui/ExpandTransition.vue'
import Icon from '@/components/Icon.vue'
import {
  CODE_KINDS,
  NAME_SIZES,
  PART_HINTS,
  PRICE_SIZES,
  cleanDesign,
  customKey,
  customLayout,
  findLayout,
  rememberedSizes,
  sideOk,
  sizeText,
} from '@/composables/useEtiquetas'

const props = defineProps({
  layouts: { type: Array, default: () => [] },
  // bootstrap's `design`: { parts, default, custom, text_max, shop, shop_max }
  meta: { type: Object, default: () => ({}) },
  // The parts some label had no room for (the preview's `fit`).
  dropped: { type: Array, default: () => [] },
  // What is on the list, for hints such as «ninguno lleva serie».
  rows: { type: Array, default: () => [] },
  priceList: { type: String, default: '' },
})
const layout = defineModel('layout', { type: String, default: '' })
const design = defineModel('design', { type: Object, required: true })

const limits = computed(() => props.meta.custom || { min: 10, max: 300 })
const sizes = computed(() =>
  props.layouts.filter((option) => option.kind === 'size'),
)
const others = computed(() =>
  props.layouts.filter((option) => option.kind !== 'size'),
)
const current = computed(() =>
  findLayout(layout.value, props.layouts, limits.value),
)
const custom = computed(() => layout.value.startsWith('custom:'))
const parts = computed(() => props.meta.parts || [])

function tile(active) {
  return active
    ? 'bg-surface-green-2 text-ink-green-8'
    : 'bg-surface-gray-2 text-ink-gray-8 hover:bg-surface-gray-3'
}
function dims(option) {
  return option ? `${option.w_mm} × ${option.h_mm}` : ''
}
// A small drawing of the label's shape, to scale among the sizes.
function shape(option) {
  const most = Math.max(option.w_mm, option.h_mm) || 1
  return {
    width: `${Math.max(8, (28 * option.w_mm) / most)}px`,
    height: `${Math.max(8, (20 * option.h_mm) / most)}px`,
  }
}
function choose(key) {
  layout.value = key
}

// ── another measure ───────────────────────────────────────────────────
const customOpen = ref(custom.value)
const recent = ref(rememberedSizes())
const width = ref(current.value?.w_mm || '')
const height = ref(current.value?.h_mm || '')
watch(layout, (key) => {
  recent.value = rememberedSizes()
  if (!key.startsWith('custom:')) return
  const chosen = customLayout(key, limits.value)
  if (chosen) [width.value, height.value] = [chosen.w_mm, chosen.h_mm]
})
const customProblem = computed(() => {
  if (width.value === '' || height.value === '')
    return 'Escribe el ancho y el alto.'
  if (!sideOk(width.value, limits.value) || !sideOk(height.value, limits.value))
    return `Cada lado va de ${limits.value.min} a ${limits.value.max} mm.`
  return ''
})
function useCustom() {
  if (customProblem.value) return
  layout.value = customKey(width.value, height.value)
}

// ── what it carries ───────────────────────────────────────────────────
const isDefault = computed(() => {
  const plain = cleanDesign({ parts: props.meta.default }, props.meta)
  return (
    design.value.parts.join() === plain.parts.join() &&
    design.value.name_size === plain.name_size &&
    design.value.price_size === plain.price_size &&
    design.value.code === plain.code
  )
})
function on(key) {
  return design.value.parts.includes(key)
}
function set(key, value) {
  design.value = { ...design.value, [key]: value }
}
function toggle(key) {
  const next = on(key)
    ? design.value.parts.filter((part) => part !== key)
    : [...design.value.parts, key]
  // A label with nothing on it is not a label: the last part stays.
  if (!next.length) return
  design.value = cleanDesign({ ...design.value, parts: next }, props.meta)
}
function reset() {
  design.value = cleanDesign(
    {
      ...design.value,
      parts: props.meta.default,
      name_size: 'm',
      price_size: 'l',
      code: 'unit',
    },
    props.meta,
  )
}
// The options a part opens when it is on; the code's under the first of QR
// and bars.
function optionFor(key) {
  if (key === 'name' || key === 'price') return 'size'
  if (key === 'qr') return 'code'
  if (key === 'bar') return on('qr') ? '' : 'code'
  if (key === 'text' || key === 'shop') return 'text'
  return ''
}

const anySerial = computed(() => props.rows.some((row) => row.serial_no))
const anyBatch = computed(() => props.rows.some((row) => row.batch_no))
// A product kept by serie or lote is on the list whole until its pieces are
// picked; that is the way to its serie or lote on the label.
function unpicked(units) {
  return props.rows.some(
    (row) => row.units === units && !row.serial_no && !row.batch_no,
  )
}
function hint(key) {
  if (on(key) && design.value.parts.length === 1)
    return 'Una etiqueta lleva al menos una cosa.'
  if (on(key) && props.dropped.includes(key))
    return `No cupo en ${sizeLabel.value}: quita algo o usa una más grande.`
  if (props.rows.length && key === 'sn' && !anySerial.value)
    return unpicked('serie')
      ? 'Para que salga, elige las piezas por serie en la lista.'
      : 'Ningún producto de la lista tiene serie: no sale.'
  if (props.rows.length && key === 'batch' && !anyBatch.value)
    return unpicked('lote')
      ? 'Para que salga, elige los lotes en la lista.'
      : 'Ningún producto de la lista tiene lote: no sale.'
  if (key === 'price' && props.priceList)
    return `De la lista ${props.priceList}`
  return PART_HINTS[key] || ''
}
const sizeLabel = computed(() =>
  current.value
    ? sizeText(current.value.w_mm, current.value.h_mm)
    : 'esta medida',
)
</script>
