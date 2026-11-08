<template>
  <!-- One bank login (Bancos conectados): the institution owns the header,
       its state and the one step that settles it in the hero, then the
       accounts it brings with the Bank Account each feeds, the movements
       that wait for a decision, and the rest of its actions. Everything a
       manager does here is the connector's own endpoint; anyone else reads
       it and is told who can act. -->
  <div
    class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-bancos-conexion
  >
    <AppBar
      :back="pane ? false : backTo"
      back-label="Volver a Bancos"
      context="Bancos"
      :title="conexion?.title || 'Conexión'"
      :bell="!pane"
      :stack="false"
    >
      <template v-if="pane" #actions>
        <RouterLink
          :to="backTo"
          class="flex size-12 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
          aria-label="Cerrar conexión"
          title="Cerrar conexión"
        >
          <span class="lucide-x size-6" aria-hidden="true" />
        </RouterLink>
      </template>
    </AppBar>

    <div
      v-if="loadError"
      role="alert"
      class="mx-4 my-3 space-y-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
    >
      <p>{{ loadError }}</p>
      <Button label="Reintentar" @click="load()" />
    </div>
    <div
      v-else-if="!conexion"
      role="status"
      aria-label="Cargando conexión…"
      class="space-y-3 px-4 py-4"
    >
      <div class="h-28 animate-pulse rounded-7 bg-surface-gray-2" />
      <div
        v-for="n in 3"
        :key="n"
        class="h-16 animate-pulse rounded-7 bg-surface-gray-2"
      />
    </div>

    <template v-else>
      <!-- Hero: what state the login is in, why, and its next step. -->
      <section
        class="px-4 pb-3 pt-2"
        aria-label="Estado"
        data-bancos-conexion-hero
      >
        <p class="text-sm text-ink-gray-6">{{ conexion.kind_word }}</p>
        <p
          class="title-face text-2xl font-semibold"
          :class="
            conexion.tone === 'needs' ? 'text-ink-amber-8' : 'text-ink-gray-9'
          "
          data-bancos-conexion-estado
        >
          {{ conexion.word }}
        </p>
        <p v-if="conexion.detail" class="mt-1 text-base text-ink-gray-8">
          {{ conexion.detail }}
        </p>
        <p v-if="refreshed" class="mt-1 text-sm text-ink-gray-6">
          {{ refreshed }}
        </p>
        <p v-if="conexion.asks_code" class="text-sm text-ink-gray-6">
          Este banco pide un código cada vez que sincronizas.
        </p>

        <div v-if="label" class="mt-3 space-y-2">
          <template v-if="can.conectar">
            <Button
              variant="solid"
              class="min-h-11 w-full sm:w-auto"
              :label="label"
              :loading="step.busy.value"
              :disabled="!!ready"
              data-bancos-conexion-paso
              @click="
                conexion.step === 'disconnect'
                  ? askDisconnect()
                  : step.run(conexion)
              "
            />
            <p v-if="ready" class="text-sm text-ink-gray-6">{{ ready }}</p>
          </template>
          <p v-else class="text-sm text-ink-gray-6" data-bancos-conexion-pide>
            {{ askText(conexion) }}
          </p>
          <p
            v-if="step.problem.value"
            role="alert"
            class="rounded-6 bg-surface-red-1 p-3 text-sm text-ink-red-7"
          >
            {{ step.problem.value }}
          </p>
        </div>

        <!-- The SAT login: its invoices go to Contador once, by choice. -->
        <div
          v-if="conexion.kind === 'Tax' && conexion.status === 'Connected'"
          class="mt-3 flex flex-wrap items-center gap-2"
          data-bancos-conexion-sat
        >
          <span
            v-if="conexion.feeds_contador"
            class="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-surface-green-2 px-4 text-sm font-medium text-ink-green-8"
          >
            <span class="lucide-check-check size-4" aria-hidden="true" />
            Sus facturas llegan a Contador
          </span>
          <Button
            v-else-if="can.conectar"
            class="min-h-11"
            label="Enviar sus facturas a Contador"
            :loading="fiscalBusy"
            @click="linkFiscal(0)"
          />
        </div>
      </section>

      <!-- Accounts: each one feeds a Bank Account, or waits for one. -->
      <section
        v-if="cuentas.length"
        class="mt-2"
        aria-label="Cuentas"
        data-bancos-conexion-cuentas
      >
        <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-7">Cuentas</h2>
        <ul class="divide-y divide-outline-gray-1">
          <!-- A linked account opens its Bank Account; an unlinked one (or one
               Contador stopped taking) is itself the «Enlazar» button for a
               manager. -->
          <li
            v-for="account in cuentas"
            :key="account.name"
            :data-syncfy-account="account.name"
          >
            <ListRow
              :title="syncfyAccountTitle(account, conexion)"
              :subtitle="accountLine(account)"
              :subtitle-lines="2"
              :meta="
                account.balance === null
                  ? ''
                  : money(account.balance, account.currency || 'MXN')
              "
              :icon="
                account.type === 'Credit Card'
                  ? 'lucide-credit-card'
                  : 'lucide-wallet'
              "
              :to="
                account.cuenta
                  ? { name: 'BancoCuenta', params: { cuenta: account.cuenta } }
                  : undefined
              "
              :data-bancos-enlazar-abrir="
                linkable(account) ? account.name : undefined
              "
              v-on="linkable(account) ? { click: () => openLink(account) } : {}"
            >
              <template v-if="linkable(account)" #trailing>
                <span class="text-sm font-medium text-ink-blue-link">
                  Enlazar
                </span>
              </template>
            </ListRow>
          </li>
        </ul>
        <p
          v-if="unlinked && !can.conectar"
          class="px-4 pt-2 text-sm text-ink-gray-6"
        >
          Quien administra Bancos elige a qué cuenta llegan sus movimientos.
        </p>
      </section>

      <!-- Movements that wait for a decision (Syncfy Transaction Held / Removed). -->
      <section
        v-if="revisar.length"
        class="mt-4"
        aria-label="Por revisar"
        data-bancos-conexion-revisar
      >
        <h2
          class="flex items-baseline gap-2 px-4 pb-1 text-sm font-semibold text-ink-gray-7"
        >
          <span>Por revisar</span>
          <span class="num font-medium text-ink-gray-6">{{
            revisar.length
          }}</span>
        </h2>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="row in revisar"
            :key="row.name"
            class="px-4 py-3"
            :data-syncfy-movimiento="row.name"
          >
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <p class="break-words text-base text-ink-gray-9">
                  {{ row.title }}
                </p>
                <p class="text-sm text-ink-gray-6">
                  {{ dayText(row.date)
                  }}<template v-if="row.detail">, {{ row.detail }}</template>
                </p>
              </div>
              <p
                class="num whitespace-nowrap text-base font-semibold"
                :class="amountTone(row.amount)"
              >
                {{ signedMoney(row.amount, row.currency || 'MXN') }}
              </p>
            </div>
            <p v-if="row.reason" class="mt-1 text-sm text-ink-amber-8">
              {{ row.reason }}
            </p>
            <!-- Contador held it: its review and its retry are Contador's,
                 for whoever holds its fiscal role. -->
            <template v-if="row.contador && !row.removed">
              <a
                v-if="can.contador"
                href="/contador/bancos"
                class="press mt-2 inline-flex min-h-11 items-center rounded-full bg-surface-gray-2 px-4 text-base font-medium text-ink-gray-8"
                data-bancos-revisar-contador
                >Revisar en Contador</a
              >
              <p
                v-else
                class="mt-1 text-sm text-ink-gray-6"
                data-bancos-revisar-contador-pide
              >
                Se revisa en Contador. Pide al área de contabilidad que lo vea.
              </p>
            </template>
            <div v-else-if="can.conectar" class="mt-2 flex flex-wrap gap-2">
              <Button
                v-if="!row.removed"
                class="min-h-11"
                label="Reintentar"
                :loading="rowBusy === `retry:${row.name}`"
                :disabled="!!rowBusy"
                @click="decide(row, 'retry')"
              />
              <Button
                class="min-h-11"
                variant="ghost"
                :label="row.removed ? 'Ya lo revisé' : 'No importarlo'"
                :loading="rowBusy === `skip:${row.name}`"
                :disabled="!!rowBusy"
                @click="decide(row, 'skip')"
              />
            </div>
          </li>
        </ul>
      </section>

      <!-- The rest of the login's actions, managers only. -->
      <section
        v-if="can.conectar && conexion.status !== 'Disconnected'"
        class="mt-6"
        aria-label="Más acciones"
        data-bancos-conexion-acciones
      >
        <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-7">
          Más acciones
        </h2>
        <ul class="divide-y divide-outline-gray-1">
          <li v-if="conexion.status !== 'Retired'">
            <ListRow
              title="Cambiar usuario o contraseña"
              subtitle="Se abre la ventana de Syncfy sobre esta conexión"
              :subtitle-lines="2"
              icon="lucide-key-round"
              @click="step.run(conexion, 'update')"
            />
          </li>
          <li>
            <ListRow
              title="Traer lo que ya descargó Syncfy"
              subtitle="Sin entrar otra vez al banco"
              icon="lucide-download"
              @click="pull"
            />
          </li>
          <li>
            <ListRow
              title="Desconectar"
              subtitle="Syncfy borra esta conexión; lo que ya está en Muelle se queda"
              :subtitle-lines="2"
              icon="lucide-x"
              @click="askDisconnect"
            />
          </li>
        </ul>
      </section>
      <div class="h-24 flex-none lg:h-10" aria-hidden="true" />
    </template>

    <EnlazarSheet
      v-if="linkAccount"
      v-model:open="linkOpen"
      :account="linkAccount"
      :conexion="conexion"
      @linked="load({ quiet: true })"
    />
    <ConfirmSheet
      v-if="confirmMounted"
      v-model:open="confirmOpen"
      :copy="confirmCopy"
      :busy="confirmBusy"
      :error="confirmError"
      @confirm="confirmAction"
    />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button, toast } from 'frappe-ui'
