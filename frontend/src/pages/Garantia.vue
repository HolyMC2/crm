<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <nav class="mb-3">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="goBack"
        >
          <FeatherIcon name="arrow-left" class="h-4 w-4" />
          {{ backLabel }}
        </button>
      </nav>

      <section
        v-if="guard"
        role="alert"
        class="mx-auto max-w-xl space-y-4 py-6"
      >
        <h1 class="text-xl font-semibold">{{ guard.title }}</h1>
        <p class="text-base text-ink-gray-7">{{ guard.detail }}</p>
        <div class="flex flex-wrap gap-2">
          <Button :label="__('Retry', null, 'Garantías')" @click="load" />
          <Button :label="__('Back to Garantías')" @click="goBack" />
        </div>
      </section>

      <div v-else-if="!claim" role="status" class="py-10 text-sm">
        {{ __('Loading case…') }}
      </div>

      <template v-else>
        <header class="mb-4 flex flex-wrap items-start gap-3">
          <div class="min-w-0 flex-1">
            <p
              class="flex flex-wrap items-center gap-1 text-sm text-ink-gray-6"
            >
              {{ claim.name }}
              <Badge
                :theme="stateTheme(claim.state)"
                :label="stateLabel(claim.state)"
              />
              <Badge theme="gray" :label="kindLabel(claim.kind)" />
              <Badge
                v-if="claim.sla?.due && !closed"
                :theme="dueTheme(claim.sla.due)"
                :label="dueLabel(claim.sla.due)"
              />
            </p>
            <h1 class="truncate text-2xl font-semibold text-ink-gray-9">
              {{ claim.customer_name }}
            </h1>
            <p class="mt-1 text-sm text-ink-gray-6">
              {{
                [
                  claim.item_name || claim.item_code,
                  claim.serial_no,
                  claim.company,
                  claim.complaint_date,
                ]
                  .filter(Boolean)
                  .join(' · ')
              }}
            </p>
          </div>
        </header>

        <div
          v-if="notice"
          role="status"
          class="mb-4 rounded-lg bg-surface-green-1 p-3 text-sm text-ink-green-8"
        >
          {{ notice }}
        </div>
        <div
          v-if="problem"
          role="alert"
          class="mb-4 space-y-2 rounded-lg bg-surface-red-1 p-3 text-sm text-ink-red-7"
        >
          <p>
            <strong>{{ problem.title }}.</strong> {{ problem.detail }}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              v-if="problem.kind === 'conflict'"
              :label="__('Refresh', null, 'Garantías')"
              @click="load"
            />
            <Button
              v-if="problem.kind === 'permission' && claim.can_write"
              :label="__('Assign to someone who can')"
              @click="assigning = true"
            />
          </div>
        </div>

        <!-- The one next step, then everything else this worker may do. -->
        <div class="mb-6 flex flex-wrap gap-2">
          <Button
            v-if="primary?.kind === 'repair'"
            variant="solid"
            icon-left="tool"
            :label="__('Repair in Taller')"
            class="min-h-11 sm:min-h-8"
            @click="openRepair"
          />
          <Button
            v-else-if="primary?.kind === 'open_repair'"
            variant="solid"
            icon-left="external-link"
            :label="__('Open repair order {0}', [claim.repair.open])"
            class="min-h-11 sm:min-h-8"
            @click="openTaller(claim.repair.open)"
          />
          <Button
            v-for="t in transitionButtons"
            :key="t.action + t.next_state"
            :variant="primary?.action === t.action ? 'solid' : 'subtle'"
            :label="actionLabel(t.action)"
            class="min-h-11 sm:min-h-8"
            @click="startTransition(t)"
          />
          <Button
            v-if="claim.can_write"
            icon-left="user-plus"
            :label="__('Assign', null, 'Garantías')"
            class="min-h-11 sm:min-h-8"
            @click="assigning = true"
          />
          <Button
            icon-left="message-circle"
            :label="__('Notify the customer')"
            class="min-h-11 sm:min-h-8"
            @click="notifying = true"
          />
        </div>
        <p
          v-if="
            claim.can_write &&
            !claim.repair?.available &&
            claim.repair?.reason &&
            !closed
          "
          class="-mt-4 mb-6 text-sm text-ink-gray-6"
        >
          {{ claim.repair.reason }}
          <a
            v-if="claim.repair.intake"
            class="text-ink-blue-link underline"
            :href="tallerIntakeUrl(claim.name)"
            >{{ __('Receive it in Taller') }}</a
          >
        </p>

        <div class="grid gap-4 sm:grid-cols-2">
          <section
            class="rounded-lg border border-outline-gray-2 p-4 sm:col-span-2"
          >
            <h2 class="mb-1 text-sm font-semibold text-ink-gray-8">
              {{ __('What the customer reports') }}
            </h2>
            <p class="whitespace-pre-line text-base text-ink-gray-9">
              {{ claim.complaint }}
            </p>
          </section>

          <section class="rounded-lg border border-outline-gray-2 p-4">
            <h2 class="mb-1 text-sm font-semibold text-ink-gray-8">
              {{ __('Proof of purchase') }}
            </h2>
            <template v-if="claim.against">
              <p class="text-base text-ink-gray-9">
                {{ __(claim.against.doctype) }} {{ claim.against.name }}
              </p>
              <p v-if="claim.against.readable" class="text-sm text-ink-gray-6">
                {{
                  [
                    claim.against.title,
                    claim.against.date,
                    claim.against.status,
                    claim.against.total !== undefined &&
                      money(claim.against.total, claim.against.currency),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                }}
              </p>
              <p v-else class="text-sm text-ink-gray-6">
                {{ __('You cannot open this document.') }}
              </p>
              <a
                v-if="
                  claim.against.doctype === 'Repair Order' &&
                  claim.against.readable
                "
                class="mt-1 inline-block min-h-11 py-2 text-sm text-ink-blue-link underline"
                :href="tallerOrderUrl(claim.against.name, claim.name)"
                >{{ __('Open in Taller') }}</a
              >
            </template>
            <p v-else class="text-sm text-ink-gray-6">
              {{ __('No sale or repair order linked.') }}
            </p>
          </section>

          <section class="rounded-lg border border-outline-gray-2 p-4">
            <h2 class="mb-1 text-sm font-semibold text-ink-gray-8">
              {{ __('Warranty', null, 'Garantías') }}
            </h2>
            <p
              v-if="claim.policy?.expires_on"
              class="text-base text-ink-gray-9"
            >
              {{
                claim.policy.within
                  ? __('Covered until {0}', [claim.policy.expires_on])
                  : __('Expired on {0}', [claim.policy.expires_on])
              }}
            </p>
            <p v-else class="text-sm text-ink-gray-6">
              {{
                __('No warranty date on record. Check the sale or the order.')
              }}
            </p>
          </section>

          <section
            v-if="claim.outcome || claim.resolution_details"
            class="rounded-lg border border-outline-gray-2 p-4"
          >
            <h2 class="mb-1 text-sm font-semibold text-ink-gray-8">
              {{ __('Outcome', null, 'Garantías') }}
            </h2>
            <p v-if="claim.outcome" class="text-base text-ink-gray-9">
              {{ __(claim.outcome.doctype) }} {{ claim.outcome.name }}
              <span v-if="claim.outcome.status" class="text-sm text-ink-gray-6">
                · {{ claim.outcome.status }}</span
              >
            </p>
            <p
              v-if="claim.resolution_details"
              class="whitespace-pre-line text-sm text-ink-gray-8"
            >
              {{ claim.resolution_details }}
            </p>
            <p v-if="claim.resolved_by" class="text-sm text-ink-gray-6">
              {{ __('Resolved by {0}', [claim.resolved_by]) }}
            </p>
          </section>

          <section class="rounded-lg border border-outline-gray-2 p-4">
            <h2 class="mb-1 text-sm font-semibold text-ink-gray-8">
              {{ __('Assigned to', null, 'Garantías') }}
            </h2>
            <p class="text-base text-ink-gray-9">
              {{
                claim.assignees.map((a) => a.full_name).join(', ') ||
                __('Nobody yet')
              }}
            </p>
            <p v-if="claim.last_send" class="mt-2 text-sm text-ink-gray-6">
              {{ __('Last WhatsApp notice: {0}', [claim.last_send.label]) }}
            </p>
          </section>

          <section
            class="rounded-lg border border-outline-gray-2 p-4 sm:col-span-2"
          >
            <h2 class="mb-2 text-sm font-semibold text-ink-gray-8">
              {{ __('History', null, 'Garantías') }}
            </h2>
            <form
              v-if="claim.can_write"
              class="mb-3 flex gap-2"
              @submit.prevent="addNote"
            >
              <FormControl
                v-model="note"
                class="flex-1"
                :placeholder="__('Add a note for the team')"
                :aria-label="__('Add a note for the team')"
              />
              <Button
                :label="__('Save note')"
                :loading="savingNote"
                :disabled="!note.trim()"
                @click="addNote"
              />
            </form>
            <ul class="space-y-2">
              <li
                v-for="(entry, index) in claim.timeline"
                :key="index"
                class="text-sm"
              >
                <span class="text-ink-gray-9">{{ entry.text }}</span>
                <span class="block text-xs text-ink-gray-5"
                  >{{ entry.by }} · {{ entry.at }}</span
                >
              </li>
              <li v-if="!claim.timeline.length" class="text-sm text-ink-gray-6">
                {{ __('No history yet.') }}
              </li>
            </ul>
          </section>
        </div>
      </template>
    </div>

    <Dialog v-model="repairing" :options="{ title: __('Repair in Taller') }">
      <template #body-content>
        <div class="space-y-4">
          <FormControl
            v-model="repairForm.kind"
            type="select"
            :label="__('Charge', null, 'Garantías')"
            :options="[
              ...(claim?.repair?.warranty_eligible
                ? [
                    {
                      label: __('Under warranty (no charge)'),
                      value: 'Warranty',
                    },
                  ]
                : []),
              { label: __('With charge'), value: 'Paid' },
            ]"
          />
          <p
            v-if="!claim?.repair?.warranty_eligible"
            class="text-sm text-ink-gray-6"
          >
            {{
              __(
                'The repair warranty expired, so this visit is charged. The original history stays.',
              )
            }}
          </p>
          <FormControl
            v-model="repairForm.reason"
            type="textarea"
            :label="__('What to repair')"
          />
          <p v-if="repairProblem" role="alert" class="text-sm text-ink-red-7">
            <strong>{{ repairProblem.title }}.</strong>
            {{ repairProblem.detail }}
          </p>
        </div>
      </template>
      <template #actions>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            :label="__('Close', null, 'Garantías')"
            @click="repairing = false"
          />
          <Button
            variant="solid"
            :label="__('Receive in Taller')"
            :loading="busy"
            @click="repair"
          />
        </div>
      </template>
    </Dialog>

    <Dialog
      v-model="transitioning"
      :options="{ title: pending ? actionLabel(pending.action) : '' }"
    >
      <template #body-content>
        <div class="space-y-4">
          <p class="text-sm text-ink-gray-7">{{ transitionHint }}</p>
          <FormControl
            v-model="details"
            type="textarea"
            :label="
              needsDetails
                ? __('Why (the customer sees this on the case sheet)')
                : __('Note (optional)')
            "
          />
          <p
            v-if="transitionProblem"
            role="alert"
            class="text-sm text-ink-red-7"
          >
            <strong>{{ transitionProblem.title }}.</strong>
            {{ transitionProblem.detail }}
          </p>
        </div>
      </template>
      <template #actions>
        <div class="flex flex-wrap justify-end gap-2">
          <Button
            :label="__('Close', null, 'Garantías')"
            @click="transitioning = false"
          />
          <Button
            variant="solid"
            :label="pending ? actionLabel(pending.action) : ''"
            :loading="busy"
            :disabled="needsDetails && !details.trim()"
            @click="applyTransition"
          />
        </div>
      </template>
    </Dialog>

    <AssignDialog
      v-if="claim"
      v-model="assigning"
      :claim="claim.name"
      :assignees="claim.assignees"
      @changed="(view) => (claim = view)"
    />
    <NoticeDialog
      v-if="claim"
      v-model="notifying"
      :claim="claim.name"
      @sent="load"
    />
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Badge,
  Button,
  Dialog,
  FeatherIcon,
  FormControl,
  call,
  toast,
} from 'frappe-ui'
import AssignDialog from '@/components/garantias/AssignDialog.vue'
import NoticeDialog from '@/components/garantias/NoticeDialog.vue'
import { money } from '@/composables/useCompras'
import {
  actionLabel,
  dueLabel,
  dueTheme,
  garantiasApi,
  garantiasBoot,
  kindLabel,
  loadGarantiasBoot,
  outcomeUnknown,
  primaryAction,
  problemOf,
  requestId,
  safeReturn,
  stateLabel,
  stateTheme,
  tallerIntakeUrl,
  tallerOrderUrl,
} from '@/composables/useGarantias'

