<script lang="ts" setup>
import { PlBlockPage, PlElementList } from '@platforma-sdk/ui-vue';
import { computed, ref, shallowRef } from 'vue';
import { randomRangeInt, range } from '@milaboratories/helpers';

type Item = { id: number, label: string, description?: string };
const description = 'Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry\'s standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum';

function generateList(): Item[] {
  return [...range(1, 10)].map((i) => ({
    id: i,
    label: `Item ${ i };` + (Math.random() > 0.8 ? description : ''),
    description: description.substring(0, randomRangeInt(100, description.length))
  }));
}

const list = shallowRef(generateList());
const draggableItems = computed(() => new Set(list.value.slice(2, 5)));
const removableItems = computed(() => new Set(list.value.slice(4, 8)));
const getKey = (v: { id: number }) => v.id;
const pinnedSet = ref(new Set<Item>());
const pinnableSet = computed(() => new Set(list.value.slice(3, 7)));
const toggledSet = ref(new Set<Item>());
const toggableSet = computed(() => new Set(list.value.slice(1, 5)));

const enabledSorting = ref(true);
const enabledDragging = ref(true);
const enabledRemoving = ref(true);
const enabledPinning = ref(true);
const enabledToggling = ref(true);

const handleReset = () => {
  list.value = generateList();
  pinnedSet.value = new Set<Item>();
  toggledSet.value = new Set<Item>();
};

const handleShuffle = () => {
  list.value = [...list.value].sort(() => Math.random() - 0.5);
};

const handleSort = (sorted: Item[], _from: number, _to: number) => {
  return enabledSorting.value;
};

const handleManualSort = (sorted: Item[], _from: number, _to: number) => {
  list.value = sorted;
  return false;
};
const handleManualRemove = (item: Item, index: number) => {
  list.value = list.value.filter((_, i) => i !== index) as Item[];
  return false;
};

