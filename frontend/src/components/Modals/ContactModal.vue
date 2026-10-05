<template>
  <IdentityEditor v-model="show" :defaults="defaults" @saved="saved" />
</template>
<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import IdentityEditor from '@/components/contactos/IdentityEditor.vue'
import { sourceRoute } from '@/utils/shellRoutes'
const props = defineProps({
  contact: { type: Object, default: () => ({}) },
  data: { type: Object, default: () => ({}) },
  options: { type: Object, default: () => ({ redirect: true }) },
})
const show = defineModel({ type: Boolean })
const router = useRouter()
const defaults = computed(() => ({
  source: 'contact',
  kind: 'person',
  fields: props.contact.data || props.contact,
}))
function saved(record) {
  const ref = record.refs?.find((ref) => ref.doctype === 'Contact') || record
  props.contact?.reload?.()
  props.options.afterInsert?.({ ...record.fields, ...ref })
  if (props.options.redirect !== false && ref.name)
    router.push(sourceRoute(ref.doctype || 'Contact', ref.name))
  show.value = false
}
</script>
