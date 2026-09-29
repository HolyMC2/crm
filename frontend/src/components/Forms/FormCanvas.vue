<template>
  <div class="flex flex-col gap-5">
    <!-- masthead: typed right on the canvas, like the visitor will read it -->
    <div>
      <input
        v-model="b.form.title"
        :placeholder="__('Form title')"
        :aria-label="__('Form title')"
        class="w-full border-0 bg-transparent p-0 text-2xl font-semibold leading-tight text-ink-gray-9 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
        @input="b.markDirty()"
      />
      <textarea
        ref="descInput"
        v-model="b.form.description"
        :placeholder="
          __('Add a short line that tells people why to fill this in')
        "
        :aria-label="__('Description')"
        rows="1"
        class="mt-2 w-full resize-none border-0 bg-transparent p-0 text-base leading-relaxed text-ink-gray-6 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
        @input="(e) => (autoGrow(e.target), b.markDirty())"
      />
      <p
        v-if="hasBusinessToken"
        class="mt-1 flex items-center gap-1 text-p-sm text-ink-gray-5"
      >
        <LucideStore class="size-3.5" />
        {{
          __('{business} shows your business name: {0}', [
            b.options.data?.business || __('not set'),
          ])
        }}
      </p>
    </div>

    <div class="flex flex-col gap-3" :class="{ 'select-none': dragging }">
      <Draggable
        :list="b.sections.value"
        :item-key="sectionKey"
        handle=".section-handle"
        group="wf-sections"
        class="flex flex-col gap-3"
        ghost-class="opacity-40"
        :force-fallback="true"
        :fallback-on-body="false"
        fallback-class="wf-drag-fallback"
        :animation="120"
        @start="dragging = true"
        @end="onSortEnd"
      >
        <template #item="{ element: sec }">
          <div class="flex flex-col gap-1.5 rounded-lg bg-surface-gray-2 p-2.5">
            <div class="flex h-7 items-center justify-between">
              <div
                class="flex min-w-0 items-center gap-2 text-base-medium text-ink-gray-9"
              >
                <DragVerticalIcon
                  class="section-handle h-3.5 shrink-0 cursor-grab text-ink-gray-4"
                  :aria-label="__('Drag to reorder section')"
                />
                <input
                  v-if="sec.editingLabel"
                  :ref="(el) => el && el.focus()"
                  v-model="sec.secField.label"
                  :placeholder="__('Section title')"
                  class="min-w-0 flex-1 border-0 bg-transparent p-0 text-base-medium text-ink-gray-9 placeholder:font-normal placeholder:italic placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
                  @blur="sec.editingLabel = false"
                  @keydown.enter="sec.editingLabel = false"
                  @input="b.markDirty()"
                />
                <button
                  v-else
                  class="cursor-text truncate text-left"
                  :class="{ 'italic text-ink-gray-4': !sec.secField.label }"
                  @click="sec.editingLabel = true"
                >
                  {{ sec.secField.label || __('Untitled section') }}
                </button>
              </div>
              <Dropdown :options="sectionMenu(sec)">
                <Button
                  variant="ghost"
                  icon="more-horizontal"
                  :aria-label="__('Section options')"
                />
              </Dropdown>
            </div>
            <div class="flex flex-col gap-2 sm:flex-row">
              <div
                v-for="col in sec.columns"
                :key="columnKey(col)"
                class="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md border border-dashed border-outline-gray-2 bg-surface-elevation-2 p-2"
              >
                <Draggable
                  :list="col.items"
                  group="wf-fields"
                  item-key="fieldname"
                  handle=".drag-handle"
                  class="flex min-h-[34px] min-w-0 flex-1 flex-col gap-1.5"
                  ghost-class="opacity-40"
                  :force-fallback="true"
                  :fallback-on-body="false"
                  fallback-class="wf-drag-fallback"
                  :animation="120"
                  @start="dragging = true"
                  @end="onSortEnd"
                >
                  <template #item="{ element: f }">
                    <FieldCard
                      :field="f"
                      :expanded="b.expanded.value === f.fieldname"
                      :locked="b.isMandatory(f.fieldname)"
                      :guest-select-missing="
                        f.fieldtype === 'Link' &&
                        b.guestSelect[f.options] === false
                      "
                      :granting="!!b.grantingSelect[f.options]"
                      @open="b.expanded.value = f.fieldname"
                      @toggle="toggle(f)"
                      @remove="b.removeField(f)"
                      @update="(patch) => b.updateField(f, patch)"
                      @grant-guest="b.grantGuestSelect(f.options)"
                    />
                  </template>
                </Draggable>
                <Combobox
                  :options="b.availableFieldOptions.value"
                  :model-value="null"
                  :placeholder="__('Search fields…')"
                  @update:selected-option="(e) => b.addFieldToColumn(col, e)"
                >
                  <template #trigger="{ open: pickerOpen, setOpen }">
                    <Button
                      class="!h-8 w-full !bg-surface-elevation-2"
                      variant="outline"
                      :label="__('Add a question')"
                      icon-left="plus"
                      @click="
                        (!pickerOpen && (b.expanded.value = null),
                        setOpen(!pickerOpen))
                      "
                    />
                  </template>
                </Combobox>
              </div>
            </div>
          </div>
        </template>
      </Draggable>

      <Button
        class="!h-8 w-full"
        variant="subtle"
        :label="__('Add a section')"
        icon-left="plus"
        @click="b.addSection()"
      />
    </div>

    <!-- hidden fields: required by the record but not asked of the visitor -->
    <div v-if="b.hiddenFields.value.length">
      <div
        class="mb-2 flex items-center gap-1.5 text-base-medium text-ink-gray-8"
      >
        <LucideEyeOff class="size-3.5 text-ink-gray-5" />
        {{ __('Filled in automatically') }}
      </div>
      <div class="rounded-lg bg-surface-gray-2 p-2.5">
        <p class="mb-2.5 text-p-sm text-ink-gray-6">
          {{
            __(
              "The record needs these, but visitors don't see them. Each new submission gets the value you pick here.",
            )
          }}
        </p>
        <div class="flex flex-col gap-2">
          <div
            v-for="h in b.hiddenFields.value"
            :key="h.fieldname"
            class="flex flex-wrap items-center gap-2.5 rounded-md border border-outline-gray-2 bg-surface-elevation-2 px-2.5 py-2"
          >
            <component
              :is="fieldTypeIcon(h)"
              class="size-4 shrink-0 text-ink-gray-5"
            />
            <span class="flex-1 truncate text-base text-ink-gray-8">{{
              __(h.label)
            }}</span>
            <div class="w-full sm:w-52">
              <FormControl
                v-if="h.fieldtype === 'Select' || h.fieldtype === 'Link'"
                type="select"
                size="sm"
                :model-value="h.default"
                :options="hiddenSelectOptions(h)"
                :aria-label="__(h.label)"
                @update:model-value="(v) => b.setHiddenDefault(h, v)"
              />
              <FormControl
                v-else
                type="text"
                size="sm"
                :model-value="h.default"
                :placeholder="__('Value')"
                :aria-label="__(h.label)"
                @update:model-value="(v) => b.setHiddenDefault(h, v)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Button, Combobox, Dropdown, FormControl } from 'frappe-ui'
