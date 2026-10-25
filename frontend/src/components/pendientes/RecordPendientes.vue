<template>
  <!-- A record's pendientes (Shell D8): the open work on this record that
       Frappe lets me read, everyone's, then the last few done. One block any
       record page mounts: <RecordPendientes reference-type="Item" … />. -->
  <section
    v-if="visible"
    :aria-labelledby="headingId"
    class="space-y-1"
    data-record-pendientes
  >
    <div v-if="!bare" class="flex min-h-11 items-center justify-between gap-2">
      <h2 :id="headingId" class="text-base font-semibold text-ink-gray-9">
        {{ title || __('Pendientes') }}
        <span
          v-if="rows.length"
          class="ml-1 rounded-full bg-surface-gray-2 px-2 text-xs font-medium text-ink-gray-7"
          >{{ rows.length }}{{ hasMore ? '+' : '' }}</span
        >
      </h2>
      <Button
        v-if="canCreate"
        variant="ghost"
        :icon-left="LucidePlus"
        class="min-h-11 sm:min-h-8"
        :label="__('Add')"
        @click="createOpen = true"
      />
    </div>
    <h3
      v-else-if="rows.length"
      :id="headingId"
      class="pt-2 text-sm font-semibold text-ink-gray-7"
    >
      {{ title || __('Pendientes') }}
    </h3>
    <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
      {{ problem }}
    </p>
    <p
      v-else-if="loaded && !rows.length && !bare"
      class="text-sm text-ink-gray-6"
    >
      {{ __('No open pendientes on this record.') }}
    </p>
    <ul v-if="rows.length" class="divide-y divide-outline-gray-1">
      <li v-for="row in rows" :key="row.doctype + row.name">
        <RouterLink
          :to="open(row)"
          class="flex min-h-12 items-start gap-3 rounded-6 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
        >
          <span
            class="mt-0.5 size-5 flex-none rounded-full border-2 border-outline-gray-4"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="line-clamp-2 block text-base text-ink-gray-9">{{
              row.description
            }}</span>
            <span class="mt-0.5 flex flex-wrap gap-x-2 text-sm text-ink-gray-6">
              <span :class="dueClass(row)">{{ dueText(row, today) }}</span>
              <span v-if="!row.mine && row.assigned_to_name">{{
                __('For {0}', [row.assigned_to_name])
              }}</span>
              <span v-if="stateChip(row)" class="font-medium">{{
                stateChip(row).label
              }}</span>
            </span>
          </span>
        </RouterLink>
      </li>
    </ul>
    <template v-if="done.length">
      <button
        type="button"
        class="flex min-h-11 w-full items-center gap-2 text-left text-sm font-medium text-ink-gray-7"
        :aria-expanded="String(doneOpen)"
        @click="doneOpen = !doneOpen"
      >
        {{
          bare && !rows.length && title
            ? `${title} · ${__('Completed ({0})', [done.length])}`
            : __('Completed ({0})', [done.length])
        }}
        <span
          class="lucide-chevron-down size-4 transition-transform"
          :class="doneOpen ? 'rotate-180' : ''"
          aria-hidden="true"
        />
      </button>
      <ul v-if="doneOpen" class="divide-y divide-outline-gray-1">
        <li v-for="row in done" :key="row.doctype + row.name">
          <RouterLink
            :to="open(row)"
            class="flex min-h-11 items-start gap-3 rounded-6 py-2 text-ink-gray-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
          >
            <span
              class="mt-0.5 flex size-5 flex-none items-center justify-center rounded-full bg-surface-green-7 text-white"
              aria-hidden="true"
              ><span class="lucide-check size-3.5"
            /></span>
            <span class="min-w-0 flex-1">
              <span class="line-clamp-2 block text-base line-through">{{
                row.description
              }}</span>
              <span
                v-if="!row.mine && row.assigned_to_name"
                class="block text-sm"
                >{{ __('Done by {0}', [row.assigned_to_name]) }}</span
              >
            </span>
          </RouterLink>
        </li>
      </ul>
    </template>
    <CreateDialog
      v-if="canCreate && !bare && createLoaded"
      v-model="createOpen"
      :today="today"
      :reference="reference"
      @created="reload"
    />
  </section>
