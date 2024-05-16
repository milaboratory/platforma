<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import ManageTest from './ManageModal/index.vue';
</script>

<template>
  <layout>
    <split name="Block layout" :hide-second="true">
      <ManageTest />
    </split>
  </layout>
</template>
