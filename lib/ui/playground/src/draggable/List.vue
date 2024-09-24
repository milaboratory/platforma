<script lang="ts" setup>
import { ref } from 'vue';
import { useDraggable } from '@milaboratory/platforma-uikit.lib';

const squareRef = ref();

useDraggable(squareRef, (_ev) => {
  // console.log('ev', ev);
});
</script>

<template>
  <div class="list">
    <div class="square" />
    <div class="square" />
    <div ref="squareRef" class="square red" />
    <div class="square" />
    <div class="square" />
  </div>
</template>

<style lang="scss" scoped>
.list {
  border: 1px solid #ccc;
  display: flex;
  .square {
    margin: 0 -1px;
  }
}

.square {
  width: 50px;
  height: 50px;
  background-color: #ccc;
  border: 1px solid black;

  &.red {
    background-color: red;
  }
}
</style>
