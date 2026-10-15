<template>
  <ModuleLayout
    title="Cobranza"
    :entries="entries"
    :active-key="state.segment"
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
    <div
      v-else
      ref="scroller"
      class="min-h-0 flex-1 overflow-y-auto"
      data-cobranza-scroller
      @scroll.passive="rememberScroll"
    >
      <!-- Phone: Cobranza's own app bar (route meta.ownPhoneHeader), like the
           Agenda's: the list as its title (tap: choose another), search, select. -->
      <header
        v-if="phone"
        class="sticky top-0 z-20 border-b border-outline-gray-1 bg-surface-base pt-[env(safe-area-inset-top)]"
        data-cobranza-appbar
      >
        <div class="flex min-h-14 items-center gap-1 px-1">
          <template v-if="selecting">
            <button
              type="button"
              class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
              :aria-label="__('Clear selection')"
              @click="clearSelection"
            >
              <FeatherIcon name="x" class="h-6 w-6" />
            </button>
            <p class="min-w-0 flex-1 truncate text-lg font-semibold">
              {{
                selected.size === 1
                  ? __('1 selected')
                  : __('{0} selected', [selected.size])
              }}
            </p>
            <button
              type="button"
              class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
              :aria-label="__('Select the visible page')"
              @click="selectAll"
            >
              <FeatherIcon name="check-square" class="h-6 w-6" />
            </button>
          </template>
          <template v-else-if="searchOpen">
            <button
              type="button"
              class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
              :aria-label="__('Close search')"
              @click="closeSearch"
            >
              <FeatherIcon name="arrow-left" class="h-6 w-6" />
            </button>
            <input
              ref="phoneSearch"
              v-model="search"
              type="search"
              enterkeyhint="search"
              class="h-11 min-w-0 flex-1 rounded-lg border-0 bg-surface-gray-2 px-3 text-base"
              :placeholder="__('Search customer or invoice')"
              :aria-label="__('Search customer or invoice')"
              data-cobranza-search
            />
          </template>
          <template v-else>
            <button
              type="button"
              class="flex min-h-12 min-w-0 flex-1 items-center gap-1 rounded-lg px-3 text-left"
              :aria-label="__('Choose a list')"
              :aria-expanded="segmentSheet"
              data-cobranza-title
              @click="segmentSheet = true"
            >
              <span class="truncate text-lg font-semibold">{{
                segmentLabel(state.segment)
              }}</span>
              <span
                v-if="counts[state.segment] !== undefined"
                class="shrink-0 text-base text-ink-gray-6"
                >({{ counts[state.segment] }})</span
              >
              <FeatherIcon
                name="chevron-down"
                class="h-5 w-5 shrink-0 text-ink-gray-6"
              />
            </button>
            <FeatherIcon
              v-if="loading && rows.length"
              name="loader"
              class="h-5 w-5 shrink-0 animate-spin text-ink-gray-6"
              role="status"
              :aria-label="__('Loading')"
            />
            <button
              type="button"
              class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
              :aria-label="__('Search customer or invoice')"
              @click="openSearch"
            >
              <FeatherIcon name="search" class="h-6 w-6" />
            </button>
            <button
              v-if="rows.length"
              type="button"
              class="flex size-12 items-center justify-center rounded-full text-ink-gray-7"
              :aria-label="__('Select customers')"
              @click="selecting = true"
            >
              <FeatherIcon name="check-square" class="h-6 w-6" />
            </button>
          </template>
        </div>
        <!-- What is owed, always in sight while the list scrolls. -->
        <div
          v-if="split.length"
          class="flex flex-wrap gap-x-4 border-t border-outline-gray-1 px-4 py-2 text-sm"
          :aria-label="__('Totals')"
          data-cobranza-summary
        >
          <template v-for="part in split" :key="part.currency">
            <span
              >{{ __('Overdue', null, CTX) }}
              <strong class="tabular-nums text-ink-red-7">{{
                money(part.overdue, part.currency)
              }}</strong></span
            >
            <span
              >{{ __('Not due yet') }}
              <strong class="tabular-nums">{{
                money(part.upcoming, part.currency)
              }}</strong></span
            >
          </template>
        </div>
      </header>
      <header
        v-else
        class="flex flex-wrap items-center gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-6"
      >
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-xl font-semibold text-ink-gray-9">
            {{ segmentLabel(state.segment) }}
          </h1>
          <p class="text-sm text-ink-gray-6">{{ subtitle }}</p>
        </div>
        <button
          type="button"
          class="text-sm text-ink-gray-6 hover:text-ink-gray-8"
          :aria-keyshortcuts="'Alt+H'"
          @click="openShortcutSheet()"
        >
          <kbd
            class="rounded border border-outline-gray-2 px-1.5 py-0.5 text-xs"
            >?</kbd
          >
          {{ __('Keyboard shortcuts') }}
        </button>
      </header>

      <section
        v-if="auto"
        class="mx-4 my-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-outline-gray-2 p-3 sm:mx-6 sm:mt-0 sm:max-w-3xl"
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
          class="min-h-11 w-full sm:min-h-8 sm:w-auto"
          :label="autoCard.button"
          @click="copyWhatsappRequest"
        />
        <Button
          v-else
          :variant="autoCard.solid ? 'solid' : 'subtle'"
          class="min-h-11 w-full sm:min-h-8 sm:w-auto"
          :label="autoCard.button"
          @click="openSetup(autoCompany)"
        />
      </section>
      <dl
        v-if="stats && !phone"
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
      <div
        class="flex flex-wrap items-center gap-2 px-4 pb-2 pt-2 sm:px-6 sm:pt-0"
      >
        <FormControl
          v-if="companies.length > 1"
          class="h-11 w-full sm:h-auto sm:w-56"
          type="select"
          :aria-label="__('Company')"
          :model-value="state.company"
          :options="[
            { label: __('All companies'), value: '' },
            ...companies.map((c) => ({ label: c, value: c })),
          ]"
          @update:model-value="(value) => navigate({ company: value })"
        />
        <FormControl
          v-if="!phone"
          v-model="search"
          class="min-w-0 flex-1 sm:max-w-xs"
          type="search"
          :placeholder="__('Search customer or invoice')"
          :aria-label="__('Search customer or invoice')"
          :aria-keyshortcuts="'/'"
          data-cobranza-search
        />
      </div>
      <!-- Aging chips: the customer's oldest overdue invoice, as in the receivables report. -->
      <div
        class="flex gap-2 overflow-x-auto px-4 pb-3 sm:flex-wrap sm:px-6"
        role="group"
        :aria-label="__('Days overdue')"
        data-cobranza-aging
      >
        <button
          v-for="chip in agingChips"
          :key="chip.value || 'all'"
          type="button"
          class="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3 text-sm sm:min-h-8"
          :class="
            state.edad === chip.value
              ? 'border-outline-gray-4 bg-surface-gray-10 text-ink-base'
              : 'border-outline-gray-2 text-ink-gray-8 hover:bg-surface-gray-2'
          "
          :aria-pressed="state.edad === chip.value"
          @click="navigate({ edad: chip.value })"
        >
          {{ chip.label }}
          <span
            v-if="chip.count !== undefined"
            class="tabular-nums"
            :class="state.edad === chip.value ? '' : 'text-ink-gray-6'"
            >{{ chip.count }}</span
          >
        </button>
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
        <Button
          class="ml-2"
          :label="__('Retry', null, CTX)"
          @click="load({ quiet: true })"
        />
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
          <Button
            v-if="state.edad"
            class="mt-3 min-h-11 sm:min-h-8"
            :label="__('Show every age')"
            @click="navigate({ edad: '' })"
          />
        </div>
        <ul
          v-else
          ref="listbox"
          tabindex="0"
          class="divide-y divide-outline-gray-1 focus:outline-none"
          role="listbox"
          :aria-label="segmentLabel(state.segment)"
          :aria-multiselectable="true"
          :aria-activedescendant="focusKey ? domId(focusKey) : undefined"
        >
          <li
            v-for="row in rows"
            :id="domId(rowKey(row))"
            :key="rowKey(row)"
            role="option"
            :aria-selected="selected.has(rowKey(row))"
            :data-row-key="rowKey(row)"
            class="group relative"
            :class="[
              focusKey === rowKey(row) ? 'bg-surface-gray-2' : '',
              selected.has(rowKey(row)) ? 'bg-surface-blue-1' : '',
            ]"
          >
            <div class="flex items-start">
              <label
                v-if="!phone || selecting"
                class="flex min-h-14 shrink-0 cursor-pointer items-center pl-5"
                :aria-label="__('Select {0}', [row.customer_name])"
              >
                <input
                  type="checkbox"
                  class="h-5 w-5 rounded"
                  :checked="selected.has(rowKey(row))"
                  @change="toggleRow(row)"
                />
              </label>
              <a
                :href="customerHref(row.customer, customerRoute(row).query)"
                class="flex min-h-14 min-w-0 flex-1 items-start gap-3 px-4 py-3 hover:bg-surface-gray-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink-blue-link"
                :class="!phone || selecting ? 'pl-2' : ''"
                @click="onRowClick($event, row)"
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
                      v-if="followupChip(row.followup, today)"
                      :theme="followupChip(row.followup, today).theme"
                      :label="followupChip(row.followup, today).label"
                      data-followup-chip
                    />
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
                      __('{0} overdue', [
                        money(row.overdue_amount, row.currency),
                      ])
                    }}</span
                  >
                </span>
              </a>
            </div>
            <!-- Desktop: the row's actions on hover or keyboard focus (same keys as the sheet). -->
            <!-- The focused row's actions, each with its key (desktop; a phone opens the record). -->
            <div
              v-if="!phone && row.target && focusKey === rowKey(row)"
              class="flex flex-wrap justify-end gap-1 px-4 pb-2"
              data-row-actions
            >
              <Button
                v-for="action in rowActions"
                :key="action.key"
                size="sm"
                variant="ghost"
                :label="`${action.label} · ${action.hint}`"
                :aria-keyshortcuts="action.hint"
                @click="runRow(action.key, row)"
              >
                <template #prefix>
                  <FeatherIcon :name="action.icon" class="h-4 w-4" />
                </template>
              </Button>
            </div>
            <!-- «Recordatorios de hoy»: what the automatic reminders leave to a person. -->
            <div
              v-if="state.segment === 'recordar' && row.auto?.manual"
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
            @click="load({ more: true })"
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

      <!-- The selection's actions: at the thumb on a phone, under the list on a desk. -->
      <div
        v-if="selected.size"
        class="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t border-outline-gray-2 bg-surface-base px-4 py-3 shadow-lg sm:px-6"
        role="region"
        :aria-label="__('Selected customers')"
        data-cobranza-bulkbar
      >
        <p class="min-w-0 flex-1 text-sm font-medium">
          {{
            selected.size === 1
              ? __('1 selected')
              : __('{0} selected', [selected.size])
          }}
        </p>
        <Button
          v-if="caps.remind"
          variant="solid"
          class="min-h-12 sm:min-h-8"
          :label="__('Send reminder')"
          @click="bulkOpen = true"
        >
          <template #prefix
            ><FeatherIcon name="send" class="h-4 w-4"
          /></template>
        </Button>
        <Button
          v-else
          class="min-h-12 sm:min-h-8"
          :label="__('Copy access request')"
          @click="copyBulkRequest"
        />
        <Button
          variant="ghost"
          class="min-h-12 sm:min-h-8"
          :label="__('Clear selection')"
          @click="clearSelection"
        />
      </div>
    </div>

    <!-- Phone: the lists, in a sheet from the app bar's title. -->
    <BottomSheet
      v-if="phone"
      :open="segmentSheet"
      :title="''"
      @update:open="(value) => (segmentSheet = value)"
    >
      <nav class="px-3 pb-6" :aria-label="__('Choose a list')">
        <button
          v-for="entry in entries"
          :key="entry.value"
          type="button"
          class="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left text-base"
          :class="
            state.segment === entry.value
              ? 'bg-surface-gray-2 font-semibold'
              : 'hover:bg-surface-gray-1'
          "
          :aria-current="state.segment === entry.value ? 'page' : undefined"
          @click="selectSegment(entry.value)"
        >
          <FeatherIcon :name="entry.icon" class="h-5 w-5 text-ink-gray-6" />
          <span class="flex-1">{{ segmentLabel(entry.value) }}</span>
          <span class="tabular-nums text-ink-gray-6">{{
            counts[entry.value] ?? ''
          }}</span>
        </button>
      </nav>
    </BottomSheet>

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
      :manual-done="sendManual"
      :confirming="confirming"
      @sent="load({ quiet: true })"
      @manual-sent="confirmManual"
    />
    <PromiseSheet
      v-model="promiseOpen"
      :invoice="sheetRow?.target ? targetInvoice(sheetRow) : null"
      :today="today"
      @saved="(result) => saved(undoer.promiseSaved, result)"
    />
    <CallSheet
      v-model="callOpen"
      :invoice="sheetRow?.target ? targetInvoice(sheetRow) : null"
      @saved="(result) => saved(undoer.callSaved, result)"
    />
    <PaymentSheet
      v-model="payOpen"
      :customer="sheetRow?.customer || ''"
      :company="sheetRow?.company || ''"
      :customer-name="sheetRow?.customer_name || ''"
      :caps="caps"
      @saved="(result) => saved(undoer.paymentSaved, result)"
      @collect="(invoice) => collectAtRegister(sheetRow, invoice)"
    />
    <FollowupSheet
      v-model="followupOpen"
      :customer="sheetRow?.customer || ''"
      :customer-name="sheetRow?.customer_name || ''"
      :followup="sheetRow?.followup || null"
      :today="today"
      :focus="followupFocus"
      @saved="followupSaved"
    />
    <BulkRemindSheet
      v-model="bulkOpen"
      :rows="selectedRows"
      @done="onBulkDone"
      @open="openBulkResult"
    />
  </ModuleLayout>
