<template>
  <!-- Plantillas: every layout the shop prints with and a sample of it.
       Designing one stays in the escritorio (medidas, posiciones, códigos);
       only who may edit templates gets the links there. -->
  <section
    aria-label="Plantillas"
    class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start"
    data-etq-templates
  >
    <div class="space-y-4">
      <section v-for="group in groups" :key="group.kind" class="space-y-1">
        <h2 class="px-4 text-sm font-semibold text-ink-gray-8 sm:px-0">
          {{ group.title }}
          <span class="num font-normal text-ink-gray-5">{{
            group.layouts.length
          }}</span>
        </h2>
        <ul
          class="divide-y divide-outline-gray-1 sm:rounded-8 sm:border sm:border-outline-gray-2"
        >
          <li v-for="layout in group.layouts" :key="layout.key">
            <ListRow
              :title="layout.label"
              :subtitle="
                layout.problem ||
                (layout.key === inUse ? 'La que usas para imprimir' : '')
              "
              :subtitle-tone="layout.problem ? 'danger' : ''"
              :meta="layout.size"
              :selected="layout.key === shown"
              @click="show(layout.key)"
            />
          </li>
        </ul>
      </section>
      <p class="px-4 text-sm text-ink-gray-6 sm:px-0">
        <template v-if="newTemplateUrl">
          Las plantillas de diseño (medidas, textos, códigos) se editan en el
          escritorio.
          <a
            :href="newTemplateUrl"
            target="_blank"
            rel="noopener"
            class="font-medium text-ink-gray-9 underline underline-offset-2"
            >Nueva plantilla</a
          >
        </template>
        <template v-else>
          Las plantillas las diseña el encargado en el escritorio. Si falta un
          tamaño, pídeselo.
        </template>
      </p>
    </div>
    <aside
      v-if="current"
      class="sticky top-14 z-10 order-first space-y-3 bg-surface-base px-4 pb-3 sm:px-0 lg:top-4 lg:order-last lg:pb-0"
      :aria-label="`Muestra de ${current.label}`"
      data-etq-template-sample
    >
      <EtqStage
        v-model:index="index"
        class="h-56 lg:h-72"
        :html="sample"
        :size="size"
        :designed="current.kind === 'size'"
        :count="count"
        :loading="loading"
        :label="layoutName(current)"
        :title="`Muestra de ${current.label}`"
        :empty="problem || current.problem || 'Sin muestra.'"
      />
      <p class="text-sm text-ink-gray-6">{{ caption }}</p>
      <div class="flex flex-wrap gap-2">
        <Button
          variant="solid"
          class="press min-h-11 flex-1"
          :disabled="!!current.problem"
          :label="
            current.key === inUse ? 'Imprimir con esta' : 'Usar para imprimir'
          "
          @click="emit('use', current.key)"
        />
        <Button
          v-if="current.desk_url"
          class="press min-h-11"
          label="Editar en el escritorio"
          @click="openDesk(current.desk_url)"
        />
      </div>
    </aside>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { ListRow } from '@/components/ui'
import EtqStage from '@/components/etiquetas/EtqStage.vue'
import {
  etiquetasApi,
  layoutGroups,
  layoutName,
  problemText,
} from '@/composables/useEtiquetas'

const props = defineProps({
  layouts: { type: Array, default: () => [] },
  inUse: { type: String, default: '' },
  // The design the sizes are shown with: the one «Imprimir» uses.
  design: { type: Object, default: null },
  newTemplateUrl: { type: String, default: '' },
})
const emit = defineEmits(['use'])

const groups = computed(() => layoutGroups(props.layouts))
const shown = ref(props.inUse || props.layouts[0]?.key || '')
const current = computed(() =>
  props.layouts.find((layout) => layout.key === shown.value),
)
const sample = ref('')
const size = ref({ w_mm: 0, h_mm: 0 })
const count = ref(1)
const index = ref(0)
const loading = ref(false)
const problem = ref('')
const caption = computed(() => {
  if (!current.value) return ''
  if (current.value.kind === 'size')
    return 'Muestra con un producto de ejemplo y lo que lleva tu etiqueta en «Imprimir».'
  if (current.value.kind === 'format')
    return 'Formato de impresión de la tienda, con un producto de ejemplo.'
  return 'Plantilla de diseño, con un producto de ejemplo.'
})

let ticket = 0
async function draw() {
  const layout = current.value
  if (!layout || layout.problem) {
    sample.value = ''
    return
  }
  const mine = ++ticket
  loading.value = true
  problem.value = ''
  try {
    const answer = await etiquetasApi('preview', {
      layout: layout.key,
      design:
        layout.kind === 'size' && props.design
          ? JSON.stringify(props.design)
          : null,
    })
    if (mine !== ticket) return
    sample.value = answer?.html || ''
    size.value = answer?.size || { w_mm: layout.w_mm, h_mm: layout.h_mm }
    count.value = answer?.shown || 1
  } catch (error) {
    if (mine === ticket) {
      sample.value = ''
      problem.value = problemText(error)
    }
  } finally {
    if (mine === ticket) loading.value = false
  }
}

function show(key) {
  shown.value = key
}
function openDesk(url) {
  window.open(url, '_blank', 'noopener')
}
watch(shown, draw, { immediate: true })
</script>
