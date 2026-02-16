<script setup lang="ts">
import { PlBlockPage, PlTooltip } from "@platforma-sdk/ui-vue";
import { CSSProperties, ref } from "vue";

const START_X = 50;
const START_Y = 50;
const isDragging = ref(false);

const elementPosition = ref({ x: START_X, y: START_Y });
const offset = ref({ x: 0, y: 0 });

document.addEventListener("mousemove", onMove);
function onMove(ev: MouseEvent) {
  if (isDragging.value) {
    elementPosition.value.x = offset.value.x + ev.clientX;
    elementPosition.value.y = offset.value.y + ev.clientY;
  }
}
function onClickDown(ev: MouseEvent) {
  isDragging.value = true;
  offset.value.x = elementPosition.value.x - ev.clientX;
  offset.value.y = elementPosition.value.y - ev.clientY;
}
function onClickUp(ev: MouseEvent) {
  isDragging.value = false;
}
</script>
<template>
  <PlBlockPage>
    <template #title>Tooltips</template>
    <PlTooltip>
      <div
        :class="$style.tooltipAnchor"
        :style="
          {
            left: elementPosition.x + 'px',
            top: elementPosition.y + 'px',
          } as CSSProperties
        "
        @mousedown="onClickDown"
        @mouseup="onClickUp"
      >
        Tooltip anchor
      </div>
      <template #tooltip> Tooltip content Tooltip content Tooltip content </template>
    </PlTooltip>
  </PlBlockPage>
</template>
<style module>
.tooltipAnchor {
  position: absolute;
  background-color: #808a9c;
  padding: 10px;
  border-radius: 5px;
  display: inline-block;
}
</style>
