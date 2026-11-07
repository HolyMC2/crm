<template>
  <!-- «Biblioteca»: the charts and components the person kept (their own and
       the ones shared with them), each with its versions (doco tableros
       service.componentes). Adding one puts a copy on the board that knows
       where it came from, so it can catch up with a newer version later. -->
  <BottomSheet
    :open="open"
    title="Biblioteca"
    subtitle="Gráficas y piezas que guardaste para usarlas en cualquier vista."
    flush
    @update:open="(value) => $emit('update:open', value)"
  >
    <div class="px-4 pb-2">
      <input
        v-model="search"
        type="search"
        class="min-h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 placeholder-ink-gray-5 focus:ring-0"
        placeholder="Buscar en la biblioteca"
        aria-label="Buscar en la biblioteca"
      />
    </div>
    <p
      v-if="problem"
      role="alert"
      class="mx-4 mb-2 rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
    >
      {{ problem }}
    </p>
    <p v-if="loading && !rows" class="px-4 py-3 text-sm text-ink-gray-6">
      Cargando la biblioteca…
    </p>
    <p
      v-else-if="rows && !rows.length"
      class="px-4 py-3 text-sm text-ink-gray-6"
      data-testid="library-empty"
    >
      Todavía no guardas nada. Abre una gráfica con el lápiz y toca «Guardar en
      la biblioteca».
    </p>
    <p
      v-else-if="rows && !shown.length"
      class="px-4 py-3 text-sm text-ink-gray-6"
    >
      Nada con esas palabras.
    </p>

    <ul class="divide-y divide-outline-gray-1" data-testid="library">
      <li v-for="c in shown" :key="c.name" class="px-4 py-2">
        <div class="flex min-h-12 items-center gap-3">
          <span
            :class="tipoOf(c.widget).icon"
            class="size-5 shrink-0 text-ink-gray-6"
            aria-hidden="true"
          />
          <button
            type="button"
            class="press min-w-0 flex-1 text-left"
            :aria-expanded="openRow === c.name ? 'true' : 'false'"
            :data-testid="`component-${c.name}`"
            @click="toggle(c)"
          >
            <span class="block truncate text-base text-ink-gray-9">{{
              c.title
            }}</span>
            <span class="block truncate text-sm text-ink-gray-6">
              {{ tipoOf(c.widget).label }}, versión {{ c.revision
              }}{{ c.mine ? '' : `, de ${c.owner_name}` }}
            </span>
          </button>
          <Button
            v-if="canWrite"
            variant="solid"
            class="min-h-11"
            label="Agregar"
            :loading="busy === c.name"
            :data-testid="`component-insert-${c.name}`"
            @click="insert(c)"
          />
          <template v-if="c.mine">
            <button
              v-if="removing !== c.name"
              type="button"
              class="press flex size-11 shrink-0 items-center justify-center rounded-full text-ink-gray-6 hover:bg-surface-gray-2"
              :aria-label="`Borrar «${c.title}» de la biblioteca`"
              title="Borrar"
              @click="removing = c.name"
            >
              <span class="lucide-trash-2 size-4" aria-hidden="true" />
            </button>
            <Button
              v-else
              theme="red"
              variant="subtle"
              class="min-h-11"
              label="Borrar"
              :data-testid="`component-remove-${c.name}`"
              @click="remove(c)"
            />
          </template>
        </div>

        <div
          v-if="openRow === c.name"
          class="mb-2 ml-8 rounded-6 bg-surface-gray-1 p-2"
          :data-testid="`component-versions-${c.name}`"
        >
          <p v-if="c.descripcion" class="px-2 pb-2 text-sm text-ink-gray-7">
            {{ c.descripcion }}
          </p>
          <p v-if="!history[c.name]" class="px-2 py-1 text-sm text-ink-gray-6">
            Cargando las versiones…
          </p>
          <ul v-else class="divide-y divide-outline-gray-1">
            <li
              v-for="v in history[c.name]"
              :key="v.revision"
              class="flex min-h-12 flex-wrap items-center gap-2 px-2 py-1"
            >
              <div class="min-w-0 flex-1 basis-40">
                <p class="truncate text-sm text-ink-gray-9">
                  Versión {{ v.revision
                  }}{{ v.etiqueta ? `: ${v.etiqueta}` : '' }}
                  <span
                    v-if="v.revision === c.revision"
                    class="text-ink-gray-6"
                  >
                    (la actual)</span
                  >
                </p>
                <p class="truncate text-xs text-ink-gray-6">
                  {{ when(v.at)
                  }}{{ v.by === 'bot' ? ', la guardó Muelle' : '' }}
                </p>
              </div>
              <!-- On a phone the two buttons drop under the version's name. -->
              <div
                v-if="v.revision !== c.revision"
                class="ml-auto flex shrink-0 gap-2"
              >
                <Button
                  v-if="canWrite"
                  class="min-h-11"
                  label="Agregar esta"
                  :loading="busy === `${c.name}:${v.revision}`"
                  @click="insert(c, v.revision)"
                />
                <Button
                  v-if="c.mine"
                  class="min-h-11"
                  label="Volver a esta"
                  :loading="busy === `r${c.name}:${v.revision}`"
                  @click="restore(c, v.revision)"
                />
              </div>
            </li>
          </ul>
        </div>
      </li>
    </ul>
    <p
      v-if="!canWrite && rows?.length"
      class="px-4 py-3 text-sm text-ink-gray-6"
    >
      Esta vista es de alguien más y solo la puedes ver. Haz tu copia para
      agregarle piezas.
    </p>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { problemOf } from '@/composables/useCobranza'
