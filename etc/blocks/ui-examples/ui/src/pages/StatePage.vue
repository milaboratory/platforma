<script setup lang="ts">
import { PlBlockPage, PlTextField, PlBtnPrimary, PlRow, PlIcon16 } from "@platforma-sdk/ui-vue";
import { useApp } from "../app";
import { onMounted, watch, ref } from "vue";
import { isJsonEqual, uniqueId } from "@milaboratories/helpers";

const app = useApp();

onMounted(() => {
  if (app.model.ui.datasets === undefined) {
    app.model.ui.datasets = [];
  }
});

const addDataset = () => {
  app.model.ui.datasets.push({ id: uniqueId(), label: "New" });
};

const removeDataset = (id: string) => {
  app.model.ui.datasets = app.model.ui.datasets.filter((d) => d.id !== id);
};

const datasetsChangesCount = ref(0);

const isDatasetsEqual = ref(true);

watch(app.model.ui.datasets, (datasets, oldDatasets) => {
  datasetsChangesCount.value++;
  console.log(datasets, oldDatasets);
  isDatasetsEqual.value = isJsonEqual(datasets, oldDatasets);
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>State page</template>
    <PlRow>{{ datasetsChangesCount }} {{ isDatasetsEqual }}</PlRow>
    <PlRow wrap>
      <div v-for="dataset in app.model.ui.datasets" :key="dataset.id" :class="$style.dataset">
        <PlTextField v-model="dataset.label" label="Label" />
        <PlIcon16 name="close" @click="removeDataset(dataset.id)" />
      </div>
    </PlRow>
    <PlRow>
      <PlBtnPrimary @click="addDataset">Add</PlBtnPrimary>
    </PlRow>
  </PlBlockPage>
</template>

<style module>
.dataset {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
