import { nextTick, onMounted, onUpdated } from 'vue';
import { PlBlockPageTitleTeleportTarget } from './PlBlockPageTitleTeleportTarget';

export function usePlBlockPageTitleTeleportTarget(componentName: string) {
  const check = () => {
    nextTick(() => {
      if (!PlBlockPageTitleTeleportTarget.value) {
        console.error(
          `[${componentName}] Error: Either 'PlBlockPage' component is missing or it has no title. 
          Ensure that you placed the components inside <PlBlockPage /> with a title.`,
        );
      }
    });
  };

  onMounted(check);
  onUpdated(check);

  return PlBlockPageTitleTeleportTarget;
}
