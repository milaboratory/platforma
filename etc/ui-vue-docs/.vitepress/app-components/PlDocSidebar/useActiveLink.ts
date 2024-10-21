import { useData } from 'vitepress';
import { computed, ref } from 'vue';

export function useActiveLink() {
  const data = useData();
  return computed(() => {
    const path = ref('');
    if (data.page.value.relativePath === 'index.md') {
      return (path.value = '/');
    } else {
      const arr = data.page.value.relativePath.split('.');
      path.value = arr[0];
    }
    return path.value;
  });
}
