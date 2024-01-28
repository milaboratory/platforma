<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import Split from '@/demo/Split.vue';
import List from '@/demo/draggable/List.vue';
import Tbl from '@/demo/draggable/Tbl.vue';
</script>

<template>
  <layout>
    <split name="Draggable">
      <list />
      <tbl />
    </split>
  </layout>
</template>