import { matchTokens } from '@/vendor/muelle-shell/contracts/search'
import { tablerosApi, tipoOf } from '@/tableros/board'
import { formatDateTime } from '@/utils/display'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The board a component is added to. */
  tablero: { type: String, default: '' },
  canWrite: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'inserted'])

const rows = ref(null)
const loading = ref(false)
const problem = ref('')
const search = ref('')
const openRow = ref('')
const busy = ref('')
const removing = ref('')
const history = reactive({})

async function load() {
  loading.value = true
  problem.value = ''
  try {
    rows.value = await tablerosApi('componentes')
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    loading.value = false
  }
}
watch(
  () => props.open,
  (open) => {
    if (!open) return
    removing.value = ''
    load()
  },
  { immediate: true },
)

const shown = computed(() =>
  (rows.value || []).filter((c) =>
    matchTokens(search.value, c.title, c.descripcion, tipoOf(c.widget).label),
  ),
)
const when = (at) => formatDateTime(at)

async function toggle(c) {
  openRow.value = openRow.value === c.name ? '' : c.name
  if (!openRow.value) return
  try {
    const full = await tablerosApi('componente', { name: c.name })
    history[c.name] = full.versiones || []
  } catch (error) {
    problem.value = problemOf(error).detail
  }
}

async function insert(c, revision = null) {
  busy.value = revision ? `${c.name}:${revision}` : c.name
  problem.value = ''
  try {
    const view = await tablerosApi('insertar_componente', {
      name: c.name,
      tablero: props.tablero,
      ...(revision ? { revision } : {}),
    })
    emit('inserted', view)
    emit('update:open', false)
    toast.success(`«${c.title}» quedó al final de la vista.`)
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = ''
  }
}

async function restore(c, revision) {
  busy.value = `r${c.name}:${revision}`
  problem.value = ''
  try {
    const out = await tablerosApi('restaurar_componente', {
      name: c.name,
      revision,
    })
    history[c.name] = out.versiones || []
    rows.value = rows.value.map((row) =>
      row.name === c.name ? { ...row, ...out } : row,
    )
    toast.success(
      `«${c.title}» volvió a la versión ${revision}, guardada como la ${out.revision}.`,
    )
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = ''
  }
}

async function remove(c) {
  busy.value = c.name
  problem.value = ''
  try {
    await tablerosApi('borrar_componente', { name: c.name })
    rows.value = rows.value.filter((row) => row.name !== c.name)
    toast.success(
      `«${c.title}» salió de la biblioteca. Las copias en tus vistas se quedan.`,
    )
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = ''
    removing.value = ''
  }
}
</script>
