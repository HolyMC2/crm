<template>
  <div class="flex flex-col gap-6">
    <section :aria-labelledby="`${id}-hours`" class="flex flex-col gap-2">
      <h3 :id="`${id}-hours`" class="title-face text-lg font-semibold">
        {{ __('Office hours') }}
      </h3>
      <SettingSwitch
        v-model="doc.office_hours_enabled"
        :label="__('Answer automatically outside office hours')"
        :description="
          __(
            'Days and hours your team answers. Outside them the customer gets the away message once.',
          )
        "
      />
      <template v-if="doc.office_hours_enabled">
        <WeekHours v-model:doc="doc" />
        <div class="flex flex-wrap items-end gap-3">
          <Link
            v-model="doc.holiday_list"
            class="min-w-0 flex-1 basis-56"
            doctype="CRM Holiday List"
            :label="__('Holidays')"
            :placeholder="__('No holidays')"
          />
          <FormControl
            v-model.number="doc.away_repeat_hours"
            class="w-48"
            type="number"
            :min="0"
            :label="__('Send the away message again after (hours)')"
          />
        </div>
        <FormControl
          v-model="doc.away_message"
          type="textarea"
          :rows="3"
          :label="__('Away message')"
        />
        <p
          v-if="!String(doc.away_message || '').trim()"
          role="alert"
          class="text-p-sm text-ink-red-7"
        >
          {{ __('Write the message customers receive outside office hours.') }}
        </p>
      </template>
    </section>

    <section :aria-labelledby="`${id}-goals`" class="flex flex-col gap-2">
      <h3 :id="`${id}-goals`" class="title-face text-lg font-semibold">
        {{ __('Service targets') }}
      </h3>
      <div class="flex flex-wrap gap-3">
        <FormControl
          v-model.number="doc.first_response_minutes"
          class="w-48"
          type="number"
          :min="0"
          :label="__('First reply within (minutes)')"
        />
        <FormControl
          v-model.number="doc.resolution_hours"
          class="w-48"
          type="number"
          :min="0"
          :label="__('Close within (hours)')"
        />
      </div>
      <p class="text-p-sm text-ink-gray-5">
        {{
          __(
            "The late reply alert uses it for every wait, counted from the customer's first unanswered message.",
          )
        }}
      </p>
      <SettingSwitch
        v-model="doc.sla_alerts_enabled"
        :label="__('Alert when a customer waits longer than the reply goal')"
        :description="
          __(
            'Tells the person who has the conversation, or the managers when nobody has it. Once per wait, and only while you are open when office hours are on.',
          )
        "
        :disabled="!doc.first_response_minutes"
        :blocked="
          !doc.first_response_minutes
            ? __('Set a first reply goal above to turn alerts on.')
            : ''
        "
      />
      <SettingSwitch
        v-model="doc.reopen_on_customer_message"
        :label="
          __('Reopen a closed conversation when the customer writes again')
        "
        :description="
          __(
            'It goes back to the person who had it, if they can still answer it; otherwise it waits in «Sin asignar».',
          )
        "
      />
    </section>

    <section :aria-labelledby="`${id}-csat`" class="flex flex-col gap-2">
      <h3 :id="`${id}-csat`" class="title-face text-lg font-semibold">
        {{ __('Customer satisfaction') }}
      </h3>
      <SettingSwitch
        v-model="doc.csat_enabled"
        :label="__('Ask customers to rate the conversation when it is closed')"
        :description="
          __(
            'Ratings show in the conversation header and in the team performance report.',
          )
        "
      />
      <template v-if="doc.csat_enabled">
        <FormControl
          v-model="doc.csat_message"
          type="textarea"
          :rows="3"
          :label="__('Rating message')"
        />
        <p
          class="text-p-sm"
          :class="
            String(doc.csat_message || '').includes('{link}')
              ? 'text-ink-gray-5'
              : 'text-ink-red-7'
          "
          :role="
            String(doc.csat_message || '').includes('{link}')
              ? undefined
              : 'alert'
          "
        >
          {{
            __('{link} is replaced by the rating page for this conversation.')
          }}
        </p>
        <FormControl
          v-model.number="doc.csat_valid_days"
          class="w-48"
          type="number"
          :min="1"
          :label="__('Rating link valid for (days)')"
        />
      </template>
    </section>
  </div>
</template>
<script setup>
import { useId } from 'vue'
import { FormControl } from 'frappe-ui'
import Link from '@/components/Controls/Link.vue'
import SettingSwitch from './SettingSwitch.vue'
import WeekHours from './WeekHours.vue'

defineModel('doc', { type: Object, required: true })
const id = useId()
</script>