import { AppBar, ListRow } from '@/components/ui'
import { useLiveList } from '@/composables/liveList'
import { formatDate } from '@/utils/display'
import { amountTone, bancosApi, errorText, money, signedMoney } from './bancos'
import {
  LIVE_CONEXIONES,
  askText,
  movementsWaiting,
  readyText,
  refreshedText,
  stepLabel,
  syncfy,
  syncfyAccountTitle,
  waitingText,
} from './conectados'
import { useConexionStep } from './useConexionStep'

const EnlazarSheet = defineAsyncComponent(() => import('./EnlazarSheet.vue'))
const ConfirmSheet = defineAsyncComponent(
  () => import('@/components/documentos/ConfirmSheet.vue'),
)

const props = defineProps({
  /** The Syncfy Connection's name (its credential id), from the route. */
  name: { type: String, required: true },
  pane: { type: Boolean, default: false },
})
const route = useRoute()
const data = ref(null)
const loadError = ref('')
const rowBusy = ref('')
const fiscalBusy = ref(false)
const linkOpen = ref(false)
const linkAccount = ref(null)
const confirmOpen = ref(false)
// The sheet mounts on its first open and stays, so it can close with its motion.
const confirmMounted = ref(false)
watch(confirmOpen, (open) => open && (confirmMounted.value = true))
const confirmBusy = ref(false)
const confirmError = ref('')
const confirmKind = ref('disconnect')
const fiscalMessage = ref('')

