import { nextTick, onMounted, onUpdated, ref } from 'vue';
import { PlBlockPageTitleTeleportId } from './PlBlockPageTitleTeleportId';

const selector = '#' + PlBlockPageTitleTeleportId;

export function usePlBlockPageTitleTeleportTarget(componentName: string) {
  const target = ref<string>();

  const check = () => {
    nextTick(() => {
      target.value = document.querySelector(selector) ? selector : undefined;
      if (!target.value) {
        console.error(
          `[${componentName}] Error: 'PlBlockPage' component is missing. 
          Ensure that you placed the components inside <PlBlockPage />.`,
        );
      }
    });
  };

  onMounted(check);
  onUpdated(check);

  return target;
}
