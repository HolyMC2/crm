<template>
  <!-- «Conteos del día» (scanner_kit api.conteo.plan_dia): the owner turns the
       daily counts on, says who counts and how, and reads each person's day.
       One surface: off it is the proposal with «Encender», on it is the day
       and the same controls. Every tap saves, and the server's answer is the
       whole page. -->
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
    data-conteos
  >
    <AppBar
      v-if="phone"
      :title="__('Daily counts', null, CTX)"
      :back="{ name: 'Inventario' }"
      :back-label="__('Back to Inventario', null, CTX)"
      :stack="false"
      :loading="busy > 0"
    >
      <template #actions>
        <AjustesSwitch
          v-if="home?.on"
          :model-value="true"
          :label="__('Daily counts on', null, CTX)"
          :disabled="!home.can_edit"
          data-conteos-switch
          @update:model-value="turnOff"
        />
      </template>
    </AppBar>
    <header
      v-else
      class="mx-auto flex w-full max-w-5xl items-end gap-4 px-6 pb-3 pt-6"
    >
      <div class="min-w-0 flex-1">
        <RouterLink
          :to="{ name: 'Inventario' }"
          class="mb-1 inline-flex min-h-8 items-center gap-1 text-sm text-ink-gray-6 hover:text-ink-gray-9"
        >
          <span class="lucide-arrow-left size-4" aria-hidden="true" />
          {{ __('Back to Inventario', null, CTX) }}
        </RouterLink>
        <h1 class="title-face text-2xl font-semibold text-ink-gray-9">
          {{ __('Daily counts', null, CTX) }}
        </h1>
      </div>
      <AjustesSwitch
        v-if="home?.on"
        :model-value="true"
        :label="__('Daily counts on', null, CTX)"
        :disabled="!home.can_edit"
        data-conteos-switch
        @update:model-value="turnOff"
      />
      <button
        v-else-if="home && home.can_edit"
        type="button"
        :class="FILLED"
        :disabled="turningOn"
        data-conteos-encender
        @click="turnOn"
      >
        <span
          v-if="turningOn"
          class="lucide-loader-circle size-4 animate-spin"
          aria-hidden="true"
        />
        {{ __('Turn on', null, CTX) }}
      </button>
    </header>

    <div
      v-if="failure"
      role="alert"
      class="mx-auto w-full max-w-5xl space-y-3 px-4 py-6 sm:px-6"
      data-conteos-falla
    >
      <p class="text-base text-ink-gray-8">{{ failure }}</p>
      <button type="button" :class="TONAL" @click="load">
        {{ __('Retry', null, CTX) }}
      </button>
    </div>
    <EmptyState
      v-else-if="denied"
      class="py-10"
      state="denied"
      :title="__('You cannot open the daily counts', null, CTX)"
      :message="denied"
    />
    <div
      v-else-if="!home"
      role="status"
      class="mx-auto w-full max-w-5xl space-y-3 px-4 pt-2 sm:px-6"
      :aria-label="__('Opening the counts…', null, CTX)"
    >
      <div
        v-for="n in 4"
        :key="n"
        class="h-16 animate-pulse rounded-7 bg-surface-gray-2"
      />
    </div>

    <template v-else>
      <main
        class="mx-auto grid w-full max-w-5xl gap-3 px-4 pb-6 pt-3 sm:px-6 lg:grid-cols-2 lg:items-start lg:gap-6"
      >
        <!-- The day: what the counts found, what waits for a decision, each person. -->
        <div class="flex min-w-0 flex-col gap-3">
          <!-- Why the switch or «Encender» was refused; on a phone that is
               off, it reads over the button instead. -->
          <p
            v-if="errors.on && !(phone && !home.on)"
            role="alert"
            class="text-sm text-ink-red-7"
            data-conteos-error
          >
            {{ errors.on }}
          </p>
          <KpiGrid v-if="home.on" data-conteos-cifras>
            <KpiTile
              :label="__('Counted in 30 days', null, CTX)"
              :value="percentWords(home.kpis.coverage_pct)"
            />
            <KpiTile
              :label="__('Matches', null, CTX)"
              :value="percentWords(home.kpis.accuracy_pct)"
            />
          </KpiGrid>
          <!-- Differences are decided in Escáner, the one place they are. -->
          <a
            v-for="row in decide"
            :key="row.key"
            :href="row.href"
            class="press flex min-h-16 items-center gap-3 rounded-7 bg-surface-gray-1 py-2 pl-4 pr-3"
            :data-conteos-decidir="row.key"
          >
            <span
              class="flex size-10 flex-none items-center justify-center rounded-full bg-surface-amber-2 text-ink-amber-8"
              aria-hidden="true"
            >
              <span class="lucide-circle-alert size-5" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="num block text-md font-medium text-ink-gray-9">{{
                row.title
              }}</span>
              <span
                v-if="row.queue"
                class="block truncate text-sm text-ink-gray-6"
                >{{ row.queue }}</span
              >
            </span>
            <span
              class="lucide-chevron-right size-5 flex-none text-ink-gray-7"
              aria-hidden="true"
            />
          </a>
          <div
            v-if="home.people.length"
            class="flex flex-col gap-0.5 overflow-hidden rounded-7"
            data-conteos-personas
          >
            <ConteoPersona
              v-for="person in home.people"
              :key="person.user"
              :person="person"
              :on="home.on"
              :settings="home.settings"
              :groups="home.groups"
              :warehouses="home.warehouses"
              :open="openPerson === person.user"
              :errors="errors"
              @toggle="
                openPerson = openPerson === person.user ? '' : person.user
              "
              @set="(what, args, paint) => setPerson(person, what, args, paint)"
            />
          </div>
          <!-- Only who uses Escáner can count: with nobody, the way to give access. -->
          <div
            v-else
            class="overflow-hidden rounded-7 bg-surface-gray-1"
            data-conteos-nadie
          >
            <ListRow
              icon="lucide-users"
              :title="__('Nobody uses Escáner yet', null, CTX)"
              :subtitle="__('Give access in Equipo', null, CTX)"
              to="/equipo"
            />
          </div>
        </div>

        <!-- The plan: the size of a list, what goes first, the days, what
             happens with a difference, how a product is counted. -->
        <div class="flex min-w-0 flex-col gap-3">
          <p
            v-if="!home.can_edit"
            class="flex items-center gap-2 px-1 text-sm text-ink-gray-7"
            data-conteos-candado
          >
            <span class="lucide-lock size-4 flex-none" aria-hidden="true" />
            {{ __('Whoever runs every store changes this', null, CTX) }}
          </p>
          <div
            class="flex min-w-0 flex-col gap-3"
            :class="home.can_edit ? '' : 'opacity-60'"
            :inert="home.can_edit ? undefined : true"
            data-conteos-plan
          >
            <section
              class="rounded-7 bg-surface-gray-1 p-3"
              data-conteos-tamano
            >
              <Segmented
                v-if="home.on"
                class="mb-3"
                :model-value="settings.unit"
                :options="unitOptions()"
                :label="__('List size', null, CTX)"
                @update:model-value="setUnit"
              />
              <p class="mb-1 px-1 text-xs font-medium text-ink-gray-6">
                {{ __('Per person', null, CTX) }}
              </p>
              <ConteoPaso
                wide
                :model-value="byProducts ? settings.products : settings.minutes"
                :bounds="byProducts ? PRODUCTS : MINUTES"
                :unit="byProducts ? '' : __('min', null, CTX)"
                :label="__('Per person', null, CTX)"
                @commit="setSize"
              />
              <p
                v-if="errors.size"
                role="alert"
                class="px-1 pt-1 text-sm text-ink-red-7"
              >
                {{ errors.size }}
              </p>
              <!-- What the size buys; with stock on nobody's list there is no figure. -->
              <p
                v-if="home.kpis.unassigned_products"
                class="flex min-h-9 items-center gap-2 px-1 pt-2 text-sm text-ink-amber-8"
                data-conteos-sin-nadie
              >
                <span
                  class="lucide-circle-alert size-4 flex-none"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">{{
                  __('With nobody to count them', null, CTX)
                }}</span>
                <span class="num text-md font-semibold">{{
                  productWords(home.kpis.unassigned_products)
                }}</span>
              </p>
              <p
                v-else-if="cycle"
                class="flex min-h-9 items-center gap-2 px-1 pt-2 text-sm text-ink-gray-7"
                data-conteos-vuelta
              >
                <span
                  class="lucide-refresh-cw size-4 flex-none"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">{{
                  __('Full pass', null, CTX)
                }}</span>
                <span class="num text-md font-semibold text-ink-gray-9">{{
                  cycle
                }}</span>
              </p>
            </section>

            <section
              class="rounded-7 bg-surface-gray-1 px-4 pb-4 pt-3"
              data-conteos-primero
            >
              <ChipGroup
                v-if="byProducts"
                :label="__('First', null, CTX)"
                :options="orderOptions()"
                :model-value="settings.order"
                testid="orden"
                @update:model-value="setOrder"
              />
              <ChipGroup
                v-else
                :label="__('First', null, CTX)"
                :options="ruleOptions()"
                :model-value="settings.rules"
                multiple
                testid="regla"
                @update:model-value="setRules"
              />
              <p
                v-if="errors.first"
                role="alert"
                class="pt-1 text-sm text-ink-red-7"
              >
                {{ errors.first }}
              </p>
            </section>

            <!-- The shop's own rest days: said only while they decide for
                 someone (nobody keeps shifts for at least one counter). -->
            <section
              v-if="settings.shows_days"
              class="rounded-7 bg-surface-gray-1 px-4 pb-4 pt-3"
              data-conteos-dias
            >
              <ChipGroup
                :label="__('Days', null, CTX)"
                :options="dayOptions()"
                :model-value="countingDays(settings.skip_weekdays)"
                multiple
                testid="dia"
                @update:model-value="setDays"
              />
              <p
                v-if="errors.days"
                role="alert"
                class="pt-1 text-sm text-ink-red-7"
              >
                {{ errors.days }}
              </p>
            </section>

            <section
              class="rounded-7 bg-surface-gray-1 px-3 pb-3 pt-3"
              data-conteos-diferencias
            >
              <p class="mb-1.5 px-1 text-xs font-medium text-ink-gray-6">
                {{ __('If it does not match', null, CTX) }}
              </p>
              <!-- Who is kept from the shop's money reads the choice and cannot change it. -->
              <p
                v-if="!home.sees_money"
                class="px-1 text-md font-medium text-ink-gray-9"
                data-conteos-diferencias-fijo
              >
                {{ differenceWords }}
              </p>
              <template v-else>
                <Segmented
                  :model-value="recounting ? 'recount' : 'review'"
                  :options="differenceOptions()"
                  :fit="roomy ? 'content' : 'equal'"
                  :label="__('If it does not match', null, CTX)"
                  @update:model-value="setDifferences"
                />
                <ExpandTransition>
                  <div
                    v-if="recounting"
                    class="flex min-h-12 items-center justify-between gap-3 px-1 pt-3"
                  >
                    <span class="min-w-0 flex-1 text-sm text-ink-gray-7">{{
                      __('Muelle adjusts alone up to', null, CTX)
                    }}</span>
                    <ConteoMonto
                      ref="capField"
                      :model-value="settings.cap"
                      :currency="settings.currency || ''"
                      :label="__('Muelle adjusts alone up to', null, CTX)"
                      :placeholder="
                        settings.no_cap && !askingCap
                          ? __('No ceiling', null, CTX)
                          : ''
                      "
                      :invalid="!!errors.differences"
                      data-conteos-tope
                      @commit="setCap"
                      @leave="leaveCap"
                    />
                  </div>
                </ExpandTransition>
              </template>
              <p
                v-if="errors.differences"
                role="alert"
                class="px-1 pt-1 text-sm text-ink-red-7"
                data-conteos-diferencias-error
              >
                {{ errors.differences }}
              </p>
            </section>

            <ConteoComo
              :settings="settings"
              :warehouses="home.warehouses"
              :sees-money="home.sees_money"
              :errors="errors"
              @save="saveShop"
              @store="setStore"
            />
            <ConteoGrupos
              v-if="home.groups.length"
              :groups="home.groups"
              :rules="settings.group_rules || []"
              :errors="errors"
              @set="setGroup"
            />
          </div>
        </div>
      </main>

      <!-- Off, on a phone: the one filled button, in the thumb's reach. -->
      <div
        v-if="phone && !home.on && home.can_edit"
        class="sticky bottom-0 z-10 mt-auto bg-surface-base px-4 pb-3 pt-2"
      >
        <p
          v-if="errors.on"
          role="alert"
          class="pb-2 text-sm text-ink-red-7"
          data-conteos-error
        >
          {{ errors.on }}
        </p>
        <button
          type="button"
          :class="[FILLED, 'w-full']"
          :disabled="turningOn"
          data-conteos-encender
          @click="turnOn"
        >
          <span
            v-if="turningOn"
            class="lucide-loader-circle size-4 animate-spin"
            aria-hidden="true"
          />
          {{ __('Turn on', null, CTX) }}
        </button>
      </div>
    </template>
  </div>
