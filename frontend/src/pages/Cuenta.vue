<template>
  <div
    ref="scroller"
    class="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain"
  >
    <div
      v-if="pull || refreshing"
      class="flex items-end justify-center overflow-hidden text-ink-gray-6"
      :style="{ height: `${refreshing ? 48 : pull}px` }"
      aria-hidden="true"
    >
      <span
        class="lucide-refresh-cw mb-3 size-5"
        :class="refreshing ? 'animate-spin' : ''"
      />
    </div>
    <div
      class="mx-auto w-full max-w-3xl px-4 pb-24 pt-1 sm:px-6 sm:pb-10 sm:pt-6"
    >
      <!-- On a phone the shell's bar carries the title. -->
      <header v-if="!phone" class="flex items-center gap-3 pb-4">
        <h1
          class="title-face min-w-0 flex-1 text-3xl font-semibold text-ink-gray-9"
        >
          {{ __('My account') }}
        </h1>
        <Button
          v-if="allowed && door.boot.value"
          variant="subtle"
          :loading="door.loading.value"
          :label="__('Check status', null, 'Cuenta')"
          @click="door.load()"
        >
          <template #prefix>
            <span class="lucide-refresh-cw size-4" aria-hidden="true" />
          </template>
        </Button>
      </header>

      <EmptyState
        v-if="!shellBoot"
        state="loading"
        :title="__('Loading your plan…', null, 'Cuenta')"
      />
      <EmptyState
        v-else-if="!available"
        state="empty"
        :title="__('My account is not available on this site', null, 'Cuenta')"
        :message="
          __(
            'This site has no plan to show here. If you think that is wrong, ask support for help.',
            null,
            'Cuenta',
          )
        "
      />
      <EmptyState
        v-else-if="!allowed"
        state="denied"
        :title="__('The shop’s plan is for the owner', null, 'Cuenta')"
        :message="
          __(
            'The shop owner and whoever holds the «Mi Plan» permission see it. Ask the owner for it, then retry.',
            null,
            'Cuenta',
          )
        "
        :action="__('Retry', null, 'Cuenta')"
        data-testid="cuenta-guardia"
        @action="retryAccess"
      >
        <Button
          class="min-h-11"
          :label="__('Ask for access', null, 'Cuenta')"
          @click="copyRequest"
        />
        <p v-if="copied" role="status" class="w-full text-sm text-ink-gray-7">
          {{ copied }}
        </p>
      </EmptyState>
      <EmptyState
        v-else-if="door.loading.value && !door.boot.value"
        state="loading"
        :title="__('Loading your plan…', null, 'Cuenta')"
      />
      <section
        v-else-if="door.error.value && !site"
        role="alert"
        class="space-y-3 py-6"
        data-testid="cuenta-sin-conexion"
      >
        <h2 class="text-xl font-semibold text-ink-gray-9">
          {{ __('We could not check your plan', null, 'Cuenta') }}
        </h2>
        <p class="text-base text-ink-gray-7">{{ door.error.value }}</p>
        <p
          v-if="door.paymentBlockReason.value"
          class="text-sm text-ink-gray-6"
          role="status"
        >
          {{ door.paymentBlockReason.value }}
        </p>
        <div class="flex flex-wrap gap-2">
          <Button
            variant="solid"
            class="min-h-11"
            :label="__('Check status', null, 'Cuenta')"
            @click="door.load()"
          />
          <Button
            class="min-h-11"
            :label="__('Ask support for help', null, 'Cuenta')"
            @click="door.contactSupport()"
          />
        </div>
        <p v-if="door.supportError.value" class="text-sm text-ink-red-7">
          {{ door.supportError.value }}
        </p>
      </section>
      <section
        v-else-if="door.isProvisioning.value"
        class="space-y-3 py-6"
        data-testid="cuenta-preparando"
      >
        <h2 class="text-xl font-semibold text-ink-gray-9">
          {{
            door.provisioningBroken.value
              ? __('Your site needs help', null, 'Cuenta')
              : __('We are preparing your site', null, 'Cuenta')
          }}
        </h2>
        <p class="text-base text-ink-gray-7" role="status">
          {{ door.provisioningMessage.value }}
        </p>
        <p v-if="door.error.value" class="text-sm text-ink-red-7" role="alert">
          {{ door.error.value }}
        </p>
        <!-- A site being prepared only needs a re-check; a broken one leads with help. -->
        <div class="flex flex-wrap gap-2">
          <Button
            v-if="door.provisioningBroken.value && !door.error.value"
            variant="solid"
            class="min-h-11"
            :label="__('Ask support for help', null, 'Cuenta')"
            @click="door.contactSupport()"
          />
          <Button
            class="min-h-11"
            :loading="door.loading.value"
            :label="__('Check status', null, 'Cuenta')"
            @click="door.load()"
          />
          <Button
            v-if="door.error.value"
            class="min-h-11"
            :label="__('Ask support for help', null, 'Cuenta')"
            @click="door.contactSupport()"
          />
        </div>
        <p v-if="door.supportError.value" class="text-sm text-ink-red-7">
          {{ door.supportError.value }}
        </p>
      </section>
      <template v-else-if="site">
        <!-- What the numbers below cannot be trusted to say: one row under a
             rule, red on the sentence only. -->
        <div
          v-if="door.error.value || door.invalidPaymentState.value"
          role="status"
          class="mb-4 space-y-2 border-b border-outline-gray-1 pb-4"
          data-testid="cuenta-no-confiable"
        >
          <p class="text-base text-ink-red-7">
            {{ door.error.value || door.paymentBlockReason.value }}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              class="min-h-11"
              :label="__('Check status', null, 'Cuenta')"
              @click="door.load()"
            />
            <Button
              class="min-h-11"
              :label="__('Ask support for help', null, 'Cuenta')"
              @click="door.contactSupport()"
            />
          </div>
        </div>
        <!-- Three views of one account. -->
        <Segmented
          class="mb-4"
          fit="content"
          :model-value="tab"
          :options="TABS"
          :label="__('Sections of my account', null, 'Cuenta')"
          @update:model-value="openTab"
        />
        <CuentaResumen
          v-if="tab === 'resumen'"
          :door="door"
          :actions="ACTIONS"
          @act="act"
        />
        <CuentaFacturacion
          v-else-if="tab === 'facturacion'"
          :door="door"
          @act="act"
        />
        <CuentaTienda v-else-if="tab === 'tienda'" :door="door" />
        <Button
          v-if="phone"
          variant="ghost"
          class="mt-6 min-h-11 w-full"
          :loading="door.loading.value"
          :label="__('Check status', null, 'Cuenta')"
          @click="door.load()"
        />
      </template>
    </div>
    <ActivarSheet
      v-if="mounted.activar"
      :door="door"
      :open="
        door.activationOpen.value &&
        !door.loading.value &&
        !door.paymentHold.value
      "
      @close="closeActivation"
    />
    <RecargarSheet
      v-if="mounted.recargar"
      :door="door"
      :open="
        door.topupOpen.value && !door.loading.value && !door.paymentHold.value
      "
      @close="closeTopup"
    />
  </div>
