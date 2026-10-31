<template>
  <!-- A prospect, read like a contact (Shell D4, record-header): the bar names
       the person with their state; the island calls, writes and mails them,
       the bolt holds the next steps and «⋯» every tool. The hero says what is
       next and offers the one filled step, «Convertir en trato». -->
  <div class="flex h-full flex-col overflow-hidden bg-surface-base">
    <AppBar
      :back="{ name: 'Prospectos' }"
      back-label="Prospectos"
      :title="doc ? name : ''"
      :bell="isPhone"
      :loading="lead.loading"
      data-testid="prospecto-appbar"
    >
      <template v-if="doc" #title>
        <div class="flex min-h-12 min-w-0 flex-col justify-center px-3">
          <span
            class="title-face line-clamp-2 break-words text-xl font-semibold leading-tight [text-wrap:balance]"
            data-appbar-title
            data-testid="prospecto-name"
            >{{ name }}</span
          >
          <span class="flex min-w-0 items-center gap-2 pt-0.5">
            <StatusChip
              :label="chip.label"
              :tone="chip.tone"
              data-testid="prospecto-status"
            />
            <span class="truncate text-sm leading-tight text-ink-gray-6">{{
              ['Prospecto', sourceLabel].filter(Boolean).join(' · ')
            }}</span>
          </span>
        </div>
      </template>
      <template #actions>
        <RecordIsland
          v-if="doc"
          :reach="{ phone, email: doc.email || '' }"
          :who="name"
          :mail="kit.record.value?.actions?.email || null"
          :groups="boltGroups"
          :phone="isPhone"
          :subtitle="kit.scopeTitle.value"
          @mail="mail"
          @pick="onBolt"
          @tools="kit.openTools()"
        />
      </template>
    </AppBar>
    <div class="min-h-0 flex-1 overflow-y-auto pb-28 sm:pb-10">
      <EmptyState
        v-if="lead.error && !doc"
        state="error"
        title="No se pudo abrir el prospecto"
        :message="errorText"
        action="Reintentar"
        @action="lead.reload()"
      />
      <EmptyState
        v-else-if="!doc"
        state="loading"
        title="Abriendo prospecto…"
      />
      <div
        v-else
        class="mx-auto grid w-full max-w-6xl gap-x-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div class="flex min-w-0 flex-col gap-5 pt-4">
          <!-- The hero: what is next with this person, and the one step. -->
          <section
            class="flex flex-col gap-2 px-4"
            aria-label="Siguiente paso"
            data-testid="prospecto-hero"
          >
            <p
              class="title-face text-2xl font-semibold leading-tight"
              :class="due?.overdue ? 'text-ink-red-7' : 'text-ink-gray-9'"
            >
              {{ due ? due.label : 'Sin seguimiento' }}
            </p>
            <p class="flex flex-wrap gap-x-3 text-base text-ink-gray-7">
              <span>{{
                due ? 'Siguiente acción' : 'Nadie ha agendado el siguiente paso'
              }}</span>
              <span v-if="doc.creation">Llegó {{ arrived }}</span>
            </p>
            <p
              v-if="doc.converted"
              class="flex items-center gap-2 text-base text-ink-gray-8"
            >
              <span
                class="lucide-circle-check size-5 text-ink-green-7"
                aria-hidden="true"
              />
              Este prospecto ya es un trato.
            </p>
            <p
              v-else-if="!phone && !doc.email"
              class="text-base text-ink-gray-7"
            >
              No tiene teléfono ni correo. Agrégalos desde el historial completo
              para poder contactarlo.
            </p>
            <div class="flex flex-wrap gap-2 pt-2" data-testid="prospecto-next">
              <template v-for="(step, i) in nextSteps" :key="step.key">
                <a
                  v-if="step.href"
                  :href="step.href"
                  :target="step.external ? '_blank' : undefined"
                  :rel="step.external ? 'noopener' : undefined"
                  :class="['press', i === 0 ? BTN.filled : BTN.tonal]"
                  :data-action="step.key"
                  ><span :class="[step.icon, 'size-5']" aria-hidden="true" />
                  {{ step.label }}</a
                >
                <button
                  v-else
                  type="button"
                  :class="['press', i === 0 ? BTN.filled : BTN.tonal]"
                  :data-action="step.key"
                  :data-testid="step.testid"
                  @click="step.run()"
                >
                  <span :class="[step.icon, 'size-5']" aria-hidden="true" />
                  {{ step.label }}
                </button>
              </template>
            </div>
          </section>

          <section class="px-4" aria-labelledby="prospecto-datos">
            <h2
              id="prospecto-datos"
              class="pb-1 text-base font-semibold text-ink-gray-9"
            >
              Datos
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="row in details"
                :key="row.label"
                class="flex min-h-14 items-center gap-3 py-2"
              >
                <span
                  class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                  aria-hidden="true"
                >
                  <span :class="[row.icon, 'size-5']" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="text-sm text-ink-gray-6">{{ row.label }}</span>
                  <span class="break-words text-base text-ink-gray-9">{{
                    row.value
                  }}</span>
                </span>
              </li>
            </ul>
          </section>
        </div>

        <aside class="flex min-w-0 flex-col gap-5 pt-5 lg:pt-4">
          <RouterLink
            :to="{ name: 'Lead', params: { leadId } }"
            class="press mx-4 flex min-h-14 items-center gap-3 rounded-6 py-2 [@media(hover:hover)]:hover:bg-surface-gray-1"
            data-testid="prospecto-history"
          >
            <span
              class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
              aria-hidden="true"
            >
              <span class="lucide-history size-5" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="text-base text-ink-gray-9"
                >Ver historial completo</span
              >
              <span class="text-sm text-ink-gray-6"
                >Llamadas, correos, notas y todos los campos</span
              >
            </span>
            <span
              class="lucide-chevron-right size-4 flex-none text-ink-gray-5"
              aria-hidden="true"
            />
          </RouterLink>
          <!-- «Cliente»: the person's other deals and prospects, group, card,
               points and coupons, once the prospect has a contact. -->
          <ClientePanel
            class="mx-4 rounded-7 border border-outline-gray-2"
            :lead="leadId"
            :return-to="'/crm' + route.fullPath"
            :return-label="__('Leads')"
          />
          <!-- Shell SPEC §6 DD2: Conexiones, Actividad and the «⋯» sheets. -->
          <RecordKit :kit="kit" :title="name" :cadena="false" />
        </aside>
      </div>
    </div>
    <ConvertToDealModal
      v-if="convertOpen && doc"
      v-model="convertOpen"
      :lead="doc"
      @converted="openDeal"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ClientePanel from '@/components/ventas/ClientePanel.vue'
