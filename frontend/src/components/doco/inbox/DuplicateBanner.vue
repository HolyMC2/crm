<!--
  Detección + fusión de duplicados (spec 4.3 / 4.3b). Amber strip shown at the top
  of the deal/lead context panel when OTHER open records share this record's phone.

  - "Ver" emits open(doctype, name) → the parent (lead-owned DealContextPanel) routes
    it to selectDeal. Navigate only.
  - "Fusionar…" (managers only — backend returns can_merge) merges a duplicate INTO
    the record being viewed: a confirm dialog states exactly what moves and that the
    OTHER record is the one that closes; on confirm it calls merge_duplicate, toasts
    the moved counts, and emits `merged` (the parent decides how to refresh). This
    record (props.doctype/name) is always the survivor/target; the duplicate row is
    the source that gets retired. Never deletes anything.

  Prop-driven, fetch-once-per-conversation-change, NO polling. Renders nothing when
  there are no duplicates (or on any fetch error → stays silent).
-->
<template>
  <div
    v-if="duplicates.length"
    class="flex-none border-b border-outline-amber-3 bg-surface-amber-1 px-3.5 py-2.5"
  >
    <div class="flex items-start gap-2">
      <span class="flex-none text-[13px] leading-5" aria-hidden="true">⚠</span>
      <div class="min-w-0 flex-1">
        <div class="text-[11px] font-bold uppercase tracking-[.06em] text-ink-amber-6">
          {{ __('Posible duplicado') }}
        </div>
        <ul class="mt-1 flex flex-col gap-1.5">
          <li
            v-for="d in duplicates"
            :key="d.doctype + ':' + d.name"
            class="flex items-center justify-between gap-2"
          >
            <span class="min-w-0 truncate text-[12px] text-ink-gray-8">
              {{ d.title }}<span v-if="d.status" class="text-ink-gray-5"> ({{ d.status }})</span>
            </span>
            <div class="flex flex-none items-center gap-1.5">
              <button
                class="press rounded-md border border-outline-amber-3 bg-surface-base px-2 py-0.5 text-[11.5px] font-semibold text-ink-amber-6 hover:bg-surface-amber-2"
                @click="$emit('open', d.doctype, d.name)"
              >
                {{ __('Ver') }}
              </button>
              <button
                v-if="canMerge"
                class="press rounded-md border border-outline-amber-3 bg-surface-base px-2 py-0.5 text-[11.5px] font-semibold text-ink-amber-6 hover:bg-surface-amber-2"
                @click="askMerge(d)"
              >
                {{ __('Fusionar…') }}
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Confirm: states what moves and that the OTHER record (the duplicate) closes. -->
  <Dialog
    v-model="confirmOpen"
    :options="{ title: __('Fusionar duplicado') }"
  >
    <template #body-content>
      <div class="flex flex-col gap-3 text-p-base text-ink-gray-7">
        <p>
          {{
            __(
              'Se moverán todos los mensajes, notas, tareas y etiquetas de «{0}» a este registro.',
              [pending?.title || pending?.name],
            )
          }}
        </p>
        <p class="font-medium text-ink-gray-8">
          {{ __('El registro «{0}» se cerrará como duplicado. No se elimina nada.', [pending?.title || pending?.name]) }}
        </p>
      </div>
    </template>
    <template #actions>
      <div class="flex items-center justify-end gap-2">
        <Button :label="__('Cancelar')" @click="confirmOpen = false" />
        <Button
          variant="solid"
          theme="red"
          :loading="merging"
          :label="__('Fusionar')"
          @click="doMerge"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { createResource, Dialog, Button, call, toast } from 'frappe-ui'
import { formatMovedCounts } from '@/utils/mergeSummary'

const props = defineProps({
  // 'CRM Deal' | 'CRM Lead' — the record whose phone we check; also the merge SURVIVOR.
  doctype: { type: String, default: '' },
  name: { type: String, default: '' },
})
const emit = defineEmits(['open', 'merged'])

// A 403 (record the user can't read) must not surface a toast — stay silent.
const res = createResource({ url: 'doco_marketing.api.dedupe.find_duplicates', onError: () => {} })

// Fetch once per conversation change. Only Deals/Leads carry a dedup-able phone.
watch(
  () => [props.doctype, props.name],
  ([doctype, name]) => {
    res.data = null
    if ((doctype === 'CRM Deal' || doctype === 'CRM Lead') && name) {
      res.submit({ doctype, name })
    }
  },
  { immediate: true },
)

const duplicates = computed(() => res.data?.duplicates || [])
const canMerge = computed(() => !!res.data?.can_merge)

// --- Merge confirm flow ---
const confirmOpen = ref(false)
const pending = ref(null)
const merging = ref(false)

function askMerge(d) {
  pending.value = d
  confirmOpen.value = true
}

async function doMerge() {
  const source = pending.value
  if (!source || merging.value) return
  merging.value = true
  try {
    const out = await call('doco_marketing.api.dedupe.merge_duplicate', {
      source: source.name,
      target: props.name,
      doctype: props.doctype,
    })
    const summary = formatMovedCounts(out?.moved)
    toast.success(summary ? __('Duplicado fusionado: {0}', [summary]) : __('Duplicado fusionado'))
    confirmOpen.value = false
    pending.value = null
    res.submit({ doctype: props.doctype, name: props.name }) // refresh the strip
    emit('merged', source.doctype, source.name)
  } catch (e) {
    toast.error(e?.messages?.[0] || e?.message || __('No se pudo fusionar el duplicado'))
  } finally {
    merging.value = false
  }
}
</script>
