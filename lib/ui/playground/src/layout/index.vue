<script lang="ts" setup>
import Layout from '@/Layout.vue';
import Split from '@/Split.vue';
import ManageTest from './ManageModal/index.vue';
</script>

<template>
  <layout>
    <split name="Block layout" :hide-second="true">
      <ManageTest />
    </split>
  </layout>
</template>
