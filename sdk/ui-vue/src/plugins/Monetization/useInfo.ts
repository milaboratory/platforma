import { computed, watch, ref } from 'vue';
import { useSdkPlugin } from '../../defineApp';
import { Response } from './validation';
import { useIntervalFn } from '@vueuse/core';

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

  const status = computed(() => result.value?.status);

  watch(canRun, (v) => {
    if (hasMonetization.value) {
      (app.value?.model.args as Record<string, unknown>)['__mnzCanRun'] = v;
    }
  });

  if (hasMonetization.value) {
    useIntervalFn(() => {
      (app.value?.model.args as Record<string, unknown>)['__mnzDate'] = new Date().toISOString();
    }, 60_000); // 1 minute
  }

  return {
    hasMonetization,
    result,
    error,
    canRun,
    status,
  };
}
