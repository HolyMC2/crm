<template>
  <!-- «¿De dónde vino?» (Shell SPEC §6 DD7, D2): the channel, the campaign, the
       seller, the deal behind it, and who did each step (full names, never
       emails). Icon rows as in Xero's record header. -->
  <section
    v-if="rows.length"
    aria-labelledby="doc-atribucion"
    class="px-4"
    data-testid="ventas-atribucion"
  >
    <h2
      id="doc-atribucion"
      class="pb-1 text-base font-semibold text-ink-gray-9"
    >
      ¿De dónde vino?
    </h2>
    <ul>
      <li
        v-for="row in rows"
        :key="row.key"
        class="flex min-h-12 items-start gap-3 py-2"
        :data-attribution="row.key"
      >
        <span
          :class="[row.icon, 'mt-0.5 size-5 flex-none text-ink-gray-6']"
          aria-hidden="true"
        />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-sm text-ink-gray-6">{{ row.label }}</span>
          <span class="break-words text-base text-ink-gray-9">{{
            row.value
          }}</span>
          <span v-if="row.detail" class="break-words text-sm text-ink-gray-6">{{
            row.detail
          }}</span>
        </span>
      </li>
      <li v-if="dealTo">
        <RouterLink
          :to="dealTo"
          class="flex min-h-12 items-center gap-3 rounded-6 py-2 hover:bg-surface-gray-1"
          data-testid="ventas-atribucion-trato"
        >
          <span
            class="lucide-link size-5 flex-none text-ink-gray-6"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1 break-words text-base text-ink-gray-9"
            >Ver el trato{{
              data.trato.title ? ` de ${data.trato.title}` : ''
            }}</span
          >
          <span
            class="lucide-chevron-right size-5 flex-none text-ink-gray-5"
            aria-hidden="true"
          />
        </RouterLink>
      </li>
    </ul>
    <template v-if="who.length">
      <h3 class="pb-1 pt-3 text-sm font-medium text-ink-gray-7">
        Quién hizo cada paso
      </h3>
      <ul class="divide-y divide-outline-gray-1">
        <li
          v-for="entry in who"
          :key="`${entry.doctype}:${entry.name}`"
          class="flex min-h-11 flex-col justify-center py-2"
          data-testid="ventas-paso"
        >
          <span class="text-base text-ink-gray-9">{{ entry.label }}</span>
          <span class="break-words text-sm text-ink-gray-6">{{
            entry.line
          }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { attributionRows, loadOrigen, whoLine } from './origen'

const props = defineProps({
  record: { type: Object, required: true },
  doctype: { type: String, default: '' },
  name: { type: String, default: '' },
})

const data = ref(null)
const rows = computed(() => attributionRows(data.value))
const who = computed(() =>
  (data.value?.pasos || [])
    .map((entry) => ({ ...entry, line: whoLine(entry) }))
    .filter((entry) => entry.line),
)
const dealTo = computed(() =>
  data.value?.trato?.name
    ? { name: 'Deal', params: { dealId: data.value.trato.name } }
    : null,
)

watch(
  () => [props.record.name, props.record.modified],
  async () => {
    try {
      data.value = await loadOrigen(props.record)
    } catch {
      data.value = null
    }
  },
  { immediate: true },
)
</script>
