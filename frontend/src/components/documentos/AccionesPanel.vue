<template>
  <!-- The groups of documentos/acciones.js: «Crear» as icon tiles, the rest
       as rows. A row with options unfolds them in place; one the worker
       cannot use now keeps its place and says why. -->
  <div class="pb-2" data-testid="acciones">
    <section
      v-for="group in groups"
      :key="group.key"
      :aria-label="group.title"
      class="pt-1"
      :data-acciones-group="group.key"
    >
      <p class="px-4 pb-1 pt-2 text-sm font-medium text-ink-gray-6">
        {{ group.title }}
      </p>
      <div
        v-if="group.tiles"
        class="grid gap-2 px-3 pb-1"
        :style="{
          gridTemplateColumns: `repeat(${Math.min(group.items.length, 3)}, minmax(0, 1fr))`,
        }"
      >
        <RouterLink
          v-for="item in group.items"
          :key="item.key"
          :to="item.to"
          :title="item.hint || undefined"
          class="press flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-8 bg-surface-gray-1 px-2 py-3 text-center text-sm font-medium text-ink-gray-8 hover:bg-surface-gray-2 focus-visible:bg-surface-gray-2"
          :data-accion="item.key"
          @click="emit('pick', { key: item.key })"
        >
          <span
            :class="[item.icon, 'size-6 text-ink-gray-7']"
            aria-hidden="true"
          />
          {{ item.label }}
        </RouterLink>
      </div>
      <ul v-else>
        <li v-for="item in group.items" :key="item.key">
          <ListRow
            :icon="item.icon"
            :title="item.label"
            :subtitle="item.allowed ? item.hint : item.reason"
            :subtitle-lines="2"
            :to="item.allowed ? item.to || null : null"
            :class="item.allowed ? '' : 'opacity-60'"
            :aria-disabled="item.allowed ? undefined : 'true'"
            :aria-expanded="
              item.options ? String(unfolded === item.key) : undefined
            "
            :data-accion="item.key"
            @click="tap(item)"
          >
            <template v-if="item.options" #trailing>
              <span
                class="lucide-chevron-down size-5 flex-none text-ink-gray-6 transition-transform duration-200 motion-reduce:transition-none"
                :class="unfolded === item.key ? 'rotate-180' : ''"
                aria-hidden="true"
              />
            </template>
          </ListRow>
          <ExpandTransition>
            <div
              v-if="item.options && unfolded === item.key"
              role="group"
              :aria-label="item.label"
              class="pb-1 pl-12"
            >
              <button
                v-for="option in item.options"
                :key="option.value || 'default'"
                type="button"
                class="press flex min-h-11 w-full items-center gap-3 rounded-7 px-4 text-left text-base hover:bg-surface-gray-1"
                :class="
                  option.selected
                    ? 'font-semibold text-ink-gray-9'
                    : 'text-ink-gray-8'
                "
                :aria-current="option.selected ? 'true' : undefined"
                :data-accion-option="option.value"
                @click="emit('pick', { key: item.key, value: option.value })"
              >
                <span class="min-w-0 flex-1">{{ option.label }}</span>
                <span
                  v-if="option.selected"
                  class="lucide-check size-5 flex-none"
                  aria-hidden="true"
                />
              </button>
            </div>
          </ExpandTransition>
        </li>
      </ul>
    </section>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { ListRow } from '@/components/ui'
import ExpandTransition from '@/components/ui/ExpandTransition.vue'

defineProps({
  // listActionsFor(profile, ctx) groups
  groups: { type: Array, default: () => [] },
})
const emit = defineEmits(['pick'])

const unfolded = ref('')

function tap(item) {
  if (!item.allowed) return
  if (item.options) {
    unfolded.value = unfolded.value === item.key ? '' : item.key
    return
  }
  emit('pick', { key: item.key })
}
</script>
