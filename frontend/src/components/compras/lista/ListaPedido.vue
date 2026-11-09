<template>
  <!-- The order built from the list: its rows with their quantities, what the
       tiers and promos take off, the budget, then the ways to send it. A send
       happens only after the preview: the text and the file are shown first,
       and WhatsApp or email ask once more. -->
  <BottomSheet
    :open="open"
    :title="__('Order to the supplier', null, 'Lista')"
    :subtitle="supplierName"
    layer="lista-pedido"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="!pedido" class="py-6 text-center text-sm text-ink-gray-6">
      {{
        __(
          'Set quantities on the list and the order builds itself here.',
          null,
          'Lista',
        )
      }}
    </div>
    <div v-else class="space-y-4 pb-2">
      <!-- the rows -->
      <p v-if="others.length" class="-mb-3 text-xs font-medium text-ink-gray-6">
        {{ __('This list', null, 'Lista') }}
      </p>
      <ul
        class="divide-y divide-outline-gray-1"
        :aria-label="__('Order rows', null, 'Lista')"
      >
        <li
          v-for="row in orderRows"
          :key="row.name"
          class="flex items-center gap-2 py-2"
        >
          <button
            type="button"
            class="press min-w-0 flex-1 text-left"
            @click="emit('line', row.catalogo_linea)"
          >
            <span class="block truncate text-sm font-medium text-ink-gray-9">{{
              row.title
            }}</span>
            <span class="block truncate text-xs text-ink-gray-6">
              {{ row.detail }}
            </span>
          </button>
          <ListaStepper
            :qty="row.qty"
            :disabled="!owner || !canOrder"
            :label="__('Quantity of {0}', [row.title], 'Lista')"
            @step="(d) => emit('step', row.catalogo_linea, d)"
            @set="(v) => emit('set', row.catalogo_linea, v)"
          />
          <span
            class="num w-20 flex-none text-right text-sm tabular-nums text-ink-gray-9"
          >
            {{ money(row.total, currency) }}
          </span>
        </li>
      </ul>

      <!-- the supplier's other lists in this order -->
      <section
        v-if="others.length"
        :aria-label="__('Also in this order', null, 'Lista')"
        data-lista-pedido-otras
      >
        <p class="mb-1 text-xs font-medium text-ink-gray-6">
          {{ __('Also in this order', null, 'Lista') }}
        </p>
        <ul class="divide-y divide-outline-gray-1">
          <li v-for="list in others" :key="list.name">
            <button
              type="button"
              class="press flex min-h-11 w-full items-center gap-2 py-1.5 text-left"
              :data-lista-pedido-otra="list.name"
              @click="emit('list', list.name)"
            >
              <span class="min-w-0 flex-1">
                <span
                  class="block truncate text-sm font-medium text-ink-gray-9"
                  >{{ listLabel(list) }}</span
                >
                <span class="block truncate text-xs text-ink-gray-6">{{
                  __(
                    '{0} pieces in {1} rows',
                    [list.pieces, list.lines],
                    'Lista',
                  )
                }}</span>
              </span>
              <span
                class="num w-20 flex-none text-right text-sm tabular-nums text-ink-gray-9"
                >{{ money(list.amount, currency) }}</span
              >
              <span
                class="lucide-chevron-right size-4 flex-none text-ink-gray-5"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
      </section>

      <!-- per product type, when the order holds more than one -->
      <section
        v-if="groups.length > 1"
        :aria-label="__('By product type', null, 'Lista')"
      >
        <p class="mb-1 text-xs font-medium text-ink-gray-6">
          {{ __('By product type', null, 'Lista') }}
        </p>
        <ListaTipos
          :groups="groups"
          :currency="currency"
          :supplier-name="supplierName"
        />
      </section>

      <!-- promos -->
      <div
        v-if="promoLines.length"
        class="rounded-6 bg-surface-gray-1 p-3 text-sm"
      >
        <p
          v-for="(sentence, i) in promoLines"
          :key="i"
          class="flex items-start gap-2"
          :class="sentence.reached ? 'text-ink-gray-9' : 'text-ink-gray-7'"
        >
          <span
            :class="[
              sentence.reached ? 'lucide-check' : 'lucide-gift',
              'mt-0.5 size-4 flex-none',
            ]"
            aria-hidden="true"
          />
          {{ sentence.text }}
        </p>
      </div>

      <!-- totals -->
      <dl class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        <dt class="text-ink-gray-6">
          {{
            __(
              '{0} pieces in {1} rows',
              [totals.pieces, orderLines || orderRows.length],
              'Lista',
            )
          }}
        </dt>
        <dd class="num text-right tabular-nums">
          {{ money(totals.base_total, currency) }}
        </dd>
        <template v-if="totals.savings > 0">
          <dt class="text-ink-gray-6">
            {{ __('Tier prices save', null, 'Lista') }}
          </dt>
          <dd class="num text-right tabular-nums text-ink-green-7">
            −{{ money(totals.savings, currency) }}
          </dd>
        </template>
        <template v-if="totals.discounts > 0">
          <dt class="text-ink-gray-6">
            {{ __('Promo discounts', null, 'Lista') }}
          </dt>
          <dd class="num text-right tabular-nums text-ink-green-7">
            −{{ money(totals.discounts, currency) }}
          </dd>
        </template>
        <dt class="pt-1 text-base font-semibold text-ink-gray-9">
          {{
            others.length
              ? __('Whole order', null, 'Lista')
              : __('Total', null, 'Lista')
          }}
        </dt>
        <dd
          class="num pt-1 text-right text-base font-semibold tabular-nums text-ink-gray-9"
        >
          {{ money(totals.total, currency) }}
        </dd>
      </dl>

      <!-- budget -->
      <label class="block">
        <span class="mb-1 block text-xs font-medium text-ink-gray-6">{{
          __('Budget for this order', null, 'Lista')
        }}</span>
        <input
          :value="ceilingText"
          :class="INPUT"
          type="number"
          min="0"
          step="100"
          inputmode="decimal"
          :disabled="!owner"
          :placeholder="__('No limit', null, 'Lista')"
          @change="setCeiling"
        />
      </label>
      <p
        v-if="totals.over_ceiling"
        class="text-sm text-ink-amber-9"
        role="status"
      >
        {{
          __(
            'Over the budget by {0}. Lower some quantities or raise it.',
            [money(totals.total - totals.ceiling, currency)],
            'Lista',
          )
        }}
      </p>

      <!-- the file: Excel, PDF, print -->
      <div
        class="flex items-center gap-1 rounded-full bg-surface-gray-1 p-1"
        role="group"
        :aria-label="__('The order as a file', null, 'Lista')"
      >
        <a
          v-for="link in fileLinks"
          :key="link.key"
          :href="link.href"
          target="_blank"
          rel="noopener"
          class="press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-sm text-ink-gray-8 hover:bg-surface-gray-2"
          :title="link.label"
        >
          <span :class="[link.icon, 'size-4']" aria-hidden="true" />
          {{ link.label }}
        </a>
      </div>

      <!-- sending -->
      <section v-if="owner" :aria-label="__('Send', null, 'Lista')">
        <p class="mb-2 text-sm font-medium text-ink-gray-9">
          {{ __('Send it', null, 'Lista') }}
        </p>
        <p v-if="!canOrder" class="text-sm text-ink-gray-6">
          {{
            __(
              'Name the supplier of this list before sending the order.',
              null,
              'Lista',
            )
          }}
        </p>
        <p
          v-else-if="modesLoading"
          class="text-sm text-ink-gray-6"
          role="status"
        >
          {{ __('Checking the ways to send…', null, 'Lista') }}
        </p>
        <template v-else>
          <div class="mb-2 flex items-center gap-3">
            <Segmented
              v-if="needsFile"
              v-model="fileFormat"
              :options="FORMATS"
              :label="__('File format', null, 'Lista')"
              class="w-44"
            />
          </div>
          <ul
            class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          >
            <li v-for="m in modes" :key="m.mode">
              <button
                type="button"
                class="press flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left"
                :class="chosen === m.mode ? 'bg-surface-gray-1' : ''"
                :disabled="!m.enabled || sending"
                :aria-disabled="m.enabled ? undefined : 'true'"
                @click="choose(m)"
              >
                <span
                  :class="[
                    MODE_ICON[m.mode] || 'lucide-send',
                    'size-5 flex-none text-ink-gray-7',
                  ]"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">
                  <span
                    class="block text-sm"
                    :class="m.enabled ? 'text-ink-gray-9' : 'text-ink-gray-5'"
                  >
                    {{ m.label }}
                    <span
                      v-if="m.default"
                      class="ml-1 text-xs text-ink-gray-5"
                      >{{ __('usual', null, 'Lista') }}</span
                    >
                  </span>
                  <span
                    v-if="!m.enabled"
                    class="block text-xs text-ink-gray-6"
                    >{{ m.reason }}</span
                  >
                </span>
                <span
                  v-if="m.enabled"
                  class="lucide-chevron-right size-4 flex-none text-ink-gray-5"
                  aria-hidden="true"
                />
              </button>
              <!-- the preview, under the chosen way -->
              <div v-if="chosen === m.mode" class="space-y-2 px-3 pb-3">
                <pre
                  v-if="text"
                  class="max-h-48 overflow-auto whitespace-pre-wrap rounded-6 bg-surface-gray-1 p-3 font-sans text-xs text-ink-gray-8"
                  >{{ text }}</pre
                >
                <p v-if="preview?.file" class="text-sm">
                  <a
                    :href="preview.file.file_url"
                    target="_blank"
                    rel="noopener"
                    class="font-medium text-ink-blue-7 underline"
                  >
                    {{ __('Download {0}', [preview.file.file_name], 'Lista') }}
                  </a>
                </p>
                <a
                  v-if="preview?.url"
                  :href="preview.url"
                  target="_blank"
                  rel="noopener"
                  :class="['press', BTN.tonal, 'min-h-10 px-4 text-sm']"
                >
                  <span
                    class="lucide-external-link size-4"
                    aria-hidden="true"
                  />
                  {{ __('Open WhatsApp with the text', null, 'Lista') }}
                </a>
                <p v-if="copied" class="text-sm text-ink-green-7" role="status">
                  {{ __('Text copied', null, 'Lista') }}
                </p>
                <p
                  v-else-if="m.mode === 'copy' && preview"
                  class="text-sm text-ink-gray-6"
                  role="status"
                >
                  {{ __('Copy it from the text above.', null, 'Lista') }}
                </p>
                <div class="flex flex-wrap items-center gap-2">
                  <template v-if="m.mode === 'api' || m.mode === 'email'">
                    <p v-if="!armed" class="flex-1 text-xs text-ink-gray-6">
                      {{
                        __(
                          'It goes to {0} with the text above and the {1} file.',
                          [supplierName, fileFormat.toUpperCase()],
                          'Lista',
                        )
                      }}
                    </p>
                    <button
                      type="button"
                      :class="[
                        'press',
                        armed ? BTN.danger : BTN.filled,
                        'min-h-10 px-4 text-sm',
                      ]"
                      :disabled="sending"
                      @click="armed ? doSend(m) : (armed = true)"
                    >
                      <span
                        :class="[
                          sending
                            ? 'lucide-loader-circle animate-spin'
                            : 'lucide-send',
                          'size-4',
                        ]"
                        aria-hidden="true"
                      />
                      {{
                        armed ? __('Yes, send it now', null, 'Lista') : m.label
                      }}
                    </button>
                  </template>
                  <button
                    v-else
                    type="button"
                    :class="['press', BTN.filled, 'min-h-10 px-4 text-sm']"
                    :disabled="sending || !preview"
                    @click="markSent(m)"
                  >
                    <span
                      :class="[
                        sending
                          ? 'lucide-loader-circle animate-spin'
                          : 'lucide-check',
                        'size-4',
                      ]"
                      aria-hidden="true"
                    />
                    {{ __('Mark as sent', null, 'Lista') }}
                  </button>
                </div>
              </div>
            </li>
          </ul>
          <p
            v-if="sendProblem"
            class="mt-2 text-sm text-ink-red-7"
            role="alert"
          >
            {{ sendProblem }}
          </p>
        </template>
      </section>
      <p v-else class="text-xs text-ink-gray-6">
        {{ __('Only the owner sends orders.', null, 'Lista') }}
      </p>
    </div>
  </BottomSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { BottomSheet, Segmented } from '@/components/ui'
