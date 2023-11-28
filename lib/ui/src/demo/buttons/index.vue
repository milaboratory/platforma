<script lang="ts" setup>
import {reactive} from 'vue';
import Layout from '@/demo/Layout.vue';
import BtnPrimary from '@/lib/components/BtnPrimary.vue';
import Split from '@/demo/Split.vue';
import BtnSecondary from '@/lib/components/BtnSecondary.vue';
import BtnAccent from '@/lib/components/BtnAccent.vue';
import BtnGroup from '@/lib/components/BtnGroup.vue';
import {Size} from '@/lib/types';
import BtnLink from '@/lib/components/BtnLink.vue';
import BtnGhost from '@/lib/components/BtnGhost.vue';

const props = reactive({
  size: 'medium' as Size,
  disabled: false,
  reverse: false,
  loading: false,
  justifyCenter: false
});

const sizeOptions = ['small', 'medium', 'large'].map(it => ({text: it, value: it}));

const text = 'Click me';

function onClick() {
  alert('Click');
}
</script>

<template>
  <layout>
    <split name="Buttons">
      <div class="flex-row gap-12">
        <btn-group v-model="props.size" :options="sizeOptions"/>
        <label style="user-select: none">
          <input type="checkbox" v-model="props.disabled">Disabled
        </label>
        <label style="user-select: none">
          <input type="checkbox" v-model="props.reverse">Reverse
        </label>
        <label style="user-select: none">
          <input type="checkbox" v-model="props.loading">Loading
        </label>
        <label style="user-select: none">
          <input type="checkbox" v-model="props.justifyCenter">Justify center
        </label>
      </div>
      <div class="test-buttons">
        <div>
          <btn-accent v-bind="props">{{ text }}</btn-accent>
          <btn-accent icon="add" v-bind="props">{{ text }}</btn-accent>
          <btn-accent round icon="add" v-bind="props">{{ text }}</btn-accent>
        </div>
        <div>
          <btn-primary v-bind="props">{{ text }}</btn-primary>
          <btn-primary icon="play" v-bind="props">{{ text }}</btn-primary>
          <btn-primary @click="onClick" round icon="add" v-bind="props">{{ text }}</btn-primary>
        </div>
        <div>
          <btn-secondary v-bind="props">{{ text }}</btn-secondary>
          <btn-secondary icon="add" v-bind="props">{{ text }}</btn-secondary>
          <btn-secondary round icon="add" v-bind="props">{{ text }}</btn-secondary>
        </div>
        <div>
          <btn-link icon="arrow-right" v-bind="props">{{ text }}</btn-link>
          <btn-link icon="add" v-bind="props">{{ text }}</btn-link>
          <btn-link round icon="add" v-bind="props" @click="onClick">{{ text }}</btn-link>
        </div>
        <div>
          <btn-ghost style="min-width: 160px" v-bind="props">{{ text }}</btn-ghost>
          <btn-ghost icon="arrow-right" v-bind="props">{{ text }}</btn-ghost>
          <btn-ghost icon="add" v-bind="props">{{ text }}</btn-ghost>
          <btn-ghost icon="clipboard" v-bind="props"/>
          <btn-ghost icon="settings-2" v-bind="props">Settings</btn-ghost>
        </div>
      </div>
    </split>
  </layout>
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
