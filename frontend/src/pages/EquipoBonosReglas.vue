<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
    <div class="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      <nav v-if="!isPhone" class="mb-3">
        <button
          class="flex min-h-11 items-center gap-1 text-sm text-ink-gray-7 hover:text-ink-gray-9"
          @click="router.push(backTo)"
        >
          <LucideArrowLeft class="h-4 w-4" />
          {{ __('Back to bonuses') }}
        </button>
      </nav>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <h1
          class="title-face break-words text-2xl font-semibold text-ink-gray-9 [text-wrap:balance]"
        >
          {{ __('Bonus rules') }}
        </h1>
        <Button
          v-if="data?.can_edit && !editing"
          variant="solid"
          :icon-left="LucidePlus"
          :label="__('New bonus')"
          class="min-h-11 sm:min-h-8"
          data-testid="bono-new"
          @click="startNew"
        />
      </div>
      <p class="mb-4 text-sm text-ink-gray-6">
        {{
          __(
            'Each shop pays its own way: per repair or sale, a percentage, or a fixed amount at a goal; for each person’s work or the whole team’s, to whoever did it, to named people or to everybody.',
          )
        }}
      </p>

      <section v-if="failure" role="alert" class="space-y-3 py-4">
        <p class="text-base text-ink-gray-8">
          {{ failure.detail || failure.message }}
        </p>
        <Button :label="__('Retry', null, 'Equipo')" @click="load" />
      </section>
      <div v-else-if="!data" role="status" class="py-10 text-sm">
        {{ __('Loading…', null, 'Equipo') }}
      </div>

      <template v-else>
        <p
          v-if="!data.can_edit"
          role="status"
          class="mb-4 rounded-6 bg-surface-gray-2 p-3 text-sm text-ink-gray-7"
        >
          {{
            __('Only the owner changes the bonuses. Ask them for a new one.')
          }}
        </p>
        <p
          v-if="!data.sources.length"
          role="status"
          class="mb-4 rounded-6 bg-surface-amber-1 p-3 text-sm text-ink-amber-8"
        >
          {{ __('This system has nothing a bonus can measure yet.') }}
        </p>

        <form
          v-if="editing"
          class="mb-5 grid gap-4 rounded-6 border border-outline-gray-2 p-3 text-sm"
          data-testid="bono-form"
          @submit.prevent="save"
        >
          <label class="grid min-w-0 gap-1 text-ink-gray-8"
            >{{ __('Name') }}
            <input
              v-model="editing.bono_name"
              :disabled="!!editing.name"
              required
              :placeholder="__('Weekly repairs bonus')"
              class="h-11 w-full min-w-0 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-base text-ink-gray-9 sm:h-9 sm:text-sm"
              data-testid="bono-name"
            />
          </label>

          <fieldset class="grid gap-2">
            <legend class="mb-1 font-medium text-ink-gray-9">
              {{ __('What it counts') }}
            </legend>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="grid min-w-0 gap-1 text-ink-gray-8"
                >{{ __('Measures') }}
                <select
                  v-model="editing.source"
                  :class="field"
                  data-testid="bono-source"
                  @change="resetOptions"
                >
                  <option v-for="s in data.sources" :key="s.key" :value="s.key">
                    {{ s.label }}
                  </option>
                </select>
              </label>
              <label class="grid min-w-0 gap-1 text-ink-gray-8"
                >{{ __('Period') }}
                <select v-model="editing.period" :class="field">
                  <option v-for="p in PERIODS" :key="p.value" :value="p.value">
                    {{ periodLabel(p.value) }}
                  </option>
                </select>
              </label>
              <template
                v-for="option in source?.options || []"
                :key="option.key"
              >
                <label
                  v-if="option.type === 'select'"
                  class="grid min-w-0 gap-1 text-ink-gray-8"
                  >{{ option.label }}
                  <select
                    v-model="editing.options[option.key]"
                    :class="field"
                    :data-option="option.key"
                  >
                    <option
                      v-for="c in option.choices"
                      :key="c.value"
                      :value="c.value"
                    >
                      {{ c.label }}
                    </option>
                  </select>
                </label>
                <label
                  v-else
                  class="flex min-h-11 items-center gap-2 text-ink-gray-8"
                >
                  <input
                    v-model="editing.options[option.key]"
                    type="checkbox"
                    :true-value="1"
                    :false-value="0"
                    :data-option="option.key"
                  />
                  {{ option.label }}
                </label>
              </template>
              <label class="grid min-w-0 gap-1 text-ink-gray-8"
                >{{ __('Minimum amount of each one') }}
                <input
                  v-model.number="editing.min_amount"
                  type="number"
                  min="0"
                  step="1"
                  :class="[field, 'text-right tabular-nums']"
                />
              </label>
              <label
                v-if="data.companies.length > 1"
                class="grid min-w-0 gap-1 text-ink-gray-8"
                >{{ __('Company') }}
                <select v-model="editing.company" :class="field">
                  <option value="">{{ __('All companies') }}</option>
                  <option v-for="c in data.companies" :key="c" :value="c">
                    {{ c }}
                  </option>
                </select>
              </label>
            </div>
            <p v-if="source?.credit" class="text-xs text-ink-gray-6">
              {{ source.credit }}
            </p>
          </fieldset>

          <fieldset class="grid gap-1">
            <legend class="mb-1 font-medium text-ink-gray-9">
              {{ __('Whose work') }}
            </legend>
            <label class="flex min-h-11 items-center gap-2 text-ink-gray-8">
              <input
                v-model="editing.scope"
                type="radio"
                :value="OWN"
                data-testid="bono-own"
              />
              {{ __('Each person their own: each one with their own goal') }}
            </label>
            <label class="flex min-h-11 items-center gap-2 text-ink-gray-8">
              <input
                v-model="editing.scope"
                type="radio"
                :value="TEAM"
                data-testid="bono-team"
              />
              {{ __('The whole team: one goal with everybody’s work') }}
            </label>
          </fieldset>

          <fieldset class="grid gap-2">
            <legend class="mb-1 font-medium text-ink-gray-9">
              {{ __('Goal and pay') }}
            </legend>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="grid min-w-0 gap-1 text-ink-gray-8"
                >{{ __('The goal counts') }}
                <select
                  v-model="editing.goal_in"
                  :class="field"
                  data-testid="bono-goal-in"
                >
                  <option :value="COUNT">
                    {{ __('How many ({0})', [source?.many || '']) }}
                  </option>
                  <option :value="AMOUNT">
                    {{ __('How much they add up to ($)') }}
                  </option>
                </select>
              </label>
              <label class="grid min-w-0 gap-1 text-ink-gray-8"
                >{{ __('Goal') }}
                <input
                  v-model.number="editing.goal"
                  type="number"
                  min="0"
                  step="1"
                  :class="[field, 'text-right tabular-nums']"
                  data-testid="bono-goal"
                />
              </label>
              <label class="grid min-w-0 gap-1 text-ink-gray-8"
                >{{ __('How it pays') }}
                <select
                  v-model="editing.pays"
                  :class="field"
                  data-testid="bono-pays"
                >
                  <option :value="PER_PIECE">
                    {{ __('An amount per {0}', [source?.one || '']) }}
                  </option>
                  <option :value="PERCENT">
                    {{ __('A percentage of the amount') }}
                  </option>
                  <option :value="FIXED">
                    {{ __('A fixed amount at the goal') }}
                  </option>
                </select>
              </label>
              <label
                v-if="editing.pays === PERCENT"
                class="grid min-w-0 gap-1 text-ink-gray-8"
                >{{ __('Percentage') }}
                <input
                  v-model.number="editing.percent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  required
                  :class="[field, 'text-right tabular-nums']"
                  data-testid="bono-percent"
                />
              </label>
              <label v-else class="grid min-w-0 gap-1 text-ink-gray-8"
                >{{
                  editing.pays === FIXED
                    ? __('Amount at the goal')
                    : __('Amount per {0}', [source?.one || ''])
                }}
                <input
                  v-model.number="editing.amount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  :class="[field, 'text-right tabular-nums']"
                  data-testid="bono-amount"
                />
              </label>
            </div>
            <p class="text-xs text-ink-gray-6">
              {{ __('Goal 0: no goal, it pays from the first one.') }}
            </p>
            <div
              v-if="editing.pays !== FIXED && Number(editing.goal) > 0"
              class="grid gap-1"
            >
              <label class="flex min-h-11 items-center gap-2 text-ink-gray-8">
                <input v-model="editing.pays_from" type="radio" :value="ALL" />
                {{ __('All of them, once the goal is reached') }}
              </label>
              <label class="flex min-h-11 items-center gap-2 text-ink-gray-8">
                <input
                  v-model="editing.pays_from"
                  type="radio"
                  :value="ABOVE"
                />
                {{ __('Only the ones past the goal') }}
              </label>
            </div>
            <label class="flex min-h-11 items-center gap-2 text-ink-gray-8">
              <input
                v-model="editing.stacks"
                type="checkbox"
                :true-value="1"
                :false-value="0"
                data-testid="bono-stacks"
              />
              {{ __('Adds up with the other bonuses') }}
            </label>
            <p class="text-xs text-ink-gray-6">
              {{
                __(
                  'Off: of the bonuses that do not add up, each person gets the one that pays more. Use it for tiers (20 repairs at $20, 30 at $25).',
                )
              }}
            </p>
          </fieldset>

          <fieldset class="grid gap-1">
            <legend class="mb-1 font-medium text-ink-gray-9">
              {{ __('Who it pays') }}
              <span class="block text-xs font-normal text-ink-gray-6">{{
                editing.scope === TEAM
                  ? __(
                      'Nobody marked: everybody active in Equipo, sales included.',
                    )
                  : __('Nobody marked: whoever did the work.')
              }}</span>
            </legend>
            <label
              v-for="p in companyPeople"
              :key="p.employee"
              class="flex min-h-11 items-center gap-2 text-ink-gray-8"
            >
              <input
                type="checkbox"
                :checked="editing.people.includes(p.employee)"
                :data-employee="p.employee"
                @change="togglePerson(p.employee, $event.target.checked)"
              />
              <span class="min-w-0"
                >{{ p.name
                }}<span v-if="p.designation" class="text-ink-gray-6"
                  >, {{ p.designation }}</span
                ></span
              >
            </label>
            <p v-if="!companyPeople.length" class="text-xs text-ink-gray-6">
              {{ __('Nobody is active in Equipo yet.') }}
            </p>
          </fieldset>

          <label class="flex min-h-11 items-center gap-2 text-ink-gray-8">
            <input
              v-model="editing.enabled"
              type="checkbox"
              :true-value="1"
              :false-value="0"
            />
            {{ __('Active') }}
          </label>
          <p
            class="rounded-4 bg-surface-gray-2 px-2 py-1.5 text-ink-gray-8"
            data-testid="bono-example"
          >
            {{ example(editing, source) }}
          </p>
          <p v-if="problem" role="alert" class="text-ink-red-7">
            {{ problem }}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="solid"
              class="min-h-11 sm:min-h-8"
              :loading="saving"
              :label="__('Save bonus')"
            />
            <Button
              class="min-h-11 sm:min-h-8"
              :label="__('Cancel', null, 'Equipo')"
              @click="cancel"
            />
          </div>
        </form>

        <ul
          v-if="data.rules.length"
          class="divide-y divide-outline-gray-1 rounded-6 border border-outline-gray-2"
          data-list="bonos"
        >
          <li
            v-for="rule in data.rules"
            :key="rule.name"
            class="flex items-center gap-2 px-3 py-2 text-sm"
            :data-bono="rule.name"
          >
            <button
              type="button"
              class="press min-w-0 flex-1 py-1 text-left"
              :disabled="!data.can_edit"
              @click="edit(rule)"
            >
              <span class="block font-medium text-ink-gray-9"
                >{{ rule.bono_name }}
                <span
                  v-if="!rule.enabled"
                  class="ml-1 rounded-4 bg-surface-gray-2 px-1.5 text-xs font-normal text-ink-gray-6"
                  >{{ __('Off') }}</span
                ></span
              >
              <span class="block text-xs text-ink-gray-6"
                >{{ sourceOf(rule)?.label || rule.source }},
                {{ periodLabel(rule.period).toLowerCase() }}</span
              >
              <span class="block text-xs text-ink-gray-6">{{
                ruleSummary(rule, sourceOf(rule))
              }}</span>
              <span class="block text-xs text-ink-gray-6">{{
                payeesLabel(rule, data.people)
              }}</span>
            </button>
            <button
              v-if="data.can_edit"
              type="button"
              class="press min-h-11 min-w-11 shrink-0 rounded-4 px-2"
              :class="
                confirmDelete === rule.name
                  ? 'bg-surface-red-5 text-white'
                  : 'text-ink-gray-6'
              "
              :aria-label="
                confirmDelete === rule.name
                  ? __('Delete')
                  : __('Delete {0}', [rule.bono_name])
              "
              :title="
                confirmDelete === rule.name
                  ? __('Delete')
                  : __('Delete {0}', [rule.bono_name])
              "
              @click="remove(rule)"
            >
              <span v-if="confirmDelete === rule.name">{{ __('Delete') }}</span>
              <LucideTrash2 v-else class="h-4 w-4" />
            </button>
          </li>
        </ul>
        <p
          v-else-if="!editing"
          class="py-6 text-sm text-ink-gray-6"
          data-testid="bonos-none"
        >
          {{
            __(
              'No bonuses yet. «New bonus» starts with 20 per week at $20 each and orders from $250.',
            )
          }}
        </p>
      </template>
    </div>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from 'frappe-ui'