</template>
<script setup>
import {
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Badge,
  BottomSheet,
  Button,
  FeatherIcon,
  FormControl,
  toast,
} from 'frappe-ui'
import ModuleLayout from '@/components/shell/ModuleLayout.vue'
import AutoSetupSheet from '@/components/cobranza/AutoSetupSheet.vue'
import BulkRemindSheet from '@/components/cobranza/BulkRemindSheet.vue'
import CallSheet from '@/components/cobranza/CallSheet.vue'
import CobranzaSendSheet from '@/components/cobranza/CobranzaSendSheet.vue'
import FollowupSheet from '@/components/cobranza/FollowupSheet.vue'
import PaymentSheet from '@/components/cobranza/PaymentSheet.vue'
import PromiseSheet from '@/components/cobranza/PromiseSheet.vue'
import { isMobile } from '@/composables/breakpoint'
import {
  appleKeys,
  openShortcutSheet,
  registerPageKeys,
} from '@/composables/shellKeyboard'
import { hoyLive } from '@/composables/useHoy'
import { powerListPageKeys } from '@/utils/powerList'
import {
  AGING,
  AUTO_ACTION_LABELS,
  AUTO_API,
  CTX,
  QUEUE_KEYS,
  SEGMENTS,
  agingChipLabel,
  agingLabel,
  agingTone,
  approxMoney,
  autoChip,
  cobranzaApi,
  cobranzaBoot,
  customerHref,
  cssValue,
  followupChip,
  foreignNote,
  isForeign,
  keyAction,
  listHref,
  listMemoryKey,
  loadCobranzaBoot,
  money,
  moveFocus,
  normalizeSegment,
  outcomeUnknown,
  owedSplit,
  problemOf,
  promiseChip,
  queueQuery,
  queueShortcuts,
  queueState,
  rangeKeys,
  reminderChip,
  requestId,
  rowForCustomer,
  rowKey,
  segmentLabel,
  statTotals,
} from '@/composables/useCobranza'
import { useCobranzaUndo } from '@/composables/useCobranzaActions'
import { posCollectHref } from '@/utils/posHandoff'
import { isTypingTarget } from '@/vendor/muelle-shell/contracts'
import { useLiveWatch } from '@/vendor/muelle-shell/live-sync/vue'

