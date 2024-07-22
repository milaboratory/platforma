import { computed, onMounted, onUnmounted, ref, unref, watch } from 'vue';
import { mapIterable, toList } from '@/lib/helpers/iterators';
import { useLocalStorage } from '@/lib/composition/useLocalStorage';

type Theme = 'light' | 'dark';

type Callback = (mode: Theme) => void;

const cm = new Set<Callback>();

window.matchMedia &&
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    toList(mapIterable(cm.values(), (cb) => cb(e.matches ? 'dark' : 'light')));
  });

const init = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const browserTheme = ref<Theme>(init);
const savedTheme = useLocalStorage<Theme>('theme');

export function useTheme(_cb?: Callback) {
  const theme = computed<Theme>(() => {
    return savedTheme.value ? savedTheme.value : browserTheme.value;
  });

  const cb = (theme: Theme) => {
    browserTheme.value = theme;
    _cb && _cb(theme);
  };

  function toggleTheme() {
    savedTheme.value = theme.value === 'light' ? 'dark' : theme.value === 'dark' ? 'light' : 'light';
  }

  watch(theme, (v) => {
    _cb && _cb(unref(v));
  });

  onMounted(() => {
    cm.add(cb);
  });

  onUnmounted(() => {
    cm.delete(cb);
  });

  return [theme, toggleTheme] as const;
}
