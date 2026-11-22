<template>
  <!-- One purchase ticket (crm docs/DINERO_EN_ORDEN.md §3f): what it bought,
       how it was paid, and the answer: cash spent on an account, paid by card
       (its charge explains it), or set aside. What a save books is said before
       the tap. -->
  <BottomSheet
    :open="open"
    :title="title"
    :subtitle="subtitle"
    layer="por-explicar-ticket"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-4 pb-2" data-ticket-sheet>
      <div
        v-if="reading"
        role="status"
        aria-label="Leyendo el ticket…"
        class="space-y-3"
      >
        <p class="flex items-center gap-2 text-sm text-ink-gray-7">
          <span
            class="lucide-sparkles size-4 animate-pulse"
            aria-hidden="true"
          />
          Leyendo el ticket…
        </p>
        <div class="h-16 animate-pulse rounded-6 bg-surface-gray-2" />
        <div class="h-24 animate-pulse rounded-6 bg-surface-gray-2" />
      </div>

      <div v-else-if="!ticket" class="space-y-3" data-ticket-sin-leer>
        <p role="alert" class="text-sm text-ink-red-7">
          {{ problem || 'No se pudo leer el ticket.' }}
        </p>
        <label
          class="press flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-7 border border-dashed border-outline-gray-3 px-4 text-sm text-ink-gray-8"
        >
          <span class="lucide-camera size-5" aria-hidden="true" />
          Tomar otra foto
          <input
            class="sr-only"
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            data-ticket-otra-foto
            @change="emit('retake', $event)"
          />
        </label>
      </div>

      <template v-else>
        <div class="flex items-start gap-3">
          <a
            v-if="isPicture"
            :href="ticket.archivo"
            target="_blank"
            rel="noopener"
            class="press block size-16 flex-none overflow-hidden rounded-6 bg-surface-gray-2"
            aria-label="Ver la foto del ticket"
            title="Ver la foto del ticket"
          >
            <img
              :src="ticket.archivo"
              alt=""
              class="size-full object-cover"
              loading="lazy"
            />
          </a>
          <ul
            v-if="ticket.articulos?.length"
            class="min-w-0 flex-1 space-y-0.5 text-sm text-ink-gray-8"
            aria-label="Lo que compraste"
            data-ticket-articulos
          >
            <li
              v-for="(item, i) in shownItems"
              :key="i"
              class="flex justify-between gap-3"
            >
              <span class="min-w-0 break-words"
                ><template v-if="item.cantidad > 1"
                  >{{ item.cantidad }} × </template
                >{{ item.descripcion }}</span
              >
              <span class="num whitespace-nowrap">{{ fmt(item.importe) }}</span>
            </li>
            <li v-if="hiddenItems" class="text-ink-gray-6">
              Y {{ hiddenItems }} más.
            </li>
          </ul>
          <p v-else class="min-w-0 flex-1 text-sm text-ink-gray-6">
            El ticket no trae los artículos.
          </p>
        </div>

        <p
          v-if="ticket.inusual"
          class="rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
          data-ticket-inusual
        >
          Es mucho más de lo que sueles gastar en {{ ticket.tienda }}: revisa
          que sea tuyo.
        </p>

        <template v-if="!aside.on">
          <div>
            <p class="text-sm font-medium text-ink-gray-7">¿Cómo pagaste?</p>
            <Segmented
              class="mt-2"
              label="¿Cómo pagaste?"
              :model-value="form.way"
              :options="[
                { value: 'efectivo', label: 'Efectivo' },
                { value: 'tarjeta', label: 'Tarjeta' },
              ]"
              @update:model-value="form.way = $event"
            />
            <p
              v-if="form.way === 'tarjeta'"
              class="mt-2 text-sm text-ink-gray-6"
              data-ticket-tarjeta
            >
              Espera su cargo del banco y se explica con él en Por explicar: no
              se registra dos veces. El cargo muestra lo que compraste.
            </p>
          </div>

          <template v-if="form.way === 'efectivo'">
            <div>
              <p class="text-sm font-medium text-ink-gray-7">¿En qué fue?</p>
              <div
                class="mt-2 flex flex-wrap gap-2"
                role="radiogroup"
                aria-label="¿En qué fue?"
              >
                <button
                  v-for="a in quick"
                  :key="a.account"
                  type="button"
                  role="radio"
                  class="press min-h-11 rounded-full px-4 text-sm"
                  :class="
                    form.account === a.account
                      ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                      : 'border border-outline-gray-2 text-ink-gray-8'
                  "
                  :aria-checked="form.account === a.account"
                  :data-ticket-cuenta="a.account"
                  @click="form.account = a.account"
                >
                  {{ a.label }}
                </button>
                <button
                  type="button"
                  class="press min-h-11 rounded-full border border-dashed border-outline-gray-3 px-4 text-sm text-ink-gray-7"
                  :aria-expanded="form.searching"
                  data-ticket-otra-cuenta
                  @click="form.searching = !form.searching"
                >
                  Otra cuenta
                </button>
              </div>
              <div v-if="form.searching" class="mt-2 space-y-2">
                <input
                  v-model="form.query"
                  type="search"
                  autocomplete="off"
                  class="min-h-11 w-full rounded-6 bg-surface-gray-2 px-3 text-base text-ink-gray-9"
                  placeholder="Buscar cuenta"
                  aria-label="Buscar cuenta"
                />
                <ul
                  class="max-h-56 divide-y divide-outline-gray-1 overflow-y-auto"
                >
                  <li v-for="a in found" :key="a.account">
                    <button
                      type="button"
                      class="press flex min-h-11 w-full items-center gap-3 py-2 text-left"
                      :aria-pressed="form.account === a.account"
                      @click="pick(a.account)"
                    >
                      <span
                        class="min-w-0 flex-1 break-words text-base text-ink-gray-9"
                        >{{ a.label }}</span
                      >
                      <span
                        v-if="form.account === a.account"
                        class="lucide-check size-5 text-ink-gray-9"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                  <li v-if="!found.length" class="py-3 text-sm text-ink-gray-6">
                    Ninguna cuenta con ese nombre.
                  </li>
                </ul>
              </div>
            </div>

            <div v-if="cash.length > 1">
              <p class="text-sm font-medium text-ink-gray-7">
                ¿De qué efectivo salió?
              </p>
              <div
                class="mt-2 flex flex-wrap gap-2"
                role="radiogroup"
                aria-label="¿De qué efectivo salió?"
              >
                <button
                  v-for="c in cash"
                  :key="c.account"
                  type="button"
                  role="radio"
                  class="press min-h-11 rounded-full px-4 text-sm"
                  :class="
                    form.cash === c.account
                      ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                      : 'border border-outline-gray-2 text-ink-gray-8'
                  "
                  :aria-checked="form.cash === c.account"
                  :data-ticket-caja="c.account"
                  @click="form.cash = c.account"
                >
                  {{ c.label }}
                </button>
              </div>
            </div>
            <p
              v-else-if="!cash.length"
              class="rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
            >
              No hay una cuenta de efectivo en tus libros. Pide a quien lleva tu
              contabilidad que agregue una (por ejemplo, «Caja fuerte»).
            </p>

            <EtiquetasPicker
              v-model="form.tags"
              :options="data?.etiquetas || []"
              :suggested="ticket.sugerencia?.etiquetas || []"
            />

            <button
              v-if="ticket.ofrecer_solo || ticket.sugerencia?.solo"
              type="button"
              role="switch"
              class="press flex min-h-12 w-full items-center gap-3 text-left"
              :aria-checked="form.alone"
              data-ticket-solos
              @click="form.alone = !form.alone"
            >
              <span class="min-w-0 flex-1">
                <span class="block text-base text-ink-gray-9"
                  >Registrar solos los de {{ ticket.tienda }}</span
                >
                <span class="block text-sm text-ink-gray-6"
                  >Los que lleguen en efectivo, con esta cuenta. Los demás te
                  siguen preguntando.</span
                >
              </span>
              <span
                class="relative h-7 w-12 flex-none rounded-full transition-colors"
                :class="
                  form.alone ? 'bg-[var(--muelle-accent)]' : 'bg-surface-gray-4'
                "
                aria-hidden="true"
              >
                <span
                  class="absolute top-0.5 size-6 rounded-full bg-surface-base shadow transition-transform"
                  :class="form.alone ? 'translate-x-5' : 'translate-x-0.5'"
                />
              </span>
            </button>

            <p
              v-if="effect"
              class="rounded-6 bg-surface-gray-1 p-3 text-sm text-ink-gray-8"
              data-ticket-efecto
            >
              <span class="text-ink-gray-6">Al registrar: </span>{{ effect }}
            </p>
          </template>
        </template>

        <div v-else class="space-y-2" data-ticket-apartar>
          <p class="text-sm font-medium text-ink-gray-7">
            ¿Por qué lo apartas?
          </p>
          <div
            class="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="¿Por qué lo apartas?"
          >
            <button
              v-for="r in REASONS"
              :key="r.key"
              type="button"
              role="radio"
              class="press min-h-11 rounded-full px-4 text-sm"
              :class="
                aside.reason === r.key
                  ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                  : 'border border-outline-gray-2 text-ink-gray-8'
              "
              :aria-checked="aside.reason === r.key"
              @click="aside.reason = r.key"
            >
              {{ r.label }}
            </button>
          </div>
          <p class="text-sm text-ink-gray-6">
            No entra a tus libros. Lo regresas con «Deshacer».
          </p>
        </div>

        <p
          v-if="form.problem"
          role="alert"
          class="text-sm text-ink-red-7"
          data-ticket-problema
        >
          {{ form.problem }}
        </p>
        <p
          v-if="!data?.can_book && !aside.on"
          class="text-sm text-ink-gray-6"
          data-ticket-sin-permiso
        >
          Registrar gastos lo hace quien tenga permiso de contabilidad.
        </p>
      </template>
    </div>
    <template v-if="ticket && !reading" #actions>
      <div class="flex gap-2">
        <Button
          class="min-h-11 flex-1"
          :label="aside.on ? 'Volver' : 'Apartar'"
          data-ticket-apartar-boton
          @click="toggleAside()"
        />
        <Button
          class="min-h-11 flex-1"
          variant="solid"
          :label="action"
          :disabled="!ready"
          :loading="form.busy"
          data-ticket-guardar
          @click="save()"
        />
      </div>
    </template>
  </BottomSheet>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet, Segmented } from '@/components/ui'