const PAGE = 30
// The server's page limit: a list restored after a visit reloads at most this many.
const MAX_PAGE = 100
// Doctypes whose changes may change this list (Cobranza's own writes also announce the invoice).
const LIVE_DOCTYPES = [
  'Sales Invoice',
  'Payment Entry',
  'Dunning',
  'ToDo',
  'Comment',
]

const route = useRoute()
const router = useRouter()
const phone = isMobile
const boot = cobranzaBoot
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
const scroller = ref(null)
const listbox = ref(null)
const phoneSearch = ref(null)
const rows = ref([])
const counts = ref({})
const agingCounts = ref({})
const stats = ref(null)
const capped = ref(false)
const hasMore = ref(false)
const loading = ref(false)
const problem = ref(null)
const copied = ref('')
const today = ref('')
// The URL is the state: list, search, company, aging chip and focused customer.
const state = computed(() => queueState(route.query))
const companies = computed(() => boot.value?.companies || [])
const search = ref(state.value.q)
const searchOpen = ref(Boolean(state.value.q))
const segmentSheet = ref(false)
const totals = computed(() => statTotals(stats.value))
const split = computed(() => owedSplit(totals.value))
const statCards = computed(() => [
  { key: 'outstanding', label: __('To collect') },
  { key: 'overdue', label: __('Overdue', null, CTX) },
  { key: 'collected_today', label: __('Collected today') },
])
let ticket = 0
let searchTimer = 0

