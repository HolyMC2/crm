<template>
  <!-- How purchase tickets reach Muelle (crm docs/DINERO_EN_ORDEN.md §3f): the
       mailboxes that read them, the cash they come out of, whether a store
       Muelle does not know yet is read by the model, the notice, the stores
       that record their tickets by themselves, and how to turn on each known
       store's mailed ticket. -->
  <BottomSheet
    :open="open"
    title="Tickets de compra"
    subtitle="De dónde llegan y cómo se registran."
    layer="tickets-ajustes"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-6 pb-2" data-tickets-ajustes>
      <div v-if="!setup && !problem" role="status" class="space-y-3">
        <div class="h-12 animate-pulse rounded-6 bg-surface-gray-2" />
        <div class="h-12 animate-pulse rounded-6 bg-surface-gray-2" />
      </div>
      <p v-if="problem" role="alert" class="text-sm text-ink-red-7">
        {{ problem }}
      </p>

      <template v-if="setup">
        <section aria-label="Buzones que leen tickets">
          <h3 class="text-sm font-medium text-ink-gray-7">
            Buzones que leen tickets
          </h3>
          <p class="mt-0.5 text-sm text-ink-gray-6">
            Un ticket que llega a un buzón encendido espera aquí para
            registrarse. Nada cambia en el buzón.
          </p>
          <ul
            v-if="setup.buzones.length"
            class="mt-1 divide-y divide-outline-gray-1"
          >
            <li v-for="b in setup.buzones" :key="b.name">
              <button
                type="button"
                role="switch"
                class="press flex min-h-12 w-full items-center gap-3 py-1 text-left"
                :aria-checked="b.on"
                :disabled="!b.can_edit || busy === b.name"
                :data-tickets-buzon="b.name"
                @click="mailbox(b)"
              >
                <span class="min-w-0 flex-1">
                  <span class="block break-words text-base text-ink-gray-9">{{
                    b.label
                  }}</span>
                  <span class="block text-sm text-ink-gray-6">{{
                    mailboxHint(b)
                  }}</span>
                </span>
                <span
                  class="relative h-7 w-12 flex-none rounded-full transition-colors"
                  :class="
                    b.on ? 'bg-[var(--muelle-accent)]' : 'bg-surface-gray-4'
                  "
                  aria-hidden="true"
                >
                  <span
                    class="absolute top-0.5 size-6 rounded-full bg-surface-base shadow transition-transform"
                    :class="b.on ? 'translate-x-5' : 'translate-x-0.5'"
                  />
                </span>
              </button>
            </li>
          </ul>
          <p
            v-else
            class="mt-2 rounded-6 bg-surface-gray-1 p-3 text-sm text-ink-gray-8"
            data-tickets-sin-buzon
          >
            Muelle todavía no lee ningún buzón tuyo. Conéctalo en Ajustes ›
            Correo electrónico › Cuentas y vuelve aquí para encenderlo.
          </p>
          <p v-if="queued" role="status" class="mt-2 text-sm text-ink-gray-7">
            {{ queued }}
          </p>
        </section>

        <section
          v-if="setup.como_activar?.length"
          aria-label="Cómo te llegan por correo"
        >
          <h3 class="text-sm font-medium text-ink-gray-7">
            Cómo te llegan por correo
          </h3>
          <ul class="mt-1 space-y-3">
            <li
              v-for="s in setup.como_activar"
              :key="s.tienda"
              class="rounded-6 bg-surface-gray-1 p-3"
            >
              <p class="text-base font-medium text-ink-gray-9">
                {{ s.tienda }}
              </p>
              <p class="mt-0.5 text-sm text-ink-gray-8">{{ s.pasos }}</p>
              <a
                v-if="s.url"
                :href="s.url"
                target="_blank"
                rel="noopener"
                class="press mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-gray-9 underline"
              >
                <span class="lucide-external-link size-4" aria-hidden="true" />
                Abrir la página de {{ s.tienda }}
              </a>
            </li>
          </ul>
        </section>

        <section v-if="cash.length > 1" aria-label="Efectivo de los tickets">
          <h3 class="text-sm font-medium text-ink-gray-7">
            ¿De qué efectivo salen?
          </h3>
          <p class="mt-0.5 text-sm text-ink-gray-6">
            Lo que se sugiere para una tienda nueva. Cada tienda recuerda el
            suyo.
          </p>
          <div
            class="mt-2 flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="¿De qué efectivo salen?"
          >
            <button
              v-for="c in cash"
              :key="c.account"
              type="button"
              role="radio"
              class="press min-h-11 rounded-full px-4 text-sm"
              :class="
                setup.caja === c.account
                  ? 'bg-[var(--muelle-accent)] text-[var(--muelle-accent-ink)]'
                  : 'border border-outline-gray-2 text-ink-gray-8'
              "
              :aria-checked="setup.caja === c.account"
              :disabled="!setup.can_edit"
              @click="save({ caja: c.account })"
            >
              {{ c.label }}
            </button>
          </div>
        </section>

        <section v-if="setup.tiendas.length" aria-label="Tiendas">
          <h3 class="text-sm font-medium text-ink-gray-7">Tus tiendas</h3>
          <p class="mt-0.5 text-sm text-ink-gray-6">
            Encendida, una tienda registra sola sus tickets en efectivo de lo de
            siempre. Los demás te preguntan.
          </p>
          <ul class="mt-1 divide-y divide-outline-gray-1">
            <li v-for="s in setup.tiendas" :key="s.name">
              <button
                type="button"
                role="switch"
                class="press flex min-h-12 w-full items-center gap-3 py-1 text-left"
                :aria-checked="Boolean(s.solo)"
                :disabled="busy === s.name || (!s.solo && !s.cuenta)"
                :data-tickets-tienda="s.tienda"
                @click="store(s)"
              >
                <span class="min-w-0 flex-1">
                  <span class="block break-words text-base text-ink-gray-9">{{
                    s.tienda
                  }}</span>
                  <span class="block text-sm text-ink-gray-6">{{
                    s.cuenta
                      ? `${names[s.cuenta] || s.cuenta}${s.caja ? `, de ${names[s.caja] || s.caja}` : ''}`
                      : 'Registra uno para que la tienda sepa su cuenta.'
                  }}</span>
                </span>
                <span
                  class="relative h-7 w-12 flex-none rounded-full transition-colors"
                  :class="
                    s.solo ? 'bg-[var(--muelle-accent)]' : 'bg-surface-gray-4'
                  "
                  aria-hidden="true"
                >
                  <span
                    class="absolute top-0.5 size-6 rounded-full bg-surface-base shadow transition-transform"
                    :class="s.solo ? 'translate-x-5' : 'translate-x-0.5'"
                  />
                </span>
              </button>
            </li>
          </ul>
        </section>

        <section aria-label="Más">
          <button
            type="button"
            role="switch"
            class="press flex min-h-12 w-full items-center gap-3 text-left"
            :aria-checked="!setup.solo_conocidas"
            :disabled="!setup.can_edit || busy === 'ajustes'"
            data-tickets-nuevas
            @click="save({ solo_conocidas: setup.solo_conocidas ? 0 : 1 })"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-base text-ink-gray-9"
                >Leer tickets de otras tiendas</span
              >
              <span class="block text-sm text-ink-gray-6"
                >Muelle lee al momento los de las tiendas que ya conoce. Los de
                otras los lee el asistente, que cuesta una consulta por
                ticket.</span
              >
            </span>
            <span
              class="relative h-7 w-12 flex-none rounded-full transition-colors"
              :class="
                !setup.solo_conocidas
                  ? 'bg-[var(--muelle-accent)]'
                  : 'bg-surface-gray-4'
              "
              aria-hidden="true"
            >
              <span
                class="absolute top-0.5 size-6 rounded-full bg-surface-base shadow transition-transform"
                :class="
                  !setup.solo_conocidas ? 'translate-x-5' : 'translate-x-0.5'
                "
              />
            </span>
          </button>
          <button
            type="button"
            role="switch"
            class="press mt-2 flex min-h-12 w-full items-center gap-3 text-left"
            :aria-checked="Boolean(setup.avisar)"
            :disabled="!setup.can_edit || busy === 'ajustes'"
            data-tickets-avisar
            @click="save({ avisar: setup.avisar ? 0 : 1 })"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-base text-ink-gray-9"
                >Avisarme cuando llegue uno</span
              >
              <span class="block text-sm text-ink-gray-6"
                >Un aviso en la campana por ticket. Apagado, el recordatorio de
                la noche los cuenta.</span
              >
            </span>
            <span
              class="relative h-7 w-12 flex-none rounded-full transition-colors"
              :class="
                setup.avisar ? 'bg-[var(--muelle-accent)]' : 'bg-surface-gray-4'
              "
              aria-hidden="true"
            >
              <span
                class="absolute top-0.5 size-6 rounded-full bg-surface-base shadow transition-transform"
                :class="setup.avisar ? 'translate-x-5' : 'translate-x-0.5'"
              />
            </span>
          </button>
          <p
            v-if="!setup.can_edit"
            class="mt-2 text-sm text-ink-gray-6"
            data-tickets-sin-permiso
          >
            Estos ajustes los cambia el dueño.
          </p>
        </section>
      </template>
    </div>
  </BottomSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { BottomSheet } from '@/components/ui'
