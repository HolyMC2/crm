<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-2xl px-4 pt-4 sm:px-6">
      <!-- On a phone the shell's app bar has the back arrow (meta.listParent,
           or the `list` query Prenómina passes). -->
      <nav v-if="!isPhone" class="mb-3">
        <RouterLink
          :to="backRoute"
          class="press flex min-h-11 w-fit items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
        >
          <span class="lucide-arrow-left size-4" aria-hidden="true" />
          {{ __('Volver a Prenómina') }}
        </RouterLink>
      </nav>
      <h1
        class="title-face break-words text-2xl font-semibold text-ink-gray-9 [text-wrap:balance]"
      >
        {{ __('¿Cómo pagas a tu equipo?') }}
      </h1>
      <p class="mb-5 text-sm text-ink-gray-6">
        {{
          __(
            'Contesta una vez. Prenómina, Bonos y la caja siguen lo que elijas, y lo puedes cambiar cuando quieras.',
          )
        }}
      </p>

      <section v-if="failure" role="alert" class="space-y-3 py-4">
        <p class="text-base text-ink-gray-8">{{ failure }}</p>
        <button type="button" :class="SECONDARY" @click="load">
          {{ __('Volver a intentar') }}
        </button>
      </section>
      <p
        v-else-if="!answer"
        role="status"
        class="flex items-center gap-2 py-10 text-sm text-ink-gray-6"
      >
        <span
          class="lucide-loader-circle size-4 animate-spin"
          aria-hidden="true"
        />
        {{ __('Abriendo cómo pagas…') }}
      </p>
      <section
        v-else-if="!answer.available"
        role="status"
        class="space-y-3 py-4"
        data-testid="como-pago-no-disponible"
      >
        <p class="text-base text-ink-gray-8">
          {{
            __(
              'Esta parte todavía no está lista en tu Muelle. Mientras, Prenómina sigue como siempre.',
            )
          }}
        </p>
        <RouterLink :to="backRoute" :class="SECONDARY">
          {{ __('Volver a Prenómina') }}
        </RouterLink>
      </section>

      <!-- The receipt: what saving changed, in words. -->
      <section
        v-else-if="receipt"
        role="status"
        class="space-y-4 pb-10"
        data-testid="como-pago-recibo"
      >
        <h2 class="title-face text-lg font-semibold text-ink-gray-9">
          {{ __('Listo, quedó guardado') }}
        </h2>
        <ul class="space-y-2 text-base text-ink-gray-8">
          <li v-for="line in receipt.changes" :key="line" class="flex gap-2">
            <span
              class="lucide-check mt-1 size-4 flex-none text-ink-green-8"
              aria-hidden="true"
            />
            <span>{{ line }}</span>
          </li>
        </ul>
        <ul
          v-if="receipt.warnings?.length"
          class="space-y-1 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          <li v-for="w in receipt.warnings" :key="w.code">{{ w.message }}</li>
        </ul>
        <div class="flex flex-wrap gap-2">
          <RouterLink :to="backRoute" :class="PRIMARY">
            {{ __('Ir a Prenómina') }}
          </RouterLink>
          <button type="button" :class="SECONDARY" @click="receipt = null">
            {{ __('Cambiar respuestas') }}
          </button>
        </div>
      </section>

      <form
        v-else
        id="como-pago"
        class="space-y-7 pb-6"
        data-testid="como-pago"
        @submit.prevent="save"
      >
        <p
          v-if="!answer.can_edit"
          role="status"
          class="rounded-6 bg-surface-gray-2 p-3 text-sm text-ink-gray-8"
        >
          {{
            __(
              'Solo el dueño cambia cómo se le paga al equipo. Aquí ves lo que eligió.',
            )
          }}
        </p>

        <fieldset :disabled="!answer.can_edit" class="space-y-7">
          <!-- 1. How much Muelle handles: three cards that only set switches. -->
          <section :aria-label="__('¿Cuánto quieres que lleve Muelle?')">
            <h2 :class="QUESTION">
              {{ __('¿Cuánto quieres que lleve Muelle?') }}
            </h2>
            <div class="grid gap-2">
              <button
                v-for="card in LEVELS"
                :key="card.value"
                type="button"
                class="press flex min-h-16 w-full items-start gap-3 rounded-8 border p-3 text-left"
                :class="
                  level === card.value
                    ? 'border-[var(--muelle-accent)] bg-surface-gray-1'
                    : 'border-outline-gray-2 hover:bg-surface-gray-1'
                "
                :aria-pressed="level === card.value"
                :data-testid="`nivel-${card.value}`"
                @click="chooseLevel(card.value)"
              >
                <span
                  class="mt-0.5 flex size-5 flex-none items-center justify-center rounded-full border-2"
                  :class="
                    level === card.value
                      ? 'border-[var(--muelle-accent)]'
                      : 'border-outline-gray-4'
                  "
                  aria-hidden="true"
                >
                  <span
                    v-if="level === card.value"
                    class="size-2.5 rounded-full bg-[var(--muelle-accent)]"
                  />
                </span>
                <span class="min-w-0">
                  <span class="block text-base font-semibold text-ink-gray-9">{{
                    __(card.title)
                  }}</span>
                  <span class="block text-sm text-ink-gray-6">{{
                    __(card.detail)
                  }}</span>
                </span>
              </button>
            </div>
          </section>

          <!-- 2. When. -->
          <section class="space-y-4">
            <div>
              <h2 :class="QUESTION">{{ __('¿Cada cuándo pagas?') }}</h2>
              <ChipGroup
                :model-value="values.frecuencia"
                :options="answer.options.frecuencia"
                :clear-value="values.frecuencia"
                testid="frecuencia"
                @update:model-value="(v) => set('frecuencia', v)"
              />
            </div>
            <div v-if="visible.dia_pago">
              <h2 :class="QUESTION">{{ __('¿Qué día?') }}</h2>
              <ChipGroup
                :model-value="values.dia_pago"
                :options="answer.options.dia_pago"
                :clear-value="values.dia_pago"
                testid="dia"
                @update:model-value="(v) => set('dia_pago', v)"
              />
            </div>
            <p
              v-else-if="values.frecuencia"
              class="text-sm text-ink-gray-6"
              data-testid="periodo-fijo"
            >
              {{
                values.frecuencia === QUINCENAL
                  ? __('Pagas el 15 y el último día de cada mes.')
                  : __('Pagas el último día de cada mes.')
              }}
            </p>
          </section>

          <!-- 3. Where the money comes from and who hands it over. -->
          <section class="space-y-4">
            <div>
              <h2 :class="QUESTION">{{ __('¿De dónde sale el dinero?') }}</h2>
              <p class="-mt-1 mb-2 text-sm text-ink-gray-6">
                {{
                  __('Elige todos los que uses. Cada pago dice de cuál salió.')
                }}
              </p>
              <ChipGroup
                :model-value="origenesOn(values)"
                :options="origenChips"
                multiple
                testid="origen"
                @update:model-value="(v) => replace(setOrigenes(values, v))"
              />
            </div>
            <label
              v-if="visible.crear_aportacion"
              :class="SWITCH_ROW"
              data-testid="crear-aportacion"
            >
              <span class="min-w-0 flex-1">
                <span class="block text-base text-ink-gray-9">{{
                  __('Crear la cuenta «Aportaciones del dueño»')
                }}</span>
                <span class="block text-sm text-ink-gray-6">{{
                  __(
                    'Ahí se anota el dinero que pones tú. Si tu contador ya tiene una, déjalo apagado y pídele que la elija.',
                  )
                }}</span>
              </span>
              <AjustesSwitch
                v-model="crearAportacion"
                :label="__('Crear la cuenta «Aportaciones del dueño»')"
              />
            </label>
            <div v-if="visible.quien_entrega">
              <h2 :class="QUESTION">{{ __('¿Quién lo entrega?') }}</h2>
              <ChipGroup
                :model-value="values.quien_entrega"
                :options="answer.options.quien_entrega"
                :clear-value="values.quien_entrega"
                testid="entrega"
                @update:model-value="(v) => set('quien_entrega', v)"
              />
            </div>
            <label
              v-if="visible.cajero_ve_montos"
              :class="SWITCH_ROW"
              data-testid="cajero-ve-montos"
            >
              <span class="min-w-0 flex-1">
                <span class="block text-base text-ink-gray-9">{{
                  __('El cajero ve cuánto gana cada quien')
                }}</span>
                <span class="block text-sm text-ink-gray-6">{{
                  __('Apagado, solo ve lo que dejaste para entregar.')
                }}</span>
              </span>
              <AjustesSwitch
                :model-value="flag('cajero_ve_montos')"
                :label="__('El cajero ve cuánto gana cada quien')"
                @update:model-value="(v) => set('cajero_ve_montos', v ? 1 : 0)"
              />
            </label>
          </section>

          <!-- 4. Only when Muelle calculates. -->
          <section
            v-if="visible.calcula"
            class="space-y-4"
            data-testid="calcula"
          >
            <div>
              <h2 :class="QUESTION">
                {{ __('¿Cómo les pagas casi siempre?') }}
              </h2>
              <p class="-mt-1 mb-2 text-sm text-ink-gray-6">
                {{
                  __(
                    'Es lo que sale primero al decir cuánto gana alguien nuevo.',
                  )
                }}
              </p>
              <ChipGroup
                :model-value="values.base_default"
                :options="answer.options.base_default"
                clear-value=""
                testid="base"
                @update:model-value="(v) => set('base_default', v || null)"
              />
            </div>
            <div>
              <h2 :class="QUESTION">
                {{ __('¿Cómo sé cuántos días trabajó?') }}
              </h2>
              <ChipGroup
                :model-value="values.dias_fuente"
                :options="answer.options.dias_fuente"
                :clear-value="values.dias_fuente"
                testid="dias-fuente"
                @update:model-value="(v) => set('dias_fuente', v)"
              />
            </div>
            <details class="group" data-testid="fold-calculo">
              <summary :class="FOLD">
                <span
                  class="lucide-chevron-right size-4 transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
                {{ __('Más detalles del cálculo') }}
              </summary>
              <div class="divide-y divide-outline-gray-1">
                <label
                  v-for="row in calcRows"
                  :key="row.field"
                  :class="SWITCH_ROW"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block text-base text-ink-gray-9">{{
                      row.label
                    }}</span>
                    <span
                      v-if="row.detail"
                      class="block text-sm text-ink-gray-6"
                      >{{ row.detail }}</span
                    >
                  </span>
                  <AjustesSwitch
                    :model-value="flag(row.field)"
                    :label="row.label"
                    @update:model-value="(v) => set(row.field, v ? 1 : 0)"
                  />
                </label>
                <label v-if="visible.cuota_default" :class="SWITCH_ROW">
                  <span class="min-w-0 flex-1 text-base text-ink-gray-9">{{
                    __('Descuento del préstamo por pago')
                  }}</span>
                  <input
                    :value="values.cuota_default"
                    type="number"
                    min="0"
                    step="any"
                    inputmode="decimal"
                    :class="NUMBER"
                    @change="(e) => set('cuota_default', e.target.value)"
                  />
                </label>
                <label v-if="visible.dias_mes" :class="SWITCH_ROW">
                  <span class="min-w-0 flex-1">
                    <span class="block text-base text-ink-gray-9">{{
                      __('Días que cuenta un mes')
                    }}</span>
                    <span class="block text-sm text-ink-gray-6">{{
                      __(
                        'Para sacar cuánto gana por día quien cobra por mes o quincena.',
                      )
                    }}</span>
                  </span>
                  <input
                    :value="values.dias_mes"
                    type="number"
                    min="28"
                    max="31"
                    inputmode="numeric"
                    :class="NUMBER"
                    @change="(e) => set('dias_mes', e.target.value)"
                  />
                </label>
              </div>
            </details>
          </section>

          <!-- What the law asks: each piece its own switch, never required. -->
          <details
            v-if="visible.ley"
            class="group"
            :open="level === TODO || undefined"
            data-testid="fold-ley"
          >
            <summary :class="FOLD">
              <span
                class="lucide-chevron-right size-4 transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              {{ __('Lo que pide la ley') }}
            </summary>
            <p class="mb-1 text-sm text-ink-gray-6">
              {{
                __(
                  'Cada pieza es opcional. Muelle la calcula cuando la enciendes; confirma lo fiscal con tu contador.',
                )
              }}
            </p>
            <div class="divide-y divide-outline-gray-1">
              <template v-for="row in leyRows" :key="row.field">
                <label :class="SWITCH_ROW" :data-ley="row.field">
                  <span class="min-w-0 flex-1">
                    <span class="block text-base text-ink-gray-9">{{
                      row.label
                    }}</span>
                    <span
                      v-if="row.detail"
                      class="block text-sm text-ink-gray-6"
                      >{{ row.detail }}</span
                    >
                  </span>
                  <AjustesSwitch
                    :model-value="flag(row.field)"
                    :label="row.label"
                    @update:model-value="(v) => set(row.field, v ? 1 : 0)"
                  />
                </label>
                <label
                  v-if="row.field === 'aguinaldo' && visible.aguinaldo_dias"
                  :class="SWITCH_ROW"
                >
                  <span class="min-w-0 flex-1 text-base text-ink-gray-9">{{
                    __('Días de aguinaldo')
                  }}</span>
                  <input
                    :value="values.aguinaldo_dias"
                    type="number"
                    min="1"
                    inputmode="numeric"
                    :class="NUMBER"
                    @change="(e) => set('aguinaldo_dias', e.target.value)"
                  />
                </label>
                <label
                  v-if="row.field === 'prima_vacacional' && visible.prima_pct"
                  :class="SWITCH_ROW"
                >
                  <span class="min-w-0 flex-1 text-base text-ink-gray-9">{{
                    __('Prima vacacional (%)')
                  }}</span>
                  <input
                    :value="values.prima_pct"
                    type="number"
                    min="1"
                    max="100"
                    inputmode="decimal"
                    :class="NUMBER"
                    @change="(e) => set('prima_pct', e.target.value)"
                  />
                </label>
              </template>
            </div>
          </details>

          <details class="group" data-testid="fold-equipo">
            <summary :class="FOLD">
              <span
                class="lucide-chevron-right size-4 transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              {{ __('Para tu equipo') }}
            </summary>
            <div class="divide-y divide-outline-gray-1">
              <label
                v-for="row in equipoRows"
                :key="row.field"
                :class="SWITCH_ROW"
              >
                <span class="min-w-0 flex-1">
                  <span class="block text-base text-ink-gray-9">{{
                    row.label
                  }}</span>
                  <span
                    v-if="row.detail"
                    class="block text-sm text-ink-gray-6"
                    >{{ row.detail }}</span
                  >
                </span>
                <AjustesSwitch
                  :model-value="flag(row.field)"
                  :label="row.label"
                  @update:model-value="(v) => set(row.field, v ? 1 : 0)"
                />
              </label>
            </div>
          </details>

          <details class="group" data-testid="fold-cuentas">
            <summary :class="FOLD">
              <span
                class="lucide-chevron-right size-4 transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              {{ __('Cuentas (contador)') }}
            </summary>
            <p class="mb-1 text-sm text-ink-gray-6">
              {{
                __(
                  'Muelle las eligió por su nombre en tu catálogo. Si alguna no es, pídele a tu contador que la cambie.',
                )
              }}
            </p>
            <dl class="divide-y divide-outline-gray-1">
              <div
                v-for="row in cuentaRows"
                :key="row.field"
                class="flex min-h-11 items-center justify-between gap-3 py-2"
              >
                <dt class="text-sm text-ink-gray-7">{{ row.label }}</dt>
                <dd class="min-w-0 truncate text-right text-sm text-ink-gray-9">
                  {{ values[row.field] || __('Sin elegir') }}
                </dd>
              </div>
            </dl>
          </details>
        </fieldset>

        <!-- What saving changes, read from doco before the tap. -->
        <section
          v-if="preview && !missing.length"
          aria-live="polite"
          class="space-y-2"
          data-testid="como-pago-cambios"
        >
          <h2 :class="QUESTION">{{ __('Al guardar') }}</h2>
          <ul class="space-y-1 text-sm text-ink-gray-8">
            <li v-for="line in preview.changes" :key="line">{{ line }}</li>
          </ul>
          <ul
            v-if="preview.warnings.length"
            class="space-y-1 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
          >
            <li v-for="w in preview.warnings" :key="w.code">{{ w.message }}</li>
          </ul>
        </section>
      </form>
    </div>

    <!-- «Guardar» in the thumb's reach, with why it waits beside it. -->
    <div
      v-if="answer?.available && answer.can_edit && !receipt && !failure"
      class="sticky bottom-0 mt-auto border-t border-outline-gray-1 bg-surface-base"
    >
      <div
        class="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3 sm:px-6"
      >
        <p
          class="min-w-0 flex-1 text-sm"
          :class="stopper?.blocker ? 'text-ink-red-7' : 'text-ink-gray-6'"
          :role="stopper?.blocker || problem ? 'alert' : undefined"
          data-testid="como-pago-espera"
        >
          {{ problem || stopper?.message || '' }}
        </p>
        <button
          type="submit"
          form="como-pago"
          :class="PRIMARY"
          :disabled="Boolean(stopper) || saving"
          data-testid="como-pago-guardar"
        >
          <span
            v-if="saving"
            class="lucide-loader-circle size-4 animate-spin"
            aria-hidden="true"
          />
          {{ __('Guardar') }}
        </button>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ChipGroup } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { equipoApi, requestId } from '@/composables/useEquipo'