// ── focus and selection ───────────────────────────────────────────────────
const focusKey = ref('')
const selected = ref(new Set())
const anchor = ref('')
const selecting = ref(false)
const keys = computed(() => rows.value.map(rowKey))
const selectedRows = computed(() =>
  rows.value.filter((row) => selected.value.has(rowKey(row))),
)
const domId = (key) =>
  `cobranza-row-${Array.from(key)
    .map((c) => c.charCodeAt(0).toString(36))
    .join('')}`

// ── Recordatorios automáticos ─────────────────────────────────────────────
const auto = ref(null)
const setupOpen = ref(false)
const setupCompany = ref('')
const sendOpen = ref(false)
const sendName = ref('')
const sendRow = ref(null)
const sendManual = ref(false)
const busyRow = ref('')
const confirming = ref(false)
// One request id per pending action: a retry after a lost answer reuses it.
const pending = {}
const caps = computed(() => boot.value?.capabilities || {})
const autoCompany = computed(
  () =>
    state.value.company ||
    boot.value?.default_company ||
    companies.value[0] ||
    '',
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
  load({ quiet: true })
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
    sendManual.value = true
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
  const invoice = row?.auto?.invoice || row?.target?.invoice
  if (!invoice) return
  const key = `sent:${invoice}`
  pending[key] = pending[key] || requestId()
  confirming.value = true
  try {
    await cobranzaApi('log_call', {
      request_id: pending[key],
      invoice,
      outcome: 'whatsapp',
    })
    delete pending[key]
    sendOpen.value = false
    toast.success(__('Saved: you sent the reminder from your phone'))
    load({ quiet: true })
  } catch (error) {
    if (!outcomeUnknown(error)) delete pending[key]
    problem.value = problemOf(error)
  } finally {
    confirming.value = false
  }
}

