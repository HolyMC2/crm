<template>
  <fieldset class="space-y-3">
    <legend class="mb-1 text-sm font-medium text-ink-gray-8">
      {{ __('Which emails come in') }}
    </legend>
    <p class="text-sm text-ink-gray-6">
      {{
        __(
          'An email comes in when it matches one rule that is on. Leave the sender empty to accept any sender with that subject.',
        )
      }}
    </p>
    <ol class="space-y-3">
      <li
        v-for="(rule, index) in modelValue"
        :key="index"
        class="space-y-3 rounded-lg border border-outline-gray-2 p-3"
      >
        <div class="flex items-center gap-2">
          <label class="flex min-h-11 flex-1 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              class="h-5 w-5 rounded"
              :checked="Boolean(Number(rule.enabled))"
              @change="set(index, 'enabled', $event.target.checked ? 1 : 0)"
            />
            <span class="text-base font-medium text-ink-gray-8">{{
              __('Rule {0}', [index + 1])
            }}</span>
          </label>
          <Button
            variant="ghost"
            class="min-h-11 sm:min-h-0"
            icon-left="trash-2"
            :label="__('Remove')"
            :aria-label="__('Remove rule {0}', [index + 1])"
            @click="remove(index)"
          />
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <FormControl
            :model-value="rule.sender"
            class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
            type="text"
            :label="__('Sender')"
            :placeholder="__('facturas@proveedor.mx or @proveedor.mx')"
            :error="senderProblem(rule.sender) || undefined"
            autocomplete="off"
            maxlength="140"
            @update:model-value="set(index, 'sender', $event)"
          />
          <FormControl
            :model-value="rule.subject"
            class="[&_input]:min-h-11 sm:[&_input]:min-h-0"
            type="text"
            :label="__('Subject contains')"
            :placeholder="__('Invoice')"
            maxlength="140"
            @update:model-value="set(index, 'subject', $event)"
          />
        </div>
        <div>
          <p class="mb-1 text-sm text-ink-gray-7">
            {{ __('Attachments to keep') }}
          </p>
          <div class="flex flex-wrap gap-x-4">
            <label
              v-for="type in ATTACHMENT_TYPES"
              :key="type"
              class="flex min-h-11 cursor-pointer items-center gap-2 text-base text-ink-gray-8"
            >
              <input
                type="checkbox"
                class="h-5 w-5 rounded"
                :checked="ruleTypes(rule).includes(type)"
                @change="toggleType(index, type)"
              />
              {{ type.toUpperCase() }}
            </label>
          </div>
        </div>
        <FormControl
          :model-value="rule.visibility || 'Company'"
          class="h-11 sm:h-auto"
          type="select"
          :label="__('Who can see what comes in')"
          :options="visibilityOptions"
          @update:model-value="set(index, 'visibility', $event)"
        />
        <p class="text-sm text-ink-gray-6">{{ ruleText(rule) }}</p>
      </li>
    </ol>
    <Button
      v-if="modelValue.length < 20"
      class="min-h-11 sm:min-h-0"
      icon-left="plus"
      :label="__('Add rule')"
      @click="add"
    />
  </fieldset>
</template>
<script setup>
import { computed } from 'vue'
import { Button, FormControl } from 'frappe-ui'
import {
  ATTACHMENT_TYPES,
  newRule,
  ruleText,
  ruleTypes,
  senderProblem,
} from '@/utils/archivosConectores'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const visibilityOptions = computed(() => [
  { value: 'Company', label: __('Everyone in the company') },
  { value: 'Private', label: __('Only me') },
])

function replace(next) {
  emit('update:modelValue', next)
}
function set(index, key, value) {
  replace(
    props.modelValue.map((rule, i) =>
      i === index ? { ...rule, [key]: value } : rule,
    ),
  )
}
function toggleType(index, type) {
  const current = ruleTypes(props.modelValue[index])
  const next = current.includes(type)
    ? current.filter((t) => t !== type)
    : [...current, type]
  set(index, 'attachment_types', next.join(','))
}
function add() {
  replace([...props.modelValue, newRule()])
}
function remove(index) {
  replace(props.modelValue.filter((_, i) => i !== index))
}
</script>