import {
  AJUSTES_APPLY,
  AJUSTES_GET,
  AJUSTES_PREVIEW,
  LEVELS,
  QUINCENAL,
  TODO,
  answersKey,
  levelOf,
  missingAnswers,
  withAnswer,
  origenOptions,
  origenesOn,
  payloadOf,
  pickLevel,
  setOrigenes,
  visibleQuestions,
} from '@/composables/useComoPago'
import { errorText } from '@/utils/errorText'

const QUESTION = 'title-face mb-2 text-base font-semibold text-ink-gray-9'
const FOLD =
  'fold-summary press flex min-h-11 cursor-pointer list-none items-center gap-2 text-base font-semibold text-ink-gray-9'
const SWITCH_ROW = 'flex min-h-14 items-center gap-3 py-2'
const NUMBER =
  'num h-11 w-24 rounded-6 border-0 bg-surface-gray-2 px-3 text-right text-base text-ink-gray-9 sm:h-10'
const PRIMARY =
  'press inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-8 bg-[var(--muelle-accent)] px-5 text-base font-semibold text-[var(--muelle-accent-ink)] disabled:opacity-50'
const SECONDARY =
  'press inline-flex min-h-11 items-center justify-center rounded-8 bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-8 hover:bg-surface-gray-3'

const route = useRoute()
const backRoute = computed(() => {
  const list = route.query.list
  return typeof list === 'string' && list.startsWith('/equipo')
    ? list
    : { name: 'EquipoPrenomina' }
})