</template>
<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import {
  AppBar,
  ChipGroup,
  EmptyState,
  ExpandTransition,
  KpiGrid,
  KpiTile,
  ListRow,
  Segmented,
} from '@/components/ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import ConteoComo from '@/components/inventario/ConteoComo.vue'
import ConteoGrupos from '@/components/inventario/ConteoGrupos.vue'
import ConteoMonto from '@/components/inventario/ConteoMonto.vue'
import ConteoPaso from '@/components/inventario/ConteoPaso.vue'
import ConteoPersona from '@/components/inventario/ConteoPersona.vue'
import {
  CTX,
  MINUTES,
  PRODUCTS,
  PROPOSED_MINUTES,
  conteosApi,
  countingDays,
  createWriter,
  cycleWords,
  dayOptions,
  decideRows,
  differenceOptions,
  isDenied,
  orderOptions,
  percentWords,
  productWords,
  readFailure,
  ruleOptions,
  toggleDay,
  turnOnArgs,
  unitOptions,
} from '@/components/inventario/conteos'
import { noteConteosDoor } from '@/components/inventario/conteosDoor'
import { isMobile as phone } from '@/composables/breakpoint'

// The one filled button of the page, and the tonal one of a failed read.
const FILLED =
  'press inline-flex min-h-12 flex-none items-center justify-center gap-2 rounded-full bg-[var(--muelle-accent)] px-6 text-base font-semibold text-[var(--muelle-accent-ink)] disabled:opacity-60'
