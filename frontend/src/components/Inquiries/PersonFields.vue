<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <label class="space-y-1 text-sm text-ink-gray-7">
      <span>{{ __('Nombre o alias') }}</span>
      <input
        :value="modelValue.display_name"
        data-field="display_name"
        required
        maxlength="140"
        class="inquiry-input"
        @input="update('display_name', $event.target.value)"
      />
    </label>
    <label class="space-y-1 text-sm text-ink-gray-7">
      <span>{{ __('Papel en la conversación') }}</span>
      <select
        :value="modelValue.role"
        data-field="role"
        class="inquiry-input"
        @change="update('role', $event.target.value)"
      >
        <option v-for="role in INQUIRY_ROLES" :key="role" :value="role">
          {{ __(INQUIRY_LABELS[role]) }}
        </option>
      </select>
    </label>
    <label class="space-y-1 text-sm text-ink-gray-7">
      <span>{{ __('Correo (si lo proporcionó)') }}</span>
      <input
        :value="modelValue.email"
        data-field="email"
        type="email"
        maxlength="140"
        class="inquiry-input"
        @input="update('email', $event.target.value)"
      />
    </label>
    <label class="space-y-1 text-sm text-ink-gray-7">
      <span>{{ __('Teléfono (si lo proporcionó)') }}</span>
      <input
        :value="modelValue.phone"
        data-field="phone"
        type="tel"
        maxlength="40"
        class="inquiry-input"
        @input="update('phone', $event.target.value)"
      />
    </label>
  </div>
</template>

<script setup>
import { INQUIRY_ROLES, INQUIRY_LABELS } from '@/utils/inquiries'
const props = defineProps({ modelValue: { type: Object, required: true } })
const emit = defineEmits(['update:modelValue'])
function update(field, value) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}
</script>
