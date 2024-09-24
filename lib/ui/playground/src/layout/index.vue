<script lang="ts" setup>
import Layout from '@/Layout.vue';
import { PlBlockPage, PlBtnGroup, PlDropdown, PlRow, PlTextField, PlGrid, PlContainer, PlBtnGhost } from '@milaboratory/platforma-uikit.lib';
import { reactive } from 'vue';

const data = reactive({
  str: '',
  tab: 1,
});
</script>

<template>
  <Layout>
    <div v-if="false" class="example-frame">
      <PlBlockPage>
        <template #title> Block title </template>
        <template #append>
          <PlBtnGhost :icon="'add'">Click me</PlBtnGhost>
        </template>
        <h3>Hi man</h3>
        <PlTextField v-model="data.str" label="Input label" />
        <PlTextField v-model="data.str" label="Input label" />
        <PlRow align-center wrap>
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
          <PlDropdown v-model="data.str" label="Dropdown" :options="[]" />
          <PlBtnGroup
            v-model="data.tab"
            :options="[
              { text: 'One', value: 1 },
              { text: 'Two', value: 2 },
              { text: 'Three', value: 3 },
            ]"
          />
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
        </PlRow>
        <PlGrid :columns="2">
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
          <PlTextField v-model="data.str" label="Input label" />
        </PlGrid>
        <PlGrid :columns="2">
          <PlContainer width="400px" style="border: 1px solid red">
            <span>First item</span>
            <span>Second item</span>
          </PlContainer>
          <PlContainer>Second container</PlContainer>
        </PlGrid>
      </PlBlockPage>
    </div>
    <div class="example-frame" style="height: 600px">
      <PlBlockPage>
        <div>111</div>
        <div>222</div>
      </PlBlockPage>
    </div>
  </Layout>
</template>

<style lang="scss">
.example-frame {
  border: 1px solid #333;

  .pl-block-page__body {
    background-color: #eee;
  }
}
</style>
