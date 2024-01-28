<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import BaseElement from '@/demo/test/BaseElement.vue';
import PrimaryElement from '@/demo/test/PrimaryElement.vue';
import { useLocalStorage } from '@/lib/composition/useLocalStorage';
import BtnPrimary from '@/lib/components/BtnPrimary.vue';
import BtnSecondary from '@/lib/components/BtnSecondary.vue';
import Process from '@/demo/test2/Process.vue';

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
