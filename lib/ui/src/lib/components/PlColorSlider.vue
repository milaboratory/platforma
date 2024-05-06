<template>
  <div class="pl-color-slider">
    <div class="pl-color-slider__wrapper">
      <div ref="barRef" class="pl-color-slider__color-contaier">
        <div :style="{ background: gradient }" class="pl-color-slider__gradient" />
      </div>
      <div class="pl-color-slider__thumbs-contaier">
        <template v-if="barRef">
          <PlColorSliderThumb
            v-for="(val, index) in modelValue"
            :key="index"
            v-model="models[index]"
            :bar-ref="barRef"
            class="pl-color-slider__thumb"
            tabindex="0"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import PlColorSliderThumb from './PlColorSliderThumb.vue';

type PropsType = {
  colors: string[];
  modelValue: number[];
};

const props = defineProps<PropsType>();
const barRef = ref<HTMLElement>();
const models = reactive<{ [key: string]: number }>({});

props.modelValue.forEach((value, index) => (models[index] = value));

const gradient = computed(() => {
  const portion = 100 / props.colors.length;
  const result = props.colors
    .map((color, index) => {
      return `${color} ${portion * (index + 1)}%`;
    })
    .join(', ');

  return `linear-gradient(to right, ${result})`;
});
</script>
