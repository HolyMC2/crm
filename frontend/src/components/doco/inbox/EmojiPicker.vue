<!-- Tiny emoji palette for the chat composers. No deps — a fixed common set. Emits
     `pick(emoji)`; the parent inserts it into its input. -->
<template>
  <div class="relative">
    <button
      type="button"
      class="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-[18px] text-ink-gray-6 hover:bg-surface-gray-2"
      :title="__('Emoji')"
      :aria-label="__('Emoji')"
      @click.stop="open = !open"
    >
      🙂
    </button>
    <div
      v-if="open"
      ref="pop"
      class="absolute bottom-11 right-0 z-20 w-[244px] rounded-xl border border-outline-gray-2 bg-surface-white p-2 shadow-lg"
    >
      <div class="grid grid-cols-8 gap-0.5">
        <button
          v-for="e in EMOJIS"
          :key="e"
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded text-[17px] hover:bg-surface-gray-2"
          @click="pick(e)"
        >
          {{ e }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const emit = defineEmits(['pick'])
const open = ref(false)
const pop = ref(null)

// prettier-ignore
const EMOJIS = [
  '😀','😁','😂','🤣','😊','😍','😘','😉','😎','🤔','😅','😢','😡','🙄','😴','🤗',
  '👍','👎','🙏','👏','🙌','👌','✌️','🤞','💪','👋','🤝','🫶','❤️','🔥','💯','⭐',
  '✅','❌','⚠️','🎉','🎁','💰','📱','💻','🔧','🛠️','📦','🚚','📸','🕐','📍','💬',
]

function pick(e) {
  emit('pick', e)
  open.value = false
}
function onDocClick(ev) {
  if (open.value && pop.value && !pop.value.contains(ev.target)) open.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>
