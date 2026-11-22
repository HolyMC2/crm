<template>
  <!-- Tickets de compra in Por explicar (crm docs/DINERO_EN_ORDEN.md §3f): the
       store tickets that came by mail or photo, each with its store's answer;
       one tap books it as cash spent, and the result stays where it was tapped
       with its undo. The camera and the settings sit beside the title. -->
  <section
    v-if="tickets"
    class="mx-4 mt-6 flex-none"
    aria-label="Tickets de compra"
    data-tickets
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-base font-medium text-ink-gray-9">
          Tickets por registrar
        </h2>
        <p class="mt-0.5 text-sm text-ink-gray-6" data-tickets-resumen>
          {{ headline }}
        </p>
      </div>
      <div class="-mr-2 flex flex-none items-center">
        <label
          class="press grid size-11 cursor-pointer place-items-center rounded-full text-ink-gray-7"
          aria-label="Foto del ticket"
          title="Foto del ticket"
        >
          <span class="lucide-camera size-5" aria-hidden="true" />
          <input
            class="sr-only"
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            data-tickets-foto
            @change="photo"
          />
        </label>
        <button
          type="button"
          class="press grid size-11 place-items-center rounded-full text-ink-gray-7"
          aria-label="Ajustes de tickets"
          title="Ajustes de tickets"
          data-tickets-ajustes-abrir
          @click="settingsOpen = true"
        >
          <span class="lucide-settings-2 size-5" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div
      v-if="!waiting.length && !hechos.length && !tickets.resumen?.buzones"
      class="mt-3 rounded-6 bg-surface-gray-1 p-3"
      data-tickets-invitacion
    >
      <p class="text-sm text-ink-gray-8">
        ¿Te dan ticket por correo? Enciende el buzón donde llegan y cada ticket
        aparece aquí, listo para registrarse en un toque. O toma la foto del
        ticket de papel.
      </p>
      <Button
        class="mt-2 min-h-11"
        variant="subtle"
        label="Leer tickets de mi correo"
        @click="settingsOpen = true"
      />
    </div>

    <ul
      v-if="items.length"
      class="mt-1 divide-y divide-outline-gray-1 border-y border-outline-gray-1"
      data-tickets-lista
    >
      <li
        v-for="item in items"
        :key="item.key"
        :data-ticket="item.ticket?.name"
      >
        <HechoPorExplicar
          v-if="item.hecho"
          :item="item.hecho"
          @undo="undo(item.hecho)"
        />
        <div v-else class="flex items-start gap-3 py-3">
          <button
            type="button"
            class="press min-w-0 flex-1 text-left"
            :data-ticket-abrir="item.ticket.name"
            @click="openTicket(item.ticket)"
          >
            <span class="flex items-start justify-between gap-3">
              <span class="min-w-0 break-words text-base text-ink-gray-9">{{
                item.ticket.tienda
              }}</span>
              <span class="num whitespace-nowrap text-base text-ink-gray-9">{{
                fmt(item.ticket.total)
              }}</span>
            </span>
            <span class="block text-sm text-ink-gray-6">{{
              ticketDetail(item.ticket)
            }}</span>
            <span
              class="mt-0.5 block text-sm"
              :class="
                oneTap(item.ticket) ? 'text-ink-gray-8' : 'text-ink-gray-6'
              "
              >{{ suggestionText(item.ticket, names) }}</span
            >
            <span
              v-if="problems[item.ticket.name]"
              role="alert"
              class="mt-1 block text-sm text-ink-red-7"
              >{{ problems[item.ticket.name] }}</span
            >
          </button>
          <Button
            v-if="data?.can_book && oneTap(item.ticket)"
            class="min-h-11 flex-none"
            variant="subtle"
            label="Registrar"
            :loading="busy.has(item.ticket.name)"
            :data-ticket-registrar="item.ticket.name"
            @click="book([item.ticket])"
          />
        </div>
      </li>
    </ul>

    <Button
      v-if="data?.can_book && quick.length > 1"
      class="mt-3 min-h-11 w-full"
      variant="solid"
      :label="`Registrar los ${quick.length} con su cuenta`"
      :loading="busy.has('todos')"
      data-tickets-todos
      @click="book(quick, 'todos')"
    />

    <div
      v-if="offer"
      class="mt-3 rounded-6 bg-surface-gray-1 p-3"
      role="status"
      data-tickets-oferta
    >
      <p class="text-sm text-ink-gray-8">{{ offer.text }}</p>
      <p v-if="offer.problem" role="alert" class="mt-1 text-sm text-ink-red-7">
        {{ offer.problem }}
      </p>
      <div v-if="!offer.done" class="mt-2 flex flex-wrap gap-2">
        <Button
          class="min-h-11"
          variant="solid"
          :label="
            offer.stop ? 'Dejar de registrarlos solos' : 'Sí, regístralos solos'
          "
          :loading="offer.busy"
          data-tickets-oferta-si
          @click="answerOffer()"
        />
        <Button
          class="min-h-11"
          variant="subtle"
          label="Ahora no"
          @click="offer = null"
        />
      </div>
    </div>

    <details v-if="solos.length" class="mt-3" data-tickets-solos>
      <summary
        class="fold-summary press flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm text-ink-gray-7"
      >
        <span
          class="lucide-chevron-right size-4 transition-transform"
          aria-hidden="true"
        />
        {{ solosText }}
      </summary>
      <ul class="divide-y divide-outline-gray-1">
        <li
          v-for="t in solos"
          :key="t.name"
          class="flex items-center justify-between gap-3 py-2 text-sm"
        >
          <span class="min-w-0">
            <span class="block break-words text-ink-gray-9"
              >{{ t.tienda }} {{ fmt(t.total) }}</span
            >
            <span class="block text-ink-gray-6"
              >{{ names[t.cuenta] || t.cuenta }} · {{ whenText(t.fecha) }}</span
            >
          </span>
          <Button
            class="min-h-11 flex-none"
            variant="subtle"
            label="Deshacer"
            :loading="busy.has(t.name)"
            @click="undoAlone(t)"
          />
        </li>
      </ul>
    </details>

    <details
      v-if="tickets.esperando_banco?.length"
      class="mt-1"
      data-tickets-banco
    >
      <summary
        class="fold-summary press flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm text-ink-gray-7"
      >
        <span
          class="lucide-chevron-right size-4 transition-transform"
          aria-hidden="true"
        />
        {{ ticketsCount(tickets.esperando_banco.length) }} con tarjeta esperan
        su cargo del banco
      </summary>
      <ul class="divide-y divide-outline-gray-1">
        <li
          v-for="t in tickets.esperando_banco"
          :key="t.name"
          class="flex items-center justify-between gap-3 py-2 text-sm"
        >
          <span class="min-w-0">
            <span class="block break-words text-ink-gray-9"
              >{{ t.tienda }} {{ fmt(t.total) }}</span
            >
            <span class="block text-ink-gray-6">{{ ticketDetail(t) }}</span>
          </span>
          <Button
            class="min-h-11 flex-none"
            variant="ghost"
            label="Fue en efectivo"
            @click="openTicket({ ...t, forma_pago: 'Cash' })"
          />
        </li>
      </ul>
    </details>

    <TicketSheet
      v-if="sheet.mounted"
      v-model:open="sheet.open"
      :ticket="sheet.ticket"
      :reading="sheet.reading"
      :problem="sheet.problem"
      :data="data"
      :names="names"
      @done="sheetDone"
      @retake="photo"
    />
    <TicketsAjustesSheet
      v-if="settingsOpen || settingsMounted"
      v-model:open="settingsOpen"
      :data="data"
      :names="names"
      @changed="emit('reread')"
    />
  </section>