const props = defineProps({ name: { type: String, required: true } })
const route = useRoute()
const router = useRouter()
const claim = ref(null)
const guard = ref(null)
const problem = ref(null)
const notice = ref('')
const busy = ref(false)
const assigning = ref(false)
const notifying = ref(false)
const repairing = ref(false)
const repairProblem = ref(null)
const repairForm = reactive({ kind: 'Paid', reason: '' })
const transitioning = ref(false)
const transitionProblem = ref(null)
const pending = ref(null)
const details = ref('')
const note = ref('')
const savingNote = ref(false)
let repairKey = requestId()

const returnTo = computed(() => safeReturn(route.query.return_to))
const backLabel = computed(() =>
  returnTo.value
    ? __('Back to {0}', [
        typeof route.query.return_label === 'string'
          ? route.query.return_label.slice(0, 40)
          : __('previous screen'),
      ])
    : __('Back to Garantías'),
)
const closed = computed(() =>
  ['Resuelta', 'Cancelada'].includes(claim.value?.state),
)
const primary = computed(() => primaryAction(claim.value))
const transitionButtons = computed(() => {
  // One button per action; the server picks the row for the worker's role.
  const seen = new Set()
  return (claim.value?.transitions || []).filter((t) =>
    seen.has(t.action) ? false : seen.add(t.action),
  )
})
const needsDetails = computed(
  () =>
    pending.value?.action === 'Sin procede' ||
    (pending.value?.next_state === 'Resuelta' && !claim.value?.outcome),
)
const transitionHint = computed(() => {
  switch (pending.value?.action) {
    case 'Resolver':
      return claim.value?.outcome
        ? __('The case closes with {0} as its outcome.', [
            claim.value.outcome.name,
          ])
        : __(
            'Nothing is linked as the outcome yet. Write what was done, or repair it in Taller first.',
          )
    case 'Sin procede':
      return __('The case closes without a repair or refund. Say why.')
    case 'Cancelar':
      return __('Use this when the case was opened by mistake.')
    case 'Reabrir':
      return __('The case goes back to review.')
    default:
      return __('The case moves to review.')
  }
})

