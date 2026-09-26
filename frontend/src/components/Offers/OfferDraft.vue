<template>
  <form class="space-y-4" @submit.prevent="$emit('save')">
    <fieldset :disabled="disabled" class="min-w-0 space-y-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="space-y-1"
          >{{ __('Offer title')
          }}<input
            v-model="draft.title"
            data-field="title"
            required
            maxlength="140"
            class="offer-input"
        /></label>
        <Link
          v-model="draft.currency"
          doctype="Currency"
          :label="__('Currency')"
          :disabled="disabled"
        />
        <label class="space-y-1"
          >{{ __('Valid until')
          }}<input
            v-model="draft.valid_until"
            type="date"
            required
            class="offer-input"
        /></label>
      </div>
      <p class="text-sm text-ink-gray-6">
        {{
          __(
            'Amounts are recalculated when saved. A service may be entered without a product code.',
          )
        }}
      </p>
      <div
        v-for="(row, index) in draft.products"
        :key="index"
        class="rounded border border-outline-gray-2 p-3 space-y-3"
      >
        <div class="flex items-center justify-between gap-2">
          <strong>{{ __('Line {0}', [index + 1]) }}</strong
          ><button
            type="button"
            class="offer-button"
            :aria-label="__('Remove line {0}', [index + 1])"
            @click="draft.products.splice(index, 1)"
          >
            {{ __('Remove') }}
          </button>
        </div>
        <Link
          v-model="row.product_code"
          doctype="CRM Product"
          :label="__('Product (optional)')"
          :disabled="disabled"
        />
        <label class="block space-y-1"
          >{{ __('Product or service description')
          }}<input
            v-model="row.product_name"
            required
            maxlength="140"
            class="offer-input"
        /></label>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label
            >{{ __('Quantity')
            }}<input
              v-model="row.qty"
              required
              type="number"
              min="0.000001"
              max="1000000"
              step="any"
              class="offer-input"
          /></label>
          <label
            >{{ __('Rate')
            }}<input
              v-model="row.rate"
              required
              type="number"
              min="0"
              max="1000000000000"
              step="any"
              class="offer-input"
          /></label>
          <label
            >{{ __('Discount (%)')
            }}<input
              v-model="row.discount_percentage"
              required
              type="number"
              min="0"
              max="100"
              step="any"
              class="offer-input"
          /></label>
        </div>
      </div>
      <button
        type="button"
        class="offer-button"
        :disabled="draft.products.length >= 100"
        @click="
          draft.products.push({
            product_code: '',
            product_name: '',
            qty: 1,
            rate: 0,
            discount_percentage: 0,
          })
        "
      >
        {{ __('Add product or service') }}
      </button>
      <label class="block space-y-1"
        >{{ __('Terms')
        }}<textarea
          v-model="draft.terms"
          rows="5"
          maxlength="10000"
          class="offer-input"
        />
      </label>
      <button
        type="submit"
        class="offer-button font-medium"
        :disabled="
          !draft.currency || !draft.valid_until || !draft.products.length
        "
      >
        {{ __('Save draft') }}
      </button>
    </fieldset>
  </form>
</template>
<script setup>
import Link from '@/components/Controls/Link.vue'
defineProps({ disabled: Boolean })
const draft = defineModel('draft', { type: Object, required: true })
defineEmits(['save'])
</script>
