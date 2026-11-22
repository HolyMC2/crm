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
      <template v-if="data?.can_set || data?.can_explain" #actions>
        <button
          v-if="data.can_explain"
          type="button"
          class="press grid size-10 place-items-center rounded-full text-ink-gray-7"
          aria-label="Etiquetas"
          title="Etiquetas"
          data-por-explicar-etiquetas
          @click="sheets.tags = true"
        >
          <span class="lucide-tags size-5" aria-hidden="true" />
        </button>
        <button
          v-if="data.can_set"
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

    <div v-else class="mx-auto w-full max-w-3xl flex-none">
      <!-- How much waits, and how much takes one tap. -->
      <section
        class="mx-4 mt-2 flex-none"
        aria-label="Lo que falta explicar"
        data-por-explicar-hero
      >
        <p class="text-sm text-ink-gray-6">
          Movimientos del banco que tus libros no explican
        </p>
        <p
          class="num mt-0.5 break-words text-3xl font-semibold text-ink-gray-9"
        >
          {{ countText(data.summary.count) }}
        </p>
        <p v-if="data.summary.count" class="mt-0.5 text-sm text-ink-gray-6">
          {{ fmt(data.summary.total) }} desde el
          {{ dayText(data.summary.oldest)
          }}<template v-if="data.summary.guessed"
            >; {{ data.summary.guessed }} con respuesta sugerida</template
          >.
        </p>
      </section>

      <TicketsPorRegistrar
        :data="data"
        :names="ticketNames"
        @paint="paint"
        @reread="refresh"
      />

      <CuentasContraBanco
        v-if="data.cuentas?.length"
        :rows="data.cuentas"
        :cards="cards"
        :currency="data.currency"
        :fresh="live.fresh.value"
        @abrir="openAccount"
      />

      <!-- The cash: what the books say each one holds, when it was counted. -->
      <section
        v-if="data.efectivo?.length"
        class="mx-4 mt-6 flex-none"
        aria-label="Tu efectivo"
        data-por-explicar-efectivo
      >
        <h2 class="text-sm font-medium text-ink-gray-7">Tu efectivo</h2>
        <ul
          class="mt-1 divide-y divide-outline-gray-1 border-y border-outline-gray-1"
        >
          <li
            v-for="c in data.efectivo"
            :key="c.account"
            class="flex items-start justify-between gap-3 py-3 text-sm"
          >
            <span class="min-w-0">
              <span class="block break-words text-base text-ink-gray-9">{{
                c.label
              }}</span>
              <span class="block text-ink-gray-6"
                >En tus libros · {{ lastCountText(c.last_count) }}</span
              >
            </span>
            <span class="num whitespace-nowrap text-base text-ink-gray-9">{{
              fmt(c.balance)
            }}</span>
          </li>
        </ul>
        <div
          v-if="cash.text"
          role="status"
          class="mt-3 flex items-center gap-3"
          data-por-explicar-recibo
        >
          <span
            class="lucide-check-circle-2 size-5 flex-none text-ink-green-7"
            aria-hidden="true"
          />
          <p class="min-w-0 flex-1 text-sm text-ink-gray-8">{{ cash.text }}</p>
          <Button
            v-if="cash.journal"
            class="min-h-11"
            variant="subtle"
            label="Deshacer"
            :loading="cash.busy"
            data-por-explicar-deshacer
            @click="undoCash()"
          />
        </div>
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

      <p
        v-if="!data.can_explain && data.summary.count"
        class="mx-4 mt-4 flex-none rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        data-por-explicar-solo-ver
      >
        Puedes ver lo que falta, pero registrar pólizas lo hace quien tenga
        permiso de contabilidad.
      </p>

      <ListaPareada
        v-for="key in LISTS"
        v-show="data[key]?.length || lists[key].done.length"
        :key="key"
        :kind="key"
        :rows="data[key] || []"
        :done="lists[key].done"
        :result="lists[key]"
        :currency="data.currency"
        :can-act="data.can_explain"
        :busy="busy === key"
        @act="(rows) => linkOrPay(rows, key)"
        @undo="undoList(key)"
      />

      <EmptyState
        v-if="!data.summary.count && !data.tickets?.por_registrar?.length"
        class="py-10"
        state="empty"
        title="Todo explicado"
        message="Cuando el banco o tus tarjetas traigan movimientos nuevos, aparecen aquí para que digas qué fueron."
      />

      <section
        v-if="items.length"
        class="mx-4 mt-6 flex-none"
        aria-label="Por comercio"
      >
        <h2 class="text-base font-medium text-ink-gray-9">Por comercio</h2>
        <p class="mt-0.5 text-sm text-ink-gray-6">
          Confirma lo que parece o di qué fue. Cada respuesta queda en tus
          libros y se puede deshacer.
        </p>
        <ul
          class="mt-1 divide-y divide-outline-gray-1 border-b border-outline-gray-1"
          data-por-explicar-grupos
        >
          <li
            v-for="item in items"
            :key="item.key"
            :data-fresh="
              item.group && live.fresh.value.has(groupKey(item.group))
                ? ''
                : undefined
            "
          >
            <HechoPorExplicar
              v-if="item.hecho"
              :item="item.hecho"
              @undo="undo(item.hecho)"
            />
            <GrupoPorExplicar
              v-else
              :group="item.group"
              :ctx="ctx"
              :can-explain="data.can_explain"
              :busy="busy === item.group.id"
              :open="open.has(item.group.id)"
              :problem="problems[item.group.id] || ''"
              :tickets="data.tickets?.por_movimiento || {}"
              @si="
                explain(
                  item.group,
                  item.group.guess.kind,
                  item.group.guess.account,
                  null,
                  item.group.tags,
                )
              "
              @otra="openSheet(item.group)"
              @toggle="toggle(item.group.id)"
              @adjuntar="(r) => (attach.row = r)"
            />
          </li>
        </ul>
      </section>
      <div class="h-24 flex-none lg:h-10" aria-hidden="true" />
    </div>

    <!-- «¿Qué fue?»: the answer, then the account. -->
    <BottomSheet
      v-model:open="sheet.open"
      :title="sheet.group?.label || ''"
      :subtitle="sheetSubtitle"
      layer="por-explicar"
    >
      <div class="space-y-4 pb-2" data-por-explicar-sheet>
        <p
          v-if="sheet.gone"
          role="status"
          class="rounded-6 bg-surface-gray-1 p-3 text-sm text-ink-gray-8"
          data-por-explicar-sheet-hecho
        >
          Ya no queda nada por explicar aquí: se explicó desde otro lado.
        </p>
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
        <ul
          v-if="sheetEffect.length"
          class="space-y-0.5 rounded-6 bg-surface-gray-1 p-3 text-sm text-ink-gray-8"
          aria-label="Al guardar"
          data-por-explicar-sheet-efecto
        >
          <li v-for="(line, i) in sheetEffect" :key="i">
            <span v-if="i === 0" class="text-ink-gray-6">Al guardar: </span
            >{{ line }}
          </li>
        </ul>
        <EtiquetasPicker
          v-if="sheet.kind"
          v-model="sheet.tags"
          :options="data?.etiquetas || []"
          :suggested="sheet.group?.tags || []"
        />
        <p v-if="sheet.problem" role="alert" class="text-sm text-ink-red-7">
          {{ sheet.problem }}
        </p>
      </div>
      <template #actions>
        <div class="flex gap-2">
          <Button
            class="min-h-11 flex-1"
            :label="sheet.gone ? 'Cerrar' : 'Cancelar'"
            @click="sheet.open = false"
          />
          <Button
            v-if="!sheet.gone"
            class="min-h-11 flex-1"
            variant="solid"
            :label="sheetAction"
            :disabled="!sheet.kind || !sheet.account"
            :loading="busy === sheet.group?.id"
            data-por-explicar-guardar
            @click="
              explain(sheet.group, sheet.kind, sheet.account, sheet, sheet.tags)
            "
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
      @done="paint"
    />
    <AdjuntarSheet
      :open="!!attach.row"
      :row="attach.row"
      :company="data?.company || ''"
      :currency="data?.currency"
      @update:open="(v) => !v && (attach.row = null)"
    />
    <EtiquetasSheet v-model:open="sheets.tags" :data="data" @done="paint" />
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { AppBar, BottomSheet, EmptyState } from '@/components/ui'
import {
  LIVE_DOCTYPES,
  bancosApi,
  errorText,
  money,
} from '@/components/bancos/bancos'
import AdjuntarSheet from '@/components/dinero/AdjuntarSheet.vue'
import ConteoCajaSheet from '@/components/dinero/ConteoCajaSheet.vue'
import CuentasContraBanco from '@/components/dinero/CuentasContraBanco.vue'
import EtiquetasPicker from '@/components/dinero/EtiquetasPicker.vue'
import EtiquetasSheet from '@/components/dinero/EtiquetasSheet.vue'
import GastoEfectivoSheet from '@/components/dinero/GastoEfectivoSheet.vue'
import GrupoPorExplicar from '@/components/dinero/GrupoPorExplicar.vue'
import HechoPorExplicar from '@/components/dinero/HechoPorExplicar.vue'
import ListaPareada from '@/components/dinero/ListaPareada.vue'
import RecordatorioSheet from '@/components/dinero/RecordatorioSheet.vue'
import TicketsPorRegistrar from '@/components/dinero/TicketsPorRegistrar.vue'
import {
  accountNames,
  accountState,
  accountsFor,
  countText,
  effectLines,
  groupKey,
  journalsOf,
  kindsFor,
  lastCountText,
  liveKeys,
  ownBalances,
  porExplicarApi,
  stillWaiting,
  ticketGuess,
} from '@/components/dinero/porExplicar'
import { useLiveList } from '@/composables/liveList'

