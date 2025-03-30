import { computed, watch, ref } from 'vue';
import { useSdkPlugin } from '../../defineApp';
import { Response } from './validation';

export function useInfo() {
  const sdk = useSdkPlugin();

  const app = computed(() => (sdk.loaded ? sdk.useApp() : undefined));

  const hasMonetization = computed(() => '__mnzDate' in (app.value?.model?.args as Record<string, unknown>));

  const mnzInfo = computed(() => Response.safeParse(app.value?.model.outputs['__mnzInfo']));

  const currentInfo = computed<Response | undefined>(() => mnzInfo.value?.data);

  const info = ref<Response | undefined>(undefined);

  const error = computed(() => mnzInfo.value?.error ?? info.value?.response?.error);

  watch([currentInfo], ([i]) => {
    if (i) {
      info.value = i;
    }
  }, { immediate: true });

  const result = computed(() => info.value?.response?.result);

  const canRun = computed(() => !!result.value?.canRun);

  watch(canRun, (v) => {
    if (v) {
      (app.value?.model.args as Record<string, unknown>)['__mnzCanRun'] = v;
    }
  });

  return {
    hasMonetization,
    result,
    error,
    canRun,
  };
}
