<template>
  <!-- «Enlazar» an account Syncfy brought: which Bank Account its movements
       feed (or a new one on a bank ledger), where they are reviewed when
       Contador is on, and from which day. One sentence reads it back. -->
  <BottomSheet
    :open="open"
    :title="
      account
        ? `Enlazar ${syncfyAccountTitle(account, conexion)}`
        : 'Enlazar cuenta'
    "
    :subtitle="ctx?.institution || conexionBank(conexion)"
    :dismissible="!busy"
    layer="bancos-enlazar"
    @update:open="(v) => emit('update:open', v)"
  >
    <div class="space-y-4" data-bancos-enlazar>
      <div
        v-if="!ctx && !problem"
        role="status"
        aria-label="Cargando cuentas…"
        class="h-32 animate-pulse rounded-7 bg-surface-gray-2"
      />
      <template v-else-if="ctx">
        <ChipGroup
          v-model="destino"
          label="A qué cuenta llegan sus movimientos"
          :options="destinos"
          testid="bancos-enlazar-destino"
        />
        <template v-if="destino === NUEVA">
          <ChipGroup
            v-if="ledgers.length"
            v-model="ledger"
            label="En qué cuenta contable"
            :options="ledgers"
            testid="bancos-enlazar-libro"
          />
          <p
            v-else
            class="rounded-6 bg-surface-gray-2 p-3 text-sm text-ink-gray-7"
          >
            No hay una cuenta contable de banco libre. Pide a tu contador que dé
            de alta una en el catálogo de cuentas.
          </p>
        </template>
        <ChipGroup
          v-if="lanes.length > 1"
          v-model="lane"
          label="Dónde se revisan"
          :options="lanes"
          testid="bancos-enlazar-revision"
        />
        <div class="space-y-2">
          <p class="text-sm font-medium text-ink-gray-7">Desde qué día</p>
          <DateField v-model="desde" label="Desde qué día" />
        </div>
        <p class="text-base text-ink-gray-8" data-bancos-enlazar-frase>
          {{ sentence }}
        </p>
      </template>
      <p
        v-if="problem"
        role="alert"
        class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        {{ problem }}
      </p>
    </div>
    <template #actions>
      <Button
        class="min-h-11 w-full"
        variant="solid"
        :label="missing || 'Enlazar cuenta'"
        :loading="busy"
        :disabled="!!missing"
        data-bancos-enlazar-guardar
        @click="save"
      />
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { BottomSheet, ChipGroup, DateField } from '@/components/ui'
import { formatDate } from '@/utils/display'
import { errorText } from './bancos'
import {
  bankAccountLabel,
  conexionBank,
  ledgerLabel,
  syncfy,
  syncfyAccountTitle,
} from './conectados'

const NUEVA = '__nueva__'
const NATIVE = 'Bank Transactions'
const CONTADOR = 'Contador'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** A Syncfy account row from `conexion` ({name, label, last4}). */
  account: { type: Object, default: null },
  /** Its login ({title, institution}): the title leaves out the bank's name. */
  conexion: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'linked'])
const ctx = ref(null)
const problem = ref('')
const busy = ref(false)
const destino = ref('')
const ledger = ref('')
const lane = ref(NATIVE)
const desde = ref('')

const destinos = computed(() => [
  ...(ctx.value?.bank_accounts || []).map((b) => ({
    value: b.name,
    label: bankAccountLabel(b),
  })),
  { value: NUEVA, label: 'Una cuenta nueva' },
])
const picked = computed(() =>
  (ctx.value?.bank_accounts || []).find((b) => b.name === destino.value),
)
const ledgers = computed(() =>
  (ctx.value?.ledger_accounts || []).map((name) => ({
    value: name,
    label: ledgerLabel(name),
  })),
)
const lanes = computed(() =>
  (ctx.value?.lanes || []).map((value) => ({
    value,
    label: value === CONTADOR ? 'En Contador' : 'En Bancos',
  })),
)
const missing = computed(() => {
  if (!ctx.value) return 'Enlazar cuenta'
  if (!destino.value) return 'Elige la cuenta'
  if (destino.value === NUEVA && !ledger.value)
    return 'Elige la cuenta contable'
  return ''
})
const sentence = computed(() => {
  const where =
    destino.value === NUEVA
      ? ledger.value
        ? `una cuenta bancaria nueva sobre «${ledgerLabel(ledger.value)}»`
        : 'una cuenta bancaria nueva'
      : picked.value
        ? `«${bankAccountLabel(picked.value)}»`
        : 'la cuenta que elijas'
  const review =
    lane.value === CONTADOR
      ? 'y se revisan en Contador'
      : 'y se concilian en Bancos'
  const from = desde.value
    ? `desde el ${formatDate(desde.value, { relative: false })}`
    : 'con todo lo que Syncfy tenga'
  return `Sus movimientos llegan a ${where} ${from}, ${review}.`
})

async function prepare() {
  ctx.value = null
  problem.value = ''
  destino.value = ''
  ledger.value = ''
  desde.value = ''
  try {
    const answer = await syncfy.accountContext(props.account.name)
    ctx.value = answer
    lane.value = answer.default_lane || NATIVE
    desde.value = answer.suggested_import_from || ''
    const current = (answer.bank_accounts || []).find(
      (b) => b.name === props.account.cuenta,
    )
    // Linking again (Contador stopped taking it) keeps the account it feeds.
    if (current) destino.value = current.name
    else if (answer.bank_accounts?.length === 1)
      destino.value = answer.bank_accounts[0].name
    else if (!answer.bank_accounts?.length) destino.value = NUEVA
    if (answer.ledger_accounts?.length === 1)
      ledger.value = answer.ledger_accounts[0]
  } catch (error) {
    problem.value = errorText(error)
  }
}

watch(
  () => props.open,
  (open) => open && props.account && prepare(),
  { immediate: true },
)

// The day after the last movement already in that account, so nothing doubles.
watch(destino, async (value) => {
  if (!value || value === NUEVA || !ctx.value) return
  try {
    const suggested = await syncfy.suggestImportFrom(value)
    if (suggested) desde.value = suggested
  } catch {
    // keep the date already shown
  }
})

async function save() {
  if (busy.value || missing.value) return
  busy.value = true
  problem.value = ''
  try {
    const answer = await syncfy.linkAccount(props.account.name, {
      bank_account: destino.value === NUEVA ? '' : destino.value,
      ledger_account: destino.value === NUEVA ? ledger.value : '',
      import_from: desde.value,
      lane: lane.value,
    })
    toast.success(`Cuenta enlazada. Sus movimientos llegan en unos minutos.`)
    emit('update:open', false)
    emit('linked', answer)
  } catch (error) {
    problem.value = errorText(error)
  } finally {
    busy.value = false
  }
}
</script>
