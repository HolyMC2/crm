<template>
  <ModuleLayout
    title="Cobranza"
    :entries="entries"
    :active-key="segment"
    @select="selectSegment"
  >
    <section
      v-if="guard"
      role="alert"
      class="mx-auto w-full max-w-xl space-y-4 p-6"
    >
      <h1 class="text-xl font-semibold">
        {{ __('Cobranza is not available') }}
      </h1>
      <p class="text-base text-ink-gray-7">{{ guard }}</p>
      <div class="flex flex-wrap gap-2">
        <Button :label="__('Retry permissions')" @click="retryBoot" />
        <Button :label="__('Copy access request')" @click="copyRequest" />
        <Button :label="__('Back', null, CTX)" @click="router.back()" />
      </div>
      <p v-if="copied" role="status" class="text-sm text-ink-gray-6">
        {{ copied }}
      </p>
    </section>
    <template v-else>
      <header
        class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
      >
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-semibold text-ink-gray-9">
            {{ segmentLabel(segment) }}
          </h1>
          <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
        </div>
      </header>
      <section
        v-if="auto"
        class="mx-4 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-outline-gray-2 p-3 sm:mx-6 sm:max-w-3xl"
        :aria-label="__('Automatic payment reminders')"
        data-auto-card
      >
        <FeatherIcon
          :name="auto.paused ? 'pause-circle' : 'send'"
          class="h-4 w-4 shrink-0 text-ink-gray-6"
        />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-ink-gray-9">
            {{ autoCard.title }}
          </p>
          <p v-if="autoCard.detail" class="text-sm text-ink-gray-6">
            {{ autoCard.detail }}
          </p>
        </div>
        <a
          v-if="autoCard.href"
          class="inline-flex min-h-11 items-center text-sm text-ink-blue-link underline sm:min-h-0"
          :href="autoCard.href"
          >{{ autoCard.button }}</a
        >
        <Button
          v-else-if="autoCard.copy"
          class="min-h-11 sm:min-h-8"
          :label="autoCard.button"
          @click="copyWhatsappRequest"
        />
        <Button
          v-else
          :variant="autoCard.solid ? 'solid' : 'subtle'"
          class="min-h-11 sm:min-h-8"
          :label="autoCard.button"
          @click="openSetup(autoCompany)"
        />
      </section>
      <dl
        v-if="stats"
        class="grid grid-cols-3 gap-2 px-4 pb-3 sm:max-w-xl sm:px-6"
        :aria-label="__('Totals')"
      >
        <!-- Totals in the company currency (one line per company currency);
             the part owed in another currency is named in its own. -->
        <div
          v-for="card in statCards"
          :key="card.key"
          class="rounded-lg bg-surface-gray-1 p-2"
        >
          <dt class="text-xs text-ink-gray-6">{{ card.label }}</dt>
          <dd
            v-for="total in totals"
            :key="`${card.key}:${total.currency}`"
            class="font-semibold tabular-nums"
            :class="card.key === 'overdue' ? 'text-ink-red-7' : ''"
          >
            {{
              total[card.key] === null || total[card.key] === undefined
                ? '—'
                : money(total[card.key], total.currency)
            }}
            <span
              v-if="foreignNote(total.foreign, card.key)"
              class="block text-xs font-normal text-ink-gray-6"
              >{{ foreignNote(total.foreign, card.key) }}</span
            >
          </dd>
        </div>
      </dl>
      <div class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
        <FormControl
          class="h-11 w-full sm:hidden"
          type="select"
          :aria-label="__('List', null, CTX)"
          :model-value="segment"
          :options="entries.map((e) => ({ label: e.label, value: e.value }))"
          @update:model-value="selectSegment"
        />
        <FormControl
          v-if="companies.length > 1"
          class="h-11 w-full sm:h-auto sm:w-56"
          type="select"
          :aria-label="__('Company')"
          :model-value="company"
          :options="[
            { label: __('All companies'), value: '' },
            ...companies.map((c) => ({ label: c, value: c })),
          ]"
          @update:model-value="(value) => update({ company: value })"
        />
        <FormControl
          v-model="search"
          class="min-w-0 flex-1 sm:max-w-xs [&_input]:min-h-11 sm:[&_input]:min-h-0"
          type="search"
          :placeholder="__('Search customer or invoice')"
          :aria-label="__('Search customer or invoice')"
        />
      </div>
      <p
        v-if="capped"
        class="mx-4 mb-2 text-sm text-ink-gray-6 sm:mx-6"
        role="status"
      >
        {{
          __(
            'Showing the most recent invoices only. Search a customer to see all of theirs.',
          )
        }}
      </p>
      <div
        v-if="problem"
        role="alert"
        class="mx-4 mb-3 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7 sm:mx-6"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <Button class="ml-2" :label="__('Retry', null, CTX)" @click="load()" />
      </div>
      <div class="pb-6">
        <div
          v-if="loading && !rows.length"
          role="status"
          class="px-6 py-8 text-sm text-ink-gray-6"
        >
          {{ __('Loading what customers owe…') }}
        </div>
        <div
          v-else-if="!rows.length"
          class="mx-auto max-w-md px-6 py-10 text-center text-ink-gray-7"
        >
          <p class="text-lg font-semibold">{{ emptyTitle }}</p>
          <p class="mt-1 text-sm">{{ emptyBody }}</p>
        </div>
        <ul v-else class="divide-y divide-outline-gray-1">
          <li
            v-for="row in rows"
            :key="`${row.customer}:${row.company}:${row.currency}`"
          >
            <RouterLink
              :to="{
                name: 'CobranzaCliente',
                params: { customer: row.customer },
                query: { company: row.company, list: listPath },
              }"
              class="flex min-h-14 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link sm:px-6"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium text-ink-gray-9">
                  {{ row.customer_name }}
                </span>
                <span class="block truncate text-sm text-ink-gray-6">
                  <span :class="toneClass(agingTone(row))">{{
                    agingLabel(row, today)
                  }}</span>
                  ·
                  {{
                    row.invoices === 1
                      ? __('1 invoice')
                      : __('{0} invoices', [row.invoices])
                  }}
                  <template v-if="companies.length > 1">
                    · {{ row.company }}</template
                  >
                </span>
                <span class="mt-1 flex flex-wrap gap-1">
                  <Badge
                    v-if="promiseChip(row.promise, row.currency)"
                    :theme="promiseChip(row.promise, row.currency).theme"
                    :label="promiseChip(row.promise, row.currency).label"
                  />
                  <Badge
                    v-if="reminderChip(row.last_reminder)"
                    :theme="reminderChip(row.last_reminder).theme"
                    :label="reminderChip(row.last_reminder).label"
                  />
                  <Badge
                    v-if="autoChip(row.auto, today)"
                    :theme="autoChip(row.auto, today).theme"
                    :label="autoChip(row.auto, today).label"
                    data-auto-chip
                  />
                </span>
              </span>
              <span class="shrink-0 text-right">
                <span
                  class="block text-sm font-medium tabular-nums text-ink-gray-9"
                  >{{ money(row.outstanding, row.currency) }}</span
                >
                <span
                  v-if="
                    isForeign(row.currency, row.company_currency) &&
                    row.base_outstanding !== undefined
                  "
                  class="block text-xs tabular-nums text-ink-gray-6"
                  >{{
                    approxMoney(row.base_outstanding, row.company_currency)
                  }}</span
                >
                <span
                  v-if="
                    row.overdue_amount > 0 &&
                    row.overdue_amount < row.outstanding
                  "
                  class="block text-xs tabular-nums text-ink-red-7"
                  >{{
                    __('{0} overdue', [money(row.overdue_amount, row.currency)])
                  }}</span
                >
              </span>
            </RouterLink>
            <!-- «Recordatorios de hoy»: what the automatic reminders leave to a person. -->
            <div
              v-if="segment === 'recordar' && row.auto?.manual"
              class="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6"
            >
              <p class="w-full text-sm text-ink-gray-7">
                <template v-if="row.auto.level_label"
                  >{{ row.auto.level_label }} ·
                </template>
                {{ row.auto.reason }}
              </p>
              <template v-if="row.auto.actions.includes('share')">
                <Button
                  v-if="caps.remind"
                  variant="solid"
                  class="min-h-11 sm:min-h-8"
                  :label="__('Prepare and send')"
                  :loading="busyRow === rowKey(row)"
                  @click="shareRow(row)"
                />
                <Button
                  v-else
                  class="min-h-11 sm:min-h-8"
                  :label="__('Copy access request')"
                  @click="copyRemindRequest(row)"
                />
              </template>
              <Button
                v-if="row.auto.actions.includes('open')"
                class="min-h-11 sm:min-h-8"
                :label="__('Review invoice')"
                @click="openRow(row)"
              />
              <Button
                v-if="row.auto.actions.includes('call')"
                class="min-h-11 sm:min-h-8"
                :label="__('Log call')"
                @click="openRow(row, 'llamar')"
              />
            </div>
          </li>
        </ul>
        <div v-if="hasMore" class="px-4 py-4 sm:px-6">
          <Button
            :label="__('Load more', null, CTX)"
            :loading="loading"
            class="min-h-11 w-full sm:w-auto"
            @click="load(true)"
          />
        </div>
        <nav
          :aria-label="__('Other collection documents')"
          class="flex flex-col gap-1 px-4 pt-4 text-sm sm:px-6"
        >
          <a
            class="min-h-11 py-2 text-ink-blue-link underline"
            href="/app/query-report/Accounts Receivable"
            >{{ __('Receivables report') }}</a
          >
          <a
            class="min-h-11 py-2 text-ink-blue-link underline"
            href="/app/dunning"
            >{{ __('All reminder letters') }}</a
          >
        </nav>
      </div>
    </template>
    <AutoSetupSheet
      v-model="setupOpen"
      :company="setupCompany"
      @saved="onSetupSaved"
    />
    <CobranzaSendSheet
      v-model="sendOpen"
      doctype="Dunning"
      :name="sendName"
      :customer-name="sendRow?.customer_name || ''"
      manual-done
      :confirming="confirming"
      @sent="load()"
      @manual-sent="confirmManual"
    />
  </ModuleLayout>
