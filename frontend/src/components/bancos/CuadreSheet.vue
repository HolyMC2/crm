<template>
  <!-- «¿Cuadra con el banco?»: the bank's balance, the books' balance and the
       difference split into reasons, each with its one next step: link what is
       already on both sides, see what the bank has and the books do not (or let
       the assistant explain it), see what the books have and the bank does not.
       Nothing changes without a tap; every link is undone from its movement. -->
  <BottomSheet
    :open="open"
    title="¿Cuadra con el banco?"
    :subtitle="label"
    layer="bancos-cuadre"
    @update:open="(v) => emit('update:open', v)"
  >
    <div class="space-y-4 pb-2" data-bancos-cuadre>
      <div
        v-if="loading && !data"
        role="status"
        aria-label="Comparando con el banco…"
        class="space-y-3"
      >
        <div class="h-20 animate-pulse rounded-7 bg-surface-gray-2" />
        <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
        <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
      </div>
      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-bancos-problem
      >
        {{ problem }}
      </p>

      <template v-if="data">
        <!-- The two balances and what separates them. -->
        <dl class="space-y-1" data-bancos-cuadre-cifras>
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-sm text-ink-gray-6">
              {{ card ? 'Por pagar según el banco' : 'En el banco' }}
              <span v-if="bankWhen">· {{ bankWhen }}</span>
            </dt>
            <dd
              class="whitespace-nowrap text-base tabular-nums text-ink-gray-9"
            >
              {{ data.bank === null ? '—' : money(data.bank, data.currency) }}
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-sm text-ink-gray-6">
              {{ card ? 'Por pagar en libros' : 'En libros' }}
            </dt>
            <dd
              class="whitespace-nowrap text-base tabular-nums"
              :class="
                !card && Number(data.books) < 0
                  ? 'text-ink-red-7'
                  : 'text-ink-gray-9'
              "
            >
              {{ money(data.books, data.currency) }}
            </dd>
          </div>
          <div
            v-if="data.difference !== null"
            class="flex items-baseline justify-between gap-3 border-t border-outline-gray-1 pt-1"
          >
            <dt class="text-sm font-medium text-ink-gray-8">Diferencia</dt>
            <dd
              class="whitespace-nowrap text-xl font-semibold tabular-nums"
              :class="data.agrees ? 'text-ink-green-7' : 'text-ink-amber-8'"
              data-bancos-cuadre-diferencia
            >
              {{
                data.agrees
                  ? 'Cuadra'
                  : signedMoney(data.difference, data.currency)
              }}
            </dd>
          </div>
        </dl>

        <!-- No bank figure (no connection): the person types what the bank says. -->
        <form
          v-if="data.bank === null || data.bank_source === 'escrito'"
          class="space-y-1"
          data-bancos-cuadre-saldo
          @submit.prevent="compare"
        >
          <label for="cuadre-saldo" class="block text-sm text-ink-gray-7">
            {{
              card
                ? '¿Cuánto debes según tu banco hoy?'
                : '¿Cuánto dice tu banco hoy?'
            }}
          </label>
          <div class="flex gap-2">
            <input
              id="cuadre-saldo"
              v-model="typed"
              inputmode="decimal"
              autocomplete="off"
              placeholder="0.00"
              class="h-11 min-w-0 flex-1 rounded-6 border-0 bg-surface-gray-2 px-3 text-base tabular-nums text-ink-gray-9 focus:ring-2 focus:ring-outline-gray-3"
            />
            <Button
              class="min-h-11 flex-none"
              type="submit"
              label="Comparar"
              :loading="loading"
              :disabled="!typed.trim()"
            />
          </div>
          <p class="text-sm text-ink-gray-6">
            Lo ves en la app de tu banco. No se guarda.
          </p>
        </form>

        <p
          v-if="data.agrees && !rows.length"
          class="flex items-center gap-2 rounded-7 bg-surface-green-2 p-3 text-sm font-medium text-ink-green-8"
        >
          <span class="lucide-check-check size-4" aria-hidden="true" />
          Tus libros dicen lo mismo que el banco.
        </p>

        <!-- The reasons, in the order they get fixed. -->
        <section
          v-if="rows.length"
          aria-label="Por qué"
          data-bancos-cuadre-razones
        >
          <h3 class="pb-1 text-sm font-semibold text-ink-gray-7">
            {{
              data.difference === null || data.agrees
                ? 'Lo que falta ligar o registrar'
                : 'Por qué no cuadra'
            }}
          </h3>
          <ul class="divide-y divide-outline-gray-1">
            <li
              v-for="row in rows"
              :key="row.key"
              class="py-3"
              :data-cuadre-razon="row.key"
            >
              <div class="flex items-start gap-3">
                <span
                  class="mt-0.5 flex size-8 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                  aria-hidden="true"
                >
                  <span :class="[row.icon, 'size-4']" />
                </span>
                <span class="min-w-0 flex-1">
                  <span
                    class="block break-words text-base leading-snug text-ink-gray-9"
                    >{{ row.title }}</span
                  >
                  <span class="block text-sm text-ink-gray-6">{{
                    row.detail
                  }}</span>
                </span>
                <span
                  v-if="row.amount !== null"
                  class="whitespace-nowrap text-base tabular-nums text-ink-gray-9"
                  >{{ effectText(row.amount, data.currency) }}</span
                >
              </div>
              <div
                v-if="row.actions.length"
                class="mt-2 flex flex-wrap gap-2 pl-11"
              >
                <template v-for="action in row.actions" :key="action">
                  <Button
                    v-if="action === 'ligar'"
                    class="min-h-11"
                    :variant="showPairs ? 'subtle' : 'solid'"
                    :label="showPairs ? 'Ocultar' : 'Revisar y ligar'"
                    data-bancos-cuadre-pares
                    @click="showPairs = !showPairs"
                  />
                  <Button
                    v-else-if="action === 'ver_banco'"
                    class="min-h-11"
                    variant="subtle"
                    label="Ver movimientos"
                    @click="
                      emit('ver', { vista: 'banco', filtro: 'pendientes' })
                    "
                  />
                  <Button
                    v-else-if="action === 'explicar'"
                    class="min-h-11"
                    variant="ghost"
                    label="Que me ayude el asistente"
                    data-bancos-cuadre-asistente
                    @click="ask(row.key)"
                  />
                  <Button
                    v-else-if="action === 'ver_libros'"
                    class="min-h-11"
                    variant="subtle"
                    label="Ver registros"
                    @click="
                      emit('ver', { vista: 'libros', filtro: 'sin_banco' })
                    "
                  />
                  <RouterLink
                    v-else-if="action === 'ver_conexion'"
                    :to="{
                      name: 'BancoConexion',
                      params: { conexion: data.conexion },
                    }"
                    class="press inline-flex min-h-11 items-center rounded-full border border-outline-gray-2 px-4 text-sm text-ink-gray-8 hover:bg-surface-gray-1"
                    @click="emit('update:open', false)"
                  >
                    Ver la conexión
                  </RouterLink>
                </template>
              </div>

              <!-- The pairs: confirm, then one tap links every one the engine still proposes. -->
              <ExpandTransition>
                <div
                  v-if="row.key === 'pares' && showPairs"
                  class="mt-3 space-y-3 pl-11"
                  data-bancos-cuadre-lista
                >
                  <ul
                    class="divide-y divide-outline-gray-1 rounded-7 border border-outline-gray-2"
                  >
                    <li
                      v-for="pair in data.pairs"
                      :key="pair.movimiento.name"
                      class="p-3"
                      :data-cuadre-par="pair.movimiento.name"
                    >
                      <div class="flex items-baseline justify-between gap-3">
                        <span
                          class="min-w-0 break-words text-sm text-ink-gray-9"
                          >{{ pair.movimiento.title }}</span
                        >
                        <span
                          class="whitespace-nowrap text-sm tabular-nums text-ink-gray-9"
                          >{{
                            signedMoney(pair.movimiento.amount, data.currency)
                          }}</span
                        >
                      </div>
                      <p class="text-sm text-ink-gray-6">
                        {{
                          formatDate(pair.movimiento.date, { weekday: true })
                        }}
                        · en libros:
                        {{
                          [pair.registro.word, pair.registro.party]
                            .filter(Boolean)
                            .join(' de ')
                        }}
                        <span v-if="pair.registro.date !== pair.movimiento.date"
                          >del {{ formatDate(pair.registro.date) }}</span
                        >
                      </p>
                      <p v-if="!pair.ligable" class="text-sm text-ink-amber-8">
                        Aún no se puede ligar desde aquí: es una venta o compra
                        pagada directo en esta cuenta.
                      </p>
                      <p
                        v-else-if="outcome[pair.movimiento.name]"
                        class="text-sm"
                        :class="
                          outcome[pair.movimiento.name].ok
                            ? 'text-ink-green-7'
                            : 'text-ink-red-7'
                        "
                      >
                        {{ outcome[pair.movimiento.name].text }}
                      </p>
                    </li>
                  </ul>
                  <p
                    v-if="data.pairs_total > data.pairs.length"
                    class="text-sm text-ink-gray-6"
                  >
                    Se muestran {{ data.pairs.length }} de
                    {{ data.pairs_total }}; liga estos y vuelve a abrir para ver
                    el resto.
                  </p>
                  <Button
                    v-if="data.can.ligar && toLink.length"
                    class="min-h-11 w-full"
                    variant="solid"
                    :label="
                      toLink.length === 1
                        ? 'Ligar 1 movimiento'
                        : `Ligar ${toLink.length} movimientos`
                    "
                    :loading="linking"
                    data-bancos-cuadre-ligar
                    @click="link"
                  />
                  <p v-else-if="toLink.length" class="text-sm text-ink-gray-6">
                    Ligar es de quien concilia los bancos. Pide a tu encargado
                    que lo revise.
                  </p>
                  <p
                    v-if="linkSummary"
                    class="text-sm text-ink-gray-8"
                    role="status"
                  >
                    {{ linkSummary }}
                  </p>
                </div>
              </ExpandTransition>
            </li>
          </ul>
        </section>

        <p
          v-if="data.holes.length"
          class="rounded-7 bg-surface-amber-2 p-3 text-sm text-ink-amber-8"
          data-bancos-cuadre-huecos
        >
          Sin movimientos del banco en {{ monthsText(data.holes) }}: ¿falta
          subir
          {{
            data.holes.length === 1
              ? 'ese estado de cuenta'
              : 'esos estados de cuenta'
          }}?
        </p>
      </template>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        label="Listo"
        @click="emit('update:open', false)"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from 'frappe-ui'
