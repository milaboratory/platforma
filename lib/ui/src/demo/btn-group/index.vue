<script lang="ts" setup>
import {reactive} from 'vue';
import Layout from '@/demo/Layout.vue';
import BtnGroup from '@/lib/components/BtnGroup.vue';
import Split from '@/demo/Split.vue';
import {generate} from '@/lib/helpers/functions';

const data = reactive({
  num: 1
});

const options = generate(3, i => ({
  text: `Option ${i}`,
  value: i
}));

const options2 = [{
  text: 'A',
  value: 1
}, {
  text: 'B',
  value: 2
}, {
  text: 'C',
  value: 3
}]
</script>

<template>
  <layout>
    <split name="Button Group">
      <btn-group label="Label" :options="options" v-model="data.num"/>
      <btn-group label="Label" :options="options" v-model="data.num">
        <template #tooltip>
          Tooltip content
          Second row
        </template>
      </btn-group>
      <btn-group label="Label" disabled :options="options2" v-model="data.num"/>
      <btn-group label="Label" :options="options2" v-model="data.num"/>
    </split>
  </layout>
</template>
