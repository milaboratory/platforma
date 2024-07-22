<script setup lang="ts">
import '@/lib/assets/add-graph.scss';
import { type ComponentPublicInstance, onMounted, ref } from 'vue';
import AddGraphItem from '@/lib/components/AddGraphItem.vue';
import { requestTick } from '@/lib/helpers/utils';
import BtnGhost from '@/lib/components/BtnGhost.vue';

type Data = { group: string; items: { image: string; title: string; id: string }[] }[];
const props = defineProps<{ items: Data }>();
defineEmits<{
  (e: 'selected', id: string): void;
  (e: 'close'): void;
}>();
const activeGroup = ref(props.items[0].group);
const rightPanel = ref<HTMLElement>();
const items = ref<ComponentPublicInstance[]>([]);
let disableScrollListener = false;

function showItemsForSelectedGroup(group: string) {
  activeGroup.value = group;
  const item = document.querySelector(`[data-graph-group="${group}"]`);
  if (item) {
    console.log(item);
    item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }
  disableScrollListener = true;
  setTimeout(() => (disableScrollListener = false), 1000);
}

onMounted(() => {
  if (rightPanel.value) {
    const handler = requestTick(() => {
      if (disableScrollListener) {
        return;
      }
      items.value.forEach((el) => {
        const rp = rightPanel.value as HTMLElement;
        const rectRp = rp.getBoundingClientRect();
        const rect = (el.$el as HTMLElement).getBoundingClientRect();
        let delta = 80;
        if (rp.scrollHeight - (rp.scrollTop + rectRp.height) < rectRp.height / 2) {
          delta = rectRp.height - 80;
        }
        if (rect.top - rectRp.top < delta) {
          activeGroup.value = (el.$el as HTMLElement).dataset['graphGroup'] as string;
        }
      });
    });
    rightPanel.value.addEventListener('scroll', () => {
      handler();
    });
  }
});
</script>
<template>
  <div class="add-graph">
    <btn-ghost icon="close" size="medium" @click="$emit('close')" />
    <div class="add-graph__title">Add Graph</div>
    <div class="add-graph__wrapper">
      <div class="add-graph__left">
        <div
          v-for="(item, index) in props.items"
          :key="index"
          :class="item.group == activeGroup ? ' add-graph__group-item-active' : ''"
          class="add-graph__group-item"
          @click="showItemsForSelectedGroup(item.group)"
        >
          {{ item.group }}
        </div>

        <div class="add-graph__divider"></div>
        <div class="add-graph__btm-info">Choose a template</div>
      </div>
      <div ref="rightPanel" class="add-graph__right">
        <template v-for="(groupItem, idx) in props.items" :key="idx">
          <AddGraphItem
            v-for="(item, index) in groupItem.items"
            ref="items"
            :key="index"
            :item="item"
            :group="groupItem.group"
            @selected="$emit('selected', $event)"
          />
        </template>
      </div>
    </div>
  </div>
</template>
