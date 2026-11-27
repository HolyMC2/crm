<template>
  <div class="flex flex-col gap-6">
    <section :aria-labelledby="`${id}-team`" class="flex flex-col gap-3">
      <h3 :id="`${id}-team`" class="title-face text-lg font-semibold">
        {{ __("Who answers the shop's line") }}
      </h3>
      <p v-if="error" role="alert" class="text-p-sm text-ink-red-7">
        {{ error }}
      </p>
      <p v-if="loading && !team" class="text-p-sm text-ink-gray-5">
        {{ __('Loading…') }}
      </p>
      <p
        v-else-if="team && !team.numbers.length"
        class="text-p-sm text-ink-gray-7"
        data-no-line
      >
        {{
          __("Connect the shop's Twilio number first, in Ajustes › Teléfono.")
        }}
      </p>
      <template v-else-if="team">
        <Segmented
          v-if="'call_ring_rule' in doc"
          :model-value="rule"
          :options="ruleOptions"
          :label="__('Who answers the shop\'s line')"
          data-ring-rule
          @update:model-value="(value) => (doc.call_ring_rule = value)"
        />
        <template v-if="rule === 'shift'">
          <div
            v-if="team.areas?.length > 1"
            class="flex flex-wrap gap-x-2"
            role="group"
            :aria-label="__('Areas that answer')"
            data-ring-areas
          >
            <button
              v-for="area in team.areas"
              :key="area.key"
              type="button"
              :class="chipClass(!skipped.has(area.key))"
              :aria-pressed="String(!skipped.has(area.key))"
              :data-area="area.key"
              @click="toggleArea(area.key)"
            >
              {{ area.label || __('No area') }}
              <span class="num font-normal">{{ area.people }}</span>
            </button>
          </div>
          <Field
            v-if="'call_ring_fallback' in doc"
            :model-value="doc.call_ring_fallback || 'list'"
            type="select"
            class="w-full max-w-md"
            :label="__('If nobody who sells is on shift')"
            :options="fallbackOptions"
            data-ring-fallback
            @update:model-value="(value) => (doc.call_ring_fallback = value)"
          />
          <p
            v-if="doc.call_ring_fallback === 'message' && !doc.call_voicemail"
            role="alert"
            class="text-p-sm text-ink-red-7"
          >
            {{
              __(
                'Let callers leave a message first: with nobody on shift the call goes to the message.',
              )
            }}
          </p>
        </template>
        <div
          v-if="now"
          class="flex flex-col gap-1 rounded-7 bg-surface-gray-1 px-4 py-3"
          aria-live="polite"
          data-ring-now
        >
          <p class="text-p-base-medium text-ink-gray-8" data-ring-now-title>
            {{ nowTitle }}
          </p>
          <ul v-if="!now.closed && now.people.length" class="flex flex-col">
            <li
              v-for="person in now.people"
              :key="person.user"
              class="flex flex-wrap items-baseline gap-x-2 text-p-sm"
              :data-ring-person="person.user"
            >
              <span class="font-medium text-ink-gray-8">{{
                person.full_name
              }}</span>
              <span class="text-[var(--muelle-on-surface-variant)]">{{
                whyLine(person)
              }}</span>
              <span
                :class="
                  person.reach === 'muelle_off'
                    ? 'text-ink-amber-8'
                    : 'text-[var(--muelle-on-surface-variant)]'
                "
                >{{ reachLine(person) }}</span
              >
            </li>
          </ul>
        </div>
        <ul
          v-if="team.people.length"
          class="divide-y divide-outline-gray-1"
          data-call-team
        >
          <li
            v-for="person in team.people"
            :key="person.user"
            class="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
          >
            <p
              class="min-w-0 flex-1 basis-40 truncate text-p-base-medium text-ink-gray-8"
            >
              {{ person.full_name }}
            </p>
            <button
              v-if="rule === 'shift'"
              type="button"
              :class="chipClass(person.always)"
              :aria-pressed="String(!!person.always)"
              :aria-label="__('{0} always rings', [person.full_name])"
              :title="__('Rings on every call, on shift or not')"
              :disabled="busy === person.user"
              data-always
              @click="setAlways(person)"
            >
              {{ __('Always') }}
            </button>
            <select
              :value="person.device"
              class="h-8 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-sm"
              :aria-label="`${person.full_name}: ${__('Where they take calls')}`"
              :disabled="busy === person.user"
              @change="(event) => choose(person, event.target.value)"
            >
              <option value="Computer">{{ __('In Muelle') }}</option>
              <option value="Phone">
                {{
                  person.has_mobile
                    ? __('On their phone ···{0}', [person.mobile_end])
                    : __('On their phone')
                }}
              </option>
              <option v-if="person.has_sip" value="SIP Phone">
                {{ __('SIP softphone') }}
              </option>
            </select>
            <button
              type="button"
              class="press flex h-8 items-center justify-center rounded-4 px-2 text-sm"
              :class="
                confirming === person.user
                  ? 'bg-surface-red-2 text-ink-red-7'
                  : 'text-ink-gray-6'
              "
              :aria-label="
                confirming === person.user
                  ? __('Remove {0}', [person.full_name])
                  : __('Remove from the line')
              "
              :title="__('Remove from the line')"
              :disabled="busy === person.user"
              @click="remove(person)"
            >
              <span v-if="confirming === person.user">{{ __('Remove') }}</span>
              <span v-else class="lucide-trash-2 size-4" aria-hidden="true" />
            </button>
            <form
              v-if="askingMobile === person.user"
              class="flex w-full flex-wrap items-end gap-2"
              data-ask-mobile
              @submit.prevent="saveMobile(person)"
            >
              <FormControl
                v-model="mobile"
                class="min-w-0 flex-1 basis-48"
                type="tel"
                :label="__('Mobile number of {0}', [person.full_name])"
                data-autofocus
              />
              <Button
                type="submit"
                class="press"
                variant="solid"
                :label="__('Send calls there')"
                :disabled="!mobile.trim() || busy === person.user"
              />
            </form>
          </li>
        </ul>
        <p v-else class="text-p-sm text-ink-gray-7" data-nobody>
          {{
            __('Nobody answers the line yet: add the people at the counter.')
          }}
        </p>
        <form
          class="flex flex-wrap items-end gap-2 pt-1"
          @submit.prevent="addPerson"
        >
          <Link
            v-model="newUser"
            class="min-w-0 flex-1 basis-56"
            doctype="User"
            :filters="{ enabled: 1, user_type: 'System User' }"
            :label="__('Add a person')"
            :placeholder="__('Search people')"
          />
          <Button
            type="submit"
            class="press"
            variant="subtle"
            :label="__('Add')"
            :disabled="!newUser || !!busy"
          />
        </form>
      </template>
    </section>

    <section :aria-labelledby="`${id}-nobody`" class="flex flex-col gap-2">
      <h3 :id="`${id}-nobody`" class="title-face text-lg font-semibold">
        {{ __('When nobody can answer') }}
      </h3>
      <FormControl
        v-if="'call_ring_seconds' in doc"
        v-model.number="doc.call_ring_seconds"
        class="w-48"
        type="number"
        :min="5"
        :max="60"
        :label="__('Ring the team for (seconds)')"
      />
      <SettingSwitch
        v-model="doc.call_after_hours"
        :label="__('Answer calls outside office hours with a message')"
        :description="
          __(
            'Outside office hours nobody is rung: the caller hears this message.',
          )
        "
        :disabled="!doc.office_hours_enabled"
        :blocked="
          doc.office_hours_enabled
            ? ''
            : __('Turn office hours on in «Service» first.')
        "
      />
      <FormControl
        v-if="doc.call_after_hours"
        v-model="doc.call_after_hours_message"
        type="textarea"
        :rows="2"
        :label="__('Message for calls outside office hours')"
      />
      <p
        v-if="
          doc.call_after_hours &&
          !String(doc.call_after_hours_message || '').trim()
        "
        role="alert"
        class="text-p-sm text-ink-red-7"
      >
        {{ __('Write what callers hear outside office hours.') }}
      </p>
      <SettingSwitch
        v-model="doc.call_voicemail"
        :label="__('Let callers leave a message when nobody answers')"
        :description="
          __(
            'The message is saved on the call, ready to play and to transcribe.',
          )
        "
      />
      <FormControl
        v-if="doc.call_voicemail"
        v-model="doc.call_voicemail_prompt"
        type="textarea"
        :rows="2"
        :label="__('What callers hear before leaving a message')"
      />
      <p
        v-if="
          doc.call_voicemail && !String(doc.call_voicemail_prompt || '').trim()
        "
        role="alert"
        class="text-p-sm text-ink-red-7"
      >
        {{ __('Write what callers hear before they leave a message.') }}
      </p>
    </section>

    <section :aria-labelledby="`${id}-goals`" class="flex flex-col gap-2">
      <h3 :id="`${id}-goals`" class="title-face text-lg font-semibold">
        {{ __('Call goals') }}
      </h3>
      <!-- crm/calls_sla.py and the calls page's board read them. -->
      <div class="flex flex-wrap gap-3">
        <FormControl
          v-if="'call_callback_minutes' in doc"
          v-model.number="doc.call_callback_minutes"
          class="w-48"
          type="number"
          :min="0"
          :label="__('Return a missed call within (minutes)')"
        />
        <FormControl
          v-if="'call_pickup_goal' in doc"
          v-model.number="doc.call_pickup_goal"
          class="w-48"
          type="number"
          :min="0"
          :max="100"
          :label="__('Calls picked up goal (%)')"
        />
      </div>
    </section>
  </div>
