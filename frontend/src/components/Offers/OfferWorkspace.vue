<template>
  <section
    class="offers min-w-0 flex-1 overflow-y-auto p-3 sm:p-5 text-ink-gray-9"
    :aria-label="__('Commercial offers')"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold">{{ __('Commercial offers') }}</h2>
        <p class="mt-1 text-sm text-ink-gray-6">
          {{
            __(
              'A proposal records offered terms and customer decisions. It does not reserve stock or record an invoice or payment.',
            )
          }}
        </p>
      </div>
      <button
        v-if="state.canCreate"
        class="offer-button"
        :disabled="locked"
        @click="newDraft"
      >
        {{ __('New offer') }}
      </button>
    </div>
    <p v-if="state.loading" role="status" class="mt-3">
      {{ __('Loading offers…') }}
    </p>
    <div v-if="state.loadError" role="alert" class="mt-3 space-y-2">
      <p>{{ state.loadError }}</p>
      <button class="offer-button" :disabled="locked" @click="load(false)">
        {{ __('Retry loading offers') }}
      </button>
    </div>
    <div
      v-if="state.error"
      role="alert"
      class="my-3 rounded border border-outline-gray-2 p-3 space-y-2"
    >
      <p>{{ state.error }}</p>
      <button
        v-if="state.pending"
        class="offer-button"
        :disabled="state.busy"
        @click="runPending"
      >
        {{ __('Retry same action') }}
      </button>
      <button
        v-else-if="state.selected"
        class="offer-button"
        :disabled="state.busy"
        @click="refreshSelected"
      >
        {{ __('Refresh saved version; keep my draft') }}
      </button>
    </div>
    <p v-if="state.pending" role="status" class="my-3">
      {{
        state.busy
          ? __('Saving…')
          : __(
              'The result is unconfirmed. Retry the same action before leaving.',
            )
      }}
    </p>
    <div class="mt-4 grid min-w-0 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav :aria-label="__('Offer revisions')" class="min-w-0 space-y-2">
        <p
          v-if="!state.loading && !state.loadError && !state.offers.length"
          class="text-sm text-ink-gray-6"
        >
          {{
            __(
              'No offers yet. Create a draft from this deal’s products or services.',
            )
          }}
        </p>
        <button
          v-for="offer in state.offers"
          :key="offer.name"
          class="offer-button w-full text-left"
          :disabled="locked"
          :aria-current="
            state.selected?.name === offer.name ? 'true' : undefined
          "
          @click="select(offer)"
        >
          <span class="block break-words">{{ offer.title || offer.name }}</span
          ><span class="block text-sm"
            >{{ __('Revision {0}', [offer.revision]) }} ·
            {{ __(offer.effective_status || offer.status) }}</span
          ><span
            v-if="offer.is_current === false"
            class="block text-sm text-ink-gray-6"
            >{{ __('Previous revision') }}</span
          >
        </button>
        <button
          v-if="state.hasMore"
          class="offer-button"
          :disabled="locked || state.loading"
          @click="load(true)"
        >
          {{ __('Load more offers') }}
        </button>
      </nav>
      <div class="min-w-0 space-y-4">
        <template v-if="state.selected">
          <div class="flex flex-wrap gap-3 items-center">
            <h3 class="font-semibold">
              {{ state.selected.name }} ·
              {{ __('Revision {0}', [state.selected.revision]) }}
            </h3>
            <a
              class="offer-button"
              :href="deskUrl"
              target="_blank"
              rel="noopener"
              >{{ __('Open in Desk') }}</a
            >
          </div>
          <p>
            {{ __(state.selected.effective_status || state.selected.status) }} ·
            {{ __('Offered amount') }}:
            {{ amount(state.selected.net_total, state.selected.currency) }}
          </p>
          <p
            v-if="state.selected.decision_at"
            class="break-words text-sm text-ink-gray-6"
          >
            {{
              __('Decision recorded by {0} on {1} via {2}', [
                state.selected.decision_by,
                state.selected.decision_at,
                __(state.selected.decision_channel),
              ])
            }}<br />{{ state.selected.decision_evidence }}
          </p>
          <p v-if="state.selected.is_current === false" class="text-sm">
            {{
              __(
                'This revision remains in the history. Continue with the current revision for new actions.',
              )
            }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              v-if="caps.can_export"
              class="offer-button"
              :disabled="locked"
              @click="preview"
            >
              {{ __('Preview / export') }}
            </button>
            <button
              v-if="caps.can_issue"
              class="offer-button"
              :disabled="locked || dirty || state.reviewRequired"
              @click="command('issue')"
            >
              {{ __('Issue saved offer') }}
            </button>
            <button
              v-if="caps.can_decide"
              class="offer-button"
              :disabled="locked"
              @click="state.decision = 'Accepted'"
            >
              {{ __('Record acceptance') }}
            </button>
            <button
              v-if="caps.can_decide"
              class="offer-button"
              :disabled="locked"
              @click="state.decision = 'Rejected'"
            >
              {{ __('Record rejection') }}
            </button>
            <button
              v-if="caps.can_revise"
              class="offer-button"
              :disabled="locked"
              @click="command('revise', { request_id: cryptoId() })"
            >
              {{ __('Create new revision') }}
            </button>
            <button
              v-if="caps.can_expire"
              class="offer-button"
              :disabled="locked"
              @click="command('expire')"
            >
              {{ __('Expire offer') }}
            </button>
            <button
              v-if="caps.can_erp"
              class="offer-button"
              :disabled="locked"
              @click="reviewErp"
            >
              {{ __('Review ERP quotation') }}
            </button>
          </div>
          <a
            v-if="state.selected.erp_quotation"
            class="offer-button inline-flex items-center"
            :href="quotationUrl(state.selected.erp_quotation)"
            target="_blank"
            rel="noopener"
            >{{ __('Open ERP quotation') }} ·
            {{ state.selected.erp_quotation }}</a
          >
        </template>
        <p v-if="state.reviewRequired" role="alert">
          {{
            __(
              'The saved version changed. Refresh it and compare the preview before saving your retained draft.',
            )
          }}
        </p>
        <OfferDraft
          v-if="state.draft"
          v-model:draft="state.draft"
          :disabled="locked || state.reviewRequired"
          @save="save"
        />
        <div v-else-if="state.selected" class="space-y-3">
          <p>
            {{ __('Valid until') }}:
            {{ state.selected.valid_until || __('No expiry date') }}
          </p>
          <ul class="space-y-2">
            <li
              v-for="(row, index) in state.selected.products"
              :key="index"
              class="rounded border border-outline-gray-2 p-3 break-words"
            >
              {{ row.product_name || row.product_code }} · {{ row.qty }} ×
              {{ amount(row.rate, state.selected.currency)
              }}<span class="block"
                >{{ __('Discount') }}: {{ row.discount_percentage || 0 }}% ·
                {{
                  amount(row.net_amount ?? row.amount, state.selected.currency)
                }}</span
              >
            </li>
          </ul>
          <p class="whitespace-pre-wrap break-words">
            {{ state.selected.terms }}
          </p>
        </div>
        <form
          v-if="state.decision"
          class="rounded border border-outline-gray-2 p-3 space-y-3"
          @submit.prevent="recordDecision"
        >
          <fieldset :disabled="locked" class="min-w-0 space-y-3">
            <h4 class="font-semibold">
              {{
                state.decision === 'Accepted'
                  ? __('Record customer acceptance')
                  : __('Record customer rejection')
              }}
            </h4>
            <p class="text-sm">
              {{
                __(
                  'Record the customer’s decision on this exact revision. This does not mark the deal paid.',
                )
              }}
            </p>
            <label class="block"
              >{{ __('Decision channel')
              }}<select v-model="state.channel" class="offer-input">
                <option
                  v-for="channel in channels"
                  :key="channel"
                  :value="channel"
                >
                  {{ __(channel) }}
                </option>
              </select></label
            >
            <label class="block"
              >{{ __('Decision evidence')
              }}<textarea
                v-model="state.evidence"
                required
                maxlength="2000"
                rows="3"
                class="offer-input"
              />
            </label>
            <button
              type="submit"
              class="offer-button"
              :disabled="!state.evidence.trim()"
            >
              {{ __('Save customer decision') }}
            </button>
            <button
              type="button"
              class="offer-button ml-2"
              @click="state.decision = ''"
            >
              {{ __('Cancel') }}
            </button>
          </fieldset>
        </form>
        <section
          v-if="state.erp"
          class="rounded border border-outline-gray-2 p-3 space-y-3"
          :aria-label="__('ERP quotation review')"
        >
          <h4 class="font-semibold">{{ __('Review draft ERP quotation') }}</h4>
          <p>{{ state.erp.company }} · {{ state.erp.customer }}</p>
          <dl class="grid gap-2 sm:grid-cols-2">
            <div>
              <dt>{{ __('Offered amount') }}</dt>
              <dd>{{ amount(state.erp.offer_total, state.erp.currency) }}</dd>
            </div>
            <div>
              <dt>{{ __('ERP net subtotal') }}</dt>
              <dd>{{ amount(state.erp.net_total, state.erp.currency) }}</dd>
            </div>
            <div>
              <dt>{{ __('ERP taxes and charges') }}</dt>
              <dd>{{ amount(state.erp.taxes, state.erp.currency) }}</dd>
            </div>
            <div>
              <dt>{{ __('ERP total including taxes') }}</dt>
              <dd>{{ amount(state.erp.grand_total, state.erp.currency) }}</dd>
            </div>
            <div>
              <dt>
                {{
                  state.erp.rounding_applied
                    ? __('Rounded ERP payable amount')
                    : __('ERP payable amount')
                }}
              </dt>
              <dd class="font-semibold" data-erp-payable>
                {{ amount(state.erp.payable_total, state.erp.currency) }}
              </dd>
            </div>
            <div>
              <dt>{{ __('Payable difference from offered amount') }}</dt>
              <dd data-erp-difference>
                {{ amount(state.erp.total_difference, state.erp.currency) }}
              </dd>
            </div>
          </dl>
          <ul>
            <li v-for="(row, index) in state.erp.items" :key="index">
              {{ row.item_name || row.item_code }} · {{ row.qty }}
              {{ row.uom }} × {{ amount(row.rate, state.erp.currency) }}
            </li>
          </ul>
          <p>
            {{
              __(
                'The ERP quotation needs its own customer approval if terms differ. Creating it does not record an order, invoice or payment.',
              )
            }}
          </p>
          <label v-if="state.erp.financial_drift" class="block"
            >{{ __('Explain approval of the changed ERP figures')
            }}<textarea
              v-model="state.reviewNote"
              class="offer-input"
              :disabled="locked"
            />
          </label>
          <button
            class="offer-button"
            :disabled="
              locked || (state.erp.financial_drift && !state.reviewNote.trim())
            "
            @click="createQuotation"
          >
            {{ __('Create draft ERP quotation') }}
          </button>
        </section>
        <section
          v-if="state.preview"
          class="space-y-3"
          :aria-label="__('Offer preview')"
        >
          <p>
            {{ __('Print or save this preview as PDF using your browser.') }}
          </p>
          <button class="offer-button" @click="printPreview">
            {{ __('Print / save PDF') }}
          </button>
          <iframe
            ref="previewFrame"
            :srcdoc="state.preview"
            sandbox="allow-same-origin allow-modals"
            :title="__('Offer preview')"
            class="h-[65vh] w-full rounded border border-outline-gray-2 bg-white"
          />
        </section>
      </div>
    </div>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import OfferDraft from './OfferDraft.vue'
import { draftValues } from './offerState'
const props = defineProps({
  deal: { type: Object, required: true },
  state: { type: Object, required: true },
})
const state = props.state
const previewFrame = ref(null)
const channels = ['Email', 'Phone', 'WhatsApp', 'In Person', 'Other']
const locked = computed(() => state.busy || !!state.pending || state.loading)
const dirty = computed(
  () => !!state.draft && JSON.stringify(state.draft) !== state.baseline,
)
const caps = computed(() => state.selected?.capabilities || {})
const deskUrl = computed(
  () => `/app/crm-offer/${encodeURIComponent(state.selected?.name || '')}`,
)
const quotationUrl = (name) => `/app/quotation/${encodeURIComponent(name)}`
const cryptoId = () => crypto.randomUUID()
function amount(value, currency) {
  const precision = Number.isInteger(state.selected?.currency_precision)
    ? Math.max(0, Math.min(6, state.selected.currency_precision))
    : 2
  return `${currency || ''} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}`
}
function errorText(error) {
  if (error?.exc_type === 'PermissionError')
    return __(
      'You do not have permission for this offer action. Your draft is preserved.',
    )
  return (
    error?.messages?.[0] ||
    error?.message ||
    __('Unable to complete the action. Your draft is preserved.')
  )
}
function canSwitch() {
  return (
    !locked.value &&
    (!dirty.value ||
      window.confirm(__('Discard unsaved changes to this offer draft?')))
  )
}
function setSelected(offer, keepDraft = false) {
  state.selected = offer
  if (!keepDraft) {
    state.draft =
      offer?.status === 'Draft' && offer.capabilities?.can_edit
        ? draftValues(offer)
        : null
    state.baseline = JSON.stringify(state.draft)
    state.decision = ''
    state.evidence = ''
    state.error = ''
    state.reviewRequired = false
  }
  state.preview = ''
  state.erp = null
  state.reviewNote = ''
}
async function select(offer) {
  if (!canSwitch()) return
  state.loading = true
  const epoch = ++state.epoch
  try {
    const current = await call('crm.api.offers.get_offer', { name: offer.name })
    if (epoch === state.epoch) setSelected(current)
  } catch (error) {
    if (epoch === state.epoch) state.error = errorText(error)
  } finally {
    if (epoch === state.epoch) state.loading = false
  }
}
async function load(more = false) {
  if (locked.value) return
  state.loading = true
  state.loadError = ''
  const epoch = ++state.epoch
  try {
    const data = await call('crm.api.offers.get_offers', {
      deal: props.deal.name,
      offset: more ? state.offers.length : 0,
    })
    if (epoch !== state.epoch) return
    state.offers = more ? [...state.offers, ...data.offers] : data.offers
    state.canCreate = data.can_create
    state.erpAvailable = data.erp_available
    state.total = data.total
    state.hasMore = data.has_more
  } catch (error) {
    if (epoch === state.epoch) state.loadError = errorText(error)
  } finally {
    if (epoch === state.epoch) state.loading = false
  }
}
function newDraft() {
  if (!canSwitch()) return
  setSelected(null)
  state.draft = draftValues(props.deal)
  state.baseline = ''
}
async function refreshSelected() {
  if (locked.value) return
  state.loading = true
  try {
    const latest = await call('crm.api.offers.get_offer', {
      name: state.selected.name,
    })
    const keep = latest.status === 'Draft' && latest.capabilities?.can_edit
    if (state.draft && !keep) {
      state.error = __(
        'This offer is no longer editable. Your local draft is retained; copy it into a new revision after reviewing the saved version.',
      )
      state.reviewRequired = true
      state.selected = latest
      return
    }
    setSelected(latest, !!state.draft)
    state.reviewRequired = false
    state.error = __(
      'Saved version refreshed. Your local draft is retained; compare the preview before saving.',
    )
  } catch (error) {
    state.error = errorText(error)
  } finally {
    state.loading = false
  }
}
function command(method, extra = {}) {
  if (locked.value) return
  const args = {
    name: state.selected?.name,
    modified: state.selected?.modified,
    ...extra,
  }
  if (['revise', 'create_erp_quotation'].includes(method)) delete args.modified
  state.pending = {
    method,
    args: JSON.parse(JSON.stringify(args)),
    retainedDraft:
      method === 'revise' && state.draft
        ? JSON.parse(JSON.stringify(state.draft))
        : null,
  }
  runPending()
}
function save() {
  if (
    locked.value ||
    state.reviewRequired ||
    !state.draft?.currency ||
    !state.draft.products.length
  )
    return
  state.pending = {
    method: 'save_draft',
    args: {
      deal: props.deal.name,
      values: JSON.parse(JSON.stringify(state.draft)),
      name: state.selected?.name || null,
      modified: state.selected?.modified || null,
      request_id: cryptoId(),
    },
  }
  runPending()
}
function recordDecision() {
  if (!state.evidence.trim()) return
  command('record_decision', {
    decision: state.decision,
    channel: state.channel,
    evidence: state.evidence.trim(),
  })
}
async function runPending() {
  if (state.busy || !state.pending) return
  state.busy = true
  state.error = ''
  try {
    const result = await call(
      `crm.api.offers.${state.pending.method}`,
      state.pending.args,
    )
    const offer =
      state.pending.method === 'create_erp_quotation' ? result.offer : result
    const retainedDraft = state.pending.retainedDraft
    state.pending = null
    if (offer.is_current)
      state.offers.forEach((row) => {
        if (row.root_offer === offer.root_offer) row.is_current = false
      })
    setSelected(offer)
    if (retainedDraft && state.draft) state.draft = retainedDraft
    const index = state.offers.findIndex((row) => row.name === offer.name)
    if (index < 0) state.offers.unshift(offer)
    else state.offers.splice(index, 1, offer)
  } catch (error) {
    state.error = errorText(error)
    // Server refusals are known outcomes; transport loss must replay the frozen command.
    if (
      error?.exc_type &&
      !['QueryTimeoutError', 'QueryDeadlockError'].includes(error.exc_type)
    ) {
      state.pending = null
      if (error.exc_type === 'TimestampMismatchError')
        state.reviewRequired = true
    }
  } finally {
    state.busy = false
  }
}
async function preview() {
  if (locked.value) return
  state.busy = true
  state.error = ''
  try {
    state.preview = (
      await call('crm.api.offers.preview', { name: state.selected.name })
    ).html
  } catch (error) {
    state.error = errorText(error)
  } finally {
    state.busy = false
  }
}
function printPreview() {
  previewFrame.value?.contentWindow?.print()
}
async function reviewErp() {
  if (locked.value) return
  state.busy = true
  state.error = ''
  state.erp = null
  try {
    const result = await call('crm.api.offers.preview_erp', {
      name: state.selected.name,
    })
    if (!result.available)
      throw new Error(
        __(
          'ERP quotation is unavailable. Review the company, customer and product setup in Desk.',
        ),
      )
    if (
      !Number.isFinite(result.payable_total) ||
      typeof result.rounding_applied !== 'boolean'
    ) {
      throw new Error(
        __(
          'The ERP preview is incomplete. Refresh the review before creating a quotation.',
        ),
      )
    }
    state.erp = result
    state.reviewNote = ''
  } catch (error) {
    state.error = errorText(error)
  } finally {
    state.busy = false
  }
}
function createQuotation() {
  command('create_erp_quotation', {
    review_hash: state.erp.review_hash,
    review_note: state.reviewNote.trim(),
  })
}
watch(
  () => props.deal.name,
  (name) => {
    if (!name || state.deal === name) return
    state.deal = name
    state.offers = []
    state.canCreate = false
    state.hasMore = false
    state.total = 0
    setSelected(null)
    load()
  },
  { immediate: true },
)
</script>
<style scoped>
.offers :deep(.offer-button) {
  @apply min-h-11 max-w-full rounded border border-outline-gray-2 bg-surface-base px-3 py-2 text-sm text-ink-gray-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50;
}
.offers :deep(.offer-input) {
  @apply block min-h-11 w-full min-w-0 rounded border border-outline-gray-2 bg-surface-base px-3 py-2 text-base text-ink-gray-9;
}
.offers :deep(input),
.offers :deep([role='combobox']) {
  min-height: 44px;
}
</style>