const TONAL =
  'press inline-flex min-h-11 items-center justify-center rounded-full bg-surface-gray-3 px-5 text-base font-medium text-ink-gray-9'

const home = ref(null)
const failure = ref('')
const denied = ref('')
const errors = reactive({})
const busy = ref(0)
const openPerson = ref('')
const turningOn = ref(false)
// «Recuenta otra persona» was tapped and waits for its ceiling: nothing is
// saved until the amount is in, so Muelle never adjusts without one.
const askingCap = ref(false)
const capField = ref(null)

const writer = createWriter({
  page: home,
  errors,
  busy,
  onAnswer: (answer) => noteConteosDoor({ can_open: true, on: answer.on }),
})

// «Recuenta otra persona» on one line where the track has room for both
// choices; narrower, equal segments wrap their words instead of scrolling.
const { width: pageWidth } = useWindowSize()
const roomy = computed(() => pageWidth.value >= 380)

const settings = computed(() => home.value?.settings || {})
const byProducts = computed(() => settings.value.unit === 'products')
const cycle = computed(() => cycleWords(home.value?.kpis?.cycle_months))
const decide = computed(() =>
  home.value?.on ? decideRows(home.value.decide) : [],
)
const recounting = computed(
  () => askingCap.value || settings.value.differences === 'recount',
)
const differenceWords = computed(
  () =>
    differenceOptions().find(
      (option) => option.value === settings.value.differences,
    )?.label || '',
)

