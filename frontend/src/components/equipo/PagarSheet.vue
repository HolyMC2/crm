<template>
  <BottomSheet
    :open="open"
    :title="title"
    :subtitle="preview?.periodo?.label || ''"
    :dismissible="step !== 'revisar' || !saving"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="space-y-4 pb-2" data-testid="pagar-hoja">
      <p
        v-if="notice"
        role="status"
        class="rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        data-testid="pagar-aviso"
      >
        {{ notice }}
      </p>
      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-testid="pagar-problema"
      >
        {{ problem }}
      </p>

      <!-- The receipt: what was booked, and what waits at the register. -->
      <template v-if="step === 'listo' && receipt">
        <p
          role="status"
          class="rounded-6 bg-surface-green-1 p-3 text-sm text-ink-green-8"
          data-testid="pagar-recibo"
        >
          {{ receipt.message }}
        </p>
        <section
          v-if="receipt.pagados.length"
          data-testid="pagar-recibo-pagados"
        >
          <h3 class="mb-1 text-sm font-medium text-ink-gray-7">
            {{ __('Quedó pagado') }}
          </h3>
          <ul class="divide-y divide-outline-gray-1">
            <li
              v-for="fila in receipt.pagados"
              :key="fila.name"
              class="flex items-start gap-3 py-2 text-sm"
            >
              <span class="min-w-0 flex-1">
                <span class="block font-medium text-ink-gray-9">{{
                  fila.employee_name || fila.employee
                }}</span>
                <span class="block text-ink-gray-6"
                  >{{ conceptoLabel(fila.concepto) }},
                  {{ origenLabel(fila.origen) }}</span
                >
              </span>
              <span class="flex-none tabular-nums text-ink-gray-9">{{
                money(fila.monto)
              }}</span>
            </li>
          </ul>
        </section>
        <section
          v-if="receipt.porEntregar.length"
          data-testid="pagar-recibo-caja"
        >
          <h3 class="mb-1 text-sm font-medium text-ink-gray-7">
            {{ __('Para entregar en la caja') }}
          </h3>
          <ul class="divide-y divide-outline-gray-1">
            <li
              v-for="fila in receipt.porEntregar"
              :key="fila.name"
              class="flex items-start gap-3 py-2 text-sm"
            >
              <span class="min-w-0 flex-1">
                <span class="block font-medium text-ink-gray-9">{{
                  fila.employee_name || fila.employee
                }}</span>
                <span class="block text-ink-gray-6">{{
                  conceptoLabel(fila.concepto)
                }}</span>
              </span>
              <span class="flex-none tabular-nums text-ink-gray-9">{{
                money(fila.monto)
              }}</span>
            </li>
          </ul>
        </section>
      </template>

      <!-- The review: every line as it will be booked, before the one tap. -->
      <template v-else-if="step === 'revisar'">
        <dl
          class="grid grid-cols-2 gap-x-4 gap-y-2"
          data-testid="pagar-totales"
        >
          <div>
            <dt class="text-sm text-ink-gray-6">{{ __('Total') }}</dt>
            <dd class="text-xl font-semibold tabular-nums text-ink-gray-9">
              {{ money(resumen.total) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-ink-gray-6">{{ __('Personas') }}</dt>
            <dd class="text-xl font-semibold tabular-nums text-ink-gray-9">
              {{ resumen.personas }}
            </dd>
          </div>
          <div
            v-for="item in resumen.porOrigen"
            :key="item.origen"
            data-testid="pagar-por-origen"
          >
            <dt class="text-sm text-ink-gray-6">{{ item.label }}</dt>
            <dd class="text-base font-medium tabular-nums text-ink-gray-9">
              {{ money(item.monto) }}
            </dd>
          </div>
        </dl>
        <ul
          v-if="resumen.deMas.length"
          class="space-y-1 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
          data-testid="pagar-de-mas"
        >
          <li v-for="item in resumen.deMas" :key="item.employee">
            {{
              __('A {0} le das {1} más de lo que le falta.', [
                item.nombre,
                money(item.monto),
              ])
            }}
          </li>
        </ul>
        <ul
          class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
        >
          <li
            v-for="(linea, index) in plan.lineas"
            :key="index"
            class="flex items-start gap-3 p-3 text-sm"
            data-testid="pagar-revision-linea"
            :data-employee="linea.employee"
          >
            <span class="min-w-0 flex-1">
              <span class="block font-medium text-ink-gray-9">{{
                nameOf(linea.employee)
              }}</span>
              <span class="block text-ink-gray-6"
                >{{ conceptoLabel(linea.concepto) }},
                {{ pagarOrigenLabel(linea.origen) }}</span
              >
            </span>
            <span class="flex-none font-medium tabular-nums text-ink-gray-9">{{
              money(linea.monto)
            }}</span>
          </li>
        </ul>
      </template>

      <!-- Editing: per person the suggested amount, concept and origin. -->
      <template v-else>
        <p
          v-for="warning in preview?.warnings || []"
          :key="warning.code"
          role="status"
          class="rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          {{ warning.message }}
        </p>
        <ul class="space-y-3">
          <li
            v-for="line in lines"
            :key="line.key"
            class="space-y-2 rounded-6 border border-outline-gray-2 p-3"
            data-testid="pagar-linea"
            :data-employee="line.employee"
          >
            <div class="flex items-start gap-3">
              <label
                class="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3"
              >
                <input
                  v-model="line.incluir"
                  type="checkbox"
                  class="size-5 flex-none"
                  data-testid="pagar-incluir"
                />
                <span class="min-w-0">
                  <span
                    class="block break-words text-base font-medium text-ink-gray-9"
                    >{{ line.nombre }}</span
                  >
                  <span
                    v-if="faltaLine(line)"
                    class="block text-sm text-ink-gray-6"
                    >{{ faltaLine(line) }}</span
                  >
                </span>
              </label>
              <button
                v-if="siblings(line) > 1"
                type="button"
                class="press flex min-h-11 flex-none items-center px-2 text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9"
                data-testid="pagar-quitar"
                @click="lines = pagarRemove(lines, line.key)"
              >
                {{ __('Quitar') }}
              </button>
            </div>
            <template v-if="line.incluir">
              <div class="grid grid-cols-2 gap-2">
                <label class="block">
                  <span class="mb-1 block text-sm text-ink-gray-7">{{
                    __('Cuánto')
                  }}</span>
                  <input
                    v-model="line.monto"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    :class="FIELD"
                    class="tabular-nums"
                    data-testid="pagar-monto"
                  />
                </label>
                <label class="block">
                  <span class="mb-1 block text-sm text-ink-gray-7">{{
                    __('Concepto')
                  }}</span>
                  <select
                    v-model="line.concepto"
                    :class="FIELD"
                    data-testid="pagar-concepto"
                  >
                    <option
                      v-for="c in preview?.conceptos || []"
                      :key="c.value"
                      :value="c.value"
                    >
                      {{ c.label || conceptoLabel(c.value) }}
                    </option>
                  </select>
                </label>
              </div>
              <div
                class="flex flex-wrap gap-2"
                role="radiogroup"
                :aria-label="__('De dónde sale')"
              >
                <button
                  v-for="origen in preview?.origenes || []"
                  :key="origen.value"
                  type="button"
                  role="radio"
                  :aria-checked="line.origen === origen.value"
                  :aria-disabled="!origen.available"
                  :class="originClass(line, origen)"
                  data-testid="pagar-origen"
                  :data-origen="origen.value"
                  @click="pick(line, origen)"
                >
                  {{ pagarOrigenLabel(origen) }}
                </button>
              </div>
              <p
                v-if="why[line.key]"
                class="text-sm text-ink-gray-6"
                data-testid="pagar-origen-motivo"
              >
                {{ why[line.key] }}
              </p>
              <label
                v-if="line.origen === 'Transferencia' && bancos.length > 1"
                class="block"
              >
                <span class="mb-1 block text-sm text-ink-gray-7">{{
                  __('Banco')
                }}</span>
                <select
                  v-model="line.cuenta"
                  :class="FIELD"
                  data-testid="pagar-banco"
                >
                  <option :value="null">{{ bancoDefault }}</option>
                  <option
                    v-for="banco in bancos"
                    :key="banco.value"
                    :value="banco.value"
                  >
                    {{ banco.label }}
                  </option>
                </select>
              </label>
              <button
                type="button"
                class="press flex min-h-11 items-center text-sm font-medium text-ink-gray-7 hover:text-ink-gray-9"
                data-testid="pagar-repartir"
                @click="lines = pagarSplit(lines, line.key, preview)"
              >
                {{ __('Repartir: pagar una parte de otro lado') }}
              </button>
            </template>
          </li>
        </ul>
        <ul
          v-if="tried && plan.problemas.length"
          class="space-y-1 text-sm text-ink-red-7"
          data-testid="pagar-faltan"
        >
          <li v-for="item in plan.problemas" :key="item">{{ item }}</li>
        </ul>
      </template>
    </div>

    <template #actions>
      <template v-if="step === 'listo'">
        <Button
          variant="solid"
          class="min-h-11 w-full"
          :label="__('Listo')"
          data-testid="pagar-cerrar"
          @click="emit('update:open', false)"
        />
      </template>
      <div v-else-if="step === 'revisar'" class="flex w-full gap-2">
        <Button
          class="min-h-11 flex-none"
          :label="__('Cambiar')"
          :disabled="saving"
          data-testid="pagar-cambiar"
          @click="step = 'editar'"
        />
        <Button
          variant="solid"
          class="min-h-11 flex-1"
          :label="__('Pagar {0}', [money(resumen.total)])"
          :loading="saving"
          data-testid="pagar-confirmar"
          @click="apply"
        />
      </div>
      <Button
        v-else
        variant="solid"
        class="min-h-11 w-full"
        :label="__('Revisar · {0}', [money(draftTotal)])"
        data-testid="pagar-revisar"
        @click="review"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import {
  PAGAR_APPLY,
  conceptoLabel,
  equipoApi,
  origenLabel,
  outcomeUnknown,
  pagarBancos,
  pagarDraft,
  pagarMonto,
  pagarOrigenLabel,
  pagarPlan,
  pagarReceipt,
  pagarRemove,
  pagarResumen,
  pagarSplit,
  pagarStale,
  problemOf,
  requestId,
} from '@/composables/useEquipo'
import { money } from '@/utils/numberFormat'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** doco pagar_preview's answer. */
  preview: { type: Object, default: null },
  /** One person's «Pagar» from their row; null pays the whole team. */
  employee: { type: String, default: null },
})
const emit = defineEmits(['update:open', 'applied', 'stale'])