</template>
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Badge, Button, FeatherIcon, FormControl, toast } from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import AutoSetupSheet from '@/components/cobranza/AutoSetupSheet.vue'
import CobranzaSendSheet from '@/components/cobranza/CobranzaSendSheet.vue'
import {
  AUTO_ACTION_LABELS,
  AUTO_API,
  CTX,
  SEGMENTS,
  autoChip,
  agingLabel,
  agingTone,
  approxMoney,
  cobranzaApi,
  cobranzaBoot,
  foreignNote,
  isForeign,
  loadCobranzaBoot,
  money,
  normalizeSegment,
  outcomeUnknown,
  problemOf,
  promiseChip,
  reminderChip,
  requestId,
  segmentLabel,
  statTotals,
} from '@/composables/useCobranza'

const route = useRoute()
const router = useRouter()
const boot = cobranzaBoot
const rows = ref([])
const counts = ref({})
const stats = ref(null)
const capped = ref(false)
const hasMore = ref(false)
const loading = ref(false)
const problem = ref(null)
const copied = ref('')
const today = ref('')
const segment = computed(() => normalizeSegment(route.query.segment))
const company = computed(() =>
  typeof route.query.company === 'string' ? route.query.company : '',
)
const companies = computed(() => boot.value?.companies || [])
const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const listPath = computed(() => route.fullPath)
const totals = computed(() => statTotals(stats.value))
const statCards = computed(() => [
  { key: 'outstanding', label: __('To collect') },
  { key: 'overdue', label: __('Overdue', null, CTX) },
  { key: 'collected_today', label: __('Collected today') },
])
let ticket = 0
let searchTimer = 0

