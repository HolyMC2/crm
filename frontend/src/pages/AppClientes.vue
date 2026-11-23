<template>
  <!-- «App de tus clientes» (/negocio/app-clientes): what each shop's
       customers get in their account on the online store
       (doco.docoutils.storefront_customer_app_admin). The master switch (off,
       with why and the fix, while no login channel can send) and a small
       phone with what they see and «Ver como cliente»; then one switch per
       part in four groups, each with the cell's words (a part with rules opens
       them in a sheet, a part the shop cannot offer says why and links the
       /crm page that fixes it); then «Cómo va», the figures while the app is
       on. A tap shows at once, the server's answer replaces the screen, a
       refusal puts it back and says why. With several shops the title picks
       the shop. -->
  <div
    class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-app-clientes
  >
    <AppBar
      :title="__('Your customers’ app', null, CTX)"
      back
      :loading="loading && !!state"
      :scopes="scopes"
      :scope="state?.profile || ''"
      :scope-title="__('Choose a shop', null, CTX)"
      @update:scope="pickShop"
      @back="onBack"
    />
    <div class="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:pb-10 lg:px-6">
      <div
        v-if="problem && !state"
        role="alert"
        class="space-y-3 rounded-6 bg-surface-red-1 p-4"
        data-app-clientes-problema
      >
        <p class="text-sm text-ink-red-7">{{ problem }}</p>
        <button type="button" :class="['press', BTN.tonal]" @click="load">
          {{ __('Try again', null, CTX) }}
        </button>
      </div>
      <div
        v-else-if="!state"
        role="status"
        :aria-label="__('Loading…', null, CTX)"
        class="max-w-3xl space-y-3"
      >
        <div class="h-40 animate-pulse rounded-7 bg-surface-gray-2" />
        <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
        <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
        <div class="h-14 animate-pulse rounded-7 bg-surface-gray-2" />
      </div>
      <EmptyState
        v-else-if="!state.profile"
        class="py-10"
        :title="__('Your online store is not ready yet', null, CTX)"
        :message="
          __(
            'Your customers’ app lives in your online store. Turn the store on first.',
            null,
            CTX,
          )
        "
        :action="__('Go to your online store', null, CTX)"
        data-app-clientes-sin-tienda
        @action="router.push('/cuenta?tab=tienda')"
      />
      <div
        v-else
        class="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-10"
      >
        <div class="min-w-0 max-w-3xl space-y-6">
          <p
            v-if="!canChange"
            role="note"
            class="text-sm text-ink-gray-7"
            data-app-clientes-solo-ver
          >
            {{
              __(
                'You see what your customers see. Whoever runs the system can change it.',
                null,
                CTX,
              )
            }}
          </p>
          <section
            aria-labelledby="app-clientes-principal"
            class="border-b border-outline-gray-1 pb-3"
            data-app-clientes-principal
          >
            <div class="flex min-h-14 items-center gap-3">
              <label for="app-clientes-enabled" class="min-w-0 flex-1">
                <span
                  id="app-clientes-principal"
                  class="title-face block text-lg font-semibold text-ink-gray-9"
                  >{{ __('Customer app', null, CTX) }}</span
                >
                <span
                  class="block text-sm text-ink-gray-6"
                  data-app-clientes-frase
                  >{{ master.sentence }}</span
                >
              </label>
              <AjustesSwitch
                id="app-clientes-enabled"
                :model-value="master.on"
                :label="__('Customer app', null, CTX)"
                :disabled="master.disabled"
                :aria-describedby="
                  master.reason ? 'app-clientes-motivo' : undefined
                "
                @update:model-value="(value) => tap(masterRow, value)"
              />
            </div>
            <div
              v-if="master.reason"
              id="app-clientes-motivo"
              role="note"
              class="space-y-2 pb-1"
              data-app-clientes-motivo
            >
              <p class="text-sm text-ink-gray-7">{{ master.reason }}</p>
              <FixLink :fix="master.fix" />
            </div>
            <p
              v-if="pagesTaken"
              role="note"
              class="pb-1 text-sm text-ink-gray-7"
              data-app-clientes-paginas
            >
              {{ pagesTaken }}
            </p>
          </section>

          <AppPreview v-if="!wide" :view="preview" :shop="shop" />

          <p
            v-if="!master.on && groups.length"
            class="text-sm text-ink-gray-6"
            data-app-clientes-preparar
          >
            {{
              __(
                'Get each part ready; your customers see it once the app is on.',
                null,
                CTX,
              )
            }}
          </p>

          <section
            v-for="group in groups"
            :key="group.key"
            :aria-labelledby="`app-clientes-grupo-${group.key}`"
            :data-app-clientes-grupo="group.key"
          >
            <h2
              :id="`app-clientes-grupo-${group.key}`"
              class="mb-1 text-sm font-semibold text-ink-gray-7"
            >
              {{ group.label }}
            </h2>
            <ul class="divide-y divide-outline-gray-1">
              <li
                v-for="row in group.rows"
                :key="row.key"
                class="flex min-h-14 items-center gap-2 py-2"
                :data-app-clientes-seccion="row.key"
                :data-state="
                  row.available ? (row.on ? 'on' : 'off') : 'blocked'
                "
              >
                <div class="min-w-0 flex-1">
                  <label :for="`app-clientes-${row.key}`" class="block">
                    <span
                      class="block text-base"
                      :class="
                        row.available ? 'text-ink-gray-9' : 'text-ink-gray-6'
                      "
                      >{{ row.label }}</span
                    >
                    <span
                      v-if="row.blocked"
                      class="block text-sm text-ink-gray-7"
                      data-app-clientes-bloqueo
                      >{{ row.blocked.text }}</span
                    >
                    <span
                      v-else-if="row.help"
                      class="block text-sm text-ink-gray-6"
                      >{{ row.help }}</span
                    >
                    <span
                      v-if="row.paramsLine"
                      class="line-clamp-2 text-sm text-ink-gray-7"
                      data-app-clientes-reglas-linea
                      >{{ row.paramsLine }}</span
                    >
                  </label>
                  <FixLink
                    v-if="row.blocked?.fix"
                    class="mt-2"
                    :fix="row.blocked.fix"
                  />
                </div>
                <button
                  v-if="row.editable"
                  type="button"
                  class="press flex size-11 flex-none items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2"
                  :aria-label="__('Rules for {0}', [row.label], CTX)"
                  :title="__('Rules for {0}', [row.label], CTX)"
                  :data-app-clientes-reglas-abrir="row.key"
                  @click="openParams(row)"
                >
                  <span class="lucide-pencil size-5" aria-hidden="true" />
                </button>
                <AjustesSwitch
                  :id="`app-clientes-${row.key}`"
                  :model-value="row.on"
                  :label="row.label"
                  :disabled="row.disabled"
                  @update:model-value="(value) => tap(row, value)"
                />
              </li>
            </ul>
          </section>

          <section
            v-if="figures"
            aria-labelledby="app-clientes-como-va"
            data-app-clientes-cifras
          >
            <h2
              id="app-clientes-como-va"
              class="mb-1 text-sm font-semibold text-ink-gray-7"
            >
              {{ __('How it is going', null, CTX) }}
            </h2>
            <p
              v-if="figures.quiet"
              class="text-sm text-ink-gray-6"
              data-app-clientes-cifras-vacio
            >
              {{ figures.quiet }}
            </p>
            <ul
              v-else
              class="grid grid-cols-2 gap-x-4 gap-y-3 rounded-7 bg-surface-gray-1 px-4 py-3 sm:grid-cols-3"
            >
              <li
                v-for="tile in figures.tiles"
                :key="tile.key"
                class="flex min-w-0 flex-col"
                :data-cifra="tile.key"
              >
                <span
                  class="num break-words text-xl font-semibold leading-tight text-ink-gray-9"
                  >{{ tile.value }}</span
                >
                <span
                  class="break-words text-sm leading-snug text-ink-gray-6"
                  >{{ tile.label }}</span
                >
              </li>
            </ul>
          </section>

          <SolicitudesDoor />

          <section aria-labelledby="app-clientes-leen" data-app-clientes-textos>
            <h2
              id="app-clientes-leen"
              class="mb-1 text-sm font-semibold text-ink-gray-7"
            >
              {{ __('What your customers read', null, CTX) }}
            </h2>
            <button
              type="button"
              class="press flex min-h-14 w-full items-center gap-3 py-2 text-left"
              data-app-clientes-legales-abrir
              @click="openLegal"
            >
              <span class="min-w-0 flex-1">
                <span class="block text-base text-ink-gray-9">{{
                  __('Legal texts', null, CTX)
                }}</span>
                <span class="block text-sm text-ink-gray-6">{{
                  __(
                    'Terms, returns, warranty and privacy, as your customers read them in the app.',
                    null,
                    CTX,
                  )
                }}</span>
              </span>
              <span
                class="lucide-chevron-right size-4 shrink-0 text-ink-gray-5"
                aria-hidden="true"
              />
            </button>
          </section>
        </div>
        <aside v-if="wide" class="sticky top-4">
          <AppPreview :view="preview" :shop="shop" tall />
        </aside>
      </div>
    </div>

    <ParamsSheet
      v-if="mounted.params"
      :open="sheet === 'params'"
      :row="paramsRow"
      :storefront="state?.profile || ''"
      :currency="currency"
      :can-change="canChange"
      :note="paramsNote"
      @update:open="(open) => !open && (sheet = '')"
      @saved="paramsSaved"
    />
    <LegalSheet
      v-if="mounted.legal"
      :open="sheet === 'legal'"
      :storefront="state?.profile || ''"
      :can-change="canChange"
      @update:open="(open) => !open && (sheet = '')"
    />
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import { AppBar, EmptyState } from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import AppPreview from '@/components/appClientes/AppPreview.vue'
import FixLink from '@/components/appClientes/FixLink.vue'
import {
  readState,
  rememberState,
  saveState,
} from '@/components/appClientes/api'
import {
  CTX,
  MASTER,
  changeFor,
  kpiBlock,
  masterView,
  onlineCouponsNote,
  pagesTakenLine,
  previewView,
  profileLabel,
  profileScopes,
  sectionGroups,
  tapOutcome,
} from '@/components/appClientes/view'
import { isWide as wide } from '@/composables/breakpoint'
import { BTN } from '@/documentos/tools'
import { errorText } from '@/utils/errorText'