import { BTN } from '@/documentos/tools'
import { comprasApi, money, problemOf } from '@/composables/useCompras'
import { copyText, rowTotal, specParts } from '@/utils/listaPrecios'
import { listLabel } from '@/utils/hojaPedido'
import ListaStepper from './ListaStepper.vue'
import ListaTipos from './ListaTipos.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  catalog: { type: String, default: '' },
  /** pedido_api.result: name, status, total, ceiling, over_ceiling. */
  pedido: { type: Object, default: null },
  totals: { type: Object, default: () => ({}) },
  /** Draft rows by line name. */
  rows: { type: Object, default: () => ({}) },
  /** Lines by name, over every section. */
  lines: { type: Object, default: () => ({}) },
  currency: { type: String, default: 'MXN' },
  owner: { type: Boolean, default: false },
  canOrder: { type: Boolean, default: false },
  supplierName: { type: String, default: '' },
  /** The supplier's other lists this order holds lines of (otherLists()). */
  others: { type: Array, default: () => [] },
  /** The order per product type (typeRows()). */
  groups: { type: Array, default: () => [] },
  /** The rows of the whole order, over every list. */
  orderLines: { type: Number, default: 0 },
})
const emit = defineEmits([
  'update:open',
  'step',
  'set',
  'ceiling',
  'line',
  'list',
  'sent',
])

