<template>
  <!-- «Agregar a un tablero» under a chart answer: the chart becomes a live
       widget (doco tableros.api.agregar_respuesta), read again for whoever
       looks at the board. -->
  <BottomSheet
    :open="open"
    title="Agregar a un tablero"
    flush
    @update:open="(value) => $emit('update:open', value)"
  >
    <p
      v-if="problem"
      role="alert"
      class="mx-4 mb-2 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
    >
      {{ problem }}
    </p>
    <p v-if="loading" class="px-4 py-3 text-sm text-ink-gray-6">
      Cargando tus tableros…
    </p>
    <ul v-else class="divide-y divide-outline-gray-1">
      <li v-for="row in boards" :key="row.name">
        <button
          type="button"
          class="press flex min-h-14 w-full items-center gap-3 px-4 text-left hover:bg-surface-gray-2"
          :disabled="Boolean(busy)"
          :data-testid="`add-to-${row.name}`"
          @click="add(row)"
        >
          <span
            class="lucide-layout-dashboard size-5 text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 truncate text-base text-ink-gray-9">{{
            row.title
          }}</span>
          <span v-if="busy === row.name" class="text-sm text-ink-gray-6"
            >Agregando…</span
          >
        </button>
      </li>
      <li>
        <button
          type="button"
          class="press flex min-h-14 w-full items-center gap-3 px-4 text-left font-medium text-ink-gray-9 hover:bg-surface-gray-2"
          :disabled="Boolean(busy)"
          data-testid="add-to-new"
          @click="add(null)"
        >
          <span class="lucide-plus size-5" aria-hidden="true" />
          {{ busy === 'new' ? 'Creando…' : 'Tablero nuevo con esta gráfica' }}
        </button>
      </li>
    </ul>
  </BottomSheet>
</template>
<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { problemOf } from '@/composables/useCobranza'
import { HOME, tablerosApi } from '@/tableros/board'

const props = defineProps({
  open: { type: Boolean, default: false },
  answer: { type: Object, required: true },
  title: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'added'])

const router = useRouter()
const boards = ref([])
const loading = ref(false)
const busy = ref('')
const problem = ref('')

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    problem.value = ''
    loading.value = true
    try {
      boards.value = (await tablerosApi('listar')).filter((r) => r.mine)
    } catch (error) {
      problem.value = problemOf(error).detail
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

async function add(row) {
  busy.value = row ? row.name : 'new'
  problem.value = ''
  try {
    const board = await tablerosApi('agregar_respuesta', {
      answer_id: props.answer.id,
      name: row?.name || undefined,
      title: row ? undefined : props.title || 'Mi tablero',
    })
    emit('update:open', false)
    emit('added', board)
    toast.success(`Agregada a «${board.title}».`)
    router.push(`${HOME}/${board.name}`)
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = ''
  }
}
</script>