/** The record's route; going back lands on this row of this list. */
function customerRoute(row, extra = {}) {
  return {
    name: 'CobranzaCliente',
    params: { customer: row.customer },
    query: {
      company: row.company,
      list: listHref(queueQuery(route.query, { cliente: row.customer })),
      ...extra,
    },
  }
}

async function openRow(row, action = '', invoice = '') {
  // The list's history entry keeps this row first, so «back» lands on it.
  await focusRow(row)
  router.push(
    customerRoute(
      row,
      action
        ? { accion: action, factura: invoice || row.auto?.invoice || '' }
        : {},
    ),
  )
}

function onRowClick(event, row) {
  // A new tab keeps the link; here the focus moves first so going back lands on the row.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return
  event.preventDefault()
  openRow(row)
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
      [row.auto?.invoice || row.target?.invoice || ''],
    ),
  )
}
function copyBulkRequest() {
  return copyText(
    __(
      'I need permission to send payment reminders in Cobranza (create and submit Dunning).',
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
const agingChips = computed(() => [
  { value: '', label: __('Any age') },
  ...AGING.map((chip) => ({
    value: chip.value,
    label: agingChipLabel(chip.value),
    count: agingCounts.value[chip.value],
  })),
])
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
      mios: __('Customers you collect from; the follow-ups due first.'),
      todas: __('Everything customers owe, largest balance first.'),
      recordar: __(
        'Reminders due today that you send yourself: from your phone, or after a review.',
      ),
    })[state.value.segment],
)
const emptyTitle = computed(() =>
  state.value.q ? __('No customers match') : __('Nothing to collect here'),
)
const emptyBody = computed(() =>
  state.value.q
    ? __('Try another customer name or invoice number.')
    : state.value.segment === 'promesas'
      ? __('When a customer promises a payment date, it shows up here.')
      : state.value.segment === 'mios'
        ? __(
            'Assign yourself as collector of a customer (key A) and they show up here.',
          )
        : state.value.segment === 'recordar'
          ? __(
              'When an automatic reminder cannot go out by itself, it waits here for you.',
            )
          : __('Customers with a pending balance show up here.'),
)
const rowActions = computed(() =>
  [
    caps.value.remind && {
      key: 'remind',
      label: __('Send reminder'),
      icon: 'send',
      hint: 'R',
    },
    caps.value.promise && {
      key: 'promise',
      label: __('Record promise'),
      icon: 'calendar',
      hint: 'P',
    },
    caps.value.call && {
      key: 'call',
      label: __('Log call'),
      icon: 'phone',
      hint: 'L',
    },
    caps.value.pay && {
      key: 'pay',
      label: __('Register payment'),
      icon: 'dollar-sign',
      hint: '$',
    },
    caps.value.assign && {
      key: 'followup',
      label: __('Schedule follow-up'),
      icon: 'user-check',
      hint: 'S',
    },
  ].filter(Boolean),
)

