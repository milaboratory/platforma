<script setup lang="ts">
import { computed, reactive } from 'vue';
import TextField from '@/lib/components/TextField.vue';
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import BtnGroup from '@/lib/components/BtnGroup.vue';
import SelectInput from '@/lib/components/SelectInput.vue';
import Slider from '@/lib/components/Slider.vue';
import ToggleSwitch from '@/lib/components/ToggleSwitch.vue';

const lorem =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const data = reactive({
  state: '' as string,
  text: '',
  num: 1,
  on: false as boolean,
  error: lorem,
  helper: 'Label the raw NGS data source with the corresponding data modality: TCR-Seq, BCR-Seq, RNA-Seq, Single-Cell VDJ, etc. ' + lorem,
});

const options = [
  {
    text: 'Helper',
    value: 'helper',
  },
  {
    text: 'Error',
    value: 'error',
  },
  {
    text: 'Clean',
    value: '',
  },
];

const error = computed(() => (data.state === 'error' ? data.error : ''));
const helper = computed(() => (data.state === 'helper' ? data.helper : ''));
</script>

<template>
  <layout>
    <split name="Text Field">
      <btn-group v-model="data.state" label="Variants" :helper="helper" :error="error" :options="options" />
      <text-field v-model="data.text" label="Label Text" :helper="helper" :error="error" />
      <select-input v-model="data.text" label="Label Dropdown" :options="options" :helper="helper" :error="error" />
      <slider v-model="data.num" label="Slider" :helper="helper" :error="error" :max="10" />
      <toggle-switch v-model="data.on" />
      <toggle-switch v-model="data.on" label="With label" />
    </split>
  </layout>
</template>