</template>
<script setup>
import { computed, onMounted, ref, useId, watch } from 'vue'
import { Button, FormControl, call, toast } from 'frappe-ui'
import Link from '@/components/Controls/Link.vue'
import { Field, Segmented, chipClass } from '@/components/ui'
import SettingSwitch from './SettingSwitch.vue'
import { nowTitleOf, reachLineOf, skippedAreas, whyLineOf } from './ringNow'

const doc = defineModel('doc', { type: Object, required: true })
const API = 'crm.api.calls.'
const id = useId()
const team = ref(null),
  loading = ref(false),
  busy = ref(''),
  error = ref(''),
  confirming = ref(''),
  askingMobile = ref(''),
  mobile = ref(''),
  newUser = ref('')
const message = (e, fallback) =>
  e?.messages?.length ? String(e.messages[0]).replace(/<[^>]+>/g, '') : fallback

async function load() {
  loading.value = true
  try {
    team.value = await call(API + 'team')
    error.value = ''
  } catch (e) {
    error.value = message(
      e,
      __('The list could not be loaded. Close and open this page again.'),
    )
  } finally {
    loading.value = false
  }
}
onMounted(load)

// The rule: «Ventas en turno» rings whoever sells at work now (crm/call_rule.py);
// a shop that never chose gets it when it keeps shifts.
const ruleOptions = [
  { value: 'shift', label: __('Sales on shift') },
  { value: 'list', label: __('These people') },
]
const fallbackOptions = [
  { value: 'list', label: __('Ring the list') },
  { value: 'message', label: __('Who always rings, then the message') },
]
const rule = computed(
  () => doc.value.call_ring_rule || team.value?.default_rule || 'list',
)
const skipped = computed(() => skippedAreas(doc.value.call_ring_skip_areas))
function toggleArea(key) {
  const next = new Set(skipped.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  doc.value.call_ring_skip_areas = next.size
    ? JSON.stringify([...next].sort())
    : ''
}

// Who a call would ring right now under the page's choices, saved or not.
const now = ref(null)
let nowSeq = 0
let nowTimer = null
async function loadNow() {
  const mine = ++nowSeq
  try {
    const found = await call(API + 'ring_now', {
      rule: rule.value,
      fallback: doc.value.call_ring_fallback || 'list',
      skip_areas: doc.value.call_ring_skip_areas || '',
    })
    if (mine === nowSeq) now.value = found
  } catch {
    if (mine === nowSeq) now.value = null
  }
}
function soon() {
  clearTimeout(nowTimer)
  nowTimer = setTimeout(loadNow, 250)
}
watch(
  () => [
    team.value?.numbers?.length,
    rule.value,
    doc.value.call_ring_fallback,
    doc.value.call_ring_skip_areas,
  ],
  ([numbers]) => numbers && soon(),
)
const nowTitle = computed(() => nowTitleOf(now.value))
const whyLine = whyLineOf
const reachLine = reachLineOf

async function run(user, args, done) {
  busy.value = user
  error.value = ''
  try {
    team.value = await call(API + 'save_team_member', { user, ...args })
    if (done) toast.success(done)
    soon()
    return true
  } catch (e) {
    error.value = message(
      e,
      __('The change was not saved. Check your connection and try again.'),
    )
    return false
  } finally {
    busy.value = ''
  }
}
function choose(person, device) {
  if (device === 'Phone' && !person.has_mobile) {
    askingMobile.value = person.user
    mobile.value = ''
    return
  }
  askingMobile.value = ''
  run(person.user, { rings: 1, device })
}
async function saveMobile(person) {
  const ok = await run(person.user, {
    rings: 1,
    device: 'Phone',
    mobile_no: mobile.value.trim(),
  })
  if (ok) askingMobile.value = ''
}
function setAlways(person) {
  run(person.user, { rings: 1, always: person.always ? 0 : 1 })
}
function remove(person) {
  if (confirming.value !== person.user) {
    confirming.value = person.user
    return
  }
  confirming.value = ''
  run(
    person.user,
    { rings: 0 },
    __("{0} no longer answers the shop's line.", [person.full_name]),
  )
}
async function addPerson() {
  const user = newUser.value
  if (!user) return
  if (team.value?.people.some((p) => p.user === user)) {
    error.value = __('This person is already on the list.')
    return
  }
  const ok = await run(user, { rings: 1 })
  if (ok) newUser.value = ''
}
</script>