import { isMobile as isPhone } from '@/composables/breakpoint'
import { equipoApi, problemOf } from '@/composables/useEquipo'
import {
  ABOVE,
  ALL,
  AMOUNT,
  BONOS,
  COUNT,
  FIXED,
  OWN,
  PERCENT,
  PERIODS,
  PER_PIECE,
  TEAM,
  blankRule,
  example,
  payeesLabel,
  periodLabel,
  ruleSummary,
} from '@/composables/useBonos'
import LucideArrowLeft from '~icons/lucide/arrow-left'
import LucidePlus from '~icons/lucide/plus'
import LucideTrash2 from '~icons/lucide/trash-2'

const field =
  'h-11 w-full min-w-0 rounded-4 border border-outline-gray-2 bg-surface-base px-2 text-base text-ink-gray-9 sm:h-9 sm:text-sm'
const route = useRoute()
const router = useRouter()
const data = ref(null)
const failure = ref(null)
const editing = ref(null)
const saving = ref(false)
const problem = ref('')
const confirmDelete = ref('')

// Back to the period the reader came from (EquipoBonos passes it in `list`).
const backTo = computed(() =>
  typeof route.query.list === 'string' &&
  route.query.list.startsWith('/equipo/bonos')
    ? route.query.list
    : { name: 'EquipoBonos' },
)
const sourceOf = (rule) =>
  data.value?.sources.find((s) => s.key === rule?.source)