const answer = ref(null)
const failure = ref('')
const values = ref({})
const level = ref(null)
const crearAportacion = ref(false)
const preview = ref(null)
const problem = ref('')
const saving = ref(false)
const receipt = ref(null)

const show = computed(() => answer.value?.show || {})
const visible = computed(() => visibleQuestions(values.value, show.value))
const weekdays = computed(() =>
  (answer.value?.options?.dia_pago || []).map((o) => o.value),
)
const missing = computed(() =>
  missingAnswers(values.value, level.value, weekdays.value),
)
const origenChips = computed(() =>
  origenOptions(answer.value?.options, values.value, show.value).map((o) => ({
    value: o.field,
    label: o.label,
  })),
)
// The first thing «Guardar» waits for: an unanswered question, then a refusal
// doco's preview names (each says what to do instead).
const stopper = computed(() => {
  if (missing.value.length) return { message: __(missing.value[0].message) }
  const blocker = preview.value?.blockers?.[0]
  return blocker ? { message: blocker.message, blocker: true } : null
})

const flag = (field) => Boolean(Number(values.value[field]))
function set(field, value) {
  values.value = withAnswer(values.value, field, value)
}
function replace(next) {
  values.value = next
}
function chooseLevel(value) {
  level.value = value
  values.value = pickLevel(values.value, value, show.value)
}