async function load() {
  problem.value = null
  try {
    claim.value = await garantiasApi('get_claim', { name: props.name })
    guard.value = null
  } catch (error) {
    const found = problemOf(error)
    if (!claim.value)
      guard.value = {
        title:
          found.kind === 'permission'
            ? __('You cannot open this case')
            : __('Could not open the case'),
        detail: found.detail,
      }
    else problem.value = found
  }
}

function goBack() {
  if (returnTo.value) return window.location.assign(returnTo.value)
  const list = typeof route.query.list === 'string' ? route.query.list : ''
  if (list.startsWith('/garantias')) return router.push(list)
  router.push({ name: 'Garantias' })
}
function openTaller(order) {
  window.location.assign(tallerOrderUrl(order, claim.value.name))
}

function openRepair() {
  repairForm.kind = claim.value.repair?.warranty_eligible ? 'Warranty' : 'Paid'
  repairForm.reason = claim.value.complaint.slice(0, 500)
  repairProblem.value = null
  repairKey = requestId()
  repairing.value = true
}
async function repair() {
  busy.value = true
  repairProblem.value = null
  try {
    const out = await garantiasApi('repair', {
      name: claim.value.name,
      kind: repairForm.kind,
      reason: repairForm.reason.trim(),
      client_uuid: repairKey,
    })
    claim.value = out.claim
    repairing.value = false
    toast.success(__('Received in Taller as {0}', [out.repair_order]))
    openTaller(out.repair_order)
  } catch (error) {
    repairProblem.value = problemOf(error)
    if (!outcomeUnknown(error)) repairKey = requestId()
  } finally {
    busy.value = false
  }
}