const PEDIDO = 'doco.docoutils.books.catalogs.pedido.'
const EXPORT = '/api/method/doco.workspaces.lista_precios.export'
const INPUT =
  'block w-full rounded-6 border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm text-ink-gray-9 placeholder:text-ink-gray-4 focus:border-outline-gray-4 focus:ring-0 disabled:opacity-60'
const MODE_ICON = {
  share: 'lucide-share-2',
  copy: 'lucide-copy',
  wa_me: 'lucide-message-circle',
  api: 'lucide-send',
  email: 'lucide-mail',
}
const FORMATS = [
  { value: 'xlsx', label: 'Excel' },
  { value: 'pdf', label: 'PDF' },
]

const orderRows = computed(() =>
  Object.values(props.rows || {})
    .filter((r) => r.qty > 0)
    .map((r) => {
      const line = props.lines[r.catalogo_linea] || {}
      const title =
        [line.brand, line.model].filter(Boolean).join(' ') ||
        line.name1 ||
        line.code ||
        r.catalogo_linea
      const detail = [
        specParts(line).join(' · '),
        money(r.catalog_price, props.currency) +
          (r.tier_label ? ` · ${r.tier_label}` : ''),
        r.promo_note,
      ]
        .filter(Boolean)
        .join(' — ')
      return { ...r, title, detail, total: rowTotal(r, line) }
    })
    .sort((a, b) => a.title.localeCompare(b.title)),
)

