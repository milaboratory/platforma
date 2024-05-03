<script setup lang="ts">
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import PlColorSlider from '@/lib/components/PlColorSlider.vue';
</script>

<template>
  <Layout>
    <Split name="DropdownListItem">
      <PlColorSlider />
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