const SHOWN_ACCOUNTS = 40
// a ticket read from a mail or booked on another phone repaints the page too
const TICKET_DOCTYPE = 'Ticket de Compra'
const LISTS = ['ya', 'facturas']

const route = useRoute()
const router = useRouter()
const data = ref(null)
const cards = ref([])
const loading = ref(false)
const error = ref('')
const busy = ref('')
const open = reactive(new Set())
// what each tap did, kept where the worker tapped (groups) or in its list
const hechos = reactive([])
const problems = reactive({})
const lists = reactive(Object.fromEntries(LISTS.map((k) => [k, emptyList()])))
const cash = reactive({ text: '', journal: '', busy: false })
const attach = reactive({ row: null })
const sheets = reactive({
  spent: false,
  count: false,
  reminder: false,
  tags: false,
})
const sheet = reactive({
  open: false,
  group: null,
  kind: '',
  account: '',
  query: '',
  problem: '',
  tags: [],
  gone: false,
})
let seq = 0

const companyQuery = computed(() =>
  route.query.empresa ? { empresa: route.query.empresa } : {},
)
const names = computed(() => accountNames(data.value?.choices))
// the tickets name the cash they came out of too
const ticketNames = computed(() => ({
  ...Object.fromEntries(names.value),
  ...Object.fromEntries(
    (data.value?.efectivo || []).map((c) => [c.account, c.label]),
  ),
}))
const fmt = (amount) => money(amount, data.value?.currency)
const ctx = computed(() => ({
  fmt,
  names: names.value,
  own: ownBalances(cards.value, data.value?.efectivo),
}))
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
const sheetEffect = computed(() =>
  sheet.kind && sheet.account
    ? effectLines(sheet.group, sheet.kind, sheet.account, ctx.value)
    : [],
)
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