import { BottomSheet, ExpandTransition } from '@/components/ui'
import { formatDate, formatDateTime } from '@/utils/display'
import { errorText, money, signedMoney } from './bancos'
import {
  askText,
  cuadreApi,
  cuadreRows,
  effectText,
  linkable,
  monthsText,
} from './cuadre'

const props = defineProps({
  open: { type: Boolean, default: false },
  cuenta: { type: String, required: true },
  /** The account's name as the hero shows it. */
  label: { type: String, default: '' },
})
const emit = defineEmits(['update:open', 'ver', 'changed'])

const data = ref(null)
const loading = ref(false)
const problem = ref('')
const typed = ref('')
const showPairs = ref(false)
const linking = ref(false)
const outcome = ref({})
const linkSummary = ref('')

const card = computed(() => data.value?.kind === 'tarjeta')
const rows = computed(() => cuadreRows(data.value))
// A pair already tried (linked, or refused with its reason) is not offered again.
const toLink = computed(() =>
  linkable(data.value?.pairs || []).filter(
    (pair) => !outcome.value[pair.movimiento],
  ),
)
const bankWhen = computed(() => {
  if (!data.value) return ''
  if (data.value.bank_source === 'escrito') return 'lo escribiste tú'
  return data.value.bank_at ? formatDateTime(data.value.bank_at) : ''
})

