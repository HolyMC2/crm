<template>
  <!-- One caja: who has it open, what it still needs to open, its device,
       the safe it keeps cash with, its setup and its history. The next step
       is one filled button; the rest sit in the island by the title. Every
       action is the register foundation's command, offered only when the
       server's action list says this worker may take it. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-efectivo-caja
  >
    <AppBar
      :title="caja ? caja.label : 'Caja'"
      :back="back"
      back-label="Cajas"
      :stack="false"
    >
      <template v-if="island.length" #actions>
        <div class="flex rounded-full bg-surface-gray-1 p-0.5">
          <button
            v-for="item in island"
            :key="item.label"
            type="button"
            class="press grid size-10 place-items-center rounded-full text-ink-gray-7"
            :aria-label="item.label"
            :title="item.label"
            @click="item.run()"
          >
            <span :class="[item.icon, 'size-5']" aria-hidden="true" />
          </button>
        </div>
      </template>
    </AppBar>

    <div class="mx-auto w-full max-w-3xl flex-1">
      <div
        v-if="loadError"
        role="alert"
        class="mx-4 my-3 space-y-3 rounded-6 bg-surface-red-1 p-4 text-sm text-ink-red-7"
      >
        <p>{{ loadError }}</p>
        <Button label="Reintentar" @click="load()" />
      </div>
      <div
        v-else-if="!caja"
        role="status"
        aria-label="Cargando caja…"
        class="space-y-3 px-4 py-4"
      >
        <div class="h-36 animate-pulse rounded-7 bg-surface-gray-2" />
        <div
          v-for="n in 3"
          :key="n"
          class="h-12 animate-pulse rounded-7 bg-surface-gray-2"
        />
      </div>
      <template v-else>
        <section
          class="mx-4 mt-2 rounded-8 bg-surface-gray-1 p-4"
          data-efectivo-caja-hero
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-base font-medium text-ink-gray-9">
                {{ shiftLine }}
              </p>
              <p class="mt-1 text-sm text-ink-gray-6">
                {{ caja.store_name }} · {{ caja.register_code }} ·
                {{ caja.mode === 'Cash' ? 'Con efectivo' : 'Sin efectivo' }}
              </p>
            </div>
            <StatusChip
              :label="lifecycle(caja.lifecycle).label"
              :tone="lifecycle(caja.lifecycle).tone"
            />
          </div>
          <p
            v-if="caja.cash?.expected"
            class="num mt-3 text-3xl font-semibold text-ink-gray-9"
          >
            {{ money(caja.cash.expected, caja.cash.currency || 'MXN') }}
            <span class="block text-sm font-normal text-ink-gray-6"
              >Efectivo esperado en el cajón</span
            >
          </p>
          <div class="mt-4">
            <Button
              v-if="next?.run"
              variant="solid"
              size="lg"
              class="w-full"
              :label="next.label"
              data-efectivo-next
              @click="next.run()"
            />
            <a
              v-else-if="next?.href"
              :href="next.href"
              class="press flex min-h-11 w-full items-center justify-center rounded-6 bg-surface-gray-9 px-4 text-base font-medium text-ink-white"
              data-efectivo-next
              >{{ next.label }}</a
            >
            <p
              v-else-if="next?.reason"
              class="text-sm text-ink-gray-7"
              data-efectivo-guard
            >
              {{ next.reason }}
            </p>
          </div>
        </section>

        <section
          v-if="caja.readiness?.length"
          class="mt-5"
          aria-label="Falta para abrir"
          data-efectivo-readiness
        >
          <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-8">
            Falta para abrir
          </h2>
          <ul class="space-y-2 px-4">
            <li
              v-for="item in caja.readiness"
              :key="item.key"
              class="flex gap-3 rounded-7 border border-outline-gray-1 px-4 py-3"
            >
              <span
                class="lucide-circle-alert mt-0.5 size-5 flex-none text-ink-amber-7"
                aria-hidden="true"
              />
              <div class="min-w-0 text-base text-ink-gray-9">
                {{ readinessText(item) }}
                <ul
                  v-if="item.shifts?.length"
                  class="mt-1 text-sm text-ink-gray-6"
                >
                  <li v-for="s in item.shifts" :key="s.name">
                    {{ s.cashier_name }} · {{ formatDateTime(s.opened_at) }}
                  </li>
                </ul>
                <a
                  v-if="item.key === 'custody'"
                  href="/posapp/registers"
                  class="mt-1 block text-sm font-medium underline"
                  >Abrir las cajas en el POS</a
                >
              </div>
            </li>
          </ul>
        </section>

        <section class="mt-5" aria-label="Dispositivo">
          <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-8">
            Dispositivo
          </h2>
          <div class="flex items-center gap-3 px-4 py-2">
            <span
              class="lucide-smartphone size-6 flex-none text-ink-gray-6"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-base text-ink-gray-9">
                {{
                  caja.device
                    ? caja.device.label || 'Dispositivo conectado'
                    : 'Sin dispositivo conectado'
                }}
              </p>
              <p class="truncate text-sm text-ink-gray-6">{{ deviceLine }}</p>
            </div>
            <Button
              v-if="can('connect_device') || can('replace_device')"
              :label="caja.device ? 'Cambiar' : 'Conectar'"
              @click="
                open(caja.device ? replaceDevice(caja) : connectDevice(caja))
              "
            />
          </div>
        </section>

        <section
          v-if="caja.mode === 'Cash' && caja.safe_links"
          class="mt-3"
          aria-label="Caja fuerte"
          data-efectivo-caja-safes
        >
          <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-8">
            Caja fuerte
          </h2>
          <ul class="divide-y divide-outline-gray-1">
            <li
              v-for="link in caja.safe_links"
              :key="link.link"
              class="flex items-center gap-3 px-4 py-2.5"
            >
              <span
                class="lucide-vault size-6 flex-none text-ink-gray-6"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-base text-ink-gray-9">
                  {{ link.safe_title }}
                </p>
                <p class="truncate text-sm text-ink-gray-6">
                  {{ linkLine(link) }}
                </p>
              </div>
              <button
                type="button"
                class="press grid size-10 flex-none place-items-center rounded-full bg-surface-gray-2 text-ink-gray-7"
                :aria-label="`Desvincular ${link.safe_title}`"
                :title="`Desvincular ${link.safe_title}`"
                @click="open(unlinkSafe(caja, link))"
              >
                <span class="lucide-unlink size-5" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <p
            v-if="!caja.safe_links.length"
            class="px-4 py-1 text-sm text-ink-gray-6"
          >
            Su efectivo no pasa por una caja fuerte de la tienda.
          </p>
          <button
            v-if="linkable.length"
            type="button"
            class="press mx-4 mt-1 inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-gray-2 px-4 text-sm font-medium text-ink-gray-8"
            data-efectivo-link-safe
            @click="pickSafe"
          >
            <span class="lucide-link size-4" aria-hidden="true" />
            Vincular caja fuerte
          </button>
        </section>

        <section v-if="settings.length" class="mt-5" aria-label="Configuración">
          <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-8">
            Configuración
          </h2>
          <dl class="divide-y divide-outline-gray-1 px-4">
            <div
              v-for="row in settings"
              :key="row.label"
              class="flex items-baseline justify-between gap-3 py-2.5"
            >
              <dt class="text-sm text-ink-gray-6">{{ row.label }}</dt>
              <dd class="min-w-0 truncate text-right text-base text-ink-gray-9">
                {{ row.value }}
              </dd>
            </div>
          </dl>
        </section>

        <section class="mt-5" aria-label="Actividad">
          <h2 class="px-4 pb-1 text-sm font-semibold text-ink-gray-8">
            Actividad
          </h2>
          <ol class="px-4">
            <li
              v-for="(item, i) in activity"
              :key="item.event_id"
              class="flex gap-3 pb-3"
            >
              <span
                class="mt-1.5 size-2.5 flex-none rounded-full"
                :class="i === 0 ? 'bg-surface-gray-9' : 'bg-surface-gray-4'"
                aria-hidden="true"
              />
              <div class="min-w-0">
                <p class="text-base text-ink-gray-9">
                  {{ activityText(item) }}
                </p>
                <p class="text-sm text-ink-gray-6">
                  {{
                    [item.actor_name, formatDateTime(item.at)]
                      .filter(Boolean)
                      .join(' · ')
                  }}
                </p>
              </div>
            </li>
          </ol>
          <p
            v-if="activityLoaded && !activity.length"
            class="px-4 text-sm text-ink-gray-6"
          >
            Sin movimientos todavía.
          </p>
          <button
            v-if="activityCursor"
            type="button"
            class="press mx-4 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-ink-gray-8"
            @click="loadActivity(activityCursor)"
          >
            Ver más
            <span class="lucide-chevron-down size-4" aria-hidden="true" />
          </button>
        </section>
        <div class="h-28 flex-none lg:h-12" aria-hidden="true" />
      </template>
    </div>

    <BottomSheet
      v-model:open="choosingSafe"
      title="¿Qué caja fuerte usa?"
      flush
    >
      <ul class="divide-y divide-outline-gray-1">
        <li v-for="s in linkable" :key="s.name">
          <ListRow
            :title="s.title || s.name"
            icon="lucide-vault"
            @click="(choosingSafe = false), open(linkSafe(caja, s))"
          />
        </li>
      </ul>
    </BottomSheet>
    <BottomSheet
      :open="!!code"
      title="Código para conectar"
      :subtitle="code ? `${code.label} · ${code.store_name}` : ''"
      @update:open="(v) => !v && (code = null)"
    >
      <div v-if="code" class="space-y-3 pb-2 text-center">
        <p
          class="num select-all text-4xl font-semibold tracking-widest text-ink-gray-9"
          data-efectivo-device-code
        >
          {{ code.code }}
        </p>
        <p class="text-sm text-ink-gray-7">
          Escríbelo en el POS del dispositivo, en «Conectar este dispositivo».
          Sirve una sola vez y caduca {{ formatDateTime(code.expires_at) }}.
        </p>
      </div>
      <template #actions>
        <Button size="lg" class="w-full" label="Listo" @click="code = null" />
      </template>
    </BottomSheet>
    <CajaSheet
      v-if="configUsed && caja"
      v-model:open="configOpen"
      :store="caja.store"
      :store-name="caja.store_name"
      :caja="caja"
      @saved="saved"
    />
    <StepHost :step="step" @close="step = null" @done="afterStep" />
  </div>
