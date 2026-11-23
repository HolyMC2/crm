<template>
  <!-- «Cupones en la tienda en línea» (doco storefront_online_coupons): one
       switch for whether the online checkout takes coupons. Off, the store
       sells at list prices: no coupon field, no code accepted. Hidden for
       whoever cannot read the shop's settings or where there is no shop. A
       tap shows at once; the cell's answer replaces it, a refusal puts it
       back. -->
  <div
    v-if="view"
    id="cuenta-cupones"
    class="scroll-mt-16 border-t border-outline-gray-1 py-3"
    data-testid="tienda-cupones"
  >
    <div class="flex min-h-14 items-center gap-3">
      <label for="tienda-cupones-switch" class="min-w-0 flex-1">
        <span class="block text-base font-semibold text-ink-gray-9">{{
          __('Coupons in the online store', null, 'Cuenta')
        }}</span>
        <span class="block text-sm text-ink-gray-7">{{
          __(
            'Your customers can use coupons when they pay online. Turn it off if you sell online only at list prices.',
            null,
            'Cuenta',
          )
        }}</span>
      </label>
      <AjustesSwitch
        id="tienda-cupones-switch"
        :model-value="view.on"
        :label="__('Coupons in the online store', null, 'Cuenta')"
        :disabled="!view.canChange || saving"
        data-testid="tienda-cupones-switch"
        @update:model-value="toggle"
      />
    </div>
    <p
      v-if="!view.canChange"
      class="text-sm text-ink-gray-6"
      data-testid="tienda-cupones-solo-ver"
    >
      {{ __('Whoever runs the system can change it.', null, 'Cuenta') }}
    </p>
  </div>
</template>
<script setup>
import { onBeforeUnmount, ref } from 'vue'
import { toast } from 'frappe-ui'
import AjustesSwitch from '@/components/ajustes/AjustesSwitch.vue'
import { errorText } from '@/utils/errorText'
import { onlineCoupons, saveOnlineCoupons } from './api'
import { couponsView } from './tiendaEnLinea'

const view = ref(null)
const saving = ref(false)
let alive = true
onBeforeUnmount(() => {
  alive = false
})

async function load() {
  try {
    const out = await onlineCoupons()
    if (alive) view.value = couponsView(out)
  } catch {
    // No row: this person does not read the shop's settings, or the cell
    // predates the switch.
  }
}
load()

async function toggle(value) {
  if (saving.value || !view.value?.canChange) return
  const before = view.value.on
  view.value = { ...view.value, on: value }
  saving.value = true
  try {
    const out = await saveOnlineCoupons(value)
    if (!alive) return
    view.value = couponsView(out) || { ...view.value, on: before }
    toast.success(
      view.value.on
        ? __('Your customers can use coupons online.', null, 'Cuenta')
        : __('Your online store takes no coupons now.', null, 'Cuenta'),
    )
  } catch (error) {
    if (!alive) return
    view.value = { ...view.value, on: before }
    toast.error(
      errorText(error, __('It did not change. Try again.', null, 'Cuenta')),
    )
  } finally {
    saving.value = false
  }
}
</script>
