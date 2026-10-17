<template>
  <!-- A prospect, read like a contact (Shell D4): one bar, the name, one filled
       next step («Convertir en trato»), quick actions that stay in place. -->
  <div class="flex h-full flex-col overflow-hidden bg-surface-base">
    <AppBar
      :back="{ name: 'Prospectos' }"
      back-label="Prospectos"
      title=""
      :loading="lead.loading"
      data-testid="prospecto-appbar"
    />
    <div class="flex-1 overflow-y-auto px-4 pb-24 pt-2">
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
      <template v-else>
        <div class="flex flex-col items-center gap-2 pt-2 text-center">
          <span
            class="flex size-20 items-center justify-center rounded-full bg-surface-gray-3 text-2xl font-semibold text-ink-gray-8"
            aria-hidden="true"
            >{{ initials(name) || '?' }}</span
          >
          <h1
            class="break-words text-2xl font-semibold text-ink-gray-9"
            data-testid="prospecto-name"
          >
            {{ name }}
          </h1>
          <p class="text-base text-ink-gray-6">
            {{ ['Prospecto', sourceLabel].filter(Boolean).join(' · ') }}
          </p>
        </div>

        <div class="mt-4 flex flex-col gap-3">
          <Button
            v-if="!doc.converted"
            variant="solid"
            size="lg"
            class="w-full"
            label="Convertir en trato"
            icon-left="briefcase"
            data-testid="prospecto-convert"
            @click="convertOpen = true"
          />
          <p
            v-else
            class="rounded-lg bg-surface-gray-2 px-3 py-2 text-base text-ink-gray-7"
          >
            Este prospecto ya es un trato.
          </p>
          <div class="grid grid-cols-2 gap-2">
            <component
              :is="phone ? 'a' : 'span'"
              :href="phone ? `tel:${phone.replace(/[^+\d]/g, '')}` : undefined"
              :class="[PILL, !phone && GREYED]"
              :aria-disabled="!phone || undefined"
              :title="phone ? undefined : 'Sin teléfono registrado'"
              data-action="call"
              ><span class="lucide-phone size-5" aria-hidden="true" />
              Llamar</component
            >
            <component
              :is="doc.email ? 'a' : 'span'"
              :href="
                doc.email
                  ? `mailto:${encodeURIComponent(doc.email)}`
                  : undefined
              "
              :class="[PILL, !doc.email && GREYED]"
              :aria-disabled="!doc.email || undefined"
              :title="doc.email ? undefined : 'Sin correo registrado'"
              data-action="email"
              ><span class="lucide-mail size-5" aria-hidden="true" />
              Correo</component
            >
          </div>
        </div>

        <section class="mt-6">
          <h2 class="mb-1 text-lg font-semibold text-ink-gray-9">Datos</h2>
          <dl class="divide-y divide-outline-gray-1">
            <div
              v-for="row in details"
              :key="row.label"
              class="flex min-h-12 flex-col justify-center py-2"
            >
              <dt class="text-sm text-ink-gray-6">{{ row.label }}</dt>
              <dd
                class="break-words text-base text-ink-gray-9"
                :class="row.tone === 'danger' && 'text-ink-red-4'"
              >
                {{ row.value }}
              </dd>
            </div>
          </dl>
        </section>

        <RouterLink
          :to="{ name: 'Lead', params: { leadId } }"
          class="mt-4 flex min-h-12 items-center gap-2 text-base font-medium text-ink-gray-8"
          data-testid="prospecto-history"
        >
          <span class="lucide-history size-5" aria-hidden="true" />
          Ver historial completo
          <span
            class="lucide-chevron-right ml-auto size-5"
            aria-hidden="true"
          />
        </RouterLink>
      </template>
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
import { computed, defineAsyncComponent, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Button, createResource } from 'frappe-ui'
import { AppBar, EmptyState } from '@/components/ui'
import { formatDate, formatDue, initials, statusLabel } from '@/utils/display'
import { formatPhone } from '@/composables/crmFormat'
import { prospectName, sourceText } from '@/utils/prospects'

const ConvertToDealModal = defineAsyncComponent(
  () => import('@/components/Modals/ConvertToDealModal.vue'),
)
const props = defineProps({ leadId: { type: String, required: true } })
const router = useRouter()

const PILL =
  'flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-surface-gray-2 text-sm font-medium text-ink-gray-8'
const GREYED = 'opacity-40 cursor-not-allowed'

const lead = createResource({
  url: 'frappe.client.get',
  params: { doctype: 'CRM Lead', name: props.leadId },
  auto: true,
})
const doc = computed(() => lead.data || null)
const convertOpen = ref(false)
const phone = computed(() => doc.value?.mobile_no || doc.value?.phone || '')
const name = computed(() => prospectName(doc.value || {}))
const sourceLabel = computed(() => sourceText(doc.value?.source))
const errorText = computed(() =>
  /permission|PermissionError/i.test(String(lead.error?.message || ''))
    ? 'No tienes permiso para ver este prospecto.'
    : 'Revisa tu conexión e inténtalo de nuevo.',
)
const details = computed(() => {
  const d = doc.value || {}
  const due = d.next_activity_at ? formatDue(d.next_activity_at) : null
  return [
    phone.value && { label: 'Teléfono', value: formatPhone(phone.value) },
    d.email && { label: 'Correo', value: d.email },
    d.organization && { label: 'Empresa', value: d.organization },
    d.status && { label: 'Estado', value: statusLabel(d.status, 'lead') },
    {
      label: 'Siguiente acción',
      value: due?.label || 'Sin seguimiento',
      tone: due?.overdue ? 'danger' : '',
    },
    d.creation && { label: 'Llegó', value: formatDate(d.creation) },
  ].filter(Boolean)
})
function openDeal(dealName) {
  convertOpen.value = false
  router.push({ name: 'Deal 360', params: { dealId: dealName } })
}
</script>
