<template>
  <ReportBlock
    :title="__('Preparar reactivaciones')"
    :description="
      __(
        'Usa el segmento y días de inactividad indicados aquí, independientemente de los filtros del reporte. Cada envío requiere revisión humana.',
      )
    "
    :loading="templates.loading"
    :error="templates.error"
    @retry="templates.reload"
  >
    <form class="space-y-4" @submit.prevent="previewAudience">
      <fieldset :disabled="busy" class="grid min-w-0 gap-4 sm:grid-cols-2">
        <label class="min-w-0 text-sm text-ink-gray-7"
          >{{ __('Segmento') }}
          <select
            v-model="segment"
            class="mt-1 block min-h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-ink-gray-9"
          >
            <option value="cold_leads">
              {{ __('Cold leads (no activity)') }}
            </option>
            <option value="dormant_customers">
              {{ __('Clientes inactivos (con compra previa)') }}
            </option>
          </select>
        </label>
        <label class="min-w-0 text-sm text-ink-gray-7"
          >{{ __('Días sin actividad') }}
          <input
            v-model.number="days"
            required
            type="number"
            min="7"
            step="1"
            class="mt-1 block min-h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-ink-gray-9"
          />
        </label>
        <label class="min-w-0 text-sm text-ink-gray-7 sm:col-span-2"
          >{{ __('Plantilla aprobada') }}
          <select
            v-model="template"
            class="mt-1 block min-h-11 w-full rounded-lg border border-outline-gray-2 bg-surface-base px-3 text-ink-gray-9"
          >
            <option value="">{{ __('Selecciona una plantilla') }}</option>
            <option
              v-for="row in templates.data || []"
              :key="row.name"
              :value="row.name"
            >
              {{ row.template_name || row.name }}
            </option>
          </select>
        </label>
      </fieldset>
      <p v-if="!templates.data?.length" class="text-sm text-ink-gray-6">
        {{ __('No hay plantillas aprobadas disponibles.') }}
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="submit"
          :disabled="busy || !validDays"
          class="min-h-11 rounded-lg border border-outline-gray-2 px-3 text-sm text-ink-gray-9 hover:bg-surface-gray-2 disabled:opacity-50"
        >
          {{ busy ? __('Procesando…') : __('Previsualizar audiencia') }}
        </button>
        <button
          type="button"
          :disabled="busy || !template || !preview?.staged || !validDays"
          class="min-h-11 rounded-lg bg-surface-gray-7 px-3 text-sm text-ink-white disabled:opacity-50"
          @click="stageAudience"
        >
          {{ __('Enviar {0} a revisión', [preview?.staged || 0]) }}
        </button>
      </div>
    </form>
    <p v-if="error" role="alert" class="mt-3 text-sm text-ink-red-7">
      {{ error }}
    </p>
    <p v-if="success" role="status" class="mt-3 text-sm text-ink-gray-9">
      {{ success }}
    </p>
    <div v-if="preview" class="mt-4 space-y-3">
      <p class="text-sm text-ink-gray-7">
        {{
          __(
            '{0} elegibles de {1} contactos · {2} excluidos por baja · {3} contactados recientemente',
            [
              preview.staged,
              preview.audience_total,
              preview.skipped_suppressed,
              preview.skipped_recent,
            ],
          )
        }}
      </p>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'Vista previa de hasta 200 contactos; no se envía nada automáticamente.',
          )
        }}
      </p>
      <ul class="divide-y divide-outline-gray-2 text-sm text-ink-gray-8">
        <li
          v-for="row in preview.sample || []"
          :key="row.reference_name"
          class="flex flex-wrap justify-between gap-2 py-2"
        >
          <span class="break-words">{{ row.name }}</span
          ><span>{{ row.mobile_no }}</span>
        </li>
      </ul>
    </div>
  </ReportBlock>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import ReportBlock from './ReportBlock.vue'
import { marketingError, useMarketingResource } from './MarketingData'
const templates = useMarketingResource(
  'doco_marketing.api.reactivation.get_templates',
  () => ({}),
)
const segment = ref('cold_leads')
const days = ref(45)
const template = ref('')
const preview = ref(null)
const busy = ref(false)
const error = ref('')
const success = ref('')
const validDays = computed(
  () => Number.isInteger(days.value) && days.value >= 7,
)
watch([segment, days], () => {
  preview.value = null
  success.value = ''
  error.value = ''
})
const params = () => ({ segment: segment.value, days: days.value, limit: 200 })
async function previewAudience() {
  if (busy.value || !validDays.value) return
  busy.value = true
  error.value = ''
  success.value = ''
  preview.value = null
  try {
    preview.value = await call(
      'doco_marketing.api.reactivation.preview',
      params(),
    )
  } catch (cause) {
    error.value = marketingError(cause)
  } finally {
    busy.value = false
  }
}
async function stageAudience() {
  if (
    busy.value ||
    !template.value ||
    !preview.value?.staged ||
    !validDays.value
  )
    return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await call(
      'doco_marketing.api.reactivation.stage_reactivation',
      { ...params(), template: template.value },
    )
    success.value = __('{0} reactivaciones en cola de revisión.', [
      result.staged,
    ])
    preview.value = null
    preview.value = await call(
      'doco_marketing.api.reactivation.preview',
      params(),
    )
  } catch (cause) {
    error.value = marketingError(cause)
  } finally {
    busy.value = false
  }
}
</script>
