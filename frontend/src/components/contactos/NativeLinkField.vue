<template>
  <div class="c-native-link">
    <FormControl
      ref="control"
      :model-value="query"
      :label="label"
      :disabled="disabled"
      placeholder="Buscar un valor autorizado"
      role="combobox"
      :aria-controls="listId"
      :aria-expanded="expanded"
      :aria-activedescendant="
        expanded && active >= 0 ? `${listId}-${active}` : undefined
      "
      @update:model-value="changeQuery"
      @keydown="keyDown"
    />
    <div
      v-if="expanded"
      :id="listId"
      class="c-link-results"
      role="listbox"
      :aria-label="label"
    >
      <p v-if="loading" role="status">Buscando…</p>
      <button
        v-for="(option, index) in options"
        :id="`${listId}-${index}`"
        :key="option.value"
        type="button"
        role="option"
        :aria-selected="modelValue === option.value"
        :class="{ active: active === index }"
        @click="choose(option)"
      >
        <strong>{{ option.label || option.value }}</strong
        ><small v-if="option.description">{{
          plain(option.description)
        }}</small>
      </button>
      <p v-if="!loading && !options.length">
        No encontramos valores autorizados.
      </p>
      <button type="button" @click="clear">Limpiar selección</button>
    </div>
    <p v-if="error" class="c-muted" role="alert">
      No pudimos cargar las opciones.
      <button class="c-link" @click="search">Reintentar</button>
    </p>
    <p v-if="query !== modelValue && !loading" class="c-muted">
      Selecciona una opción para aplicar el valor.
    </p>
  </div>
</template>
<script setup>
import { call } from 'frappe-ui'
import { onBeforeUnmount, ref, useId, watch } from 'vue'
const props = defineProps({
  modelValue: { type: String, default: '' },
  doctype: String,
  label: String,
  disabled: Boolean,
})
const emit = defineEmits(['update:modelValue'])
const query = ref(props.modelValue || ''),
  options = ref([]),
  expanded = ref(false),
  loading = ref(false),
  error = ref(null),
  active = ref(-1),
  control = ref(null),
  listId = `contactos-link-${useId()}`
let timer,
  generation = 0
watch(
  () => props.modelValue,
  (v) => {
    query.value = v || ''
  },
)
function changeQuery(v) {
  query.value = v
  expanded.value = true
  clearTimeout(timer)
  generation++
  timer = setTimeout(search, 200)
}
async function search() {
  const own = ++generation
  loading.value = true
  error.value = null
  try {
    const result = await call('frappe.desk.search.search_link', {
      doctype: props.doctype,
      txt: query.value,
      page_length: 20,
    })
    if (own === generation) {
      options.value = Array.isArray(result) ? result : []
      active.value = options.value.length ? 0 : -1
      expanded.value = true
    }
  } catch (e) {
    if (own === generation) error.value = e
  } finally {
    if (own === generation) loading.value = false
  }
}
function focusInput() {
  control.value?.$el?.querySelector('input')?.focus()
}
function choose(option) {
  emit('update:modelValue', option.value)
  query.value = option.value
  expanded.value = false
  focusInput()
}
function clear() {
  emit('update:modelValue', '')
  query.value = ''
  expanded.value = false
  focusInput()
}
function keyDown(event) {
  if (event.key === 'Escape') {
    expanded.value = false
    focusInput()
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!expanded.value) search()
    expanded.value = true
    active.value = Math.max(
      0,
      Math.min(
        options.value.length - 1,
        active.value + (event.key === 'ArrowDown' ? 1 : -1),
      ),
    )
  }
  if (event.key === 'Enter' && expanded.value && options.value[active.value]) {
    event.preventDefault()
    choose(options.value[active.value])
  }
}
function plain(v) {
  return String(v).replace(/<[^>]*>/g, '')
}
onBeforeUnmount(() => {
  clearTimeout(timer)
  generation++
})
</script>
