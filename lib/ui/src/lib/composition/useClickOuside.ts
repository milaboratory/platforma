import type {Ref} from 'vue';
import {useEventListener} from '@/lib/composition/useEventListener';
import {flatValue} from '@/lib/helpers/functions';

type HtmlRef = Ref<HTMLElement | undefined>;

export function useClickOutside(el: HtmlRef | HtmlRef[] , cb: () => void) {
  useEventListener(document, 'click', (event) => {
    const values = flatValue(el).map(e => e.value).filter(v => !!v) as HTMLElement[];
    if (!values.some(v => v?.contains(event.target as HTMLElement))) {
      cb();
    }
  });
}
