<script lang="ts" setup>
import {ref} from 'vue';
import Layout from '@/demo/Layout.vue';
import { GridTable, GridTableSettings } from '@/lib';

const settings: GridTableSettings = {
  columns: [{
    text: 'X',
    name: 'x',
    width: '100px'
  }, {
    text: 'Y',
    name: 'y',
  }],
  rows: [{x: 1, y: 2}, {x: 100, y: 100}]
};
</script>

<template>
  <layout>
    <grid-table :settings="settings"/>
  </layout>
</template>

<style lang="scss">
// 
</style>
