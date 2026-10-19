<template>
  <!-- «Conciliar» on the phone (Xero «Reconcile on the go»): the bank line,
       the suggested payment in a green card with one filled «Conciliar»,
       other candidates, then «¿No está?»: register the open invoice's payment
       (a draft you confirm here) or capture the expense. Nothing is linked
       without a tap; a movement left alone stays «Sin conciliar». -->
  <BottomSheet
    :open="open"
    :title="detail?.movement?.title || movement?.title || 'Movimiento'"
    :subtitle="subtitle"
    layer="bancos-conciliar"
    @update:open="(v) => emit('update:open', v)"
  >
    <div class="space-y-4 pb-2" data-bancos-conciliar>
      <!-- The bank line. -->
      <div v-if="m" class="flex items-baseline justify-between gap-3">
        <p class="min-w-0 break-words text-sm text-ink-gray-6">
          {{
            [m.detail, m.reference ? `Ref. ${m.reference}` : '']
              .filter(Boolean)
              .join(' · ')
          }}
        </p>
        <p
          class="whitespace-nowrap text-2xl font-semibold tabular-nums"
          :class="amountTone(m.amount)"
          data-bancos-sheet-amount
        >
          {{ signedMoney(m.amount, m.currency) }}
        </p>
      </div>

      <div
        v-if="loading && !detail"
        role="status"
        aria-label="Buscando su pago…"
        class="space-y-3"
      >
        <div class="h-24 animate-pulse rounded-xl bg-surface-gray-2" />
        <div class="h-12 animate-pulse rounded-xl bg-surface-gray-2" />
      </div>
      <p
        v-if="problem"
        role="alert"
        class="rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        data-bancos-problem
      >
        {{ problem }}
      </p>

      <template v-if="detail">
        <!-- Already linked: what it was matched with, and «Deshacer». -->
        <section
          v-if="detail.matches.length"
          class="rounded-xl bg-surface-green-2 p-4 text-ink-green-8"
          aria-label="Conciliado"
          data-bancos-matched
        >
          <p class="flex items-center gap-2 text-sm font-semibold">
            <span class="lucide-check-check size-4" aria-hidden="true" />
            {{ m.remaining > 0 ? 'Conciliado en parte con' : 'Conciliado con' }}
          </p>
          <ul class="mt-2 space-y-2">
            <li
              v-for="match in detail.matches"
              :key="match.doctype + match.name"
              class="flex items-start justify-between gap-3"
            >
              <span class="min-w-0">
                <span class="block break-words text-base text-ink-gray-9">{{
                  match.party || match.word
                }}</span>
                <span class="block text-sm text-ink-gray-7"
                  >{{ match.word }} · {{ match.name }}</span
                >
              </span>
              <span class="flex flex-none flex-col items-end gap-1">
                <span class="whitespace-nowrap tabular-nums text-ink-gray-9">{{
                  money(match.amount, m.currency)
                }}</span>
                <button
                  v-if="match.readable"
                  type="button"
                  class="min-h-11 text-sm font-medium underline"
                  @click="openVoucher(match)"
                >
                  Ver {{ match.word.toLowerCase() }}
                </button>
              </span>
            </li>
          </ul>
          <Button
            v-if="detail.can.deshacer"
            class="mt-3 min-h-11"
            variant="outline"
            label="Deshacer"
            :loading="busy === 'deshacer'"
            data-bancos-deshacer
            @click="deshacer"
          />
        </section>

        <!-- What stops the worker, in their words (closed month, read-only). -->
        <div
          v-for="block in shownBlocks"
          :key="block.code"
          class="rounded-lg bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
          data-bancos-blocked
        >
          <p>{{ block.message }}</p>
          <!-- Contador's way out: whoever cannot reconcile can still ask for it. -->
          <Button
            v-if="askLabel(block)"
            class="mt-3 min-h-11 w-full"
            :label="askLabel(block)"
            data-bancos-pedir
            @click="ask(block)"
          />
          <p v-if="asked[block.code]" role="status" class="mt-2 break-words">
            {{ asked[block.code] }}
          </p>
        </div>

        <!-- The suggestion, one tap. -->
        <section
          v-if="suggested"
          class="rounded-xl bg-surface-green-1 p-4"
          aria-label="Coincide con"
          data-bancos-suggested
        >
          <p
            class="flex items-center gap-2 text-sm font-semibold text-ink-green-8"
          >
            <span class="lucide-link size-4" aria-hidden="true" />
            Coincide con
          </p>
          <CandidateLine :candidate="suggested" :currency="m.currency" />
          <p class="mt-2 text-sm text-ink-gray-7">{{ suggested.reason }}</p>
          <Button
            v-if="detail.can.conciliar"
            class="mt-3 min-h-11 w-full"
            variant="solid"
            label="Conciliar"
            :loading="busy === suggested.name"
            data-bancos-conciliar-btn
            @click="conciliar(suggested)"
          />
        </section>

        <section v-if="others.length" aria-label="Otros pagos posibles">
          <h3 class="pb-1 text-sm font-semibold text-ink-gray-7">
            {{ suggested ? 'Otros pagos posibles' : 'Pagos posibles' }}
          </h3>
          <ul class="divide-y divide-outline-gray-1">
            <li
              v-for="option in others"
              :key="option.doctype + option.name"
              class="py-2"
            >
              <CandidateLine :candidate="option" :currency="m.currency" />
              <p class="text-sm text-ink-gray-6">{{ option.reason }}</p>
              <Button
                v-if="detail.can.conciliar"
                class="mt-2 min-h-11"
                label="Conciliar con este"
                :loading="busy === option.name"
                @click="conciliar(option)"
              />
            </li>
          </ul>
        </section>

        <!-- «¿No está?»: drafts made here, open invoices for this amount, the expense. -->
        <section
          v-if="
            m.remaining > 0 &&
            (detail.drafts.length ||
              detail.invoices.length ||
              detail.can.gasto ||
              detail.scope === 'near')
          "
          aria-label="¿No está?"
          class="space-y-2"
        >
          <h3 class="text-sm font-semibold text-ink-gray-7">
            {{ suggested || others.length ? '¿No es ninguno?' : '¿No está?' }}
          </h3>
          <div
            v-for="draft in detail.drafts"
            :key="draft.name"
            class="rounded-xl border border-outline-gray-2 p-3"
            data-bancos-draft
          >
            <p class="text-sm text-ink-gray-6">{{ draft.word }} en borrador</p>
            <p class="flex items-baseline justify-between gap-3">
              <span class="min-w-0 break-words text-base text-ink-gray-9">{{
                draft.party || draft.name
              }}</span>
              <span class="whitespace-nowrap tabular-nums">{{
                money(draft.amount, m.currency)
              }}</span>
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <Button
                v-if="draft.can_submit"
                class="min-h-11"
                variant="solid"
                :label="`Confirmar ${draft.word.toLowerCase()}`"
                :loading="busy === draft.name"
                data-bancos-confirmar-pago
                @click="confirmarPago(draft)"
              />
              <Button
                class="min-h-11"
                variant="ghost"
                label="Revisar"
                @click="openVoucher(draft)"
              />
            </div>
          </div>
          <div
            v-for="invoice in detail.invoices"
            :key="invoice.name"
            class="flex items-center justify-between gap-3 rounded-xl border border-outline-gray-2 p-3"
            data-bancos-invoice
          >
            <span class="min-w-0">
              <span class="block break-words text-base text-ink-gray-9">{{
                invoice.party || invoice.name
              }}</span>
              <span class="block text-sm text-ink-gray-6"
                >{{
                  invoice.doctype === 'Sales Invoice'
                    ? 'Factura'
                    : 'Factura de proveedor'
                }}
                abierta por {{ money(invoice.amount, invoice.currency) }}</span
              >
            </span>
            <Button
              class="min-h-11 flex-none"
              :label="
                invoice.doctype === 'Sales Invoice'
                  ? 'Registrar cobro'
                  : 'Registrar pago'
              "
              :loading="busy === invoice.name"
              data-bancos-crear-pago
              @click="crearPago(invoice)"
            />
          </div>
          <CapturarDocumentoButton
            v-if="detail.can.gasto"
            :targets="['Purchase Invoice']"
            label="Capturar el gasto (foto o PDF)"
            return-label="Bancos"
          />
          <Button
            v-if="detail.scope === 'near' && !detail.matches.length"
            class="min-h-11"
            variant="ghost"
            label="Buscar en todo el mes"
            @click="load('month')"
          />
        </section>
      </template>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        :label="detail?.matches?.length ? 'Listo' : 'Más tarde'"
        @click="emit('update:open', false)"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, defineComponent, h, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import CapturarDocumentoButton from '@/components/captura/CapturarDocumentoButton.vue'