// The groups as shown: each tap's result sits where its group was.
const items = computed(() => {
  // a card charge its purchase ticket explains comes with the ticket store's answer
  const bought = data.value?.tickets?.por_movimiento || {}
  const list = (data.value?.groups || []).map((g) => {
    const fromTicket = ticketGuess(g, bought, data.value?.choices)
    return { key: g.id, group: fromTicket ? { ...g, guess: fromTicket } : g }
  })
  for (const h of [...hechos].sort((a, b) => a.at - b.at))
    list.splice(Math.min(h.at, list.length), 0, {
      key: h.key,
      hecho: withAccount(h),
    })
  return list
})

function emptyList() {
  return {
    done: [],
    text: '',
    problem: '',
    pairs: [],
    cancel: false,
    canUndo: false,
    busy: false,
  }
}

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
    tags: [...(g.tags || [])],
    query: '',
    problem: '',
    gone: false,
  })
}

function pickKind(kind) {
  if (sheet.kind === kind) return
  sheet.kind = kind
  sheet.account = accountsFor(data.value?.choices, kind)[0]?.account || ''
  sheet.query = ''
}

function openAccount(cuenta) {
  router.push({
    name: 'BancoCuenta',
    params: { cuenta },
    query: { ...companyQuery.value, cuadre: '1' },
  })
}

