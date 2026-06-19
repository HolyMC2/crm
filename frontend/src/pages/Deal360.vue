<!--
  Deal / Contact 360° (handoff §5.4) — the full deal workspace as a standalone,
  queue-less, full-width view. Reuses DealWorkspace (header + Conversación/Actividad/
  Reparación) + DealContextPanel (full editable fields). Deal from the route param.
-->
<template>
  <div class="flex min-h-0 w-full flex-1">
    <DealWorkspace />
    <DealContextPanel v-if="activeDeal" />
  </div>
</template>

<script setup>
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import DealWorkspace from '@/components/doco/inbox/DealWorkspace.vue'
import DealContextPanel from '@/components/doco/inbox/DealContextPanel.vue'
import { activeDeal, selectDeal } from '@/composables/inbox'

const props = defineProps({ dealId: { type: String, default: '' } })
const route = useRoute()

function focus() {
  const id = props.dealId || route.params.dealId
  if (id) selectDeal(String(id))
}
onMounted(focus)
watch(() => route.params.dealId, focus)
</script>
