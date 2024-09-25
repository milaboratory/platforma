<script lang="ts" setup>
import { generate } from '@/imports';
import { ref } from 'vue';
import { scrollIntoView } from '@milaboratories/uikit';

const scrollable = ref<HTMLElement>();

const options = generate(100, (i) => ({
  text: `Option ${i}`,
  value: i,
}));

function onScroll(_e: unknown) {
  //
}

let id = 0;

function onClick(delta: number) {
  const parent = scrollable.value;

  if (!parent) {
    return;
  }

  id += delta;

  const opt = parent.querySelector(`[data-id="${id}"]`) as HTMLElement | undefined;

  if (!opt) {
    return;
  }

  opt.style.border = '1px solid red';

  scrollIntoView(parent, opt);
}
</script>

<template>
  <div ref="scrollable" class="scrollable" @scroll.passive="onScroll">
    <div v-for="o in options" :key="o.value" class="option" :data-id="o.value">
      {{ o.text }}
    </div>
  </div>
  <div>
    <button @click="() => onClick(10)">Down</button>
    <button @click="() => onClick(-10)">Up</button>
  </div>
</template>

<style lang="scss" scoped>
.scrollable {
  width: 300px;
  overflow: auto;
  max-height: 400px;
  border: 1px solid red;
  position: relative;
  .option {
    display: flex;
    align-items: center;
    height: 30px;
    padding: 0 24px;
    border: 1px solid #eee;
  }
}
</style>
