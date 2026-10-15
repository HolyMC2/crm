<template>
  <section class="space-y-4" :aria-label="__('Mappings')">
    <div>
      <h3 class="text-base font-semibold text-ink-gray-9">
        {{ __('Mappings') }}
      </h3>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'Who each Paperless correspondent is in Muelle, and what each document type means. Muelle suggests them; what you choose here always wins.',
          )
        }}
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button
        class="min-h-11 sm:min-h-0"
        icon-left="download"
        :label="__('Bring all from Paperless')"
        :loading="catalogLoading"
        @click="emit('load-catalog')"
      />
      <FormControl
        v-if="rows.length > 8"
        v-model="search"
        class="min-w-0 flex-1 [&_input]:min-h-11 sm:[&_input]:min-h-0"
        type="text"
        :placeholder="__('Search')"
        :aria-label="__('Search mappings')"
      />
    </div>
    <p v-if="catalogError" role="alert" class="text-sm text-ink-red-4">
      {{ catalogError }}
    </p>
    <p
      v-if="!rows.length"
      class="rounded-lg bg-surface-gray-1 p-3 text-sm text-ink-gray-7"
    >
      {{
        __(
          'Nothing to map yet. They appear after trying the import or receiving the first documents, or bring them all from Paperless.',
        )
      }}
    </p>

    <div v-if="correspondents.length" class="space-y-2">
      <h4 class="text-sm font-medium text-ink-gray-8">
        {{ __('Correspondents → supplier or customer') }}
      </h4>
      <ul class="divide-y divide-outline-gray-1">
        <li
          v-for="row in correspondents"
          :key="row.remote_id"
          class="space-y-2 py-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="min-w-0 flex-1 truncate text-base font-medium text-ink-gray-9"
              >{{ row.remote_name || `#${row.remote_id}` }}</span
            >
            <Badge
              v-if="row.via"
              :theme="viaTheme(row.via)"
              :label="viaLabel(row.via)"
            />
            <span v-if="row.rfc" class="text-sm text-ink-gray-5">{{
              __('RFC {0}', [row.rfc])
            }}</span>
          </div>
          <div class="grid gap-2 sm:grid-cols-[12rem_1fr]">
            <FormControl
              v-model="row.party_type"
              class="h-11 sm:h-auto"
              type="select"
              :aria-label="
                __('Supplier or customer for {0}', [row.remote_name])
              "
              :options="partyTypeOptions"
            />
            <FormControl
              v-model="row.party"
              class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
              type="text"
              :disabled="!row.party_type"
              :placeholder="
                row.party_type
                  ? __('Exact name as it is in Muelle')
                  : __('Choose supplier or customer first')
              "
              :aria-label="__('Who is {0} in Muelle', [row.remote_name])"
              maxlength="140"
            />
          </div>
        </li>
      </ul>
    </div>

    <div v-if="documentTypes.length" class="space-y-2">
      <h4 class="text-sm font-medium text-ink-gray-8">
        {{ __('Document types → type in Archivos') }}
      </h4>
      <ul class="divide-y divide-outline-gray-1">
        <li
          v-for="row in documentTypes"
          :key="row.remote_id"
          class="grid items-center gap-2 py-2 sm:grid-cols-[1fr_14rem]"
        >
          <span class="flex min-w-0 items-center gap-2">
            <span class="truncate text-base text-ink-gray-9">{{
              row.remote_name || `#${row.remote_id}`
            }}</span>
            <Badge
              v-if="row.via"
              :theme="viaTheme(row.via)"
              :label="viaLabel(row.via)"
            />
          </span>
          <FormControl
            v-model="row.document_kind"
            class="h-11 sm:h-auto"
            type="select"
            :aria-label="__('Type in Archivos for {0}', [row.remote_name])"
            :placeholder="__('Choose a type')"
            :options="kindOptions"
          />
        </li>
      </ul>
    </div>

    <div
      v-if="saveError"
      role="alert"
      class="rounded-lg border border-outline-red-2 bg-surface-red-1 p-3 text-base text-ink-red-4"
    >
      {{ saveError }}
    </div>
    <div v-if="rows.length" class="flex flex-wrap items-center gap-2">
      <Button
        variant="solid"
        class="min-h-11 sm:min-h-0"
        :label="
          changes.length
            ? __('Save {0} changes', [changes.length])
            : __('Save mappings')
        "
        :disabled="!changes.length"
        :loading="saving"
        @click="save"
      />
      <Button
        v-if="changes.length"
        class="min-h-11 sm:min-h-0"
        :label="__('Undo changes')"
        :disabled="saving"
        @click="reset"
      />
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Badge, Button, FormControl, toast } from 'frappe-ui'
import { archivosApi, kindLabel, problem } from '@/composables/useArchivos'
import {
  changedMaps,
  connectorMethod,
  viaLabel,
  viaTheme,
} from '@/utils/archivosConectores'

