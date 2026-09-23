<!--
  WhatsAppReviewCard — one row of the supervised WhatsApp Send Review queue.
  Leads with WHO the message goes to and WHAT it is about (customer, repair order
  and its status, deal + stage, owner — resolved server-side in
  doco_marketing.api.review_queue._enrich), then the rendered message, then the
  actions. Used by the standalone Aprobaciones page (WhatsAppQueue.vue) and, with
  `showContext=false`, by the in-conversation strip (ConversationReviewStrip.vue)
  where the surrounding page already is the customer.

  Acts via doco_marketing.api.review_queue.{approve,reject,retry}, which return the
  row's fresh state; we emit `changed` so the parent reloads the surrounding list
  or thread (an approved row becomes a real WhatsApp Message).
-->
<template>
  <div class="rounded-[10px] border border-outline-gray-2 bg-surface-base">
    <!-- who + what -->
    <div v-if="showContext" class="flex items-start gap-2.5 px-3 pt-3">
      <Avatar :label="customerName || '?'" size="lg" class="mt-0.5 shrink-0" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <component
            :is="recordLink ? RouterLink : 'span'"
            :to="recordLink || undefined"
            class="truncate text-[13.5px] font-bold text-ink-gray-9"
            :class="recordLink ? 'hover:underline' : ''"
            >{{ customerName || __('Sin nombre') }}</component
          >
          <span class="font-mono text-2xs text-ink-gray-6" :title="row.to">{{
            phone
          }}</span>
        </div>
        <div v-if="about" class="mt-0.5 truncate text-[12px] text-ink-gray-7">
          {{ about }}
        </div>
        <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
          <a
            v-if="ctx.repair_order"
            :href="repairHref"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1 rounded bg-surface-gray-2 px-1.5 py-0.5 text-2xs text-ink-gray-7 hover:bg-surface-gray-3"
            :title="__('Abrir la orden')"
          >
            <FeatherIcon name="tool" class="size-3" />
            {{ ctx.repair_order
            }}<span v-if="ctx.repair_status"> · {{ ctx.repair_status }}</span>
          </a>
          <component
            :is="refLink ? RouterLink : 'span'"
            v-if="row.reference_name && ctx.kind !== 'Repair Order'"
            :to="refLink || undefined"
            class="inline-flex items-center gap-1 rounded bg-surface-gray-2 px-1.5 py-0.5 text-2xs text-ink-gray-7"
            :class="refLink ? 'hover:bg-surface-gray-3' : ''"
          >
            {{ kindLabel }} {{ row.reference_name
            }}<span v-if="ctx.status"> · {{ ctx.status }}</span>
          </component>
          <span
            v-if="ctx.owner_name"
            class="inline-flex items-center gap-1 rounded px-1 py-0.5 text-2xs text-ink-gray-5"
            :title="__('Responsable')"
          >
            <FeatherIcon name="user" class="size-3" />{{ ctx.owner_name }}
          </span>
        </div>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        <span
          class="rounded-full px-2 py-0.5 text-2xs-semibold"
          :class="statusChip.cls"
          >{{ statusChip.label }}</span
        >
        <span class="text-2xs text-ink-gray-5" :title="fullTs">{{
          relTime
        }}</span>
      </div>
    </div>

    <!-- the message: template + provenance, rendered preview, variable editor -->
    <div
      class="rounded-md bg-surface-gray-1"
      :class="showContext ? 'mx-3 mt-2.5' : 'm-2'"
    >
      <div
        class="flex items-center justify-between gap-2 border-b border-outline-gray-1 px-2.5 py-1.5 text-2xs text-ink-gray-5"
      >
        <span class="flex min-w-0 items-center gap-1.5">
          <FeatherIcon name="message-square" class="size-3 shrink-0" />
          <span class="truncate">{{ templateLabel }}</span>
          <span v-if="provenance" class="shrink-0" :title="provenance.tip"
            >· {{ provenance.icon }} {{ provenance.label }}</span
          >
          <template v-if="!showContext">
            <span
              class="shrink-0 rounded-full px-1.5 py-0.5 text-2xs-semibold"
              :class="statusChip.cls"
              >{{ statusChip.label }}</span
            >
            <span class="shrink-0" :title="fullTs">{{ relTime }}</span>
          </template>
        </span>
        <button
          v-if="canAct && row.status === 'Pendiente'"
          type="button"
          class="shrink-0 text-2xs-semibold text-ink-blue-link hover:underline disabled:opacity-50"
          :disabled="varsLoading"
          @click="toggleEdit"
        >
          {{
            editing
              ? __('Ocultar variables')
              : varsLoading
                ? __('Cargando…')
                : __('Editar variables')
          }}
        </button>
      </div>
      <div
        v-if="row.preview"
        class="whitespace-pre-line px-2.5 py-2 text-[12.5px] leading-snug text-ink-gray-8"
      >
        {{ row.preview }}
      </div>
      <div
        v-if="editing && vars.length"
        class="flex flex-col gap-1.5 border-t border-outline-gray-1 px-2.5 py-2"
      >
        <div v-for="v in vars" :key="v.index" class="flex items-center gap-1.5">
          <span class="w-7 shrink-0 font-mono text-2xs text-ink-gray-5">{{
            v.placeholder
          }}</span>
          <select
            v-model="v.field"
            class="w-1/3 shrink-0 rounded border border-outline-gray-2 bg-surface-base px-1 py-0.5 text-[11px] text-ink-gray-7 focus:outline-none dark:bg-surface-gray-1"
            @change="onFieldChange(v)"
          >
            <option value="">{{ __('(libre)') }}</option>
            <option v-for="o in fieldOptions" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
          <input
            v-model="v.value"
            type="text"
            class="min-w-0 flex-1 rounded border border-outline-gray-2 bg-surface-base px-1.5 py-0.5 text-[11.5px] text-ink-gray-8 focus:outline-none dark:bg-surface-gray-1 dark:text-ink-gray-7"
          />
        </div>
      </div>
    </div>

    <!-- failure reason -->
    <div
      v-if="row.status === 'Fallido' && row.error"
      class="mx-3 mt-2 rounded-md bg-surface-red-1 px-2.5 py-1.5 text-2xs text-ink-red-8"
    >
      {{ shortError }}
      <span v-if="row.attempts" class="opacity-70"
        >· {{ row.attempts }} {{ __('intentos') }}</span
      >
    </div>

    <!-- actions + the way into the record -->
    <div class="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
      <div v-if="canAct" class="flex items-center gap-2">
        <button
          v-if="row.status === 'Pendiente'"
          class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
          style="background: var(--brand)"
          :disabled="!!busy"
          @click="act('approve')"
        >
          {{ busy === 'approve' ? __('Enviando…') : __('Enviar') }}
        </button>
        <button
          v-if="row.status === 'Fallido'"
          class="rounded-lg border border-outline-gray-2 px-3 py-1.5 text-[12px] font-semibold text-ink-gray-8 disabled:opacity-50"
          :disabled="!!busy"
          @click="act('retry')"
        >
          {{ busy === 'retry' ? __('Reintentando…') : __('Reintentar') }}
        </button>
        <button
          class="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ink-red-8 hover:bg-surface-red-1 disabled:opacity-50"
          :disabled="!!busy"
          @click="act('reject')"
        >
          {{ __('Cancelar') }}
        </button>
      </div>
      <span v-else />
      <RouterLink
        v-if="showContext && recordLink"
        :to="recordLink"
        class="inline-flex items-center gap-1 text-2xs-semibold text-ink-gray-6 hover:text-ink-gray-9"
        >{{ openLabel }} <FeatherIcon name="arrow-right" class="size-3"
      /></RouterLink>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Avatar, FeatherIcon, call as frappeCall, toast } from 'frappe-ui'
