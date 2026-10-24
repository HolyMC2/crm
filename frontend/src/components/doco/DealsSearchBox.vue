<template>
  <FormControl
    type="text"
    :placeholder="__('Search deals, devices, ROs…')"
    v-model="searchText"
    @input="onSearchInput"
    class="w-64 max-sm:w-full"
  >
    <template #prefix>
      <LucideSearch class="h-4 w-4 text-ink-gray-5" />
    </template>
  </FormControl>
</template>

<script setup>
import { ref, inject } from 'vue'
import { FormControl, call } from 'frappe-ui'
import { useDebounceFn } from '@vueuse/core'
import LucideSearch from '~icons/lucide/search'

// Deal-native fields the search ORs across via crm.api.doc.get_data's
// or_filters parameter (added doco-side for free-text search).
const DEAL_FIELDS = ['name', 'organization', 'lead_name', 'email', 'mobile_no']

// viewControls is provided by Deals.vue; without it the slot stays inert
// instead of crashing on other lists that mount the same slot.
const viewControls = inject('dealsViewControls', null)

const searchText = ref('')

async function runSearch() {
  if (!viewControls?.value) return
  const text = searchText.value
  let dealIds = []
  if (text && text.trim()) {
    try {
      dealIds = await call('taller.api.vertical.search_deal_ids_by_repair', {
        text,
      })
    } catch (e) {
      dealIds = []
    }
  }
  viewControls.value.updateSearch(text, DEAL_FIELDS, dealIds)
}

const debouncedSearch = useDebounceFn(runSearch, 250)
function onSearchInput() {
  debouncedSearch()
}
</script>