// How the account stands now, under what a tap did (live: the balances refresh after it).
function withAccount(h) {
  const row = data.value?.cuentas?.find((a) => a.bank_account === h.account)
  if (!row) return h
  const card = cards.value.find((c) => c.cuenta === h.account) || null
  const now = accountState(card, row, fmt).line
  return { ...h, lines: [...h.lines, `${row.label} ahora: ${now}`] }
}

let cardsRead = 0
async function refreshCards() {
  const company = data.value?.company
  if (!company) return
  const mine = ++cardsRead
  try {
    const answer = await bancosApi('cuentas', { company })
    if (mine !== cardsRead) return // a later read is on its way
    cards.value = Array.isArray(answer?.cards) ? answer.cards : []
  } catch {
    // the balances are a help; the page works without them
  }
}

// Every write of the page goes through here: a live read that started before
// a tap's answer never paints over it, and an open «¿Qué fue?» follows its group.
let painted = 0
function paint(page) {
  painted++
  data.value = page
  followSheet()
}

// The sheet's group as the page reads again: its movements may have changed
// meanwhile, or been explained from another phone (then nothing is left to save).
function followSheet() {
  if (!sheet.open || !sheet.group) return
  const now = data.value?.groups?.find((g) => g.id === sheet.group.id)
  if (now) sheet.group = now
  else if (busy.value !== sheet.group.id) sheet.gone = true // not this sheet's own save
}

// A change made anywhere else (the bank's import, a teammate, this person's
// other phone) reads the page again in place: each tap's result stays where it
// is, and the groups and accounts whose count or amount changed are marked a
// moment. A failed live read keeps the page as it is.
async function refresh() {
  if (!data.value || loading.value) return
  const at = painted
  let page
  try {
    page = await porExplicarApi('estado', { company: data.value.company })
  } catch {
    return
  }
  if (at !== painted) return // a tap's answer, newer than this read, is on screen
  const before = liveKeys(data.value)
  paint(page)
  live.mark(before, liveKeys(page))
  refreshCards()
}

// Saves by this same person count too: they may come from their other phone.
// The price is one more read after a tap here, at most every 5 s.
const live = useLiveList([...LIVE_DOCTYPES, TICKET_DOCTYPE], refresh, {
  minIntervalMs: 5000,
  me: () => '',
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    paint(
      await porExplicarApi('estado', {
        company: route.query.empresa || undefined,
      }),
    )
    refreshCards()
  } catch (e) {
    error.value = errorText(e)
  } finally {
    loading.value = false
  }
}

// After a call whose answer never came (the connection dropped, the server failed): read the
// page again and say what the books kept. → the names still waiting, or null when unreadable.
async function reread(sent) {
  try {
    paint(await porExplicarApi('estado', { company: data.value.company }))
  } catch {
    return null
  }
  refreshCards()
  return stillWaiting(data.value, sent)
}

function addHecho(g, at, okNames, journals, note = '') {
  const done = g.rows.filter((r) => okNames.has(r.name))
  const n = done.length
  const kind = g.answer?.kind
  const lines = kind
    ? effectLines(
        { ...g, rows: done, count: n },
        kind,
        g.answer.account,
        ctx.value,
        true,
      )
    : []
  if (note) lines.push(note)
  hechos.push({
    key: `hecho-${++seq}`,
    at,
    account: g.bank_account,
    title: `${g.label}: ${n === 1 ? '1 movimiento explicado' : `${n} movimientos explicados`}`,
    lines,
    journals,
    canUndo: journals.length > 0,
    busy: false,
    problem: '',
  })
}