const who = (p) =>
  [p.brand, p.model].filter(Boolean).join(' ') || __('pieces', null, 'Lista')
const promoLines = computed(() => {
  const out = []
  for (const p of props.totals?.promos_reached || [])
    out.push({
      reached: true,
      text:
        p.kind === 'Descuento'
          ? __(
              '{0} off with {1} {2}',
              [money(p.amount, props.currency), p.pieces, who(p)],
              'Lista',
            )
          : __(
              '{0} × {1} with {2} {3}',
              [p.times, p.gift || p.text, p.pieces, who(p)],
              'Lista',
            ),
    })
  for (const p of props.totals?.promos_short || [])
    out.push({
      reached: false,
      text:
        p.kind === 'Descuento'
          ? __('{0} more {1} reach the discount', [p.missing, who(p)], 'Lista')
          : __(
              'Take {0} more {1} for the {2}',
              [p.missing, who(p), p.gift || p.text],
              'Lista',
            ),
    })
  return out
})

const ceilingText = computed(() =>
  props.totals?.ceiling ? String(props.totals.ceiling) : '',
)
function setCeiling(event) {
  const value = Number(event.target.value)
  emit('ceiling', value > 0 ? value : null)
}

const fileLinks = computed(() => {
  if (!props.pedido?.pedido) return []
  const q = (format) =>
    `${EXPORT}?catalogo=${encodeURIComponent(props.catalog)}&format=${format}`
  return [
    {
      key: 'xlsx',
      label: 'Excel',
      icon: 'lucide-file-spreadsheet',
      href: q('xlsx'),
    },
    { key: 'pdf', label: 'PDF', icon: 'lucide-file-text', href: q('pdf') },
    {
      key: 'print',
      label: __('Print', null, 'Lista'),
      icon: 'lucide-printer',
      href: `/printview?doctype=Pedido%20Catalogo&name=${encodeURIComponent(props.pedido.pedido)}&format=Pedido%20a%20proveedor`,
    },
  ]
})

