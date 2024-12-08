<script setup lang="ts">
import { PlTooltip } from '../PlTooltip';
</script>

<template>
  <PlTooltip class="info" position="southwest" max-width="420px">
    <template #tooltip>
      <span :class="$style.title">Shortcuts</span>

      <div :class="[$style.row, $style.head]">
        <div/>
        <div>MacOS</div>
        <div>Windows/Linux</div>
      </div>

      <div :class="[$style.row, $style.body]">
        <div>Single File</div>
        <div>Click the file</div>
        <div>Click the file</div>

        <div>Adjacent multiple files</div>
        <div>Hold Shift, click first and last files</div>
        <div>Hold Shift, click first and last files</div>

        <div>Non-adjacent multiple files</div>
        <div>Hold Command (⌘), click each file</div>
        <div>Hold Ctrl, click each file</div>

        <div>All files</div>
        <div>Press Command (⌘) + A</div>
        <div>Press Ctrl + A</div>
      </div>
    </template>
  </PlTooltip>
</template>

<style lang="css" module>
.title {
  display: inline-block;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  margin-bottom: 10px;
}

.row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  width: 100%;
  color: #fff;
  column-gap: 1px;

  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}

.row > div:nth-child(3n + 1) {
  padding-left: 4px;
}

.row > div:nth-child(3n) {
  padding-right: 4px;
}

.head {
  background-color: #110529;
  position: relative;
}

.head:before {
  position: absolute;
  content: '';
  background-color: #231842;
  width: 12px;
  left: -12px;
  height: 100%;
}

.head:after {
  position: absolute;
  content: '';
  background-color: #231842;
  width: 12px;
  right: -12px;
  height: 100%;
}

.head > div {
  padding: 6px 12px;
  background-color: #231842;
}

.body {
  background-color: #231842;
}

.body > div {
  padding: 6px 12px;
  background: #110529;
}
</style>