// ── Recordatorios automáticos ─────────────────────────────────────────────
const auto = ref(null)
const setupOpen = ref(false)
const setupCompany = ref('')
const sendOpen = ref(false)
const sendName = ref('')
const sendRow = ref(null)
const busyRow = ref('')
const confirming = ref(false)
// One request id per pending action: a retry after a lost answer reuses it.
const pending = {}
const caps = computed(() => boot.value?.capabilities || {})
const autoCompany = computed(
  () =>
    company.value || boot.value?.default_company || companies.value[0] || '',
)
const autoCard = computed(() => {
  const a = auto.value
  if (!a) return {}
  const where = companies.value.length > 1 ? ` · ${a.company}` : ''
  if (a.mode === 'off')
    return {
      title: __('WhatsApp is turned off') + where,
      detail: __(
        'Automatic reminders need WhatsApp turned on for the business.',
      ),
      button: a.can_configure
        ? __(AUTO_ACTION_LABELS.whatsapp_settings)
        : __('Copy request for the owner'),
      href: a.can_configure ? '/app/whatsapp-settings' : '',
      copy: !a.can_configure,
    }
  if (a.paused)
    return {
      title: __('Automatic reminders: paused') + where,
      detail: a.paused.reason,
      button: __(AUTO_ACTION_LABELS[a.paused.action] || 'Settings'),
      solid: true,
    }
  if (a.enabled)
    return {
      title: __('Automatic reminders: on') + where,
      detail:
        a.mode === 'manual'
          ? __(
              'Your business sends WhatsApp from its phone: the due ones wait in this list for you.',
            )
          : __('In the name of {0} · Monday to Saturday {1}–{2}', [
              a.sender?.full_name || '',
              a.window.from,
              a.window.to,
            ]),
      button: __('Settings'),
    }
  return {
    title: __('Automatic reminders: off') + where,
    detail: __(
      'Switch them on and every overdue invoice gets its reminder on day 1, 7 and 15.',
    ),
    button: __('Switch on automatic reminders'),
    solid: true,
  }
})

