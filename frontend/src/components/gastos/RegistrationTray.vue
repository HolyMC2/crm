<template>
  <Transition name="reg-tray">
    <section
      v-if="rows.length"
      class="reg-tray fixed left-1/2 z-40 w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-8 border border-outline-gray-2 bg-surface-base shadow-2xl"
      :aria-label="__('Bills registering')"
    >
      <!-- Indeterminate while one is still posting; full once all are done. -->
      <div class="h-0.5 w-full overflow-hidden bg-surface-gray-2">
        <div
          v-if="queued"
          class="reg-tray-bar h-full w-1/3 rounded-full bg-surface-blue-2"
        />
        <div
          v-else
          class="h-full w-full transition-colors"
          :class="failed ? 'bg-surface-red-2' : 'bg-surface-green-2'"
        />
      </div>

      <button
        class="flex min-h-11 w-full items-center gap-2 px-3.5 py-2 text-left"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <span
          class="min-w-0 flex-1 truncate text-sm font-medium text-ink-gray-9"
        >
          {{ headline }}
        </span>
        <span v-if="queued" class="whitespace-nowrap text-xs text-ink-gray-5">{{
          __('You can keep working')
        }}</span>
        <LucideChevronDown
          class="h-4 w-4 shrink-0 text-ink-gray-5 transition-transform"
          :class="collapsed && 'rotate-180'"
        />
      </button>

      <TransitionGroup
        v-show="!collapsed"
        tag="ul"
        name="reg-row"
        role="status"
        aria-live="polite"
        class="max-h-72 overflow-y-auto border-t border-outline-gray-1"
      >
        <li
          v-for="row in rows"
          :key="row.name"
          class="flex items-start gap-3 px-3.5 py-3"
          :class="row.state === 'failed' && 'bg-surface-red-1'"
        >
          <span
            class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            :class="
              {
                queued: 'bg-surface-blue-1 text-ink-blue-9',
                done: 'bg-surface-green-2 text-ink-green-8',
                failed: 'bg-surface-red-2 text-ink-red-7',
              }[row.state]
            "
          >
            <LucideLoaderCircle
              v-if="row.state === 'queued'"
              class="h-4 w-4 animate-spin"
            />
            <LucideCircleCheck
              v-else-if="row.state === 'done'"
              class="reg-pop h-4 w-4"
            />
            <LucideCircleAlert v-else class="reg-pop h-4 w-4" />
          </span>

          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <button
                class="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink-gray-9 hover:underline"
                @click="openBill(row.name)"
              >
                {{ row.party }}
              </button>
              <span
                v-if="row.total"
                class="whitespace-nowrap text-sm tabular-nums text-ink-gray-7"
                >{{ money(row.total, row.currency) }}</span
              >
            </div>
            <p
              class="mt-0.5 text-xs"
              :class="
                row.state === 'failed'
                  ? 'line-clamp-3 text-ink-red-7'
                  : 'text-ink-gray-6'
              "
            >
              {{ detail(row) }}
            </p>
            <div v-if="row.state === 'failed'" class="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="solid"
                :label="__('Review the bill')"
                @click="openBill(row.name)"
              />
              <Button
                size="sm"
                :label="__('Dismiss')"
                @click="dismissRegistration(row.name)"
              />
            </div>
          </div>

          <button
            v-if="row.state === 'done'"
            class="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-gray-5 hover:bg-surface-gray-2 hover:text-ink-gray-8"
            :aria-label="__('Dismiss')"
            @click="dismissRegistration(row.name)"
          >
            <LucideX class="h-4 w-4" />
          </button>
        </li>
      </TransitionGroup>
    </section>
  </Transition>
</template>
<script setup>
import { computed, getCurrentInstance, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import {
  dismissRegistration,
  registrations,
} from '@/composables/gastosRegistrations'
import {
  openBill,
  watchRegistrations,
} from '@/composables/useBillRegistrations'
import { money } from '@/composables/useGastos'
import LucideChevronDown from '~icons/lucide/chevron-down'
import LucideCircleAlert from '~icons/lucide/circle-alert'
import LucideCircleCheck from '~icons/lucide/circle-check'
import LucideLoaderCircle from '~icons/lucide/loader-circle'
import LucideX from '~icons/lucide/x'

// Bills «Registrar» sent to the background, on every page until each one is
// done (a few seconds, then it leaves) or its refusal is read and dismissed.

const router = useRouter()
const socket = getCurrentInstance()?.appContext.config.globalProperties.$socket
const collapsed = ref(false)

const rows = computed(() => registrations.value)
const queued = computed(
  () => rows.value.filter((row) => row.state === 'queued').length,
)
const failed = computed(
  () => rows.value.filter((row) => row.state === 'failed').length,
)

const headline = computed(() => {
  if (queued.value)
    return queued.value === 1
      ? __('Registering 1 bill…')
      : __('Registering {0} bills…', [queued.value])
  if (failed.value)
    return failed.value === 1
      ? __('1 bill could not be registered')
      : __('{0} bills could not be registered', [failed.value])
  return rows.value.length === 1
    ? __('Bill registered')
    : __('{0} bills registered', [rows.value.length])
})

function detail(row) {
  if (row.state === 'queued') return __('Posting to the books…')
  if (row.state === 'done') return __('Registered. It is now in To pay.')
  return row.message || __('Something went wrong.')
}

onMounted(() => watchRegistrations({ socket, router }))
</script>
<style scoped>
/* Above the phone tab bar; near the bottom edge on a desktop. */
.reg-tray {
  bottom: calc(5.25rem + env(safe-area-inset-bottom));
}
@media (min-width: 640px) {
  .reg-tray {
    bottom: 1.5rem;
  }
}
.reg-tray-bar {
  animation: reg-slide 1.4s ease-in-out infinite;
}
@keyframes reg-slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}
.reg-pop {
  animation: reg-pop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes reg-pop {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
}
.reg-tray-enter-active,
.reg-tray-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.reg-tray-enter-from,
.reg-tray-leave-to {
  opacity: 0;
  transform: translate(-50%, 1rem);
}
.reg-row-enter-active,
.reg-row-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.reg-row-enter-from,
.reg-row-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
@media (prefers-reduced-motion: reduce) {
  .reg-tray-bar,
  .reg-pop {
    animation: none;
  }
  .reg-tray-bar {
    width: 100%;
  }
}
</style>