import { errorText } from '@/components/bancos/bancos'
import { ticketsApi } from '@/components/dinero/tickets'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** Por explicar's page: company and efectivo. */
  data: { type: Object, default: null },
  names: { type: Object, default: () => ({}) },
})
// changed: the page reads again (a store's switch, a mailbox's first week)
const emit = defineEmits(['update:open', 'changed'])

const setup = ref(null)
const problem = ref('')
const busy = ref('')
const queued = ref('')
const cash = computed(() => props.data?.efectivo || [])

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    problem.value = ''
    queued.value = ''
    try {
      setup.value = await ticketsApi('ajustes', {
        company: props.data?.company,
      })
    } catch (e) {
      problem.value = errorText(e)
    }
  },
  { immediate: true },
)

function mailboxHint(b) {
  if (!b.can_edit) return 'Lo enciende quien administra este buzón.'
  if (b.personal)
    return b.mine ? 'Tuyo: solo tú ves sus tickets.' : 'De otra persona.'
  return 'Del negocio: sus tickets los ve quien ve el dinero.'
}

async function mailbox(b) {
  if (!b.can_edit || busy.value) return
  busy.value = b.name
  problem.value = ''
  try {
    const out = await ticketsApi('buzon', {
      company: props.data.company,
      buzon: b.name,
      on: b.on ? 0 : 1,
    })
    setup.value = out.ajustes
    queued.value = out.queued
      ? `Buscando tickets de la última semana: ${out.queued === 1 ? '1 correo' : `${out.queued} correos`}. Aparecen en un momento.`
      : ''
    emit('changed')
  } catch (e) {
    problem.value = errorText(e)
  } finally {
    busy.value = ''
  }
}

async function store(s) {
  if (busy.value) return
  busy.value = s.name
  problem.value = ''
  try {
    await ticketsApi('regla', {
      company: props.data.company,
      tienda: s.tienda,
      solo: s.solo ? 0 : 1,
    })
    setup.value = await ticketsApi('ajustes', { company: props.data.company })
    emit('changed')
  } catch (e) {
    problem.value = errorText(e)
  } finally {
    busy.value = ''
  }
}

async function save(change) {
  if (!setup.value?.can_edit || busy.value) return
  busy.value = 'ajustes'
  problem.value = ''
  try {
    setup.value = await ticketsApi('ajustes_guardar', {
      company: props.data.company,
      ...change,
    })
  } catch (e) {
    problem.value = errorText(e)
  } finally {
    busy.value = ''
  }
}
</script>
