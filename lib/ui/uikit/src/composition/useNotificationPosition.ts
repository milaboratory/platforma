import { type Ref, ref } from 'vue';
import { call } from '../helpers/utils';
import { useElementPosition } from './usePosition';

export function useNotificationPosition(el: Ref<HTMLElement | undefined>) {
  const style = ref('');

  useElementPosition(el, (pos) => {
    style.value = call(() => {
      return `left: ${pos.offsetX + pos.width - 320}px; bottom: ${pos.scrollHeight - pos.offsetY + 10}px;`;
    });
  });

  return style;
}
