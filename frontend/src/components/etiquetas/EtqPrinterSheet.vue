<template>
  <!-- «Impresora de etiquetas»: where this computer's labels go. The
       browser's dialog, or a printer Muelle QZ sees here; one tap picks it and
       every print from this computer goes there with no dialog. -->
  <BottomSheet
    :open="open"
    title="Impresora de etiquetas"
    subtitle="De este equipo"
    flush
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-2 pb-4" data-etq-printers>
      <ul class="divide-y divide-outline-gray-1">
        <li v-for="option in options" :key="option.value">
          <button
            type="button"
            class="press flex min-h-12 w-full items-center gap-3 px-5 py-2 text-left hover:bg-surface-gray-1"
            :aria-pressed="option.value === current"
            :data-etq-printer="option.value"
            @click="pick(option.value)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-base text-ink-gray-9">{{
                option.label
              }}</span>
              <span class="block truncate text-sm text-ink-gray-6">{{
                option.line
              }}</span>
            </span>
            <span
              v-if="option.value === current"
              class="lucide-check size-5 flex-none text-ink-gray-9"
              aria-hidden="true"
            />
          </button>
        </li>
      </ul>
      <ul v-if="loading" class="space-y-2 px-5" aria-hidden="true">
        <li
          v-for="n in 2"
          :key="n"
          class="h-12 animate-pulse rounded-6 bg-surface-gray-2 motion-reduce:animate-none"
        />
      </ul>
      <div v-else-if="missing" class="space-y-3 px-5 pt-2" data-etq-qz-missing>
        <p class="text-sm text-ink-gray-7">
          Para que salgan directo, sin el diálogo, este equipo necesita Muelle
          QZ abierto. Ábrelo o instálalo y vuelve a buscar.
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            class="press min-h-11"
            label="Volver a buscar"
            data-etq-qz-again
            @click="load"
          />
          <a
            v-for="installer in installers"
            :key="installer.key"
            :href="installer.href"
            class="press inline-flex min-h-11 items-center rounded-8 px-3 text-base font-medium text-ink-gray-8 hover:bg-surface-gray-2"
            :data-etq-qz-installer="installer.key"
            >Descargar para {{ installer.label }}</a
          >
        </div>
      </div>
      <p v-else-if="!printers.length" class="px-5 pt-2 text-sm text-ink-gray-6">
        Muelle QZ no ve impresoras en este equipo. Conecta la de etiquetas,
        agrégala al sistema y vuelve a buscar.
      </p>
    </div>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import BottomSheet from '@/components/ui/BottomSheet.vue'
import { findLabelPrinters, qzInstallers } from '@/composables/etiquetasDirecto'

const props = defineProps({
  open: { type: Boolean, default: false },
  // The printer chosen now ('' = the browser's dialog).
  current: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'pick'])

const printers = ref([])
const loading = ref(false)
const missing = ref(false)
const installers = ref([])

const options = computed(() => {
  const list = [
    {
      value: '',
      label: 'Diálogo del navegador',
      line: 'Eliges la impresora cada vez',
    },
  ]
  const names = new Set(printers.value)
  // The one chosen stays in sight while QZ is closed or no longer sees it.
  if (props.current) names.add(props.current)
  for (const name of names)
    list.push({
      value: name,
      label: name,
      line: printers.value.includes(name)
        ? 'Directo, sin diálogo'
        : 'Muelle QZ no la ve ahora',
    })
  return list
})

let ticket = 0
async function load() {
  const mine = ++ticket
  loading.value = true
  const found = await findLabelPrinters()
  if (mine !== ticket) return
  printers.value = found.printers
  missing.value = found.missing
  loading.value = false
  if (found.missing && !installers.value.length)
    installers.value = await qzInstallers()
}
watch(
  () => props.open,
  (open) => open && load(),
  { immediate: true },
)

function pick(value) {
  emit('pick', value)
  emit('update:open', false)
}
</script>
