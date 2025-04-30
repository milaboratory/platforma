import { computed, watch, ref } from 'vue';
import { useSdkPlugin } from '../../defineApp';
import { Response } from './validation';
import { useIntervalFn } from '@vueuse/core';

export function useInfo() {
  const sdk = useSdkPlugin();

  const app = computed(() => (sdk.loaded ? sdk.useApp() : undefined));

  const hasMonetization = computed(() => '__mnzDate' in (app.value?.model?.args as Record<string, unknown>));

  const parsed = computed(() => Response.safeParse(app.value?.model.outputs['__mnzInfo']));

  const currentInfo = computed<Response | undefined>(() => parsed.value?.data);

  const error = computed(() => parsed.value?.error ?? info.value?.response?.error);

  const info = ref<Response | undefined>(undefined);

  const isLoading = ref(false);

  const version = ref(0);

  watch([currentInfo], ([i]) => {
    if (i) {
      info.value = i;
      const v = ++version.value;
      setTimeout(() => {
        if (version.value === v) {
          isLoading.value = false;
        }
      }, 1000);
    }
  }, { immediate: true });

  const result = computed(() => info.value?.response?.result);

  const canRun = computed(() => !!result.value?.canRun);

  const status = computed(() => currentInfo.value ? result.value?.status : 'awaiting');

  const customerEmail = computed(() => result.value?.customerEmail);

  const endOfBillingPeriod = computed(() => result.value?.mnz.endOfBillingPeriod);

  const limits = computed(() => result.value?.mnz.limits);

  const refresh = () => {
    isLoading.value = true;
    (app.value?.model.args as Record<string, unknown>)['__mnzDate'] = new Date().toISOString();
  };

  watch(canRun, (v) => {
    if (hasMonetization.value) {
      (app.value?.model.args as Record<string, unknown>)['__mnzCanRun'] = v;
    }
  });

  if (hasMonetization.value) {
    useIntervalFn(refresh, 60_000); // 1 minute
  }

  return {
    hasMonetization,
    result,
    error,
    canRun,
    status,
    customerEmail,
    endOfBillingPeriod,
    limits,
    refresh,
    version,
    isLoading,
  };
}