function startTransition(transition) {
  pending.value = transition
  details.value = ''
  transitionProblem.value = null
  transitioning.value = true
}
async function applyTransition() {
  busy.value = true
  transitionProblem.value = null
  try {
    const view = await garantiasApi('transition', {
      name: claim.value.name,
      action: pending.value.action,
      resolution_details: details.value.trim() || null,
      modified: claim.value.modified,
    })
    claim.value = view
    transitioning.value = false
    if (['Resuelta', 'Cancelada'].includes(view.state)) {
      toast.success(
        view.state === 'Resuelta'
          ? __('Case {0} resolved', [view.name])
          : __('Case {0} cancelled', [view.name]),
      )
      goBack()
    }
  } catch (error) {
    transitionProblem.value = problemOf(error)
  } finally {
    busy.value = false
  }
}

async function addNote() {
  const text = note.value.trim()
  if (!text) return
  savingNote.value = true
  try {
    await call('frappe.desk.form.utils.add_comment', {
      reference_doctype: 'Warranty Claim',
      reference_name: claim.value.name,
      content: text,
      comment_email: garantiasBoot.value?.user || '',
      comment_by: '',
    })
    note.value = ''
    await load()
  } catch (error) {
    problem.value = problemOf(error)
  } finally {
    savingNote.value = false
  }
}

watch(
  () => props.name,
  () => {
    claim.value = null
    load()
  },
)
onMounted(async () => {
  await loadGarantiasBoot()
  if (!garantiasBoot.value?.enabled) {
    guard.value = {
      title: __('Garantías is not available'),
      detail:
        garantiasBoot.value?.reason ||
        __('Ask your manager for access to warranty and return cases.'),
    }
    return
  }
  await load()
})
</script>