const FIELD =
  'h-11 w-full rounded-6 border-0 bg-surface-gray-2 px-3 text-base text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3'

const step = ref('editar')
const lines = ref([])
const saving = ref(false)
const tried = ref(false)
const problem = ref('')
// A stale review: doco wrote nothing and sent the fresh preview.
const notice = ref('')
const receipt = ref(null)
const why = reactive({})
const bancos = ref([])
let bancosAsked = false
// One request id per reviewed set of lines: a retry after a lost answer replays
// it and doco returns the first receipt instead of paying twice.
let request = null

function reset() {
  lines.value = pagarDraft(props.preview, props.employee)
  step.value = 'editar'
  tried.value = false
  request = null
  for (const key of Object.keys(why)) delete why[key]
}
watch(
  () => props.open,
  (value) => {
    if (!value) return
    notice.value = problem.value = ''
    receipt.value = null
    reset()
  },
  { immediate: true },
)
watch(
  () => props.preview,
  () => {
    if (step.value !== 'listo') reset()
  },
)
watch(lines, () => (request = null), { deep: true })

const filas = computed(
  () => new Map((props.preview?.filas || []).map((f) => [f.employee, f])),
)
const plan = computed(() => pagarPlan(lines.value, props.preview))
const resumen = computed(() => pagarResumen(plan.value.lineas, props.preview))
const draftTotal = computed(() =>
  lines.value
    .filter((line) => line.incluir)
    .reduce((acc, line) => acc + (pagarMonto(line.monto) || 0), 0),
)
const title = computed(() => {
  if (step.value === 'listo') return window.__('Pago hecho')
  if (step.value === 'revisar') return window.__('Revisa antes de pagar')
  const fila = props.employee && filas.value.get(props.employee)
  return fila
    ? window.__('Pagar a {0}', [fila.employee_name || fila.employee])
    : window.__('Pagar lo que falta')
})
const transferencia = computed(() =>
  (props.preview?.origenes || []).find(
    (o) => o.value === 'Transferencia' && o.available,
  ),
)
const bancoDefault = computed(() => {
  const cuenta = transferencia.value?.cuenta
  const banco = bancos.value.find((b) => b.value === cuenta)
  return banco ? banco.label : window.__('El banco de siempre')
})

