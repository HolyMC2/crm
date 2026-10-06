import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useCalendarNow() {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 60_000) })
  onBeforeUnmount(() => clearInterval(timer))
  return now
}