const source = computed(() => sourceOf(editing.value))
const companyPeople = computed(() =>
  (data.value?.people || []).filter(
    (p) => !editing.value?.company || p.company === editing.value.company,
  ),
)

async function load() {
  failure.value = null
  try {
    data.value = await equipoApi(`${BONOS}.list_rules`)
    if (route.query.nuevo && data.value.can_edit && !editing.value) startNew()
  } catch (error) {
    failure.value = problemOf(error)
  }
}
load()

function startNew() {
  problem.value = ''
  editing.value = {
    ...blankRule(data.value.sources),
    bono_name: __('Weekly repairs bonus'),
  }
}
function edit(rule) {
  problem.value = ''
  editing.value = {
    ...blankRule(data.value.sources),
    ...rule,
    company: rule.company || '',
    options: { ...defaults(sourceOf(rule)), ...(rule.options || {}) },
    people: [...(rule.people || [])],
  }
}
function defaults(about) {
  return Object.fromEntries(
    (about?.options || []).map((o) => [o.key, o.default ?? '']),
  )
}
function resetOptions() {
  editing.value.options = defaults(source.value)
}
function cancel() {
  editing.value = null
  problem.value = ''
}
function togglePerson(employee, on) {
  const people = new Set(editing.value.people)
  if (on) people.add(employee)
  else people.delete(employee)
  editing.value.people = [...people]
}

async function save() {
  const rule = editing.value
  if (!rule || saving.value) return
  saving.value = true
  problem.value = ''
  try {
    await equipoApi(`${BONOS}.save_rule`, {
      rule: { ...rule, company: rule.company || null },
    })
    editing.value = null
    await load()
  } catch (error) {
    const found = problemOf(error)
    problem.value = found.detail || found.message
  } finally {
    saving.value = false
  }
}
async function remove(rule) {
  if (confirmDelete.value !== rule.name) {
    confirmDelete.value = rule.name
    return
  }
  try {
    await equipoApi(`${BONOS}.delete_rule`, { name: rule.name })
    confirmDelete.value = ''
    if (editing.value?.name === rule.name) editing.value = null
    await load()
  } catch (error) {
    failure.value = problemOf(error)
  }
}
</script>
