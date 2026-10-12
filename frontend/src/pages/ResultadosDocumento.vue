<template>
  <div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
    <div class="mx-auto w-full max-w-3xl px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <a
        :href="backHref"
        data-testid="back-to-list"
        class="inline-flex min-h-11 items-center text-sm font-medium text-ink-blue-link underline"
        @click="goBack"
        >← {{ __('Back to {0}', [backLabel]) }}</a
      >
      <div v-if="loading && !doc" role="status" class="mt-4 space-y-3">
        <div class="h-8 w-60 animate-pulse rounded bg-surface-gray-2" />
        <div class="h-24 animate-pulse rounded bg-surface-gray-2" />
      </div>
      <div
        v-else-if="problem"
        role="alert"
        class="mt-4 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
      >
        <strong>{{ problem.title }}.</strong> {{ problem.detail }}
        <div class="mt-2 flex flex-wrap gap-2">
          <Button :label="__('Retry', null, CTX)" @click="load" />
          <Button :label="__('Back to {0}', [backLabel])" @click="goBack" />
        </div>
      </div>
      <template v-else-if="doc">
        <header class="mt-2 flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <h1 class="truncate text-xl font-semibold text-ink-gray-9">
              {{
                doc.header.customer_name || doc.header.pos_profile || doc.name
              }}
            </h1>
            <p class="text-sm text-ink-gray-6">
              {{ doc.name }} · {{ doc.header.posting_date }}
              <template v-if="doc.header.status">
                · {{ doc.header.status }}</template
              >
            </p>
          </div>
          <p class="text-2xl font-semibold tabular-nums">
            {{
              money(
                doc.header.grand_total ?? doc.header.total ?? 0,
                doc.header.currency || currency,
              )
            }}
          </p>
        </header>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button
            v-if="dealHref"
            variant="solid"
            class="min-h-11"
            :label="__('Open the sale in Ventas')"
            @click="go(dealHref)"
          />
          <Button
            v-if="customerHref"
            class="min-h-11"
            :label="__('Open the customer')"
            @click="go(customerHref)"
          />
        </div>
        <p
          v-if="doc.header.is_return"
          class="mt-3 rounded-lg bg-surface-amber-1 p-2 text-sm text-ink-amber-8"
        >
          {{
            __('This is a return of {0}.', [doc.header.return_against || ''])
          }}
        </p>
        <section
          v-if="doc.items?.length"
          class="mt-4"
          :aria-label="__('Lines')"
        >
          <h2 class="mb-1 text-sm font-medium text-ink-gray-7">
            {{ __('Lines') }}
          </h2>
          <ul
            class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
          >
            <li
              v-for="(item, i) in doc.items"
              :key="i"
              class="flex gap-3 px-3 py-2 text-sm"
            >
              <span class="min-w-0 flex-1 truncate">{{
                item.item_name || item.item_code || item.mode_of_payment
              }}</span>
              <span
                v-if="item.qty !== undefined"
                class="tabular-nums text-ink-gray-6"
                >× {{ item.qty }}</span
              >
              <span class="tabular-nums">{{
                money(
                  item.amount ?? item.difference ?? 0,
                  doc.header.currency || currency,
                )
              }}</span>
            </li>
          </ul>
        </section>
        <section
          v-if="payments.length"
          class="mt-4"
          :aria-label="__('Payments')"
        >
          <h2 class="mb-1 text-sm font-medium text-ink-gray-7">
            {{ __('Payments') }}
          </h2>
          <ul
            class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
          >
            <li
              v-for="(p, i) in payments"
              :key="i"
              class="flex gap-3 px-3 py-2 text-sm"
            >
              <span class="min-w-0 flex-1 truncate">{{
                p.mode_of_payment
              }}</span>
              <span class="tabular-nums">{{
                money(
                  p.amount ?? p.closing_amount ?? 0,
                  doc.header.currency || currency,
                )
              }}</span>
            </li>
          </ul>
        </section>
        <section
          v-if="doc.reconciliation?.length"
          class="mt-4"
          :aria-label="__('Cash count')"
        >
          <h2 class="mb-1 text-sm font-medium text-ink-gray-7">
            {{ __('Cash count') }}
          </h2>
          <ul
            class="divide-y divide-outline-gray-1 rounded-lg border border-outline-gray-2"
          >
            <li
              v-for="(r, i) in doc.reconciliation"
              :key="i"
              class="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-2 text-sm"
            >
              <span class="truncate">{{ r.mode_of_payment }}</span>
              <span
                class="tabular-nums"
                :class="r.difference ? 'text-ink-red-7' : ''"
                >{{ money(r.difference ?? 0, currency) }}</span
              >
              <span class="col-span-2 text-xs text-ink-gray-6">{{
                __('Expected {0} · counted {1}', [
                  money(r.expected_amount ?? 0, currency),
                  money(r.closing_amount ?? 0, currency),
                ])
              }}</span>
            </li>
          </ul>
          <p class="mt-2 text-xs text-ink-gray-6">
            {{ __('The supervisor reviews and recounts at the register.') }}
          </p>
        </section>
        <p
          v-if="doctype === 'Sales Invoice'"
          class="mt-4 text-xs text-ink-gray-6"
        >
          {{ __('Reprints and returns are made at the register.') }}
        </p>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { problemOf } from '@/composables/useCobranza'
import { money } from '@/composables/useCompras'
import { shellBoot } from '@/composables/muelleShell'
import {
  CTX,
  RETURN_LABEL,
  resultadosApi,
  routerPath,
} from '@/composables/useResultados'
import { readReturn, withReturn } from '@/vendor/muelle-shell/contracts'

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
})
const route = useRoute()
const router = useRouter()
const doc = ref(null)
const loading = ref(false)
const problem = ref(null)

const currency = computed(() => shellBoot.value?.currency || '')
const caller = computed(() =>
  readReturn(new URLSearchParams(route.query), {
    allowedPrefixes: ['/crm/'],
    acceptLegacy: false,
  }),
)
const backHref = computed(() => caller.value?.to || '/crm/resultados')
const backLabel = computed(() => caller.value?.label || RETURN_LABEL)
const payments = computed(() => doc.value?.payments || [])
const here = computed(() => `/crm${route.fullPath}`)
const dealHref = computed(() =>
  doc.value?.deal
    ? withReturn(`/crm/ventas/deal/${encodeURIComponent(doc.value.deal)}`, {
        to: here.value,
        label: props.name,
      })
    : null,
)
const customerHref = computed(() =>
  doc.value?.header?.customer
    ? withReturn(
        `/crm/contactos/customer/${encodeURIComponent(doc.value.header.customer)}`,
        {
          to: here.value,
          label: props.name,
        },
      )
    : null,
)

function go(href) {
  const local = routerPath(href)
  if (local) router.push(local)
  else window.location.assign(href)
}
function goBack(event) {
  const local = routerPath(backHref.value)
  if (!local) return
  event?.preventDefault?.()
  router.push(local)
}
async function load() {
  loading.value = true
  problem.value = null
  try {
    doc.value = await resultadosApi('document', {
      doctype: props.doctype,
      name: props.name,
    })
  } catch (error) {
    doc.value = null
    problem.value = problemOf(error)
  } finally {
    loading.value = false
  }
}
watch(() => [props.doctype, props.name], load, { immediate: true })
</script>