const calcRows = computed(() =>
  [
    {
      field: 'paga_descanso',
      label: __('Pago sus días de descanso'),
      detail: __(
        'A quien cobra por día, se le suman los descansos de su horario.',
      ),
    },
    {
      field: 'horas_extra',
      label: __('Pago horas extra'),
      detail: __('Según las reglas de jornada de tu negocio.'),
    },
    {
      field: 'descontar_faltas',
      label: __('Descuento las faltas sin permiso'),
      detail: __('Solo a quien tiene sueldo fijo.'),
    },
    {
      field: 'arrastrar_saldo',
      label: __('Si le di de más, lo resto el siguiente pago'),
      detail: __('Sale como una línea que puedes cambiar.'),
    },
    visible.value.prestamos && {
      field: 'prestamos',
      label: __('Presto dinero y lo descuento en pagos'),
    },
  ].filter(Boolean),
)
const leyRows = computed(() =>
  [
    visible.value.aguinaldo && {
      field: 'aguinaldo',
      label: __('Aguinaldo'),
      detail: __('Vence el 20 de diciembre.'),
    },
    visible.value.prima_vacacional && {
      field: 'prima_vacacional',
      label: __('Prima vacacional'),
    },
    visible.value.ptu && {
      field: 'ptu',
      label: __('Reparto de utilidades (PTU)'),
    },
    visible.value.finiquito && {
      field: 'finiquito',
      label: __('Finiquito al dar de baja'),
    },
    visible.value.retenciones && {
      field: 'retenciones',
      label: __('Retener ISR e IMSS'),
    },
    visible.value.recibos && {
      field: 'recibos',
      label: __('Recibos de nómina'),
      detail: __('Uno por persona al cerrar cada pago.'),
    },
    visible.value.cfdi_nomina && {
      field: 'cfdi_nomina',
      label: __('Timbrar la nómina'),
    },
  ].filter(Boolean),
)
const equipoRows = computed(() => [
  {
    field: 'recibo_trabajador',
    label: __('Recibo firmado para cada quien'),
    detail: __('Tú decides cuándo se lo mandas.'),
  },
  {
    field: 'mis_pagos',
    label: __('Cada quien ve sus pagos en su perfil'),
  },
])
const cuentaRows = computed(() => [
  { field: 'cuenta_sueldos', label: __('Sueldos') },
  { field: 'cuenta_bonos', label: __('Bonos y comisiones') },
  { field: 'cuenta_aguinaldo', label: __('Aguinaldo') },
  { field: 'cuenta_caja_fuerte', label: __('Caja fuerte') },
  { field: 'cuenta_aportacion_dueno', label: __('Aportaciones del dueño') },
  { field: 'cuenta_banco', label: __('Banco') },
])

