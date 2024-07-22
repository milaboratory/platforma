<script lang="ts" setup>
import { ref } from 'vue';
import Layout from '@/Layout.vue';
import Scrollable from '@/test/Scrollable.vue';
import { Tooltip, useTheme, useResizeObserver, MaskIcon } from '@milaboratory/platforma-uikit.lib';

const resizable = ref<HTMLElement | undefined>();

useResizeObserver(resizable, () => {
  console.log('size changed');
});

useTheme((mode) => {
  console.log('new mode', mode);
});

function onCloseTooltip() {
  console.log('closed');
}
</script>

<template>
  <layout>
    <div class="g-1">
      <div>Item 1</div>
      <div>Item 2</div>
      <div>Item 3</div>
      <div>
        <mask-icon style="background-color: red" name="paper-clip" />
        <mask-icon style="background-color: red" name="checkmark" />
      </div>
    </div>
    <div style="display: flex; background-color: #fff; padding: 12px; margin-top: 12px">
      <tooltip class="tt" :delay="100000" position="top">
        <span>Has tooltip</span>
        <template #tooltip>
          Tooltip content<br />
          Second line<br />
          Third line<br />
        </template>
      </tooltip>

      <tooltip class="info">
        <template #tooltip> Icon </template>
      </tooltip>
    </div>
    <div style="background-color: #fff; padding: 12px; margin-top: 12px">
      <tooltip class="tt" :delay="100000" position="top">
        <span>Has tooltip</span>
        <template #tooltip>
          Tooltip content<br />
          Second line<br />
          Third line<br />
        </template>
      </tooltip>
    </div>
    <div style="background-color: #fff; padding: 12px; margin-top: 12px">
      <tooltip class="tt" :delay="1000" position="top" @tooltip:close="onCloseTooltip">
        <span>Has tooltip</span>
        <template #tooltip>
          Tooltip content<br />
          Second line<br />
          Third line<br />
        </template>
      </tooltip>
    </div>
    <div style="width: 800px; height: 500px; background-color: #fff; padding: 24px; display: flex">
      <scrollable />
      <div ref="resizable" style="resize: both; padding: 20px; border: 1px solid #333; overflow: auto"></div>
    </div>
  </layout>
</template>

<style lang="scss">
.tt {
  width: 200px;
  border: 1px solid red;
  cursor: default;
  resize: both;
}

.g-1 {
  display: grid;
  gap: 12px;
  border: 1px solid red;

  grid-template-columns: 1fr 1fr;

  > div:first-child {
    grid-column: 1 / span 2;
  }

  > div {
    border: 1px solid #ddd;
    padding: 12px 20px;
    background: #fff;
  }
}
</style>
