<template>
  <section
    class="rounded-lg border border-outline-gray-2 bg-surface-base"
    :aria-label="__('Files on this record')"
  >
    <header class="flex flex-wrap items-center gap-2 px-4 py-3">
      <h2 class="flex-1 text-base font-semibold text-ink-gray-9">
        {{ __('Files on this record') }}
        <span v-if="total" class="font-normal text-ink-gray-6"
          >· {{ total }}</span
        >
      </h2>
      <a
        v-if="data?.supported && uploadHref"
        :href="uploadHref"
        class="inline-flex min-h-11 items-center gap-2 rounded border border-outline-gray-2 px-3 text-sm text-ink-gray-8 hover:bg-surface-gray-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline-gray-4 sm:min-h-8"
        ><FeatherIcon name="upload" class="h-4 w-4" />{{ __('Add file') }}</a
      >
    </header>
    <div v-if="loading && !data" class="space-y-2 px-4 pb-4" aria-busy="true">
      <div class="h-10 animate-pulse rounded bg-surface-gray-2" />
      <div class="h-10 animate-pulse rounded bg-surface-gray-2" />
    </div>
    <div v-else-if="failure" class="px-4 pb-4">
      <ArchivoGuard :state="failure" @action="load" />
    </div>
    <template v-else-if="data">
      <ul
        v-if="total"
        class="divide-y divide-outline-gray-1 border-t border-outline-gray-1"
      >
        <li v-for="doc in data.evidence" :key="doc.name">
          <a
            :href="
              archivosHref({
                document: doc.name,
                target,
                returnTo: here,
                returnLabel,
              })
            "
            class="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline-gray-4"
          >
            <FeatherIcon
              name="file-text"
              class="h-4 w-4 shrink-0 text-ink-gray-5"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-base text-ink-gray-9">{{
                doc.title
              }}</span>
              <span class="block truncate text-sm text-ink-gray-6"
                >{{ kindLabel(doc.document_kind) }} ·
                {{ formatDay(doc.document_date || doc.modified) }}</span
              >
            </span>
            <Badge
              :theme="statusTheme(doc.status)"
              :label="statusLabel(doc.status)"
            />
          </a>
        </li>
        <li v-for="file in data.files" :key="file.name">
          <a
            :href="file.file_url"
            target="_blank"
            rel="noopener"
            class="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline-gray-4"
          >
            <FeatherIcon
              name="paperclip"
              class="h-4 w-4 shrink-0 text-ink-gray-5"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-base text-ink-gray-9">{{
                file.file_name
              }}</span>
              <span class="block truncate text-sm text-ink-gray-6"
                >{{ __('Attachment') }} · {{ formatBytes(file.file_size) }} ·
                {{ file.owner_label }}</span
              >
            </span>
          </a>
        </li>
      </ul>
      <p
        v-else
        class="border-t border-outline-gray-1 px-4 py-4 text-sm text-ink-gray-6"
      >
        {{
          data.supported
            ? __(
                'No files yet. Add the invoice, receipt or contract so anyone can find it from here.',
              )
            : __('No files yet.')
        }}
      </p>
      <p v-if="!data.supported" class="px-4 pb-4 text-sm text-ink-gray-6">
        {{
          __(
            'This kind of record does not take receipts from Archivos yet; attach files from its form and they appear here.',
          )
        }}
      </p>
    </template>
  </section>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Badge, FeatherIcon } from 'frappe-ui'
import ArchivoGuard from './ArchivoGuard.vue'
import {
  archivosApi,
  archivosHref,
  formatBytes,
  formatDay,
  kindLabel,
  problem,
  statusLabel,
  statusTheme,
} from '@/composables/useArchivos'

// «Archivos de este registro»: one panel any record page can mount. Linked
// evidence and native attachments appear once each; adding a file opens the
// Archivos intake with this record as target and a return to this page.
const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
  returnTo: { type: String, default: '' },
  returnLabel: { type: String, default: '' },
})
const data = ref(null),
  loading = ref(false),
  failure = ref(null)
const target = computed(() => ({ doctype: props.doctype, name: props.name }))
const here = computed(
  () =>
    props.returnTo ||
    (typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : ''),
)
const total = computed(
  () => (data.value?.evidence?.length || 0) + (data.value?.files?.length || 0),
)
const uploadHref = computed(() =>
  archivosHref({
    target: target.value,
    returnTo: here.value,
    returnLabel: props.returnLabel || props.name,
  }),
)
async function load() {
  loading.value = true
  failure.value = null
  try {
    data.value = await archivosApi('record_files', {
      reference_doctype: props.doctype,
      reference_name: props.name,
    })
  } catch (error) {
    failure.value = problem(error)
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => [props.doctype, props.name], load)
defineExpose({ reload: load })
</script>