</template>

<script setup>
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Button } from 'frappe-ui'
import HechoPorExplicar from '@/components/dinero/HechoPorExplicar.vue'
import { errorText, money } from '@/components/bancos/bancos'
import { blobBase64 } from '@/components/captura/scanApi'
import { prepareImage } from '@/components/ui/imageFiles'
import {
  aloneOffer,
  doneTitle,
  effectText,
  oneTap,
  quickOnes,
  suggestionText,
  tapLine,
  ticketDetail,
  ticketsApi,
  ticketsCount,
  whenText,
} from '@/components/dinero/tickets'

const TicketSheet = defineAsyncComponent(
  () => import('@/components/dinero/TicketSheet.vue'),
)
const TicketsAjustesSheet = defineAsyncComponent(
  () => import('@/components/dinero/TicketsAjustesSheet.vue'),
)

const props = defineProps({
  /** Por explicar's page (its `tickets` part from doco tickets.estado). */
  data: { type: Object, default: null },
  /** {account: label} of every account the page names. */
  names: { type: Object, default: () => ({}) },
})
// paint: a write's answer (the whole page); reread: something changed outside the page's data
const emit = defineEmits(['paint', 'reread'])
const route = useRoute()

const hechos = reactive([])
const problems = reactive({})
const busy = reactive(new Set())
const offer = ref(null)
const settingsOpen = ref(false)
const settingsMounted = ref(false)
const sheet = reactive({
  mounted: false,
  open: false,
  ticket: null,
  reading: false,
  problem: '',
})
let seq = 0

