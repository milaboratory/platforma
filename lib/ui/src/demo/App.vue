<script setup lang="ts">
import './assets/style.scss';
import DevLayout from './DevLayout.vue';
import GridTable from '@/lib/components/GridTable/index.vue';
import {Settings} from '@/lib/components/GridTable/types.ts';

const settings: Settings = {
  columns: [{text: 'A', name: 'a'}, {text: 'B', name: 'b'}],
  rows: [{a: 12, b: 13}, {a: 'aa', b: 'bb'}]
};
</script>

<template>
  <dev-layout>
    <grid-table :settings="settings"/>
  </dev-layout>
</template>
