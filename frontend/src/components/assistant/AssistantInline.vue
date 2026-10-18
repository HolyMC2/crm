<template>
  <!-- One line of an answer: text, bold and links (shell records open in the
       shell; other links in a new tab). --><template
    v-for="(part, i) in parts"
    :key="i"
    ><RouterLink
      v-if="part.to"
      :to="part.to"
      class="text-ink-blue-link underline"
      @click="$emit('navigate')"
      >{{ __('Open', null, 'Assistant link') }}</RouterLink
    ><a
      v-else-if="part.href"
      :href="part.href"
      target="_blank"
      rel="noopener"
      class="break-all text-ink-blue-link underline"
      >{{ part.label }}</a
    ><strong v-else-if="part.strong" class="font-semibold">{{
      part.text
    }}</strong
    ><em v-else-if="part.em">{{ part.text }}</em
    ><template v-else>{{ part.text }}</template></template
  >
</template>
<script setup>
defineProps({ parts: { type: Array, default: () => [] } })
defineEmits(['navigate'])
</script>
