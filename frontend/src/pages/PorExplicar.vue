<template>
  <!-- Por explicar (crm docs/DINERO_EN_ORDEN.md §3d): what the bank and the
       cards brought that the books do not explain yet, grouped by merchant
       with the likely answer. One tap books a whole group through the site's
       engine (Contador where it owns bank review); «Deshacer» takes it back. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-por-explicar
  >
    <AppBar
      title="Por explicar"
      context="Bancos"
      :back="{ name: 'Bancos', query: companyQuery }"
      back-label="Volver a Bancos"
      :loading="loading && !!data"
    >
      <template v-if="data?.can_set" #actions>
        <button
          type="button"
          class="press grid size-10 place-items-center rounded-full text-ink-gray-7"
          aria-label="Recordatorio"
          title="Recordatorio"
          data-por-explicar-recordatorio
          @click="sheets.reminder = true"
        >
          <span
            :class="[
              data.recordatorio?.remind
                ? 'lucide-alarm-clock'
                : 'lucide-alarm-clock-off',
              'size-5',
            ]"
            aria-hidden="true"
          />
        </button>
      </template>
    </AppBar>

    <p
      v-if="error"
      role="alert"
      class="mx-4 my-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
      data-por-explicar-problem
    >
      {{ error }}
    </p>
    <div
      v-else-if="!data"
      role="status"
      aria-label="Cargando…"
      class="space-y-3 px-4 py-4"
    >
      <div class="h-28 animate-pulse rounded-7 bg-surface-gray-2" />
      <div class="h-24 animate-pulse rounded-7 bg-surface-gray-2" />
      <div class="h-24 animate-pulse rounded-7 bg-surface-gray-2" />
    </div>

    <template v-else>
      <!-- How much waits, and how much takes one tap. -->
      <section
        class="mx-4 mt-2 flex-none rounded-8 bg-surface-gray-1 p-4"
        aria-label="Lo que falta explicar"
        data-por-explicar-hero
      >
        <p class="text-sm text-ink-gray-6">
          Movimientos del banco que tus libros no explican
        </p>
        <p class="num mt-1 break-words text-3xl font-semibold text-ink-gray-9">
          {{ countText(data.summary.count) }}
        </p>
        <p v-if="data.summary.count" class="mt-1 text-sm text-ink-gray-6">
          {{ fmt(data.summary.total) }} en total, desde el
          {{ dayText(data.summary.oldest) }}.
        </p>
        <p
          v-if="data.summary.guessed"
          class="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-surface-green-2 px-3 text-sm font-medium text-ink-green-8"
          data-por-explicar-listos
        >
          <span class="lucide-sparkles size-4" aria-hidden="true" />
          {{ countText(data.summary.guessed) }} con respuesta sugerida
        </p>
      </section>

      <!-- The cash: what the books say each one holds, when it was counted. -->
      <section
        v-if="data.efectivo?.length"
        class="mx-4 mt-3 flex-none rounded-7 border border-outline-gray-2 p-4"
        aria-label="Tu efectivo"
        data-por-explicar-efectivo
      >
        <h2 class="text-sm font-semibold text-ink-gray-7">Tu efectivo</h2>
        <ul class="mt-2 space-y-2">
          <li
            v-for="c in data.efectivo"
            :key="c.account"
            class="flex items-start justify-between gap-3 text-sm"
          >
            <span class="min-w-0">
              <span class="block break-words text-ink-gray-9">{{
                c.label
              }}</span>
              <span class="block text-ink-gray-6">{{
                lastCountText(c.last_count)
              }}</span>
            </span>
            <span class="num whitespace-nowrap text-ink-gray-9">{{
              fmt(c.balance)
            }}</span>
          </li>
        </ul>
        <div v-if="data.can_book" class="mt-3 flex flex-wrap gap-2">
          <Button
            class="min-h-11"
            variant="solid"
            label="Gasté en efectivo"
            data-por-explicar-gaste
            @click="sheets.spent = true"
          />
          <Button
            class="min-h-11"
            variant="subtle"
            label="Contar caja"
            data-por-explicar-contar
            @click="sheets.count = true"
          />
        </div>
      </section>

      <!-- What the last tap did, with its undo. -->
      <section
        v-if="receipt.text"
        role="status"
        class="mx-4 mt-3 flex flex-none items-center gap-3 rounded-7 border border-outline-gray-2 p-3"
        data-por-explicar-recibo
      >
        <span
          class="lucide-check-circle-2 size-5 flex-none text-ink-green-7"
          aria-hidden="true"
        />
        <p class="min-w-0 flex-1 text-sm text-ink-gray-8">{{ receipt.text }}</p>
        <Button
          v-if="receipt.journals.length"
          class="min-h-11"
          variant="subtle"
          label="Deshacer"
          :loading="receipt.busy"
          data-por-explicar-deshacer
          @click="undo()"
        />
      </section>

      <p
        v-if="!data.can_explain && data.summary.count"
        class="mx-4 mt-3 flex-none rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        data-por-explicar-solo-ver
      >
        Puedes ver lo que falta, pero registrar pólizas lo hace quien tenga
        permiso de contabilidad.
      </p>

      <EmptyState
        v-if="!data.summary.count"
        class="py-10"
        state="empty"
        title="Todo explicado"
        message="Cuando el banco o tus tarjetas traigan movimientos nuevos, aparecen aquí para que digas qué fueron."
      />

      <ul v-else class="mt-4 flex-none space-y-3 px-4" data-por-explicar-grupos>
        <li
          v-for="g in data.groups"
          :key="g.id"
          class="rounded-7 border border-outline-gray-2 p-4"
          :data-por-explicar-grupo="g.label"
        >
          <div class="flex items-start justify-between gap-3">
            <p
              class="min-w-0 break-words text-base font-medium text-ink-gray-9"
            >
              {{ g.label }}
            </p>
            <p
              class="num whitespace-nowrap text-base font-semibold"
              :class="
                g.direction === 'Deposit'
                  ? 'text-ink-green-7'
                  : 'text-ink-gray-9'
              "
            >
              {{ g.direction === 'Deposit' ? '+' : '−' }}{{ fmt(g.total) }}
            </p>
          </div>
          <p class="mt-0.5 text-sm text-ink-gray-6">
            {{ g.bank_label }} · {{ countText(g.count) }} ·
            {{ rangeText(g.first, g.last) }}
          </p>

          <template v-if="g.guess">
            <p class="mt-3 text-sm text-ink-gray-9">
              <span class="text-ink-gray-6">Parece:</span>
              {{
                answerText(g.guess.kind, g.guess.account, g.direction, names)
              }}
            </p>
            <p class="mt-0.5 text-sm text-ink-gray-6">
              {{ whyText(g.guess, names) }}
            </p>
          </template>

          <div class="mt-3 flex flex-wrap gap-2">
            <Button
              v-if="g.guess && data.can_explain"
              class="min-h-11"
              variant="solid"
              label="Sí, es eso"
              :loading="busy === g.id"
              data-por-explicar-si
              @click="explain(g, g.guess.kind, g.guess.account)"
            />
            <Button
              v-if="data.can_explain"
              class="min-h-11"
              :variant="g.guess ? 'subtle' : 'solid'"
              :label="g.guess ? 'Otra cosa' : '¿Qué fue?'"
              data-por-explicar-que-fue
              @click="openSheet(g)"
            />
            <Button
              class="min-h-11"
              variant="ghost"
              :label="open.has(g.id) ? 'Ocultar' : 'Ver movimientos'"
              :aria-expanded="open.has(g.id)"
              @click="toggle(g.id)"
            />
          </div>

          <ul
            v-if="open.has(g.id)"
            class="mt-2 divide-y divide-outline-gray-1"
            :aria-label="`Movimientos de ${g.label}`"
          >
            <li
              v-for="r in g.rows"
              :key="r.name"
              class="flex items-start justify-between gap-3 py-2 text-sm"
            >
              <span class="min-w-0">
                <span class="block text-ink-gray-6">{{ dayText(r.date) }}</span>
                <span class="block break-words text-ink-gray-8">{{
                  r.description
                }}</span>
              </span>
              <span class="num whitespace-nowrap text-ink-gray-9">{{
                fmt(r.amount)
              }}</span>
            </li>
            <li
              v-if="g.count > g.rows.length"
              class="py-2 text-sm text-ink-gray-6"
            >
              Y {{ countText(g.count - g.rows.length) }} más: aparecen al
              explicar estos.
            </li>
          </ul>
        </li>
      </ul>
      <div class="h-24 flex-none lg:h-10" aria-hidden="true" />
    </template>

    <!-- «¿Qué fue?»: the answer, then the account. -->
    <BottomSheet
      v-model:open="sheet.open"
      :title="sheet.group?.label || ''"
      :subtitle="sheetSubtitle"
      layer="por-explicar"
    >
      <div class="space-y-4 pb-2" data-por-explicar-sheet>
        <div role="radiogroup" aria-label="¿Qué fue?" class="space-y-2">
          <button
            v-for="k in kinds"
            :key="k.kind"
            type="button"
            role="radio"
            class="press flex min-h-11 w-full items-center gap-3 rounded-6 border px-3 py-2 text-left"
            :class="
              sheet.kind === k.kind
                ? 'border-[var(--muelle-accent)] bg-surface-gray-1'
                : 'border-outline-gray-2'
            "
            :aria-checked="sheet.kind === k.kind"
            :data-por-explicar-tipo="k.kind"
            @click="pickKind(k.kind)"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-base text-ink-gray-9">{{ k.label }}</span>
              <span class="block text-xs text-ink-gray-6">{{ k.hint }}</span>
            </span>
            <span
              v-if="sheet.kind === k.kind"
              class="lucide-check size-5 text-ink-gray-9"
              aria-hidden="true"
            />
          </button>
        </div>

        <div v-if="sheet.kind" class="space-y-2">
          <label class="block text-sm font-medium text-ink-gray-7" for="cuenta">
            {{ accountQuestion }}
          </label>
          <input
            id="cuenta"
            v-model="sheet.query"
            type="search"
            autocomplete="off"
            class="min-h-11 w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 text-base text-ink-gray-9"
            placeholder="Buscar cuenta"
            data-por-explicar-buscar
          />
          <ul
            role="radiogroup"
            :aria-label="accountQuestion"
            class="max-h-72 divide-y divide-outline-gray-1 overflow-y-auto"
          >
            <li v-for="a in shownAccounts" :key="a.account">
              <button
                type="button"
                role="radio"
                class="press flex min-h-11 w-full items-center gap-3 py-2 text-left"
                :aria-checked="sheet.account === a.account"
                :data-por-explicar-cuenta="a.account"
                @click="sheet.account = a.account"
              >
                <span
                  class="min-w-0 flex-1 break-words text-base text-ink-gray-9"
                >
                  {{ a.label }}
                </span>
                <span
                  v-if="sheet.account === a.account"
                  class="lucide-check size-5 text-ink-gray-9"
                  aria-hidden="true"
                />
              </button>
            </li>
            <li
              v-if="!shownAccounts.length"
              class="py-3 text-sm text-ink-gray-6"
            >
              Ninguna cuenta con ese nombre.
            </li>
          </ul>
        </div>
        <p v-if="sheet.problem" role="alert" class="text-sm text-ink-red-7">
          {{ sheet.problem }}
        </p>
      </div>
      <template #actions>
        <div class="flex gap-2">
          <Button
            class="min-h-11 flex-1"
            label="Cancelar"
            @click="sheet.open = false"
          />
          <Button
            class="min-h-11 flex-1"
            variant="solid"
            :label="sheetAction"
            :disabled="!sheet.kind || !sheet.account"
            :loading="busy === sheet.group?.id"
            data-por-explicar-guardar
            @click="explain(sheet.group, sheet.kind, sheet.account, sheet)"
          />
        </div>
      </template>
    </BottomSheet>
    <GastoEfectivoSheet
      v-model:open="sheets.spent"
      :data="data"
      @done="spent"
    />
    <ConteoCajaSheet v-model:open="sheets.count" :data="data" @done="counted" />
    <RecordatorioSheet
      v-model:open="sheets.reminder"
      :data="data"
      @done="data = $event"
    />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from 'frappe-ui'