function toneClass(tone) {
  return (
    { red: 'text-ink-red-7', orange: 'text-ink-amber-9' }[tone] ||
    'text-ink-gray-6'
  )
}

// ── loading, scroll memory ─────────────────────────────────────────────────

function memory() {
  try {
    return JSON.parse(
      sessionStorage.getItem(listMemoryKey(route.query)) || 'null',
    )
  } catch {
    return null
  }
}
function rememberScroll() {
  try {
    sessionStorage.setItem(
      listMemoryKey(route.query),
      JSON.stringify({
        top: scroller.value?.scrollTop || 0,
        count: rows.value.length,
      }),
    )
  } catch {
    /* convenience only */
  }
}

/**
 * Load the list. `more`: the next page. `quiet` (live refresh, after an action):
 * the rows already shown are reloaded in place, keeping focus, selection and
 * scroll. `restore`: the first load after coming back: as many rows as were
 * loaded before, then the remembered scroll position.
 */
async function load({ more = false, quiet = false, restore = false } = {}) {
  const mine = ++ticket
  const remembered = restore ? memory() : null
  const length = more
    ? PAGE
    : Math.min(
        Math.max(
          PAGE,
          quiet ? rows.value.length : 0,
          Number(remembered?.count) || 0,
        ),
        MAX_PAGE,
      )
  loading.value = true
  if (!quiet) problem.value = null
  try {
    const page = await cobranzaApi('get_queue', {
      segment: state.value.segment,
      company: state.value.company,
      search: state.value.q.trim(),
      aging: state.value.edad,
      start: more ? rows.value.length : 0,
      page_length: length,
    })
    if (mine !== ticket) return
    rows.value = more ? [...rows.value, ...page.rows] : page.rows
    hasMore.value = page.has_more
    counts.value = page.counts || {}
    agingCounts.value = page.aging_counts || {}
    stats.value = page.stats
    capped.value = page.capped
    today.value = page.today
    problem.value = null
    syncFocus()
    pruneSelection()
    if (remembered) restoreScroll(remembered.top)
    else if (!quiet && !more && restore) revealFocus()
  } catch (error) {
    if (mine === ticket) problem.value = problemOf(error)
  } finally {
    if (mine === ticket) loading.value = false
  }
}

function restoreScroll(top) {
  nextTick(() => {
    if (scroller.value && top) scroller.value.scrollTop = top
    revealFocus()
  })
}

/** The focused row follows the URL's `cliente` (back from a record lands on it). */
function syncFocus() {
  const row = rowForCustomer(rows.value, state.value.cliente)
  if (row) focusKey.value = rowKey(row)
  else if (!keys.value.includes(focusKey.value)) focusKey.value = ''
}