const conexion = computed(() => data.value?.conexion || null)
const can = computed(() => data.value?.can || {})
const cuentas = computed(() =>
  (conexion.value?.accounts || []).filter((a) => a.type !== 'Tax'),
)
const revisar = computed(() => data.value?.revisar || [])
const unlinked = computed(() =>
  cuentas.value.some((a) => !a.linked || a.relink),
)
const label = computed(() => stepLabel(conexion.value))
const ready = computed(() => readyText(conexion.value))
const refreshed = computed(() =>
  conexion.value?.status === 'Disconnected'
    ? ''
    : refreshedText(conexion.value),
)
const backTo = computed(() => ({
  name: 'Bancos',
  query: route.query.empresa ? { empresa: route.query.empresa } : {},
}))
const step = useConexionStep(() => load({ quiet: true }))

const confirmCopy = computed(() =>
  confirmKind.value === 'fiscal'
    ? {
        title: 'Cambiar las facturas de Contador',
        message: fiscalMessage.value,
        confirm: 'Usar esta conexión',
        tone: 'primary',
      }
    : {
        title: `¿Desconectar ${conexion.value?.title || ''}?`,
        message:
          'Syncfy borra esta conexión y deja de traer movimientos. Los movimientos y documentos que ya están en Muelle se quedan. Para volver a conectarla tendrás que entrar otra vez al banco.',
        confirm: 'Desconectar',
        tone: 'danger',
      },
)

