<script lang="ts" setup>
import { ref } from 'vue';
import { useDraggable } from '@milaboratory/platforma-uikit.lib';

const squareRef = ref();

useDraggable(squareRef, (_ev) => {
  // console.log('ev', ev);
});
</script>

<template>
  <table class="tbl">
    <tr>
      <td>1</td>
      <td>2</td>
      <td>3</td>
    </tr>
    <tr ref="squareRef" class="red">
      <td>4</td>
      <td>5</td>
      <td>6</td>
    </tr>
    <tr>
      <td>7</td>
      <td>8</td>
      <td>9</td>
    </tr>
  </table>
</template>

<style lang="scss" scoped>
.tbl {
  border-collapse: collapse;
  td {
    border: 1px solid #ddd;
    user-select: none;
    text-align: center;
    padding: 12px 0;
  }
}

.red {
  background-color: red;
}
</style>
