<template>
  <!-- What the customer gets, drawn small: a phone with the shop's name, the
       parts that are on and the bottom tabs (view.js previewView), dimmed
       while the app is off. A picture only: the sentence beside it and the
       rows below are what readers and keys use. «Ver como cliente» opens the
       shop's /cuenta in a new tab. -->
  <section
    :aria-labelledby="`app-clientes-vista-${tall ? 'alta' : 'corta'}`"
    class="space-y-3"
    data-app-clientes-vista
  >
    <div class="flex gap-4" :class="tall ? 'flex-col' : 'items-start'">
      <div
        aria-hidden="true"
        class="flex flex-none flex-col overflow-hidden rounded-[1.75rem] border-[6px] border-outline-gray-2 bg-surface-base transition-opacity motion-reduce:transition-none"
        :class="[
          tall ? 'h-96 w-full max-w-64 self-center' : 'h-52 w-32',
          view.on ? '' : 'opacity-60',
        ]"
        data-app-clientes-telefono
      >
        <div class="min-h-0 flex-1 space-y-1.5 overflow-hidden p-2">
          <p class="truncate text-xs font-semibold text-ink-gray-9">
            {{ shop }}
          </p>
          <span
            v-for="section in sections"
            :key="section.key"
            class="flex items-center gap-1.5 rounded-4 bg-surface-gray-2 px-1.5 py-1 text-xs text-ink-gray-8"
            :data-vista-seccion="section.key"
          >
            <span :class="[section.icon, 'size-3.5 flex-none']" />
            <span class="truncate">{{ section.label }}</span>
          </span>
          <span v-if="more" class="block px-1 text-xs text-ink-gray-6">{{
            __('+{0} more', [more], CTX)
          }}</span>
        </div>
        <div class="flex flex-none border-t border-outline-gray-1">
          <span
            v-for="tab in view.tabs"
            :key="tab.key"
            class="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[10px] text-ink-gray-6"
            :class="tall ? 'py-1' : 'py-1.5'"
            :data-vista-tab="tab.key"
          >
            <span :class="[tab.icon, 'size-4']" />
            <!-- The small phone keeps its tabs as icons; the tall one names them. -->
            <span v-if="tall" class="block max-w-full truncate px-px">{{
              tab.label
            }}</span>
          </span>
        </div>
      </div>
      <div class="min-w-0 flex-1 space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2
            :id="`app-clientes-vista-${tall ? 'alta' : 'corta'}`"
            class="title-face text-lg font-semibold text-ink-gray-9"
          >
            {{ __('What your customers see', null, CTX) }}
          </h2>
          <StatusChip
            :label="view.chip.label"
            :tone="view.chip.tone"
            data-app-clientes-estado
          />
        </div>
        <p class="text-sm text-ink-gray-7" data-app-clientes-vista-linea>
          {{ view.line }}
        </p>
      </div>
    </div>
    <a
      v-if="view.link"
      :href="view.link"
      target="_blank"
      rel="noopener"
      :class="['press', BTN.tonal, tall ? 'w-full' : 'max-sm:w-full']"
      :title="__('Opens your store in a new tab', null, CTX)"
      data-app-clientes-ver
    >
      {{ __('See as a customer', null, CTX) }}
      <span class="lucide-external-link size-4" aria-hidden="true" />
    </a>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { StatusChip } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { CTX } from './view'

const props = defineProps({
  /** previewView(state): {on, chip, line, shown, tabs, link} */
  view: { type: Object, required: true },
  /** The shop's name as the customer reads it. */
  shop: { type: String, default: '' },
  /** The desk's column beside the rows: a taller phone. */
  tall: { type: Boolean, default: false },
})

const FITS = computed(() => (props.tall ? 7 : 4))
const sections = computed(() => props.view.shown.slice(0, FITS.value))
const more = computed(() => Math.max(0, props.view.shown.length - FITS.value))
</script>
