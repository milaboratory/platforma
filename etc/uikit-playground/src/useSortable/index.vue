<script lang="ts" setup>
import { reactive, ref } from 'vue';
import Layout from '@/Layout.vue';
import { utils } from '@milaboratories/helpers';
import { PlToggleSwitch, useSortable } from '@milaboratories/uikit';

const data = reactive({
  show: true,
  items1: Array.from(utils.range(0, 10)).map((id) => ({
    id,
    label: `Option ${id}`,
  })),
  items2: Array.from(utils.range(0, 10)).map((id) => ({
    id,
    label: `Item ${id}`,
  })),
});

const list1Ref = ref();

useSortable(list1Ref, {
  onChange(indices) {
    data.items1 = indices.map((idx) => data.items1[idx]);
  },
});

const list2Ref = ref();

useSortable(list2Ref, {
  handle: 'button',
  onChange(indices) {
    data.items2 = indices.map((idx) => data.items2[idx]);
  },
  reorderDelay: 1000,
});
</script>

<template>
  <Layout>
    <div>
      <PlToggleSwitch v-model="data.show" label="Show/hide" />
    </div>
    <div>items1: {{ data.items1.map((it) => it.id).join(',') }}</div>
    <div>items2: {{ data.items2.map((it) => it.id).join(',') }}</div>
    <div v-if="data.show" class="block">
      <div ref="list1Ref" class="test-list">
        <div v-for="(it, i) in data.items1" :key="i" class="test-list__item">{{ it.label }}</div>
      </div>
      <div ref="list2Ref" class="test-list">
        <div v-for="(it, i) in data.items2" :key="i" class="test-list__item">
          {{ it.label }}
          <button>Handle1</button>
        </div>
      </div>
    </div>
  </Layout>
</template>

<style lang="scss" scoped>
.block {
  background-color: #fff;
  padding: 12px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  .test-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    &__item {
      display: flex;
      align-items: center;
      min-height: 32px;
      padding: 0 24px;
      min-width: 240px;
      border: 1px solid var(--txt-01);
      background-color: #ddd;
      button {
        margin-left: auto;
      }
      user-select: none;
    }
  }
}
</style>