</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>PlElementList</template>
    <template #append>
      <div :class="$style.buttons">
        <button :class="$style.button" @click="handleReset">Reset</button>
        <button :class="$style.button" @click="handleShuffle">Shuffle</button>
        <button :class="$style.button" @click="enabledSorting = !enabledSorting">
          {{ enabledSorting ? 'Enabled' : 'Disabled' }} sorting
        </button>
        <button :class="$style.button" @click="enabledDragging = !enabledDragging">
          {{ enabledDragging ? 'Enabled' : 'Disabled' }} dragging
        </button>
        <button :class="$style.button" @click="enabledRemoving = !enabledRemoving">
          {{ enabledRemoving ? 'Enabled' : 'Disabled' }} removing
        </button>
        <button :class="$style.button" @click="enabledPinning = !enabledPinning">
          {{ enabledPinning ? 'Enabled' : 'Disabled' }} pinning
        </button>
        <button :class="$style.button" @click="enabledToggling = !enabledToggling">
          {{ enabledToggling ? 'Enabled' : 'Disabled' }} toggling
        </button>
      </div>
    </template>

    <h4>All at once</h4>
    <PlElementList
        :enableDragging="enabledDragging"
        :enableRemoving="enabledRemoving"
        :enableToggling="enabledToggling"
        :enablePinning="enabledPinning"
        :getItemKey="getKey"
        v-model:items="list"
        v-model:pinnedItems="pinnedSet"
        v-model:toggledItems="toggledSet"
        :onSort="handleManualSort"
        :onRemove="handleManualRemove"
    >
      <template #item-title="{ item }">
        <strong>{{ item.label }}</strong>
      </template>
      <template #item-content="{ item }">
        <p>{{ item.description }}</p>
      </template>
    </PlElementList>

    <h4>Dragging</h4>
    <PlElementList
        v-model:items="list"
        :enableDragging="enabledDragging"
        :getItemKey="getKey"
        :onSort="handleSort">
      <template #item-title="{ item }">
        <strong>{{ item.label }}</strong>
      </template>
      <template #item-content="{ item }">
        <p v-if="item.description !== undefined">{{ item.description }}</p>
      </template>
    </PlElementList>

    <h4>Dragging + removing</h4>
    <PlElementList
        v-model:items="list"
        :enableDragging="enabledDragging"
        :enableRemoving="enabledRemoving"
        :getItemKey="getKey"
        :onSort="handleSort">
      <template #item-title="{ item }">
        <strong>{{ item.label }}</strong>
      </template>
      <template #item-content="{ item }">
        <p v-if="item.description !== undefined">{{ item.description }}</p>
      </template>
    </PlElementList>

    <h4>Dragging + removing + partial disabling</h4>
    <PlElementList
        :enableDragging="enabledDragging"
        :enableRemoving="enabledRemoving"
        v-model:items="list"
        :getItemKey="getKey"
        v-model:draggableItems="draggableItems"
        v-model:removableItems="removableItems"
    >
      <template #item-title="{ item }">
        <strong>{{ item.label }}</strong>
      </template>
      <template #item-content="{ item }">
        <p v-if="item.description !== undefined">{{ item.description }}</p>
      </template>
    </PlElementList>

    <h4>Pinning</h4>
    <PlElementList
        :enableDragging="enabledDragging"
        :enableRemoving="enabledRemoving"
        :enablePinning="enabledPinning"
        v-model:items="list"
        v-model:pinnedItems="pinnedSet"
        :getItemKey="getKey"
    >
      <template #item-title="{ item }">
        <strong>{{ item.label }}</strong>
      </template>
      <template #item-content="{ item }">
        <p v-if="item.description !== undefined">{{ item.description }}</p>
      </template>
    </PlElementList>

    <h4>Partial pinning</h4>
    <PlElementList
        :enableDragging="enabledDragging"
        :enablePinning="enabledPinning"
        v-model:items="list"
        v-model:pinnedItems="pinnedSet"
        v-model:pinnableItems="pinnableSet"
        :getItemKey="getKey"
    >
      <template #item-title="{ item }">
        <strong>{{ item.label }}</strong>
      </template>
      <template #item-content="{ item }">
        <p v-if="item.description !== undefined">{{ item.description }}</p>
      </template>
    </PlElementList>

    <h4>Toggable</h4>
    <PlElementList
        :enableDragging="enabledDragging"
        :enableToggling="enabledToggling"
        v-model:items="list"
        v-model:toggledItems="toggledSet"
        :getItemKey="getKey"
    >
      <template #item-title="{ item }">
        <strong>{{ item.label }}</strong>
      </template>
      <template #item-content="{ item }">
        <p v-if="item.description !== undefined">{{ item.description }}</p>
      </template>
    </PlElementList>

    <h4>Partial Toggable</h4>
    <PlElementList
        :enableDragging="enabledDragging"
        :enableToggling="enabledToggling"
        v-model:items="list"
        v-model:toggledItems="toggledSet"
        v-model:toggableItems="toggableSet"
        :getItemKey="getKey"
    >
      <template #item-title="{ item }">
        <strong>{{ item.label }}</strong>
      </template>
      <template #item-content="{ item }">
        <p v-if="item.description !== undefined">{{ item.description }}</p>
      </template>
    </PlElementList>

    <h4>Manual controlled</h4>
    <PlElementList
        :enableDragging="enabledDragging"
        :enableRemoving="enabledRemoving"
        :enableToggling="enabledToggling"
        :enablePinning="enabledPinning"
        :getItemKey="getKey"
        v-model:items="list"
        v-model:toggledItems="toggledSet"
        v-model:toggableItems="toggableSet"
        v-model:pinnedItems="pinnedSet"
        v-model:pinnableItems="pinnableSet"
        :onRemove="handleManualRemove"
        :onSort="handleManualSort"
    >
      <template #item-title="{ item }">
        <strong>{{ item.label }}</strong>
      </template>
      <template #item-content="{ item }">
        <p v-if="item.description !== undefined">{{ item.description }}</p>
      </template>
    </PlElementList>
  </PlBlockPage>
</template>

<style module>
.buttons {
  position: sticky;
  display: flex;
  flex-direction: row;
  gap: 10px;
}

.button {
  display: flex;
}
</style>