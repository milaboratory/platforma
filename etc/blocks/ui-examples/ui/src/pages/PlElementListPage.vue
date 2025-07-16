<script lang="ts" setup>
import { PlBlockPage, PlElementList } from '@platforma-sdk/ui-vue';
import { ref, toRaw, watch } from 'vue';
import { randomRangeInt, range } from '@milaboratories/helpers';

type Item = {
  id: number;
  label: string;
  description?: string;

  active: boolean;
  draggable: boolean;
  removable: boolean;
  expandable: boolean;
  expanded: boolean;
  pinnable: boolean;
  pinned: boolean;
  toggable: boolean;
  toggled: boolean;
};
const description = 'Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry\'s standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum';

function generateList(): Item[] {
  return [...range(1, 10)].map((i) => {
    return ({
      id: i,
      label: `Item ${i};` + (Math.random() > 0.8 ? description : ''),
      description: description.substring(0, randomRangeInt(100, description.length)),

      active: i % 2 === 0,
      draggable: i % 3 === 0,
      removable: i % 4 === 0,
      expandable: true,
      expanded: false,
      pinnable: true,
      pinned: false,
      toggable: true,
      toggled: false,
    });
  });
}

const list = ref(generateList());
const getKey = (v: { id: number }) => v.id;
const updateDescription = (item: Item) => {
  item.description = description.substring(0, randomRangeInt(100, description.length));
};

watch(list, () => {
  console.log('list changed', toRaw(list.value));
}, { deep: true });

const isActiveItem = (item: Item) => item.active;
const isDraggableItem = (item: Item) => item.draggable;
const onSortItems = (from: number, to: number) => {
  console.log('onSort', from, to);
  if (enabledManualControl.value) {
    const array = list.value;
    const element = array.splice(from, 1)[0];
    array.splice(to, 0, element);
    return false;
  }
  return enabledSorting.value;
};
const isRemovableItem = (item: Item) => item.removable;
const onRemoveItem = (item: Item, index: number) => {
  if (enabledManualControl.value) {
    list.value = list.value.filter((_, i) => i !== index) as Item[];
    return false;
  }
};
const isExpandableItem = (item: Item) => item.expandable;
const isExpandedItem = (item: Item) => item.expanded;
const onExpandItem = (item: Item) => {
  item.expanded = !item.expanded;
};
const isToggableItem = (item: Item) => item.toggable;
const isToggledItem = (item: Item) => item.toggled;
const onToggleItem = (item: Item) => {
  item.toggled = !item.toggled;
};
const isPinnableItem = (item: Item) => item.pinnable;
const isPinnedItem = (item: Item) => item.pinned;
const onPinItem = (item: Item) => {
  item.pinned = !item.pinned;
};

const enabledDebug = ref(true);
const enabledSorting = ref(true);
const enabledDragging = ref(true);
const enabledExpanding = ref(true);
const enabledRemoving = ref(true);
const enabledPinning = ref(true);
const enabledToggling = ref(true);
const enabledManualControl = ref(false);

const handleReset = () => {
  list.value = generateList();
};

const handleShuffle = () => {
  list.value = [...list.value].sort(() => Math.random() - 0.5);
};

</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>PlElementList</template>
    <template #append>
      <div :class="$style.buttons">
        <button :class="$style.button" @click="enabledDebug = !enabledDebug">Debug</button>
        <button :class="$style.button" @click="handleReset">Reset</button>
        <button :class="$style.button" @click="handleShuffle">Shuffle</button>
        <button :class="$style.button" @click="enabledSorting = !enabledSorting">
          {{ enabledSorting ? 'Enabled' : 'Disabled' }} sorting
        </button>
        <button :class="$style.button" @click="enabledDragging = !enabledDragging">
          {{ enabledDragging ? 'Enabled' : 'Disabled' }} dragging
        </button>
        <button :class="$style.button" @click="enabledExpanding = !enabledExpanding">
          {{ enabledExpanding ? 'Enabled' : 'Disabled' }} expanding
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
        <button :class="$style.button" @click="enabledManualControl = !enabledManualControl">
          {{ enabledManualControl ? 'Enabled' : 'Disabled' }} manual control
        </button>
      </div>
    </template>
    <div v-if="enabledDebug">
      <h4>Reference</h4>
      <div>
        <div v-for="(item) in list" :key="getKey(item)">
          {{ item.id }}
          {{ item.pinned ? 'pinned' : '' }}
          {{ item.toggled ? 'toggled' : '' }}
          {{ item.expanded ? 'expanded' : '' }}
        </div>
      </div>
    </div>

    <h4>All at once</h4>
    <PlElementList
      v-model:items="list"
      :get-item-key="getKey"

      :is-active="isActiveItem"
      :is-draggable="isDraggableItem"
      :on-sort="onSortItems"
      :is-removable="isRemovableItem"
      :on-remove="onRemoveItem"
      :is-expandable="isExpandableItem"
      :is-expanded="isExpandedItem"
      :on-expand="onExpandItem"
      :is-toggable="isToggableItem"
      :is-toggled="isToggledItem"
      :on-toggle="onToggleItem"
      :is-pinnable="isPinnableItem"
      :is-pinned="isPinnedItem"
      :on-pin="onPinItem"

      :disableDragging="!enabledDragging"
      :disableRemoving="!enabledRemoving"
      :disableToggling="!enabledToggling"
      :disablePinning="!enabledPinning"
    >
      <template #item-title="{ item }">
        <strong>{{ item.label }}</strong>
      </template>
      <template #item-content="{ item }">
        <p>{{ item.description }}</p>
        <button @click="updateDescription(item)">Update description</button>
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
