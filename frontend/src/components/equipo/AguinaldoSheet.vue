<template>
  <BottomSheet
    :open="open"
    :title="__('Aguinaldo {0}', [preview?.year])"
    :subtitle="subtitle"
    @update:open="(value) => emit('update:open', value)"
  >
    <div class="space-y-4 pb-2" data-testid="aguinaldo-hoja">
      <p
        v-if="receipt"
        role="status"
        class="rounded-6 bg-surface-green-1 p-3 text-sm text-ink-green-8"
        data-testid="aguinaldo-recibo"
      >
        {{ receipt }}
      </p>
      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-testid="aguinaldo-problema"
      >
        {{ problem }}
      </p>
      <p
        v-if="notice"
        role="status"
        class="rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        data-testid="aguinaldo-aviso"
      >
        {{ notice }}
      </p>
      <p
        v-for="warning in preview?.warnings || []"
        :key="warning.code"
        role="status"
        class="rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
      >
        {{ warning.message }}
      </p>

      <dl
        class="grid grid-cols-2 gap-x-4 gap-y-2"
        data-testid="aguinaldo-totales"
      >
        <div>
          <dt class="text-sm text-ink-gray-6">{{ __('Total') }}</dt>
          <dd class="text-xl font-semibold tabular-nums text-ink-gray-9">
            {{ money(totales.importe || 0) }}
          </dd>
        </div>
        <div>
          <dt class="text-sm text-ink-gray-6">{{ __('Personas') }}</dt>
          <dd class="text-xl font-semibold tabular-nums text-ink-gray-9">
            {{ totales.con_monto || 0 }} / {{ totales.personas || 0 }}
          </dd>
        </div>
        <template v-if="preview?.retenciones">
          <div>
            <dt class="text-sm text-ink-gray-6">{{ __('ISR') }}</dt>
            <dd class="text-base font-medium tabular-nums text-ink-gray-9">
              {{ money(totales.isr || 0) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-ink-gray-6">{{ __('Neto') }}</dt>
            <dd class="text-base font-medium tabular-nums text-ink-gray-9">
              {{ money(totales.neto || 0) }}
            </dd>
          </div>
        </template>
        <template v-if="owed">
          <div>
            <dt class="text-sm text-ink-gray-6">{{ __('Ya se le dio') }}</dt>
            <dd class="text-base font-medium tabular-nums text-ink-gray-9">
              {{ money(totales.pagado || 0) }}
            </dd>
          </div>
          <div v-if="totales.por_entregar">
            <dt class="text-sm text-ink-gray-6">
              {{ __('Por entregar en la caja') }}
            </dt>
            <dd class="text-base font-medium tabular-nums text-ink-gray-9">
              {{ money(totales.por_entregar) }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-ink-gray-6">{{ __('Le falta') }}</dt>
            <dd
              class="text-base font-medium tabular-nums text-ink-gray-9"
              data-testid="aguinaldo-falta"
            >
              {{ money(totales.falta || 0) }}
            </dd>
          </div>
        </template>
      </dl>

      <ul
        class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
      >
        <li
          v-for="fila in preview?.filas || []"
          :key="fila.employee"
          class="space-y-1 p-3"
          data-testid="aguinaldo-fila"
          :data-employee="fila.employee"
        >
          <div class="flex items-start gap-3">
            <span
              class="min-w-0 flex-1 break-words text-base font-medium text-ink-gray-9"
              >{{ fila.employee_name || __('Sin nombre') }}</span
            >
            <span
              class="flex-none text-base font-semibold tabular-nums text-ink-gray-9"
              data-testid="aguinaldo-importe"
              >{{ fila.importe === null ? '—' : money(fila.importe) }}</span
            >
          </div>
          <p
            v-if="pagos(fila)"
            class="text-sm text-ink-gray-7 tabular-nums"
            data-testid="aguinaldo-pagos"
          >
            {{ pagos(fila) }}
          </p>
          <p class="text-sm text-ink-gray-7" data-testid="aguinaldo-datos">
            {{ datos(fila) }}
          </p>
          <p
            v-for="line in fila.porque || []"
            :key="line"
            class="text-xs text-ink-gray-6"
          >
            {{ line }}
          </p>
          <ul v-if="fila.faltantes?.length" class="space-y-1 text-sm">
            <li
              v-for="item in fila.faltantes"
              :key="item.key"
              class="text-ink-amber-8"
              data-testid="aguinaldo-faltante"
            >
              <span class="font-medium">{{ aguinaldoFaltante(item) }}</span>
              <span v-if="item.detalle" class="block text-xs text-ink-gray-6">{{
                item.detalle
              }}</span>
            </li>
          </ul>
        </li>
      </ul>

      <p
        v-for="message in blockers"
        :key="message"
        class="text-sm text-ink-gray-6"
        data-testid="aguinaldo-bloqueo"
      >
        {{ message }}
      </p>
      <p
        v-if="!canApply && preview?.pago?.message"
        class="text-sm text-ink-gray-6"
        data-testid="aguinaldo-solo-calculo"
      >
        {{ preview.pago.message }}
      </p>
    </div>

    <template #actions>
      <Button
        v-if="canApply && !receipt"
        variant="solid"
        class="min-h-11 w-full"
        :label="__('Dejar listo para pagar')"
        :loading="saving"
        data-testid="aguinaldo-aplicar"
        @click="apply"
      />
      <Button
        v-else
        class="min-h-11 w-full"
        :label="__('Listo')"
        data-testid="aguinaldo-cerrar"
        @click="emit('update:open', false)"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import {
  AGUINALDO_APPLY,
  aguinaldoBlockers,
  aguinaldoFaltante,
  aguinaldoReceipt,
  aguinaldoStale,
  dayLabel,
  equipoApi,
  outcomeUnknown,
  problemOf,
  requestId,
} from '@/composables/useEquipo'
import { money } from '@/utils/numberFormat'

const props = defineProps({
  open: { type: Boolean, default: false },
  preview: { type: Object, default: null },
  canApply: { type: Boolean, default: false },
})
const emit = defineEmits(['update:open', 'applied', 'stale'])

const saving = ref(false)
const receipt = ref('')
const problem = ref('')
// A stale review: doco wrote nothing and sent the fresh preview.
const notice = ref('')
// One request id per attempt at the same preview: a retry after a lost answer
// replays it, and doco returns the first result instead of a second set.
let request = null
watch(
  () => props.preview,
  () => {
    request = null
    problem.value = ''
  },
)
watch(
  () => props.open,
  (value) => {
    if (value) receipt.value = notice.value = ''
  },
)

const totales = computed(() => props.preview?.totales || {})
const owed = computed(
  () => totales.value.falta !== undefined && totales.value.falta !== null,
)
// The pay index's own message already shows as pago.message.
const blockers = computed(() =>
  props.canApply
    ? []
    : aguinaldoBlockers(props.preview).filter(
        (message) => message !== props.preview?.pago?.message,
      ),
)
const subtitle = computed(() =>
  props.preview?.fecha_limite
    ? window.__('Se paga a más tardar el {0}', [
        dayLabel(props.preview.fecha_limite),
      ])
    : '',
)

/** «Entró 1 jul 2026 · 184 días trabajados · 7.56 días · $300 diario». */
function datos(fila) {
  const parts = []
  if (fila.ingreso) parts.push(window.__('Entró {0}', [dayLabel(fila.ingreso)]))
  if (fila.baja) parts.push(window.__('Salió {0}', [dayLabel(fila.baja)]))
  if (fila.dias_trabajados !== null && fila.dias_trabajados !== undefined)
    parts.push(window.__('{0} días trabajados', [fila.dias_trabajados]))
  if (fila.dias !== null && fila.dias !== undefined)
    parts.push(
      window.__('{0} días de aguinaldo', [Number(fila.dias).toFixed(2)]),
    )
  if (fila.diario !== null && fila.diario !== undefined)
    parts.push(
      fila.sugerido
        ? window.__('{0} diario (sugerido)', [money(fila.diario, null, 2)])
        : window.__('{0} diario', [money(fila.diario, null, 2)]),
    )
  if (props.preview?.retenciones && fila.isr !== null && fila.isr !== undefined)
    parts.push(window.__('ISR {0}', [money(fila.isr, null, 2)]))
  return parts.join(', ')
}

/** «Le toca $X · Ya se le dio $Y · Por entregar $Z · Le falta $W» when doco counts it. */
function pagos(fila) {
  if (fila.falta === undefined || fila.a_pagar === undefined) return ''
  if (fila.a_pagar === null) return ''
  const parts = [window.__('Le toca {0}', [money(fila.a_pagar)])]
  if (fila.pagado)
    parts.push(window.__('Ya se le dio {0}', [money(fila.pagado)]))
  if (fila.por_entregar)
    parts.push(window.__('Por entregar {0}', [money(fila.por_entregar)]))
  parts.push(window.__('Le falta {0}', [money(fila.falta || 0)]))
  return parts.join(' · ')
}

async function apply() {
  if (!props.canApply || saving.value) return
  saving.value = true
  problem.value = notice.value = ''
  request ??= requestId()
  try {
    const result = await equipoApi(AGUINALDO_APPLY, {
      company: props.preview.company,
      year: props.preview.year,
      token: props.preview.token,
      request_id: request,
    })
    request = null
    if (aguinaldoStale(result)) {
      notice.value =
        result.message ||
        window.__(
          'Algo cambió desde la revisión. Revisa el aguinaldo otra vez.',
        )
      emit('stale', result.preview || null)
      return
    }
    receipt.value = aguinaldoReceipt(result, props.preview)
    emit('applied', result)
  } catch (error) {
    const found = problemOf(error)
    problem.value = outcomeUnknown(error)
      ? window.__('No supimos si se guardó. Vuelve a intentar: no se duplica.')
      : found.detail || found.title
  } finally {
    saving.value = false
  }
}
</script>