const tickets = computed(() => props.data?.tickets || null)
const fmt = (amount) => money(amount, props.data?.currency)
const waiting = computed(() => tickets.value?.por_registrar || [])
const quick = computed(() => quickOnes(waiting.value))
const solos = computed(() =>
  (tickets.value?.hechos || []).filter((t) => t.registrado_solo),
)
const solosText = computed(() => {
  const n = solos.value.length
  const total = solos.value.reduce((s, t) => s + Number(t.total || 0), 0)
  return `${n === 1 ? '1 se registró solo' : `${n} se registraron solos`} esta semana (${fmt(total)})`
})
const headline = computed(() => {
  const r = tickets.value?.resumen || {}
  if (!r.count)
    return 'Nada por registrar: los tickets de tu correo y tus fotos llegan aquí.'
  return `${ticketsCount(r.count)} · ${fmt(r.total)}. ${tapLine(r.count, quickOnes(waiting.value).length)}`
})
// each tap's result sits where its ticket was
const items = computed(() => {
  const list = waiting.value.map((t) => ({ key: t.name, ticket: t }))
  for (const h of [...hechos].sort((a, b) => a.at - b.at))
    list.splice(Math.min(h.at, list.length), 0, { key: h.key, hecho: h })
  return list
})

watch(settingsOpen, (open) => {
  if (open) settingsMounted.value = true
})

// a bell or a link opens one ticket: /bancos/por-explicar?ticket=TCK-…
watch(
  () => [route.query.ticket, props.data?.company],
  async ([name, company]) => {
    if (!name || !company || sheet.open) return
    const listed = waiting.value.find((t) => t.name === name)
    if (listed) return openTicket(listed)
    try {
      openTicket(await ticketsApi('uno', { company, ticket: name }))
    } catch {
      // the link is old: the list shows what waits
    }
  },
  { immediate: true },
)

function openTicket(t) {
  Object.assign(sheet, {
    mounted: true,
    open: true,
    ticket: t,
    reading: false,
    problem: '',
  })
}

function indexOf(name) {
  return Math.max(
    0,
    items.value.findIndex((i) => i.ticket?.name === name),
  )
}

function addHecho(kind, t, out, at) {
  const row = (out?.tickets || []).find((r) => r.ticket === t.name) || {}
  const lines = []
  if (kind === 'registrado') {
    const line = effectText(
      t.total,
      t.cuenta || row.cuenta,
      t.caja,
      props.names,
      fmt,
    )
    if (line) lines.push(line.replace(/^Salen/, 'Salieron'))
    if (row.already)
      lines.push('Ya estaba registrado: no se registró otra vez.')
  }
  hechos.push({
    key: `ticket-hecho-${++seq}`,
    at,
    ticket: t.name,
    title: doneTitle(
      kind,
      { ...t, cuenta: t.cuenta || row.cuenta },
      props.names,
      fmt,
    ),
    lines,
    canUndo: !row.already,
    busy: false,
    problem: '',
  })
}

function offerFrom(out) {
  const first = out?.ofrecer_solo?.[0]
  offer.value = first
    ? {
        ...first,
        text: aloneOffer(first, props.names),
        busy: false,
        problem: '',
      }
    : offer.value
}

