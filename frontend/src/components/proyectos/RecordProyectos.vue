<template>
  <!-- The projects this record's pendientes belong to (Shell F14c): «Motor
       Tsuru · 4 de 9 hechos», each opening the plan with the way back here.
       A project this person cannot read is «En un proyecto»: no name, no link.
       «Crear un proyecto» makes one and its first pendiente on this record,
       without leaving the page. -->
  <section
    v-if="visible"
    class="space-y-1"
    data-record-proyectos
    :aria-label="__('Projects')"
  >
    <ul v-if="rows.length" class="divide-y divide-outline-gray-1">
      <li v-for="(row, index) in rows" :key="row.name || `oculto-${index}`">
        <RouterLink
          v-if="row.name"
          :to="openRoute(row)"
          class="press flex min-h-12 items-center gap-3 rounded-6 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          data-record-proyecto
        >
          <span
            class="lucide-folder-kanban size-5 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-base text-ink-gray-9">{{
              row.project_name
            }}</span>
            <span class="block text-sm text-ink-gray-6">{{
              recordProyectoLine(row)
            }}</span>
          </span>
        </RouterLink>
        <p
          v-else
          class="flex min-h-12 items-center gap-3 py-2 text-sm text-ink-gray-6"
        >
          <span
            class="lucide-folder-kanban size-5 flex-none"
            aria-hidden="true"
          />
          {{ __('In a project') }}
        </p>
      </li>
    </ul>
    <button
      v-if="canCreate"
      type="button"
      class="press inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-medium text-ink-gray-8 hover:text-ink-gray-9"
      data-record-proyecto-create
      @click="sheetOpen = true"
    >
      <span class="lucide-plus size-4" aria-hidden="true" />{{
        __('Create a project for this record')
      }}
    </button>
    <ProyectoSheet
      v-if="sheetUsed"
      v-model="sheetOpen"
      :today="today"
      :initial-name="referenceLabel"
      @saved="afterProject"
    />
    <CreateDialog
      v-if="dialogUsed"
      v-model="dialogOpen"
      :today="today"
      :reference="reference"
      :prefill="firstPendiente"
      @created="load"
    />
  </section>
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { shellBoot } from '@/composables/muelleShell'
import {
  proyectoRoute,
  proyectosApi,
  recordProyectoLine,
} from '@/composables/useProyectos'

// Both sheets load on their first open, never with the record.
const ProyectoSheet = defineAsyncComponent(
  () => import('@/components/proyectos/ProyectoSheet.vue'),
)
const CreateDialog = defineAsyncComponent(
  () => import('@/components/pendientes/CreateDialog.vue'),
)

const props = defineProps({
  referenceType: { type: String, required: true },
  referenceName: { type: String, required: true },
  /** The record in words («Trato iPhone 13 — Ana»): the new project's suggested name. */
  referenceLabel: { type: String, default: '' },
  /** Where «back» returns to from the plan, e.g. «el trato». */
  returnLabel: { type: String, default: '' },
})
const route = useRoute()
const boot = computed(() => shellBoot.value?.modules?.proyectos || null)
const pendientes = computed(() => shellBoot.value?.modules?.pendientes || null)
const today = computed(() => boot.value?.today || pendientes.value?.today || '')
const rows = ref([]),
  mayCreate = ref(false),
  sheetOpen = ref(false),
  sheetUsed = ref(false),
  dialogOpen = ref(false),
  dialogUsed = ref(false),
  created = ref(null)
watch(sheetOpen, (open) => open && (sheetUsed.value = true))
watch(dialogOpen, (open) => open && (dialogUsed.value = true))
const canCreate = computed(
  () =>
    mayCreate.value &&
    Boolean(boot.value?.capabilities?.create) &&
    Boolean(pendientes.value?.capabilities?.create),
)
// Nothing to say: no projects here and no way to make one.
const visible = computed(() => rows.value.length > 0 || canCreate.value)
const reference = computed(() => ({
  reference_type: props.referenceType,
  reference_name: props.referenceName,
  reference_label: props.referenceLabel,
}))
const firstPendiente = computed(() =>
  created.value
    ? {
        project: created.value.name,
        project_name: created.value.project_name,
      }
    : null,
)

function openRoute(row) {
  return proyectoRoute(row.name, {
    // the router's paths sit under /crm/; the shell protocol names the whole path
    return_to: `/crm${route.fullPath}`,
    return_label: String(props.returnLabel || props.referenceLabel || '').slice(
      0,
      40,
    ),
  })
}

let generation = 0
async function load() {
  if (!props.referenceName || !pendientes.value?.enabled) return
  const current = ++generation
  try {
    const answer = await proyectosApi('de_registro', {
      reference_type: props.referenceType,
      reference_name: props.referenceName,
    })
    if (current !== generation) return
    rows.value = answer?.rows || []
    mayCreate.value = Boolean(answer?.can_create)
  } catch {
    // The record page stays whole; the block just says nothing.
    if (current === generation) rows.value = []
  }
}
function afterProject(project) {
  created.value = project
  dialogOpen.value = true
  load()
}
onMounted(load)
watch(() => [props.referenceType, props.referenceName], load)
</script>
