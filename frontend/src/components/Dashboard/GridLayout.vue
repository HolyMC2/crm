<template>
  <VglLayout
    v-model:layout="layout"
    v-bind="options"
    @layout-ready="() => (layoutReady = true)"
  >
    <VglItem
      v-for="(l, index) in layout"
      :key="l.i"
      :i="l.i"
      :x="l.x"
      :y="l.y"
      :w="l.w"
      :h="l.h"
      :min-w="l.minW"
      :min-h="l.minH"
      :max-w="l.maxW"
      :max-h="l.maxH"
    >
      <slot
        v-if="layoutReady"
        name="item"
        :index="index"
        :i="l.i"
        :x="l.x"
        :y="l.y"
        :w="l.w"
        :h="l.h"
        :min-w="l.minW"
        :min-h="l.minH"
        :max-w="l.maxW"
        :max-h="l.maxH"
      />
    </VglItem>
  </VglLayout>
</template>

<script setup>
// frappe-ui's GridLayout (a thin wrapper over grid-layout-plus) left the
// package in 1.0; this is that wrapper, from 1.0.0-beta.29
// (src/components/VueGridLayout/Layout.vue), with the debug placeholder slot
// content dropped. Layout items: { i, x, y, w, h, minW?, minH?, maxW?, maxH? }.
import { GridLayout as VglLayout, GridItem as VglItem } from 'grid-layout-plus'
import { computed, reactive, ref } from 'vue'

const props = defineProps({
  cols: { type: Number, default: 12 },
  rowHeight: { type: Number, default: 52 },
  disabled: { type: Boolean, default: false },
})

const layout = defineModel({ type: Array, default: () => [] })

const layoutReady = ref(false)

const options = reactive({
  colNum: props.cols,
  margin: [0, 0],
  rowHeight: props.rowHeight,
  isDraggable: computed(() => !props.disabled),
  isResizable: computed(() => !props.disabled),
  responsive: true,
  verticalCompact: true,
  preventCollision: false,
  useCssTransforms: true,
  cols: {
    lg: props.cols,
    md: props.cols,
    sm: props.cols,
    xs: 1,
    xxs: 1,
  },
})
</script>

<style scoped>
.vgl-layout {
  --vgl-placeholder-bg: #b1b1b1;
  --vgl-placeholder-opacity: 15%;
  --vgl-placeholder-z-index: 2;

  --vgl-item-resizing-z-index: 3;
  --vgl-item-resizing-opacity: 100%;
  --vgl-item-dragging-z-index: 3;
  --vgl-item-dragging-opacity: 100%;

  --vgl-resizer-size: 10px;
  --vgl-resizer-border-color: #444;
  --vgl-resizer-border-width: 2px;
}

:deep(.vgl-item--placeholder) {
  z-index: var(--vgl-placeholder-z-index, 2);
  user-select: none;
  background-color: var(--vgl-placeholder-bg);
  opacity: var(--vgl-placeholder-opacity);
  transition-duration: 100ms;
  border-radius: 0.5rem;
}

:deep(.vgl-item__resizer) {
  position: absolute;
  right: 12px;
  bottom: 12px;
  box-sizing: border-box;
  width: var(--vgl-resizer-size);
  height: var(--vgl-resizer-size);
  cursor: se-resize;
}

:deep(.vgl-item__resizer:before) {
  position: absolute;
  inset: 0 3px 3px 0;
  content: '';
  border: 0 solid var(--vgl-resizer-border-color);
  border-right-width: var(--vgl-resizer-border-width);
  border-bottom-width: var(--vgl-resizer-border-width);
}
</style>
