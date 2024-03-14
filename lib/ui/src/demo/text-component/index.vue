<script setup lang="ts">
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import LongText from '@/lib/components/LongText.vue';
</script>

<template>
  <Layout>
    <Split name="Long text">
      <div class="container">
        <LongText class="text-h1"> Long text Lorem ipsum dolor sit amet, consectetur adipisicing elit. </LongText>
      </div>
      <div class="container">
        <LongText class="text-h3"> Small text </LongText>
      </div>
      <div class="container-1">
        <LongText class="text-h3"> Small text </LongText>
      </div>
      <div class="container-2">
        <LongText class="text-h3"> Small text </LongText>
      </div>
    </Split>
  </Layout>
</template>

<style scoped lang="scss">
@use '../../lib/assets/typography.scss';
.container {
  width: 200px;
  padding-bottom: 20px;
}
.container-1 {
  width: 290px;
}
.container-2 {
  width: 300px;
}
</style>