async function loadAuto() {
  const target = autoCompany.value
  if (!target) {
    auto.value = null
    return
  }
  try {
    const data = await cobranzaApi(`${AUTO_API}.get_setup`, {
      company: target,
    })
    if (target === autoCompany.value) auto.value = data
  } catch {
    // The lists work without it; the card simply stays hidden.
    auto.value = null
  }
}

function openSetup(target) {
  setupCompany.value = target || autoCompany.value
  setupOpen.value = true
}

function onSetupSaved() {
  // Only the parts that changed, in place: the card and the rows' states.
  loadAuto()
  load()
}

function rowKey(row) {
  return `${row.customer}:${row.company}:${row.currency}`
}

async function shareRow(row) {
  const key = `remind:${row.auto.invoice}`
  pending[key] = pending[key] || requestId()
  busyRow.value = rowKey(row)
  problem.value = null
  try {
    const result = await cobranzaApi('send_reminder_prepare', {
      request_id: pending[key],
      invoice: row.auto.invoice,
    })
    delete pending[key]
    sendRow.value = row
    sendName.value = result.dunning
    sendOpen.value = true
  } catch (error) {
    if (!outcomeUnknown(error)) delete pending[key]
    problem.value = problemOf(error)
  } finally {
    busyRow.value = ''
  }
}

async function confirmManual() {
  const row = sendRow.value
  if (!row) return
  const key = `sent:${row.auto.invoice}`
  pending[key] = pending[key] || requestId()
  confirming.value = true
  try {
    await cobranzaApi('log_call', {
      request_id: pending[key],
      invoice: row.auto.invoice,
      outcome: 'whatsapp',
    })
    delete pending[key]
    sendOpen.value = false
    toast.success(__('Saved: you sent the reminder from your phone'))
    load()
  } catch (error) {
    if (!outcomeUnknown(error)) delete pending[key]
    problem.value = problemOf(error)
  } finally {
    confirming.value = false
  }
}

function openRow(row, action = '') {
  router.push({
    name: 'CobranzaCliente',
    params: { customer: row.customer },
    query: {
      company: row.company,
      list: listPath.value,
      ...(action ? { accion: action, factura: row.auto?.invoice } : {}),
    },
  })
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(__('Request copied. Share it with your manager.'))
  } catch {
    toast.success(text)
  }
}
function copyRemindRequest(row) {
  return copyText(
    __(
      'I need permission to send payment reminders in Cobranza (create and submit Dunning) for invoice {0}.',
      [row.auto.invoice],
    ),
  )
}
function copyWhatsappRequest() {
  return copyText(
    __(
      'Please turn on WhatsApp for the business so Cobranza can send payment reminders.',
    ),
  )
}