import EtiquetasPicker from '@/components/dinero/EtiquetasPicker.vue'
import { errorText, money } from '@/components/bancos/bancos'
import { accountsFor } from '@/components/dinero/porExplicar'
import {
  REASONS,
  effectText,
  ticketsApi,
  whenText,
} from '@/components/dinero/tickets'

const QUICK = 6
const ITEMS = 6

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The ticket as the page shows it (doco tickets._out), or null while it is read. */
  ticket: { type: Object, default: null },
  reading: { type: Boolean, default: false },
  problem: { type: String, default: '' },
  /** Por explicar's page: company, currency, choices, efectivo, etiquetas, can_book. */
  data: { type: Object, default: null },
  /** {account: label} of every account the page names. */
  names: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:open', 'done', 'retake'])

const form = reactive({
  way: 'efectivo',
  account: '',
  cash: '',
  tags: [],
  alone: false,
  searching: false,
  query: '',
  busy: false,
  problem: '',
})
const aside = reactive({ on: false, reason: '' })

const fmt = (amount) => money(amount, props.data?.currency)
const title = computed(() =>
  props.reading ? 'Foto del ticket' : props.ticket?.tienda || 'Ticket',
)
const subtitle = computed(() => {
  const t = props.ticket
  if (!t || props.reading) return ''
  return [fmt(t.total), whenText(t.fecha), t.sucursal]
    .filter(Boolean)
    .join(' · ')
})
const isPicture = computed(() =>
  /\.(jpe?g|png|webp|gif|heic)$/i.test(props.ticket?.archivo || ''),
)
const shownItems = computed(() =>
  (props.ticket?.articulos || []).slice(0, ITEMS),
)
const hiddenItems = computed(() =>
  Math.max(0, (props.ticket?.articulos || []).length - ITEMS),
)
const cash = computed(() => props.data?.efectivo || [])
// the store's account first, then the most used expenses, then the owner's own
const quick = computed(() => {
  const all = [
    ...accountsFor(props.data?.choices, 'gasto'),
    ...accountsFor(props.data?.choices, 'personal').slice(0, 1),
  ]
  const mine = props.ticket?.sugerencia?.cuenta
  const first = mine
    ? [{ account: mine, label: props.names[mine] || mine }]
    : []
  return [...first, ...all.filter((a) => a.account !== mine)].slice(0, QUICK)
})
const found = computed(() =>
  [
    ...accountsFor(props.data?.choices, 'gasto', form.query),
    ...accountsFor(props.data?.choices, 'personal', form.query),
  ].slice(0, 40),
)
const effect = computed(() =>
  effectText(props.ticket?.total, form.account, form.cash, props.names, fmt),
)
const action = computed(() => {
  if (aside.on) return 'Apartar'
  return form.way === 'tarjeta' ? 'Guardar: con tarjeta' : 'Registrar'
})
const ready = computed(() => {
  if (!props.ticket || form.busy) return false
  if (aside.on) return Boolean(aside.reason)
  if (form.way === 'tarjeta') return true
  return Boolean(props.data?.can_book && form.account && form.cash)
})

