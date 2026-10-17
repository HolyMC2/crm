<template>
  <SuggestionLine v-if="suggestion" v-bind="suggestion" />
</template>
<script setup>
// The one tag a page adds for «Pregúntale a Muelle» (S2.3): its «Sugerencia»
// (at most one, with a reason quoted from data) and, on a record, the
// context the sheet opens with («Sobre: <registro>»).
import { computed, ref, watch } from 'vue'
import { call } from 'frappe-ui'
import { shellBoot } from '@/composables/muelleShell'
import { moduleEnabled } from '@/vendor/muelle-shell/contracts'
import SuggestionLine from './SuggestionLine.vue'
import { contactoSuggestion, hoySuggestion } from './suggestions'
import {
  assistantEnabled,
  loadStatus,
  useAssistantContext,
} from './useAssistant'

const props = defineProps({
  /** 'hoy' | 'contacto' */
  screen: { type: String, required: true },
  /** Hoy: crm.api.hoy.page() as the page holds it. */
  data: { type: Object, default: null },
  /** Contacto: the record on screen ({ doctype, name, title }). */
  record: { type: Object, default: null },
  /** Contacto: the native records behind it ([{ doctype, name }]). */
  refs: { type: Array, default: () => [] },
})

loadStatus()

// Contacto's record often carries its doctype only in its refs (the page
// reads it the same way for its selected source).
const doctype = computed(
  () =>
    props.record?.doctype ||
    props.refs.find((ref) => ref?.name === props.record?.name)?.doctype ||
    '',
)

if (props.screen === 'contacto')
  useAssistantContext(() =>
    props.record
      ? {
          doctype: doctype.value,
          name: props.record.name,
          title: props.record.title || props.record.name,
        }
      : {},
  )

// What the customer behind this record owes (one read, only with Cobranza).
const owed = ref(null)
const customer = computed(() => {
  if (props.screen !== 'contacto' || !props.record) return ''
  if (doctype.value === 'Customer') return props.record.name
  return props.refs.find((ref) => ref?.doctype === 'Customer')?.name || ''
})
watch(
  [customer, assistantEnabled],
  async ([name, enabled]) => {
    owed.value = null
    if (!name || !enabled || !moduleEnabled(shellBoot.value, 'cobranza')) return
    try {
      const answer = await call('doco.workspaces.receivables.get_customer', {
        customer: name,
      })
      if (customer.value === name) owed.value = answer
    } catch {
      owed.value = null
    }
  },
  { immediate: true },
)

const suggestion = computed(() => {
  if (props.screen === 'hoy') return hoySuggestion(props.data)
  if (props.screen === 'contacto')
    return contactoSuggestion(
      props.record?.title || props.record?.name,
      owed.value,
    )
  return null
})
</script>
