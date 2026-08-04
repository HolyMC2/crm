<!--
  WhatsAppReviewCard — one row of the supervised WhatsApp Send Review queue.
  Shows the rendered message, recipient, provenance (⚙ Auto / 👤 approver) and the
  inline actions a reviewer needs. Used by both the standalone Aprobaciones page
  (WhatsAppQueue.vue) and the in-conversation strip (ConversationReviewStrip.vue).

  Acts via doco_marketing.api.review_queue.{approve,reject,retry}, which return the
  row's fresh state; we patch in place and emit `changed` so the parent can reload
  the surrounding thread (an approved row becomes a real WhatsApp Message).
-->
<template>
  <div class="rounded-[10px] border border-outline-gray-2 bg-surface-base p-3">
    <!-- header: template + provenance + status -->
    <div class="mb-1.5 flex items-start justify-between gap-2">
      <div class="flex min-w-0 flex-wrap items-center gap-1.5">
        <span class="truncate text-[12.5px] font-bold text-ink-gray-9">{{ row.template }}</span>
        <span
          v-if="provenance"
          class="rounded bg-surface-gray-2 px-1.5 py-0.5 text-2xs text-ink-gray-6"
          :title="provenance.tip"
        >{{ provenance.icon }} {{ provenance.label }}</span>
      </div>
      <span
        class="shrink-0 rounded-full px-2 py-0.5 text-2xs-semibold"
        :class="statusChip.cls"
      >{{ statusChip.label }}</span>
    </div>

    <!-- recipient + reference -->
    <div class="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-gray-5">
      <span class="font-mono text-ink-gray-6">{{ formattedPhone }}</span>
      <span v-if="row.reference_name" class="truncate">· {{ refLabel }}</span>
      <span :title="fullTs">· {{ relTime }}</span>
    </div>

    <!-- the actual message preview -->
    <div
      v-if="row.preview"
      class="whitespace-pre-line rounded-md bg-surface-gray-1 px-2.5 py-2 text-[12.5px] leading-snug text-ink-gray-8"
    >{{ row.preview }}</div>

    <!-- failure reason -->
    <div
      v-if="row.status === 'Fallido' && row.error"
      class="mt-1.5 rounded-md bg-surface-red-1 px-2.5 py-1.5 text-2xs text-ink-red-7"
    >
      {{ shortError }}
      <span v-if="row.attempts" class="opacity-70">· {{ row.attempts }} {{ __('intentos') }}</span>
    </div>

    <!-- variable editor (Pendiente only): map each {{n}} to a field + free-edit;
         the edited values are sent with Enviar -->
    <div v-if="canAct && row.status === 'Pendiente'" class="mt-2">
      <button
        type="button"
        class="text-2xs-semibold text-ink-blue-link hover:underline disabled:opacity-50"
        :disabled="varsLoading"
        @click="toggleEdit"
      >{{ editing ? __('Ocultar variables') : (varsLoading ? __('Cargando…') : __('Editar variables')) }}</button>
      <div v-if="editing && vars.length" class="mt-1.5 flex flex-col gap-1.5">
        <div v-for="v in vars" :key="v.index" class="flex items-center gap-1.5">
          <span class="w-7 shrink-0 font-mono text-2xs text-ink-gray-5">{{ v.placeholder }}</span>
          <select
            v-model="v.field"
            class="w-1/3 shrink-0 rounded border border-outline-gray-2 bg-surface-base px-1 py-0.5 text-[11px] text-ink-gray-7 focus:outline-none dark:bg-surface-gray-1"
            @change="onFieldChange(v)"
          >
            <option value="">{{ __('(libre)') }}</option>
            <option v-for="o in fieldOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <input
            v-model="v.value"
            type="text"
            class="min-w-0 flex-1 rounded border border-outline-gray-2 bg-surface-base px-1.5 py-0.5 text-[11.5px] text-ink-gray-8 focus:outline-none dark:bg-surface-gray-1 dark:text-ink-gray-7"
          />
        </div>
      </div>
    </div>

    <!-- actions -->
    <div v-if="canAct" class="mt-2.5 flex items-center gap-2">
      <button
        v-if="row.status === 'Pendiente'"
        class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
        style="background:var(--brand)"
        :disabled="!!busy"
        @click="act('approve')"
      >{{ busy === 'approve' ? __('Enviando…') : __('Enviar') }}</button>
      <button
        v-if="row.status === 'Fallido'"
        class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-8 disabled:opacity-50"
        :disabled="!!busy"
        @click="act('retry')"
      >{{ busy === 'retry' ? __('Reintentando…') : __('Reintentar') }}</button>
      <button
        class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ink-red-7 hover:bg-surface-red-1 disabled:opacity-50"
        :disabled="!!busy"
        @click="act('reject')"
      >{{ __('Cancelar') }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { call as frappeCall, toast } from 'frappe-ui'
import { usersStore } from '@/stores/users'

const props = defineProps({
  row: { type: Object, required: true },
})
const emit = defineEmits(['changed'])

const { isManager } = usersStore()

const busy = ref('')

// --- variable editor (prefill + dropdown + free-edit) ----------------------
const editing = ref(false)
const varsLoading = ref(false)
const vars = ref([])
const fieldOptions = ref([])
const refDoctype = ref('')
const refName = ref('')

async function toggleEdit() {
  if (editing.value) { editing.value = false; return }
  if (!vars.value.length) {
    varsLoading.value = true
    try {
      const data = await frappeCall('doco_marketing.api.review_queue.get_row_template_vars', { name: props.row.name })
      vars.value = (data?.variables || []).map((v) => ({ ...v }))
      refDoctype.value = data?.reference_doctype || ''
      refName.value = data?.reference_name || ''
      if (refDoctype.value) {
        fieldOptions.value = await frappeCall('crm.api.whatsapp.get_template_field_options', {
          reference_doctype: refDoctype.value,
        }) || []
      }
    } catch (e) {
      toast.error(e?.messages?.[0] || __('No se pudieron cargar las variables'))
      return
    } finally {
      varsLoading.value = false
    }
  }
  editing.value = true
}

async function onFieldChange(v) {
  if (!v.field || !refDoctype.value || !refName.value) return
  try {
    const r = await frappeCall('crm.api.whatsapp.resolve_field_value', {
      reference_doctype: refDoctype.value,
      reference_name: refName.value,
      fieldname: v.field,
    })
    v.value = r?.value ?? ''
  } catch (e) {
    toast.error(e?.messages?.[0] || __('No se pudo leer el campo'))
  }
}

// Manager-eyes policy: only managers act on customer-facing sends (server
// enforces via _APPROVER_ROLES; this just hides buttons that would 403).
const canAct = computed(() => isManager() && ['Pendiente', 'Fallido'].includes(props.row.status))

const provenance = computed(() => {
  const r = props.row
  if (r.auto) return { icon: '⚙', label: __('Auto'), tip: r.source || __('Mensaje automático') }
  if (r.sent_by_name) return { icon: '', label: r.sent_by_name, tip: __('Aprobado por') + ' ' + r.sent_by_name }
  return null
})

const statusChip = computed(() => {
  return (
    {
      Pendiente: { label: __('Pendiente'), cls: 'bg-surface-amber-1 text-ink-amber-7' },
      Enviado: { label: __('Enviado'), cls: 'bg-surface-green-2 text-ink-green-7' },
      Fallido: { label: __('Fallido'), cls: 'bg-surface-red-1 text-ink-red-7' },
      Cancelado: { label: __('Cancelado'), cls: 'bg-surface-gray-2 text-ink-gray-5' },
    }[props.row.status] || { label: props.row.status, cls: 'bg-surface-gray-2 text-ink-gray-5' }
  )
})

const refLabel = computed(() => {
  const r = props.row
  if (!r.reference_name) return ''
  return r.reference_name
})

const formattedPhone = computed(() => {
  // MX deployment: normalize to last-10 (drops the 52 / legacy 521 WhatsApp prefix)
  // and render +52 NNN NNN NNNN. Non-10-digit oddities show raw with a +.
  const d = String(props.row.to || '').replace(/\D/g, '')
  if (!d) return ''
  const last10 = d.slice(-10)
  if (last10.length === 10) {
    return `+52 ${last10.slice(0, 3)} ${last10.slice(3, 6)} ${last10.slice(6)}`
  }
  return `+${d}`
})

const shortError = computed(() => {
  const e = String(props.row.error || '').trim()
  return e.length > 180 ? e.slice(-180) : e
})

const fullTs = computed(() => props.row.creation || '')
const relTime = computed(() => {
  // lightweight relative time; avoids pulling a date lib into the card
  const c = props.row.creation
  if (!c) return ''
  const then = new Date(c.replace(' ', 'T'))
  const mins = Math.round((Date.now() - then.getTime()) / 60000)
  if (Number.isNaN(mins)) return ''
  if (mins < 1) return __('ahora')
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
})

async function act(kind) {
  if (busy.value) return
  busy.value = kind
  try {
    const params = { name: props.row.name }
    // carry the reviewer's edited variable values on approve
    if (kind === 'approve' && editing.value && vars.value.length) {
      params.body_param = Object.fromEntries(vars.value.map((v) => [String(v.index), v.value ?? '']))
    }
    await frappeCall(`doco_marketing.api.review_queue.${kind}`, params)
    toast.success(
      { approve: __('Mensaje enviado'), retry: __('Reintentado'), reject: __('Cancelado') }[kind],
    )
    // parent (page / strip) reloads the list on `changed`, which drops this row
    // out of the Pendiente/Fallido view if its status moved.
    emit('changed', { kind, name: props.row.name })
  } catch (e) {
    toast.error(e?.messages?.[0] || __('La acción falló'))
  } finally {
    busy.value = ''
  }
}
</script>