import { shellBoot } from '@/composables/muelleShell'
import { formatDate } from '@/utils/display'
import {
  amountTone,
  bancosApi,
  errorText,
  money,
  signedMoney,
  voucherRoute,
} from './bancos'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The row tapped ({ name, title, … }) or just { name } from the URL. */
  movement: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'changed'])
const router = useRouter()

const detail = ref(null)
const loading = ref(false)
const busy = ref('')
const problem = ref('')
let requestId = ''

const m = computed(() => detail.value?.movement || props.movement || null)
const subtitle = computed(() => {
  const row = m.value
  if (!row?.date) return ''
  return [formatDate(row.date, { weekday: true }), row.account_label]
    .filter(Boolean)
    .join(' · ')
})
const suggested = computed(
  () => (detail.value?.candidates || []).find((c) => c.suggested) || null,
)
const others = computed(() =>
  (detail.value?.candidates || []).filter((c) => !c.suggested),
)
const shownBlocks = computed(() =>
  (detail.value?.blocked || []).filter(
    (b) => b.code !== 'no_candidates' || !detail.value.invoices.length,
  ),
)

// A refusal with no way out is a dead end: when the server says the worker may
// ask (Contador's «actions»), the sheet writes the request for them. There is no
// endpoint for it — the shell copies the words, like «Pedir acceso» does.
const asked = ref({})
const ASK = {
  request_authorization: 'Pedir autorización',
  request_review: 'Pedir revisión',
}
function askLabel(block) {
  return (block.actions || []).map((a) => ASK[a]).find(Boolean) || ''
}
async function ask(block) {
  const row = m.value || {}
  const what = (block.actions || []).includes('request_authorization')
    ? 'autorices conciliar'
    : 'revises'
  const text =
    `Hola: te pido que ${what} este movimiento de Bancos. ` +
    [
      row.title || row.description,
      row.date ? formatDate(row.date) : '',
      row.account_label,
      signedMoney(row.amount, row.currency),
      row.reference ? `Ref. ${row.reference}` : '',
      row.name,
    ]
      .filter(Boolean)
      .join(' · ') +
    '. Lo dejo pendiente; no cambié nada.'
  try {
    await navigator.clipboard.writeText(text)
    asked.value = {
      ...asked.value,
      [block.code]: 'Copiado. Mándaselo a quien lleva la contabilidad.',
    }
  } catch {
    asked.value = { ...asked.value, [block.code]: text }
  }
}