import { usersStore } from '@/stores/users'
import {
  aboutLine,
  deskHref,
  displayPhone,
  recordRoute,
  relativeAge,
} from '@/utils/reviewCardFormat'

const props = defineProps({
  row: { type: Object, required: true },
  // false inside a conversation, where the page already is the customer
  showContext: { type: Boolean, default: true },
})
const emit = defineEmits(['changed'])

const { isManager } = usersStore()

const busy = ref('')

// --- who / what ------------------------------------------------------------
const ctx = computed(() => props.row.context || {})
const customerName = computed(() => ctx.value.customer_name || '')
// the contact's own number reads better than the raw WhatsApp recipient
const phone = computed(() =>
  displayPhone(ctx.value.customer_phone || props.row.to),
)
const about = computed(() => aboutLine(ctx.value))
// the reference's own page (deal / lead) — what the reference chip opens
const refLink = computed(() =>
  recordRoute(props.row.reference_doctype, props.row.reference_name),
)
// where the person's name opens: the reference, else the Contact behind the number
const recordLink = computed(
  () => refLink.value || recordRoute('', '', ctx.value.contact),
)
const repairHref = computed(() =>
  deskHref('Repair Order', ctx.value.repair_order),
)
const kindLabel = computed(
  () =>
    ({
      'CRM Deal': __('Trato'),
      'CRM Lead': __('Lead'),
    })[props.row.reference_doctype] ||
    props.row.reference_doctype ||
    '',
)
const openLabel = computed(
  () =>
    ({
      'Deal 360': __('Abrir trato'),
      Lead: __('Abrir lead'),
      Contact: __('Abrir contacto'),
    })[recordLink.value?.name] || __('Abrir'),
)
const templateLabel = computed(
  () => props.row.template_label || props.row.template || '',
)