async function book(list, key = '') {
  const names = list.map((t) => t.name)
  if (!names.length || names.some((n) => busy.has(n))) return
  for (const n of [key, ...names].filter(Boolean)) busy.add(n)
  for (const n of names) delete problems[n]
  const at = Object.fromEntries(names.map((n) => [n, indexOf(n)]))
  try {
    const out = await ticketsApi('registrar', {
      company: props.data.company,
      tickets: list.map((t) => ({ ticket: t.name })),
    })
    emit('paint', out.estado)
    for (const row of out.tickets || []) {
      const t = list.find((x) => x.name === row.ticket)
      if (!t) continue
      if (row.ok)
        addHecho(
          'registrado',
          {
            ...t,
            cuenta: row.cuenta || t.sugerencia?.cuenta,
            caja: t.sugerencia?.caja,
          },
          out,
          at[t.name],
        )
      else problems[t.name] = row.error
    }
    offerFrom(out)
  } catch (e) {
    for (const n of names) problems[n] = errorText(e)
    emit('reread')
  } finally {
    for (const n of [key, ...names].filter(Boolean)) busy.delete(n)
  }
}

function sheetDone({ kind, ticket, out }) {
  if (out?.estado) emit('paint', out.estado)
  if (kind === 'nada') return
  addHecho(kind, ticket, out, indexOf(ticket.name))
  if (kind === 'registrado') {
    if (out.solo === true)
      offer.value = {
        tienda: ticket.tienda,
        done: true,
        text: `Listo: los tickets de ${ticket.tienda} en efectivo se registran solos. Lo cambias en Ajustes de tickets.`,
      }
    else offerFrom(out)
  }
}

async function undo(h) {
  if (h.busy) return
  h.busy = true
  h.problem = ''
  try {
    const out = await ticketsApi('deshacer', {
      company: props.data.company,
      tickets: [h.ticket],
    })
    const row = out.tickets?.[0]
    if (row && !row.ok) {
      h.problem = row.error
      return
    }
    emit('paint', out.estado)
    hechos.splice(hechos.indexOf(h), 1)
  } catch (e) {
    h.problem = errorText(e)
  } finally {
    h.busy = false
  }
}

async function undoAlone(t) {
  if (busy.has(t.name)) return
  busy.add(t.name)
  try {
    const out = await ticketsApi('deshacer', {
      company: props.data.company,
      tickets: [t.name],
    })
    emit('paint', out.estado)
    const row = out.tickets?.[0]
    if (row?.tienda_sola)
      offer.value = {
        tienda: row.tienda_sola,
        stop: true,
        text: `El ticket vuelve a esperar. ¿Dejar de registrar solos los de ${row.tienda_sola}?`,
        busy: false,
        problem: '',
      }
  } catch (e) {
    problems[t.name] = errorText(e)
  } finally {
    busy.delete(t.name)
  }
}

async function answerOffer() {
  const o = offer.value
  if (!o || o.busy) return
  o.busy = true
  o.problem = ''
  try {
    const out = await ticketsApi('regla', {
      company: props.data.company,
      tienda: o.tienda,
      solo: o.stop ? 0 : 1,
    })
    emit('paint', out.estado)
    offer.value = {
      ...o,
      done: true,
      busy: false,
      text: o.stop
        ? `Listo: los tickets de ${o.tienda} vuelven a preguntarte.`
        : `Listo: los tickets de ${o.tienda} en efectivo se registran solos. Lo cambias en Ajustes de tickets.`,
    }
  } catch (e) {
    o.problem = errorText(e)
    o.busy = false
  }
}

async function photo(event) {
  const file = event?.target?.files?.[0]
  if (event?.target) event.target.value = ''
  if (!file || !props.data?.company) return
  Object.assign(sheet, {
    mounted: true,
    open: true,
    ticket: null,
    reading: true,
    problem: '',
  })
  try {
    const light = await prepareImage(file, { keepPng: false })
    const out = await ticketsApi('foto', {
      company: props.data.company,
      file_name: light.name || file.name || 'ticket.jpg',
      content_b64: await blobBase64(light),
    })
    emit('paint', out.estado)
    sheet.ticket = out.ticket
  } catch (e) {
    sheet.problem = errorText(e)
  } finally {
    sheet.reading = false
  }
}
</script>
