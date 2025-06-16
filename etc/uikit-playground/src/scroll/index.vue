<script lang="ts" setup>
import Layout from '../Layout.vue';
import Split from '../Split.vue';
import DomScroll from './CustomScroll.vue';
import NativeScroll from './NativeScroll.vue';
</script>

<template>
  <Layout>
    <Split name="Scrolls">
      <DomScroll />
      <NativeScroll />
    </Split>
  </Layout>
</template>