// The bank list is read once, the first time a line goes by transfer.
watch(
  () => lines.value.some((line) => line.origen === 'Transferencia'),
  async (wanted) => {
    if (!wanted || bancosAsked || !transferencia.value) return
    bancosAsked = true
    bancos.value = await pagarBancos(props.preview?.company)
  },
  { immediate: true },
)

function nameOf(employee) {
  const fila = filas.value.get(employee)
  return fila?.employee_name || employee
}
function siblings(line) {
  return lines.value.filter((l) => l.employee === line.employee).length
}
/** «Le falta $1,600» and what already waits at the register, on the line's first row. */
function faltaLine(line) {
  const first = lines.value.find((l) => l.employee === line.employee)
  if (first?.key !== line.key) return ''
  const fila = filas.value.get(line.employee)
  if (!fila) return ''
  const parts = []
  if (typeof fila.le_falta === 'number')
    parts.push(window.__('Le falta {0}', [money(fila.le_falta)]))
  if (fila.por_entregar)
    parts.push(
      window.__('{0} ya espera en la caja', [money(fila.por_entregar)]),
    )
  return parts.join(', ')
}
function originClass(line, origen) {
  const base =
    'press inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium'
  if (!origen.available) return [base, 'bg-surface-gray-1 text-ink-gray-5']
  return line.origen === origen.value
    ? [base, 'bg-surface-green-2 text-ink-green-8']
    : [base, 'bg-surface-gray-2 text-ink-gray-7 hover:bg-surface-gray-3']
}
/** A greyed origin says why it cannot pay instead of picking it. */
function pick(line, origen) {
  if (!origen.available) {
    why[line.key] = origen.motivo || window.__('Ese origen no se puede usar.')
    return
  }
  delete why[line.key]
  line.origen = origen.value
  if (origen.value !== 'Transferencia') line.cuenta = null
}

function review() {
  tried.value = true
  problem.value = ''
  if (plan.value.problemas.length) return
  step.value = 'revisar'
}

async function apply() {
  if (saving.value || !plan.value.lineas.length) return
  saving.value = true
  problem.value = notice.value = ''
  request ??= requestId()
  try {
    const result = await equipoApi(PAGAR_APPLY, {
      company: props.preview.company,
      token: props.preview.token,
      request_id: request,
      lineas: plan.value.lineas,
      period: props.preview.periodo?.inicio || null,
    })
    if (pagarStale(result)) {
      request = null
      emit('stale', result.preview || null)
      // Set after the fresh preview resets the lines, so the notice stays.
      notice.value =
        result.message ||
        window.__('Algo cambió desde la revisión. Revisa los pagos otra vez.')
      step.value = 'editar'
      return
    }
    request = null
    receipt.value = pagarReceipt(result)
    step.value = 'listo'
    emit('applied', result)
  } catch (error) {
    const found = problemOf(error)
    problem.value = outcomeUnknown(error)
      ? window.__('No supimos si se pagó. Vuelve a intentar: no se duplica.')
      : found.detail || found.title
  } finally {
    saving.value = false
  }
}
</script>