</template>
<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { AppBar, BottomSheet, ListRow, StatusChip } from '@/components/ui'
import StepHost from '@/components/efectivo/StepHost.vue'
import {
  WORK_STATE,
  activateCaja,
  activityText,
  approveRoute,
  cajaActivity,
  cajaDetail,
  connectDevice,
  lifecycle,
  linkSafe,
  readinessText,
  replaceDevice,
  retireCaja,
  setupOptions,
  suspendCaja,
  unlinkSafe,
} from '@/components/efectivo/cajas'
import { errorText, money } from '@/components/efectivo/efectivo'
import { useLiveList } from '@/composables/liveList'
import { formatDateTime } from '@/utils/display'

const CajaSheet = defineAsyncComponent(
  () => import('@/components/efectivo/CajaSheet.vue'),
)

const props = defineProps({ name: { type: String, required: true } })
const caja = ref(null)
const loadError = ref('')
const step = ref(null)
const code = ref(null)
const configUsed = ref(false)
const configOpen = ref(false)
const choosingSafe = ref(false)
const storeSafes = ref([])
const activity = ref([])
const activityCursor = ref(null)
const activityLoaded = ref(false)

const back = computed(() => ({
  name: 'EfectivoCajas',
  query: caja.value ? { tienda: caja.value.store } : {},
}))