</template>
<script setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { EmptyState, Segmented } from '@/components/ui'
import CuentaResumen from '@/components/cuenta/CuentaResumen.vue'
import { planView } from '@/components/cuenta/cuenta'
import { createPagos } from '@/components/cuenta/pagos'
import { mutate, read } from '@/components/cuenta/api'
import { isMobile } from '@/composables/breakpoint'
import { loadShell, shellBoot } from '@/composables/muelleShell'
import { usePullRefresh } from '@/composables/usePullRefresh'
import { cuentaAllowed } from '@/utils/shellRoutes'

// Sheets mount on their first open; Facturación and Tienda load with their tab.
const ActivarSheet = defineAsyncComponent(
  () => import('@/components/cuenta/ActivarSheet.vue'),
)
const RecargarSheet = defineAsyncComponent(
  () => import('@/components/cuenta/RecargarSheet.vue'),
)
const CuentaFacturacion = defineAsyncComponent(
  () => import('@/components/cuenta/CuentaFacturacion.vue'),
)
const CuentaTienda = defineAsyncComponent(
  () => import('@/components/cuenta/CuentaTienda.vue'),
)

// ?tab= opens one (the keys of Mi plan's tabs, so its links and returns map 1:1).
const TABS = [
  { value: 'resumen', label: __('Summary', null, 'Cuenta') },
  { value: 'facturacion', label: __('Billing', null, 'Cuenta') },
  { value: 'tienda', label: __('Store', null, 'Cuenta') },
]
// The next steps this page opens from a notice.
const ACTIONS = ['activate', 'pay', 'topup', 'support', 'plans']

