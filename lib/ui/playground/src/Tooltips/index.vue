<script lang="ts" setup>
import Layout from '@/Layout.vue';
import { listToOptions } from '@milaboratory/helpers';
import { PlBtnAccent, PlDropdown, PlTooltip } from '@milaboratory/platforma-uikit.lib';
import { reactive } from 'vue';

const data = reactive({
  delay: 1000,
  position: 'top' as 'top' | 'left' | 'top-left' | 'right',
});

const options = listToOptions(['top', 'left', 'top-left', 'right']);
</script>

<template>
  <Layout>
    <div class="controls">
      <input v-model.number="data.delay" />
      <PlDropdown v-model:model-value="data.position" label="Tooltip position" :options="options" />
    </div>
    <div class="line">
      <PlTooltip class="tt" :delay="data.delay" :position="data.position">
        <PlBtnAccent>Position: {{ data.position }}</PlBtnAccent>
        <template #tooltip>
          Tooltip content<br />
          Second line<br />
          Third line<br />
        </template>
      </PlTooltip>

      <PlTooltip class="info">
        <template #tooltip> Icon </template>
      </PlTooltip>
    </div>
    <div class="line">
      <PlTooltip class="tt" :delay="data.delay" position="top-left">
        <span>Top left</span>
        <template #tooltip>
          PlTooltip content<br />
          PlTooltip content<br />
          PlTooltip content<br />
          PlTooltip content<br />
          PlTooltip content<br />
        </template>
      </PlTooltip>

      <PlTooltip class="tt" :delay="data.delay" position="right">
        <span>Right</span>
        <template #tooltip>
          PlTooltip content<br />
          PlTooltip content<br />
          PlTooltip content<br />
          PlTooltip content<br />
          PlTooltip content<br />
        </template>
      </PlTooltip>
    </div>

    <div class="line">
      <PlTooltip position="top-left" :delay="data.delay">
        <template #tooltip> PlTooltip content </template>
        <button class="nn">Top left</button>
      </PlTooltip>
    </div>

    <div class="line">
      <PlTooltip element="span" position="top-left" :delay="data.delay">
        I am a span element
        <template #tooltip> PlTooltip for span </template>
      </PlTooltip>
    </div>
  </Layout>
</template>

<style lang="scss" scoped>
.controls {
  background-color: #fff;
  display: flex;
  gap: 12px;
}

.nn {
  display: flex;
  width: 61px;
  height: 32px;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  flex-shrink: 0;
}

.line {
  display: flex;
  background-color: #fff;
  padding: 12px;
  margin-top: 48px;
  gap: 60px;
  span {
    text-decoration: underline;
  }
}

.tt {
  width: 200px;
  border: 1px solid #ccc;
  padding: 12px 24px;
  border-radius: 4px;
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