import { AppBar, BottomSheet, EmptyState } from '@/components/ui'
import { errorText, money } from '@/components/bancos/bancos'
import ConteoCajaSheet from '@/components/dinero/ConteoCajaSheet.vue'
import GastoEfectivoSheet from '@/components/dinero/GastoEfectivoSheet.vue'
import RecordatorioSheet from '@/components/dinero/RecordatorioSheet.vue'
import {
  accountNames,
  accountsFor,
  answerText,
  countText,
  journalsOf,
  kindsFor,
  lastCountText,
  porExplicarApi,
  rangeText,
  receiptText,
  whyText,
} from '@/components/dinero/porExplicar'

const SHOWN_ACCOUNTS = 40

const route = useRoute()
const data = ref(null)
const loading = ref(false)
const error = ref('')
const busy = ref('')
const open = reactive(new Set())
const receipt = reactive({ text: '', journals: [], cash: false, busy: false })
const sheets = reactive({ spent: false, count: false, reminder: false })
const sheet = reactive({
  open: false,
  group: null,
  kind: '',
  account: '',
  query: '',
  problem: '',
})

const companyQuery = computed(() =>
  route.query.empresa ? { empresa: route.query.empresa } : {},
)
const names = computed(() => accountNames(data.value?.choices))
const fmt = (amount) => money(amount, data.value?.currency)
const kinds = computed(() => kindsFor(sheet.group?.direction))
const shownAccounts = computed(() =>
  accountsFor(data.value?.choices, sheet.kind, sheet.query).slice(
    0,
    SHOWN_ACCOUNTS,
  ),
)
const sheetSubtitle = computed(() => {
  const g = sheet.group
  return g ? `${countText(g.count)} · ${fmt(g.total)} · ${g.bank_label}` : ''
})
const accountQuestion = computed(() => {
  switch (sheet.kind) {
    case 'gasto':
      return '¿En qué cuenta de gastos?'
    case 'personal':
      return '¿En qué cuenta tuya?'
    case 'traspaso':
      return sheet.group?.direction === 'Withdrawal'
        ? '¿A qué cuenta fue?'
        : '¿De qué cuenta vino?'
    case 'ingreso':
      return '¿En qué cuenta de ingresos?'
    default:
      return ''
  }
})
const sheetAction = computed(() => {
  const n = shownRows(sheet.group).length
  return n === 1 ? 'Explicar 1 movimiento' : `Explicar ${n} movimientos`
})