/** The server's action list: what this worker may do on this caja now. */
const action = (id) =>
  (caja.value?.actions || []).find((a) => a.action_id === id)
const can = (id) => Boolean(action(id)?.enabled)

const shiftLine = computed(() => {
  const c = caja.value
  const s = c?.shift
  if (!s) return WORK_STATE[c?.work_state] || 'Sin turno abierto'
  const who = s.is_mine ? 'Tú' : s.cashier_name || 'Alguien'
  const state =
    c.work_state === 'Recovery' ? 'Turno por recuperar' : 'Turno abierto'
  return `${state} · ${who} desde ${formatDateTime(s.opened_at)}`
})

const deviceLine = computed(() => {
  const c = caja.value
  if (!c.device)
    return c.requires_enrolled_device
      ? 'Necesita uno para abrir turno'
      : 'Puede abrirse desde cualquier navegador de la tienda'
  const seen = c.last_seen_at ? `visto ${formatDateTime(c.last_seen_at)}` : ''
  const state =
    { Fresh: 'En línea', Stale: 'Sin señal reciente' }[c.connectivity] || ''
  return (
    [state, seen].filter(Boolean).join(' · ') ||
    `Conectado ${formatDateTime(c.device.since)}`
  )
})

/** The one filled step: open the POS, finish the setup, or say who can. */
const next = computed(() => {
  const c = caja.value
  if (!c) return null
  if (can('resume_shift'))
    return { href: '/posapp', label: 'Seguir vendiendo en el POS' }
  if (can('open_shift'))
    return { href: '/posapp', label: 'Abrir turno en el POS' }
  if (can('approve_route_change'))
    return {
      run: () => open(approveRoute(c)),
      label: 'Aprobar la cuenta del cajón',
    }
  if (can('connect_device') && c.requires_enrolled_device && !c.device)
    return { run: () => open(connectDevice(c)), label: 'Conectar dispositivo' }
  const activate = action('activate')
  if (activate?.enabled)
    return { run: () => open(activateCaja(c)), label: 'Activar caja' }
  if (activate)
    return {
      reason: c.readiness?.length
        ? 'Para activarla, resuelve lo que falta abajo.'
        : activate.blocking_reason || '',
    }
  if (c.lifecycle === 'Ready' && !c.shift)
    return { reason: 'Lista para que su cajero abra turno en el POS.' }
  if (c.lifecycle === 'Suspended')
    return { reason: 'La reactiva quien configura la tienda.' }
  return null
})

