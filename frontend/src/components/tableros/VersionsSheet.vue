<template>
  <!-- «Versiones»: the board's named versions and its recent changes (doco
       tableros service.versiones). A restore is a save like any other, so
       «Deshacer» brings back what it replaced. -->
  <BottomSheet
    :open="open"
    title="Versiones"
    :subtitle="board?.title || ''"
    flush
    @update:open="(value) => $emit('update:open', value)"
  >
    <form
      v-if="board?.can_write"
      class="flex items-end gap-2 px-4 pb-3"
      data-testid="version-save"
      @submit.prevent="save"
    >
      <FormControl
        v-model="label"
        class="min-w-0 flex-1 [&_input]:min-h-11"
        type="text"
        label="Guardar como está ahora"
        placeholder="Antes de la temporada"
        :maxlength="80"
      />
      <Button
        type="submit"
        variant="solid"
        class="min-h-11"
        label="Guardar versión"
        :loading="busy === 'save'"
      />
    </form>
    <p
      v-if="problem"
      role="alert"
      class="mx-4 mb-2 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
    >
      {{ problem }}
    </p>
    <p v-if="loading && !data" class="px-4 py-3 text-sm text-ink-gray-6">
      Cargando las versiones…
    </p>

    <template v-if="data">
      <h3 class="px-4 pb-1 pt-2 text-sm font-medium text-ink-gray-8">
        Guardadas
      </h3>
      <p
        v-if="!data.versiones.length"
        class="px-4 pb-3 text-sm text-ink-gray-6"
      >
        Todavía no guardas ninguna. Guarda una antes de un cambio grande y
        vuelve a ella cuando quieras.
      </p>
      <ul class="divide-y divide-outline-gray-1" data-testid="versions">
        <li
          v-for="v in data.versiones"
          :key="v.name"
          class="flex min-h-14 items-center gap-3 px-4 py-2"
        >
          <span
            class="lucide-bookmark size-5 shrink-0 text-ink-gray-6"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-base text-ink-gray-9">{{ v.etiqueta }}</p>
            <p class="line-clamp-2 text-sm text-ink-gray-6">
              {{ when(v.at) }}, {{ whoSaved(v) }}, {{ count(v.widgets) }}
            </p>
          </div>
          <template v-if="data.can_write">
            <Button
              class="min-h-11"
              :label="confirming === v.name ? 'Sí, volver' : 'Volver a esta'"
              :theme="confirming === v.name ? 'blue' : 'gray'"
              :variant="confirming === v.name ? 'solid' : 'subtle'"
              :loading="busy === v.name"
              :data-testid="`version-restore-${v.name}`"
              @click="restore({ version: v.name }, v.name)"
            />
            <button
              v-if="removing !== v.name"
              type="button"
              class="press flex size-11 shrink-0 items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
              :aria-label="`Borrar la versión «${v.etiqueta}»`"
              title="Borrar"
              @click="removing = v.name"
            >
              <span class="lucide-trash-2 size-4" aria-hidden="true" />
            </button>
            <Button
              v-else
              theme="red"
              variant="subtle"
              class="min-h-11"
              label="Borrar"
              @click="remove(v)"
            />
          </template>
        </li>
      </ul>

      <h3 class="px-4 pb-1 pt-4 text-sm font-medium text-ink-gray-8">
        Cambios recientes
      </h3>
      <p v-if="!data.cambios.length" class="px-4 pb-3 text-sm text-ink-gray-6">
        Aquí aparece cada cambio que hagan tú o Muelle, para volver a como
        estaba antes.
      </p>
      <ul class="divide-y divide-outline-gray-1" data-testid="changes">
        <li
          v-for="c in data.cambios"
          :key="c.revision"
          class="flex min-h-14 items-center gap-3 px-4 py-2"
        >
          <span
            :class="c.by === 'bot' ? 'lucide-sparkles' : 'lucide-pencil'"
            class="size-5 shrink-0 text-ink-gray-6"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <p class="line-clamp-2 text-base text-ink-gray-9">
              {{ changeLine(c) }}
            </p>
            <p class="truncate text-sm text-ink-gray-6">{{ when(c.at) }}</p>
          </div>
          <Button
            v-if="data.can_write"
            class="min-h-11"
            :label="
              confirming === `r${c.revision}` ? 'Sí, volver' : 'Volver a antes'
            "
            :theme="confirming === `r${c.revision}` ? 'blue' : 'gray'"
            :variant="confirming === `r${c.revision}` ? 'solid' : 'subtle'"
            :loading="busy === `r${c.revision}`"
            :data-testid="`change-restore-${c.revision}`"
            @click="restore({ revision: c.revision }, `r${c.revision}`)"
          />
        </li>
      </ul>
      <p class="px-4 pb-2 pt-3 text-xs text-ink-gray-6">
        Volver a una versión también se puede deshacer.
      </p>
    </template>
  </BottomSheet>
</template>
<script setup>
import { ref, watch } from 'vue'
import { Button, FormControl, toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { problemOf } from '@/composables/useCobranza'
import { tablerosApi } from '@/tableros/board'
import { formatDateTime } from '@/utils/display'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The board as tablerosApi('abrir') answers it. */
  board: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'restored'])

const data = ref(null)
const loading = ref(false)
const problem = ref('')
const label = ref('')
const busy = ref('')
const confirming = ref('')
const removing = ref('')
let confirmTimer = null

async function load() {
  if (!props.board?.name) return
  loading.value = true
  problem.value = ''
  try {
    data.value = await tablerosApi('versiones', { name: props.board.name })
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.open, props.board?.name, props.board?.revision],
  ([open]) => {
    if (!open) return
    confirming.value = ''
    removing.value = ''
    load()
  },
  { immediate: true },
)

const when = (at) => formatDateTime(at)
const count = (n) => (n === 1 ? '1 pieza' : `${n} piezas`)
function whoSaved(v) {
  if (v.por === 'bot') return 'la guardó Muelle'
  return v.mine ? 'la guardaste tú' : `la guardó ${v.owner_name}`
}
function whoChanged(c) {
  if (c.by === 'bot')
    return c.mine || !c.user_name ? 'Muelle' : `Muelle, por ${c.user_name},`
  return c.mine || !c.user_name ? 'Tú:' : `${c.user_name}:`
}
// A save from before the history named who made it says only that.
function changeLine(c) {
  if (!c.by) return c.resumen || 'Un cambio de antes'
  return `${whoChanged(c)} ${c.resumen || 'lo cambió'}`
}

async function save() {
  busy.value = 'save'
  problem.value = ''
  try {
    data.value = await tablerosApi('guardar_version', {
      name: props.board.name,
      etiqueta: label.value.trim() || undefined,
    })
    label.value = ''
    toast.success('Versión guardada.')
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = ''
  }
}

/** Two taps in place: the first asks, the second restores. */
async function restore(args, key) {
  if (confirming.value !== key) {
    confirming.value = key
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => (confirming.value = ''), 4000)
    return
  }
  busy.value = key
  problem.value = ''
  try {
    const view = await tablerosApi('restaurar', {
      name: props.board.name,
      ...args,
    })
    emit('restored', view)
    emit('update:open', false)
    toast.success('Listo, quedó como esa versión. «Deshacer» lo regresa.')
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = ''
    confirming.value = ''
  }
}

async function remove(v) {
  busy.value = v.name
  problem.value = ''
  try {
    data.value = await tablerosApi('borrar_version', {
      name: props.board.name,
      version: v.name,
    })
    toast.success('Versión borrada.')
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = ''
    removing.value = ''
  }
}
</script>