async function load() {
  failure.value = ''
  try {
    const next = await equipoApi(AJUSTES_GET)
    values.value = { ...(next.values || {}) }
    level.value = levelOf(next.values, next.configured)
    answer.value = next
  } catch (error) {
    failure.value = errorText(error, __('No pude abrir cómo pagas.'))
  }
}

// One preview per set of answers; «Guardar» waits for the one in flight.
let previewing = null
let previewKey = ''
let applyRequest = { key: '', id: '' }
function runPreview() {
  const key = answersKey(values.value, crearAportacion.value)
  if (previewing && previewKey === key) return previewing
  previewKey = key
  const ask = equipoApi(AJUSTES_PREVIEW, {
    company: answer.value.company,
    values: payloadOf(values.value, crearAportacion.value),
  })
  previewing = ask
    .then((plan) => {
      if (previewKey === key) {
        preview.value = { ...plan, key }
        problem.value = ''
      }
      return plan
    })
    .catch((error) => {
      if (previewKey === key) {
        preview.value = null
        problem.value = errorText(error, __('No pude revisar tus respuestas.'))
      }
      previewKey = ''
      throw error
    })
  return previewing
}

let timer = null
watch(
  () => [answersKey(values.value, crearAportacion.value), missing.value.length],
  ([, unanswered]) => {
    clearTimeout(timer)
    if (!answer.value?.available || !answer.value.can_edit || unanswered) return
    timer = setTimeout(() => runPreview().catch(() => {}), 250)
  },
)

async function save() {
  if (stopper.value || saving.value) return
  saving.value = true
  problem.value = ''
  try {
    clearTimeout(timer)
    const plan = await runPreview()
    if (plan.blockers?.length) return
    const key = answersKey(values.value, crearAportacion.value)
    // The same answers retried after a lost reply replay the same receipt.
    if (applyRequest.key !== key) applyRequest = { key, id: requestId() }
    const done = await equipoApi(AJUSTES_APPLY, {
      company: answer.value.company,
      values: payloadOf(values.value, crearAportacion.value),
      token: plan.token,
      request_id: applyRequest.id,
    })
    receipt.value = done
    values.value = { ...values.value, ...(done.values || {}) }
    answer.value = { ...answer.value, configured: true }
    crearAportacion.value = false
    preview.value = null
    previewKey = ''
    applyRequest = { key: '', id: '' }
  } catch (error) {
    previewKey = ''
    problem.value = errorText(
      error,
      __('No se pudo guardar. Vuelve a intentar.'),
    )
  } finally {
    saving.value = false
  }
}

load()
</script>
