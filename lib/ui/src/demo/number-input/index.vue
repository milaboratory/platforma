<script setup lang="ts">
import { reactive, ref } from 'vue';
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import NumberInput from '@/lib/components/NumberInput.vue';

const models = reactive({
  model0: 0,
  model1: undefined,
  model2: NaN,
  model3: 'Some string',
  model4: '100',
});
</script>
<template>
  <Layout>
    <Split name="Number input">
      <button @click="models.model0 ? models.model0++ : (models.model0 = 1)">add</button>
      <div>models {{ models }}</div>
      <NumberInput v-model="models.model0" label="Your label" placeholder="Some placeholder" />
      <NumberInput v-model="models.model1" label="Your label" placeholder="Some placeholder" />
      <NumberInput v-model="models.model2" label="Your label" placeholder="Some placeholder" />
      <NumberInput v-model="models.model3" label="Your label" placeholder="Some placeholder" />
      <NumberInput v-model="models.model4" label="Your label" placeholder="Some placeholder" />
    </Split>
  </Layout>
</template>
