<script lang="ts" setup>
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import List from '@/draggable/List.vue';
import Tbl from '@/draggable/Tbl.vue';
</script>

<template>
  <Layout>
    <Split name="Draggable">
      <List />
      <Tbl />
    </Split>
  </Layout>
</template>
