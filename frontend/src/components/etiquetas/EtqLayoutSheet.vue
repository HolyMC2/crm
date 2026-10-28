<template>
  <BottomSheet
    :open="open"
    title="Plantilla"
    subtitle="El tamaño y lo que lleva cada etiqueta"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-4" data-etq-layouts>
      <EtqPreview
        :html="sample"
        :loading="loading"
        :min-height="140"
        :max-height="220"
        title="Muestra de la plantilla"
        :empty="problem || 'Elige una plantilla para ver una muestra.'"
      />
      <section v-for="group in groups" :key="group.kind" class="space-y-1">
        <h3 class="text-sm font-semibold text-ink-gray-8">
          {{ group.title }}
        </h3>
        <ul class="-mx-4" role="radiogroup" :aria-label="group.title">
          <li v-for="option in group.layouts" :key="option.key">
            <div class="flex items-center">
              <button
                type="button"
                role="radio"
                :aria-checked="option.key === chosen ? 'true' : 'false'"
                :disabled="!!option.problem"
                class="press flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left disabled:opacity-60"
                @click="choose(option.key)"
              >
                <span
                  class="flex size-5 flex-none items-center justify-center rounded-full border-2"
                  :class="
                    option.key === chosen
                      ? 'border-ink-gray-9'
                      : 'border-outline-gray-3'
                  "
                  aria-hidden="true"
                >
                  <span
                    v-if="option.key === chosen"
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
              <a
                v-if="option.desk_url"
                :href="option.desk_url"
                target="_blank"
                rel="noopener"
                class="press mr-2 flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
                :aria-label="`Editar ${option.label} en el escritorio`"
                :title="`Editar ${option.label} en el escritorio`"
              >
                <span class="lucide-pencil size-4" aria-hidden="true" />
              </a>
            </div>
          </li>
        </ul>
      </section>
      <section
        v-if="current?.kind === 'size' && fields.length"
        class="space-y-2"
        data-etq-fields
      >
        <h3 class="text-sm font-semibold text-ink-gray-8">Qué lleva</h3>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="field in fields"
            :key="field.key"
            type="button"
            :class="chipClass(parts.includes(field.key))"
            :aria-pressed="parts.includes(field.key) ? 'true' : 'false'"
            @click="togglePart(field.key)"
          >
            {{ field.label }}
          </button>
        </div>
      </section>
      <p class="text-sm text-ink-gray-6">
        <template v-if="newTemplateUrl">
          Diseña una plantilla nueva (medidas, textos, códigos) en el
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
          ¿Falta un tamaño? Las plantillas las diseña el encargado en el
          escritorio.
        </template>
      </p>
    </div>
    <template #actions>
      <Button
        variant="solid"
        class="press min-h-11 w-full"
        label="Usar esta plantilla"
        :disabled="!chosen"
        @click="apply"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { useDebounceFn } from '@vueuse/core'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import { chipClass } from '@/components/ui/chipClass'
import EtqPreview from '@/components/etiquetas/EtqPreview.vue'
import {
  etiquetasApi,
  layoutGroups,
  problemText,
} from '@/composables/useEtiquetas'

const props = defineProps({
  open: { type: Boolean, default: false },
  layouts: { type: Array, default: () => [] },
  fields: { type: Array, default: () => [] },
  layout: { type: String, default: '' },
  parts: { type: Array, default: () => [] },
  newTemplateUrl: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'apply'])

const chosen = ref(props.layout)
const parts = ref([...props.parts])
const sample = ref('')
const loading = ref(false)
const problem = ref('')
const groups = computed(() => layoutGroups(props.layouts))
const current = computed(() =>
  props.layouts.find((layout) => layout.key === chosen.value),
)

let ticket = 0
async function draw() {
  if (!props.open || !chosen.value) return
  const mine = ++ticket
  loading.value = true
  problem.value = ''
  try {
    const answer = await etiquetasApi('preview', {
      layout: chosen.value,
      fields: current.value?.kind === 'size' ? parts.value : null,
    })
    if (mine === ticket) sample.value = answer?.html || ''
  } catch (error) {
    if (mine === ticket) {
      sample.value = ''
      problem.value = problemText(error)
    }
  } finally {
    if (mine === ticket) loading.value = false
  }
}
const drawSoon = useDebounceFn(draw, 200)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    chosen.value = props.layout
    parts.value = [...props.parts]
    draw()
  },
  { immediate: true },
)

function choose(key) {
  chosen.value = key
  drawSoon()
}
function togglePart(key) {
  const next = parts.value.includes(key)
    ? parts.value.filter((part) => part !== key)
    : [...parts.value, key]
  // A label with nothing on it is not a label: keep at least one part.
  if (!next.length) return
  parts.value = props.fields
    .map((field) => field.key)
    .filter((part) => next.includes(part))
  drawSoon()
}
function apply() {
  emit('apply', { layout: chosen.value, parts: parts.value })
  emit('update:open', false)
}
</script>