function linkable(account) {
  return (!account.linked || !!account.relink) && !!can.value.conectar
}
function accountLine(account) {
  if (account.relink) return 'Contador dejó de recibirla, vuelve a enlazarla'
  if (!account.linked) {
    const held = Number(account.waiting?.sin_enlazar) || 0
    return held ? `Sin enlazar, ${movementsWaiting(held)}` : 'Sin enlazar'
  }
  const waiting = waitingText({ revisar: account.waiting?.revisar })
  const feeds = account.cuenta_label
    ? `Llega a ${account.cuenta_label}${account.contador ? ' (Contador)' : ''}`
    : 'Enlazada'
  return waiting ? `${feeds}, ${waiting}` : feeds
}
function dayText(day) {
  const text = formatDate(day, { weekday: true })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

let sequence = 0
async function load({ quiet = false } = {}) {
  const mine = ++sequence
  if (!quiet) loadError.value = ''
  try {
    const result = await bancosApi('conexion', { conexion: props.name })
    if (mine === sequence) data.value = result
  } catch (error) {
    if (mine === sequence && !quiet) loadError.value = errorText(error)
  }
}
watch(
  () => props.name,
  () => {
    data.value = null
    load()
  },
  { immediate: true },
)
// The poller and Syncfy's webhook move the login; the page follows them.
useLiveList(LIVE_CONEXIONES, () => load({ quiet: true }), {
  minIntervalMs: 5000,
})

function askDisconnect() {
  confirmKind.value = 'disconnect'
  confirmError.value = ''
  confirmOpen.value = true
}

function openLink(account) {
  linkAccount.value = account
  linkOpen.value = true
}

async function decide(row, action) {
  if (rowBusy.value) return
  rowBusy.value = `${action}:${row.name}`
  try {
    if (action === 'retry') {
      await syncfy.retryMovement(row.name)
      toast.success('Lo intentamos de nuevo.')
    } else {
      await syncfy.skipMovement(row.name)
      toast.success(row.removed ? 'Marcado como revisado.' : 'No se importa.')
    }
    data.value.revisar = data.value.revisar.filter((r) => r.name !== row.name)
    load({ quiet: true })
  } catch (error) {
    toast.error(errorText(error))
  } finally {
    rowBusy.value = ''
  }
}

async function pull() {
  try {
    await syncfy.pull(conexion.value.name)
    toast.success('Trayendo lo que Syncfy ya descargó. Llega en unos minutos.')
  } catch (error) {
    toast.error(errorText(error))
  }
}

async function linkFiscal(replace) {
  if (fiscalBusy.value) return
  fiscalBusy.value = true
  try {
    const answer = await syncfy.linkFiscal(conexion.value.name, replace)
    if (answer?.needs_replace) {
      // Contador already reads another source: one question, its own words.
      fiscalMessage.value = answer.message || ''
      confirmKind.value = 'fiscal'
      confirmError.value = ''
      confirmOpen.value = true
      return
    }
    toast.success('Contador ya lee las facturas de esta empresa desde Syncfy.')
    load({ quiet: true })
  } catch (error) {
    toast.error(errorText(error))
  } finally {
    fiscalBusy.value = false
  }
}

async function confirmAction() {
  if (confirmKind.value === 'fiscal') {
    confirmOpen.value = false
    return linkFiscal(1)
  }
  confirmBusy.value = true
  confirmError.value = ''
  try {
    await syncfy.disconnect(conexion.value.name)
    toast.success('Desconectada. Lo que ya está en Muelle se queda.')
    confirmOpen.value = false
    load({ quiet: true })
  } catch (error) {
    confirmError.value = errorText(error)
  } finally {
    confirmBusy.value = false
  }
}

defineExpose({ reload: load })
</script>
