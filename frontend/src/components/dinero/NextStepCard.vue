<template>
  <!-- The record's one next step (Shell S5, dinero cross-view D): a reason
       line when something blocks it, a short detail, then exactly one filled
       button first and tonal ones after it. On a phone the buttons stack full
       width (thumb reach); on a desk they sit in a row. Used by CompraOrden,
       GastoFactura and CobranzaCliente so the three look and read alike. -->
  <section
    class="rounded-xl border border-outline-gray-2 p-4"
    :aria-label="label || __('Next step', null, 'Dinero')"
    data-next-step
  >
    <p
      v-if="reason"
      class="break-words text-base font-medium text-ink-gray-9"
      data-next-step-reason
    >
      {{ reason }}
    </p>
    <p
      v-if="detail"
      class="break-words"
      :class="
        reason ? 'mt-1 text-sm text-ink-gray-6' : 'text-base text-ink-gray-8'
      "
    >
      {{ detail }}
    </p>
    <slot />
    <div
      v-if="$slots.actions"
      class="flex flex-col gap-2 [&>*]:w-full sm:flex-row sm:flex-wrap sm:[&>*]:w-auto"
      :class="reason || detail || $slots.default ? 'mt-3' : ''"
      data-next-step-actions
    >
      <slot name="actions" />
    </div>
  </section>
</template>
<script setup>
defineProps({
  /** What blocks the step, or what it is («Falta registrar la factura»). */
  reason: { type: String, default: '' },
  /** One short line of context under it. */
  detail: { type: String, default: '' },
  /** The section's name for screen readers. */
  label: { type: String, default: '' },
})
</script>
