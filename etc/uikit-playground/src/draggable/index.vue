<script lang="ts" setup>
import Layout from "../Layout.vue";
import Split from "../Split.vue";
import List from "./List.vue";
import Tbl from "./Tbl.vue";
</script>

<template>
  <Layout>
    <Split name="Draggable">
      <List />
      <Tbl />
    </Split>
  </Layout>
</template>