async function explain(g, kind, account, from = null, tags = []) {
  if (!g || busy.value) return
  busy.value = g.id
  delete problems[g.id]
  if (from) from.problem = ''
  const sent = shownRows(g).map((r) => r.name)
  const at = Math.max(
    0,
    items.value.findIndex((i) => i.key === g.id),
  )
  const answered = { ...g, answer: { kind, account } }
  try {
    const done = await porExplicarApi('explicar', {
      company: data.value.company,
      movimientos: sent,
      tipo: kind,
      cuenta: account,
      etiquetas: tags?.length ? tags : undefined,
    })
    paint(done.estado)
    const results = done.results || []
    const ok = new Set(
      results.filter((r) => r.ok).flatMap((r) => [r.name, r.twin]),
    )
    const gone = results.filter((r) => r.gone)
    const failed = results.filter((r) => !r.ok && !r.gone)
    if (ok.size)
      addHecho(
        answered,
        at,
        ok,
        journalsOf(done),
        gone.length
          ? `${countText(gone.length)} ya estaba${gone.length === 1 ? '' : 'n'} explicado${gone.length === 1 ? '' : 's'}.`
          : '',
      )
    else if (gone.length)
      addHecho(
        answered,
        at,
        new Set(gone.map((r) => r.name)),
        [],
        'Ya estaban explicados: no se registró nada otra vez.',
      )
    if (failed.length) {
      const why = `${failed.length === 1 ? '1 no se pudo' : `${failed.length} no se pudieron`}: ${failed[0].message}`
      if (from && !ok.size) from.problem = why
      else problems[g.id] = why
    }
    if (from && (ok.size || !failed.length)) from.open = false
    refreshCards()
  } catch (e) {
    const left = await reread(sent)
    if (left === null) {
      if (from) from.problem = errorText(e)
      else problems[g.id] = errorText(e)
      return
    }
    const kept = new Set(sent.filter((n) => !left.includes(n)))
    if (kept.size) {
      addHecho(
        answered,
        at,
        kept,
        [],
        'La respuesta no llegó, pero quedó guardado. Para deshacerlo, ábrelo desde su cuenta.',
      )
      if (from) from.open = false
    }
    if (left.length) {
      const why = kept.size
        ? `${countText(left.length)} no se guardaron: ${errorText(e)}`
        : errorText(e)
      if (from && !kept.size) from.problem = why
      else problems[g.id] = why
    }
  } finally {
    busy.value = ''
  }
}

async function undo(h) {
  if (h.busy) return
  const entry = hechos.find((x) => x.key === h.key)
  entry.busy = true
  entry.problem = ''
  try {
    const page = await porExplicarApi('deshacer', {
      company: data.value.company,
      polizas: entry.journals,
    })
    paint(page.estado)
    hechos.splice(hechos.indexOf(entry), 1)
    refreshCards()
  } catch (e) {
    entry.problem = errorText(e)
  } finally {
    entry.busy = false
  }
}

function spent(done) {
  paint(done.estado)
  cash.text = `Listo: ${fmt(done.amount)} en efectivo, en tus libros.`
  cash.journal = done.journal
  refreshCards()
}

function counted(done) {
  paint(done.estado)
  const left = data.value.efectivo?.find((c) => c.label === done.label)
  cash.text = left
    ? `Listo: ${done.label} queda en ${fmt(left.balance)}.`
    : 'Listo: conteo guardado.'
  cash.journal = done.journal || ''
  refreshCards()
}

async function undoCash() {
  if (cash.busy) return
  cash.busy = true
  try {
    const page = await porExplicarApi('deshacer_efectivo', {
      company: data.value.company,
      poliza: cash.journal,
    })
    paint(page.estado)
    cash.text = 'Deshecho: el efectivo vuelve a como estaba.'
    cash.journal = ''
    refreshCards()
  } catch (e) {
    cash.text = errorText(e)
  } finally {
    cash.busy = false
  }
}