// --- variable editor (prefill + dropdown + free-edit) ----------------------
const editing = ref(false)
const varsLoading = ref(false)
const vars = ref([])
const fieldOptions = ref([])
const refDoctype = ref('')
const refName = ref('')

async function toggleEdit() {
  if (editing.value) {
    editing.value = false
    return
  }
  if (!vars.value.length) {
    varsLoading.value = true
    try {
      const data = await frappeCall(
        'doco_marketing.api.review_queue.get_row_template_vars',
        { name: props.row.name },
      )
      vars.value = (data?.variables || []).map((v) => ({ ...v }))
      refDoctype.value = data?.reference_doctype || ''
      refName.value = data?.reference_name || ''
      if (refDoctype.value) {
        fieldOptions.value =
          (await frappeCall('crm.api.whatsapp.get_template_field_options', {
            reference_doctype: refDoctype.value,
          })) || []
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
const canAct = computed(
  () => isManager() && ['Pendiente', 'Fallido'].includes(props.row.status),
)

const provenance = computed(() => {
  const r = props.row
  if (r.auto)
    return {
      icon: '⚙',
      label: __('Auto'),
      tip: r.source || __('Mensaje automático'),
    }
  if (r.sent_by_name)
    return {
      icon: '',
      label: __('Aprobado por') + ' ' + r.sent_by_name,
      tip: r.sent_at || '',
    }
  return null
})

const statusChip = computed(() => {
  return (
    {
      Pendiente: {
        label: __('Pendiente'),
        cls: 'bg-surface-amber-1 text-ink-amber-7',
      },
      Enviado: {
        label: __('Enviado'),
        cls: 'bg-surface-green-2 text-ink-green-8',
      },
      Fallido: { label: __('Fallido'), cls: 'bg-surface-red-1 text-ink-red-8' },
      Cancelado: {
        label: __('Cancelado'),
        cls: 'bg-surface-gray-2 text-ink-gray-5',
      },
    }[props.row.status] || {
      label: props.row.status,
      cls: 'bg-surface-gray-2 text-ink-gray-5',
    }
  )
})

const shortError = computed(() => {
  const e = String(props.row.error || '').trim()
  return e.length > 180 ? e.slice(-180) : e
})

const fullTs = computed(() => props.row.creation || '')
const relTime = computed(() =>
  relativeAge(props.row.creation, Date.now(), { now: __('ahora') }),
)

async function act(kind) {
  if (busy.value) return
  busy.value = kind
  try {
    const params = { name: props.row.name }
    // carry the reviewer's edited variable values on approve
    if (kind === 'approve' && editing.value && vars.value.length) {
      params.body_param = Object.fromEntries(
        vars.value.map((v) => [String(v.index), v.value ?? '']),
      )
    }
    await frappeCall(`doco_marketing.api.review_queue.${kind}`, params)
    toast.success(
      {
        approve: __('Mensaje enviado'),
        retry: __('Reintentado'),
        reject: __('Cancelado'),
      }[kind],
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
