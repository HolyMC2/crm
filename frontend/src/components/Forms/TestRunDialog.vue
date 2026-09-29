<template>
  <Dialog
    v-model="show"
    :options="{ title: __('Test submission'), size: 'lg' }"
  >
    <template #body-content>
      <div v-if="report && !report.ok" class="flex flex-col gap-3">
        <div
          class="flex items-start gap-2 rounded-md bg-surface-red-2 p-3 text-p-base text-ink-red-7"
        >
          <LucideCircleAlert class="mt-0.5 size-4 shrink-0" />
          <span>{{ report.error }}</span>
        </div>
        <p class="text-p-sm text-ink-gray-6">
          {{
            __(
              'A visitor would see this error too. Fix the form or the values, then send the test again.',
            )
          }}
        </p>
      </div>
      <ol v-else-if="report" class="flex flex-col">
        <li
          v-for="(step, i) in steps"
          :key="step.key"
          class="relative flex gap-3 pb-4 last:pb-0"
        >
          <div class="flex flex-col items-center">
            <div
              class="flex size-7 shrink-0 items-center justify-center rounded-full"
              :class="
                step.done
                  ? 'bg-surface-green-2 text-ink-green-6'
                  : 'bg-surface-gray-2 text-ink-gray-5'
              "
            >
              <component :is="step.icon" class="size-3.5" />
            </div>
            <div
              v-if="i < steps.length - 1"
              class="mt-1 w-px flex-1 bg-outline-gray-2"
            />
          </div>
          <div class="min-w-0 pt-1">
            <div class="text-base font-medium text-ink-gray-9">
              {{ step.title }}
            </div>
            <div
              v-for="(line, li) in step.lines"
              :key="li"
              class="mt-0.5 text-p-sm text-ink-gray-6"
            >
              {{ line }}
            </div>
          </div>
        </li>
      </ol>
    </template>
    <template #actions>
      <div class="flex flex-col gap-3">
        <p
          v-if="report?.ok"
          class="flex items-center gap-1.5 text-p-sm text-ink-gray-6"
        >
          <LucideUndo2 class="size-3.5" />
          {{
            __(
              'Everything above was undone. Nothing was saved and no message was sent.',
            )
          }}
        </p>
        <Button
          class="w-full"
          variant="solid"
          :label="__('Done')"
          @click="show = false"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { Button, Dialog } from 'frappe-ui'
import { usersStore } from '@/stores/users'
import LucideCircleAlert from '~icons/lucide/circle-alert'
import LucideUndo2 from '~icons/lucide/undo-2'
import LucideFilePlus from '~icons/lucide/file-plus-2'
import LucideUserCheck from '~icons/lucide/user-check'
import LucideBell from '~icons/lucide/bell'
import LucideMegaphone from '~icons/lucide/megaphone'
import LucideTag from '~icons/lucide/tag'
import { computed } from 'vue'

const show = defineModel({ type: Boolean, default: false })
const props = defineProps({ report: { type: Object, default: null } })

const { getUser } = usersStore()
const who = (email) => getUser(email)?.full_name || email

const steps = computed(() => {
  const r = props.report
  if (!r?.ok) return []
  const rec = r.record
  const isLead = r.document_type === 'CRM Lead'
  const out = [
    {
      key: 'record',
      icon: LucideFilePlus,
      done: true,
      title: isLead
        ? __('A lead is created: {0}', [rec.title])
        : __('A deal is created: {0}', [rec.title]),
      lines: [
        [
          rec.status && __('Status: {0}', [__(rec.status)]),
          rec.source && __('Source: {0}', [__(rec.source)]),
        ]
          .filter(Boolean)
          .join(' · '),
        r.comment
          ? __('Its timeline shows the form and the visitor’s message.')
          : '',
      ].filter(Boolean),
    },
  ]
  const users = r.assignment.users || []
  out.push({
    key: 'assign',
    icon: LucideUserCheck,
    done: users.length > 0,
    title: users.length
      ? __('Assigned to {0}', [users.map(who).join(', ')])
      : __('Nobody is assigned yet'),
    lines: [
      r.assignment.how === 'form'
        ? __('Chosen in this form’s settings.')
        : r.assignment.how === 'rules'
          ? __('Chosen by your assignment rules.')
          : __(
              'It waits in the unassigned list. Pick an owner under “After someone submits”.',
            ),
    ],
  })
  const notified = (r.notifications || []).map((n) => who(n.to_user))
  out.push({
    key: 'notify',
    icon: LucideBell,
    done: notified.length > 0,
    title: notified.length
      ? __('Notified: {0}', [notified.join(', ')])
      : __('No one is notified'),
    lines: notified.length
      ? [__('They get an in-app notification that opens the record.')]
      : [
          __(
            'People are not told about their own actions. In a real submission the assignee is notified.',
          ),
        ],
  })
  if (r.marketing && isLead) {
    const enrolled = r.enrollments || []
    out.push({
      key: 'campaign',
      icon: LucideMegaphone,
      done: enrolled.length > 0,
      title: enrolled.length
        ? __('Follow-up started: {0}', [
            enrolled.map((e) => e.title || e.campaign).join(', '),
          ])
        : __('No follow-up campaign'),
      lines: enrolled.map((e) =>
        e.status === 'Suppressed'
          ? __('{0}: this contact opted out, so nothing will be sent.', [
              e.title || e.campaign,
            ])
          : e.from_form
            ? __('{0}: from this form. Messages follow the campaign’s steps.', [
                e.title || e.campaign,
              ])
            : __('{0}: starts for every new lead.', [e.title || e.campaign]),
      ),
    })
  }
  const utm = rec.utm || {}
  const tagLines = Object.entries(utm).map(
    ([k, v]) => `${k.replace('utm_', '')}: ${v}`,
  )
  out.push({
    key: 'attribution',
    icon: LucideTag,
    done: tagLines.length > 0 || r.touchpoints > 0,
    title: __('Where it came from is recorded'),
    lines: [
      tagLines.length
        ? __('Link tags: {0}', [tagLines.join(', ')])
        : __('The test uses the tags source “test”.'),
      r.consent ? __('WhatsApp consent is logged with the text shown.') : '',
    ].filter(Boolean),
  })
  return out
})
</script>
