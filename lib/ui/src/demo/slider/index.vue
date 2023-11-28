<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import Slider from '@/lib/components/Slider.vue';
import Split from '@/demo/Split.vue';
import {ref} from 'vue';
import BtnSecondary from '@/lib/components/BtnSecondary.vue';

const value = ref(5);
const value2 = ref(5);
const value3 = ref(Number.NaN);
const step = ref(0.1);

function onClose() {
  alert('Close action');
}
</script>

<template>
  <layout>
    <split name="Slider">
      <div class="flex-row gap-12">
        value: {{ value}} step: {{ step}}
        <btn-secondary @click.stop="value--">-</btn-secondary>
        <btn-secondary @click.stop="value++">+</btn-secondary>
      </div>
      <div class="flex-row gap-12">
        <slider :max="5" :step="step" v-model="value"/>
      </div>
      <div class="flex-row gap-12" style="width: 200px">
        <slider label="Short label" :max="5" :step="step" v-model="value2"/>
      </div>
      <div class="flex-row gap-12" style="width: 200px">
        <slider label="Invalid value" :max="5" :step="step" v-model="value3"/>
      </div>
    </split>
  </layout>
</template>
