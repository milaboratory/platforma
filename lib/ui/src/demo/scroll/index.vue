<script lang="ts" setup>
import Layout from '../Layout.vue';
import Split from '@/demo/Split.vue';
import DomScroll from '@/demo/scroll/CustomScroll.vue';
import NativeScroll from '@/demo/scroll/NativeScroll.vue';
</script>

<template>
  <layout>
    <split name="Scrolls">
      <dom-scroll/>
      <native-scroll/>
    </split>
  </layout>
</template>
