<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import Slider from '@/lib/components/Slider.vue';
import Split from '@/demo/Split.vue';
import { ref } from 'vue';
import BtnSecondary from '@/lib/components/BtnSecondary.vue';

const value = ref(5);
const value2 = ref(5);
const value3 = ref(Number.NaN);
const step = ref(0.1);
</script>

<template>
  <layout>
    <split name="Slider">
      <div class="flex-row gap-12">
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
      </div>
    </split>
  </layout>
</template>
