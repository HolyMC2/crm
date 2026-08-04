<!--
  VariantsPanel — "Variantes IA" for the composer (W6 B3). Manager-only (the parent
  mounts it behind isManager; the backend also enforces it). Given a SAVED post name it
  asks the AI for N caption variants at a chosen tone + length, previews them as cards,
  and on "Usar esta" applies the picked variant server-side (pick_variant, which writes
  the caption onto every non-published channel row) then emits `applied` so the parent
  updates its local per-channel captions. Needs a saved post — variants hang off the
  Social Post record; with no name yet we nudge the user to save the draft first.
-->
<template>
  <div class="rounded-md border border-outline-gray-2 bg-surface-gray-1 p-2">
    <button
      type="button" data-testid="variants-open"
      class="flex w-full items-center justify-between text-[11px] font-semibold text-ink-gray-7"
      @click="open = !open"
    >
      <span>{{ __('✨ Variantes IA') }}</span>
      <span class="text-[13px] text-ink-gray-5">{{ open ? '▾' : '▸' }}</span>
    </button>

    <div v-if="open" class="mt-2">
      <!-- tone + length knobs -->
      <div class="mb-2 grid grid-cols-2 gap-2">
        <div>
          <div class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-gray-5">{{ __('Tono') }}</div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="t in TONES" :key="t.v" type="button"
              class="rounded-md border px-2 py-0.5 text-[11px] font-medium"
              :class="tone === t.v ? 'border-green-500 dark:border-green-400 bg-surface-green-2 text-ink-green-7' : 'border-outline-gray-2 text-ink-gray-6'"
              @click="tone = t.v"
            >{{ t.label }}</button>
          </div>
        </div>
        <div>
          <div class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-gray-5">{{ __('Longitud') }}</div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="l in LENGTHS" :key="l.v" type="button"
              class="rounded-md border px-2 py-0.5 text-[11px] font-medium"
              :class="length === l.v ? 'border-green-500 dark:border-green-400 bg-surface-green-2 text-ink-green-7' : 'border-outline-gray-2 text-ink-gray-6'"
              @click="length = l.v"
            >{{ l.label }}</button>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 py-1.5 text-[12px] font-semibold text-ink-gray-7 disabled:opacity-50"
        :disabled="!postName || loading" @click="generate"
      >{{ loading ? __('Generando…') : (variants.length ? __('↻ Regenerar') : __('Generar 3 variantes')) }}</button>

      <p v-if="!postName" class="mt-1 text-[10.5px] text-ink-gray-4">{{ __('Guarda el borrador primero para generar variantes.') }}</p>

      <!-- variant cards -->
      <div v-for="(v, i) in variants" :key="v.name || i" :data-testid="`variant-card-${i}`" class="mt-2 rounded-md border border-outline-gray-2 bg-surface-base p-2">
        <div class="max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-[12px] text-ink-gray-8">{{ v.caption }}</div>
        <div class="mt-1.5 flex items-center gap-1.5">
          <span class="rounded-full bg-surface-gray-2 px-1.5 py-0.5 text-[9.5px] font-semibold text-ink-gray-6">{{ toneLabel(v.tone) }}</span>
          <span class="rounded-full bg-surface-gray-2 px-1.5 py-0.5 text-[9.5px] font-semibold text-ink-gray-6">{{ lengthLabel(v.length) }}</span>
          <button
            type="button" :data-testid="`variant-pick-${i}`"
            class="ml-auto rounded-md bg-surface-green-2 px-2.5 py-1 text-[11px] font-semibold text-ink-green-7 hover:brightness-95 disabled:opacity-50"
            :disabled="picking >= 0" @click="pick(v, i)"
          >{{ picking === i ? __('Aplicando…') : __('Usar esta') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { call as frappeCall, toast } from 'frappe-ui'

const props = defineProps({
  postName: { type: String, default: '' },
})
const emit = defineEmits(['applied'])

const TONES = [
  { v: 'casual', label: __('Casual') },
  { v: 'neutral', label: __('Neutral') },
  { v: 'formal', label: __('Formal') },
]
const LENGTHS = [
  { v: 'corto', label: __('Corto') },
  { v: 'medio', label: __('Medio') },
  { v: 'largo', label: __('Largo') },
]
const toneLabel = (v) => TONES.find((t) => t.v === v)?.label || v || ''
const lengthLabel = (v) => LENGTHS.find((l) => l.v === v)?.label || v || ''

const open = ref(false)
const tone = ref('neutral')
const length = ref('medio')
const variants = ref([])
const loading = ref(false)
const picking = ref(-1)

async function generate() {
  if (!props.postName || loading.value) return
  loading.value = true
  try {
    const r = await frappeCall('doco_marketing.services.social.ai_draft.generate_variants', {
      name: props.postName, n: 3, tone: tone.value, length: length.value,
    })
    variants.value = r?.variants || []
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudieron generar variantes'))
  } finally {
    loading.value = false
  }
}

async function pick(v, i) {
  if (picking.value >= 0) return
  picking.value = i
  try {
    const r = await frappeCall('doco_marketing.services.social.ai_draft.pick_variant', {
      name: props.postName, variant_name: v.name,
    })
    emit('applied', { caption: v.caption, channels: r?.applied_channels || [] })
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo aplicar la variante'))
  } finally {
    picking.value = -1
  }
}
</script>
