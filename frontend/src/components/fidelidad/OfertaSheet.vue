<template>
  <!-- One promotion: what it gives and until when, then the four things a
       seller does to it, each one tap (pause, resume, extend, end today; the
       end asks once more in place), its coupons, and «Regalar cupón». -->
  <BottomSheet
    :open="open"
    :title="row?.title || __('Promotion')"
    @update:open="(v) => !v && emit('update:open', false)"
  >
    <div data-testid="fidelidad-oferta-sheet" v-if="row" class="space-y-5">
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <StatusChip :label="chip.label" :tone="chip.tone" />
          <span class="text-sm text-ink-gray-7">{{ offerWhen(row) }}</span>
        </div>
        <p class="text-lg font-semibold text-ink-gray-9">
          {{ offerSummary(row, currency) }}
        </p>
        <p class="text-sm text-ink-gray-6">{{ offerHow(row) }}</p>
        <p
          v-if="detail?.description && detail.description !== row.title"
          class="text-sm text-ink-gray-6"
        >
          {{ detail.description }}
        </p>
      </div>

      <div
        v-if="row.coupon_based"
        class="grid grid-cols-2 gap-px overflow-hidden rounded-7 border border-outline-gray-2 bg-surface-gray-2"
      >
        <div class="bg-surface-base p-3">
          <p class="text-xs text-ink-gray-6">{{ __('Coupons given') }}</p>
          <p class="num text-lg font-semibold">{{ row.coupons.issued }}</p>
        </div>
        <div class="bg-surface-base p-3">
          <p class="text-xs text-ink-gray-6">{{ __('Used') }}</p>
          <p class="num text-lg font-semibold">{{ row.coupons.used }}</p>
        </div>
      </div>

      <section v-if="canEdit" class="space-y-3" :aria-label="__('Change')">
        <div class="grid grid-cols-2 gap-2">
          <button
            v-if="row.state === 'paused'"
            type="button"
            :class="BTN.filled"
            class="press col-span-2"
            :disabled="busy"
            data-testid="oferta-reanudar"
            @click="change('resume')"
          >
            <span class="lucide-play size-4" aria-hidden="true" />
            {{ __('Resume') }}
          </button>
          <template v-else-if="row.state !== 'ended'">
            <button
              type="button"
              :class="BTN.tonal"
              class="press"
              :disabled="busy"
              data-testid="oferta-pausar"
              @click="change('pause')"
            >
              <span class="lucide-pause size-4" aria-hidden="true" />
              {{ __('Pause') }}
            </button>
            <button
              type="button"
              :class="confirmEnd ? BTN.danger : BTN.tonal"
              class="press"
              :disabled="busy"
              data-testid="oferta-terminar"
              @click="endToday"
            >
              <span class="lucide-square size-4" aria-hidden="true" />
              {{ confirmEnd ? __('Yes, end it') : __('End today') }}
            </button>
          </template>
        </div>
        <ChipGroup
          :model-value="''"
          :label="row.state === 'ended' ? __('Run it again until') : __('Extend')"
          :options="extendOptions"
          testid="oferta-extender"
          @update:model-value="(v) => v && change('extend', v)"
        />
      </section>
      <p v-else class="text-sm text-ink-gray-6" role="note">
        {{ __('A sales manager can pause, extend or end it.') }}
      </p>

      <section
        v-if="row.coupon_based && detail?.coupon_list?.length"
        :aria-label="__('Coupons')"
      >
        <p class="mb-1 text-xs font-medium text-ink-gray-6">
          {{ __('Coupons') }}
        </p>
        <ul class="divide-y divide-outline-gray-1">
          <li
            v-for="c in detail.coupon_list"
            :key="c.name"
            class="flex min-h-12 items-center gap-3 py-2"
          >
            <span
              :class="c.personal ? 'lucide-user-round' : 'lucide-megaphone'"
              class="size-4 flex-none text-ink-gray-5"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="num truncate text-base text-ink-gray-9">{{ c.code }}</p>
              <p class="truncate text-xs text-ink-gray-6">
                {{ c.personal ? c.customer_name : couponUses(c) }}
              </p>
            </div>
            <StatusChip
              :label="couponChip(c).label"
              :tone="couponChip(c).tone"
            />
            <button
              type="button"
              class="press grid size-11 flex-none place-items-center rounded-full hover:bg-surface-gray-2"
              :aria-label="__('Copy {0}', [c.code])"
              :title="__('Copy {0}', [c.code])"
              @click="copy(c.code)"
            >
              <span class="lucide-copy size-4" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </section>
      <p v-if="error" role="alert" class="text-sm text-ink-red-7">
        {{ error }}
      </p>
    </div>
    <template v-if="row?.coupon_based && row.state !== 'ended' && row.state !== 'paused'" #actions>
      <button
        type="button"
        :class="BTN.filled"
        class="press"
        data-testid="oferta-cupon"
        @click="emit('coupon', row.name)"
      >
        <span class="lucide-ticket size-4" aria-hidden="true" />
        {{ __('Give a coupon') }}
      </button>
    </template>
  </BottomSheet>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import { BottomSheet, ChipGroup, StatusChip } from '@/components/ui'
import { BTN, copyText } from '@/documentos/tools'
import { errorText } from '@/documentos/api'
import {
  couponChip,
  couponUses,
  extendChips,
  fidelidadApi,
  offerChip,
  offerHow,
  offerSummary,
  offerWhen,
} from '@/composables/fidelidad'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** The board's row: shown at once while the detail loads. */
  offer: { type: Object, default: null },
  currency: { type: String, default: 'MXN' },
})
const emit = defineEmits(['update:open', 'changed', 'coupon'])

const detail = ref(null)
const busy = ref(false)
const error = ref('')
const confirmEnd = ref(false)
let confirmTimer = 0

const row = computed(() => detail.value || props.offer)
const chip = computed(() => offerChip(row.value))
const canEdit = computed(() =>
  detail.value ? detail.value.can_edit : false,
)
const extendOptions = computed(() => extendChips(row.value))

watch(
  () => [props.open, props.offer?.name],
  async ([open, name]) => {
    if (!open || !name) return
    error.value = ''
    confirmEnd.value = false
    if (detail.value?.name !== name) detail.value = null
    try {
      detail.value = await fidelidadApi('get_offer', { name })
    } catch (failure) {
      error.value = errorText(failure)
    }
  },
  { immediate: true },
)

async function change(action, until) {
  busy.value = true
  error.value = ''
  try {
    detail.value = await fidelidadApi('change_offer', {
      name: row.value.name,
      action,
      until: action === 'extend' && until !== 'none' ? until : undefined,
    })
    const said = {
      pause: __('Paused'),
      resume: __('Running again'),
      end: __('Ended'),
      extend: __('Extended'),
    }[action]
    toast.success(`${said}: ${detail.value.title}`)
    emit('changed', detail.value)
  } catch (failure) {
    error.value = errorText(failure)
  } finally {
    busy.value = false
    confirmEnd.value = false
  }
}

function endToday() {
  if (!confirmEnd.value) {
    confirmEnd.value = true
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => (confirmEnd.value = false), 4000)
    return
  }
  change('end')
}

async function copy(code) {
  if (await copyText(code)) toast.success(__('Copied: {0}', [code]))
}
</script>
