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
  maskIcons24
} from '@milaboratories/uikit';
import Split from '@/Split.vue';

const props = reactive({
  size: 'medium' as Size,
  disabled: false,
  reverse: false,
  loading: false,
  justifyCenter: false
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
        <label style="user-select: none">
          <input v-model="props.disabled" type="checkbox" />Disabled
        </label>
        <label style="user-select: none">
          <input v-model="props.reverse" type="checkbox" />Reverse
        </label>
        <label style="user-select: none">
          <input v-model="props.loading" type="checkbox" />Loading
        </label>
        <label style="user-select: none">
          <input v-model="props.justifyCenter" type="checkbox" />Justify center
        </label>
      </div>
      <div class="test-buttons">
        <fieldset>
          <legend>PlBtnAccent</legend>
          <PlBtnAccent v-bind="props">{{ text }}</PlBtnAccent>
          <PlBtnAccent icon="add" v-bind="props">{{ text }}</PlBtnAccent>
          <PlBtnAccent round icon="add" v-bind="props">{{ text }}</PlBtnAccent>
        </fieldset>
        <fieldset>
          <legend>PlBtnPrimary</legend>
          <PlBtnPrimary v-bind="props">{{ text }}</PlBtnPrimary>
          <PlBtnPrimary icon="play" v-bind="props">{{ text }}</PlBtnPrimary>
          <PlBtnPrimary round icon="add" v-bind="props" @click="onClick">{{ text }}</PlBtnPrimary>
        </fieldset>
        <fieldset>
          <legend>PlBtnSecondary</legend>
          <PlBtnSecondary v-bind="props">{{ text }}</PlBtnSecondary>
          <PlBtnSecondary icon="add" v-bind="props">{{ text }}</PlBtnSecondary>
          <PlBtnSecondary round icon="add" v-bind="props">{{ text }} (round)</PlBtnSecondary>
        </fieldset>
        <fieldset>
          <legend>PlBtnLink</legend>
          <PlBtnLink icon="arrow-right" v-bind="props">{{ text }}</PlBtnLink>
          <PlBtnLink icon="add" v-bind="props">{{ text }}</PlBtnLink>
          <PlBtnLink round icon="add" v-bind="props" @click="onClick">{{ text }}</PlBtnLink>
        </fieldset>
        <fieldset>
          <legend>PlBtnGhost</legend>
          <PlBtnGhost style="min-width: 160px" v-bind="props">{{ text }}</PlBtnGhost>
          <PlBtnGhost icon="arrow-right" v-bind="props">{{ text }}</PlBtnGhost>
          <PlBtnGhost icon="add" v-bind="props">{{ text }}</PlBtnGhost>
          <PlBtnGhost icon="clipboard" v-bind="props" />
          <PlBtnGhost icon="settings" v-bind="props">Settings</PlBtnGhost>
        </fieldset>
        <fieldset>
          <legend>PlBtnGhost with all the icons</legend>
          <PlBtnGhost v-for="icon in maskIcons24" :size="props.size" :key="icon" :icon="icon"
            >(24x24): {{ icon }}</PlBtnGhost
          >
        </fieldset>
      </div>
    </Split>
  </Layout>
</template>

<style lang="scss">
.test-buttons {
  display: grid;
  grid-template-rows: auto;
  grid-gap: 24px;

  > div,
  fieldset {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-gap: 24px;
  }
}
</style>
