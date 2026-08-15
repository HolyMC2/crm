<template>
  <!--
    muelle-forms/1 thin renderer — frappe-ui skin (F3).
    ──────────────────────────────────────────────────
    Fork discipline: lives entirely under components/doco/. Renders a server-
    compiled descriptor (doco.forms.api) over a PARENT-OWNED draft object and
    emits field updates — it never mutates the draft itself. Validation +
    field-state resolution come from the VENDORED contract bundle
    (src/vendor/muelle-forms — drift-gated by sync-forms-contract.sh).
    `sections` filters which descriptor sections this instance renders so a
    dialog can interleave descriptor rows with its custom blocks.
  -->
  <div class="flex flex-col gap-3">
    <template v-for="section in visibleSections" :key="section.key">
      <div
        class="grid grid-cols-1 gap-3"
        :class="{ 'sm:grid-cols-2': section.columns === 2, 'sm:grid-cols-3': section.columns === 3 }"
        :data-section="section.key"
      >
        <template v-for="field in section.fields" :key="field.fieldname">
          <div
            v-if="isVisible(field)"
            :data-fieldname="field.fieldname"
            :class="{ hidden: field.hidden }"
          >
            <Link
              v-if="field.widget === 'link' && field.link?.doctype"
              :doctype="field.link.doctype"
              :filters="field.link.filters"
              :label="field.label"
              :placeholder="field.placeholder || ''"
              :modelValue="str(draft[field.fieldname])"
              @update:modelValue="(v) => emitUpdate(field.fieldname, v)"
            />
            <FormControl
              v-else-if="field.widget === 'select'"
              type="select"
              :label="field.label"
              :options="selectOptions(field)"
              :modelValue="str(draft[field.fieldname])"
              :disabled="isReadonly(field)"
              @update:modelValue="(v) => emitUpdate(field.fieldname, v || null)"
            />
            <FormControl
              v-else-if="field.widget === 'check'"
              type="checkbox"
              :label="field.label"
              :modelValue="!!draft[field.fieldname]"
              :disabled="isReadonly(field)"
              @update:modelValue="(v) => emitUpdate(field.fieldname, v ? 1 : 0)"
            />
            <FormControl
              v-else-if="field.widget === 'textarea'"
              type="textarea"
              :rows="3"
              :label="labelFor(field)"
              :placeholder="field.placeholder || ''"
              :modelValue="str(draft[field.fieldname])"
              :disabled="isReadonly(field)"
              @update:modelValue="(v) => emitUpdate(field.fieldname, v)"
            />
            <FormControl
              v-else-if="field.widget === 'password'"
              type="password"
              :label="field.label"
              autocomplete="off"
              :modelValue="str(draft[field.fieldname])"
              :disabled="isReadonly(field)"
              @update:modelValue="(v) => emitUpdate(field.fieldname, v)"
            />
            <FormControl
              v-else
              type="text"
              :label="labelFor(field)"
              :placeholder="field.placeholder || ''"
              :modelValue="str(draft[field.fieldname])"
              :disabled="isReadonly(field)"
              @update:modelValue="(v) => emitUpdate(field.fieldname, v)"
              @blur="field.widget === 'phone' && onPhoneBlur(field.fieldname, $event)"
            />
            <p
              v-if="errorFor(field.fieldname)"
              class="mt-1 text-xs text-ink-red-7"
              aria-live="polite"
            >
              {{ errorFor(field.fieldname) }}
            </p>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { FormControl } from 'frappe-ui'
import Link from '@/components/Controls/Link.vue'
import {
  evaluate,
  normalizePhone,
  resolveFormState,
} from '../../../vendor/muelle-forms/form-core.vendor.mjs'

const props = defineProps({
  descriptor: { type: Object, required: true },
  draft: { type: Object, required: true },
  errors: { type: Array, default: () => [] },
  sections: { type: Array, default: null },
})
const emit = defineEmits(['update:draft'])

const states = computed(() => resolveFormState(props.descriptor, props.draft))

const visibleSections = computed(() =>
  props.descriptor.sections.filter((s) => {
    if (props.sections && !props.sections.includes(s.key)) return false
    return s.visible_when == null || evaluate(s.visible_when, props.draft)
  }),
)

const str = (v) => (v === null || v === undefined ? '' : String(v))
const isVisible = (f) => f.hidden || states.value[f.fieldname]?.visible !== false
const isReadonly = (f) => states.value[f.fieldname]?.readonly === true
const selectOptions = (f) => ['', ...(f.options || [])]
const labelFor = (f) => (f.reqd ? `${f.label} *` : f.label)

function errorFor(fieldname) {
  const e = props.errors.find((x) => x.fieldname === fieldname)
  return e ? e.message : null
}

function emitUpdate(fieldname, value) {
  emit('update:draft', fieldname, value)
}

function onPhoneBlur(fieldname, event) {
  const r = normalizePhone(event?.target?.value)
  if (r.ok) emit('update:draft', fieldname, r.e164)
}
</script>