</template>
<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from 'frappe-ui'
import { shellBoot } from '@/composables/muelleShell'
import {
  dueText,
  pendienteError,
  pendienteRoute,
  pendientesApi,
  stateChip,
} from '@/composables/usePendientes'
import LucidePlus from '~icons/lucide/plus'

// The editor (sheet, date field) loads on the first «Add», not with the record.
const CreateDialog = defineAsyncComponent(
  () => import('@/components/pendientes/CreateDialog.vue'),
)

const props = defineProps({
  referenceType: { type: String, required: true },
  referenceName: { type: String, required: true },
  referenceLabel: { type: String, default: '' },
  title: { type: String, default: '' },
  /** Leave my own out (a page that already lists them, like Contacto). */
  othersOnly: { type: Boolean, default: false },
  /** A sub-list inside the caller's own section: no heading row, no «Add». */
  bare: { type: Boolean, default: false },
  /** Where «back» returns to, e.g. «Producto». */
  returnLabel: { type: String, default: '' },
})
const route = useRoute()
const boot = computed(() => shellBoot.value?.modules?.pendientes || null)
const today = computed(() => boot.value?.today || '')
const canCreate = computed(() => Boolean(boot.value?.capabilities?.create))
const headingId = `record-pendientes-${Math.random().toString(36).slice(2, 8)}`
const reference = computed(() => ({
  reference_type: props.referenceType,
  reference_name: props.referenceName,
  reference_label: props.referenceLabel,
}))
const all = ref({ rows: [], done: [], has_more: false }),
  loaded = ref(false),
  problem = ref(''),
  doneOpen = ref(false),
  refused = ref(false),
  createOpen = ref(false),
  createLoaded = ref(false)
watch(createOpen, (open) => open && (createLoaded.value = true))
const keep = (row) => !props.othersOnly || !row.mine
const rows = computed(() => (all.value.rows || []).filter(keep))
const done = computed(() => (all.value.done || []).filter(keep))
const hasMore = computed(() => Boolean(all.value.has_more))
// Without Pendientes there is nothing to show; a bare sub-list hides when empty.
const visible = computed(
  () =>
    Boolean(boot.value?.enabled) &&
    !refused.value &&
    (!props.bare || rows.value.length || done.value.length),
)

function open(row) {
  return pendienteRoute(row, {
    // The router's paths omit the /crm base; the return protocol carries it.
    return_to: `/crm${route.fullPath}`,
    return_label: props.returnLabel || props.referenceLabel || '',
  })
}
function dueClass(row) {
  return row.group === 'overdue'
    ? 'font-medium text-ink-red-7'
    : row.group === 'today'
      ? 'font-medium text-ink-amber-9'
      : ''
}
async function reload() {
  if (!boot.value?.enabled || !props.referenceName) return
  problem.value = ''
  refused.value = false
  try {
    all.value = await pendientesApi('on_record', {
      reference_type: props.referenceType,
      reference_name: props.referenceName,
    })
  } catch (error) {
    // A record I may not read has no pendientes for me; anything else says why.
    const reason = pendienteError(error)
    problem.value = reason.kind === 'permission' ? '' : reason.detail
    // A record that can't hold pendientes (a Note, a Desk record) hides the card.
    refused.value = reason.kind === 'permission'
    all.value = { rows: [], done: [], has_more: false }
  } finally {
    loaded.value = true
  }
}
watch(() => [props.referenceType, props.referenceName], reload)
watch(() => boot.value?.enabled, reload)
onMounted(reload)
defineExpose({ reload })
</script>
