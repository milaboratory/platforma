<script setup lang="ts">
import { PlAdvancedFilter, PlBlockPage, PlCheckbox } from '@platforma-sdk/ui-vue';
import { ref } from 'vue';

const columnsIdList = ['1', '2', '3'];
const info = {
  1: { error: false, label: 'Column1', type: 'Int' as const },
  2: { error: false, label: 'Column2', type: 'String' as const },
  3: { error: false, label: 'Column2', type: 'Double' as const },
};
const dndMode = ref(false);
const draggedId = ref<string | undefined>();
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <div>
      <PlCheckbox v-model="dndMode" >DnD mode</PlCheckbox>
    </div>
    <div :style="{display: 'flex'}">
      <div v-if="dndMode" class="d-flex flex-column gap-16" :style="{width: '280px', padding: '10px', margin: '10px', border: 'grey 1px solid'}" >
        <div
          v-for="id in columnsIdList"
          :key="id"
          :draggable="dndMode ? 'true' : undefined"
          :style="{background: '#fff', border: '1px solid black', borderRadius: '6px', padding: '6px'}"
          @dragstart="() => draggedId = id"
          @dragend="() => draggedId = undefined"
        >
          {{ id }}
        </div>
      </div>
      <div class="d-flex flex-column gap-16" :style="{width: '280px'}">
        <PlAdvancedFilter :info="info" :source-ids="columnsIdList" :dnd-mode="dndMode" :dragged-id="draggedId"/>
      </div>
    </div>
  </PlBlockPage>
</template>