// The sheets carry the forms: they mount on their first open.
const ParamsSheet = defineAsyncComponent(
  () => import('@/components/appClientes/ParamsSheet.vue'),
)
const LegalSheet = defineAsyncComponent(
  () => import('@/components/appClientes/LegalSheet.vue'),
)
// What customers ask from the app: its own read, so it never holds the page.
const SolicitudesDoor = defineAsyncComponent(
  () => import('@/components/solicitudesClientes/SolicitudesDoor.vue'),
)

const route = useRoute()
const router = useRouter()
const state = ref(null)
const problem = ref('')
const loading = ref(false)
/** Taps on their way to the server: key → the value the switch shows. */
const pending = reactive({})

// Money in the shop's own currency (the cell's, else the site's default).
const currency = computed(
  () => state.value?.currency || window.sysdefaults?.currency || '',
)
const canChange = computed(() => state.value?.can_change === true)
const master = computed(() => masterView(state.value, pending))
const masterRow = computed(() => ({
  key: MASTER,
  label: __('Customer app', null, CTX),
}))
const groups = computed(() =>
  sectionGroups(state.value, pending, currency.value),
)
const preview = computed(() =>
  previewView(state.value, pending, currency.value),
)
// «Cómo va»: hidden while the app is off, one line until something moves.
const figures = computed(() => kpiBlock(state.value, pending, currency.value))
const pagesTaken = computed(() => pagesTakenLine(state.value))
const scopes = computed(() => profileScopes(state.value))
const shop = computed(() => profileLabel(state.value))