import { createResource, toast } from 'frappe-ui'
import { AppBar, EmptyState, StatusChip } from '@/components/ui'
import RecordIsland from '@/components/documentos/RecordIsland.vue'
import RecordKit from '@/components/documentos/compras/RecordKit.vue'
import { useRecordKit } from '@/components/documentos/compras/recordKit'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { recordActionsFor } from '@/documentos/acciones'
import { BTN } from '@/documentos/tools'
import { formatDate, formatDue, statusLabel } from '@/utils/display'
import { formatPhone } from '@/composables/crmFormat'
import { prospectName, sourceText } from '@/utils/prospects'

const ConvertToDealModal = defineAsyncComponent(
  () => import('@/components/Modals/ConvertToDealModal.vue'),
)
const props = defineProps({ leadId: { type: String, required: true } })
const router = useRouter()
const route = useRoute()

const lead = createResource({
  url: 'frappe.client.get',
  params: { doctype: 'CRM Lead', name: props.leadId },
  auto: true,
})
// The deal it became, so the hero can open it.
const deal = createResource({
  url: 'frappe.client.get_value',
  makeParams: () => ({
    doctype: 'CRM Deal',
    filters: { lead: props.leadId },
    fieldname: 'name',
  }),
})
const doc = computed(() => lead.data || null)
const convertOpen = ref(false)
const phone = computed(() => doc.value?.mobile_no || doc.value?.phone || '')
const name = computed(() => prospectName(doc.value || {}))
const sourceLabel = computed(() => sourceText(doc.value?.source))
const due = computed(() =>
  doc.value?.next_activity_at ? formatDue(doc.value.next_activity_at) : null,
)
const arrived = computed(() => formatDate(doc.value?.creation))
const errorText = computed(() =>
  /permission|PermissionError/i.test(String(lead.error?.message || ''))
    ? 'No tienes permiso para ver este prospecto.'
    : 'Revisa tu conexión e inténtalo de nuevo.',
)
watch(
  () => doc.value?.converted,
  (converted) => converted && deal.fetch(),
  { immediate: true },
)

