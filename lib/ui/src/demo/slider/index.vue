<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import Slider from '@/lib/components/Slider.vue';
import SliderRange from '@/lib/components/SliderRange.vue';
import SliderRangeTriple from '@/lib/components/SliderRangeTriple.vue';
import Split from '@/demo/Split.vue';
import { ref, reactive, computed } from 'vue';
import BtnSecondary from '@/lib/components/BtnSecondary.vue';
const lorem =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const value = ref(3);
const value2 = ref<[number, number]>([2, 6]);
const invalidModel = ref([1, 2, 3]);
const invalidModel2 = ref([1, '2']);
const modelTriple = ref([15, 11, 60]);

const value3 = ref(Number.NaN);
const step = ref(0.1);
const data = reactive({
  state: '' as string,
  text: '',
  num: 1,
  on: false as boolean,
  error: lorem,
  helper: 'Label the raw NGS data source with the corresponding data modality: TCR-Seq, BCR-Seq, RNA-Seq, Single-Cell VDJ, etc. ' + lorem,
});
const error = computed(() => (data.state === 'error' ? data.error : ''));
const helper = computed(() => (data.state === 'helper' ? data.helper : ''));
</script>

<template>
  <layout>
    <split name="Slider">
      <div class="demo-slider-container">
        <slider v-model="value" label="Slider" :max="10" />
      </div>
      <div class="demo-slider-container">
        <h3 class="text-subtitle-m ma-0 mb-6">Range triple</h3>
        <div class="demo-slider-container">
          <h4 class="ma-0 mb-6">Text mode</h4>
          <SliderRangeTriple v-model="modelTriple" label="Range Slider" :max="100" />
        </div>
      </div>
      <div class="demo-slider-container">
        <h3 class="text-subtitle-m ma-0 mb-6">Range</h3>
        <div class="demo-slider-container">
          <h4 class="ma-0 mb-6">Text mode</h4>
          <SliderRange v-model="value2" label="Range Slider" :max="99" />
        </div>
        <div class="demo-slider-container">
          <h4 class="ma-0 mb-6">Input mode</h4>
          <SliderRange v-model="value2" label="Range Slider" mode="input" :max="99" />
        </div>
        <!-- <div class="demo-slider-container">
          <h4 class="ma-0 mb-6">Invalid model</h4>
          <SliderRange v-model="invalidModel" label="Range Slider" :max="100" />
          <SliderRange v-model="invalidModel2" label="Range Slider" :max="100" />
        </div> -->
      </div>
      <div class="demo-slider-container">
        <slider v-model="value" label="Slider" :step="2" :max="10" />
      </div>
      <div class="demo-slider-container">
        <slider v-model="value" :mode="'input'" :step="2" :max="10" label="Slider" />
        <div class="demo-slider-actions">
          <div>
            <h3 class="text-subtitle-m ma-0 mb-6">Additional actions</h3>
          </div>
          <div class="d-flex">
            <btn-secondary @click.stop="value--">-</btn-secondary>
            <btn-secondary @click.stop="value++">+</btn-secondary>
          </div>
        </div>
      </div>

      <!-- <div class="flex-row gap-12">
        value: {{ value }} step: {{ step }}
        <btn-secondary @click.stop="value--">-</btn-secondary>
        <btn-secondary @click.stop="value++">+</btn-secondary>
      </div>
      <div class="flex-row gap-12">
        <slider v-model="value" :max="5" :step="step" />
      </div>
      <div class="flex-row gap-12" style="width: 200px">
        <slider v-model="value2" label="Short label" :max="5" :step="step" />
      </div>
      <div class="flex-row gap-12" style="width: 200px">
        <slider v-model="value3" label="Invalid value" :max="5" :step="step" />
      </div> -->
    </split>
  </layout>
</template>
<style lang="scss" scoped>
h4 {
  font-family: RoadRadio;
}
.demo-slider-container {
  //background-color: green;
  border-radius: 6px;
  border: 1px solid var(--color-div-grey);
  padding: 16px;
  margin-bottom: 16px;
}

.demo-slider-actions {
  border-radius: 6px;
  border: 1px solid var(--color-div-grey);
  padding: 16px;
  margin-bottom: 16px;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
}
.demo-slider-actions button:nth-child(odd) {
  margin-right: 6px;
}
.ma-0 {
  margin: 0;
}
.mb-6 {
  margin-bottom: 16px;
}
</style>