// --- the shop, from the URL (?tienda=), so back and a shared link keep it ---
const askedShop = () =>
  typeof route.query.tienda === 'string' ? route.query.tienda : ''

let sequence = 0
async function load() {
  const mine = ++sequence
  const storefront = askedShop()
  loading.value = true
  problem.value = ''
  try {
    const answer = await readState(storefront)
    if (mine !== sequence) return
    take(answer, { asDefault: !storefront })
  } catch (error) {
    if (mine === sequence)
      problem.value = errorText(
        error,
        __('The app settings could not open. Try again.', null, CTX),
      )
  } finally {
    if (mine === sequence) loading.value = false
  }
}
function take(answer, how = {}) {
  state.value = answer || null
  rememberState(answer, how)
}
watch(
  () => route.query.tienda,
  () => {
    // Leaving the page moves the route before the page goes.
    if (route.name && route.name !== 'AppClientes') return
    for (const key of Object.keys(pending)) delete pending[key]
    load()
  },
  { immediate: true },
)
function pickShop(name) {
  router.replace({ query: { ...route.query, tienda: name || undefined } })
}
// Opened from a link with nothing behind it: back goes to «Ajustes del negocio».
function onBack(event) {
  if (window.history.state?.back) return
  event?.preventDefault?.()
  router.push('/negocio')
}

// --- taps: shown at once, one save after another, the answer replaces all ---
const taps = {}
let chain = Promise.resolve()
function tap(row, value) {
  if (!canChange.value || !state.value) return chain
  const key = row.key
  const shopName = state.value.profile
  pending[key] = value
  const mine = (taps[key] = (taps[key] || 0) + 1)
  chain = chain.then(async () => {
    try {
      const answer = await saveState(shopName, changeFor(key, value))
      if (shopName !== state.value?.profile) return
      if (answer) take(answer)
      const outcome = tapOutcome(answer, row, value)
      if (outcome.ok) toast.success(outcome.text)
      else toast.error(outcome.text)
    } catch (error) {
      toast.error(
        errorText(error, __('It did not change. Try again.', null, CTX)),
      )
    } finally {
      if (taps[key] === mine) delete pending[key]
    }
  })
  return chain
}

// --- sheets -----------------------------------------------------------------
const sheet = ref('')
const mounted = reactive({ params: false, legal: false })
const paramsRow = ref(null)
// Cupones' rules start with whether the online store takes coupons at all.
const paramsNote = computed(() =>
  paramsRow.value?.key === 'cupones' ? onlineCouponsNote(state.value) : null,
)
function openParams(row) {
  paramsRow.value = row
  mounted.params = true
  sheet.value = 'params'
}
function paramsSaved(answer) {
  if (answer) take(answer)
  sheet.value = ''
  toast.success(__('Changes saved', null, CTX))
}
function openLegal() {
  mounted.legal = true
  sheet.value = 'legal'
}
</script>
