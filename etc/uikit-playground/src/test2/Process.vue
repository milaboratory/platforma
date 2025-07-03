<script lang="ts" setup>
import { onMounted, reactive } from 'vue';
import { animateInfinite } from '@milaboratories/uikit';

const data = reactive({
  progress: '0%',
});

let stopAnimation: undefined | (() => void);

onMounted(() => {
  stopAnimation = animateInfinite({
    getFraction(dt: number) {
      return dt / (dt + 10000);
    },
    timing: (t) => t,
    draw(progress: number) {
      data.progress = Math.ceil(progress * 100) + '%';
    },
  });
});

function onStop() {
  stopAnimation && stopAnimation();
}
</script>

<template>
  <div class="progress" :style="{ backgroundSize: data.progress }">
    {{ data.progress }}
  </div>
  <button @click="onStop">Stop</button>
</template>

<style lang="scss" scoped>
.progress {
  position: relative;
  border: 1px solid #333;
  display: flex;
  align-items: center;
  padding: 12px;
  --progress: green;
  background: linear-gradient(90deg, #f0f5ff 0%, #cbfab4 100%) no-repeat;
}
</style>