watch(
  () => [props.open, props.ticket?.name],
  ([open]) => {
    if (!open) return
    const t = props.ticket
    const s = t?.sugerencia || {}
    Object.assign(form, {
      way: t?.forma_pago === 'Card' ? 'tarjeta' : 'efectivo',
      account: s.cuenta || '',
      cash: s.caja || props.data?.tickets?.caja || cash.value[0]?.account || '',
      tags: [...(s.etiquetas || [])],
      alone: Boolean(s.solo),
      searching: false,
      query: '',
      busy: false,
      problem: '',
    })
    Object.assign(aside, { on: false, reason: '' })
  },
  { immediate: true },
)

function pick(account) {
  form.account = account
  form.searching = false
}

function toggleAside() {
  aside.on = !aside.on
  aside.reason = ''
  form.problem = ''
}

async function save() {
  if (!ready.value) return
  form.busy = true
  form.problem = ''
  const t = props.ticket
  const company = props.data.company
  try {
    if (aside.on) {
      const out = await ticketsApi('apartar', {
        company,
        tickets: [t.name],
        motivo: aside.reason,
      })
      return finish('apartado', out)
    }
    if (form.way === 'tarjeta') {
      const out = await ticketsApi('con_tarjeta', {
        company,
        tickets: [t.name],
      })
      return finish('tarjeta', out)
    }
    const out = await ticketsApi('registrar', {
      company,
      tickets: [
        {
          ticket: t.name,
          cuenta: form.account,
          caja: form.cash,
          etiquetas: form.tags,
        },
      ],
    })
    const row = out.tickets?.[0]
    if (!row?.ok) {
      form.problem = row?.error || 'No se pudo registrar.'
      emit('done', { kind: 'nada', ticket: t, out })
      return
    }
    let alone = out
    if (form.alone !== Boolean(t.sugerencia?.solo)) {
      alone = await ticketsApi('regla', {
        company,
        tienda: t.tienda,
        solo: form.alone ? 1 : 0,
        cuenta: form.account,
        caja: form.cash,
        etiquetas: form.tags,
      })
      alone = { ...out, estado: alone.estado, solo: form.alone }
    }
    finish('registrado', alone, { cuenta: form.account, caja: form.cash })
  } catch (e) {
    form.problem = errorText(e)
  } finally {
    form.busy = false
  }
}

function finish(kind, out, extra = {}) {
  const row = out.tickets?.[0]
  if (row && !row.ok) {
    form.problem = row.error || 'No se pudo guardar.'
    emit('done', { kind: 'nada', ticket: props.ticket, out })
    return
  }
  emit('done', { kind, ticket: { ...props.ticket, ...extra }, out })
  emit('update:open', false)
}
</script>