const props = defineProps({
  name: { type: String, required: true },
  maps: { type: Array, default: () => [] },
  kinds: { type: Array, default: () => [] },
  catalog: { type: Object, default: null },
  catalogLoading: { type: Boolean, default: false },
  catalogError: { type: String, default: '' },
})
const emit = defineEmits(['saved', 'load-catalog'])

const rows = ref([]),
  search = ref(''),
  saving = ref(false),
  saveError = ref('')

function copyRows() {
  rows.value = (props.maps || []).map((m) => ({
    ...m,
    party_type: m.party_type || '',
    party: m.party || '',
    document_kind: m.document_kind || '',
  }))
  addCatalog()
}
// Catalog entries Muelle has not met yet join as empty rows to fill in;
// rows already on screen keep what the person typed.
function addCatalog() {
  const out = rows.value
  const seen = new Set(out.map((r) => `${r.map_type}:${r.remote_id}`))
  const add = (list, mapType) => {
    for (const item of list || []) {
      if (seen.has(`${mapType}:${item.id}`)) continue
      seen.add(`${mapType}:${item.id}`)
      out.push({
        map_type: mapType,
        remote_id: item.id,
        remote_name: item.name,
        party_type: '',
        party: '',
        document_kind: '',
        via: '',
      })
    }
  }
  add(props.catalog?.correspondents, 'Correspondent')
  add(props.catalog?.document_types, 'Document Type')
}
function reset() {
  saveError.value = ''
  copyRows()
}
watch(() => props.maps, copyRows, { immediate: true })
watch(() => props.catalog, addCatalog)

function matches(row) {
  const q = search.value.trim().toLowerCase()
  return (
    !q ||
    String(row.remote_name || '')
      .toLowerCase()
      .includes(q) ||
    String(row.party || '')
      .toLowerCase()
      .includes(q)
  )
}
const correspondents = computed(() =>
  rows.value.filter((r) => r.map_type === 'Correspondent' && matches(r)),
)
const documentTypes = computed(() =>
  rows.value.filter((r) => r.map_type === 'Document Type' && matches(r)),
)
const changes = computed(() => changedMaps(rows.value, props.maps))
const partyTypeOptions = computed(() => [
  { value: '', label: __('No one yet') },
  { value: 'Supplier', label: __('Supplier') },
  { value: 'Customer', label: __('Customer') },
])
const kindOptions = computed(() =>
  (props.kinds || []).map((value) => ({ value, label: kindLabel(value) })),
)

async function save() {
  saveError.value = ''
  const payload = changes.value
  if (!payload.length) return
  if (payload.length > 200) {
    saveError.value = __('Save up to 200 changes at a time.')
    return
  }
  saving.value = true
  try {
    const detail = await archivosApi(connectorMethod('save_map'), {
      name: props.name,
      rows: payload,
    })
    emit('saved', detail)
    toast.success(__('Mappings saved'))
  } catch (error) {
    saveError.value = problem(error).message
  } finally {
    saving.value = false
  }
}
</script>