// The engine's «⋯» tools, Conexiones and Actividad, loaded after paint.
const kit = useRecordKit('CRM Lead', {
  name: () => props.leadId,
  title: () => name.value,
  modified: () => doc.value?.modified,
  changed: () => lead.reload(),
})

const chip = computed(() => {
  const d = doc.value || {}
  if (d.converted) return { label: 'Ya es trato', tone: 'success' }
  if (due.value?.overdue)
    return { label: 'Seguimiento atrasado', tone: 'danger' }
  return {
    label: d.status ? statusLabel(d.status, 'lead') : 'Prospecto',
    tone: 'info',
  }
})

const digits = computed(() => phone.value.replace(/[^+\d]/g, ''))
// The hero's steps: convert (filled) or open the deal, then the ways to reach.
const nextSteps = computed(() => {
  const out = []
  const d = doc.value || {}
  if (!d.converted)
    out.push({
      key: 'convert',
      label: 'Convertir en trato',
      icon: 'lucide-briefcase',
      testid: 'prospecto-convert',
      run: () => (convertOpen.value = true),
    })
  else if (deal.data?.name)
    out.push({
      key: 'deal',
      label: 'Abrir el trato',
      icon: 'lucide-briefcase',
      run: () => openDeal(deal.data.name),
    })
  if (digits.value) {
    out.push({
      key: 'call',
      label: 'Llamar',
      icon: 'lucide-phone',
      href: `tel:${digits.value}`,
    })
    out.push({
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: 'lucide-message-circle',
      href: `https://wa.me/${digits.value.replace(/^\+/, '')}`,
      external: true,
    })
  }
  if (d.email)
    out.push({
      key: 'email',
      label: 'Correo',
      icon: 'lucide-mail',
      href: `mailto:${encodeURIComponent(d.email)}`,
    })
  return out
})

const details = computed(() => {
  const d = doc.value || {}
  return [
    phone.value && {
      label: 'Teléfono',
      value: formatPhone(phone.value),
      icon: 'lucide-phone',
    },
    d.email && { label: 'Correo', value: d.email, icon: 'lucide-mail' },
    d.organization && {
      label: 'Empresa',
      value: d.organization,
      icon: 'lucide-building-2',
    },
    d.status && {
      label: 'Estado',
      value: statusLabel(d.status, 'lead'),
      icon: 'lucide-flag',
    },
    sourceLabel.value && {
      label: 'Origen',
      value: sourceLabel.value,
      icon: 'lucide-map-pin',
    },
  ].filter(Boolean)
})

// The bolt: convert or open the deal; «⋯» keeps print, share, mail and the rest.
const boltSteps = computed(() =>
  nextSteps.value
    .filter((step) => step.run)
    .concat({
      key: 'history',
      label: 'Ver historial completo',
      icon: 'lucide-history',
      run: () =>
        router.push({ name: 'Lead', params: { leadId: props.leadId } }),
    }),
)
const boltGroups = computed(() =>
  recordActionsFor({ steps: boltSteps.value, tools: kit.tools.value }),
)
function onBolt({ key }) {
  if (key.startsWith('paso:')) boltSteps.value[Number(key.slice(5))]?.run()
  else kit.onTool(key)
}
function mail() {
  const action = kit.record.value?.actions?.email
  if (action?.allowed) kit.onTool('correo')
  else
    toast.error(
      action?.reason || 'Este prospecto no se puede enviar por correo.',
    )
}

function openDeal(dealName) {
  convertOpen.value = false
  router.push({ name: 'Deal 360', params: { dealId: dealName } })
}
</script>