async function load() {
  failure.value = ''
  denied.value = ''
  try {
    writer.settle(await conteosApi.home())
    noteConteosDoor({ can_open: true, on: home.value.on })
  } catch (error) {
    if (isDenied(error)) denied.value = readFailure(error)
    else failure.value = readFailure(error)
  }
}
onMounted(load)

/** One of the shop's choices: the tap shows at once, the answer is the page. */
function saveShop(what, args, paint) {
  return writer.write(
    what,
    (page) => paint?.(page.settings),
    () => conteosApi.save(args),
  )
}

async function turnOn() {
  if (turningOn.value) return
  turningOn.value = true
  await writer.write('on', null, () => conteosApi.save(turnOnArgs(home.value)))
  turningOn.value = false
}
function turnOff() {
  writer.write(
    'on',
    (page) => {
      page.on = false
    },
    () => conteosApi.save({ on: 0 }),
  )
}

function setSize(value) {
  saveShop(
    'size',
    byProducts.value ? { products: value } : { minutes: value },
    (s) => {
      if (byProducts.value) s.products = value
      else s.minutes = value
    },
  )
}
function setUnit(unit) {
  if (unit === settings.value.unit) return
  // Back to minutes: the proposal, which the stepper then moves.
  const minutes = unit === 'products' ? 0 : PROPOSED_MINUTES
  saveShop('size', { minutes }, (s) => {
    s.unit = unit
    s.minutes = minutes
  })
}
function setRules(rules) {
  saveShop('first', { rules }, (s) => {
    s.rules = rules
  })
}
function setOrder(order) {
  // A second tap on the chosen one changes nothing: one of four always leads.
  if (!order || order === settings.value.order) return
  saveShop('first', { order }, (s) => {
    s.order = order
  })
}
function setDays(counting) {
  const before = countingDays(settings.value.skip_weekdays)
  const day =
    before.find((d) => !counting.includes(d)) ??
    counting.find((d) => !before.includes(d))
  if (day === undefined) return
  const skip = toggleDay(settings.value.skip_weekdays, day, {
    weekendOnly: settings.value.weekend_only,
  })
  saveShop('days', { skip_weekdays: skip }, (s) => {
    s.skip_weekdays = skip
  })
}

