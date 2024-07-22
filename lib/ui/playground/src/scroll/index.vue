<script lang="ts" setup>
import Layout from '../Layout.vue';
import Split from '@/Split.vue';
import DomScroll from '@/scroll/CustomScroll.vue';
import NativeScroll from '@/scroll/NativeScroll.vue';
</script>

<template>
  <layout>
    <split name="Scrolls">
      <dom-scroll />
      <native-scroll />
    </split>
  </layout>
</template>
