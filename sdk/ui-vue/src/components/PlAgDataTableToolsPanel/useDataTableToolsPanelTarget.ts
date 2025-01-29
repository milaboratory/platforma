import { nextTick, onMounted, onUpdated, ref } from 'vue';
import { PlAgDataTableToolsPanelId } from './PlAgDataTableToolsPanelId';

const selector = '#' + PlAgDataTableToolsPanelId;

export function useDataTableToolsPanelTarget() {
  const target = ref<string>();

  const check = () => {
    nextTick(() => {
      target.value = document.querySelector(selector) ? selector : undefined;
      if (!target.value) {
        console.error(
          `[PlAgDataTable] Error: 'PlAgDataTableToolsPanel' component is missing. 
          Ensure that you import and place <PlAgDataTableToolsPanel /> somewhere in your layout 
          (e.g., in the block header).`,
        );
      }
    });
  };

  onMounted(check);
  onUpdated(check);

  return target;
}
