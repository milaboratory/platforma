<script setup lang="ts">
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import PlColorSlider from '@/lib/components/PlColorSlider.vue';
import { reactive } from 'vue';
const data = reactive({
  colors: ['#FFF680', '#53D788', '#36739D', '#4A005C'],
  values: [20, 35, 56, 70],
  //0-25      25-50
});
</script>

<template>
  <Layout>
    <Split hide-second name="DropdownListItem">
      <PlColorSlider v-model="data.values" :colors="data.colors" />
    </Split>
  </Layout>
</template>

<style scoped>
.ui-select-input-line {
  margin-right: 25px;
}

.h3 {
  margin: 0;
  margin-bottom: 16px;
  font-size: 24px;
  line-height: 24px;
}

.container {
  border-radius: 6px;
  border: 1px solid var(--color-div-grey);
  padding: 16px;
  margin-bottom: 16px;
}
</style>
