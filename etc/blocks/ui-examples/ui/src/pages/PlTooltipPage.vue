<script setup lang="ts">
import { PlBlockPage, PlBtnSecondary, PlIcon16, PlRow, PlTooltip } from "@platforma-sdk/ui-vue";
import { CSSProperties, onUnmounted, ref } from "vue";

const START_X = 500;
const START_Y = 500;
const isDragging = ref(false);

const elementPosition = ref({ x: START_X, y: START_Y });
const offset = ref({ x: 0, y: 0 });

document.addEventListener("mousemove", onMove);
onUnmounted(() => {
  document.removeEventListener("mousemove", onMove);
});
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

const showTooltip = ref(false);
function onClickTooltipButton() {
  showTooltip.value = !showTooltip.value;
}

const customContainerRef = ref<HTMLElement>();
</script>
<template>
  <PlBlockPage>
    <template #title>Tooltips</template>
    <div :class="$style.examplesList">
      <PlRow>
        Default tooltip with info icon:
        <PlTooltip class="info" position="top">
          <template #tooltip> Tooltip content tooltip content tooltip content </template>
        </PlTooltip>
      </PlRow>
      <PlRow>
        Tooltip with an anchor (top):
        <PlTooltip position="top">
          <PlIcon16 name="box" />
          <template #tooltip> Tooltip content </template>
        </PlTooltip>
      </PlRow>
      <PlRow>
        Tooltip with an anchor (bottom):
        <PlTooltip position="bottom">
          <PlIcon16 name="box" />
          <template #tooltip> Tooltip content </template>
        </PlTooltip>
      </PlRow>
      <PlRow>
        Tooltip with an anchor (left):
        <PlTooltip position="left">
          <PlIcon16 name="box" />
          <template #tooltip> Tooltip content </template>
        </PlTooltip>
      </PlRow>
      <PlRow>
        Tooltip with an anchor (right):
        <PlTooltip position="right">
          <PlIcon16 name="box" />
          <template #tooltip> Tooltip content </template>
        </PlTooltip>
      </PlRow>
      <PlRow>
        Tooltip with an anchor (top-left):
        <PlTooltip position="top-left">
          <PlIcon16 name="box" />
          <template #tooltip> Tooltip content </template>
        </PlTooltip>
      </PlRow>
      <PlRow>
        <PlTooltip position="top">
          <PlIcon16 name="box" />
          <template #tooltip> Tooltip content </template>
        </PlTooltip>
        - anchor is close to the left edge
      </PlRow>
      <PlRow>
        <PlTooltip position="top" :hide="!showTooltip" :hoverable="false">
          <PlBtnSecondary @click="onClickTooltipButton" size="small">{{
            showTooltip ? "Click to hide tooltip" : "Click to show tooltip"
          }}</PlBtnSecondary>
          <template #tooltip> Tooltip content </template>
        </PlTooltip>
      </PlRow>
      <div :class="$style.customContainer" ref="customContainerRef">
        <PlTooltip position="bottom" :container="customContainerRef">
          <div :class="$style.tooltipAnchor" :style="{ left: '12px', top: '12px' }">anchor</div>
          <template #tooltip> Tooltip content </template>
        </PlTooltip>
        <PlTooltip position="bottom" :container="customContainerRef">
          <div :class="$style.tooltipAnchor" :style="{ right: '12px', top: '12px' }">anchor</div>
          <template #tooltip> Tooltip content </template>
        </PlTooltip>
        <PlTooltip position="top" :container="customContainerRef">
          <div :class="$style.tooltipAnchor" :style="{ left: '12px', bottom: '12px' }">anchor</div>
          <template #tooltip> Tooltip content </template>
        </PlTooltip>
        <PlTooltip position="top" :container="customContainerRef">
          <div :class="$style.tooltipAnchor" :style="{ right: '12px', bottom: '12px' }">anchor</div>
          <template #tooltip> Tooltip content </template>
        </PlTooltip>
      </div>
    </div>

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
        Tooltip anchor (draggable)
      </div>
      <template #tooltip> Tooltip content Tooltip content Tooltip content </template>
    </PlTooltip>
  </PlBlockPage>
</template>
<style module>
.examplesList {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tooltipAnchor {
  position: absolute;
  background-color: #808a9c;
  padding: 10px;
  border-radius: 5px;
  display: inline-block;
  cursor: grab;
}
.customContainer {
  width: 300px;
  height: 200px;
  border: 1px solid black;
  position: relative;
}
</style>
