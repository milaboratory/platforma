<script lang="ts" setup>
import Layout from '@/Layout.vue';
import BaseElement from '@/test/BaseElement.vue';
import PrimaryElement from '@/test/PrimaryElement.vue';
import { useLocalStorage, BtnPrimary, BtnSecondary } from '@milaboratory/platforma-uikit.lib';
import Process from '@/test2/Process.vue';

const theme = useLocalStorage('theme');

const theme1 = useLocalStorage('theme');
</script>

<template>
  <layout>
    <div class="block">
      <BaseElement :id="1000" name="my name" type="primary" />
    </div>
    <div class="block">
      <PrimaryElement :id="1000" name="my name" />
    </div>
    <div class="block">
      <btn-secondary @click="theme = 'light'">Light</btn-secondary>
      <btn-primary @click="theme = 'dark'">Dark</btn-primary>
      theme: {{ theme }} theme1: {{ theme1 }}
    </div>
    <div class="block">
      <process />
    </div>
  </layout>
</template>

<style lang="scss">
.block {
  background-color: #fff;
  padding: 12px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 24px;
  .shadow {
    background-color: green;
  }
}
</style>
