<script lang="ts" setup>
import Layout from '@/Layout.vue';
import { Tooltip } from '@milaboratory/platforma-uikit.lib';

const delay = 1000;
</script>

<template>
  <layout>
    <div class="line">
      <tooltip class="tt" :delay="delay" position="top">
        <span>Top position</span>
        <template #tooltip>
          Tooltip content<br />
          Second line<br />
          Third line<br />
        </template>
      </tooltip>

      <tooltip class="tt" :delay="delay" position="left">
        <span>Left position</span>
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
    <div class="line">
      <tooltip class="tt" :delay="delay" position="top-left">
        <span>Top left</span>
        <template #tooltip>
          Tooltip content<br />
          Tooltip content<br />
          Tooltip content<br />
          Tooltip content<br />
          Tooltip content<br />
        </template>
      </tooltip>

      <tooltip class="tt" :delay="delay" position="right">
        <span>Right</span>
        <template #tooltip>
          Tooltip content<br />
          Tooltip content<br />
          Tooltip content<br />
          Tooltip content<br />
          Tooltip content<br />
        </template>
      </tooltip>
    </div>

    <div class="line">
      <tooltip position="top-left">
        <template #tooltip> Tooltip content </template>
        <button class="nn">Top left</button>
      </tooltip>
    </div>

    <div class="line">
      <tooltip element="span" position="top-left">
        I am a span element
        <template #tooltip> Tooltip for span </template>
      </tooltip>
    </div>
  </layout>
</template>

<style lang="scss" scoped>
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
