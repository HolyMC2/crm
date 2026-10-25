<template>
  <!-- An answer's prose: paragraphs, headings, list items and tables from the
       model's Markdown, rendered as elements (never v-html). -->
  <div class="space-y-2 break-words text-base text-ink-gray-9">
    <template v-for="(block, b) in blocks" :key="b">
      <p v-if="block.type === 'h'" class="pt-1 font-semibold">
        <AssistantInline :parts="block.parts" @navigate="$emit('navigate')" />
      </p>
      <div
        v-else-if="block.type === 'li'"
        class="flex gap-2"
        :class="block.nested ? 'pl-7' : 'pl-1'"
      >
        <span
          class="flex-none tabular-nums text-ink-gray-6"
          :class="block.marker === '•' ? 'w-3' : 'min-w-5'"
          aria-hidden="true"
          >{{ block.marker }}</span
        >
        <p class="min-w-0 flex-1 whitespace-pre-line">
          <AssistantInline :parts="block.parts" @navigate="$emit('navigate')" />
        </p>
      </div>
      <div
        v-else-if="block.type === 'table'"
        class="overflow-x-auto rounded-6 border border-outline-gray-2"
        data-testid="assistant-table"
      >
        <table class="w-full text-left text-sm">
          <thead class="bg-surface-gray-1 text-ink-gray-6">
            <tr>
              <th
                v-for="(cell, c) in block.head"
                :key="c"
                scope="col"
                class="whitespace-nowrap px-2 py-1.5 font-medium"
              >
                <AssistantInline :parts="cell" />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, r) in block.rows"
              :key="r"
              class="border-t border-outline-gray-1"
            >
              <td v-for="(cell, c) in row" :key="c" class="px-2 py-1.5">
                <AssistantInline :parts="cell" @navigate="$emit('navigate')" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="whitespace-pre-line">
        <AssistantInline :parts="block.parts" @navigate="$emit('navigate')" />
      </p>
    </template>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import AssistantInline from './AssistantInline.vue'
import { proseBlocks } from './assistantText'

const props = defineProps({ text: { type: String, default: '' } })
defineEmits(['navigate'])

const blocks = computed(() => proseBlocks(props.text))
</script>