async function setDifferences(choice) {
  delete errors.differences
  if (choice === 'review') {
    askingCap.value = false
    if (settings.value.differences !== 'review')
      saveShop('differences', { differences: 'review' }, (s) => {
        s.differences = 'review'
      })
    return
  }
  if (settings.value.differences === 'recount') return
  // With a ceiling stored the choice saves on the tap; without one the field
  // opens for it and the choice goes with the amount.
  if (settings.value.cap) {
    saveShop('differences', { differences: 'recount' }, (s) => {
      s.differences = 'recount'
    })
    return
  }
  askingCap.value = true
  await nextTick()
  capField.value?.focus()
}
// Left empty, the choice was never made: the control shows what is stored.
function leaveCap(amount) {
  if (askingCap.value && !amount) askingCap.value = false
}
async function setCap(amount) {
  if (!amount) return
  const choosing = askingCap.value
  const args = choosing
    ? { differences: 'recount', cap: amount }
    : { cap: amount }
  const saved = await saveShop('differences', args, (s) => {
    s.cap = amount
    s.no_cap = false
    if (choosing) s.differences = 'recount'
  })
  // Saved, the stored choice shows it; refused, the choice goes back with the reason.
  if (choosing) askingCap.value = false
  return saved
}

function setPerson(person, what, args, paint) {
  const user = person.user
  // Switched off, their row closes: there is nothing left to set on it.
  if (what === 'counts' && !args.counts && openPerson.value === user)
    openPerson.value = ''
  writer.write(
    `p:${user}:${what}`,
    (page) => {
      const me = page.people.find((row) => row.user === user)
      if (me) paint?.(me)
    },
    () => conteosApi.setPerson(user, args),
  )
}
function setGroup(group, treatment, paint) {
  writer.write(
    `g:${group}`,
    (page) => paint?.(page.settings),
    () => conteosApi.setGroup(group, treatment),
  )
}
function setStore(name, args, paint) {
  writer.write(
    `w:${name}`,
    (page) => {
      const store = page.warehouses.find((row) => row.name === name)
      if (store) paint?.(store)
    },
    () => conteosApi.setWarehouse(name, args),
  )
}
</script>
