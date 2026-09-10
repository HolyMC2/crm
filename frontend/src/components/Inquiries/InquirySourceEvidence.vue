<template>
  <section
    v-if="evidence?.version === 1"
    data-testid="inquiry-source-evidence"
    class="source-evidence space-y-3 rounded-lg border border-outline-gray-2 p-3 text-sm"
  >
    <h4 class="font-semibold text-ink-gray-9">
      {{ __('Evidencia de origen') }}
    </h4>
    <dl class="grid min-w-0 gap-3 sm:grid-cols-2">
      <div v-for="field in fields" :key="field.label" class="min-w-0">
        <dt class="text-xs text-ink-gray-6">{{ __(field.label) }}</dt>
        <dd class="mt-1 text-ink-gray-8">
          {{ field.localized ? __(field.value) : field.value }}
        </dd>
      </div>
    </dl>
    <div
      v-if="evidence.purpose_statement || evidence.original_respondent"
      class="space-y-3 rounded-lg bg-surface-gray-1 p-3"
    >
      <div v-if="evidence.purpose_statement" data-testid="inquiry-form-purpose">
        <h5 class="font-medium text-ink-gray-9">
          {{ __('Finalidad de contacto del formulario') }}
        </h5>
        <p class="mt-1 whitespace-pre-wrap leading-relaxed text-ink-gray-8">
          {{ evidence.purpose_statement }}
        </p>
      </div>
      <div data-testid="inquiry-original-respondent" class="space-y-1">
        <h5 class="font-medium text-ink-gray-9">
          {{ __('Solicitante original') }}
        </h5>
        <template v-if="evidence.original_respondent">
          <p class="text-ink-gray-8">
            {{ evidence.original_respondent.display_name }}
          </p>
          <dl class="space-y-1 text-ink-gray-7">
            <div v-if="evidence.original_respondent.email">
              <dt class="text-xs text-ink-gray-6">
                {{ __('Correo electrónico') }}
              </dt>
              <dd>{{ evidence.original_respondent.email }}</dd>
            </div>
            <div v-if="evidence.original_respondent.phone">
              <dt class="text-xs text-ink-gray-6">{{ __('Teléfono') }}</dt>
              <dd>{{ evidence.original_respondent.phone }}</dd>
            </div>
          </dl>
        </template>
        <p v-else class="text-ink-gray-6">
          {{
            __('La evidencia no incluye los datos de la persona que respondió.')
          }}
        </p>
      </div>
      <p
        v-if="evidence.purpose_statement"
        class="text-xs leading-relaxed text-ink-gray-6"
      >
        {{
          __(
            'Esta finalidad corresponde únicamente a la persona que respondió el formulario. Agregar otra persona no le transfiere esa finalidad.',
          )
        }}
      </p>
    </div>
    <p class="text-xs leading-relaxed text-ink-gray-6">
      {{
        __(
          'La evidencia de origen no acredita consentimiento de marketing ni autoriza envíos.',
        )
      }}
    </p>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  evidence: { type: Object, default: null },
})
const sourceKinds = {
  fb_mention: 'Mención en Facebook',
  fb_comment: 'Comentario en Facebook',
  ig_mention: 'Mención en Instagram',
  ig_comment: 'Comentario en Instagram',
  lead_ad: 'Formulario de anuncio',
}
const modes = {
  manual_source: 'Captura manual desde el origen',
  automatic: 'Captura automática',
  manager_reprocess: 'Reprocesada por un responsable',
}
const responseChannels = {
  Email: 'Correo electrónico',
  'Phone call': 'Llamada telefónica',
  WhatsApp: 'WhatsApp',
}
const fields = computed(() => {
  const evidence = props.evidence || {}
  return [
    { label: 'Plataforma', value: evidence.provider },
    {
      label: 'Origen',
      value: sourceKinds[evidence.source_kind],
      localized: true,
    },
    { label: 'Captura', value: modes[evidence.mode], localized: true },
    { label: 'Cuenta de origen', value: evidence.account_id },
    { label: 'Identificador de origen', value: evidence.source_id },
    { label: 'Formulario', value: evidence.form_id },
    { label: 'Respuesta del formulario', value: evidence.leadgen_id },
    {
      label: 'Canal de respuesta indicado',
      value: responseChannels[evidence.response_channel],
      localized: true,
    },
    { label: 'Fecha de respuesta', value: evidence.submitted_at },
  ].filter((field) => field.value)
})
</script>

<style scoped>
.source-evidence {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
}
</style>