function dayText(day) {
  if (!day) return ''
  return new Date(`${day}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function shownRows(g) {
  return g?.rows || []
}

function toggle(id) {
  if (open.has(id)) open.delete(id)
  else open.add(id)
}

function openSheet(g) {
  Object.assign(sheet, {
    open: true,
    group: g,
    kind: g.guess?.kind || '',
    account: g.guess?.account || '',
    query: '',
    problem: '',
  })
}

function pickKind(kind) {
  if (sheet.kind === kind) return
  sheet.kind = kind
  sheet.account = accountsFor(data.value?.choices, kind)[0]?.account || ''
  sheet.query = ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await porExplicarApi('estado', {
      company: route.query.empresa || undefined,
    })
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}

async function explain(g, kind, account, from = null) {
  if (!g || busy.value) return
  busy.value = g.id
  if (from) from.problem = ''
  try {
    const done = await porExplicarApi('explicar', {
      company: data.value.company,
      movimientos: shownRows(g).map((r) => r.name),
      tipo: kind,
      cuenta: account,
    })
    data.value = done.estado
    receipt.text = receiptText(done, g.label)
    receipt.journals = journalsOf(done)
    receipt.cash = false
    if (from) from.open = false
  } catch (e) {
    if (from) from.problem = errorText(e)
    else {
      receipt.text = errorText(e)
      receipt.journals = []
    }
  } finally {
    busy.value = ''
  }
}

function spent(done) {
  data.value = done.estado
  receipt.text = `Listo: ${fmt(done.amount)} en efectivo, en tus libros.`
  receipt.journals = [done.journal]
  receipt.cash = true
}

function counted(done) {
  data.value = done.estado
  const left = data.value.efectivo?.find((c) => c.label === done.label)
  receipt.text = left
    ? `Listo: ${done.label} queda en ${fmt(left.balance)}.`
    : 'Listo: conteo guardado.'
  receipt.journals = done.journal ? [done.journal] : []
  receipt.cash = true
}

async function undo() {
  if (receipt.busy) return
  receipt.busy = true
  try {
    let page = null
    if (receipt.cash) {
      page = await porExplicarApi('deshacer_efectivo', {
        company: data.value.company,
        poliza: receipt.journals[0],
      })
      receipt.text = 'Deshecho: el efectivo vuelve a como estaba.'
    } else {
      page = await porExplicarApi('deshacer', {
        company: data.value.company,
        polizas: receipt.journals,
      })
      receipt.text = 'Deshecho: esos movimientos vuelven a estar por explicar.'
    }
    data.value = page.estado
    receipt.journals = []
  } catch (e) {
    receipt.text = errorText(e)
  } finally {
    receipt.busy = false
  }
}

watch(() => route.query.empresa, load, { immediate: true })
</script>