async function load() {
  loading.value = true
  problem.value = ''
  try {
    data.value = await cuadreApi('cuadre', {
      cuenta: props.cuenta,
      saldo_banco: typed.value.trim() || undefined,
    })
  } catch (error) {
    problem.value = errorText(error)
  } finally {
    loading.value = false
  }
}
function compare() {
  if (typed.value.trim()) load()
}

async function link() {
  linking.value = true
  linkSummary.value = ''
  try {
    const result = await cuadreApi('ligar', {
      cuenta: props.cuenta,
      pares: JSON.stringify(toLink.value),
    })
    const next = { ...outcome.value }
    for (const row of result.ligados || [])
      next[row.movimiento] = { ok: true, text: 'Ligado' }
    for (const row of result.rechazados || [])
      next[row.movimiento] = {
        ok: false,
        text: row.message || 'No se pudo ligar.',
      }
    outcome.value = next
    const done = (result.ligados || []).length
    const refused = (result.rechazados || []).length
    linkSummary.value = [
      done === 1 ? '1 ligado' : `${done} ligados`,
      refused
        ? refused === 1
          ? '1 no se pudo'
          : `${refused} no se pudieron`
        : '',
    ]
      .filter(Boolean)
      .join(' · ')
    if (done) emit('changed')
  } catch (error) {
    linkSummary.value = errorText(error)
  } finally {
    linking.value = false
  }
}

async function ask(key) {
  const { openAssistant } = await import('@/components/assistant/useAssistant')
  const opened = await openAssistant({
    text: askText(key, props.label),
    send: true,
  })
  if (opened) emit('update:open', false)
  else problem.value = 'El asistente no está disponible para tu usuario.'
}

watch(
  () => [props.open, props.cuenta],
  ([open], previous) => {
    if (!open) return
    if (previous && previous[1] !== props.cuenta) typed.value = ''
    outcome.value = {}
    linkSummary.value = ''
    showPairs.value = false
    load()
  },
  { immediate: true },
)
</script>