function pairOf(r, key) {
  return {
    movimiento: r.name,
    doctype: key === 'ya' ? r.entry.doctype : r.invoice.doctype,
    name: key === 'ya' ? r.entry.name : r.invoice.name,
  }
}

function noteOf(result, key) {
  if (key === 'ya')
    return result.already
      ? 'Ya estaba ligado.'
      : 'Ligado: tus saldos no cambian.'
  return result.already
    ? 'Ya estaba registrado: no se hizo otro pago.'
    : 'Pago registrado y ligado.'
}

async function linkOrPay(rows, key) {
  if (busy.value) return
  busy.value = key
  const list = lists[key]
  Object.assign(list, emptyList(), { done: list.done })
  const pares = rows.map((r) => pairOf(r, key))
  try {
    const done = await porExplicarApi(key === 'ya' ? 'ligar' : 'pagar', {
      company: data.value.company,
      pares,
    })
    paint(done.estado)
    const results = new Map((done.results || []).map((r) => [r.name, r]))
    const ok = rows.filter((r) => results.get(r.name)?.ok)
    const failed = [...results.values()].filter((r) => !r.ok)
    list.done = [
      ...list.done,
      ...ok.map((row) => ({ row, note: noteOf(results.get(row.name), key) })),
    ]
    // a row an earlier tap (or someone else) already did is reported, never undone from here
    const made = ok.filter((r) => !results.get(r.name).already)
    const n = made.length
    const before = ok.length - n
    const parts = []
    if (n)
      parts.push(
        key === 'ya'
          ? `Listo: ${countText(n)} ligado${n === 1 ? '' : 's'}.`
          : `Listo: ${n === 1 ? '1 pago registrado' : `${n} pagos registrados`}. Las facturas quedan pagadas y los movimientos explicados.`,
      )
    if (before)
      parts.push(
        before === 1
          ? 'Uno ya estaba hecho: no se registró otra vez.'
          : `${before} ya estaban hechos: no se registraron otra vez.`,
      )
    list.text = parts.join(' ')
    if (failed.length)
      list.problem = `${failed.length === 1 ? '1 no se pudo' : `${failed.length} no se pudieron`}: ${failed[0].message}`
    list.pairs = made.map((r) =>
      key === 'ya'
        ? pairOf(r, key)
        : {
            movimiento: r.name,
            doctype: 'Payment Entry',
            name: results.get(r.name).payment,
          },
    )
    list.cancel = key === 'facturas'
    list.canUndo = list.pairs.length > 0
    refreshCards()
  } catch (e) {
    const sent = rows.map((r) => r.name)
    const left = await reread(sent)
    if (left === null) {
      list.problem = errorText(e)
      return
    }
    const kept = rows.filter((r) => !left.includes(r.name))
    list.done = [
      ...list.done,
      ...kept.map((row) => ({
        row,
        note: 'La respuesta no llegó, pero quedó guardado.',
      })),
    ]
    if (left.length) list.problem = errorText(e)
  } finally {
    busy.value = ''
  }
}

async function undoList(key) {
  const list = lists[key]
  if (list.busy) return
  list.busy = true
  list.problem = ''
  try {
    const page = await porExplicarApi('deshacer_ligados', {
      company: data.value.company,
      pares: list.pairs,
      cancelar: list.cancel ? 1 : 0,
    })
    paint(page.estado)
    const undone = new Set(list.pairs.map((p) => p.movimiento))
    Object.assign(list, emptyList(), {
      done: list.done.filter((d) => !undone.has(d.row.name)),
      text: 'Deshecho: esos movimientos vuelven a estar por explicar.',
    })
    refreshCards()
  } catch (e) {
    list.problem = errorText(e)
  } finally {
    list.busy = false
  }
}

function reset() {
  hechos.splice(0)
  for (const k of Object.keys(problems)) delete problems[k]
  for (const key of LISTS) Object.assign(lists[key], emptyList())
  Object.assign(cash, { text: '', journal: '', busy: false })
}

watch(
  () => route.query.empresa,
  () => {
    reset()
    load()
  },
  { immediate: true },
)
</script>
