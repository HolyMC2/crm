<template>
  <!-- The engine's shared record sections for the richer purchase pages
       (Shell SPEC §6 DD2): «Creado desde», Conexiones, Actividad y
       comentarios, and the sheets behind the «⋯» (RecordKitTools). Files
       stay in the page's own Archivos panel, so Actividad lists events only. -->
  <div class="flex flex-col gap-6 py-2" data-testid="compras-record-kit">
    <Cadena
      v-if="cadena && kit.recordName.value"
      :doctype="kit.doctype"
      :name="kit.recordName.value"
      :record="kit.record.value"
    />
    <template v-if="kit.record.value">
      <Conexiones
        :connections="kit.record.value.connections || []"
        :scope-label="kit.scopeLabel.value"
      />
      <RecordActivity
        ref="recordActivity"
        :doctype="kit.doctype"
        :name="kit.recordName.value"
        :activity="kit.record.value.activity || null"
        :noun="kit.noun"
        :currency="kit.record.value.header?.currency || 'MXN'"
        :title="title || kit.scopeTitle.value"
        :curate="kit.printFormats.value"
        :files="false"
        @changed="kit.setActivity"
      />
    </template>
    <input
      :ref="setFileInput"
      type="file"
      class="hidden"
      @change="kit.onFile"
    />
    <template v-if="kit.record.value">
      <ToolsSheet
        :open="kit.open.value === 'tools'"
        :tools="kit.tools.value"
        :subtitle="kit.scopeTitle.value"
        @update:open="close"
        @tool="kit.onTool"
      />
      <ConfirmSheet
        :open="kit.open.value === 'confirm'"
        :copy="kit.confirmCopyFor.value"
        :busy="kit.busy.value"
        :error="kit.confirmError.value"
        @update:open="close"
        @confirm="kit.doConfirm"
      />
      <CommentSheet
        v-if="kit.open.value === 'comment'"
        :open="true"
        :doctype="kit.doctype"
        :name="kit.recordName.value"
        :subtitle="kit.scopeTitle.value"
        @update:open="close"
        @done="kit.setActivity"
      />
      <AssignSheet
        v-if="kit.open.value === 'assign'"
        :open="true"
        :doctype="kit.doctype"
        :name="kit.recordName.value"
        :subtitle="kit.scopeTitle.value"
        :assigned="kit.record.value.activity?.assigned || []"
        @update:open="close"
        @done="kit.setActivity"
      />
      <PrintSheet
        v-if="kit.open.value === 'print'"
        :open="true"
        :doctype="kit.doctype"
        :name="kit.recordName.value"
        :title="`${kit.kind} ${kit.recordName.value}`"
        :subtitle="kit.scopeTitle.value"
        :url="kit.link.value"
        :curate="kit.printFormats.value"
        @update:open="close"
        @shared="kit.onShared"
      />
      <AvisameSheet
        v-if="kit.open.value === 'avisame' && kit.avisame.value"
        :open="true"
        :doctype="kit.doctype"
        :name="kit.recordName.value"
        :title="title"
        @update:open="close"
      />
    </template>
  </div>
</template>
<script setup>
import { defineAsyncComponent, ref, watch } from 'vue'
import Conexiones from '@/components/documentos/Conexiones.vue'
import ToolsSheet from '@/components/documentos/ToolsSheet.vue'
import ConfirmSheet from '@/components/documentos/ConfirmSheet.vue'
import Cadena from './Cadena.vue'

const RecordActivity = defineAsyncComponent(
  () => import('@/components/documentos/RecordActivity.vue'),
)
const CommentSheet = defineAsyncComponent(
  () => import('@/components/documentos/CommentSheet.vue'),
)
const AssignSheet = defineAsyncComponent(
  () => import('@/components/documentos/AssignSheet.vue'),
)
const PrintSheet = defineAsyncComponent(
  () => import('@/components/documentos/PrintSheet.vue'),
)
const AVISAME_SHEET = import.meta.glob('../AvisameSheet.vue')
const [avisameLoader] = Object.values(AVISAME_SHEET)
const AvisameSheet = avisameLoader ? defineAsyncComponent(avisameLoader) : null

const props = defineProps({
  // useRecordKit(...)
  kit: { type: Object, required: true },
  // The party or name the worker reads (Avísame's subtitle).
  title: { type: String, default: '' },
  // «Creado desde»: off where the page already draws the chain.
  cadena: { type: Boolean, default: true },
})

// The kit's refs are the page's state (useRecordKit), set through it.
const { fileInput, open } = props.kit

// «Comentar», «Etiquetar», «Compartir con tu equipo» and «Enviar por correo»
// from the «⋯» land in Actividad y comentarios (its comment box and sheets)
// once it is on screen.
const recordActivity = ref(null)
const IN_ACTIVITY = {
  comment: 'comment',
  tag: 'tag',
  team: 'share',
  correo: 'correo',
}
watch(open, (key) => {
  if (!IN_ACTIVITY[key] || !recordActivity.value) return
  recordActivity.value.open(IN_ACTIVITY[key])
  open.value = ''
})
function setFileInput(el) {
  fileInput.value = el
}
function close(value) {
  if (!value) open.value = ''
}
</script>
