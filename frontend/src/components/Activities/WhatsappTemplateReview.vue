<!--
  Template review step for the WhatsApp composer. Instead of firing an approved
  template the instant a chip/modal-card is clicked, this panel resolves the
  template against the active deal/lead and shows it in the composer for review:
  the body preview (live), plus each {{n}} variable with the ref-doc field it maps
  to and an editable value. "Enviar plantilla" sends the REAL approved template
  with the reviewed values (body_param) — still compliant outside the 24h window,
  unlike dropping the text into the box as a plain message. See crm.api.whatsapp
  .get_template_preview / send_whatsapp_template(body_param=…).
-->
<template>
  <div class="mx-3 mb-2 mt-1 rounded-lg border border-outline-gray-2 bg-surface-gray-1 p-3 dark:bg-surface-gray-2 sm:mx-10">
    <div class="mb-2 flex items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <span class="text-xs">📄</span>
        <span class="truncate text-sm font-semibold text-ink-gray-8 dark:text-ink-gray-7">
          {{ __('Revisar plantilla') }}: {{ template }}
        </span>
        <Badge v-if="preview.data?.language_code" variant="subtle" theme="gray" :label="preview.data.language_code" />
      </div>
      <Button variant="ghost" icon="x" :tooltip="__('Cancelar')" @click="emit('cancel')" />
    </div>

    <div v-if="preview.loading" class="py-4 text-center text-xs text-ink-gray-4">
      {{ __('Cargando plantilla…') }}
    </div>
    <div v-else-if="preview.error" class="py-3 text-center text-xs text-ink-red-3">
      {{ __('No se pudo cargar la plantilla') }}
    </div>

    <template v-else-if="preview.data">
      <!-- live preview bubble -->
      <div class="rounded-md border border-outline-gray-1 bg-surface-white p-2.5 text-base text-ink-gray-8 shadow-sm dark:bg-surface-gray-1 dark:text-ink-gray-7">
        <div class="whitespace-pre-wrap break-words">{{ renderedBody }}</div>
        <div v-if="preview.data.footer" class="mt-1.5 text-xs text-ink-gray-4">
          {{ preview.data.footer }}
        </div>
      </div>

      <!-- editable variables: map each {{n}} to an ERPNext field (prefills the
           value) + free-edit. Saving the mapping persists it as the template default. -->
      <div v-if="vars.length" class="mt-2.5 flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <div class="text-[10px] font-bold uppercase tracking-wide text-ink-gray-4">
            {{ __('Variables de la plantilla') }}
          </div>
          <button
            type="button"
            class="text-[10px] font-semibold text-ink-blue-link hover:underline disabled:opacity-50"
            :disabled="savingMap"
            @click="saveMap"
          >{{ savingMap ? __('Guardando…') : __('Guardar mapeo predeterminado') }}</button>
        </div>
        <label v-for="v in vars" :key="v.index" class="block">
          <span class="text-[10px] font-medium text-ink-gray-5">
            <span class="font-mono text-ink-gray-7">{{ v.placeholder }}</span>
          </span>
          <div class="flex gap-1.5">
            <select
              v-model="v.field"
              class="w-2/5 shrink-0 rounded-md border border-outline-gray-2 bg-surface-white px-1.5 py-1 text-[11.5px] text-ink-gray-7 focus:border-green-500 focus:outline-none dark:bg-surface-gray-1"
              @change="onFieldChange(v)"
            >
              <option value="">{{ __('(libre)') }}</option>
              <option v-for="o in fieldOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
            <input
              v-model="v.value"
              type="text"
              class="flex-1 rounded-md border border-outline-gray-2 bg-surface-white px-2 py-1 text-[12.5px] text-ink-gray-8 focus:border-green-500 focus:outline-none focus:ring-0 dark:bg-surface-gray-1 dark:text-ink-gray-7"
              :placeholder="v.label"
            />
          </div>
        </label>
      </div>
      <div v-else class="mt-2 text-[11px] text-ink-gray-5">
        {{ __('Esta plantilla no tiene variables — se envía tal cual.') }}
      </div>

      <div v-if="headerNote" class="mt-2 text-[11px] text-ink-amber-3">
        {{ headerNote }}
      </div>

      <div class="mt-3 flex justify-end gap-2">
        <Button :label="__('Cancelar')" @click="emit('cancel')" />
        <Button
          variant="solid"
          theme="green"
          :label="__('Enviar plantilla')"
          :loading="sending"
          @click="send"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { createResource, call as frappeCall, toast, Badge, Button } from 'frappe-ui'

const props = defineProps({
  doctype: { type: String, required: true },
  docname: { type: String, required: true },
  template: { type: String, required: true },
  sending: { type: Boolean, default: false },
})

const emit = defineEmits(['send', 'cancel'])

// editable working copy of the resolved variables
const vars = ref([])

const preview = createResource({
  url: 'crm.api.whatsapp.get_template_preview',
  makeParams: () => ({
    reference_doctype: props.doctype,
    reference_name: props.docname,
    template: props.template,
  }),
  onSuccess(data) {
    // placeholder kept as a plain string (e.g. "{{1}}") — a literal "{{" inside a
    // template interpolation can't be parsed by Vue, so build it here.
    vars.value = (data?.variables || []).map((v) => ({ ...v, placeholder: `{{${v.index}}}` }))
  },
})

watch(
  () => [props.template, props.docname],
  () => props.template && props.docname && preview.fetch(),
  { immediate: true },
)

// candidate ERPNext fields for the mapping dropdown (this reference doctype)
const fieldOptionsRes = createResource({
  url: 'crm.api.whatsapp.get_template_field_options',
  makeParams: () => ({ reference_doctype: props.doctype }),
  auto: true,
})
const fieldOptions = computed(() => fieldOptionsRes.data || [])

// dropdown changed → re-prefill the value from the chosen field on the live doc
async function onFieldChange(v) {
  if (!v.field) return // "(libre)" → keep the current free-text value
  try {
    const r = await frappeCall('crm.api.whatsapp.resolve_field_value', {
      reference_doctype: props.doctype,
      reference_name: props.docname,
      fieldname: v.field,
    })
    v.value = r?.value ?? ''
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo leer el campo'))
  }
}

// persist the current variable→field mapping as the template default (field_names)
const savingMap = ref(false)
async function saveMap() {
  savingMap.value = true
  try {
    const field_names = vars.value.map((v) => v.field || '').join(',')
    await frappeCall('crm.api.whatsapp.set_template_field_map', {
      template: props.template,
      field_names,
    })
    toast.success(__('Mapeo guardado como predeterminado'))
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo guardar el mapeo'))
  } finally {
    savingMap.value = false
  }
}

// Substitute the (possibly edited) values back into the body for a live preview.
// Replace {{1}},{{2}}… by index so blank values collapse cleanly.
const renderedBody = computed(() => {
  let body = preview.data?.body || ''
  for (const v of vars.value) {
    body = body.replaceAll(`{{${v.index}}}`, v.value ?? '')
  }
  return body
})

const headerNote = computed(() => {
  const t = preview.data?.header_type
  if (t === 'IMAGE' || t === 'DOCUMENT')
    return __('La plantilla incluye un encabezado multimedia; se usa el de la plantilla aprobada.')
  return ''
})

function send() {
  // {{1}},{{2}}… order preserved; null body_param when the template has no variables.
  const body_param = vars.value.length
    ? Object.fromEntries(vars.value.map((v) => [String(v.index), v.value ?? '']))
    : null
  emit('send', { template: props.template, body_param })
}
</script>