/** The island: setup, suspend and retire, as the server allows them. */
const island = computed(() => {
  const c = caja.value
  if (!c) return []
  const out = []
  if (action('configure'))
    out.push({
      label: 'Configurar caja',
      icon: 'lucide-pencil',
      run: () => ((configUsed.value = true), (configOpen.value = true)),
    })
  if (can('suspend'))
    out.push({
      label: 'Suspender caja',
      icon: 'lucide-pause',
      run: () => open(suspendCaja(c)),
    })
  const retire = action('retire')
  if (retire)
    out.push({
      label: 'Retirar caja',
      icon: 'lucide-archive',
      run: () =>
        open(
          retireCaja(
            c,
            retire.enabled ? '' : 'Cierra su turno abierto antes de retirarla.',
          ),
        ),
    })
  return out
})

const settings = computed(() => {
  const c = caja.value
  if (!c) return []
  const out = [{ label: 'Perfil de POS', value: c.pos_profile }]
  if (c.mode === 'Cash' && c.drawer_account !== undefined)
    out.push({
      label: 'Cuenta del cajón',
      value: c.drawer_account || 'Sin elegir',
    })
  out.push({
    label: 'Para abrirla',
    value: c.requires_enrolled_device
      ? 'Solo su dispositivo conectado'
      : 'Cualquier navegador de la tienda',
  })
  if (c.pending_configuration)
    out.push({ label: 'Cambios', value: 'Valen desde su próxima apertura' })
  return out
})

/** Store safes of this caja's store it is not linked to yet. */
const linkable = computed(() => {
  const c = caja.value
  if (!c || !action('configure') || c.mode !== 'Cash') return []
  const linked = new Set((c.safe_links || []).map((l) => l.safe))
  return storeSafes.value.filter(
    (s) => s.store === c.store && s.enabled && !linked.has(s.name),
  )
})
function linkLine(link) {
  const parts = []
  if (link.can_receive) parts.push('recibe su fondo')
  if (link.can_deposit) parts.push('deja su efectivo')
  const what = parts.length ? parts.join(' y ') : 'vinculada'
  return `${what.charAt(0).toUpperCase()}${what.slice(1)} · desde ${formatDateTime(link.since)}`
}
function pickSafe() {
  if (linkable.value.length === 1) open(linkSafe(caja.value, linkable.value[0]))
  else choosingSafe.value = true
}

function open(nextStep) {
  step.value = nextStep
}
function afterStep(result) {
  if (result?.code) code.value = result.code
  load()
}
function saved() {
  toast.success('Caja guardada')
  load()
}

let sequence = 0
async function load() {
  const mine = ++sequence
  loadError.value = ''
  try {
    const result = await cajaDetail(props.name)
    if (mine !== sequence) return
    caja.value = result
    loadActivity()
    if (result.safe_links && result.mode === 'Cash')
      setupOptions(result.store)
        .then((o) => (storeSafes.value = o?.safes || []))
        .catch(() => (storeSafes.value = []))
  } catch (error) {
    if (mine === sequence) loadError.value = errorText(error)
  }
}
async function loadActivity(after = null) {
  try {
    const answer = await cajaActivity(props.name, after)
    activity.value = after
      ? [...activity.value, ...(answer.items || [])]
      : answer.items || []
    activityCursor.value = answer.next_cursor || null
  } catch {
    if (!after) activity.value = []
  } finally {
    activityLoaded.value = true
  }
}
watch(() => props.name, load, { immediate: true })
useLiveList(['POS Register'], load)
</script>
