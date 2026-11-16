<template>
  <BottomSheet
    :open="true"
    :title="__('Suggested goals')"
    :dismissible="!busy"
    @update:open="(value) => !value && emit('close')"
  >
    <p class="mb-3 text-sm text-ink-gray-7">
      {{
        __(
          'Goals in money or pieces start from each person’s usual week in your shop, plus 10 %. Service goals start at 90 %. You can change any of them later.',
        )
      }}
    </p>
    <div v-if="failure" role="alert" class="space-y-2 text-sm">
      <p class="text-ink-red-7">{{ failure }}</p>
      <Button :label="__('Retry', null, 'Equipo')" @click="load" />
    </div>
    <p v-else-if="!rows" role="status" class="py-6 text-sm">
      {{ __('Loading…', null, 'Equipo') }}
    </p>
    <p
      v-else-if="!rows.length"
      class="py-6 text-sm text-ink-gray-6"
      data-testid="metas-sugeridas-vacio"
    >
      {{
        __(
          'You already have every suggested goal, or your shop has no history yet for the rest.',
        )
      }}
    </p>
    <ul v-else class="space-y-2" data-testid="metas-sugeridas-lista">
      <li v-for="row in rows" :key="row.indicator">
        <label
          class="flex min-h-11 cursor-pointer items-start gap-3 rounded-6 border border-outline-gray-2 p-3"
        >
          <input
            v-model="chosen"
            type="checkbox"
            :value="row.indicator"
            class="mt-1 size-4"
            :data-sugerida="row.indicator"
          />
          <span class="min-w-0 flex-1">
            <span class="block font-medium text-ink-gray-9"
              >{{ row.label }}:
              {{ row.better === 'lower' ? '≤' : '≥' }}
              {{ row.target_text }}</span
            >
            <span class="block text-sm text-ink-gray-6">{{ row.help }}</span>
            <span class="block text-xs text-ink-gray-5">{{
              row.why === 'history'
                ? __('From your shop’s last four weeks')
                : __('A usual service bar')
            }}</span>
          </span>
        </label>
      </li>
    </ul>
    <template #actions>
      <div class="flex flex-wrap gap-2">
        <Button
          variant="solid"
          :label="__('Add {0} goals', [chosen.length])"
          :disabled="!chosen.length"
          :loading="busy"
          class="min-h-11 flex-1 sm:flex-none sm:min-h-8"
          data-testid="metas-sugeridas-agregar"
          @click="add"
        />
        <Button
          :label="__('Cancel', null, 'Equipo')"
          class="min-h-11 sm:min-h-8"
          @click="emit('close')"
        />
      </div>
    </template>
  </BottomSheet>
</template>
<script setup>
import { onMounted, ref } from 'vue'
import { Button } from 'frappe-ui'
import { BottomSheet } from '@/components/ui'
import { equipoApi, problemOf } from '@/composables/useEquipo'
import { METAS } from '@/composables/useMetas'

const emit = defineEmits(['close', 'saved'])
const rows = ref(null)
const chosen = ref([])
const busy = ref(false)
const failure = ref('')

async function load() {
  failure.value = ''
  try {
    const answer = await equipoApi(`${METAS}.suggested`)
    rows.value = answer.goals || []
    chosen.value = rows.value.map((row) => row.indicator)
  } catch (error) {
    const found = problemOf(error)
    failure.value = found.detail || found.message || found.title
  }
}

async function add() {
  busy.value = true
  try {
    await equipoApi(`${METAS}.add_suggested`, {
      keys: JSON.stringify(chosen.value),
    })
    emit('saved')
  } catch (error) {
    const found = problemOf(error)
    failure.value = found.detail || found.message || found.title
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>