import Draggable from 'vuedraggable'
import DragVerticalIcon from '@/components/Icons/DragVerticalIcon.vue'
import LucideEyeOff from '~icons/lucide/eye-off'
import LucideStore from '~icons/lucide/store'
import FieldCard from './FieldCard.vue'
import { fieldTypeIcon } from './fieldTypeIcon'
import { FORM_BUILDER, MAX_COLUMNS } from './useFormBuilder'
import { computed, inject, onMounted, ref, watch } from 'vue'

// the builder model, shared with the page and the other panels
const b = inject(FORM_BUILDER)

const dragging = ref(false)
const descInput = ref(null)

const hasBusinessToken = computed(() =>
  `${b.form.title} ${b.form.description}`.includes('{business}'),
)

function autoGrow(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}
watch(
  [descInput, () => b.form.description],
  () => requestAnimationFrame(() => autoGrow(descInput.value)),
  { flush: 'post' },
)
onMounted(() => document.fonts?.ready?.then(() => autoGrow(descInput.value)))

function onSortEnd() {
  dragging.value = false
  b.syncFromModel()
}
const sectionKey = (sec) => sec.secField?.fieldname || 'sec'
const columnKey = (col) => col.colField?.fieldname || 'col0'

function toggle(f) {
  const ex = b.expanded
  ex.value = ex.value === f.fieldname ? null : f.fieldname
}

function sectionMenu(sec) {
  const cols = sec.columns
  return [
    {
      group: __('Section'),
      items: [
        {
          label: __('Rename'),
          icon: 'edit',
          onClick: () => (sec.editingLabel = true),
        },
        {
          label: __('Remove section'),
          icon: 'trash-2',
          onClick: () => b.removeBreak(sec.secField),
        },
      ],
    },
    {
      group: __('Columns'),
      items: [
        {
          label: __('Add a column'),
          icon: 'columns',
          onClick: () => b.addColumn(cols),
          condition: () => cols.length < MAX_COLUMNS,
        },
        {
          label: __('Remove last column'),
          icon: 'trash-2',
          onClick: () => b.removeLastColumn(cols),
          condition: () => cols.length > 1,
        },
      ],
    },
  ]
}

function hiddenSelectOptions(h) {
  let opts =
    h.fieldtype === 'Select'
      ? (h.options || '').split('\n').filter(Boolean)
      : b.linkOptions[h.options] || []
  opts = opts.slice()
  if (h.default && !opts.includes(h.default)) opts.unshift(h.default)
  return opts.map((o) => ({ label: __(o), value: o }))
}
</script>

<style>
/* Hide Sortable's floating drag clone so reordering stays inside the list. */
.wf-drag-fallback {
  opacity: 0 !important;
}
</style>