// Sending: the preview first, then the confirmation.
const modes = ref([])
const modesLoading = ref(false)
const text = ref('')
const chosen = ref('')
const preview = ref(null)
const fileFormat = ref('xlsx')
const armed = ref(false)
const copied = ref(false)
const sending = ref(false)
const sendProblem = ref('')
const needsFile = computed(() =>
  ['share', 'api', 'email'].includes(chosen.value),
)

async function loadModes() {
  if (!props.pedido?.pedido || !props.owner || !props.canOrder) return
  modesLoading.value = true
  sendProblem.value = ''
  try {
    const [rows, rendered] = await Promise.all([
      comprasApi(PEDIDO + 'available_send_modes', {
        pedido: props.pedido.pedido,
      }),
      comprasApi(PEDIDO + 'render_text', { pedido: props.pedido.pedido }),
    ])
    modes.value = rows || []
    text.value = typeof rendered === 'string' ? rendered : rendered?.text || ''
    const usual = rows?.find((r) => r.default && r.enabled)
    if (usual?.file_format && usual.file_format !== 'text')
      fileFormat.value = usual.file_format
  } catch (error) {
    sendProblem.value = problemOf(error).detail
  } finally {
    modesLoading.value = false
  }
}

watch(
  () => [props.open, props.pedido?.pedido],
  ([open]) => {
    chosen.value = ''
    preview.value = null
    armed.value = false
    copied.value = false
    if (open) loadModes()
  },
  { immediate: true },
)

async function choose(m) {
  if (!m.enabled) return
  armed.value = false
  copied.value = false
  sendProblem.value = ''
  if (chosen.value === m.mode) {
    chosen.value = ''
    preview.value = null
    return
  }
  chosen.value = m.mode
  preview.value = null
  if (m.mode === 'api' || m.mode === 'email') return
  // share, copy and wa_me only prepare: the file, the text, the link.
  sending.value = true
  try {
    const out = await comprasApi(PEDIDO + 'send', {
      pedido: props.pedido.pedido,
      via: m.mode,
      file_format: m.mode === 'share' ? fileFormat.value : undefined,
    })
    preview.value = out
    if (out?.text) text.value = out.text
    if (m.mode === 'copy') copied.value = await copyText(out.text || text.value)
  } catch (error) {
    sendProblem.value = problemOf(error).detail
    chosen.value = ''
  } finally {
    sending.value = false
  }
}

async function markSent(m) {
  sending.value = true
  sendProblem.value = ''
  try {
    await comprasApi(PEDIDO + 'mark_sent', {
      pedido: props.pedido.pedido,
      mode: m.mode,
    })
    emit('sent', m.mode)
  } catch (error) {
    sendProblem.value = problemOf(error).detail
  } finally {
    sending.value = false
  }
}

async function doSend(m) {
  sending.value = true
  sendProblem.value = ''
  try {
    const out = await comprasApi(PEDIDO + 'send', {
      pedido: props.pedido.pedido,
      via: m.mode,
      file_format: fileFormat.value,
    })
    preview.value = out
    if (out?.delivery_error) {
      sendProblem.value = __(
        'The message did not go out; share the file instead.',
        null,
        'Lista',
      )
      return
    }
    emit('sent', m.mode)
  } catch (error) {
    sendProblem.value = problemOf(error).detail
  } finally {
    armed.value = false
    sending.value = false
  }
}
</script>
