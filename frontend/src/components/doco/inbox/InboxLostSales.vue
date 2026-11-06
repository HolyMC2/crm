<template>
  <!-- «No lo tenía» in the chat: what the customer asked for and the shop did
       not have. The assistant's notes of this conversation wait here as drafts
       for the seller to confirm or discard; the button records one by hand.
       Hidden for someone who may not record lost sales. -->
  <section
    v-if="allowed"
    class="flex-none border-b border-outline-gray-1 p-3.5"
    :aria-label="__('Lost sales', null, 'VentasPerdidas')"
    data-testid="inbox-lost-sales"
  >
    <div class="flex items-center gap-2">
      <h3 class="min-w-0 flex-1 text-sm font-semibold text-ink-gray-8">
        {{ __('Lost sales', null, 'VentasPerdidas') }}
      </h3>
      <Button
        size="sm"
        :label="__('We did not have it', null, 'VentasPerdidas')"
        class="min-h-11 flex-none sm:min-h-8"
        @click="sheetOpen = true"
      />
    </div>
    <p v-if="problem" role="alert" class="mt-2 text-sm text-ink-red-7">
      {{ problem }}
    </p>
    <ul v-if="drafts.length" class="mt-2 space-y-2">
      <li
        v-for="row in drafts"
        :key="row.name"
        class="rounded-6 border border-outline-gray-2 p-2.5"
      >
        <span class="block text-sm font-medium text-ink-gray-9">{{
          row.title
        }}</span>
        <span class="block text-xs text-ink-gray-6">{{
          __('Noted by the assistant', null, 'VentasPerdidas')
        }}</span>
        <span class="mt-2 flex justify-end gap-2">
          <Button
            size="sm"
            :label="__('Discard', null, 'VentasPerdidas')"
            class="min-h-11 sm:min-h-8"
            :loading="busy === row.name + ':discard'"
            @click="decide(row, 'discard')"
          />
          <Button
            size="sm"
            variant="solid"
            :label="__('Confirm', null, 'VentasPerdidas')"
            class="min-h-11 sm:min-h-8"
            :loading="busy === row.name + ':confirm'"
            @click="decide(row, 'confirm')"
          />
        </span>
      </li>
    </ul>
    <LostSaleSheet
      v-model:open="sheetOpen"
      channel="WhatsApp"
      :reference-doctype="doctype"
      :reference-name="name"
      @recorded="load"
    />
  </section>
</template>
<script setup>
import { defineAsyncComponent, ref, watch } from 'vue'
import { Button, toast } from 'frappe-ui'
import { comprasApi, problemOf } from '@/composables/useCompras'

const LostSaleSheet = defineAsyncComponent(
  () => import('@/components/compras/LostSaleSheet.vue'),
)

const props = defineProps({
  doctype: { type: String, required: true },
  name: { type: String, required: true },
})

const API = 'doco.workspaces.ventas_perdidas.'
const allowed = ref(false)
const drafts = ref([])
const problem = ref('')
const busy = ref('')
const sheetOpen = ref(false)

async function load() {
  problem.value = ''
  try {
    drafts.value = await comprasApi(API + 'drafts', {
      reference_doctype: props.doctype,
      reference_name: props.name,
    })
    allowed.value = true
  } catch (error) {
    const got = problemOf(error)
    // no counter, till, workshop or store post (or no lost sales on this site):
    // nothing to record from here; once shown, a failure says why
    if (got.kind === 'permission') allowed.value = false
    drafts.value = []
    if (allowed.value) problem.value = got.detail
  }
}

async function decide(row, action) {
  busy.value = `${row.name}:${action}`
  problem.value = ''
  try {
    await comprasApi(API + action, { name: row.name })
    toast.success(
      action === 'confirm'
        ? __('Confirmed: it counts as demand', null, 'VentasPerdidas')
        : __('Discarded', null, 'VentasPerdidas'),
    )
    await load()
  } catch (error) {
    problem.value = problemOf(error).detail
  } finally {
    busy.value = ''
  }
}

watch(() => [props.doctype, props.name], load, { immediate: true })
</script>
