<script lang="ts" setup>
import { reactive } from 'vue';
import Layout from '@/Layout.vue';
import {
  PlBtnPrimary,
  PlBtnSecondary,
  PlBtnAccent,
  PlBtnGroup,
  PlBtnLink,
  PlBtnGhost,
  type Size,
  maskIcons16,
} from '@milaboratory/platforma-uikit.lib';
import Split from '@/Split.vue';

const props = reactive({
  size: 'medium' as Size,
  disabled: false,
  reverse: false,
  loading: false,
  justifyCenter: false,
});

const sizeOptions = ['small', 'medium', 'large'].map((it) => ({ text: it, value: it }));

const text = 'Click me';

function onClick() {
  alert('Click');
}
</script>

<template>
  <Layout>
    <Split name="Buttons">
      <div class="flex-row gap-12">
        <PlBtnGroup v-model="props.size" :options="sizeOptions" />
        <label style="user-select: none"> <input v-model="props.disabled" type="checkbox" />Disabled </label>
        <label style="user-select: none"> <input v-model="props.reverse" type="checkbox" />Reverse </label>
        <label style="user-select: none"> <input v-model="props.loading" type="checkbox" />Loading </label>
        <label style="user-select: none"> <input v-model="props.justifyCenter" type="checkbox" />Justify center </label>
      </div>
      <div class="test-buttons">
        <div>
          <PlBtnAccent v-bind="props">{{ text }}</PlBtnAccent>
          <PlBtnAccent icon="add" v-bind="props">{{ text }}</PlBtnAccent>
          <PlBtnAccent round icon="add" v-bind="props">{{ text }}</PlBtnAccent>
        </div>
        <div>
          <PlBtnPrimary v-bind="props">{{ text }}</PlBtnPrimary>
          <PlBtnPrimary icon="play" v-bind="props">{{ text }}</PlBtnPrimary>
          <PlBtnPrimary round icon="add" v-bind="props" @click="onClick">{{ text }}</PlBtnPrimary>
        </div>
        <div>
          <PlBtnSecondary v-bind="props">{{ text }}</PlBtnSecondary>
          <PlBtnSecondary icon="add" v-bind="props">{{ text }}</PlBtnSecondary>
          <PlBtnSecondary round icon="add" v-bind="props">{{ text }}</PlBtnSecondary>
        </div>
        <div>
          <PlBtnLink icon="arrow-right" v-bind="props">{{ text }}</PlBtnLink>
          <PlBtnLink icon="add" v-bind="props">{{ text }}</PlBtnLink>
          <PlBtnLink round icon="add" v-bind="props" @click="onClick">{{ text }}</PlBtnLink>
        </div>
        <div>
          <PlBtnGhost style="min-width: 160px" v-bind="props">{{ text }}</PlBtnGhost>
          <PlBtnGhost icon="arrow-right" v-bind="props">{{ text }}</PlBtnGhost>
          <PlBtnGhost icon="add" v-bind="props">{{ text }}</PlBtnGhost>
          <PlBtnGhost icon="clipboard" v-bind="props" />
          <PlBtnGhost icon="import" v-bind="props">Settings</PlBtnGhost>
        </div>
        <div>
          <PlBtnGhost v-for="icon in maskIcons16" :key="icon" :icon="icon">Icon: {{ icon }}</PlBtnGhost>
        </div>
      </div>
    </Split>
  </Layout>
</template>

<style lang="scss">
.test-buttons {
  display: grid;
  grid-template-rows: auto;
  grid-gap: 24px;

  > div {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-gap: 24px;
  }
}
</style>
