<template>
  <!-- «¿A quién reporta …?»: one tap on a name moves the person; the page
       shows it at once and offers «Deshacer». Their own team stays listed,
       greyed with why, so nobody wonders where a name went. -->
  <BottomSheet
    :open="open"
    :title="__('Whom does {0} report to?', [name])"
    @update:open="(v) => !v && $emit('close')"
  >
    <div class="space-y-3" data-testid="org-reporta-sheet">
      <input
        v-if="options.length > 6"
        v-model="query"
        type="search"
        class="h-11 w-full rounded-6 border-transparent bg-surface-gray-2 px-3 text-base text-ink-gray-9 placeholder-ink-gray-5 focus:border-outline-gray-4 focus:ring-0"
        :placeholder="__('Search a person')"
        :aria-label="__('Search a person')"
        enterkeyhint="search"
      />
      <ul class="divide-y divide-outline-gray-1">
        <li v-if="person.reports_to || person.boss_gone">
          <button
            type="button"
            class="press flex min-h-12 w-full items-center gap-3 py-2 text-left"
            data-testid="org-reporta-top"
            @click="$emit('pick', null)"
          >
            <span
              class="flex size-9 flex-none items-center justify-center rounded-full bg-surface-gray-2 text-ink-gray-6"
              aria-hidden="true"
            >
              <span class="lucide-arrow-up size-4" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-base text-ink-gray-9">{{
                __('Nobody')
              }}</span>
              <span class="block text-sm text-ink-gray-6">{{
                __('At the top, like the owner.')
              }}</span>
            </span>
          </button>
        </li>
        <li v-for="option in shown" :key="option.employee">
          <button
            type="button"
            class="press flex min-h-12 w-full items-center gap-3 py-2 text-left disabled:cursor-not-allowed"
            :disabled="option.under || option.current"
            :data-testid="`org-reporta-${option.employee}`"
            @click="$emit('pick', option.employee)"
          >
            <span
              class="flex size-9 flex-none items-center justify-center rounded-full bg-surface-gray-3 text-sm font-medium text-ink-gray-7"
              :class="option.under ? 'opacity-50' : ''"
              aria-hidden="true"
            >
              <span v-if="option.full_name">{{
                initials(option.full_name)
              }}</span>
              <span v-else class="lucide-user-round size-4" />
            </span>
            <span
              class="min-w-0 flex-1"
              :class="option.under ? 'opacity-60' : ''"
            >
              <span class="block truncate text-base text-ink-gray-9">{{
                option.full_name || __('No name')
              }}</span>
              <span class="block truncate text-sm text-ink-gray-6">{{
                detail(option)
              }}</span>
            </span>
            <span
              v-if="option.current"
              class="lucide-check size-4 flex-none text-ink-gray-7"
              :aria-label="__('Now')"
              role="img"
            />
          </button>
        </li>
      </ul>
      <p v-if="!shown.length" class="py-4 text-sm text-ink-gray-6">
        {{ __('Nobody with that name.') }}
      </p>
    </div>
  </BottomSheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { BottomSheet, initials } from '@/components/ui'
import { matchTokens } from '@/vendor/muelle-shell/contracts/search'
import { bossOptions, roleLine } from './organigrama'

const props = defineProps({
  open: { type: Boolean, default: false },
  person: { type: Object, required: true },
  nodes: { type: Object, required: true },
})
defineEmits(['pick', 'close'])

const query = ref('')
watch(
  () => props.open,
  (open) => open && (query.value = ''),
)
const name = computed(() => props.person.full_name || __('this person'))
const options = computed(() => bossOptions(props.person.employee, props.nodes))
const shown = computed(() =>
  options.value.filter((o) =>
    matchTokens(query.value, o.full_name || '', o.puesto || ''),
  ),
)
function detail(option) {
  if (option.current) return __('Reports to them now')
  if (option.under) return __('Is on their team: move them first')
  return roleLine(option)
}
</script>