function openFromNotice() {
  // Avisos opens /crm/cobranza?ajustes=<company> to fix paused reminders.
  const target = route.query.ajustes
  if (typeof target !== 'string' || !target) return
  openSetup(target)
  const query = { ...route.query }
  delete query.ajustes
  router.replace({ query })
}

const entries = computed(() =>
  SEGMENTS.map((s) => ({
    ...s,
    label:
      counts.value[s.value] !== undefined
        ? `${segmentLabel(s.value)} (${counts.value[s.value]})`
        : segmentLabel(s.value),
  })),
)
const guard = computed(() =>
  boot.value && !boot.value.enabled
    ? boot.value.reason ||
      __('Ask your manager for permission to read sales invoices.')
    : '',
)
const subtitle = computed(
  () =>
    ({
      vencidas: __('Customers with invoices past their due date.'),
      hoy: __('Invoices due today or in the next 7 days.'),
      promesas: __('Customers who promised to pay; broken promises first.'),
      todas: __('Everything customers owe, largest balance first.'),
      recordar: __(
        'Reminders due today that you send yourself: from your phone, or after a review.',
      ),
    })[segment.value],
)
const emptyTitle = computed(() =>
  search.value ? __('No customers match') : __('Nothing to collect here'),
)
const emptyBody = computed(() =>
  search.value
    ? __('Try another customer name or invoice number.')
    : segment.value === 'promesas'
      ? __('When a customer promises a payment date, it shows up here.')
      : segment.value === 'recordar'
        ? __(
            'When an automatic reminder cannot go out by itself, it waits here for you.',
          )
        : __('Customers with a pending balance show up here.'),
)

function toneClass(tone) {
  return (
    { red: 'text-ink-red-7', orange: 'text-ink-amber-9' }[tone] ||
    'text-ink-gray-6'
  )
}

async function load(more = false) {
  const mine = ++ticket
  loading.value = true
  problem.value = null
  try {
    const page = await cobranzaApi('get_queue', {
      segment: segment.value,
      company: company.value,
      search: search.value.trim(),
      start: more ? rows.value.length : 0,
      page_length: 30,
    })
    if (mine !== ticket) return
    rows.value = more ? [...rows.value, ...page.rows] : page.rows
    hasMore.value = page.has_more
    counts.value = page.counts || {}
    stats.value = page.stats
    capped.value = page.capped
    today.value = page.today
  } catch (error) {
    if (mine === ticket) problem.value = problemOf(error)
  } finally {
    if (mine === ticket) loading.value = false
  }
}

function update(query) {
  const next = { ...route.query, ...query }
  for (const key of Object.keys(next)) if (!next[key]) delete next[key]
  router.replace({ query: next })
}
function selectSegment(value) {
  update({ segment: normalizeSegment(value) })
}

async function retryBoot() {
  await loadCobranzaBoot({ refresh: true })
  if (boot.value?.enabled) load()
}
async function copyRequest() {
  const text = __(
    'I need access to Cobranza: read permission for Sales Invoice so I can follow what customers owe.',
  )
  try {
    await navigator.clipboard.writeText(text)
    copied.value = __('Request copied. Share it with your manager.')
  } catch {
    copied.value = text
  }
}

watch(search, (value) => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => update({ q: value.trim() }), 250)
})
watch(
  () => [route.query.segment, route.query.q, route.query.company],
  () => {
    if (route.name === 'Cobranza' && boot.value?.enabled) load()
  },
)
watch(autoCompany, () => {
  if (route.name === 'Cobranza' && boot.value?.enabled) loadAuto()
})
watch(
  () => route.query.ajustes,
  () => {
    if (route.name === 'Cobranza' && boot.value?.enabled) openFromNotice()
  },
)
onMounted(async () => {
  await loadCobranzaBoot()
  if (boot.value?.enabled) {
    load()
    loadAuto()
    openFromNotice()
  }
})
</script>