function pruneSelection() {
  const present = new Set(keys.value)
  const kept = [...selected.value].filter((key) => present.has(key))
  if (kept.length !== selected.value.size) selected.value = new Set(kept)
}

function revealFocus() {
  nextTick(() => {
    if (!focusKey.value || !scroller.value) return
    const el = scroller.value.querySelector(
      `[data-row-key="${cssValue(focusKey.value)}"]`,
    )
    el?.scrollIntoView?.({ block: 'nearest' })
  })
}

function focusRow(row) {
  if (!row) return Promise.resolve()
  focusKey.value = rowKey(row)
  rememberScroll()
  if (state.value.cliente === row.customer) return Promise.resolve()
  return Promise.resolve(
    router.replace({
      query: queueQuery(route.query, { cliente: row.customer }),
    }),
  ).catch(() => {})
}

/** Filters push a history entry (back undoes them); the search replaces. */
function navigate(patch, { replace = false } = {}) {
  const query = queueQuery(route.query, { ...patch, cliente: '' })
  return replace ? router.replace({ query }) : router.push({ query })
}
function selectSegment(value) {
  segmentSheet.value = false
  clearSelection()
  navigate({ segment: normalizeSegment(value) })
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

// ── selection ─────────────────────────────────────────────────────────────

function toggleRow(row) {
  const key = rowKey(row)
  const next = new Set(selected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selected.value = next
  anchor.value = key
  focusKey.value = key
}
function extendSelection() {
  if (!focusKey.value) return
  const next = new Set(selected.value)
  for (const key of rangeKeys(
    keys.value,
    anchor.value || focusKey.value,
    focusKey.value,
  ))
    next.add(key)
  selected.value = next
}
function selectAll() {
  selected.value = new Set(keys.value)
}
function clearSelection() {
  selected.value = new Set()
  selecting.value = false
}

// ── actions on a row (keyboard, hover buttons) ───────────────────────────────

const sheetRow = ref(null)
const promiseOpen = ref(false)
const callOpen = ref(false)
const payOpen = ref(false)
const followupOpen = ref(false)
const followupFocus = ref('followup')
const bulkOpen = ref(false)
const undoer = useCobranzaUndo({ reload: () => load({ quiet: true }) })

function targetInvoice(row) {
  return {
    name: row.target.invoice,
    outstanding: row.target.outstanding,
    currency: row.target.currency,
  }
}

async function remindRow(row) {
  const invoice = row.target?.invoice
  if (!invoice) return
  const key = `remind:${invoice}`
  pending[key] = pending[key] || requestId()
  busyRow.value = rowKey(row)
  problem.value = null
  try {
    const result = await cobranzaApi('send_reminder_prepare', {
      request_id: pending[key],
      invoice,
    })
    delete pending[key]
    sendRow.value = row
    sendName.value = result.dunning
    sendManual.value = false
    sendOpen.value = true
  } catch (error) {
    if (!outcomeUnknown(error)) delete pending[key]
    problem.value = problemOf(error)
  } finally {
    busyRow.value = ''
  }
}

function runRow(action, row) {
  if (!row) return
  focusRow(row)
  sheetRow.value = row
  if (action === 'remind') {
    if (!caps.value.remind)
      return toast.error(
        __('You need permission to send payment reminders. Ask your manager.'),
      )
    return remindRow(row)
  }
  if (action === 'promise') promiseOpen.value = true
  else if (action === 'call') callOpen.value = true
  else if (action === 'pay') payOpen.value = true
  else if (action === 'assign' || action === 'followup') {
    followupFocus.value = action
    followupOpen.value = true
  }
}

function saved(after, result) {
  after(result)
  load({ quiet: true })
}

function followupSaved(result) {
  const view = result.followup
  undoer.followupSaved(
    result,
    view
      ? __('Follow-up saved: {0}', [view.full_name || view.user])
      : __('Follow-up ended'),
  )
  load({ quiet: true })
}

function onBulkDone() {
  clearSelection()
  load({ quiet: true })
}

function openBulkResult(item) {
  bulkOpen.value = false
  const row = rows.value.find(
    (r) => r.customer === item.customer && r.company === item.company,
  ) || { customer: item.customer, company: item.company }
  openRow(row, 'recordar', item.invoice)
}

/** «Cobrar en caja» from the list: the register returns to the customer's record. */
function collectAtRegister(row, invoice) {
  if (!row || !invoice) return
  const back = customerHref(row.customer, customerRoute(row).query)
  window.location.assign(
    posCollectHref(
      { name: invoice, customer: row.customer },
      { returnTo: back, returnLabel: 'Cobranza' },
    ),
  )
}

// ── keyboard: never while typing, never under a sheet ───────────────────────
// The Alt+H sheet lists these and exactly the list keys this page answers.
registerPageKeys(
  powerListPageKeys({
    focusSearch,
    enabled: () => !guard.value,
    shortcuts: () => queueShortcuts(caps.value),
  }),
)

function searchInput() {
  return document.querySelector(
    '[data-cobranza-search] input, input[data-cobranza-search]',
  )
}
function focusSearch() {
  if (phone.value) return openSearch()
  searchInput()?.focus()
}

function onKey(event) {
  if (event.defaultPrevented || guard.value) return
  if (document.querySelector('[aria-modal="true"], [role="dialog"]')) return
  const action = keyAction(event, QUEUE_KEYS, { apple: appleKeys })
  if (!action) return
  if (isTypingTarget(event.target)) {
    if (action === 'escape' && event.target === searchInput()) {
      event.preventDefault()
      event.target.blur()
    }
    return
  }
  if (
    action === 'open' &&
    event.target?.closest?.('a, button, [role="button"]')
  )
    return
  const row = rows.value.find((r) => rowKey(r) === focusKey.value)
  const handlers = {
    next: () => moveTo(1),
    prev: () => moveTo(-1),
    open: () => row && openRow(row),
    toggle: () => row && toggleRow(row),
    range: () => extendSelection(),
    all: () => selectAll(),
    search: () => focusSearch(),
    escape: () =>
      selected.value.size ? clearSelection() : (focusKey.value = ''),
    remind: () =>
      selected.value.size && caps.value.remind
        ? (bulkOpen.value = true)
        : runRow('remind', row),
    promise: () => runRow('promise', row),
    call: () => runRow('call', row),
    pay: () => runRow('pay', row),
    assign: () => runRow('assign', row),
    followup: () => runRow('followup', row),
  }
  const handler = handlers[action]
  if (!handler) return
  event.preventDefault()
  handler()
}

function moveTo(delta) {
  const key = moveFocus(keys.value, focusKey.value, delta)
  const row = rows.value.find((r) => rowKey(r) === key)
  if (!row) return
  // The keyboard's place is the list (aria-activedescendant): Enter opens the
  // focused row even after a click on a chip or a button left focus there.
  listbox.value?.focus?.({ preventScroll: true })
  focusRow(row)
  revealFocus()
}

// ── phone search ──────────────────────────────────────────────────────────

function openSearch() {
  searchOpen.value = true
  nextTick(() => phoneSearch.value?.focus())
}
function closeSearch() {
  searchOpen.value = false
  if (search.value) search.value = ''
}

// ── live: someone (or another tab) changed an invoice, payment, letter, to-do ──
useLiveWatch(hoyLive(socket), LIVE_DOCTYPES, () => load({ quiet: true }), {
  // get_queue reads every open invoice: a busy register must not storm it.
  minIntervalMs: 10000,
})

watch(search, (value) => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    if (value.trim() !== state.value.q)
      navigate({ q: value.trim() }, { replace: true })
  }, 250)
})
// Only the filters reload the list; the focused customer (`cliente`) does not.
watch(
  [
    () => state.value.segment,
    () => state.value.q,
    () => state.value.company,
    () => state.value.edad,
  ],
  (now, before) => {
    if (route.name !== 'Cobranza' || !boot.value?.enabled) return
    // Back/forward: the search box follows the URL.
    if (now[1] !== before?.[1] && search.value.trim() !== now[1])
      search.value = now[1]
    load({ restore: true })
  },
)
watch(
  () => state.value.cliente,
  () => syncFocus(),
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
  window.addEventListener('keydown', onKey)
  await loadCobranzaBoot()
  if (boot.value?.enabled) {
    load({ restore: true })
    loadAuto()
    openFromNotice()
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.clearTimeout(searchTimer)
})
</script>
