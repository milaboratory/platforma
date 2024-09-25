<script lang="ts" setup>
import Layout from '@/Layout.vue';
import BaseElement from '@/test/BaseElement.vue';
import PrimaryElement from '@/test/PrimaryElement.vue';
import { useLocalStorage, PlBtnPrimary, PlBtnSecondary } from '@milaboratories/uikit';
import Process from '@/test2/Process.vue';

const theme = useLocalStorage('theme');

const theme1 = useLocalStorage('theme');
</script>

<template>
  <Layout>
    <div class="block">
      <BaseElement :id="1000" name="my name" type="primary" />
    </div>
    <div class="block">
      <PrimaryElement :id="1000" name="my name" />
    </div>
    <div class="block">
      <PlBtnSecondary @click="theme = 'light'">Light</PlBtnSecondary>
      <PlBtnPrimary @click="theme = 'dark'">Dark</PlBtnPrimary>
      theme: {{ theme }} theme1: {{ theme1 }}
    </div>
    <div class="block">
      <Process />
    </div>
  </Layout>
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