// One line per candidate: who, what and when, and the amount it applies.
const CandidateLine = defineComponent({
  props: {
    candidate: { type: Object, required: true },
    currency: { type: String, default: 'MXN' },
  },
  setup(p) {
    return () =>
      h('div', { class: 'mt-1 flex items-start justify-between gap-3' }, [
        h('span', { class: 'min-w-0' }, [
          h(
            'span',
            { class: 'block break-words text-base text-ink-gray-9' },
            p.candidate.party || p.candidate.word,
          ),
          h(
            'span',
            { class: 'block text-sm text-ink-gray-6' },
            [
              p.candidate.word,
              p.candidate.posting_date
                ? formatDate(p.candidate.posting_date)
                : '',
              p.candidate.reference_number
                ? `Ref. ${p.candidate.reference_number}`
                : '',
            ]
              .filter(Boolean)
              .join(' · '),
          ),
        ]),
        h(
          'span',
          { class: 'whitespace-nowrap tabular-nums text-base text-ink-gray-9' },
          money(p.candidate.apply_amount ?? p.candidate.amount, p.currency),
        ),
      ])
  },
})

function newRequestId() {
  requestId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function load(scope = 'near') {
  const name = props.movement?.name
  if (!name) return
  loading.value = true
  problem.value = ''
  try {
    detail.value = await bancosApi('movimiento', {
      bank_transaction: name,
      scope,
    })
  } catch (error) {
    problem.value = errorText(error)
  } finally {
    loading.value = false
  }
}

function changed(result) {
  emit('changed', {
    name: m.value.name,
    row: {
      state: result.state,
      remaining: result.remaining,
      matches: result.matches,
    },
  })
}

async function conciliar(candidate) {
  if (busy.value) return
  busy.value = candidate.name
  problem.value = ''
  try {
    const result = await bancosApi('conciliar', {
      bank_transaction: m.value.name,
      doctype: candidate.doctype,
      name: candidate.name,
      fingerprint: candidate.fingerprint,
      apply_amount: candidate.apply_amount,
      request_id: requestId,
      scope: detail.value?.scope,
    })
    if (result.ok !== false) changed(result)
    await load(detail.value?.scope)
    // The reload clears the line; a refusal (closed month, moved payment) stays.
    if (result.ok === false) problem.value = result.message
  } catch (error) {
    problem.value = errorText(error)
  } finally {
    busy.value = ''
  }
}

async function deshacer() {
  if (busy.value) return
  busy.value = 'deshacer'
  problem.value = ''
  try {
    const match = detail.value.matches[0]
    const result = await bancosApi('deshacer', {
      bank_transaction: m.value.name,
      doctype: match?.doctype,
      name: match?.name,
    })
    if (result.ok !== false) changed(result)
    newRequestId()
    await load()
    if (result.ok === false) problem.value = result.message
  } catch (error) {
    problem.value = errorText(error)
  } finally {
    busy.value = ''
  }
}

async function crearPago(invoice) {
  if (busy.value) return
  busy.value = invoice.name
  problem.value = ''
  try {
    await bancosApi('crear_pago', {
      bank_transaction: m.value.name,
      invoice_doctype: invoice.doctype,
      invoice: invoice.name,
    })
    await load(detail.value?.scope)
  } catch (error) {
    problem.value = errorText(error)
  } finally {
    busy.value = ''
  }
}

async function confirmarPago(draft) {
  if (busy.value) return
  busy.value = draft.name
  problem.value = ''
  try {
    detail.value = await bancosApi('confirmar_pago', {
      bank_transaction: m.value.name,
      payment_entry: draft.name,
    })
  } catch (error) {
    problem.value = errorText(error)
  } finally {
    busy.value = ''
  }
}

async function openVoucher(voucher) {
  const to = await voucherRoute(voucher, shellBoot.value)
  if (!to) return
  emit('update:open', false)
  router.push(to)
}

watch(
  () => [props.open, props.movement?.name],
  ([open]) => {
    if (!open) return
    detail.value = null
    newRequestId()
    load()
  },
  { immediate: true },
)
</script>
