<template>
  <div v-if="events.length">
    <div
      v-for="(event, i) in events"
      :key="event.name"
      class="activity grid grid-cols-[30px_minmax(auto,_1fr)] gap-4 px-3 sm:px-10"
    >
      <div
        class="z-0 relative flex justify-center before:absolute before:left-[50%] before:-z-[1] before:top-0 before:border-l before:border-outline-elevation-2"
        :class="i != events.length - 1 ? 'before:h-full' : 'before:h-4'"
      >
        <div
          class="flex h-8 w-7 items-center justify-center bg-surface-base text-ink-gray-8"
        >
          <CalendarIcon class="h-4 w-4" />
        </div>
      </div>
      <div class="mb-5">
        <div
          class="mb-1 flex items-center justify-stretch gap-2 py-1 text-base"
        >
          <div class="inline-flex items-center flex-wrap gap-1 text-ink-gray-5">
            <Avatar
              :image="event.owner.image"
              :label="event.owner.label"
              size="md"
            />
            <span class="font-medium text-ink-gray-8 ml-1">
              {{ event.owner.label }}
            </span>
            <span>{{ 'has created an event' }}</span>
          </div>
          <div class="ml-auto flex items-center gap-3 whitespace-nowrap">
            <RouterLink
              class="text-sm text-ink-gray-6 underline-offset-2 hover:text-ink-gray-9 hover:underline"
              :to="agendaRoute(event)"
              @click.stop
              >{{ __('See in Agenda') }}</RouterLink
            >
            <TimelineTimestamp :date="event.creation" />
          </div>
        </div>
        <div
          class="flex gap-2 border cursor-pointer border-outline-elevation-2 rounded-lg bg-surface-elevation-1 px-2.5 py-2.5 text-ink-gray-9"
          @click="showEvent(event)"
        >
          <div
            class="flex w-[2px] rounded-lg"
            :style="{ backgroundColor: event.color || '#30A66D' }"
          />
          <div class="flex-1 flex flex-col gap-1 text-base">
            <div
              class="flex items-center justify-between gap-2 font-medium text-ink-gray-7"
            >
              <div>{{ event.subject }}</div>
              <MultipleAvatar
                v-if="event.participants?.length > 1"
                :avatars="event.participants"
                size="sm"
              />
            </div>
            <div
              class="flex justify-between gap-2 items-center text-ink-gray-6"
            >
              <div>
                {{
                  startEndTime(event.starts_on, event.ends_on, event.all_day)
                }}
              </div>
              <div>{{ startDate(event.starts_on) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <EmptyState
    v-else
    :title="__('No Events Scheduled')"
    :description="
      __('No events coming up. Create a new one to keep things on track.')
    "
    :icon="CalendarIcon"
    top="30%"
  />
</template>
<script setup>
import EmptyState from '@/components/ListViews/EmptyState.vue'
import CalendarIcon from '@/components/Icons/CalendarIcon.vue'
import MultipleAvatar from '@/components/MultipleAvatar.vue'
import { useEvent, showEventModal, activeEvent } from '@/composables/event'
import TimelineTimestamp from '@/components/Activities/TimelineTimestamp.vue'
import { Avatar } from 'frappe-ui'
import { RouterLink } from 'vue-router'

const props = defineProps({
  doctype: { type: String, default: '' },
  docname: { type: String, default: '' },
})

// The same event in the Agenda, on its day (its card opens there).
function agendaRoute(event) {
  const date = String(event.starts_on || '').slice(0, 10)
  const series = event.repeat_this_event ? `@${date}` : ''
  return {
    path: '/agenda',
    query: {
      view: 'week',
      ...(date ? { date } : {}),
      event: `Event:${event.name}${series}`,
    },
  }
}

function showEvent(e = {}) {
  showEventModal.value = true
  activeEvent.value = e
}

const { events, startEndTime, startDate } = useEvent({
  doctype: props.doctype,
  docname: props.docname,
})
</script>