const route = useRoute()
const router = useRouter()
const phone = isMobile
const scroller = ref(null)
const copied = ref('')
const mounted = reactive({ activar: false, recargar: false })

// The processor returns the owner to this panel and the section they paid from.
const door = createPagos({
  read,
  mutate,
  panel: 'cuenta',
  tab: () => tab.value,
})
onBeforeUnmount(door.dispose)

// An older boot has no `account`, and a site without a platform link has no
// plan to read (`available: false`): nothing to open there.
const available = computed(
  () =>
    shellBoot.value?.account !== undefined &&
    shellBoot.value.account?.available !== false,
)
const allowed = computed(() => cuentaAllowed(shellBoot.value))
const site = computed(() => door.boot.value?.site || null)
const tab = computed(() =>
  TABS.some((item) => item.value === route.query.tab)
    ? route.query.tab
    : 'resumen',
)

function openTab(value) {
  router.replace({ query: { ...route.query, tab: value } })
}

async function refresh() {
  await door.load()
  // The read just refreshed doco's plan summary; the shell's notice follows it.
  if (door.boot.value && !door.error.value)
    loadShell({ refresh: true }).catch(() => {})
}
// A pull re-reads the plan, or the permission when the page is guarded.
const { pull, refreshing } = usePullRefresh(scroller, () =>
  allowed.value ? refresh() : retryAccess(),
)

// Mi plan offers «Activar plan» only on a trial. A link (Hoy's card, the
// shell's notice) can be older than the plan just read: on a plan already
// paid it opens nothing and leaves the address clean.
async function openActivation() {
  if (!planView(door.boot.value).isTrial) return dropQuery('activar')
  mounted.activar = true
  await door.openActivation()
}
// A sheet opened from a link (?activar=1, ?recargar=1) leaves the address clean.
function dropQuery(key) {
  if (route.query[key] === undefined) return
  const query = { ...route.query }
  delete query[key]
  router.replace({ query })
}
function closeActivation() {
  door.closeActivation()
  dropQuery('activar')
}
function closeTopup() {
  door.closeTopup()
  dropQuery('recargar')
}
function act(key) {
  if (key === 'activate') return openActivation()
  if (key === 'pay') openTab('facturacion')
  else if (key === 'plans') openTab('tienda')
  else if (key === 'topup') {
    mounted.recargar = true
    door.openTopup()
  } else if (key === 'support') door.contactSupport()
}

// The first read once the boot says this person may open the account, then
// Hoy's «Activar» (?activar=1) or Boat's top-up link (?recargar=1) opens its
// sheet when nothing holds payments.
let started = false
watch(
  allowed,
  async (yes) => {
    if (!yes || started) return
    started = true
    await refresh()
    if (!site.value || door.error.value) return
    if (route.query.activar !== undefined) openActivation()
    else if (route.query.recargar !== undefined) act('topup')
  },
  { immediate: true },
)

async function retryAccess() {
  copied.value = ''
  await loadShell({ refresh: true }).catch(() => {})
}
async function copyRequest() {
  const text = __(
    'I need the «Mi Plan» permission in Muelle to see and pay the shop’s plan (My account).',
    null,
    'Cuenta',
  )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __(
      'Request copied. Share it with the owner.',
      null,
      'Cuenta',
    )
  } catch {
    copied.value = text
  }
}
</script>
