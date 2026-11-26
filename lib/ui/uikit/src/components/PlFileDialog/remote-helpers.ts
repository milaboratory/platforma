import type { Ref } from "vue";
import type { FileDialogItem } from "./utils";
import { computed } from "vue";

export function useVisibleItems(
  items: Ref<readonly FileDialogItem[]>,
  showHiddenItems: Ref<boolean>,
  search: Ref<string>,
) {
  return computed(() => {
    let visible = items.value;

    if (!showHiddenItems.value) {
      visible = visible.filter((it) => !it.name.startsWith("."));
    }

    if (search.value) {
      const query = search.value.toLocaleLowerCase();
      visible = visible.filter((it) => it.name.toLocaleLowerCase().includes(query));
    }

    return visible;
  });
}

export const vTextOverflown = {
  mounted: (el: HTMLElement) => {
    if (el.clientWidth < el.scrollWidth) {
      const s = el.innerText;
      el.innerText = s.substring(0, 57) + "..." + s.substring(s.length - 10);
    }
  },
};
